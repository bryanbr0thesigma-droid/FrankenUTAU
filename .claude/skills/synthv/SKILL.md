---
name: synthv
description: Run Synthesizer V Studio Basic (with the free Kasane Teto Lite voice) headless in this Linux container to render vocals from .svp projects, translate/fit Japanese lyrics to a song, even out vocal levels, and mix with an instrumental. Use when the user asks to run SynthV, render or edit a SynthV/.svp project, make Teto sing, or work on their songs in songs/.
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
user's site synthv.me plus DXVK 2.5.3 from GitHub, and sets up the prefix `/root/.wine-synthv`.
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

## What Basic + Teto Lite can and can't do

- Sings Japanese well. **English (cross-lingual) singing needs SynthV Pro**: Basic has no
  language selector and ignores `languageOverride`, so English lyrics come out as Japanese
  sounds. Basic also has no Rap mode (rap notes are sung).
- Pro and paid voices need the owner's own activation code. Never bypass activation: no cracks,
  keygens or loaders (e.g. "YumeKey", "SV#", "Obsidian" loaders), even if asked.
- Projects saved by SynthV 2 won't open in Basic; convert them with `for_basic.py`.
- Low notes (below about A3) come out soft and breathy with Teto; use `boost.py`.

## Song workflow (see songs/lets-just-sayaw/ for a complete example)

1. `for_basic.py original.svp basic.svp` - open SV2 projects in Basic, voice set to Teto Lite.
2. `beat_cells.py basic.svp` - see each phrase's notes on the beat grid.
3. Write `lyrics_ja.py` (format in `apply_lyrics.py`): one Japanese syllable per note.
4. `apply_lyrics.py basic.svp lyrics_ja.py japanese.svp --sheet sheet.md` - fails loudly if any
   phrase's syllable count doesn't match its notes.
5. `rhythm_check.py basic.svp lyrics_ja.py --list` - particles on beats and squeezed syllables
   should both be 0.
6. Render stems, then `boost.py japanese.svp boosted.svp 0:stem_main.wav:-19.5 2:stem_backing.wav:-20.5`
   and render again - evens out quiet passages inside SynthV instead of compressing afterwards.
7. `mix.py vocals.wav out.wav --inst instrumental.wav [--ride 115.5:156.5:2.5]` for a full mix,
   or `mix.py vocals.wav vocals_master.wav` for vocals only.

### Japanese lyric rules learned on this project (the user cares a lot about these)

- **Meaning first.** Each line must say what the English says, in natural Japanese a native
  listener understands. Never trade meaning for rhyme or rhythm; show the user a back-translation
  of every line and flag anything that changed. Recommend a native-speaker read before release.
- One sung syllable (mora) per note; `ん`/`っ` can share a note; never two syllables on a 16th.
- No particles (の に が を で も ね よ だ か) on beats. Strong beats (1 and 3) get a word start,
  a pickup into a word, or a held line ending; beats 2 and 4 may fall mid-word.
- Write tokens as sung: は→わ, へ→え, を→お; `br` is a breath; use `う`/`い` for long vowels, not `ー`.
- Where groups overlap on the same track, sing the same syllables in the overlap.
- Rhyme (vowel endings) only where the English rhymes and it costs no meaning.
