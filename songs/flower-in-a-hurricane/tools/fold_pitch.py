"""Fold octave errors out of pitch curves (5 ms frames, cents; 0 = unvoiced).

    python fold_pitch.py lead.npy out_lead.npy                 a lead curve: nothing below B2 (folded up)
    python fold_pitch.py back.npy out_back.npy lead.npy        a harmony curve: within an octave of the lead where both
                                                               sing (folded toward it), else nothing below B2

A separated stem's tracker can lock an octave or two low for whole phrases (the running-median fold in follow.py
cannot see that); sung back, the bank growls far below the singer.
"""
import sys

import numpy as np

c = np.load(sys.argv[1]).astype(float)
ref = np.load(sys.argv[3]).astype(float) if len(sys.argv) > 3 else None
v = c > 0
n_fix = 0
if ref is not None:
    r = np.zeros(len(c))
    r[:min(len(c), len(ref))] = ref[:min(len(c), len(ref))]
    both = v & (r > 0)
    while True:
        lo = both & (c - r < -1000)
        hi = both & (c - r > 1000)
        if not (lo.any() or hi.any()):
            break
        n_fix += int(lo.sum() + hi.sum())
        c[lo] += 1200
        c[hi] -= 1200
while True:
    lo = (c > 0) & (c < 4700)              # below B2 (~123 Hz): no singer in this song goes there
    if not lo.any():
        break
    n_fix += int(lo.sum())
    c[lo] += 1200
np.save(sys.argv[2], c.astype("float32"))
print(f"{sys.argv[2]}: {n_fix} frame-folds ({100 * n_fix / max(1, v.sum()):.1f}% of voiced frames)")
