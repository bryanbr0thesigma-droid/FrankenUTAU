# Harlequin Contraption: Tsurumaki Maki cover

A cover of Vane Lily's "Harlequin Contraption", sung by **Tsurumaki Maki AI (ENG Lite)** in Synthesizer V Studio
Basic, using the song's SynthV project (originally voiced by Kasane Teto) and its instrumental.

| File | What it is |
| --- | --- |
| `harlequin-contraption-maki-cover.mp3` | the cover: Maki over the mastered instrumental |
| `harlequin-contraption-maki-acapella.mp3` | Maki only, all seven parts |
| `harlequin-contraption-lyric-video.mp4` | lyric video: the cover with the lyrics on a black screen |

The SynthV project and the instrumental came from a shared folder and are not in this repo.

## Lyric video

The video is text on black, nothing else:

* It opens with a disclaimer: "I changed some of the lyrics in this cover for religious reasons."
* Then the title appears.
* The lyrics are karaoke style: each word turns gold as Maki sings it, the next line shows smaller below, and the
  whispered lines are lilac and italic. The rewritten lines appear as sung.
* The credits at the end repeat the disclaimer.

`tools/lyric_times.py` times every line of the lyrics file to the project's notes (all 79 lines matched word for word)
and writes `lyrics.json`. `tools/lyric_video.py lyrics.json cover.wav out.mp4` burns the subtitles in with ffmpeg
(libass), which takes about 30 seconds.

## Changed lines

The lines about sacrifice are rewritten. The new words go on the same notes in the same rhythm, in the lead and in
the harmony that doubles it (`tools/edit_lyrics.py`):

| Original | Cover |
| --- | --- |
| Reduce this crowd to sacrifice | Invite this crowd to dance tonight |
| Purge thy body and thy mind | Free thy body and thy mind |
| Seduce this soul in sacrifice | Lift up this soul into the light |

Every other line is as written.

## Fixes after listening

`tools/fix_whisper_fall.py`:

* **2:38, first "keep dancin', Harlequin contraption":** this line moved from Main 2 to the Whisper track, so it is
  whispered like the verse 2 lines. The Whisper track has full breathiness and voicing at 0. The repeat at 2:42 stays
  sung.
* **3:11, the long "woah" at the end:** the note now slowly loses its pitch, like a wind-up toy running down. It holds
  for a moment, then sinks, slowly at first and faster toward the end, one octave down by the end of the note. The
  lead and all three harmonies follow the same curve, so the chord sinks together. Measured on the render, the lead
  goes from G#5 to about A4 by 3:19.

## How it was made

1. `for_basic.py` converted the project for SynthV Basic and moved all seven tracks (Main 1, Main 2, Whisper, three
   harmonies, yell) from Teto to Maki. The project's own tuning, timing and track volumes are kept.
2. `tools/edit_lyrics.py` swapped the words and cleared the old phonemes, so Maki's English dictionary pronounces the
   new ones. It also removed 4 per-note language overrides, because Basic renders those notes silent.
3. Basic only renders 3 tracks at a time, so the song was rendered in three passes (tracks 0-2, 3-5, 6).
   `tools/notecheck.py project.svp 0:main1.wav 1:main2.wav ...` confirmed every note in every track has sound.
4. The passes were summed at the project's track volumes. A gentle compressor went on the vocal bus (3:1, plus a
   peak catch), because the four parts stack their peaks on harmony words like "contraption". The instrumental went
   in 2.5 dB lower so the limiter barely works.
5. `mix.py` set the vocals to the instrumental's loudness. The result is -10.7 LUFS, close to the instrumental's
   own -10.5 LUFS master.

Tsurumaki Maki Lite is AHS's free voice and not for commercial use. Check AHS's terms before releasing this anywhere.
