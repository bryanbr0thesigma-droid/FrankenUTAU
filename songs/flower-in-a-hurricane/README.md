# Flower In A Hurricane: BAKO & Puresu cover

A cover of Justice's "Flower In A Hurricane" (ft. Tame Impala, SZA, King Gizzard & the Lizard Wizard, from GTA VI),
sung by the English (Arpasing) versions of **BAKO** (Xbox) and **Puresu** (PlayStation) from Voice-2-utau.

| File | What it is |
| --- | --- |
| `flower-in-a-hurricane-bako-puresu-cover.mp3` | the cover: our banks over the UVR5 instrumental |
| `flower-in-a-hurricane-bako-puresu-acapella.mp3` | just BAKO and Puresu |
| `flower-in-a-hurricane-uvr5-vocals.mp3` | the original vocals isolated with UVR5 (for comparing) |

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
| 1:05–1:09 | Parker | Parker |
| 1:09–1:18 | SZA | Parker |
| 1:18–1:21 | Parker | Parker |
| 1:21–1:35 | SZA | Parker |
| 1:35–1:42 | — | Parker (this line is on the backing track) |
| 1:42–1:51 | Parker | Parker |
| 2:06–2:20 | SZA | Parker |
| 2:29–2:37 | SZA | Parker |
| 2:37–2:41 | Parker | Parker |
| 2:41–2:59 | SZA | Parker |
| 2:59–3:15 | Parker | Parker (3:14–3:18) |

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
2. **Lyrics.** Whisper (large-v3-turbo, `tools/words.py` / `tools/words2.py`) is unreliable on this song: it
   invents lines ("thank you") and changes words between passes. So the lyric sheet is reconciled by hand from several
   passes, with the four chorus repeats checked against each other and anything invented dropped. The sheet is not
   stored in the repo.
3. **Timing (`follow2.py align`).** CMUdict phonemes of the sheet are force-aligned with a wav2vec2 phoneme model
   (xlsr-53 espeak), separately on the lead stem and on the backing stem (`tools/stem_sheets.py` picks the lines each
   stem sings), so each voice keeps its own timing. It is a segmental aligner, not plain CTC: a vowel absorbs the
   blank frames, so a held note stays on its vowel instead of the next word's consonant being pulled into it. Priors
   do the rest: vowels want voiced, loud frames and start on a note change or an attack (pitch step, spectral
   onset); s/t/k/f want unvoiced frames; a pause is anything 10–20 dB below the phrase around it. Vowels last at
   least 60–80 ms.
4. **Pitch.** Praat's autocorrelation tracker on the lead vocal, every 5 ms, with octave errors folded back
   (`follow.py pitch`).
5. **Singing (`follow2.py render`).** Each phrase becomes Arpasing units (`- k`, `k ae`, `ae t`, `t -` ...). Each
   unit's sample (WORLD analysis from Voice-2-utau's engine) is placed so its preutterance point lands exactly on the
   phoneme's start; when the sound before it is short, the lead-in is squeezed, never shifted. The pitch is the
   singer's own curve, not note numbers, and a phrase's last note is held as long as the singer holds it.
   **Expression**: each part then follows its original voice the way a tuner draws dynamics and tension: loudness
   syllable by syllable (30 ms), and brightness (1–5 kHz against the lows, at half depth), so where the singer
   pushes, the bank pushes; the banks' duller tone is brought up to the singers' on average.
6. **Mix.** `tools/mix.py`: each part follows its original's phrase loudness (lead parts the lead stem, Parker's
   harmony the backing stem), gets a high-pass, a presence lift and a short room, and is levelled to where that
   original part sat; the vocal bus and the master are peak-limited.

Checks (`tools/diag.py`, `tools/lag.py`, `tools/evalr.py`), against the isolated original vocals: the banks sing during
96 % of the original's sung time, start within a median of 10 ms of it, follow the pitch to 4–5 cents in the same
octave, follow its loudness with a correlation of 0.92 (0.94 for the lead parts) over the same 16 dB range, and match
its brightness within a dB; a phoneme recogniser reads them about as well as the isolated original. The banks themselves are fully synthesised (console sounds over a formant voice), so they will
never be as clear as a recorded singer.

Not included: two unworded stretches at 2:20–2:25 and 3:14–3:17 that sound like flat synth tones rather than voice,
and the short tag at 3:26–3:29, which no transcription pass could make out.

### Rebuild

```bash
pip install "audio-separator[cpu]" audioread pyworld praat-parselmouth transformers cmudict
tools/separate.sh song.mp3 stems
python tools/follow.py pitch stems/vocals.wav pitch.npy
python tools/follow.py pitch stems/lead.wav pitch_lead.npy
python tools/follow.py pitch stems/backing.wav pitch_back.npy
# lyrics.json: {"sections": [{"t0", "t1", "lines": [...]}]}, written from the Whisper passes (tools/words2.py)
python tools/follow2.py align stems/vocals.wav pitch.npy lyrics.json phones_vocals.json
python tools/stem_sheets.py lyrics.json phones_vocals.json pitch_lead.npy pitch_back.npy .
python tools/follow2.py align stems/lead.wav pitch_lead.npy sheet_lead.json phones_lead.json
python tools/follow2.py align stems/backing.wav pitch_back.npy sheet_backing.json phones_back.json
python tools/fetch_refs.py refs && audio-separator refs/*.mp3 -m Kim_Vocal_2.onnx --single_stem Vocals --output_dir refs/voc
python tools/voiceid.py refs/voc voiceid.json stems/lead.wav stems/backing.wav
python tools/make_cast.py phones_lead.json phones_back.json pitch_lead.npy pitch_back.npy voiceid.json tools/cast
# banks/BAKO_EN and banks/Puresu_EN unzipped from Voice-2-utau's banks/; V2U=path to a Voice-2-utau checkout
python tools/follow2.py render phones_lead.json pitch_lead.npy tools/cast/cast_sza_lead.json sza.wav stems/lead.wav
python tools/follow2.py render phones_lead.json pitch_lead.npy tools/cast/cast_parker_lead.json parker.wav stems/lead.wav
python tools/follow2.py render phones_back.json pitch_back.npy tools/cast/cast_parker_harm.json harmony.wav stems/backing.wav
MIX_PRESENCE=0 python tools/mix.py stems/instrumental.wav stems/lead.wav cover.wav sza.wav:2 parker.wav:2 harmony.wav:0:0.25:stems/backing.wav
```
