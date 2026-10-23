#!/usr/bin/env python3
"""Rebuild the Mandarin / Yi Xi Lite version of "Let's Just Sayaw" from the original SVP.

Usage: python3 build_mandarin_svp.py ORIGINAL.svp OUTPUT.svp [lyrics_zh.txt]

Only lyrics change: every note keeps its onset, length and pitch, and each note
gets exactly one Mandarin syllable, so the rhythm is the one from the original.
On top of that the project is made playable in Synthesizer V Studio Basic with
a Lite voice:
  - every voice is set to Yi Xi Lite (Mandarin) and the English cross-lingual
    overrides are removed (Basic has no cross-lingual synthesis),
  - rap notes become sung notes (Lite voices and Basic cannot render rap),
  - English phoneme overrides are cleared; breaths stay as "br".
The script stops with an error if any line of lyrics_zh.txt does not have
exactly one syllable per note.
"""
import copy
import json
import re
import sys
from pathlib import Path

BLICKS_PER_BEAT = 705600000
LEAD_TRACK = 0      # "main singing"
HARMONY_TRACK = 2   # "Unnamed Track 1" (second Yi Xi part)
ONSET_TOLERANCE = 0.03  # beats; the harmony copy is shifted by up to ~0.01 beat in places

VOICE = {
    "name": "Yi Xi Lite",
    "language": "mandarin",
    "phoneset": "xsampa",
    "languageOverride": "",
    "phonesetOverride": "",
}


def parse_spec(path):
    lines = []
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.startswith("#"):
            continue
        rng, zh, en = [part.strip() for part in raw.split("|")]
        start, end = (float(x) for x in rng.split())
        if zh.endswith("*"):
            tokens = None  # fill every note in the range with this syllable
            fill = zh[:-1]
        else:
            tokens = re.findall(r"\[br\]|\S", zh)
            fill = None
        lines.append({"start": start, "end": end, "tokens": tokens, "fill": fill, "zh": zh, "en": en})
    return lines


def track_notes(project, track_index):
    """Yield (note, absolute onset in beats, audible) for every note of a track."""
    library = {g["uuid"]: g for g in project["library"]}
    for ref in project["tracks"][track_index]["groups"]:
        group = library[ref["groupID"]]
        begin = ref["blickAbsoluteBegin"]
        end = ref["blickAbsoluteEnd"] if ref["blickAbsoluteEnd"] >= 0 else float("inf")
        for note in group["notes"]:
            onset = note["onset"] + ref["blickOffset"]
            audible = onset + note["duration"] > begin and onset < end
            yield note, onset / BLICKS_PER_BEAT, audible


def nearest(candidates, beat):
    best = min(candidates, key=lambda c: abs(c[0] - beat), default=None)
    if best is not None and abs(best[0] - beat) <= ONSET_TOLERANCE:
        return best
    return None


def build(original, spec_path):
    project = copy.deepcopy(original)
    spec = parse_spec(spec_path)

    # 1. Lead: assign syllables line by line, in time order.
    lead = sorted(((b, n) for n, b, a in track_notes(project, LEAD_TRACK) if a), key=lambda x: x[0])
    syllable_of = {}
    for line in spec:
        notes = [(b, n) for b, n in lead if line["start"] - 1e-6 <= b <= line["end"]]
        tokens = line["tokens"] if line["tokens"] is not None else [line["fill"]] * len(notes)
        if len(tokens) != len(notes):
            sys.exit(f"{line['start']}-{line['end']} '{line['zh']}': {len(tokens)} syllables for {len(notes)} notes "
                     f"({' '.join(n['lyrics'] for _, n in notes)})")
        for (_, note), token in zip(notes, tokens):
            if id(note) in syllable_of:
                sys.exit(f"note '{note['lyrics']}' at beat {line['start']} is covered by two lyric lines")
            syllable_of[id(note)] = token
    missing = [(round(b, 3), n["lyrics"]) for b, n in lead if id(n) not in syllable_of]
    if missing:
        sys.exit(f"lead notes without a Mandarin syllable: {missing}")
    lead_by_beat = [(b, syllable_of[id(n)], n["lyrics"]) for b, n in lead]

    # 2. Harmony: sing the same syllable as the lead note starting at the same time.
    unmatched = []
    for note, beat, audible in track_notes(project, HARMONY_TRACK):
        if not audible:
            continue
        match = nearest(lead_by_beat, beat)
        if match:
            syllable_of[id(note)] = match[1]
        elif note["lyrics"].startswith("breath") or note["phonemes"] == "br":
            syllable_of[id(note)] = "[br]"
        else:
            unmatched.append((round(beat, 3), note["lyrics"]))
    if unmatched:
        sys.exit(f"harmony notes with no lead note at the same time: {unmatched}")

    # 3. Hidden notes (outside the visible part of a clip): translate them too when the
    #    same English word is audible at the same time on that track, so trimming a
    #    clip later does not bring English lyrics back. Others are left as they were.
    left_hidden = 0
    for track_index in (LEAD_TRACK, HARMONY_TRACK):
        audible = [(b, syllable_of[id(n)], n["lyrics"]) for n, b, a in track_notes(project, track_index) if a]
        for note, beat, is_audible in track_notes(project, track_index):
            if is_audible:
                continue
            match = nearest(audible, beat)
            if match and match[2] == note["lyrics"]:
                syllable_of[id(note)] = match[1]
            else:
                left_hidden += 1

    # 4. Apply lyrics; make every note a sung note.
    changed = 0
    for group in project["library"]:
        for note in group["notes"]:
            note["musicalType"] = "singing"
            token = syllable_of.get(id(note))
            if token is None:
                continue
            if token == "[br]":
                note["lyrics"], note["phonemes"] = "br", "br"
            else:
                note["lyrics"], note["phonemes"] = token, ""
            changed += 1

    # 5. Voice: Yi Xi Lite everywhere, no English overrides.
    for track in project["tracks"]:
        refs = [track["mainRef"]] + track["groups"]
        for ref in refs:
            if ref.get("isInstrumental"):
                continue
            db = ref["database"]
            if ref is track["mainRef"]:
                db.update(VOICE)
            else:
                db["languageOverride"] = ""
                db["phonesetOverride"] = ""

    return project, changed, left_hidden


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    spec = sys.argv[3] if len(sys.argv) > 3 else Path(__file__).with_name("lyrics_zh.txt")
    original = json.loads(Path(src).read_text(encoding="utf-8"))
    project, changed, left_hidden = build(original, spec)
    Path(dst).write_text(json.dumps(project, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {dst}: {changed} notes got Mandarin lyrics, {left_hidden} hidden notes left unchanged")


if __name__ == "__main__":
    main()
