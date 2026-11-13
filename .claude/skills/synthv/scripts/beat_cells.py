"""Show every phrase on the beat grid, for fitting lyrics to the rhythm.

Usage: python3 -I beat_cells.py <project.svp> [group-uuid-prefix ...]
One line per phrase; notes are grouped by the beat they fall in, written lyric/length in
16ths (length shown when not 1). "‖" marks a bar's downbeat; "~" a beat whose first note
starts off the beat (a pickup).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svp  # noqa: E402


def main(path, *only):
    d = svp.load(path)
    offsets = {r["groupID"]: (ti, r["blickOffset"]) for ti, t in enumerate(d["tracks"]) for r in t.get("groups", [])}
    lib = {g["uuid"]: g for g in d["library"] if g["uuid"] in offsets}
    for g in sorted(lib.values(), key=lambda g: offsets[g["uuid"]][1] + min(n["onset"] for n in g["notes"])):
        key = g["uuid"][:8]
        if only and key not in only:
            continue
        ti, off = offsets[g["uuid"]]
        print(f"=== {key} track{ti} {g['name'].strip()!r}")
        for pi, notes in enumerate(svp.group_phrases(g)):
            cells, cur, curbeat = [], [], None
            for n in notes:
                p16 = round((off + n["onset"]) / (svp.Q / 4))
                beat = p16 // 4
                if beat != curbeat:
                    if cur:
                        cells.append(cur)
                    bar, b = divmod(beat, 4)
                    label = ("‖" if b == 0 and p16 % 4 == 0 else "") + f"{bar + 1}.{b + 1}" + ("" if p16 % 4 == 0 else "~")
                    cur, curbeat = [label + ":"], beat
                length = n["duration"] / (svp.Q / 4)
                cur.append(n["lyrics"] + ("" if abs(length - 1) < 0.2 else f"/{length:.0f}"))
            cells.append(cur)
            print(f"  p{pi} [{len(notes)}] " + "  ".join(" ".join(c) for c in cells))


if __name__ == "__main__":
    main(*sys.argv[1:])
