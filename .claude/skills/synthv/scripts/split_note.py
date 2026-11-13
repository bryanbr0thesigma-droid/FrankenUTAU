"""Split a note in two at the same pitch, to fit one more syllable (e.g. a long vowel + a final
syllable) without changing the melody.

Usage: python3 -I split_note.py <in.svp> <out.svp> <group-prefix>[,<group-prefix>...] <phrase> <note> <first-16ths>
Splits note <note> (0-based, within phrase <phrase>; phrases as in apply_lyrics.py) of every
listed group into a note <first-16ths> sixteenths long and one with the rest. List every group
that sings the line (harmonies too) so their notes stay identical.
"""
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svp  # noqa: E402


def main(src, dst, prefixes, phrase, note, first16):
    d = svp.load(src)
    first = round(float(first16) * svp.Q / 4)
    for prefix in prefixes.split(","):
        g = next(g for g in d["library"] if g["uuid"].startswith(prefix))
        n = svp.group_phrases(g)[int(phrase)][int(note)]
        if not 0 < first < n["duration"]:
            sys.exit(f"{prefix}: note is {n['duration'] / (svp.Q / 4):.1f} sixteenths, can't split at {first16}")
        rest = copy.deepcopy(n)
        rest["onset"], rest["duration"] = n["onset"] + first, n["duration"] - first
        n["duration"] = first
        g["notes"].append(rest)
        g["notes"].sort(key=lambda x: x["onset"])
        print(f"{prefix} {g['name'].strip()!r}: split '{n['lyrics']}' into {float(first16):g} + "
              f"{rest['duration'] / (svp.Q / 4):g} sixteenths")
    svp.save(d, dst)


if __name__ == "__main__":
    main(*sys.argv[1:])
