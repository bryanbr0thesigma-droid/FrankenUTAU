"""Spectrogram of a vocal stretch with beat grid and note starts. Usage: spec.py vocal.wav notes.json t0 t1 out.png"""
import json, sys, numpy as np, librosa, matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
t0, t1 = float(sys.argv[3]), float(sys.argv[4])
y, sr = librosa.load(sys.argv[1], sr=16000, mono=True, offset=t0, duration=t1 - t0)
S = librosa.amplitude_to_db(np.abs(librosa.stft(y, n_fft=512, hop_length=64)), ref=np.max)
N = json.load(open(sys.argv[2])); off, per = N["off"], N["per"]
fig, ax = plt.subplots(figsize=(22, 6), dpi=80)
ax.imshow(S, origin="lower", aspect="auto", extent=[t0, t1, 0, sr / 2], vmin=-70, vmax=0, cmap="magma")
ax.set_ylim(0, 6000)
for k in range(int((t0 - off) / per), int((t1 - off) / per) + 2):
    for q in range(4):
        x = off + (k + q / 4) * per
        if t0 <= x <= t1: ax.axvline(x, color="w" if q == 0 else "0.5", lw=0.8 if q == 0 else 0.4, alpha=0.6)
for n in N["notes"]:
    x = off + n["b0"] * per
    if t0 <= x <= t1:
        ax.axvline(x, color="cyan", lw=1.2); ax.text(x + 0.005, 5600, n["lyric"], color="cyan", fontsize=10)
plt.tight_layout(); plt.savefig(sys.argv[5])
