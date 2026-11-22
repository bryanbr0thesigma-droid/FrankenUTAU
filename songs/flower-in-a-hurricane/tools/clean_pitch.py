"""Remove pitch "yelps" from a stem's pitch curve before it drives a bank.

    python clean_pitch.py pitch_self.npy pitch_other.npy out.npy

A separated stem's tracker sometimes jumps for a few frames: to the other singer's note (bleed), to a harmonic, or
an octave. Rendered, that is a spasm. Removed and bridged by interpolation:
  * single-frame spikes (5-frame median),
  * excursions shorter than 150 ms that leave the local line (250 ms median) by more than 150 cents and come back,
  * stretches shorter than 300 ms where this curve lands on the other stem's pitch (within 40 cents) although the two
    are normally apart (a harmony), which is bleed.
"""
import sys

import numpy as np
from scipy.ndimage import median_filter

FP = 0.005


def bridge(c, bad):
    """interpolate over `bad` frames inside voiced stretches"""
    c = c.copy()
    v = c > 0
    good = v & ~bad
    idx = np.arange(len(c))
    if good.sum() < 2:
        return c
    fill = np.interp(idx, idx[good], c[good])
    c[bad & v] = fill[bad & v]
    return c


def runs(mask):
    out, i = [], 0
    while i < len(mask):
        if mask[i]:
            j = i
            while j < len(mask) and mask[j]:
                j += 1
            out.append((i, j))
            i = j
        else:
            i += 1
    return out


def clean(c, other):
    v = c > 0
    med = median_filter(np.where(v, c, np.nan), size=5, mode="nearest")
    c = np.where(v & ~np.isnan(med), med, c)
    for _ in range(2):
        v = c > 0
        ref = median_filter(np.where(v, c, np.nan), size=int(0.25 / FP), mode="nearest")
        dev = np.where(v & ~np.isnan(ref), np.abs(c - ref), 0)
        bad = np.zeros(len(c), bool)
        for i, j in runs(dev > 150):
            if (j - i) * FP <= 0.15:
                bad[max(0, i - 2):j + 2] = True
        c = bridge(c, bad)
    if other is not None:
        n = min(len(c), len(other))
        o = np.zeros(len(c))
        o[:n] = other[:n]
        both = (c > 0) & (o > 0)
        diff = np.where(both, np.abs(c - o), np.nan)
        apart = median_filter(diff, size=int(0.6 / FP), mode="nearest")
        bad = np.zeros(len(c), bool)
        for i, j in runs(both & (np.nan_to_num(diff, nan=1e9) < 40)):
            if (j - i) * FP < 0.3 and np.nanmedian(apart[max(0, i - 60):j + 60]) > 200:
                bad[max(0, i - 2):j + 2] = True
        c = bridge(c, bad)
    return c


if __name__ == "__main__":
    c = np.load(sys.argv[1]).astype(float)
    o = np.load(sys.argv[2]).astype(float) if len(sys.argv) > 3 else None
    out = sys.argv[3] if len(sys.argv) > 3 else sys.argv[2]
    np.save(out, clean(c, o).astype("float32"))
