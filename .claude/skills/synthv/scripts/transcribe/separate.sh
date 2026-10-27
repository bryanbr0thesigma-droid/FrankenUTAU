#!/bin/bash
# Split a song into instrumental, lead vocal and backing vocals with UVR's models (audio-separator).
# Usage: separate.sh <venv-dir> <song.mp3|wav> <out-dir> [models-dir]
# Writes out-dir/{song,inst,vocals,lead,backing}.wav. On 4 CPU cores a 4.5-minute song takes about
# 13 minutes for the vocal split and 21 for the lead/backing split.
set -euo pipefail
VENV="$1"; SONG="$2"; OUT="$3"; MODELS="${4:-$OUT/models}"
SEP="$VENV/bin/audio-separator"
mkdir -p "$OUT" "$MODELS"
ffmpeg -v error -y -i "$SONG" -ar 44100 "$OUT/song.wav"

# Big model files sometimes get cut off mid-download by the proxy; fetch them with resume first.
get() {  # get <file-name>
  local url="https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs/$1"
  for i in 1 2 3 4 5; do curl -sS -L -C - --fail -o "$MODELS/$1" "$url" && return 0; sleep $((2 ** i)); done
  return 1
}
get vocals_mel_band_roformer.ckpt || true
get mel_band_roformer_karaoke_becruily.ckpt || true

# 1. vocals vs instrumental: Kim's MelBand Roformer, the top vocal model in UVR's list
"$SEP" "$OUT/song.wav" -m vocals_mel_band_roformer.ckpt --model_file_dir "$MODELS" \
  --output_dir "$OUT" --output_format WAV
mv "$OUT/song_(vocals)_vocals_mel_band_roformer.wav" "$OUT/vocals.wav"
mv "$OUT/song_(other)_vocals_mel_band_roformer.wav" "$OUT/inst.wav"
# 2. lead vs backing vocals. Its config overlaps every chunk 8 times (about 1 h 45 min on CPU);
#    2 is four times faster and makes no difference for pitch tracking.
"$SEP" "$OUT/vocals.wav" -m mel_band_roformer_karaoke_becruily.ckpt --mdxc_overlap 2 \
  --model_file_dir "$MODELS" --output_dir "$OUT" --output_format WAV
mv "$OUT/vocals_(Vocals)_mel_band_roformer_karaoke_becruily.wav" "$OUT/lead.wav"
mv "$OUT/vocals_(Instrumental)_mel_band_roformer_karaoke_becruily.wav" "$OUT/backing.wav"
ls -la "$OUT"/*.wav
