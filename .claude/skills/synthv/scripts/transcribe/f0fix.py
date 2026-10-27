"""Fix octave-down errors in a CREPE track: where the reported f0 has weak 1st and 3rd harmonics but
strong 2nd and 4th, the real pitch is double. Usage: python -I f0fix.py vocal.wav f0.npz out.npz"""
import sys, numpy as np, librosa
y, sr = librosa.load(sys.argv[1], sr=44100, mono=True)
d = dict(np.load(sys.argv[2])); t, f0 = d["t"], d["f0"].copy()
n_fft, hop = 4096, 441
S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop, center=True))
fr = np.fft.rfftfreq(n_fft, 1 / sr)
def amp(col, h):
    sel = (fr > h * 0.97) & (fr < h * 1.03)
    return 20 * np.log10(S[sel, col].max() + 1e-9) if sel.any() else -200
flag = np.zeros(len(t), bool)
voiced = d["per"] > 0.45
for i in np.nonzero(voiced)[0]:
    col = min(S.shape[1] - 1, int(round(t[i] * sr / hop)))
    f = f0[i]
    if f * 4 > sr / 2: continue
    a1, a2, a3, a4 = (amp(col, f * k) for k in (1, 2, 3, 4))
    top = max(a2, a4)
    if a3 < top - 18 and a1 < a2 - 5:
        flag[i] = True
# a flag only counts where most of its 70 ms neighbourhood agrees
sm = np.array([flag[max(0, i - 3):i + 4][voiced[max(0, i - 3):i + 4]].mean() if voiced[i] else 0 for i in range(len(t))])
fix = sm > 0.5
# keep a doubled stretch only if the doubled pitch sits closer to the notes around it (within 1 s)
midi = 12 * np.log2(np.maximum(f0, 1) / 440)
i = 0
while i < len(t):
    if not fix[i]:
        i += 1; continue
    j = i
    while j < len(t) and fix[j]: j += 1
    ctx = np.r_[max(0, i - 100):i, j:min(len(t), j + 100)]
    ctx = ctx[voiced[ctx] & ~fix[ctx]]
    if len(ctx):
        c = np.median(midi[ctx]); run = np.median(midi[i:j])
        if abs(run + 12 - c) >= abs(run - c):
            fix[i:j] = False
    i = j
f0[fix] *= 2
d["f0"] = f0
np.savez(sys.argv[3], **d)
print(f"doubled {fix.sum()} of {voiced.sum()} voiced frames ({100 * fix.sum() / voiced.sum():.1f}%)")
