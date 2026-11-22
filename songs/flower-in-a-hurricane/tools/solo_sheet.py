"""Lines only the backing stem carries (the lead is 5+ dB down over them), each in its own alignment window around
where the full-vocal alignment puts it, so a solo line cannot drift into its neighbours.

    python solo_sheet.py lyrics.json phones_vocals.json stems/ out_sheet_solo.json
"""
import json
import re
import sys

import numpy as np
import soundfile as sf

lyr, phv, stems, out = sys.argv[1:5]
sheet, words = json.load(open(lyr)), json.load(open(phv))
L, sr = sf.read(f"{stems}/lead.wav")
B, _ = sf.read(f"{stems}/backing.wav")
L, B = L.mean(1), B.mean(1)
db = lambda x, a, b: 20 * np.log10(np.sqrt((x[int(a * sr):int(b * sr)] ** 2).mean()) + 1e-9)
lines, wi = [], 0
for sec in sheet["sections"]:
    for text in sec["lines"]:
        n = len(re.findall(r"[A-Za-z']+", text))
        ph = [p for w in words[wi:wi + n] for p in w["phones"]]
        wi += n
        a, b = min(p[1] for p in ph), max(p[2] for p in ph)
        lines.append((a, b, text, db(L, a, b) - db(B, a, b)))
secs = []
for i, (a, b, text, d) in enumerate(lines):
    if d <= -5:
        prev_end = lines[i - 1][1] if i else 0.0
        nxt = lines[i + 1][0] if i + 1 < len(lines) else b + 5
        secs.append({"t0": round(max(a - 0.35, prev_end - 0.1), 2), "t1": round(min(b + 0.6, nxt - 0.05), 2), "lines": [text]})
json.dump({"sections": secs}, open(out, "w"), indent=0)
print(f"{len(secs)} solo lines:", ", ".join(f"{int(s['t0'] // 60)}:{s['t0'] % 60:04.1f}" for s in secs))
