"""Harlequin Contraption, second round of fixes from listening:

1. 2:38: the first "keep dancin', Harlequin contraption" (Main 2) moves to the Whisper track, which whispers
   (breathiness 1, voicing 0 from 1:32 on), like the verse 2 whispers. The repeat at 2:42 stays sung.
2. 3:11: the long held "ah" at the end slowly loses its pitch, a wind-down: it holds, then sags slowly and faster
   toward the end, one octave down by the end of the note. Same curve on every part that holds it (Main 1,
   Harm 1-3), so the chord sinks together.

    python3 fix_whisper_fall.py maki.svp maki2.svp
"""
import json
import sys

B = 705600000
BPM = 255.0
sec = lambda b: b / B * 60 / BPM
blk = lambda s: int(round(s * BPM / 60 * B))

WHISPER_SPAN = (158.4, 161.8)       # Main 2's "keep dancin' Harlequin contraption"
FALL_PARTS = ("Main 1", "Harm 1", "Harm 2", "Harm 3")
FALL_START = 192.6                  # hold the first ~0.6 s of the sustained note, then start sinking
FALL_DEPTH = 1200.0                 # cents at the end of the note
FALL_SHAPE = 2.0                    # slow at first, faster toward the end

src, dst = sys.argv[1:3]
p = json.loads(open(src, "rb").read().decode("utf-8").rstrip("\x00"))
T = {t["name"]: t for t in p["tracks"]}

# 1. whisper
m2 = T["Main 2"]["mainGroup"]
moved = [n for n in m2["notes"] if WHISPER_SPAN[0] <= sec(n["onset"]) <= WHISPER_SPAN[1]]
m2["notes"] = [n for n in m2["notes"] if n not in moved]
wg = T["Whisper"]["mainGroup"]
clash = [n for n in wg["notes"] if WHISPER_SPAN[0] - 0.5 <= sec(n["onset"]) <= WHISPER_SPAN[1] + 0.5]
assert not clash, "Whisper track already has notes there"
wg["notes"] = sorted(wg["notes"] + moved, key=lambda n: n["onset"])
print("whispered:", " ".join(n["lyrics"] for n in sorted(moved, key=lambda n: n["onset"])))

# 2. fall
for name in FALL_PARTS:
    g = T[name]["mainGroup"]
    held = max((n for n in g["notes"] if 191 <= sec(n["onset"]) <= 193), key=lambda n: n["duration"])
    end = sec(held["onset"] + held["duration"])
    pd = g["parameters"]["pitchDelta"]
    old = list(zip(pd["points"][0::2], pd["points"][1::2]))
    assert all(v == 0 for b, v in old if sec(b) > 190), f"{name} already has pitch edits near the end"
    pts = [(b, v) for b, v in old if sec(b) < FALL_START - 0.3]
    pts.append((blk(FALL_START - 0.3), 0.0))
    steps = 40
    for i in range(steps + 1):
        s = FALL_START + (end - FALL_START) * i / steps
        pts.append((blk(s), -FALL_DEPTH * (i / steps) ** FALL_SHAPE))
    pd["mode"] = "cubic"
    pd["points"] = [x for b, v in sorted(pts) for x in (b, v)]
    print(f"{name}: held note {sec(held['onset']):.2f}-{end:.2f} s, falls 0 -> -{FALL_DEPTH:.0f} cents from {FALL_START} s")

open(dst, "w", encoding="utf-8").write(json.dumps(p, ensure_ascii=False))
