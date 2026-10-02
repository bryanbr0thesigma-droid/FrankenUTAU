# FrankenUTAU

A browser-based UTAU editor/synthesizer: the [UTAlet/TSURU](https://github.com/HTMLToolkit/utalet)
web app (WORLD-based UTAU rendering in WebAssembly, PWA, fully offline) extended to
work with [OpenUtau](https://github.com/openutau/OpenUtau) projects.

## Why not run OpenUtau itself?
OpenUtau is a .NET/Avalonia desktop app that depends on native resampler binaries
(worldline), so it can't simply be hosted as a website. FrankenUTAU instead keeps
UTAlet's in-browser engine and adds OpenUtau compatibility on top.

## What works
- Load a UTAU voicebank (zip), edit notes, render and download audio — all in the browser.
- Open `.ust` **and OpenUtau `.ustx`** projects (notes, lyrics, pitch, tempo changes, vibrato).
- Japanese CV and VCV voicebanks: the default phonemizer picks `- あ` / `a い` style VCV aliases and falls back to CV (other phonemizers: Auto, Presamp, Romaji, in the Phonemizer menu).
- **English VCCV / VCV voicebanks** (phonemizer "(English) VCCV / VCV"): a port of the alias
  conventions of OpenUtau's *English VCCV Phonemizer* (`-ba`, `ba`, `a b`, `at-`, `aa`; CZ-SAMPA
  symbols), using CMUdict (`public/dict/cmudict-en.txt`, loaded on first use, then cached offline).
  Type a word on its first note and `+` on the notes for further syllables, e.g. `hello` `+`.
  Use `[hh ah l ow]` to give ARPAbet pronunciations, and `!alias` to force an exact alias.
  Differences from OpenUtau: one CV plus one trailing VC per note (consonant clusters are
  simplified to the first and last consonant), no ConVel, no YAML dictionary/replacement files,
  and unknown words use a crude spelling-based guess instead of OpenUtau's neural G2P.
- Save as `.ust` or `.ustx` (opens in OpenUtau).
- Not carried over from `.ustx`: OpenUtau expressions, phonemizer overrides, extra tracks, curves.

## Run
```
npm install
npm run dev      # development server
npm run build    # static site in dist/ (deploy anywhere, e.g. GitHub Pages)
npm test
```
Node 20+. See `README.upstream-utalet.md` for the upstream project's notes.

## Roadmap ideas
Port OpenUtau phonemizers, pitch/expression curves from USTX, and multi-track import.
