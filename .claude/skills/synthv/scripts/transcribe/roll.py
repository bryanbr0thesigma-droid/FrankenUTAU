"""Piano-roll picture: pitch track (grey), notes (boxes with lyrics), beat grid.
Usage: python -I roll.py f0.npz notes.json t0 t1 out.png [render_f0.npz]"""
import json, sys
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
f = np.load(sys.argv[1]); N = json.load(open(sys.argv[2])); t0, t1 = float(sys.argv[3]), float(sys.argv[4])
off, per, tune = N["off"], N["per"], N["tune"]
t, f0, pr = f["t"], f["f0"], f["per"]
m = np.where((pr > 0.45) & (f0 > 60), 69 + 12 * np.log2(np.maximum(f0, 1) / 440) - tune, np.nan)
sel = (t >= t0) & (t <= t1)
fig, ax = plt.subplots(figsize=(22, 6), dpi=80)
ax.plot(t[sel], m[sel], color="0.55", lw=1.2)
if len(sys.argv) > 6:
    g = np.load(sys.argv[6]); s2 = (g["t"] >= t0) & (g["t"] <= t1)
    m2 = np.where((g["per"] > 0.45) & (g["f0"] > 60), 69 + 12 * np.log2(np.maximum(g["f0"], 1) / 440) - tune, np.nan)
    ax.plot(g["t"][s2], m2[s2], color="tab:red", lw=1.0, alpha=0.8)
for k in range(int((t0 - off) / per) - 1, int((t1 - off) / per) + 2):
    x = off + k * per
    ax.axvline(x, color="0.85" if k % 4 else "0.4", lw=0.6 if k % 4 else 1.2, zorder=0)
lo, hi = 100, 0
for n in N["notes"]:
    a, b = off + n["b0"] * per, off + n["b1"] * per
    if b < t0 or a > t1: continue
    lo, hi = min(lo, n["pitch"]), max(hi, n["pitch"])
    c = "tab:orange" if n["lyric"] == "-" else "tab:green"
    ax.add_patch(plt.Rectangle((a, n["pitch"] - 0.4), b - a, 0.8, color=c, alpha=0.6))
    ax.text(a + 0.01, n["pitch"] + 0.5, n["lyric"], fontsize=8)
ax.set_xlim(t0, t1); ax.set_ylim(lo - 3, hi + 3)
ax.set_yticks(range(lo - 3, hi + 4))
ax.set_yticklabels([["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][p % 12] + str(p // 12 - 1) for p in range(lo - 3, hi + 4)], fontsize=7)
ax.grid(axis="y", color="0.92")
plt.tight_layout(); plt.savefig(sys.argv[5])
