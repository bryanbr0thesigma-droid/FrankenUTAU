"""Objective checks of a rendered vocal against the original over [t0, t1]:
pitch error (cents) and phoneme error rate of the recogniser on render vs on the original.

    python evalr.py render.wav original.wav phones.json pitch.npy t0 t1 [transpose]
"""
import json
import sys

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

sys.path.insert(0, ".")
from follow import IPA, FP

ren, orig, phj, pnp = sys.argv[1:5]
t0, t1 = float(sys.argv[5]), float(sys.argv[6])
tr = float(sys.argv[7]) if len(sys.argv) > 7 else 0.0


def load16(p):
    x, sr = sf.read(p)
    m = x.mean(1) if x.ndim > 1 else x
    return resample_poly(m, 160, sr // 100)[int(t0 * 16000):int(t1 * 16000)]


r16, o16 = load16(ren), load16(orig)
import pyworld as pw

f0, _ = pw.harvest(r16.astype("float64"), 16000, f0_floor=60, f0_ceil=1000, frame_period=FP)
tgt = np.load(pnp)[int(t0 * 1000 / FP):][:len(f0)]
f0 = f0[:len(tgt)]
ok = (f0 > 0) & (tgt > 0)
err = 1200 * np.log2(f0[ok] / 440) + 6900 - (tgt[ok] + 100 * tr)
err = (err + 600) % 1200 - 600 if False else err
print(f"pitch: {ok.sum() * FP / 1000:.1f} s compared, median |err| {np.median(np.abs(err)):.0f} c, "
      f"within 50 c {100 * np.mean(np.abs(err) < 50):.0f}%, octave errors {100 * np.mean(np.abs(err) > 900):.0f}%")

import torch
from transformers import AutoTokenizer, Wav2Vec2ForCTC

mid = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
tok = AutoTokenizer.from_pretrained(mid)
model = Wav2Vec2ForCTC.from_pretrained(mid).eval()
vocab = tok.get_vocab()
inv = {}
for p, toks in IPA.items():
    for t in toks.split():
        inv.setdefault(t, p)
CLASS = {"ax": "ah", "z": "s", "dh": "d", "th": "t"}  # merge near-identical classes


def recog(x):
    x = (x - x.mean()) / (x.std() + 1e-7)
    with torch.no_grad():
        ids = model(torch.from_numpy(x.astype("float32"))[None]).logits[0].argmax(-1).numpy()
    out, prev = [], -1
    for i in ids:
        if i != prev and i != vocab["<pad>"]:
            t = tok.convert_ids_to_tokens(int(i))
            if t in inv:
                out.append(CLASS.get(inv[t], inv[t]))
        prev = i
    return out


ref = [CLASS.get(p[0], p[0]) for w in json.load(open(phj)) for p in w["phones"] if t0 <= p[1] < t1]


def per(hyp):
    d = np.arange(len(hyp) + 1)
    for i, r in enumerate(ref, 1):
        nd = np.empty_like(d)
        nd[0] = i
        for j, h in enumerate(hyp, 1):
            nd[j] = min(d[j] + 1, nd[j - 1] + 1, d[j - 1] + (r != h))
        d = nd
    return d[-1] / max(1, len(ref))


ho, hr = recog(o16), recog(r16)
print(f"phoneme error rate vs lyrics: original {100 * per(ho):.0f}%, render {100 * per(hr):.0f}%  ({len(ref)} phones)")
