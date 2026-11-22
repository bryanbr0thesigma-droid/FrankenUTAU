# Flower In A Hurricane: BAKO & Puresu cover

A cover of Justice's "Flower In A Hurricane" (ft. Tame Impala, SZA, King Gizzard & the Lizard Wizard, from GTA VI),
sung by the English (Arpasing) versions of **BAKO** (Xbox) and **Puresu** (PlayStation) from Voice-2-utau.

| File | What it is |
| --- | --- |
| `flower-in-a-hurricane-bako-puresu-cover.mp3` | the cover: our banks over the UVR5 instrumental |
| `flower-in-a-hurricane-bako-puresu-acapella.mp3` | just BAKO and Puresu |
| `flower-in-a-hurricane-uvr5-vocals.mp3` | the original vocals isolated with UVR5 (for comparing) |
| `flower-in-a-hurricane-mv-480p.mp4` | a basic MV (480p, small enough for jsDelivr) |
| `flower-in-a-hurricane-mv.mp4` | the same MV at 720p |

## MV

A simple 2D scene (`mv/flower.html`, `mv/src/flower/main.js`): a Vice-City sunset over the sea, palms, a hurricane
that builds through the song, rain and a hibiscus in the wind, and BAKO (green) and Puresu (blue) as two glowing
screen-faced characters that light up and pulse when each one sings (envelopes of the rendered parts,
`mv/assets/flower/data.json`; Puresu dims for harmony). Title card and credits. Rendered with
`node mv/render.mjs --page flower --audio cover.wav --jobs 3`.

## Casting: BAKO is SZA, Puresu is Kevin Parker

Only two people sing on the track: Kevin Parker (Tame Impala) and SZA. King Gizzard & the Lizard Wizard are credited
for guitar and co-writing. So the two banks take the two voices:

* **BAKO = SZA**, at her pitch (BAKO's samples sit at C4; her lines run C#4–G#4).
* **Puresu = Kevin Parker**, at Parker's own pitch (his falsetto, well above Puresu's B2 samples): his lead lines, and
  his harmony under SZA, which follows the backing stem's pitch (mostly a third below her, a sixth below in the
  bridge, a third above his own lead at 1:42).

Who sings what, worked out from the audio (see below):

| Time | Lead | Harmony |
| --- | --- | --- |
| 1:05–1:09 | SZA (melody) and Parker (a third below), from both tracks | — |
| 1:09–1:18 | SZA | Parker |
| 1:18–1:21 | Parker | Parker |
| 1:21–1:35 | SZA | Parker |
| 1:35–1:46 | Parker (solo, from the backing track) | — |
| 1:46–1:51 | Parker | Parker |
| 2:06–2:16 | SZA | Parker |
| 2:17–2:22 | SZA ("I'll live it to the very last breath", held) | — |
| 2:29–2:37 | SZA | Parker |
| 2:37–2:41 | Parker | Parker |
| 2:41–2:59 | SZA | Parker |
| 2:59–3:15 | Parker | — |

The word-by-word version is `tools/cast/casting.txt`; the cast files are `tools/cast/cast_*.json`.

### Telling the singers apart

`tools/fetch_refs.py` takes Deezer's public 30-second previews of six solo SZA songs and six Tame Impala songs (plus
four King Gizzard songs as a control); UVR5's Kim Vocal 2 isolates their vocals. `tools/voiceid.py` turns 3-second
windows into WavLM speaker embeddings and checks itself first, leave-one-song-out: it names SZA on 6/6 unseen songs
and Parker on 5/6 (King Gizzard only 2/4, mostly confused with Parker, another male psych voice). Then it scores
every window of the lead and backing stems. The lead stem is mostly SZA with Parker's sections in between; the
backing stem is male almost throughout, which is Parker's harmony under her. `tools/make_cast.py` casts each word by
the windows around it, folds runs shorter than 1.5 s into their neighbours, and writes the cast files; the renderer
splits a phrase where the singer changes.

## How it was made

1. **Separation (UVR5 models).** `tools/separate.sh` runs the UVR5 model files through python-audio-separator on the
   CPU: BS-Roformer Viperx 1297 for vocals and instrumental, then Mel-Roformer Karaoke (aufr33/viperx) to split the
   vocals into lead and backing.
