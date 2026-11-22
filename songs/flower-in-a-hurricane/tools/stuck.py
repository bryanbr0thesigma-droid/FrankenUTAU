"""Where does our singer hold a vowel while the original already moved on? Note onsets of the original voice
(CREPE curve: a pitch step of 80+ cents between 60 ms medians, or the voice coming in) that fall inside one of our
vowels, more than 100 ms from its edges, followed by our next syllables squeezed (a "stuck, then rushed" note).

    python stuck.py phones.json pitch_curve.npy cast.json
"""
import json
import sys

import numpy as np
from scipy.ndimage import median_filter

sys.path.insert(0, ".")
from follow2 import VOW
from follow2_v4 import phrases2

phj, pnp, castj = sys.argv[1:4]
c = np.load(pnp).astype(float)
parts = json.load(open(castj))["parts"]
v = c > 0
cs = median_filter(np.where(v, c, np.nan), size=13, mode="nearest")
onsets = []
for i in range(12, len(c) - 12):
    if v[i] and v[i - 12] and not np.isnan(cs[i + 6]) and not np.isnan(cs[i - 6]) and abs(cs[i + 6] - cs[i - 6]) > 80:
        if not onsets or i - onsets[-1] > 24:
            onsets.append(i)
on_t = np.array(onsets) * 0.005
stuck, nv = [], 0
for phr in phrases2(json.load(open(phj)), cents=c):
    for k, (p, s, e) in enumerate(phr):
        part = next((q for q in parts if q["t0"] <= s < q["t1"]), None)
        if p not in VOW or part is None:
            continue
        e = min(e, part["t1"] + 0.2)                          # as the renderer clips it
        nv += 1
        inside = on_t[(on_t > s + 0.1) & (on_t < e - 0.1)]
        if len(inside):
            rest = [q for q in phr[k + 1:k + 6]]
            squeezed = sum(1 for q in rest if q[2] - q[1] <= 0.085)
            stuck.append((s, e, p, len(inside), squeezed))
print(f"{len(stuck)} of {nv} vowels run through a note change of the original; with squeezed syllables after: "
      f"{sum(1 for x in stuck if x[4] >= 2)}")
for s, e, p, n, sq in stuck[:25]:
    print(f"  {int(s // 60)}:{s % 60:05.2f}-{int(e // 60)}:{e % 60:05.2f} '{p}' holds through {n} note change(s), {sq} squeezed after")
