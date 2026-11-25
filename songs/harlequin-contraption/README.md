# Harlequin Contraption: Tsurumaki Maki cover

A cover of Vane Lily's "Harlequin Contraption", sung by **Tsurumaki Maki AI (ENG Lite)** in Synthesizer V Studio
Basic, using the song's SynthV project (originally voiced by Kasane Teto) and its instrumental.

| File | What it is |
| --- | --- |
| `harlequin-contraption-maki-cover.mp3` | the cover: Maki over the mastered instrumental |
| `harlequin-contraption-maki-acapella.mp3` | Maki only, all seven parts |
| `harlequin-contraption-lyric-video.mp4` | lyric video: the cover with the lyrics on a black screen |
| `harlequin-contraption-maki-mv-480p.mp4` | the original MV recolored for Maki, with the cover (480p, small enough for jsDelivr) |
| `harlequin-contraption-maki-mv-720p.mp4` | the same at 720p |

The SynthV project, the instrumental and the original MV came from a shared folder and are not in this repo.

## The original MV, recolored for Maki

Vane Lily's MV (animation by nezzu) with these changes:

* **Maki's colors.** Every frame goes through a color lookup table (`tools/maki_lut.py`), built from her official
  model's textures: pinks become gold (her hair), purples become greys (her outfit), teal becomes red (her accents),
  and lavender whites become cream. Perceived lightness is kept, so every line and shape reads as before. Teto comes
  out blonde, with red face marks.
* **The YouTube section (0:15-0:32) is @bryanbr0music's channel.** The avatar and channel name under the player, the
  "From bryanbr0music" chip and the channel line under each sidebar video all change. The video's title becomes
  "Harlequin Contraption ft. Tsurumaki Maki", in the player, on the page, in its upside-down glitch copy and in the
  sidebar entry.
* **The other videos are bryanbr0music's own songs.** The original channel's videos in the sidebar and the titles under
  the player are replaced, with new thumbnails:

  | Original | Now |
  | --- | --- |
  | Lovebug Venom | レモネード (LEMONADE) |
  | LAUGHTRACK, Lose Your Head | Welcome To The Internet (Feat. Kasane Teto) |
  | Collared, FIRE!!! | Signaling Remix (feat. Adachi Rei & Corrupt-Chan) |

  The thumbnails come from the Welcome To The Internet MV (pixel Teto), the Signaling reanimation (Corrupt-Chan) and a
  placeholder title card for LEMONADE. The ages are real: LEMONADE "1 month ago", the other two "Unreleased".

  **The player plays them too.** The big player shows the song named under it:

  * LEMONADE is an animated title card: lemon slices turn and bubbles rise.
  * Welcome To The Internet plays pixel Teto from its MV (3:54).
  * The Signaling Remix plays Corrupt-Chan dancing from the reanimation (0:52).

  The clips get Maki's palette and the cartoon look, play on twos and sit inside a rough hand-drawn frame. The MV's own
  speech bubbles ("DO YOU HEAR ME?", "DON'T ACT LIKE YOU DON'T SEE ME!") and the white loading screen at 0:17 stay on
  top.

  **Lyrics in bubbles.** The orange lyric lines over the page are gone: in the player, over the sidebar and on the page
  between them. Each line pops up in a speech bubble in the player instead, drawn like the MV's bubbles (cream, a thick
  dark wobbly outline, hand-lettered capitals). The bubbles appear when the line is sung, after the MV's own bubbles have
  gone: "THIRSTING FOR A HIGH BEHIND THE FICKLE LIES", "SO DON'T BE COY", "THERE'S WHIMSY TO ENJOY!" and "JUST BLOCK OUT
  ALL THE NOISE". They shake during the chaos, and drop low when both Signaling characters fill the top.

  **The characters notice the chaos.** In the original, the characters in the player react when the videos start
  flipping. Here each song's characters do too, escalating each time their video comes back (0:24.6-0:27.9):

  | Song | 1st | 2nd | 3rd |
  | --- | --- | --- | --- |
  | Signaling Remix | Adachi Rei covers her mouth, then startles toward the sidebar | Corrupt-Chan startles, then covers her mouth | both side by side: Rei holds her cheeks, Corrupt-Chan holds her head |
  | Welcome To The Internet | pixel Teto hops, "!" balloon | shaking, "?!" balloon, sweat drop | |
  | LEMONADE | the lemon slices get faces, shocked, "!" | panicking, sweat, "!!" | |

  * **Rei and Corrupt-Chan** are new renders of the repo's 3D models (`mv/react.mjs`, chest-up, cel-shaded). Their hands are
    placed with a small solver in the model lab (`solveArms` in `mv/src/lab.js`), which aims each hand at a point on
    the face (mouth, cheeks, top of the head). They sit on the Signaling MV's orange and purple panels and jolt with
    manga shock marks.
  * **Pixel Teto** is the Welcome To The Internet MV's sprite, read back off its pixel grid from the 3:54 frame.

  How the sidebar is replaced, in every frame of 0:16-0:28:

  * **The layout.** The sidebar has five scroll layouts. Each frame is matched to one, and through unreadable glitch
    frames the last one is held. The layout says which video sits in which slot.
  * **Text.** Each slot's text block and thumbnail are found in the frame. If they don't line up, the layout's own
    positions are used, shifted. All the original sidebar text in the column is erased every frame. The new title,
    channel and age are drawn with a slight hand-drawn wobble that boils on twos.
  * **Thumbnails.** Each new thumbnail is drawn row by row between the original thumbnail's own edges in that row. So
    it keeps the original's rough paper edge, and in the glitch frames its torn rows. The pictures get Maki's palette
    and a flat, inked cartoon look, and they boil with the page.
  * **Overlays.** The light rays at 0:17 stay on top of the thumbnails.
  * **Glitch copy.** The upside-down copy of the sidebar from 0:28 gets the same titles, flipped.
