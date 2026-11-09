# Signaling MV (Corrupt-Chan × Ping)

An original music video for the UTAU cover in `../signaling-rei-corrupt.zip`, rendered in
three.js from the zip's own files. The camera work, stage, story and choreography are all made
here. Nothing is taken from the song's official video.

- **Corrupt-Chan** is the fan-build model from the zip, built by its own `cc_build.js`.
- **Ping** is an original character made for this video. She performs the Adachi Rei vocal track.
  She is built from the same two CC0 VRoid samples, the other way round from Corrupt-Chan:
  Sendagaya Shino's body and outfit with Darkness Shibu's bob haircut, all recoloured. She has a
  floating signal-bar halo and two radio fins that send out arcs while she sings. See
  `src/ping.js`.
- Each character lip-syncs to her own vocal stem. The dance moves, camera cuts, glitches and
  lights follow the beat grid and sections found in the full mix.

**Story:** the two singers start in separate "dimensions": a magenta, glitchy half and a blue,
clean half. They pick up each other's signal in the verses and merge for each chorus. In the
bridge they drift apart and reach for each other, then they close the song together. No lyrics
are shown.

## Render it

You need Node 20+, Python 3 with numpy, ffmpeg, and Playwright's Chromium (a GPU isn't
needed; headless SwiftShader works).

```
cd mv
npm install
unzip ../signaling-rei-corrupt.zip -d assets      # assets/signaling/...
python3 analyze.py                                 # build/analysis.json (beats, sections, lip sync)
node render.mjs --jobs 2                           # out/signaling-mv.mp4 (1280x720, 30 fps)
```

Other modes:

- `node render.mjs --from 30 --to 42`: render a slice, in seconds.
- `node render.mjs --stills 12,33.5,150`: save PNG stills.
- `node render.mjs --poses wave,point`: a pose test sheet for dance moves.
- `node render.mjs --serve`: serve the live preview (`index.html`, plays the audio, needs a
  GPU for real time).

Encoding options: `--crf 20` and `--maxrate 4M` (defaults).

## Files

| file | what it does |
| --- | --- |
| `analyze.py` | tempo (150 BPM), beat grid, bar energy, who sings each bar, per-frame loudness and vowel guesses for lip sync, spectrum bands |
| `src/timeline.js` | song sections by bar, and lookups into the analysis |
| `src/ping.js` | builds Ping |
| `src/dance.js` | pose model and the dance moves (beat-synced, mirrored for the duet) |
| `src/director.js` | storyboard: formation, choreography per bar, shot list, cameras, flashes, glitches, grading |
| `src/stage.js` | split sky, floor that ripples with each voice, visualizer ring, towers, cubes, beams, the link beam |
| `src/post.js` | glow, chromatic aberration, block glitches and "missing texture" blocks, scanlines, fades, split-screen line |
| `src/hud.js` | broadcast overlay, title card, name tags, credits |
| `render.mjs` | headless renderer and ffmpeg mux |

## Credits

| | |
| --- | --- |
| Music | 次元通信 (Signaling) by AnythingBecomeMoe |
| Vocals (UTAU cover) | Adachi Rei (missile39), Corrupt-Chan (mono23) |
| Corrupt-Chan 3D | fan build by bryanbr0 |
| Base models | VRoid samples "Darkness Shibu" and "Sendagaya Shino" (CC0) |
