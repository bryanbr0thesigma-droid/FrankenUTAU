import sys, json, numpy as np, soundfile as sf
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from scipy.signal import spectrogram
t0, t1 = float(sys.argv[2]), float(sys.argv[3]); files = sys.argv[4:]
ph = [p for w in json.load(open("phones.json")) for p in w["phones"] if t0 <= p[1] < t1]
fig, axs = plt.subplots(len(files), 1, figsize=(20, 3.2 * len(files)), dpi=70, sharex=True)
for ax, f in zip(axs, files):
    x, sr = sf.read(f); m = x.mean(1) if x.ndim > 1 else x
    seg = m[int(t0 * sr):int(t1 * sr)]
    fr, tt, S = spectrogram(seg, sr, nperseg=1024, noverlap=768)
    ax.pcolormesh(tt + t0, fr, 10 * np.log10(S + 1e-12), vmin=np.percentile(10*np.log10(S+1e-12), 30), shading="auto", cmap="magma")
    ax.set_ylim(0, 6000); ax.set_title(f.split("/")[-1], fontsize=9)
    for p, s, e in ph:
        ax.axvline(s, color="cyan", lw=0.5, alpha=0.6); ax.text(s, 5600, p, color="cyan", fontsize=7)
fig.tight_layout(); fig.savefig(sys.argv[1])
