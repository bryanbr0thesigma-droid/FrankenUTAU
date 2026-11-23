"""Harlequin Contraption for Maki: replace the sacrifice lines, note for note (same notes, same rhythm), and clear
per-note language overrides (Basic renders those notes silent).

    python3 edit_lyrics.py basic.svp maki.svp
"""
import json
import sys

src, dst = sys.argv[1:3]
p = json.loads(open(src, "rb").read().decode("utf-8").rstrip("\x00"))

# (old lyrics on consecutive notes) -> (new lyrics on the same notes)
EDITS = [
    (["reduce", "+"], ["invite", "+"]),                                    # "Reduce this crowd ..."
    (["to", "sacrifice", "+", "+"], ["to", "dance", "tonight", "+"]),      # "... to sacrifice" -> "... to dance tonight"
    (["purge"], ["free"]),                                                 # "Purge thy body" -> "Free thy body"
    (["Seduce", "+", "this", "soul", "in", "sacrifice", "+", "+"],         # "Seduce this soul in sacrifice"
     ["Lift", "up", "this", "soul", "into", "+", "the", "light"]),        #  -> "Lift up this soul into the light"
]

done, cleared = [], 0
for t in p["tracks"]:
    notes = sorted(t["mainGroup"]["notes"], key=lambda n: n["onset"])
    lyr = [n["lyrics"] for n in notes]
    for old, new in EDITS:
        k = len(old)
        i = 0
        while i + k <= len(lyr):
            if [x.lower() for x in lyr[i:i + k]] == [x.lower() for x in old]:
                for j in range(k):
                    if notes[i + j]["lyrics"] != new[j]:
                        notes[i + j]["lyrics"] = new[j]
                        notes[i + j]["phonemes"] = ""          # let Maki's dictionary pronounce the new word
                    lyr[i + j] = new[j]
                done.append((t["name"], " ".join(old), " ".join(new)))
                i += k
            else:
                i += 1
    for n in notes:
        a = n.get("attributes", {})
        if "languageOverride" in a or "phonesetOverride" in a:
            a.pop("languageOverride", None)
            a.pop("phonesetOverride", None)
            cleared += 1
    t["mainGroup"]["notes"] = notes

open(dst, "w", encoding="utf-8").write(json.dumps(p, ensure_ascii=False))
for name, o, n in done:
    print(f"{name:8s} {o!r} -> {n!r}")
print(f"{len(done)} edits, {cleared} per-note language overrides cleared")
