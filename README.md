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