* **No pentagrams.** The pentagram under Teto at 2:54 and the one on the stage floor at 3:22 are erased. Their thin gold
  strokes are found by color and shape, so candles, flames and faces stay. A third one flashes in a glitch at 2:41.8
  (about nine frames, a glowing pentagram around Teto's face). Those frames show the clean "keep dancin' Harlequin
  contraption" frame from between its flashes instead. It was found by scanning every frame for one-frame flashes and
  thin gold line work.
* **Cleaner erasing.** Inpainted areas get the paper grain back, so they don't show as smooth patches. The new credit
  and sign text is sized to cover the old.
* **The credit reads "vocal Tsurumaki Maki".** The closing STARRING sign reads "TSURUMAKI / MAKI". The sign's cross
  (the T of "TETO", which turns upside down at 3:25) is gone with the old name.
* **The three rewritten lines are on screen as sung:** "INVITE THIS CROWD / TO DANCE TONIGHT" (1:22), "Free thy body
  and thy mind" (2:57) and "Lift up this soul into the light" (3:00). The old words are found by color and erased
  (inpainted). The new ones are drawn in a similar style, and they assemble and scatter when the originals did.
* **The audio is the Maki cover**, delayed 70 ms to the MV's timing (measured against the instrumental, constant over
  the song).

`tools/mv_recolor.py --mv mv.mp4 --lut maki.cube --audio cover.wav --avatar avatar.jpg --fonts DIR --thumbs DIR
--clips DIR --out out.mp4` does it all. `--thumbs` holds wtti.png, signaling.png and lemonade.png. `--clips` holds wtti.mp4
and signaling.mp4 (the two MVs), teto_sprite.png (the pixel sprite) and react/ (the Rei and Corrupt-Chan reaction
drawings, made with `node mv/react.mjs <clips>/react`). `--stills 18,83.5` gives check frames. Fonts: Luckiest Guy, Chewy, Pirata One and M PLUS Rounded 1c
(fontsource, converted to TTF).

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
