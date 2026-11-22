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
* **Puresu = Kevin Parker**, an octave down (Puresu's samples sit at B2): his lead lines, and his harmony under SZA,
  which follows the backing stem's pitch (mostly a third below her, a sixth below in the bridge, a third above his
  own lead at 1:42).

Who sings what, worked out from the audio (see below):

| Time | Lead | Harmony |
| --- | --- | --- |
| 1:05–1:09 | Parker | Parker |
| 1:09–1:34 | SZA | Parker |
| 1:34–1:37 | Parker | Parker |
| 1:42–1:50 | Parker | Parker |
| 2:06–2:18 | SZA | Parker |
| 2:18–2:20 | Parker | Parker |
| 2:29–2:37 | SZA | Parker |
| 2:37–2:41 | Parker | Parker |
| 2:41–2:59 | SZA | Parker |
| 3:01–3:15 | Parker | — |
| 3:28 | — | Parker |

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
2. **Words and timing.** Whisper (large-v3-turbo) gives rough word times (`tools/words.py`); CMUdict turns the words
   into ARPAbet; a wav2vec2 phoneme model (xlsr-53 espeak) force-aligns every phoneme to the lead vocal
   (`follow.py align`). The transcript is not stored in the repo: rerun the step to get it.
3. **Pitch.** Praat's autocorrelation tracker on the lead vocal, every 5 ms, with octave errors folded back
   (`follow.py pitch`).
4. **Singing.** Each phrase becomes Arpasing units (`- k`, `k ae`, `ae t`, `t -` ...), each starting at its phoneme's
   time, and Voice-2-utau's `voice2utau.sing` engine renders them (WORLD), following the singer's own pitch curve
   instead of note numbers (`follow.py render`).
5. **Mix.** `tools/mix.py`: each part follows its original's phrase loudness (lead parts the lead stem, Parker's
   harmony the backing stem), gets a high-pass, a presence lift and a short room, and is levelled to where that
   original part sat; the vocal bus and the master are peak-limited.

Checks (`tools/evalr.py`): the lead parts follow the singer's pitch to a median of 7 cents and the harmony the
backing stem's to 9 cents; a phoneme recogniser reads the lead parts at least as well as the isolated original lead
(the harmony is harder to read, as it is in the original).

Not included: two unworded stretches at 2:20–2:25 and 3:14–3:17 that sound like flat synth tones rather than voice.

### Rebuild

```bash
pip install "audio-separator[cpu]" audioread pyworld praat-parselmouth transformers cmudict
tools/separate.sh song.mp3 stems
python tools/words.py stems/vocals.wav sections.json words.json      # sections.json: {"sections": [[t0, t1], ...]}
python tools/follow.py align stems/lead.wav words.json phones.json
python tools/follow.py pitch stems/lead.wav pitch_lead.npy
python tools/follow.py pitch stems/backing.wav pitch_back.npy
python tools/fetch_refs.py refs && audio-separator refs/*.mp3 -m Kim_Vocal_2.onnx --single_stem Vocals --output_dir refs/voc
python tools/voiceid.py refs/voc voiceid.json stems/lead.wav stems/backing.wav
python tools/make_cast.py phones.json pitch_lead.npy pitch_back.npy voiceid.json tools/cast
# banks/BAKO_EN and banks/Puresu_EN unzipped from Voice-2-utau's banks/; V2U=path to a Voice-2-utau checkout
python tools/follow.py render phones.json pitch_lead.npy tools/cast/cast_sza_lead.json sza.wav
python tools/follow.py render phones.json pitch_lead.npy tools/cast/cast_parker_lead.json parker.wav
python tools/follow.py render phones.json pitch_back.npy tools/cast/cast_parker_harm.json harmony.wav
python tools/mix.py stems/instrumental.wav stems/lead.wav cover.wav sza.wav:1 parker.wav:1 harmony.wav:-1:0.25:stems/backing.wav
```
