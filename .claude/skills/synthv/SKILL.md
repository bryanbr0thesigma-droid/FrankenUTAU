---
name: synthv
description: Run Synthesizer V Studio Basic (with the free Kasane Teto Lite and Tsurumaki Maki ENG Lite voices) headless in this Linux container to render vocals from .svp projects, map a song's vocal from audio into a new .svp (UVR separation, pitch tracking, lyric alignment, tuning), translate/fit Japanese lyrics to a song, even out vocal levels, and mix with an instrumental. Use when the user asks to run SynthV, render or edit a SynthV/.svp project, make Teto or Maki sing, recreate a song in SynthV from an mp3, or work on their songs in songs/.
---

# Synthesizer V in this container

SynthV Studio Basic 1.10.1 (Windows) runs under Wine on a virtual X display (`:99`). You drive
it with keyboard/mouse via `xdotool` and look at it with screenshots (`import -window root
shot.png`, then read the PNG). Scripts are in `scripts/` next to this file.

## Setup (once per container)

```bash
bash .claude/skills/synthv/scripts/install.sh
```

Installs Wine and tools, downloads (checksum-pinned) the Basic installer and Teto Lite from the
user's site synthv.me, Maki ENG Lite from Dreamtonics' download server, plus DXVK 2.5.3 from GitHub,
and sets up the prefix `/root/.wine-synthv`.
Takes a few minutes. Containers get reset, so re-run it in a new session.

Why the odd parts:
- **DXVK `dxgi.dll`**: Wine's own dxgi doesn't implement `WaitForVBlank`, and SynthV's UI (JUCE)
  only repaints on vblank, so without it the window freezes on its first frame and every dialog
  is invisible. `open.sh` loads it with `WINEDLLOVERRIDES=dxgi=n,b` and Mesa's lavapipe Vulkan.
- **Wine virtual desktop (1600x900)**: gives focus and popups without an X window manager.
- **Teto Lite** is installed by unpacking its `.svpk` into `databases/Kasane_Teto_(Lite)/`.

## Run it

```bash
S=.claude/skills/synthv/scripts
$S/open.sh path/to/project.svp          # starts Xvfb + SynthV, dismisses the audio warning
DISPLAY=:99 import -window root /tmp/shot.png   # look at it
```

Launch dialogs, in order: "No audio device" (OK), sometimes "A newer version is available"
(Cancel; never update, the voice and scripts are tested on 1.10.1), then **Telemetry consent**:
decline it (`xdotool mousemove 800 613 click 1`). `open.sh` handles the first two, `bounce.sh`
the last. With the window at its default size: Render panel icon (1416,380),
Settings (1416,476), Voice (1416,188), Note properties (1416,236), "Bounce to Files" (1061,302)
once the Render panel is open beside Voice. Keyboard shortcuts work (Ctrl+O/S/Shift+S, Ctrl+A).
In native file dialogs, click the File name field before typing a path (`winepath -w` gives the
`Z:\...` form). Opening a project from the command line is the most reliable.

## Render audio

```bash
python3 -I $S/render_config.py in.svp out.svp --dir /tmp/render --name take1 --stems
$S/open.sh out.svp && $S/bounce.sh /tmp/render take1 170    # wait ~170 s for synthesis
```

Bounce writes 32-bit float 48 kHz WAVs: `take1_MixDown.wav` and, with `--stems`, one per
vocal track. A full song synthesizes in about 2-3 minutes; bounce after the panel shows 100%.

## Record the editor playing (for "project view" videos)

