"""Harmony pitch without tracker noise: where the harmony sings with the lead, each syllable takes its interval from
the backing stem (median backing-minus-lead over the vowel, rounded to a semitone) on top of the lead's clean contour,
so the notes are the original harmony's and the line is as steady as the lead. Solo harmony lines keep the backing
curve.

    python harm_pitch.py phones_harm.json pitch_lead.npy pitch_back.npy cast_harm.json out.npy
"""
import json
import sys

import numpy as np

sys.path.insert(0, ".")
from follow2 import FP, VOW, phrases2

phj, plead, pback, castj, out = sys.argv[1:6]
L = np.load(plead).astype(float)
B = np.load(pback).astype(float)
H = B.copy()
parts = json.load(open(castj))["parts"]
n_syl = n_set = 0
last = None
for phr in phrases2(json.load(open(phj))):
    for p, s, e in phr:
        if p not in VOW or not any(q["t0"] <= s < q["t1"] for q in parts):
            continue
        a, b = int(s * 1000 / FP), int(e * 1000 / FP)
        n_syl += 1
        lv = L[a:b] > 0
        if lv.mean() < 0.5:
            continue                                     # the lead is not singing here: keep the backing curve
        both = lv & (B[a:b] > 0)
        if both.sum() >= 4:
            iv = 100 * round(float(np.median(B[a:b][both] - L[a:b][both])) / 100)
        elif last is not None:
            iv = last
        else:
            continue
        last = iv
        H[a:b] = np.where(lv, L[a:b] + iv, 0)
        n_set += 1
np.save(out, H.astype("float32"))
print(f"{n_set}/{n_syl} harmony syllables re-pitched from the lead's contour")
