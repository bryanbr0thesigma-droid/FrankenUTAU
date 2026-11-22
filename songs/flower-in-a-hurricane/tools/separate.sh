#!/bin/bash
# UVR5 models via python-audio-separator (CPU): vocals/instrumental, then lead/backing from the vocals.
#   tools/separate.sh SONG.mp3 stems/
set -e
SONG="$1"; OUT="${2:-stems}"; MODELS="${MODELS:-models}"
mkdir -p "$OUT"
ffmpeg -v error -y -i "$SONG" "$OUT/song.wav"
audio-separator "$OUT/song.wav" -m model_bs_roformer_ep_317_sdr_12.9755.ckpt --model_file_dir "$MODELS" --output_dir "$OUT" \
  --output_format WAV --mdxc_overlap 2 --custom_output_names '{"Vocals":"vocals","Instrumental":"instrumental"}'
audio-separator "$OUT/vocals.wav" -m mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt --model_file_dir "$MODELS" --output_dir "$OUT" \
  --output_format WAV --mdxc_overlap 2 --custom_output_names '{"Vocals":"lead","Instrumental":"backing"}'
