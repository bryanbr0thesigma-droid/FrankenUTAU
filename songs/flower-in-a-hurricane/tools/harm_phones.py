"""Split the backing stem's lines: where it sings a line the lead also sings (same text, at the same time) it is a
harmony and takes the lead's word timing (out_sync); lines only the backing stem carries are a solo voice there and
keep the backing's own timing (out_solo).

    python harm_phones.py sheet_lead.json phones_lead.json sheet_backing.json phones_back.json out_sync.json out_solo.json
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
sync, solo = [], []
for b in back:
    m = [l for l in lead if l["text"] == b["text"] and abs(l["t0"] - b["t0"]) < 2.0]
    if m:
        sync += m[0]["words"]
    else:
        solo += b["words"]
json.dump(sync, open(sys.argv[5], "w"), indent=0)
json.dump(solo, open(sys.argv[6], "w"), indent=0)
print(f"{len(back)} backing lines: {len(back) - len([1 for b in back if not [l for l in lead if l['text'] == b['text'] and abs(l['t0'] - b['t0']) < 2.0]])} harmonies on the lead's timing, solo lines: " +
      ", ".join(f"{int(b['t0'] // 60)}:{b['t0'] % 60:04.1f}" for b in back if not [l for l in lead if l["text"] == b["text"] and abs(l["t0"] - b["t0"]) < 2.0]))
