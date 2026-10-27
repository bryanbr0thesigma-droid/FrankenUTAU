"""Check how Japanese lyrics sit on the beat.

Usage: python3 -I rhythm_check.py <project.svp> <lyrics.py> [--list]
Over sung notes (not breaths, "ら" or "-" slurs):
  strict     beats where a word starts
  good       beats where a word starts, a word began on the note just before (a pickup),
             or a held word ending (an eighth or longer) lands
  particles  particles sung on a beat (should be 0)
  squeezes   two or more sung syllables on a note shorter than 0.16 s (should be 0)
  crammed    notes of any length carrying two different syllables, e.g. かけ or おどろ on one
             note (should be 0; a long vowel, ん or っ inside a syllable is fine)
Strong beats are beats 1 and 3 of the bar.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svp  # noqa: E402

PARTICLES = {"の", "に", "が", "で", "も", "わ", "え", "お", "を", "と", "ね", "よ", "か", "だ", "さ"}
SMALL = set("ゃゅょぁぃぅぇぉっ")
TWO_BEFORE = {"かい", "む", "けん", "あし", "ま", "あ", "またか"}  # に before these words is the number two


def morae(tok):
    return sum(1 for c in tok if c not in SMALL)


VOWEL = {}
for _row, _v in [("あかさたなはまやらわがざだばぱ", "a"), ("いきしちにひみりぎじぢびぴ", "i"),
                 ("うくすつぬふむゆるぐずづぶぷ", "u"), ("えけせてねへめれげぜでべぺ", "e"),
                 ("おこそとのほもよろをごぞどぼぽ", "o")]:
    VOWEL.update(dict.fromkeys(_row, _v))
VOWEL.update(dict(zip("あいうえおゃゅょぁぃぅぇぉ", "aiueoauoaiueo")))
LONG = {"あ": "a", "い": "ie", "う": "uo", "え": "e", "お": "o"}  # these extend a vowel in the same syllable


def syllables(tok):
    """Sung syllables in a token: a long vowel, ん and っ belong to the syllable before them."""
    n, last = 0, None
    for i, c in enumerate(tok):
        if c in "んっー":
            continue
        if c in "ゃゅょぁぃぅぇぉ":
            last = VOWEL[c]
            continue
        if i and c in LONG and last and last in LONG[c]:
            continue
        n += 1
        last = VOWEL.get(c)
    return n


def main(path, lyrics_path, *flags):
    groups = svp.load_lyrics(lyrics_path)
    d = svp.load(path)
    bpm = d["time"]["tempo"][0]["bpm"]
    lib = {g["uuid"]: g for g in d["library"]}
    rows = []
    for t in d["tracks"]:
        for ref in t.get("groups", []):
            g = lib.get(ref["groupID"])
            if not g or not g["notes"]:
                continue
            for notes, phrase in zip(svp.group_phrases(g), groups[g["uuid"][:8]]):
                words = [w.split() for w in phrase[0].split("|")]
                info = []
                for wi, w in enumerate(words):
                    nxt = words[wi + 1] if wi + 1 < len(words) else []
                    for k, tok in enumerate(w):
                        number = tok == "に" and "".join(nxt) in TWO_BEFORE
                        info.append((tok, k == 0, k == len(w) - 1, len(w) == 1 and tok in PARTICLES and not number))
                for i, (n, (tok, start, end, particle)) in enumerate(zip(notes, info)):
                    rows.append(dict(tok=tok, start=start, end=end, particle=particle,
                                     prev_start=i > 0 and info[i - 1][1] and not info[i - 1][3],
                                     beat=(ref["blickOffset"] + n["onset"]) / svp.Q, dur16=n["duration"] / (svp.Q / 4),
                                     secs=n["duration"] / svp.Q * 60 / bpm, phrase=phrase[1]))
    sung = [r for r in rows if r["tok"] not in ("br", "ら", "-")]
    on_beat = [r for r in sung if abs(r["beat"] % 1) < 0.01]
    strong = [r for r in on_beat if abs(r["beat"] % 2) < 0.01]

    def word_start(r):
        return r["start"] and not r["particle"]

    def good(r):
        return word_start(r) or r["prev_start"] or (r["end"] and r["dur16"] >= 1.9)

    def pct(rs, f):
        return f"{100 * sum(map(f, rs)) / len(rs):.0f}%"

    parts = [r for r in on_beat if r["particle"]]
    sq = [r for r in sung if morae(r["tok"]) >= 2 and r["secs"] < 0.16]
    crammed = [r for r in sung if syllables(r["tok"]) >= 2]
    print(f"{len(sung)} sung syllables, {len(on_beat)} on beats ({len(strong)} strong)")
    print(f"  strict  word starts on beats: {pct(on_beat, word_start)}  (strong beats {pct(strong, word_start)})")
    print(f"  good    beats well placed:    {pct(on_beat, good)}  (strong beats {pct(strong, good)})")
    print(f"  particles on beats: {len(parts)}   squeezes on short notes: {len(sq)}   crammed notes: {len(crammed)}")
    if "--list" in flags:
        for r in parts:
            print(f"    particle '{r['tok']}' on a beat in: {r['phrase']}")
        for r in sq:
            print(f"    squeeze '{r['tok']}' ({r['secs']:.2f}s) in: {r['phrase']}")
        for r in crammed:
            print(f"    crammed '{r['tok']}' on one note in: {r['phrase']}")
        for r in strong:
            if not good(r):
                print(f"    strong beat mid-word '{r['tok']}' in: {r['phrase']}")


if __name__ == "__main__":
    main(*sys.argv[1:])
