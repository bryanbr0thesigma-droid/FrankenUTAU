"""Compare a render's pitch with the original vocal over the transcribed notes.
Usage: python -I compare.py original_f0.npz render_f0.npz notes.json"""
import json, sys, numpy as np
A, B, N = np.load(sys.argv[1]), np.load(sys.argv[2]), json.load(open(sys.argv[3]))
off, per, tune = N["off"], N["per"], N["tune"]
def midi(F):
    return np.where((F["per"] > 0.45) & (F["f0"] > 60), 69 + 12 * np.log2(np.maximum(F["f0"], 1) / 440) - tune, np.nan)
ma, mb = midi(A), midi(B)
L = min(len(ma), len(mb)); ma, mb = ma[:L], mb[:L]
both = ~np.isnan(ma) & ~np.isnan(mb)
d = np.abs(ma[both] - mb[both])
print(f"frames voiced in both: {both.sum()}; within 0.5 st: {100*np.mean(d < 0.5):.0f}%, within 1 st: {100*np.mean(d < 1):.0f}%, octave off: {100*np.mean(np.abs(d - 12) < 1):.1f}%")
bad_orig, bad_rend = [], []
for n in N["notes"]:
    a = int((off + n["b0"] * per) / 0.01); b = int((off + n["b1"] * per) / 0.01)
    a2, b2 = a + (b - a) // 4, b - (b - a) // 4 + 1
    o = ma[a2:b2]; r = mb[a2:b2]
    o = o[~np.isnan(o)]; r = r[~np.isnan(r)]
    if len(o) >= 3 and abs(np.median(o) - n["pitch"]) > 0.6:
        bad_orig.append((n, np.median(o)))
    if len(r) >= 3 and abs(np.median(r) - n["pitch"]) > 0.6:
        bad_rend.append((n, np.median(r)))
print(f"{len(N['notes'])} notes; original disagrees with the note on {len(bad_orig)}; render misses the note on {len(bad_rend)}")
for n, v in bad_orig[:40]:
    print(f"  orig  {off + n['b0']*per:7.2f}s beat {n['b0']:6.2f} '{n['lyric']}' ({n['word']}) note {n['pitch']} sung {v:.1f}")
for n, v in bad_rend[:40]:
    print(f"  rend  {off + n['b0']*per:7.2f}s beat {n['b0']:6.2f} '{n['lyric']}' ({n['word']}) note {n['pitch']} rendered {v:.1f}")
