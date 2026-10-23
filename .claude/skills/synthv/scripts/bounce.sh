#!/bin/bash
# After open.sh: decline the telemetry prompt, open the Render panel, wait for synthesis,
# then Bounce to Files. The output folder and file name come from the project's renderConfig
# (set them with render_config.py).
# Usage: bounce.sh <render-dir> <file-name-prefix> [wait-seconds]
export DISPLAY=:99
xdotool mousemove 800 613 click 1; sleep 1.5      # Telemetry consent: Decline
xdotool mousemove 1416 476 click 1; sleep 1       # close the Settings panel it opens
xdotool mousemove 1416 380 click 1; sleep 2       # open the Render panel
sleep "${3:-170}"
xdotool mousemove 1061 302 click 1                # Bounce to Files
for i in $(seq 1 120); do ls "$1/$2"_*.wav >/dev/null 2>&1 && break; sleep 2; done
sleep 15
ls -la "$1/$2"_*.wav
