"""Find a song's tempo and beat grid (constant tempo).

Usage: python -I tempo.py <song.wav> <grid.npy> [--bpm 160]
Tries the tempo candidates the onset autocorrelation suggests (and 2/3, 3/2, 2x, 1/2 of them) and keeps
the one whose tracked beats fit a straight line best: a tracker locked on dotted quarters (2/3 of the
real tempo) fits badly. Saves [first beat time, seconds per beat]. Which beat is "1" of a bar is not
decided here: look for the first big hit after an intro, or where lines start.
"""
import sys

import numpy as np
import librosa

path, out = sys.argv[1], sys.argv[2]
hint = float(sys.argv[sys.argv.index("--bpm") + 1]) if "--bpm" in sys.argv else None
y, sr = librosa.load(path, sr=22050, mono=True)
hop = 128
on = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
fps = sr / hop
ac = librosa.autocorrelate(on - on.mean(), max_size=int(fps * 2.5))
lags = np.arange(len(ac)) / fps
cands = set()
for lo, hi in [(0.25, 0.45), (0.45, 0.65), (0.65, 0.85)]:
    m = (lags > lo) & (lags < hi)
    cands.add(60 / lags[np.argmax(ac * m)])
cands |= {c * f for c in list(cands) for f in (2 / 3, 1.5, 2, 0.5)}
cands = sorted(round(c, 1) for c in cands if 70 <= c <= 210)
if hint:
    cands = [hint]
best = None
for c in cands:
    _, beats = librosa.beat.beat_track(onset_envelope=on, sr=sr, hop_length=hop, start_bpm=c, tightness=800, units="time")
    if len(beats) < 16:
        continue
    i = np.arange(len(beats))
    p = np.polyfit(i, beats, 1)
    rms = float(np.sqrt(np.mean((beats - np.polyval(p, i)) ** 2)))
    print(f"  start {c:6.1f} BPM: fitted {60 / p[0]:7.2f} BPM, beat-fit error {rms * 1000:5.1f} ms")
    if best is None or rms < best[0]:
        best = (rms, p[0], beats)
rms, per, beats = best
if abs(60 / per - round(60 / per)) < 0.1:    # songs made in a DAW sit on a whole BPM
    per = 60 / round(60 / per)
k = np.round((beats - beats[0]) / per)
off = float(np.median(beats - k * per))
np.save(out, np.array([off, per]))
print(f"tempo {60 / per:.2f} BPM, first tracked beat at {off:.4f} s (error {rms * 1000:.0f} ms) -> {out}")
