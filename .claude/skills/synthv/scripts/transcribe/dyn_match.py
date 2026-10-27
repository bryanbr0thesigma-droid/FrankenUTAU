"""Give a SynthV track the original singer's dynamics: draw a Loudness curve so the render's level
follows the original vocal's level, moment to moment, inside every note.
Usage: python -I dyn_match.py in.svp render.wav original.wav lead_seconds out.svp
render.wav is a render of in.svp (project time); original.wav is the vocal it was transcribed from,
which starts lead_seconds into the project. Replaces any Loudness curve (it also does boost.py's job)."""
import os
import sys
import numpy as np, librosa
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import svp  # noqa: E402

SR, HOP = 16000, 160                       # 10 ms frames
LIMIT = 10.0                               # dB either way
src, render, orig, lead, out = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), sys.argv[5]


def env(path, shift):
    y, _ = librosa.load(path, sr=SR, mono=True)
    if shift > 0:
        y = np.concatenate([np.zeros(int(shift * SR)), y])
    r = librosa.feature.rms(y=y, frame_length=640, hop_length=HOP)[0]
    return 20 * np.log10(r + 1e-9)


R, O = env(render, 0), env(orig, lead)
n = min(len(R), len(O)); R, O = R[:n], O[:n]
d = svp.load(src)
bpm = d["time"]["tempo"][0]["bpm"]; spb = 60 / bpm
g = d["tracks"][0]["mainGroup"]
notes = sorted(g["notes"], key=lambda x: x["onset"])
inside = np.zeros(n, bool)
spans = []
for x in notes:
    a = int(x["onset"] / svp.Q * spb * 100); b = min(n, int((x["onset"] + x["duration"]) / svp.Q * spb * 100))
    inside[a:b] = True; spans.append((a, b))
loud = inside & (R > np.percentile(R[inside], 95) - 30) & (O > np.percentile(O[inside], 95) - 30)
corr = np.full(n, np.nan)
corr[loud] = (O[loud] - np.median(O[loud])) - (R[loud] - np.median(R[loud]))
# follow the vowels, not the consonants: inside each note only use frames near that note's peak
for a, b in spans:
    if b - a < 3: continue
    pa, pr = O[a:b].max(), R[a:b].max()
    weak = (O[a:b] < pa - 12) | (R[a:b] < pr - 12)
    corr[a:b][weak] = np.nan
# fill gaps inside notes from the neighbours, then smooth (60 ms median, 50 ms mean)
idx = np.arange(n); ok = ~np.isnan(corr)
filled = np.interp(idx, idx[ok], corr[ok])
med = np.array([np.median(filled[max(0, i - 3):i + 4]) for i in range(n)])
sm = np.convolve(med, np.ones(5) / 5, mode="same")
sm = np.clip(sm, -LIMIT, LIMIT)
pts = []
for a, b in spans:
    for i in list(range(a, b, 3)) + [b - 1]:
        pts.append((int(round(i / 100 / spb * svp.Q)), round(float(sm[i]), 2)))
pts = sorted(set(pts))
g["parameters"]["loudness"] = {"mode": "cubic", "points": [v for p in pts for v in p]}
svp.save(d, out)
vals = np.array([p[1] for p in pts])
print(f"{len(pts)} loudness points; median {np.median(vals):+.1f} dB, 5-95% {np.percentile(vals, 5):+.1f}..{np.percentile(vals, 95):+.1f} dB,"
      f" clipped {np.mean(np.abs(vals) >= LIMIT - 0.01) * 100:.1f}%")
