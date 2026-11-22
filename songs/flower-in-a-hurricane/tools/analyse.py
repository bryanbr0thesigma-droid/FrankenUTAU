"""Phrase map of a vocal stem: where each sung phrase is, its pitch range, and which voice sings it.

    python analyse.py stems/vocals.wav out_prefix [k]

Phrases = voiced stretches split at gaps > 0.35 s. Pitch: Praat autocorrelation. Voice: WavLM x-vector per phrase,
clustered (cosine, average linkage) into k groups. Writes out_prefix.json and out_prefix.png.
"""
import json
import os
import sys

import numpy as np
import parselmouth
import soundfile as sf
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.signal import resample_poly

src, out = sys.argv[1], sys.argv[2]
K = int(sys.argv[3]) if len(sys.argv) > 3 else 3
x, sr = sf.read(src)
m = x.mean(1) if x.ndim > 1 else x

# --- pitch
snd = parselmouth.Sound(m, sr)
pitch = snd.to_pitch_ac(time_step=0.01, pitch_floor=70, pitch_ceiling=1100, voicing_threshold=0.5)
pt = pitch.xs()
pf = pitch.selected_array["frequency"]
# --- phrases = voiced stretches (with some loudness), split at gaps > GAP s
hop = int(0.01 * sr)
rms = np.sqrt(np.convolve(m ** 2, np.ones(hop) / hop, "same") + 1e-12)
loud = 20 * np.log10(rms / rms.max())
GAP = float(os.environ.get("GAP", 0.25))
v = [(t, f) for t, f in zip(pt, pf) if f > 0 and loud[min(len(loud) - 1, int(t * sr))] > -40]
phr = []
for t, f in v:
    if phr and t - phr[-1][1] <= GAP:
        phr[-1][1] = t + 0.01
    else:
        phr.append([t, t + 0.01])
phr = [[round(a - 0.03, 2), round(b + 0.03, 2)] for a, b in phr if b - a >= 0.45]

def midi(hz):
    return 69 + 12 * np.log2(hz / 440.0)


NAMES = "C C# D D# E F F# G G# A A# B".split()


def name(n):
    n = int(round(n))
    return f"{NAMES[n % 12]}{n // 12 - 1}"


# --- voice embeddings
import torch
from transformers import AutoFeatureExtractor, WavLMForXVector

mid = "microsoft/wavlm-base-plus-sv"
fe = AutoFeatureExtractor.from_pretrained(mid)
model = WavLMForXVector.from_pretrained(mid).eval()
m16 = resample_poly(m, 160, sr // 100).astype("float32")


def embed(a, b):
    seg = m16[int(a * 16000):int(b * 16000)]
    chunks = [seg[k:k + 16000 * 6] for k in range(0, len(seg), 16000 * 6)]
    chunks = [c for c in chunks if len(c) > 16000 * 0.4] or [seg]
    with torch.no_grad():
        inp = fe(chunks, sampling_rate=16000, return_tensors="pt", padding=True)
        e = model(**inp).embeddings
    e = torch.nn.functional.normalize(e, dim=-1).mean(0)
    return torch.nn.functional.normalize(e, dim=0).numpy()


rows, E = [], []
for a, b in phr:
    sel = (pt >= a) & (pt < b) & (pf > 0)
    f = pf[sel]
    n = midi(f) if len(f) else np.array([np.nan])
    rows.append({"t0": round(a, 2), "t1": round(b, 2), "voiced": round(float(sel.sum()) * 0.01, 2),
                 "lo": name(np.nanpercentile(n, 10)) if len(f) else "-", "med": name(np.nanmedian(n)) if len(f) else "-",
                 "hi": name(np.nanpercentile(n, 90)) if len(f) else "-", "med_midi": float(np.nanmedian(n)) if len(f) else None})
    E.append(embed(a, b))
E = np.array(E)
Z = linkage(E, "average", metric="cosine")
lab = fcluster(Z, K, "maxclust")
for r, l in zip(rows, lab):
    r["voice"] = int(l)
json.dump({"phrases": rows}, open(out + ".json", "w"), indent=1)
for r in rows:
    print(f"{r['t0']:7.2f}-{r['t1']:7.2f}  voice {r['voice']}  {r['lo']:>4} {r['med']:>4} {r['hi']:>4}  voiced {r['voiced']:.1f}s")
for v in sorted(set(lab)):
    rr = [r for r in rows if r["voice"] == v and r["med_midi"] is not None]
    tot = sum(r["t1"] - r["t0"] for r in rr)
    print(f"voice {v}: {len(rr)} phrases, {tot:.0f}s, median {name(np.median([r['med_midi'] for r in rr]))}")

# --- plot
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(22, 6), dpi=80)
cols = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#46f0f0"]
for (a, b), l in zip(phr, lab):
    ax.axvspan(a, b, color=cols[(l - 1) % 6], alpha=0.15)
    sel = (pt >= a) & (pt < b) & (pf > 0)
    ax.plot(pt[sel], midi(pf[sel]), ".", ms=1.5, color=cols[(l - 1) % 6])
ax.set_xlim(0, len(m) / sr)
ax.set_xticks(np.arange(0, len(m) / sr, 10))
ax.set_yticks(range(36, 85, 2))
ax.set_yticklabels([name(n) for n in range(36, 85, 2)], fontsize=7)
ax.grid(alpha=0.3)
fig.tight_layout()
fig.savefig(out + ".png")