Playback needs an audio device; with none, the playhead doesn't move. Give Wine a silent one:
`apt-get install -y pulseaudio pulseaudio-utils`, then `pulseaudio -D --exit-idle-time=-1` and
`pactl load-module module-null-sink sink_name=silent && pactl set-default-sink silent`. SynthV
then starts without the "No audio device" dialog (so skip `open.sh`'s dialog clicks).
- For a tall view, set the Wine desktop size before launching (`wine reg add
  'HKCU\Software\Wine\Explorer\Desktops' /v Default /t REG_SZ /d 1080x1300 /f`, then
  `wineserver -k`: the `reg` call itself starts the desktop at the old size), start Xvfb at the same
  size, and double-click the title bar to maximize. Put everything back (1600x900, panels, window
  size) afterwards: the other scripts' click positions assume the default layout.
- Let synthesis finish, then record with `ffmpeg -f x11grab -draw_mouse 0 -framerate 30 ... -f pulse
  -i silent.monitor` while playing from the start (the view pages along with the playhead).
- Sync to song time by the playhead, not the captured audio: the drawn playhead trails the audio
  by about 80 ms. Stop a recorder with `pkill -x ffmpeg`; `pkill -f ...ffmpeg...` matches its own shell.

## Map a song from audio (recreate its vocal as a new .svp)

Scripts in `scripts/transcribe/`, run with their own venv (`setup.sh`, about 1.6 GB; `T=scripts/transcribe`,
`PY=~/.venvs/transcribe/bin/python`). Ask the user for the lyrics; aligning known words beats guessing them.

1. `$T/separate.sh ~/.venvs/transcribe song.mp3 sep/` - UVR models: instrumental, lead, backing (~35 min on CPU).
2. `$PY -I $T/tempo.py sep/song.wav grid.npy` - tempo and beat grid. Find beat 1 yourself (e.g. the
   first big hit after a riser) and choose `--origin-beat` for step 6 so bar lines match.
3. `$PY -I $T/f0.py sep/lead.wav f0.npz`, then `$T/f0fix.py sep/lead.wav f0.npz f0_fix.npz` (CREPE
   reads high passages an octave low; the fix tests harmonics) and `$T/novelty.py sep/lead.wav nov.npy`.
4. `TORCH_HOME=... $PY -I $T/align.py sep/lead.wav lyrics.txt align.json` - word and letter times.
5. `$PY -I $T/transcribe.py f0_fix.npz align.json grid.npy notes.json nov.npy` - notes with lyrics.
6. `$PY -I $T/make_svp.py notes.json raw.svp --voice maki-eng --origin-beat 28`, render it, then tune:
   `$T/dyn_match.py raw.svp raw_render.wav sep/lead.wav LEAD dyn.svp` and (after `f0.py` on the
   render) `$T/pitch_match.py dyn.svp render_f0.npz f0_fix.npz LEAD tuned.svp`; render again. LEAD is
   where the original vocal starts in the project (printed by make_svp, plus any measured lag).
7. Check before sending: `roll.py`/`spec.py` (piano roll and spectrogram pictures), `compare.py`
   (pitch vs original), `dropouts.py` (where the original sings and the render is silent).

What the user heard and what fixed it (all now in `transcribe.py`):
- Voice cutting out mid-phrase: notes ended where pitch stopped, before the sound did. Hold each note
  to the next unless the original really rests; never leave a gap before a "+" or "-" note (SynthV
  leaves it silent).
- Words slammed together: detected starts include the consonant, about 40 ms before SynthV's note
  start (the vowel); shift that out before snapping to the grid.
- Fumbled chorus: fully legato notes on one pitch smear repeated words ("more, more, more"). Put a
  32nd break before a word where the original dips 12 dB for 50 ms, but only after soft endings
  (vowel, r, l, m, n); a hard final consonant separates itself, and an early end lets it eat the vowel.
- "Sounds like UTAU": untuned. `pitch_match.py` and `dyn_match.py` copy the original's pitch and
  loudness movement (measured against a render, since SynthV adds its own pitch on top).
- New lyrics on the mapped melody (e.g. a Japanese version): copy the pitch only. The original's level
  dips at its own consonants, which land on the new vowels; copying it made Teto sound like she was
  leaning away from and back to the mic. Even levels with `boost.py` (whole notes, never cuts) instead.
- "Sounds strained" (the 1-2-3-4 count, starts of lines): boosts of 8-12 dB push SynthV's voice, and
  breathy syllables (ひ, ふ) measure quiet without being weak. Cap boosts (`0:stem.wav:-19:4`) and lift
  quiet passages in the mix (`mix.py --ride`) instead; run `pitch_match.py --ease-ms 150
  --attack-cents 60` so the original's scoops don't bend the new words' attacks.

## What Basic + Teto Lite can and can't do

- For English, use **Tsurumaki Maki AI (ENG Lite)**: an English voice sings English natively in Basic
  (Lite voices from AHS may not allow commercial use; check AHS's terms before release).
- Teto sings Japanese well. **English (cross-lingual) singing needs SynthV Pro**: Basic has no
  language selector and ignores a track's `languageOverride`, so English lyrics come out as
  Japanese sounds. A **per-note** override (e.g. Mandarin lines, `phonesetOverride: xsampa`)
  renders as silence; `apply_lyrics.py` clears them. Basic also has no Rap mode (rap notes are
  sung). After a render, check every note has sound (see `boost.note_db`).
- Pro and paid voices need the owner's own activation code. Never bypass activation: no cracks,
  keygens or loaders (e.g. "YumeKey", "SV#", "Obsidian" loaders), even if asked.
- Projects saved by SynthV 2 won't open in Basic; convert them with `for_basic.py` (it also moves
  per-group voices onto the track, since Basic only reads the track's voice).
- **Basic only renders the first 3 tracks** of a project. For more, render in passes with
  `render_config.py --tracks 0,1,2` / `--tracks 3,4` and add the stems up with `sum_stems.py`.
- Low notes (below about A3) come out soft and breathy with Teto; use `boost.py`.

## Song workflow (see songs/lets-just-sayaw/ for a complete example)

Ask before committing someone else's project or instrumental to the repo.

1. `for_basic.py original.svp basic.svp` - open SV2 projects in Basic, voice set to Teto Lite.
2. `beat_cells.py basic.svp` - see each phrase's notes on the beat grid.
3. Write `lyrics_ja.py` (format in `apply_lyrics.py`): one Japanese syllable per note. If a line
   needs one more syllable than it has notes, list a split of a long held note (a quarter or
   more, into eighths at the same pitch, on every harmony group that sings the line) in the
   module's `SPLITS`; `apply_splits.py basic.svp lyrics_ja.py split.svp` applies them.
4. `apply_lyrics.py split.svp lyrics_ja.py japanese.svp --sheet sheet.md` - fails loudly if any
   phrase's syllable count doesn't match its notes.
5. `rhythm_check.py split.svp lyrics_ja.py --list` - particles on beats, squeezed syllables and
   crammed notes (two different syllables on one note, e.g. かけ) should all be 0.
6. Render stems, then `boost.py japanese.svp boosted.svp 0:stem_main.wav:-19.5 2:stem_backing.wav:-20.5`
   and render again - evens out quiet passages inside SynthV instead of compressing afterwards.
   Pick each target near that stem's loud notes (about its 95th-percentile note level).
7. With several vocal tracks, balance them with `sum_stems.py vocals.wav main.wav high.wav:-6 ...`
   (keep harmonies a few dB under the lead so the words stay clear; Teto's octave-up harmonies
   render much louder than a low lead).
8. `mix.py vocals.wav out.wav --inst instrumental.wav [--ride 115.5:156.5:2.5]` for a full mix,
   or `mix.py vocals.wav vocals_master.wav` for vocals only.

### Japanese lyric rules learned on this project (the user cares a lot about these)

- **Meaning first.** Each line must say what the English says, in natural Japanese a native
  listener understands. Never trade meaning for rhyme or rhythm; show the user a back-translation
  of every line and flag anything that changed. Recommend a native-speaker read before release.
- One sung syllable per note, and never split a note into 16ths or put two different vowels on one
  note: it sounds crammed. A long vowel or `ん`/`っ` can stay inside its syllable's note (write
  long vowels doubled, e.g. `もお` for もう, so the note holds one vowel). Only split long notes
  (a quarter or more) into whole eighths. If the meaning doesn't fit the notes, find shorter
  wording, not more syllables.
- No particles (の に が を で も ね よ だ か) on beats. Strong beats (1 and 3) get a word start,
  a pickup into a word, or a held line ending; beats 2 and 4 may fall mid-word.
- Write tokens as sung: は→わ, へ→え, を→お; `br` is a breath; use `う`/`い` for long vowels, not `ー`.
- Where groups overlap on the same track, sing the same syllables in the overlap.
- Rhyme (vowel endings) only where the English rhymes and it costs no meaning.
- Keep metaphors and refrains literal: translate the image the writer chose ("trying not to bite
  it" stays biting, not the slang "die"), and keep English chant words (sung as loanwords,
  e.g. アップ / ダウン) instead of swapping in a Japanese equivalent. Ask when a phrase has two
  readings.
