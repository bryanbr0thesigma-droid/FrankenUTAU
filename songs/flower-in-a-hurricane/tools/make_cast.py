"""Cast every word by who sings it (voiceid.json), then merge into hand-overs.

Lead: each word goes to SZA or Parker by the lead stem's voice windows around it. Harmony: words where the backing
stem is voiced get a second voice, cast by the backing stem's windows. Runs shorter than MIN_RUN seconds are folded
into their neighbours so the singer does not flicker.

    python make_cast.py phones_lead.json phones_back.json pitch_lead.npy pitch_back.npy voiceid.json OUTDIR

(phones_lead / phones_back: the words aligned on the lead stem and on the backing stem.)

Writes OUTDIR/cast_{sza_lead,parker_lead,parker_harm,sza_harm}.json and OUTDIR/casting.txt (a readable timeline).
"""
import json
import sys
from pathlib import Path

import numpy as np

FP = 5.0
MIN_RUN = 1.5
phl, phb, plead, pback, vj, outdir = sys.argv[1:7]
BANKS = {"sza": ("banks/BAKO_EN", 0), "parker": ("banks/Puresu_EN", 0)}   # both at the singers' own pitch
L, B = np.load(plead).astype(float), np.load(pback).astype(float)
vid = json.load(open(vj))["stems"]
def load_words(p):
    ws = [w for w in json.load(open(p)) if w["phones"] and w["phones"][0][1] >= 0]
    for w in ws:
        w["a"], w["b"] = w["phones"][0][1], max(p[2] for p in w["phones"])
    return sorted(ws, key=lambda w: w["a"])


words_by_role = {"lead": load_words(phl), "harm": load_words(phb)}


def curve(rows):
    """SZA-minus-male margin as a function of time (window centres, 3-window median)"""
    t = np.array([r["t"] + 1.5 for r in rows])
    m = np.array([r["sza"] - max(r["parker"], r.get("gizz", -9)) for r in rows])
    mm = np.array([np.median(m[max(0, i - 1):i + 2]) for i in range(len(m))])
    return lambda x: float(np.interp(x, t, mm)) if len(t) else 0.0


def voiced(c, a, b):
    fa, fb = int(a * 1000 / FP), max(int(a * 1000 / FP) + 1, int(b * 1000 / FP))
    return float((c[fa:fb] > 0).mean())


def smooth(labels, durs):
    """fold runs shorter than MIN_RUN seconds into the longer neighbouring run"""
    labels = list(labels)
    while True:
        runs, i = [], 0
        while i < len(labels):
            j = i
            while j < len(labels) and labels[j] == labels[i]:
                j += 1
            runs.append((i, j, sum(durs[i:j])))
            i = j
        short = [r for r in runs if r[2] < MIN_RUN and len(runs) > 1]
        if not short:
            return labels
        i, j, _ = min(short, key=lambda r: r[2])
        k = runs.index((i, j, _))
        nb = [runs[x] for x in (k - 1, k + 1) if 0 <= x < len(runs)]
        lab = labels[max(nb, key=lambda r: r[2])[0]]
        for x in range(i, j):
            labels[x] = lab


lead_m, back_m = curve(vid["lead.wav"]), curve(vid["backing.wav"])
parts = {k: [] for k in ("sza_lead", "parker_lead", "parker_harm", "sza_harm")}
txt = []
for role, words in words_by_role.items():
    stem, curve_ = (L, lead_m) if role == "lead" else (B, back_m)
    thr = 0.1 if role == "harm" else 0.0
    blocks, cur = [], []                      # sung blocks split at pauses > 2 s: smoothing never crosses one
    for w in words:
        if cur and w["a"] - cur[-1]["b"] > 2.0:
            blocks.append(cur)
            cur = []
        cur.append(w)
    if cur:
        blocks.append(cur)
    for blk in blocks:
        durs = [w["b"] - w["a"] for w in blk]
        on = [voiced(stem, w["a"], w["b"]) >= (0.2 if role == "lead" else 0.3) for w in blk]
        labs = smooth(["sza" if curve_((w["a"] + w["b"]) / 2) > thr else "parker" for w in blk], durs)
        i = 0
        while i < len(blk):
            if not on[i]:
                i += 1
                continue
            j = i
            while j + 1 < len(blk) and on[j + 1] and labs[j + 1] == labs[i]:
                j += 1
            a_ = blk[i]["a"] - 0.01
            b_ = (blk[j + 1]["a"] - 0.01) if j + 1 < len(blk) else blk[j]["b"] + 0.5
            parts[f"{labs[i]}_{role}"].append((a_, b_))
            txt.append((a_, role, labs[i], b_, j - i + 1))
            i = j + 1

Path(outdir).mkdir(parents=True, exist_ok=True)
for k, spans in parts.items():
    bank, tr = BANKS[k.split("_")[0]]
    json.dump({"parts": [{"t0": round(a, 3), "t1": round(b, 3), "bank": bank, "transpose": tr} for a, b in spans]},
              open(Path(outdir) / f"cast_{k}.json", "w"), indent=0)
    print(f"{k}: {len(spans)} spans, {sum(b - a for a, b in spans):.0f} s")
fmt = lambda t: f"{int(t // 60)}:{t % 60:05.2f}"
lines = [f"{fmt(a)}-{fmt(b)}  {role:4s} {who:6s} ({n} words)" for a, role, who, b, n in sorted(txt)]
open(Path(outdir) / "casting.txt", "w").write("\n".join(lines) + "\n")
print("\n".join(lines))
