"""Beat map for a song that changes tempo: the time of every beat, saved as beats.npy.

Usage: python -I beatmap.py <instrumental.wav> <beats.npy> [--range 70:190] [--fix START:END:BPM ...]

Local tempo comes from the onset tempogram, kept in one octave (the candidate nearest a slowly moving
reference within --range, so the tracker does not jump between half and double time), then beats are
tracked against that time-varying tempo. --fix forces a section's tempo (e.g. 120:190:96) when the
tempogram picks the wrong octave there. transcribe.py and make_svp.py accept the result in place of
tempo.py's grid.npy. Prints the tempo every 8 s so the map can be checked by ear against the song.
"""
import sys

import numpy as np
import librosa

path, out = sys.argv[1], sys.argv[2]
lo, hi = 70.0, 190.0
fixes = []
args = sys.argv[3:]
for i, a in enumerate(args):
    if a == "--range":
        lo, hi = [float(x) for x in args[i + 1].split(":")]
    if a == "--fix":
        fixes.append([float(x) for x in args[i + 1].split(":")])

y, sr = librosa.load(path, sr=22050, mono=True)
hop = 256
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, aggregate=np.median)
tg = librosa.feature.tempogram(onset_envelope=oenv, sr=sr, hop_length=hop, win_length=768)
bpms = librosa.tempo_frequencies(tg.shape[0], sr=sr, hop_length=hop)
t = librosa.frames_to_time(np.arange(tg.shape[1]), sr=sr, hop_length=hop)
ok = (bpms >= lo) & (bpms <= hi)

# per frame: the strongest few peaks in range; follow the one nearest a slow reference
ref = None
dyn = np.zeros(tg.shape[1])
for k in range(tg.shape[1]):
    col = np.where(ok, tg[:, k], 0)
    cand = [i for i in np.argsort(col)[::-1][:6] if col[i] > 0.25 * col.max()]
    if not cand:
        dyn[k] = ref or 120; continue
    if ref is None:
        ref = bpms[cand[0]]
    # prefer strength, penalise distance from the reference (in octaves)
    score = [col[i] / col.max() - 1.5 * abs(np.log2(bpms[i] / ref)) for i in cand]
    b = bpms[cand[int(np.argmax(score))]]
    dyn[k] = b
    ref = 0.97 * ref + 0.03 * b
# smooth over ~6 s, then apply forced sections
w = int(6 * sr / hop) | 1
pad = np.pad(dyn, w // 2, mode="edge")
dyn = np.array([np.median(pad[k:k + w]) for k in range(len(dyn))])
for s0, s1, bpm in fixes:
    dyn[(t >= s0) & (t < s1)] = bpm
_, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop, bpm=dyn, units="time", tightness=120)
np.save(out, beats)
ibi = np.diff(beats)
print(f"{len(beats)} beats from {beats[0]:.2f} s to {beats[-1]:.2f} s")
for s in range(0, int(t[-1]) + 1, 8):
    sel = (beats[:-1] >= s) & (beats[:-1] < s + 8)
    if sel.any():
        print(f"{s:4d}s {60 / np.median(ibi[sel]):6.1f} BPM")
