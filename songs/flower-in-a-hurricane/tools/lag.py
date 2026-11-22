"""Lag of a render against the original vocal, per phrase: cross-correlation of onset envelopes (10 ms frames)."""
import sys, json, numpy as np, soundfile as sf
sys.path.insert(0, ".")
from follow2 import phrases2 as _p2
phrases = lambda w, c: _p2(w)
ren, orig, phj, pnp = sys.argv[1:5]
def onset_env(p):
    x, sr = sf.read(p); m = x.mean(1) if x.ndim > 1 else x
    hop = sr // 100
    n = len(m) // hop
    e = np.sqrt((m[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-9)
    d = np.diff(20 * np.log10(e), prepend=0)
    return np.maximum(d, 0)
R, O = onset_env(ren), onset_env(orig)
lags = []
for phr in phrases(json.load(open(phj)), np.load(pnp).astype(float)):
    a, b = int(phr[0][1] * 100), int(phr[-1][2] * 100)
    if b - a < 100: continue
    o = O[a:b]; best = None
    for L in range(-40, 41):
        r = R[a + L:b + L]
        if len(r) != len(o): continue
        c = np.corrcoef(o, r)[0, 1]
        if best is None or c > best[1]: best = (L, c)
    if best and best[1] > 0.2: lags.append(best[0] * 10)
lags = np.array(lags)
print(f"{len(lags)} phrases: render lag median {np.median(lags):+.0f} ms, IQR {np.percentile(lags,25):+.0f}..{np.percentile(lags,75):+.0f} ms")
