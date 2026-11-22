"""Word timing for one line from the phoneme recogniser's own readout: the expected phonemes (CMUdict) are matched
in order to the recognised tokens (edit-distance alignment, vowels and consonants matched by class), matched
phonemes take the token's time, the rest are interpolated. For lines where the forced aligner, with weak evidence,
holds the wrong vowel.

    python anchor_align.py STEM.wav pitch.npy t0 t1 "line text" out.json
"""
import json
import re
import sys

import numpy as np
import soundfile as sf
import torch
from scipy.signal import resample_poly
from transformers import AutoTokenizer, Wav2Vec2ForCTC

sys.path.insert(0, ".")
from follow2 import IPA, VOW, word_phones

stem, pnp, t0, t1, text, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5], sys.argv[6]
import cmudict
d = cmudict.dict()
mid = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
tok = AutoTokenizer.from_pretrained(mid)
model = Wav2Vec2ForCTC.from_pretrained(mid).eval()
x, sr = sf.read(stem)
m = resample_poly(x.mean(1) if x.ndim > 1 else x, 16000, sr)
s = m[int(t0 * 16000):int(t1 * 16000)]
s = (s - s.mean()) / (s.std() + 1e-7)
with torch.no_grad():
    ids = model(torch.from_numpy(s.astype("float32"))[None]).logits[0].argmax(-1).numpy()
fd = (t1 - t0) / len(ids)
inv = {}
for p, toks in IPA.items():
    for t in toks.split():
        inv.setdefault(t, p)
dec, prev = [], -1
for i, k in enumerate(ids):
    if k != prev and k != 0:
        t = tok.convert_ids_to_tokens(int(k))
        dec.append((t0 + i * fd, inv.get(t, t)))
    prev = k
words = [(w, word_phones(w, d)) for w in re.findall(r"[A-Za-z']+", text)]
exp = [(wi, p) for wi, (w, ph) in enumerate(words) for p in ph]
cls = lambda p: "V" if p in VOW else "C"
# edit-distance alignment: exact match 0, same class 0.6, substitution 1, skip 1 (either side)
n, k = len(exp), len(dec)
D = np.zeros((n + 1, k + 1))
D[:, 0] = np.arange(n + 1)
D[0, :] = np.arange(k + 1) * 0.5                       # extra recognised tokens are cheap to skip
B = np.zeros((n + 1, k + 1), dtype=int)
for i in range(1, n + 1):
    for j in range(1, k + 1):
        e, g = exp[i - 1][1], dec[j - 1][1]
        sub = 0 if e == g else (0.6 if g in IPA and cls(e) == cls(g) else 1.0)
        opts = (D[i - 1, j - 1] + sub, D[i - 1, j] + 1, D[i, j - 1] + 0.5)
        B[i, j] = int(np.argmin(opts))
        D[i, j] = min(opts)
i, j, match = n, k, {}
while i > 0 and j > 0:
    if B[i, j] == 0:
        if D[i, j] - D[i - 1, j - 1] < 1.0:
            match[i - 1] = dec[j - 1][0]
        i, j = i - 1, j - 1
    elif B[i, j] == 1:
        i -= 1
    else:
        j -= 1
known = sorted(match.items())
starts = np.interp(np.arange(n), [a for a, _ in known], [b for _, b in known]) if known else np.linspace(t0, t1, n)
starts = np.maximum.accumulate(starts + np.arange(n) * 1e-4)
c = np.load(pnp)
end_v = starts[-1] + 0.1                                 # the last vowel holds while the voice holds
li = max(i for i in range(n) if exp[i][1] in VOW)
t = starts[li] + 0.05
while t < t1 and any(c[min(len(c) - 1, int((t + dd) * 200))] > 0 for dd in (0, 0.05, 0.1)):
    t += 0.005
res = []
for wi, (w, ph) in enumerate(words):
    idx = [q for q in range(n) if exp[q][0] == wi]
    phones = []
    for q in idx:
        st = float(starts[q])
        en = float(starts[q + 1]) if q + 1 < n else st + 0.08
        if q == li and q + 1 < n:                        # the held vowel runs to the end of the note
            pass
        phones.append([exp[q][1], round(st, 3), round(en, 3)])
    res.append({"w": w, "phones": phones})
# stretch the held last vowel and push the final consonants after it
last_vowel_end = max(t - sum(0.08 for q in range(li + 1, n)), starts[li] + 0.1)
for wrec in res:
    for p in wrec["phones"]:
        pass
flat = [p for wrec in res for p in wrec["phones"]]
flat[li][2] = round(last_vowel_end, 3)
tt = last_vowel_end
for q in range(li + 1, n):
    flat[q][1], flat[q][2] = round(tt, 3), round(tt + 0.08, 3)
    tt += 0.08
json.dump(res, open(out, "w"), indent=0)
print(f"matched {len(match)}/{n} phonemes to the readout:", " | ".join(f"{w}@{r['phones'][0][1]:.2f}" for (w, _), r in zip(words, res)))
