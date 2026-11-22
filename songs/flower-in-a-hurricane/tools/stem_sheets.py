"""Per-stem lyric sheets: which lines each stem (lead / backing) actually sings, with windows around them.

    python stem_sheets.py lyrics.json phones_vocals.json pitch_lead.npy pitch_back.npy OUTDIR

Line times come from the alignment on the full vocal stem. A line is in a stem when that stem is voiced over at
least 35 % of it. Consecutive present lines form one section; each window reaches up to 1 s (or half the gap) past
its lines, so a voice that comes in a little early or late is still inside it.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np

lyr, phv, pl, pb, outdir = sys.argv[1:6]
sheet = json.load(open(lyr))
words = json.load(open(phv))
lines, wi = [], 0
for sec in sheet["sections"]:
    for text in sec["lines"]:
        n = len(re.findall(r"[A-Za-z']+", text))
        ws = words[wi:wi + n]
        wi += n
        ph = [p for w in ws for p in w["phones"] if p[1] >= 0]
        lines.append({"text": text, "t0": min(p[1] for p in ph), "t1": max(p[2] for p in ph)})
for name, pnp in (("lead", pl), ("backing", pb)):
    c = np.load(pnp)
    pres = []
    for ln in lines:
        v = (c[int(ln["t0"] * 200):int(ln["t1"] * 200)] > 0).mean()
        pres.append(v >= 0.35)
    secs, cur = [], []
    for i, ln in enumerate(lines):
        if pres[i] and (not cur or ln["t0"] - lines[cur[-1]]["t1"] < 3.0):
            cur.append(i)
        else:
            if cur:
                secs.append(cur)
            cur = [i] if pres[i] else []
    if cur:
        secs.append(cur)
    out = []
    for s in secs:
        a, b = lines[s[0]]["t0"], lines[s[-1]]["t1"]
        prev_end = lines[s[0] - 1]["t1"] if s[0] > 0 else 0.0
        next_start = lines[s[-1] + 1]["t0"] if s[-1] + 1 < len(lines) else b + 5
        a -= min(1.0, max(0.1, (a - prev_end) / 2)) if s[0] > 0 and not pres[s[0] - 1] else min(1.0, max(0.1, (a - prev_end) / 2))
        b += min(1.0, max(0.1, (next_start - b) / 2))
        out.append({"t0": round(a, 2), "t1": round(b, 2), "lines": [lines[i]["text"] for i in s]})
    json.dump({"sections": out}, open(Path(outdir) / f"sheet_{name}.json", "w"), indent=0)
    print(f"{name}: {sum(pres)}/{len(lines)} lines, {len(out)} sections: " +
          ", ".join(f"{o['t0']:.1f}-{o['t1']:.1f} ({len(o['lines'])})" for o in out))
