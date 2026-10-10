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
- **English ARPAbet diphone banks such as CASE** (phonemizer "(English) ARPAbet diphone"): aliases
  like `- ay`, `t ay`, `ay k`, `ey ay`, `ay -`, bare `ay`; alternate takes (`t ay1`...) are used when the
  plain alias is missing. Selected automatically when such a bank is loaded. Same lyric input as below, plus bare
  consonant+vowel syllables like `ku`, `ba`, `shi` (read as `k uw`, `b aa`, `sh iy`), and exact aliases typed
  with a space (`ay k`). Checked against CASE's `oto.ini`
  (`__tests__/fixtures/case-oto.txt`, alias names and timings only): about 1.6% of syllables in a
  sample of 3,000 dictionary words had no matching CV alias. Phrase-initial `- C` and `C C`
  pieces are not used.
- **English VCCV / VCV voicebanks** (phonemizer "(English) VCCV / VCV", selected automatically when a
  CZ-SAMPA-style bank with aliases like `@ t`, `I t`, `-ba` is loaded; otherwise pick it in the
  Phonemizer menu): a port of the alias
  conventions of OpenUtau's *English VCCV Phonemizer* (`-ba`, `ba`, `a b`, `at-`, `aa`; CZ-SAMPA
  symbols), using CMUdict (`public/dict/cmudict-en.txt`, loaded on first use, then cached offline).
  Type a word on its first note and `+` on the notes for further syllables, e.g. `hello` `+`.
  Use `[hh ah l ow]` (or just `hh ah l ow`, three or more tokens) to give ARPAbet pronunciations, and
  `!alias` to force an exact alias. Punctuation around a word (`hello,`) is ignored.
  Differences from OpenUtau: one CV plus one trailing VC per note (consonant clusters are
  simplified to the first and last consonant), no ConVel, no YAML dictionary/replacement files,
  and unknown words use a crude spelling-based guess instead of OpenUtau's neural G2P.
- **VCCV-style `.ust` on an ARPAbet CVVC bank**: a UST sequenced one piece per note for an English VCCV bank
  (`-dhA`, `A s`, `sA`, `_ra`, `em-`) is converted when imported while the ARPAbet phonemizer is active:
  CV/VC pieces become the bank's names (`dh ey`, `ey s`), vowel-only pieces are merged into the previous note,
  and pieces the bank has no sound for (consonant clusters, `w`/`y` glide endings) become rests. Timing values
  saved for the other bank are dropped. Tested against Cyn English; symbols follow OpenUtau's VCCV table plus
  `&`=ae, `0`=er, `1`=ih, `x`=ah. Plain English-word USTs are never touched.
- **Japanese (kana) songs**: on import, OpenUtau's `+` hold is merged into the previous note and kana the voicebank
  lacks (`を`, `うぃ`, `てぃ`, `ふぁ`...) are swapped for the closest romaji or kana alias it has. `っ` stays a short silence.
  Only one track of a multi-track `.ustx` is imported: the one named `main` or `lead`, otherwise the first.
- **Chinese lyrics** (one hanzi per note) are converted on import to the bank's toneless pinyin aliases (`!hua`, `!ya`), reading
  multi-character words in context (`悲痛` = bei tong, `境地` = jing di) via `pinyin-pro`, which is loaded only when a song contains
  Chinese. `ao`/`er` use `ao_zh`/`er_zh` when the bank has them.
- **Sparse diphone banks**: when an English CV/VC sound is missing from the bank (e.g. CASE has no `s aw`, `f uh`, `v aa`), the
  English ARPAbet phonemizer now uses the nearest vowel instead of going silent. Curly apostrophes (`I’d`) are read like straight ones.
- **Lower High Notes** (Batch Process menu): drops every note above a chosen ceiling (F4 to G5, default D5) by whole
  octaves until it fits. Note names stay the same and per-note pitch curves are untouched; rests are ignored. Undoable.
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

## Using it without uploading anything
Everything runs in your browser: voicebanks, projects and rendered audio stay on your computer.
Run it locally (`npm run dev`, or serve `dist/` after `npm run build`), or publish `dist/` as a static
site. `.github/workflows/build.yml` deploys it to GitHub Pages whenever `main` is pushed
(enable Pages from the `gh-pages` branch in the repository settings).
The upstream Google Analytics tag was removed; the app sends no usage data.
