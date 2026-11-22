"""Lines the backing stem carries without the lead (in sheet_backing, not in sheet_lead), each with its own
alignment window around where the full-vocal alignment puts it; those where the lead stem still carries a voice
(voiced over 25 %+ of the line) are duets: SZA's melody from the lead stem over Parker's line.

    python solo_duet.py lyrics.json phones_vocals.json sheet_lead.json sheet_backing.json pitch_lead.npy out_dir
writes out_dir/sheet_solo.json and out_dir/duet_lines.json
"""
import json
import re
import sys

import numpy as np

lyr, phv, shl, shb, pl, out = sys.argv[1:7]
sheet, words = json.load(open(lyr)), json.load(open(phv))
lines, wi = [], 0
for sec in sheet["sections"]:
    for text in sec["lines"]:
        n = len(re.findall(r"[A-Za-z']+", text))
        ph = [p for w in words[wi:wi + n] for p in w["phones"]]
        wi += n
        lines.append((min(p[1] for p in ph), max(p[2] for p in ph), text))
in_sheet = lambda p: [(l, s["t0"], s["t1"]) for s in json.load(open(p))["sections"] for l in s["lines"]]
lead_l, back_l = in_sheet(shl), in_sheet(shb)
has = lambda lst, a, text: any(l == text and t0 - 1 <= a <= t1 + 1 for l, t0, t1 in lst)
L = np.load(pl)
secs, duets = [], []
for i, (a, b, text) in enumerate(lines):
    if text.strip().lower() == "oh":                     # background ad-lib: left out
        continue
    if has(back_l, a, text) and not has(lead_l, a, text):
        prev_end = lines[i - 1][1] if i else 0.0
        nxt = lines[i + 1][0] if i + 1 < len(lines) and lines[i + 1][2].strip().lower() != "oh" else b + 5
        secs.append({"t0": round(max(a - 0.35, prev_end - 0.1), 2), "t1": round(min(b + 0.6, nxt - 0.05), 2), "lines": [text]})
        if (L[int(a * 200):int(b * 200)] > 0).mean() >= 0.25:
            duets.append([round(a - 0.35, 2), round(b + 0.6, 2), text])
json.dump({"sections": secs}, open(f"{out}/sheet_solo.json", "w"), indent=0)
json.dump(duets, open(f"{out}/duet_lines.json", "w"), indent=0)
print("solo lines:", ", ".join(f"{int(s['t0'] // 60)}:{s['t0'] % 60:04.1f} {s['lines'][0][:24]}" for s in secs))
print("duets:", ", ".join(f"{int(d[0] // 60)}:{d[0] % 60:04.1f} {d[2][:24]}" for d in duets))
