# Let's Just Sayaw (Japanese version, Kasane Teto Lite)

The original song (English lyrics, sung by Yi Xi 2 in Synthesizer V Studio 2) with Japanese
lyrics written to its exact notes, sung by the free Kasane Teto (Lite) voice in SynthV Basic.

| File | What it is |
|---|---|
| `original.svp` | The original SynthV 2 project (English, Yi Xi 2) |
| `japanese-teto.svp` | The finished Japanese project: SynthV 1.x format, Teto Lite, with per-note Loudness boosts that even out the low rap sections. Opens in SynthV Basic or Pro, 1.x or 2 |
| `lyrics_ja.py` | The Japanese lyrics, one syllable per note, with each line's original English and a back-translation |
| `lyrics-ja.txt` | Japanese lyrics only |
| `lyrics-sheet.md` | Every line with pronunciation (romaji), meaning, and the original English |

The instrumental (`LETS JUST DANCE for master.wav`) is not stored here; it is in the owner's
shared Google Drive folder "lets just dance stuff". The project expects it at the original
author's path, so relink it in SynthV if you want it in the session.

## Rebuild and render (see `.claude/skills/synthv/SKILL.md`)

```bash
S=.claude/skills/synthv/scripts; SONG=songs/lets-just-sayaw; OUT=/tmp/sayaw
bash $S/install.sh
python3 -I $S/for_basic.py $SONG/original.svp $OUT/basic.svp
python3 -I $S/apply_lyrics.py $OUT/basic.svp $SONG/lyrics_ja.py $OUT/japanese.svp --sheet $SONG/lyrics-sheet.md
python3 -I $S/rhythm_check.py $OUT/basic.svp $SONG/lyrics_ja.py --list
python3 -I $S/render_config.py $OUT/japanese.svp $OUT/stems.svp --dir $OUT --name stem --stems
$S/open.sh $OUT/stems.svp && $S/bounce.sh $OUT stem
python3 -I $S/boost.py $OUT/stems.svp $OUT/boosted.svp 0:$OUT/stem_main_singing.wav:-19.5 2:$OUT/stem_Unnamed_Track_1.wav:-20.5
python3 -I $S/render_config.py $OUT/boosted.svp $OUT/final.svp --dir $OUT --name final
$S/open.sh $OUT/final.svp && $S/bounce.sh $OUT final
python3 -I $S/mix.py $OUT/final_MixDown.wav $OUT/FULL-MIX.wav --inst "LETS JUST DANCE for master.wav" --ride 115.5:156.5:2.5
python3 -I $S/mix.py $OUT/final_MixDown.wav $OUT/VOCALS.wav
```

To render the finished project as it is, skip to `render_config.py` with `japanese-teto.svp`.

## Notes

- Vocals start at 0:16, after the instrumental's intro; every syllable sits on the original
  notes, so timing matches the instrumental (beats line up within ~7 ms at 116 BPM).
- Meaning was checked line by line against the English (see `lyrics-sheet.md`). Small words that
  did not fit the notes: "wait" (when will this end), "really" (worth my fate), "bills" sung as
  rent, "controlled" as a cage, and "with my feet" in the last chorus line.
- Rhythm: no particles on beats, no two syllables on a 16th note, every strong beat well placed.
- Basic cannot sing English cross-lingually (Pro only) and has no Rap mode; rap notes are sung.
- Have a native Japanese speaker read `lyrics-ja.txt` before a public release.
