# Signaling MV renderers

Two music videos for the UTAU cover of 次元通信 (Signaling) in `../signaling-rei-corrupt.zip`:

- **The reanimation** (`reanim.html`, `src/re/`, the default): the official MV's storyboard,
  layouts and timing, redone with cel-shaded 3D models of the cover's singers. **Adachi Rei**
  takes Miku's part, in her orange, and **Corrupt-Chan** takes Teto's, in her violet and
  missing-texture magenta. Output: `../signaling-reanimation.mp4`.
- **The original MV** (`index.html`, Corrupt-Chan × Ping), described further down.

Watch the reanimation in a browser (480p copy, served by jsDelivr from this repo):
https://cdn.jsdelivr.net/gh/bryanbr0thesigma-droid/FrankenUTAU@8376d82c6a687cd016d651024386a60ad2fcef39/signaling-reanimation-480p.mp4
Audio alone (MP3), for players that drop the video's sound:
https://cdn.jsdelivr.net/gh/bryanbr0thesigma-droid/FrankenUTAU@8376d82c6a687cd016d651024386a60ad2fcef39/signaling-cover-audio.mp3

## The reanimation

AnythingBecomeMoe's MV is 2D animation. This version keeps its structure shot for shot: the
phone-chat verses, the CRT "monitor" shots with subtitles, the rhythm-game chorus cards, the
grey bridge, the credits. The shot times were measured from the official video, and the cover's
full mix lines up with it at zero offset.

- **Performers.** Adachi Rei is the official 3D model ver1.0.0 by みさいる (Mechanical Girl).
  Corrupt-Chan is the fan build from the zip, made by its `cc_build.js`. Both get hard two-tone
  MToon shading with a lavender shadow tint and a constant-width outline (`src/toon.js`).
- **Animated like drawings.** The original is limited 2D animation, so this one is too. Each
  pose is rendered once into a still "drawing" (`src/re/cels.js`). Like the original's cels, the
  stills are swapped about ten times a second on the beat, shifted around, dropped on the beat
  and squashed. The chorus cycles four key poses per bar, each with a hand-drawn variant, and
  switches to a shout pose on the big words. Props move on the same 10 fps clock.
- **Penlights.** Both singers hold concert penlights (Rei one in each hand, Corrupt-Chan one in
  her right). The same model, scaled up, is the glowstick shot. Corrupt-Chan's raised leg bends
  back behind her so it stays inside her skirt.
- **Verse silhouettes.** As in the original, the sitting singer is a dark silhouette with rim
  lines in her colour and glowing eyes, cut by a hard diagonal of light. A picture flashes up
  behind her on each line: sun, moon, clouds, gears, drips, lightning, glitch bars, the other
  girl's silhouette, and Corrupt-Chan's cracks flooding Rei's panel at the end.
- **Faces.** As in the official MV there is no lip sync: each pose holds a mouth shape. Named
  expressions set the mood, including Rei's own ＞＜, びっくり, 瞳小 and 瞳ハイライト消, and
  Corrupt-Chan's ＞＜ ("Extra").
- **Corrupt-Chan's corruption.** In choruses 2 and 3 her panel renders pixelated with sliced
  glitches, and in chorus 3 her lines arrive faded.
- **Lyrics** are shown as in the official MV: chat bubbles, chorus cards, the typed list of the
  second verse, and subtitles in the monitor shots.

### Render it

You need Node 20+, Python 3 with numpy, ffmpeg, and Playwright's Chromium. A GPU isn't needed,
because headless SwiftShader works. The full video takes about 18 minutes on 4 cores with
`--jobs 3`.

```
cd mv
npm install
unzip ../signaling-rei-corrupt.zip -d assets      # assets/signaling/...
node fetch-rei.mjs                                 # assets/rei/adachi_rei_v1.0.0.vrm (official model)
python3 analyze.py                                 # build/analysis.json (beat grid, voices)
node render.mjs --jobs 3 --crf 22 --maxrate 3M     # out/signaling-reanimation.mp4
```

The Rei model isn't kept in git. Its VRM metadata says redistribution is prohibited, although
the readme packed with it allows it. `fetch-rei.mjs` downloads it from its public BowlRoll page
(https://bowlroll.net/file/204581) and checks the MD5 that page lists.

Other modes: `--from 30 --to 42` renders a slice, `--stills 12,33.5,150` saves PNG stills, and
`--serve` serves the live preview. `node lab.mjs pose:danceA:0 expr:＞＜+aa=0.9 toon:faces
cels:rei:R_V,R_spread` renders model test sheets into `out/`.

### Files

| file | what it does |
| --- | --- |
| `src/re/shots.js` | the shot list with times, the chorus cards (chorus 1 timing, repeated 51.2 s and 107.2 s later), subtitles, the second verse's list |
| `src/re/main.js` | the engine: which drawing each shot shows and how it moves, the shot renderers, prop rendering, the post pass |
| `src/re/cels.js` | drawings: renders and caches a performer in a pose (colour, dark silhouette with rim lines, or flat), penlight glow, eye positions; attaches the penlights |
| `src/re/draw2d.js` | the 2D layer: chat panels and keyboards, chorus rings and lyric cards, subtitles, call screen, drawn props, credits |
| `src/re/props.js` | cel-shaded 3D props: TV (and red TV), reaching hand, concert penlight, handset and flip phone, mug, calendar, box on bird legs |
| `src/re/poses.js` | key poses (verse knee hug, chorus cycles, shouts, close-ups), hand-drawn variants, application to VRM bones |
| `src/re/palette.js` | colours |
| `src/rei.js`, `src/toon.js` | Rei's loader; cel shading, outlines and silhouettes |
| `fetch-rei.mjs` | downloads the official Rei model |
| `lab.html`, `src/lab.js`, `lab.mjs` | model lab: shading, pose and expression test renders |

### Credits

| | |
| --- | --- |
| Music, lyrics, original MV (storyboard, character design, animation) | AnythingBecomeMoe |
| Vocals (UTAU cover) | Adachi Rei (みさいる / Mechanical Girl), Corrupt-Chan (mono23) |
| Tuning, Corrupt-Chan 3D model | bryanbr0 |
| Adachi Rei 3D model | みさいる (Mechanical Girl), ver1.0.0 |
| Corrupt-Chan base models | VRoid samples "Darkness Shibu" and "Sendagaya Shino" (CC0) |

## The original MV (Corrupt-Chan × Ping)

An original music video rendered in three.js from the zip's own files. Its camera work, stage,
story and choreography were all made here, with nothing taken from the official video.
Corrupt-Chan performs with **Ping**, an original character built from the same two CC0 VRoid
samples, who performs the Adachi Rei vocal track (`src/ping.js`). Each character lip-syncs to her
own stem. Render it with `node render.mjs --page index --jobs 2`, which writes
`out/signaling-mv.mp4`. Its modules are `src/director.js`, `src/stage.js`, `src/post.js`,
`src/hud.js` and `src/dance.js`, and `node render.mjs --page index --poses wave,point` renders a
pose sheet.
