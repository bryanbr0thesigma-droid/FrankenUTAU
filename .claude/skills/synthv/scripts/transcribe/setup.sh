#!/bin/bash
# Python environment for mapping a song from audio: UVR separation models (audio-separator),
# CREPE pitch tracking, the wav2vec2 MMS aligner (torchaudio), CMU syllable counts.
# Usage: setup.sh [venv-dir]   (default ~/.venvs/transcribe). Safe to re-run.
set -euo pipefail
VENV="${1:-$HOME/.venvs/transcribe}"
python3 -m venv "$VENV"
P="$VENV/bin/pip"
"$P" install -q --progress-bar off --upgrade pip
# CPU torch first: a plain install pulls gigabytes of CUDA libraries this machine can't use
"$P" install -q --progress-bar off torch torchaudio --index-url https://download.pytorch.org/whl/cpu
"$P" install -q --progress-bar off "audio-separator[cpu]" audioread librosa torchcrepe pronouncing matplotlib \
  --extra-index-url https://download.pytorch.org/whl/cpu
"$VENV/bin/python" -c "import torch, torchaudio, torchcrepe, librosa, pronouncing; print('transcribe env ready:', torch.__version__)"
echo "python: $VENV/bin/python"