2. **Lyrics.** The official lyrics (Whisper, `tools/words.py` / `tools/words2.py`, got several lines wrong: "All the
   crashes" for "Thunder crashes", "I'll be there" for "I'll live it", "rising to" for "rise into"). The background
   ad-libs ("Oh", "uh-huh", "an end") are left out. The sheet is not stored in the repo. "Live" is sung "liv" (the
   dictionary's first reading is the adjective).
3. **Timing (`follow2.py align`).** CMUdict phonemes of the sheet are force-aligned with a wav2vec2 phoneme model
   (xlsr-53 espeak), separately on the lead stem and on the backing stem (`tools/stem_sheets.py` picks the lines each
   stem sings, by loudness: a line the karaoke split put on the backing stem, like the opening one, leaves only faint
   bleed on the lead, and aligning words to bleed scrambles them), so each voice keeps its own timing. Lines only the
   backing stem carries (1:05, 1:35, 1:42) are sung solo from it, at lead level. It is a segmental aligner, not plain CTC: a vowel absorbs the
   blank frames, so a held note stays on its vowel instead of the next word's consonant being pulled into it. Priors
   do the rest: vowels want voiced, loud frames and start on a note change or an attack (pitch step, spectral
   onset); s/t/k/f want unvoiced frames; a pause is anything 10–20 dB below the phrase around it. Vowels last at
   least 60–80 ms. A note change of the original (CREPE: a step of 80+ cents) pulls a syllable start onto it and
   makes holding one vowel through it expensive, so the banks do not hang on a note and then rush the next syllables.
   Which vowel may carry a long note: stressed ones most easily, unstressed ones a little less, function words ("in",
   "a", "the" ...) hardly ever. Lines only the backing stem carries are aligned one by one in their own windows
   (`tools/solo_duet.py`); where the lead stem still carries a voice within 8 dB (the opening), it is a duet with
   SZA's melody on top. "I'll live it to the very last breath" is timed from the word starts the recogniser reads off
   the full vocal (`tools/anchor_align.py` and by hand), since the aligner kept holding the wrong vowel there.
4. **Pitch.** CREPE (full model, Viterbi decoding) on each stem, every 5 ms (`tools/crepe_pitch.py`). The first
   versions used Praat's autocorrelation tracker, which on the separated backing stem fell to subharmonics in 18 % of
   its frames (E2 or A2 where the singer holds E4), so the backing-track lines were badly out of tune.
5. **Singing (`follow2.py render`).** Each phrase becomes Arpasing units (`- k`, `k ae`, `ae t`, `t -` ...). Each
   unit's sample (WORLD analysis from Voice-2-utau's engine) is placed so its preutterance point lands exactly on the
   phoneme's start; when the sound before it is short, the lead-in is squeezed, never shifted. Neighbouring
   units are cross-faded (the single-pass synthesis tried here sounded worse and was dropped). Consonants are timed the
   UTAU way (`retime`): each vowel stays on its note, and the consonants before it get natural lengths (stops and
   nasals ~70 ms, s/f/sh ~100 ms) taken from the end of the previous vowel; a phoneme aligner on its own gives every
   consonant its 40 ms minimum, which crushed them ("hurricane" came out as "hair-uh-qu-tea"). On a long note the
   vowel's attack (the first 60 % of the sample) plays at its own speed and only the steady end stretches; stretching
   the whole sample made every long note creep in (the banks' vowels swell) and then snap to the next syllable. The pitch is the
   singer's own curve, not note numbers, and a phrase's last note is held as long as the singer holds it, but never
   through a change to another note and never into the other singer's turn.
   **Pitch clean-up** (`tools/clean_pitch.py`): a separated stem's tracker sometimes jumps for a few frames to the
   other singer's note, a harmonic or an octave, which sung back is a yelp; those blips are bridged. Whole stretches
   tracked an octave or two low (9.5 % of the backing curve: Puresu growling below his own range) are folded back
   (`tools/fold_pitch.py`: within an octave of the lead, nothing below B2).
   **Harmony in time** (`tools/harm_phones.py`): where Parker harmonises a line SZA sings, his syllables use her
   timing, so they sing each word together; each of his syllables takes its note from the backing stem (the interval
   to SZA, rounded to a semitone) on her clean contour (`tools/harm_pitch.py`). Only his solo lines keep their own
   timing and curve. The harmony sits 3 dB under the lead.
   **Expression**: each part then follows its original voice the way a tuner draws dynamics and tension: loudness
   syllable by syllable (30 ms), and brightness (1–5 kHz against the lows, at half depth), so where the singer
   pushes, the bank pushes; the banks' duller tone is brought up to the singers' on average.
6. **Mix.** `tools/mix.py`: each part follows its original's phrase loudness (lead parts the lead stem, Parker's
   harmony the backing stem), gets a high-pass, a presence lift and a short room, and is levelled to where that
   original part sat; the vocal bus and the master are peak-limited.

Tuning against CREPE's reading of the original voices: the opening solo is within a semitone 84 % of the time (it was
40 %, 151 cents off on median), the 1:35 solo 96 % (was 49 %), SZA's lines about 90 %.

