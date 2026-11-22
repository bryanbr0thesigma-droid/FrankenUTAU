"""Harmony timing that sings with the lead: where the backing stem sings a line the lead also sings (same text, at
the same time), the harmony takes the lead's word timing; lines only the backing sings keep the backing's timing.

    python harm_phones.py sheet_lead.json phones_lead.json sheet_backing.json phones_back.json out.json
"""
import json
import re
import sys


def lines_of(sheet_p, phones_p):
    words = json.load(open(phones_p))
    out, wi = [], 0
    for sec in json.load(open(sheet_p))["sections"]:
        for text in sec["lines"]:
            n = len(re.findall(r"[A-Za-z']+", text))
            ws = words[wi:wi + n]
            wi += n
            ph = [p for w in ws for p in w["phones"] if p[1] >= 0]
            out.append({"text": text, "words": ws, "t0": min(p[1] for p in ph), "t1": max(p[2] for p in ph)})
    return out


lead = lines_of(sys.argv[1], sys.argv[2])
back = lines_of(sys.argv[3], sys.argv[4])
res, synced = [], 0
for b in back:
    m = [l for l in lead if l["text"] == b["text"] and abs(l["t0"] - b["t0"]) < 2.0]
    if m:
        res += m[0]["words"]
        synced += 1
    else:
        res += b["words"]
json.dump(res, open(sys.argv[5], "w"), indent=0)
print(f"{len(back)} backing lines: {synced} sung in time with the lead, {len(back) - synced} on their own timing")
