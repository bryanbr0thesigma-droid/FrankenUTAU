"""Give a SynthV track the original singer's pitch movement (slides, vibrato, falls): draw a Pitch
Deviation curve equal to (original pitch - rendered pitch), so the next render follows the original.
Usage: python -I pitch_match.py in.svp render_f0.npz original_f0.npz lead_seconds out.svp [--ease-ms 0] [--attack-cents 0]
render_f0.npz is f0.py's track of a render of in.svp made WITHOUT a pitch curve (project time);
original_f0.npz tracks the vocal it was transcribed from, which starts lead_seconds into the project.
SynthV adds Pitch Deviation on top of its own pitch, so measuring against the render (not the bare
notes) keeps its transitions from being counted twice.
With new lyrics on the melody, the original's scoops land where the new words start and sound
strained: --ease-ms fades the curve in at each phrase start and --attack-cents caps it during the
first 100 ms of every note (e.g. 150 and 60)."""
import argparse
import os
import sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import svp  # noqa: E402

MAX_CENTS = 300                           # larger gaps are tracking errors or a different note: skip
ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("render_f0"); ap.add_argument("orig_f0"); ap.add_argument("lead", type=float)
ap.add_argument("out")
ap.add_argument("--ease-ms", type=float, default=0); ap.add_argument("--attack-cents", type=float, default=0)
A = ap.parse_args()
src, rf, of, lead, out = A.src, np.load(A.render_f0), np.load(A.orig_f0), A.lead, A.out


def midi(F):
    return np.where((F["per"] > 0.5) & (F["f0"] > 60), 69 + 12 * np.log2(np.maximum(F["f0"], 1) / 440), np.nan)


R = midi(rf); n = len(R)
t = np.arange(n) * 0.01
Oa = midi(of); ta = of["t"]
# original on the project clock (nearest frame; both tracks use 10 ms frames)
k = np.round((t - lead - ta[0]) / 0.01).astype(int)
O = np.where((k >= 0) & (k < len(Oa)), Oa[np.clip(k, 0, len(Oa) - 1)], np.nan)
delta = (O - R) * 100
delta[np.abs(delta) > MAX_CENTS] = np.nan

d = svp.load(src)
spb = 60 / d["time"]["tempo"][0]["bpm"]
g, boff = svp.notes_group(d)
pts = []
covered = 0
prev_end = None
for x in sorted(g["notes"], key=lambda x: x["onset"]):
    phrase_start = prev_end is None or x["onset"] - prev_end >= svp.Q // 2
    prev_end = x["onset"] + x["duration"]
    a = int((x["onset"] + boff) / svp.Q * spb * 100); b = min(n, int((x["onset"] + boff + x["duration"]) / svp.Q * spb * 100))
    if b - a < 2: continue
    seg = delta[a:b]
    ok = ~np.isnan(seg)
    if ok.sum() < 3:
        continue
    covered += ok.sum()
    idx = np.arange(b - a)
    seg = np.interp(idx, idx[ok], seg[ok])
    seg = np.array([np.median(seg[max(0, i - 2):i + 3]) for i in idx])          # 50 ms median
    seg = np.convolve(np.pad(seg, 1, mode="edge"), np.ones(3) / 3, mode="valid")  # 30 ms mean
    if A.attack_cents:
        k = min(len(seg), 10)
        seg[:k] = np.clip(seg[:k], -A.attack_cents, A.attack_cents)
    if A.ease_ms and phrase_start:
        k = min(len(seg), max(1, int(A.ease_ms / 10)))
        r = np.linspace(0, 1, k); seg[:k] *= r * r * (3 - 2 * r)
    for i in list(range(0, b - a, 2)) + [b - a - 1]:
        pts.append((int(round((a + i) / 100 / spb * svp.Q)) - boff, round(float(seg[i]), 1)))
pts = sorted(set(pts))
g["parameters"]["pitchDelta"] = {"mode": "cubic", "points": [v for p in pts for v in p]}
svp.save(d, out)
v = np.array([p[1] for p in pts])
print(f"{len(pts)} pitch points over {covered / 100:.0f} s of matched singing; median |dev| {np.median(np.abs(v)):.0f} cents,"
      f" 95th pct {np.percentile(np.abs(v), 95):.0f} cents")
