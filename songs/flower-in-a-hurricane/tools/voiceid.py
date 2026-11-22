"""Who sings when: voice embeddings of reference vocals (one folder of '<who>_<song>_(Vocals)*.wav') vs windows of a stem.

    python voiceid.py REF_DIR out.json STEM.wav [STEM2.wav ...]

1. 3 s windows (1 s hop) where the voice is present (Praat voicing >= 40 %); embedding = WavLM x-vector.
2. Leave-one-song-out test on the references: how well does a nearest-centroid classifier name the singer of a song
   it has not seen? (Printed per singer, so we know whether to trust step 3.)
3. Each stem window gets a score per singer (cosine to the singer's centroid, after removing the common mean).
"""
import glob
import json
import os
import re
import sys

import numpy as np
import parselmouth
import soundfile as sf
import torch
from scipy.signal import resample_poly
from transformers import AutoFeatureExtractor, WavLMForXVector

ref_dir, out = sys.argv[1], sys.argv[2]
stems = sys.argv[3:]
mid = "microsoft/wavlm-base-plus-sv"
fe = AutoFeatureExtractor.from_pretrained(mid)
model = WavLMForXVector.from_pretrained(mid).eval()
WIN, HOP = 3.0, 1.0


def load16(p):
    x, sr = sf.read(p)
    m = x.mean(1) if x.ndim > 1 else x
    return resample_poly(m, 16000, sr).astype("float32") if sr != 16000 else m.astype("float32")


def windows(m):
    snd = parselmouth.Sound(m.astype("float64"), 16000)
    p = snd.to_pitch_ac(time_step=0.01, pitch_floor=75, pitch_ceiling=1000, voicing_threshold=0.35)
    f = p.selected_array["frequency"]
    xs = p.xs()
    res = []
    t = 0.0
    while t + WIN <= len(m) / 16000:
        sel = (xs >= t) & (xs < t + WIN)
        if sel.sum() and (f[sel] > 0).mean() >= 0.4:
            res.append((t, m[int(t * 16000):int((t + WIN) * 16000)], float(np.median(f[sel][f[sel] > 0]))))
        t += HOP
    return res


def embed(chunks):
    out = []
    for k in range(0, len(chunks), 8):
        with torch.no_grad():
            inp = fe(chunks[k:k + 8], sampling_rate=16000, return_tensors="pt", padding=True)
            e = model(**inp).embeddings
        out.append(torch.nn.functional.normalize(e, dim=-1).numpy())
    return np.concatenate(out) if out else np.zeros((0, 512))


# ---- references
R = []  # (who, song, emb)
for p in sorted(glob.glob(os.path.join(ref_dir, "*.wav"))):
    name = os.path.basename(p)
    who, song = name.split("_", 1)
    song = re.sub(r"_\(Vocals\).*", "", song)
    ws = windows(load16(p))
    E = embed([w[1] for w in ws])
    for e in E:
        R.append((who, song, e))
    print(f"ref {who:7s} {song:35s} {len(ws):3d} windows")
whos = sorted({r[0] for r in R})
E = np.array([r[2] for r in R])
mu = E.mean(0)


def norm(X):
    X = X - mu
    return X / np.linalg.norm(X, axis=-1, keepdims=True)


En = norm(E)
# ---- leave one song out
songs = sorted({(r[0], r[1]) for r in R})
correct = {w: [0, 0] for w in whos}
for who, song in songs:
    tr = np.array([not (r[0] == who and r[1] == song) for r in R])
    cents = {w: En[tr & np.array([r[0] == w for r in R])].mean(0) for w in whos}
    te = En[~tr]
    sc = np.stack([te @ (cents[w] / np.linalg.norm(cents[w])) for w in whos], 1)
    win = np.array(whos)[sc.argmax(1)]
    song_vote = np.array(whos)[sc.mean(0).argmax()]
    correct[who][0] += int(song_vote == who)
    correct[who][1] += 1
    print(f"  LOSO {who:7s} {song:35s} windows right {100 * (win == who).mean():3.0f}%  song -> {song_vote}")
for w in whos:
    print(f"LOSO songs right for {w}: {correct[w][0]}/{correct[w][1]}")

cents = {w: En[np.array([r[0] == w for r in R])].mean(0) for w in whos}
cents = {w: c / np.linalg.norm(c) for w, c in cents.items()}
res = {"singers": whos, "stems": {}}
for st in stems:
    ws = windows(load16(st))
    S = norm(embed([w[1] for w in ws]))
    rows = []
    for (t, _, f0), s in zip(ws, S):
        rows.append({"t": t, "f0": round(f0, 1), **{w: round(float(s @ cents[w]), 3) for w in whos}})
    res["stems"][os.path.basename(st)] = rows
    print(f"{st}: {len(rows)} windows")
json.dump(res, open(out, "w"), indent=0)
