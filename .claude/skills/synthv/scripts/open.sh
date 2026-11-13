#!/bin/bash
# Start the virtual display (if needed) and SynthV Basic, optionally opening a project.
# Usage: open.sh [project.svp]
# Leaves the window on display :99 with the "no audio device" warning and any update prompt
# dismissed. The telemetry prompt is still up; bounce.sh declines it.
export DISPLAY=:99 WINEPREFIX="${SYNTHV_PREFIX:-/root/.wine-synthv}" WINEDEBUG=-all
export WINEDLLOVERRIDES="dxgi=n,b" VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json
export DXVK_LOG_LEVEL=none DXVK_LOG_PATH=none
APP="$WINEPREFIX/drive_c/Program Files/Synthesizer V Studio Basic"
DOCS="$WINEPREFIX/drive_c/users/$(whoami)/Documents/Dreamtonics/Synthesizer V Studio"

if ! xdpyinfo >/dev/null 2>&1; then
  rm -f /tmp/.X99-lock
  (Xvfb :99 -screen 0 1600x900x24 -nolisten tcp >/dev/null 2>&1 &)
  for i in $(seq 1 20); do xdpyinfo >/dev/null 2>&1 && break; sleep 0.5; done
fi

if pgrep -f synthv-studio.exe >/dev/null; then
  wineserver -k; wineserver -w
fi
# Skip the "crashed session found" prompt left behind when a container restarts.
rm -rf "$DOCS/recovery/"*

ARG=()
[ -n "${1:-}" ] && ARG=("$(winepath -w "$1")")
cd "$APP" && (nohup wine synthv-studio.exe "${ARG[@]}" >"${TMPDIR:-/tmp}/synthv.log" 2>&1 &)
for i in $(seq 1 60); do xdotool search --name "Synthesizer V Studio" >/dev/null 2>&1 && break; sleep 1; done
# Wait for the "No audio device is available" dialog (its side band is #724436); it can take
# much longer than usual to appear when the machine is busy.
for i in $(seq 1 40); do
  [ "$(import -window root -crop 1x1+605+470 txt:- 2>/dev/null | grep -o '#724436')" ] && break
  sleep 1
done
xdotool mousemove 939 490 click 1   # OK on "No audio device is available"
sleep 2
xdotool mousemove 939 512 click 1   # Cancel on "A newer version ... is available" (harmless if absent)
sleep 1
xdotool search --name "Synthesizer V" getwindowname %@
