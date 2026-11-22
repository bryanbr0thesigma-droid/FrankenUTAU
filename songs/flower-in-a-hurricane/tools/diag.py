"""How well do our vocals follow the original singing, and how much voice do they use?

    python diag.py ORIGINAL_VOCALS.wav OURS.wav [t0 t1]

coverage   share of the original's sung time where we sing too (and stretches we leave empty)
pitch      our pitch vs the original's main line (cents, octave-folded), where both sing
dynamics   correlation of loudness contours (50 ms, dB) and loudness range (p90 - p10) of each
voice      harmonics-to-noise ratio (Praat) and spectral tilt (1-4 kHz vs 0-1 kHz) in sung frames
"""
import sys

import numpy as np
import parselmouth
import soundfile as sf

op, up = sys.argv[1:3]
t0 = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
t1 = float(sys.argv[4]) if len(sys.argv) > 4 else 1e9


def load(p):
    x, sr = sf.read(p)
    m = x.mean(1) if x.ndim > 1 else x
    return m[int(t0 * sr):int(min(t1 * sr, len(m)))], sr


o, sr = load(op)
u, _ = load(up)
n = min(len(o), len(u))
o, u = o[:n], u[:n]
H = int(0.01 * sr)


def frames(x):
    k = len(x) // H
    return x[:k * H].reshape(k, H)


def pitch(x):
    p = parselmouth.Sound(x, sr).to_pitch_ac(time_step=0.01, pitch_floor=70, pitch_ceiling=1000, voicing_threshold=0.4)
    f = p.selected_array["frequency"]
    xs = p.xs()
    k = len(x) // H
    return np.interp(np.arange(k) * 0.01 + 0.005, xs, f, left=0, right=0) * (np.interp(np.arange(k) * 0.01 + 0.005, xs, (f > 0).astype(float), left=0, right=0) > 0.5)


fo, fu = pitch(o), pitch(u)
k = min(len(fo), len(fu))
fo, fu = fo[:k], fu[:k]
db_o = 20 * np.log10(np.sqrt((frames(o)[:k] ** 2).mean(1)) + 1e-7)
db_u = 20 * np.log10(np.sqrt((frames(u)[:k] ** 2).mean(1)) + 1e-7)
sung_o = (fo > 0) & (db_o > db_o.max() - 40)
sung_u = (fu > 0) & (db_u > db_u.max() - 40)
cov = (sung_o & sung_u).sum() / max(1, sung_o.sum())
print(f"coverage: we sing during {100 * cov:.0f}% of the original's sung time "
      f"({sung_o.sum() / 100:.0f} s sung in the original, {sung_u.sum() / 100:.0f} s by us)")
# empty stretches > 0.5 s
miss = sung_o & ~sung_u
runs, i = [], 0
while i < k:
    if miss[i]:
        j = i
        while j < k and (miss[j] or (j + 10 < k and miss[j:j + 10].any())):
            j += 1
        if j - i >= 50:
            runs.append((t0 + i / 100, t0 + j / 100))
        i = j
    else:
        i += 1
print("  empty while the original sings:", ", ".join(f"{int(a // 60)}:{a % 60:04.1f}-{int(b // 60)}:{b % 60:04.1f}" for a, b in runs[:20]),
      f"(+{len(runs) - 20} more)" if len(runs) > 20 else "")
both = sung_o & sung_u
d = 1200 * np.log2(fu[both] / fo[both])
dfold = (d + 600) % 1200 - 600
print(f"pitch: where both sing, median |error| {np.median(np.abs(dfold)):.0f} c (octave-folded); "
      f"same octave {100 * np.mean(np.abs(d) < 600):.0f}%, octave below {100 * np.mean((d < -600) & (d > -1800)):.0f}%")
w = 5
so = np.convolve(db_o, np.ones(w) / w, "same")
su = np.convolve(db_u, np.ones(w) / w, "same")
r = np.corrcoef(so[both], su[both])[0, 1]
rng = lambda v: np.percentile(v, 90) - np.percentile(v, 10)
print(f"dynamics: loudness correlation {r:.2f}; loudness range original {rng(so[sung_o]):.1f} dB, ours {rng(su[sung_u]):.1f} dB")


def voice(x, sung):
    s = parselmouth.Sound(x, sr)
    h = s.to_harmonicity_cc(time_step=0.01, minimum_pitch=75).values[0]
    h = h[:len(sung)]
    hn = np.median(h[sung[:len(h)] & (h > -50)])
    F = np.abs(np.fft.rfft(frames(x)[:len(sung)][sung] * np.hanning(H), axis=1)) ** 2
    fr = np.fft.rfftfreq(H, 1 / sr)
    tilt = 10 * np.log10(F[:, (fr >= 1000) & (fr < 4000)].sum() / F[:, (fr >= 80) & (fr < 1000)].sum())
    return hn, tilt


ho, to_ = voice(o, sung_o)
hu, tu = voice(u, sung_u)
print(f"voice: harmonics-to-noise original {ho:.1f} dB, ours {hu:.1f} dB; brightness (1-4k vs 0-1k) original {to_:.1f} dB, ours {tu:.1f} dB")