Checks (`tools/diag.py`, `tools/lag.py`, `tools/spasm.py`, `tools/evalr.py`), against the isolated original vocals:
the banks sing during 94 % of the original's sung time, start within a median of 10 ms of it, follow its loudness
(correlation 0.88, same 16 dB range) and brightness (within a dB); pitch jumps inside held vowels are 2–3 % of the
lead vowels and 13 % of the harmony's (from 6–7 % and 25 %); the harmony spends 0.9 % of its time below 130 Hz (from
5 %), and 93 % of its syllables sit with the lead's.

Not included: two unworded stretches at 2:20–2:25 and 3:14–3:17 that sound like flat synth tones rather than voice,
and the short tag at 3:26–3:29, which no transcription pass could make out.

### Rebuild

```bash
pip install "audio-separator[cpu]" audioread pyworld praat-parselmouth transformers cmudict
tools/separate.sh song.mp3 stems
python tools/follow.py pitch stems/vocals.wav pitch.npy            # Praat curves: voicing priors for the aligner only
python tools/follow.py pitch stems/lead.wav pitch_lead.npy
python tools/follow.py pitch stems/backing.wav pitch_back.npy
python tools/crepe_pitch.py stems/lead.wav pitch_lead_f.npy          # the pitch the banks sing (CREPE), cleaned twice:
python tools/crepe_pitch.py stems/backing.wav pitch_back_f.npy
python tools/clean_pitch.py pitch_lead_f.npy pitch_back_f.npy pitch_lead_f.npy   # lead: blips + bleed check
python tools/clean_pitch.py pitch_back_f.npy pitch_back_f.npy                    # backing: blips only (its solo lines
                                                                                 # leave only bleed on the lead)
# lyrics.json: {"sections": [{"t0", "t1", "lines": [...]}]}, written from the Whisper passes (tools/words2.py)
python tools/follow2.py align stems/vocals.wav pitch.npy lyrics.json phones_vocals.json
python tools/stem_sheets.py lyrics.json phones_vocals.json pitch_lead.npy pitch_back.npy .
python tools/follow2.py align stems/lead.wav pitch_lead.npy sheet_lead.json phones_lead.json
python tools/follow2.py align stems/backing.wav pitch_back.npy sheet_backing.json phones_back.json
python tools/fetch_refs.py refs && audio-separator refs/*.mp3 -m Kim_Vocal_2.onnx --single_stem Vocals --output_dir refs/voc
python tools/voiceid.py refs/voc voiceid.json stems/lead.wav stems/backing.wav
python tools/harm_phones.py sheet_lead.json phones_lead.json sheet_backing.json phones_back.json phones_harm.json phones_solo.json
python tools/solo_sheet.py lyrics.json phones_vocals.json stems sheet_solo.json
python tools/follow2.py align stems/backing.wav pitch_back_f.npy sheet_solo.json phones_solo.json
python tools/make_cast.py phones_lead.json phones_harm.json pitch_lead_f.npy pitch_back_f.npy voiceid.json tools/cast phones_solo.json
# (then: no harmony after 3:13.5, as in tools/cast)
python tools/harm_pitch.py phones_harm.json pitch_lead_f.npy pitch_back_f.npy tools/cast/cast_parker_harm.json pitch_harm.npy
# banks/BAKO_EN and banks/Puresu_EN unzipped from Voice-2-utau's banks/; V2U=path to a Voice-2-utau checkout
python tools/follow2.py render phones_lead.json pitch_lead_f.npy tools/cast/cast_sza_lead.json sza.wav stems/lead.wav
python tools/follow2.py render phones_lead.json pitch_lead_f.npy tools/cast/cast_parker_lead.json parker.wav stems/lead.wav
python tools/follow2.py render phones_solo.json pitch_back_f.npy tools/cast/cast_parker_solo.json solo.wav stems/backing.wav
# the opening line: SZA's melody from the lead stem's pitch on the same timing (cast_sza_duet), as duet.wav
python tools/follow2.py render phones_harm.json pitch_harm.npy tools/cast/cast_parker_harm.json harmony.wav stems/backing.wav
MIX_PRESENCE=0 python tools/mix.py stems/instrumental.wav stems/lead.wav cover.wav sza.wav:2 parker.wav:2 solo.wav:2:0:stems/backing.wav duet.wav:2:0:stems/backing.wav harmony.wav:-3:0.25:stems/backing.wav
```
