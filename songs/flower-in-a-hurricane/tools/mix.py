"""Mix rendered bank vocals over the instrumental.

    python mix.py instrumental.wav ref_vocal.wav out.wav VOCAL.wav[:gain_db[:pan[:ref.wav]]] ...

Each vocal follows the reference vocal's loudness (phrase level + a slow envelope), gets a high-pass, a short
stereo room and a level that puts it where the original vocal sat over the same instrumental.
"""
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfiltfilt

inst_p, ref_p, out_p = sys.argv[1:4]
inst, sr = sf.read(inst_p)
ref, _ = sf.read(ref_p)
ref = ref.mean(1) if ref.ndim > 1 else ref
N = len(inst)


def env(x, win_s):
    w = max(1, int(win_s * sr))
    k = np.ones(w) / w
    return np.sqrt(fftconvolve(x ** 2, k, "same").clip(0) + 1e-10)


def room(seed, rt60=1.5, pre=0.018):
    rng = np.random.default_rng(seed)
    n = int(rt60 * sr)
    t = np.arange(n) / sr
    ir = rng.standard_normal(n) * np.exp(-6.9 * t / rt60)
    ir = sosfiltfilt(butter(2, [250, 6000], "bandpass", fs=sr, output="sos"), ir)
    ir = np.concatenate([np.zeros(int(pre * sr)), ir])
    return ir / np.sqrt((ir ** 2).sum())


def limit(x, thr, look_s=0.003):
    """look-ahead peak limiter: never above thr, reduction held over the look-ahead window and smoothed"""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    a = np.abs(x).max(1) if x.ndim > 1 else np.abs(x)
    gr = np.minimum(0.0, 20 * np.log10(thr / np.maximum(a, 1e-9)))
    la = max(1, int(look_s * sr))
    g = uniform_filter1d(minimum_filter1d(gr, 2 * la + 1), la + 1)
    g = 10 ** (g / 20)
    return x * (g[:, None] if x.ndim > 1 else g)


IRL, IRR = room(1), room(2)
hp = butter(2, 110, "highpass", fs=sr, output="sos")
presence = butter(2, [2000, 5000], "bandpass", fs=sr, output="sos")
voc = np.zeros((N, 2))
refs = {}


def ref_of(path):
    """reference vocal for a part: its loudness envelope and where it sings"""
    if path not in refs:
        r, _ = sf.read(path)
        r = r.mean(1) if r.ndim > 1 else r
        r = np.pad(r, (0, max(0, N - len(r))))[:N]
        e = env(r, 0.25)
        refs[path] = (r, e, e > e.max() * 10 ** (-40 / 20))
    return refs[path]


for spec in sys.argv[4:]:
    # VOCAL.wav[:gain_db[:pan[:ref.wav]]]  (ref defaults to the main reference vocal)
    p, *rest = spec.split(":")
    g_db = float(rest[0]) if rest else 0.0
    pan = float(rest[1]) if len(rest) > 1 else 0.0
    pref, ref_env, sung = ref_of(rest[2] if len(rest) > 2 else ref_p)
    y, ysr = sf.read(p)
    y = y.mean(1) if y.ndim > 1 else y
    assert ysr == sr, (p, ysr)
    y = np.pad(y, (0, max(0, N - len(y))))[:N]
    y = sosfiltfilt(hp, y)
    y = y + 0.5 * sosfiltfilt(presence, y)                      # ~ +3.5 dB presence: the synth banks are dull up there
    # slow envelope of the original (cube-root, so it shapes phrases without pumping on syllables)
    ye = env(y, 0.25)
    on = ye > ye.max() * 10 ** (-45 / 20)
    gain = np.where(on, (ref_env / ye) ** 0.33, 1.0)
    gain = fftconvolve(gain, np.ones(int(0.1 * sr)) / int(0.1 * sr), "same")
    y = y * gain
    # level: the render's RMS where both sing = the original vocal's RMS there
    both = on & sung
    lvl = np.sqrt((pref[both] ** 2).mean() / max(1e-12, (y[both] ** 2).mean()))
    y = y * lvl * 10 ** (g_db / 20)
    L, R = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    voc[:, 0] += y * L * np.sqrt(2)
    voc[:, 1] += y * R * np.sqrt(2)
on_all = np.abs(voc).max(1) > 1e-3
vr = np.sqrt((voc[on_all] ** 2).mean())
voc = limit(voc, vr * 10 ** (12 / 20), 0.004)                # vocal bus: tame consonant spikes (crest <= 12 dB)
wet = np.stack([fftconvolve(voc.mean(1), IRL)[:N], fftconvolve(voc.mean(1), IRR)[:N]], 1)
mix = inst + voc + wet * 10 ** (-13 / 20)
# master: the original song's RMS, then a peak limiter
song_rms = float(np.sqrt((inst ** 2).mean() + (ref ** 2).mean()))
mix *= song_rms / np.sqrt((mix ** 2).mean())
peak = np.abs(mix).max()
mix = limit(mix, 0.97)
sf.write(out_p, mix.astype("float32"), sr, subtype="PCM_16")
print(f"wrote {out_p}  peak before limit {peak:.2f}")
