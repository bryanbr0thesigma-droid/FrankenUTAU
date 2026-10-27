"""Where is the original singing but the render silent? Usage: dropouts.py orig.wav render.wav notes.json"""
import json, sys, numpy as np, librosa
hop = 441
def env(p):
    y, sr = librosa.load(p, sr=44100, mono=True)
    r = librosa.feature.rms(y=y, frame_length=1764, hop_length=hop)[0]
    return 20 * np.log10(r + 1e-9)
a, b = env(sys.argv[1]), env(sys.argv[2])
L = min(len(a), len(b)); a, b = a[:L], b[:L]
N = json.load(open(sys.argv[3])); off, per = N["off"], N["per"]
ta = np.percentile(a, 97) - 30; tb = np.percentile(b, 97) - 30
gap = (a > ta) & (b < tb)
runs, i = [], 0
while i < L:
    if gap[i]:
        j = i
        while j < L and gap[j]: j += 1
        if j - i >= 5: runs.append((i * hop / 44100, j * hop / 44100))
        i = j
    else: i += 1
notes = N["notes"]
def where(t):
    beat = (t - off) / per
    cover = [n for n in notes if n["b0"] <= beat < n["b1"]]
    if cover: return "inside note '%s' (%s)" % (cover[0]["lyric"], cover[0]["word"])
    prev = [n for n in notes if n["b1"] <= beat]; nxt = [n for n in notes if n["b0"] > beat]
    p = prev[-1] if prev else None; q = nxt[0] if nxt else None
    return "gap after '%s' (%s, ends beat %.2f) before '%s' (beat %.2f)" % (p["lyric"], p["word"], p["b1"], q["lyric"] if q else "-", q["b0"] if q else -1)
tot = sum(e - s for s, e in runs)
print(f"{len(runs)} spots, {tot:.1f} s total where the original sings and the render is silent")
kinds = {"gap": 0, "inside": 0}
for s, e in runs:
    w = where((s + e) / 2); kinds["gap" if w.startswith("gap") else "inside"] += 1
    print(f"  {s:7.2f}-{e:6.2f}s ({(e-s)*1000:4.0f} ms)  {w}")
print(kinds)
