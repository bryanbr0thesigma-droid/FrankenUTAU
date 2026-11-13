---
name: utau
description: Render UTAU voicebanks (e.g. Adachi Rei, Corrupt-Chan, any oto.ini bank) headless in this container with a built-in PSOLA resampler, type lyrics as whole kana/romaji lines like SynthV, map a Japanese song's vocal from audio into UTAU notes that follow the original pitch, and export OpenUtau .ustx projects. Use when the user wants an UTAU (not SynthV) voice to sing, a cover with UTAU voicebanks, or a .ustx.
---

# UTAU engine (headless)

Scripts in `scripts/`, Python 3 with numpy, soundfile and librosa (the UVR venv from the synthv
skill has them: `$SP/uvr-venv/bin/python`). No Wine or GUI needed.

- `kana.py` - lyric text to sung morae: `moras("しかくしんごお はっしゃ")`. Kana or romaji;
  `ー` repeats the vowel, small kana join, `っ`/`ん` are morae. Write lyrics as sung: は→わ, を→お,
  long o as お (`しんごお`), so a CV bank sings the right vowel.
- `voicebank.py <bank>` - reads every oto.ini (UTF-8 or Shift-JIS), prefix.map, character.txt.
  Lookup tries VCV (`a か`, `- か`), then CV (`か`), then romaji aliases.
- `psola.py` - the resampler: consonant at its own speed, vowel then looped back and forth over
  its steady half, re-pitched period by period (pyin pitch marks). `force_f0` makes noisy banks
  whose samples have no readable pitch still follow the melody.
- `render.py project.json out_dir` - classic UTAU placement (preutterance before the note,
  overlap crossfade, auto-fit on short notes), per-note loudness levelling, consonant bursts
  capped 6 dB over the vowel. One float WAV per track, aligned to song time 0.
- `map_ja.py vocal.wav f0.npz grid.npy lyrics.py out_dir --tracks M=rei:/bank,...` - forced
  alignment (torchaudio MMS) of every mora, notes start at the vowel, snapped to sixteenths,
  pitch from the vowel's median, and the original pitch curve stored for the render.
  f0.npz / grid.npy come from `synthv/scripts/transcribe/{f0,tempo}.py`, stems from `separate.sh`.
- `to_ustx.py project.json out.ustx [--inst inst.wav] [--singer rei="足立レイ"] [--resampler corrupt=moresampler.exe]`
  - OpenUtau project: notes, kana lyrics, original pitch as a PITD curve, instrumental track.

## Voicebank notes

- Respect each bank's readme/terms (often in `利用規約` or readme.txt) before using it.
- Adachi Rei (missile39): synthetic sine-wave voice, samples only 0.6 s, so long notes loop.
  Free for fan works paid or free; corporate commercial use needs contact. Her guide rates
  moresampler/TIPS/f2resamp best and world4utau bad.
- Corrupt-Chan (mono23): glitched game audio, mostly unpitched noise; her creator says only
  Moresampler or hifisampler, never resampler.dll/worldline. Use `force_f0` around 280 Hz with the
  built-in resampler. No commercial use, and no use with AI-generated songs or images: her creator
  allowed AI-assisted tuning only when a person monitors it (the user listens and gives notes).
