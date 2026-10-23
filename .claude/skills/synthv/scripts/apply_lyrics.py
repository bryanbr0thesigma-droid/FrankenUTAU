"""Write lyrics from a lyrics module into a project, and optionally a lyric sheet.

Usage: python3 -I apply_lyrics.py <in.svp> <lyrics.py> <out.svp> [--sheet sheet.md]

The lyrics module defines GROUPS = {group-uuid-prefix: [phrase, ...]}, one phrase per run of
notes separated by rests of an eighth or longer, where a phrase is
(tokens, written Japanese, original English, English back-translation[, rhyme note]).
Tokens are one sung syllable per note, space separated; "|" marks word breaks.
Every phrase must have exactly as many tokens as notes, or nothing is written.
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svp  # noqa: E402


def write_sheet(d, groups, path, title):
    lib = {g["uuid"]: g for g in d["library"]}
    bpm = d["time"]["tempo"][0]["bpm"]
    out = [f"# {title}", ""]
    # Tracks singing the same words at the same times (harmony stacks) are listed once.
    same = {}
    for t in d["tracks"]:
        uses = sorted([(r["blickOffset"] + min(n["onset"] for n in lib[r["groupID"]]["notes"]), lib[r["groupID"]])
                       for r in t.get("groups", []) if lib.get(r["groupID"], {}).get("notes")], key=lambda u: u[0])
        if uses:
            key = tuple((start // (svp.Q // 4), tuple(p[1] for p in groups[g["uuid"][:8]])) for start, g in uses)
            same.setdefault(key, []).append((t["name"], uses))
    for tracks in same.values():
        uses = min((u for _, u in tracks), key=lambda u: sum(len(g["name"]) for _, g in u))
        out += [f"## Track: {', '.join(name for name, _ in tracks)}", ""]
        for start, g in uses:
            secs = start / svp.Q * 60 / bpm
            out += [f"### {int(secs // 60)}:{int(secs % 60):02d} ({g['name'].strip()})", ""]
            for p in groups[g["uuid"][:8]]:
                if p[1].startswith("ら"):
                    out += ["- ら ら ら… (la la la)", ""]
                    continue
                out += [f"- **{p[1]}**", f"  - Say it: *{svp.romaji_line(p)}*",
                        f"  - Means: {p[3]}", f"  - Original: {p[2]}"]
                if len(p) > 4:
                    out.append(f"  - Rhymes: {p[4]}")
                out.append("")
    open(path, "w", encoding="utf-8").write("\n".join(out))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("lyrics")
    ap.add_argument("dst")
    ap.add_argument("--sheet")
    ap.add_argument("--title", default="Japanese lyrics")
    a = ap.parse_args()
    d = svp.load(a.src)
    groups = svp.load_lyrics(a.lyrics)
    errors = []
    for g in d["library"]:
        key = g["uuid"][:8]
        if key not in groups:
            errors.append(f"{key} {g['name']!r}: no lyrics defined")
            continue
        phrases = svp.group_phrases(g)
        if len(phrases) != len(groups[key]):
            errors.append(f"{key} {g['name']!r}: {len(phrases)} phrases in song, {len(groups[key])} written")
            continue
        for pi, (notes, phrase) in enumerate(zip(phrases, groups[key])):
            toks = svp.tokens_of(phrase)
            if len(toks) != len(notes):
                errors.append(f"{key} {g['name']!r} phrase {pi}: {len(notes)} notes, {len(toks)} syllables")
                continue
            for n, tok in zip(notes, toks):
                n["lyrics"], n["phonemes"], n["musicalType"] = tok, "", "singing"
                # Per-note language overrides (e.g. Mandarin lines) make Basic render silence.
                n.get("attributes", {}).pop("languageOverride", None)
                n.get("attributes", {}).pop("phonesetOverride", None)
    if errors:
        sys.exit("\n".join(errors))
    for t in d["tracks"]:
        for ref in [t["mainRef"]] + t.get("groups", []):
            ref["database"]["languageOverride"] = ""
            ref["database"]["phonesetOverride"] = ""
    svp.save(d, a.dst)
    if a.sheet:
        write_sheet(d, groups, a.sheet, a.title)
    print(f"ok: {sum(len(g['notes']) for g in d['library'])} notes across {len(d['library'])} groups")


if __name__ == "__main__":
    main()
