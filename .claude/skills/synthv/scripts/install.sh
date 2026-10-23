#!/bin/bash
# Install Synthesizer V Studio Basic 1.10.1 and the free Kasane Teto (Lite) voice under Wine,
# for headless use on a virtual X display. Safe to re-run; finished steps are skipped.
# Env: SYNTHV_PREFIX (Wine prefix, default /root/.wine-synthv), SYNTHV_CACHE (downloads).
set -euo pipefail

PREFIX="${SYNTHV_PREFIX:-/root/.wine-synthv}"
CACHE="${SYNTHV_CACHE:-$HOME/.cache/synthv}"
SITE="https://synthv.me"
BASIC_URL="$SITE/Synthesizer%20V%20Studio/Basic/SVSTUDIO_BASIC_1.10.1.exe"
BASIC_SHA=7ed7a957f57126c05df3c5a8b24806d10c1910bfd8a976f9826cff565122280d
TETO_URL="$SITE/Singing%20Voice%20Databases/KASANE_TETO/KASANE_TETO_AI_LITE_100.svpk"
TETO_SHA=5148e37ecef1c745695b896d4f5765ce2b9188cc2dcda414c4f9e533110152bc
DXVK_URL="https://github.com/doitsujin/dxvk/releases/download/v2.5.3/dxvk-2.5.3.tar.gz"
DXVK_SHA=d8e6ef7d1168095165e1f8a98c7d5a4485b080467bb573d2a9ef3e3d79ea1eb8

APP="$PREFIX/drive_c/Program Files/Synthesizer V Studio Basic"
DOCS="$PREFIX/drive_c/users/$(whoami)/Documents/Dreamtonics/Synthesizer V Studio"
export WINEPREFIX="$PREFIX" WINEDEBUG=-all

fetch() {  # fetch <url> <file> <sha256>
  local dst="$CACHE/$2"
  if [ ! -f "$dst" ] || ! echo "$3  $dst" | sha256sum -c --status; then
    curl -sS -L --fail -o "$dst" "$1"
  fi
  echo "$3  $dst" | sha256sum -c --status || { echo "checksum mismatch: $2" >&2; exit 1; }
}

mkdir -p "$CACHE"
if ! command -v wine >/dev/null || ! command -v innoextract >/dev/null || ! command -v ffmpeg >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
    wine wine64 xvfb xdotool innoextract imagemagick x11-utils mesa-vulkan-drivers libvulkan1 \
    ffmpeg p7zip-full python3-numpy >/dev/null
fi

fetch "$BASIC_URL" SVSTUDIO_BASIC_1.10.1.exe "$BASIC_SHA"
fetch "$TETO_URL" KASANE_TETO_AI_LITE_100.svpk "$TETO_SHA"
fetch "$DXVK_URL" dxvk-2.5.3.tar.gz "$DXVK_SHA"

if [ ! -d "$PREFIX/drive_c" ]; then
  xvfb-run -a wineboot --init >/dev/null 2>&1
  # A Wine virtual desktop handles window focus and popups without an X window manager.
  wine reg add 'HKCU\Software\Wine\Explorer' /v Desktop /t REG_SZ /d Default /f >/dev/null 2>&1
  wine reg add 'HKCU\Software\Wine\Explorer\Desktops' /v Default /t REG_SZ /d 1600x900 /f >/dev/null 2>&1
  wineserver -w
fi

if [ ! -f "$APP/synthv-studio.exe" ]; then
  tmp=$(mktemp -d)
  innoextract -s -d "$tmp" --language en "$CACHE/SVSTUDIO_BASIC_1.10.1.exe" >/dev/null 2>&1
  mkdir -p "$APP" "$(dirname "$DOCS")"
  cp -r "$tmp/app/." "$APP/"
  cp -r --update=none "$tmp/userdocs/Dreamtonics" "$(dirname "$(dirname "$DOCS")")/"
  rm -rf "$tmp"
fi

# Wine's built-in dxgi does not implement WaitForVBlank, so SynthV's UI (JUCE) never repaints
# after its first frame. DXVK's dxgi.dll implements it; it needs a Vulkan driver (Mesa lavapipe).
if [ ! -f "$APP/dxgi.dll" ]; then
  tar -xzf "$CACHE/dxvk-2.5.3.tar.gz" -C "$CACHE" dxvk-2.5.3/x64/dxgi.dll
  cp "$CACHE/dxvk-2.5.3/x64/dxgi.dll" "$APP/"
fi

# Installing a voice package is unpacking it into databases/<product name>.
TETO="$DOCS/databases/Kasane_Teto_(Lite)"
if [ ! -f "$TETO/voice.nofs" ]; then
  mkdir -p "$TETO"
  7z x -y -o"$TETO" "$CACHE/KASANE_TETO_AI_LITE_100.svpk" voice.nofs license.txt profile.png background.png >/dev/null
fi

echo "SynthV Basic ready: $APP"
echo "Voices: $(ls "$DOCS/databases" | tr '\n' ' ')"
