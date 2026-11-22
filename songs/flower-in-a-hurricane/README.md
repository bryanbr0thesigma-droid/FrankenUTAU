# Flower In A Hurricane: BAKO & Puresu cover

A cover of Justice's "Flower In A Hurricane" (ft. Tame Impala, SZA, King Gizzard & the Lizard Wizard, from GTA VI),
sung by the English (Arpasing) versions of **BAKO** (Xbox) and **Puresu** (PlayStation) from Voice-2-utau.

| File | What it is |
| --- | --- |
| `flower-in-a-hurricane-bako-puresu-cover.mp3` | the cover: our banks over the UVR5 instrumental |
| `flower-in-a-hurricane-bako-puresu-acapella.mp3` | just BAKO and Puresu |
| `flower-in-a-hurricane-uvr5-vocals.mp3` | the original vocals isolated with UVR5 (for comparing) |

## Casting

| Time | Part | Who |
| --- | --- | --- |
| 1:05–1:37 | first vocal section | BAKO (at the original pitch) |
| 1:42–1:51 | the contrasting passage | Puresu (an octave down) |
| 2:06–2:20 | bridge | Puresu (an octave down) |
| 2:29–3:16 | the first section again | BAKO, with Puresu an octave below |
| 3:26–3:29 | tag | BAKO |

BAKO's samples sit at C4 and the melody runs C#4–G#4, so he sings it as written; Puresu's sit at B2, so he takes it
an octave down. The casting is the `tools/cast_*.json` files (start/end in seconds, bank, transpose).

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
5. **Mix.** `tools/mix.py`: each part follows the original's phrase loudness, gets a high-pass, a presence lift and a
   short room, and is levelled to where the original lead sat; the vocal bus and the master are peak-limited.

Checks (`tools/evalr.py`): the renders follow the singer's pitch to a median of 6–7 cents, and a phoneme recogniser
reads them at least as well as the isolated original lead in every section (the quiet Puresu double excepted).

Not included: the backing harmonies (the original's backing stem is not resung), and two unworded stretches at
2:20–2:25 and 3:14–3:17 that sound like flat synth tones rather than voice.

### Rebuild

```bash
pip install "audio-separator[cpu]" audioread pyworld praat-parselmouth transformers cmudict
tools/separate.sh song.mp3 stems
python tools/words.py stems/vocals.wav sections.json words.json      # sections.json: {"sections": [[t0, t1], ...]}
python tools/follow.py align stems/lead.wav words.json phones.json
python tools/follow.py pitch stems/lead.wav pitch.npy
# banks/BAKO_EN and banks/Puresu_EN unzipped from Voice-2-utau's banks/; V2U=path to a Voice-2-utau checkout
for c in bako puresu_lead puresu_dbl; do python tools/follow.py render phones.json pitch.npy tools/cast_$c.json $c.wav; done
python tools/mix.py stems/instrumental.wav stems/lead.wav cover.wav bako.wav:1 puresu_lead.wav:1 puresu_dbl.wav:-5
```
