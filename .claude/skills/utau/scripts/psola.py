"""A small UTAU-style resampler: pitch-synchronous overlap-add (TD-PSOLA), numpy only.

resample(x, sr, entry_ms, out_len, f0_out, vel=100) takes one oto region of a sample and returns
out_len samples sung on the f0_out curve (Hz per output sample, NaN = keep the sample's own pitch):
  - the consonant part (offset..offset+consonant) plays at its own speed (scaled by velocity),
  - the vowel after it plays on, then loops back and forth over its steady second half for as long
    as the note needs (instead of being stretched, which smears synthetic voices),
  - voiced stretches are re-pitched period by period, unvoiced ones (s, sh, h, breath) are copied.
Formants stay put because each grain is one original pitch period.
"""
import numpy as np

HOP_UV = 0.004                      # grain hop in unvoiced parts (s)


def pitch_marks(x, sr, force_f0=None):
    """Pitch marks (sample positions), each mark's period in samples, and a voiced flag.
    force_f0: for noisy/glitchy banks, treat loud frames the tracker can't read as voiced at
    this pitch (Hz) so they still follow the melody."""
    import librosa
    hop = int(0.005 * sr)
    f0, vflag, vprob = librosa.pyin(x, fmin=65, fmax=1100, sr=sr, frame_length=2048, hop_length=hop)
    f0 = np.where(vflag & np.isfinite(f0), f0, 0.0)
    centers = np.arange(len(f0)) * hop
    if force_f0:
        rms = librosa.feature.rms(y=x, frame_length=1024, hop_length=hop)[0][:len(f0)]
        zcr = librosa.feature.zero_crossing_rate(x, frame_length=1024, hop_length=hop)[0][:len(f0)]
        loud = 20 * np.log10(rms + 1e-9) > 20 * np.log10(rms.max() + 1e-9) - 30
        fill = loud & (zcr < 0.25) & (f0 == 0)
        f0[fill] = force_f0
    smooth = np.convolve(x, np.ones(5) / 5, mode="same")
    marks, periods, voiced = [], [], []
    uv = int(HOP_UV * sr)
    pos = 0
    n = len(x)
    while pos < n:
        k = min(len(f0) - 1, max(0, int(np.searchsorted(centers, pos))))
        if len(f0) and f0[k] > 0:
            P = int(round(sr / f0[k]))
            if not voiced or not voiced[-1]:
                # first mark of a voiced run: strongest peak within one period
                seg = smooth[pos:pos + P]
                if len(seg) < 2:
                    break
                pos = pos + int(np.argmax(np.abs(seg)))
            else:
                lo, hi = max(0, pos - P // 4), min(n, pos + P // 4 + 1)
                sign = np.sign(smooth[marks[-1]]) or 1.0
                seg = smooth[lo:hi] * sign
                if len(seg):
                    pos = lo + int(np.argmax(seg))
            if marks and pos <= marks[-1]:
                pos = marks[-1] + max(1, P // 2)
            marks.append(pos); periods.append(P); voiced.append(True)
            pos += P
        else:
            marks.append(pos); periods.append(uv); voiced.append(False)
            pos += uv
    return np.array(marks), np.array(periods), np.array(voiced, bool)


def _timemap(t, cons_in, cons_out, vow_in):
    """Output sample index -> input sample index (relative to the region start)."""
    if t < cons_out:
        return t * cons_in / max(cons_out, 1)
    u = t - cons_out
    if u <= vow_in:
        return cons_in + u
    a = 0.5 * vow_in                                    # loop over the vowel's second half
    span = max(vow_in - a, 1)
    w = (u - vow_in) % (2 * span)
    return cons_in + (vow_in - w if w < span else a + (w - span))


def resample(x, sr, offset_ms, consonant_ms, cutoff_ms, out_len, f0_out, vel=100, cache=None, force_f0=None,
             smooth=0):
    """Render one note: see module docstring. cache: dict to reuse pitch marks per sample.
    smooth=k averages each voiced grain with its k neighbouring periods on each side (each centred
    on its own pitch mark): the periodic part adds up and noise averages out, so a hissy, rough
    bank holds a steadier tone. 0 = off."""
    start = int(offset_ms * sr / 1000)
    end = len(x) - int(cutoff_ms * sr / 1000) if cutoff_ms >= 0 else start + int(-cutoff_ms * sr / 1000)
    end = max(min(end, len(x)), start + int(0.02 * sr))
    key = (id(x), start, end)
    if cache is not None and key in cache:
        marks, periods, voiced = cache[key]
    else:
        marks, periods, voiced = pitch_marks(x[start:end], sr, force_f0)
        marks = marks + start
        if cache is not None:
            cache[key] = (marks, periods, voiced)
    vscale = 2 ** ((100 - vel) / 100)
    cons_in = min(int(consonant_ms * sr / 1000), end - start - 1)
    cons_out = int(cons_in * vscale)
    margin = int(0.01 * sr)
    vow_in = max(end - start - cons_in - margin, int(0.01 * sr))
    pad = int(sr / 50)
    y = np.zeros(out_len + 2 * pad)
    t = 0.0
    while t < out_len:
        tin = start + _timemap(t, cons_in, cons_out, vow_in)
        k = int(np.searchsorted(marks, tin))
        if k >= len(marks) or (k > 0 and tin - marks[k - 1] < marks[k] - tin):
            k -= 1
        m, P, v = int(marks[k]), int(periods[k]), bool(voiced[k])
        target = f0_out[min(int(t), len(f0_out) - 1)]
        if v and np.isfinite(target) and target > 0:
            Pout = sr / target
            gain = Pout / P
        else:
            Pout, gain = P, 1.0
        a, b = m - P, m + P + 1
        g = x[max(a, 0):min(b, len(x))]
        if smooth and v and a >= 0 and b <= len(x):
            acc, wsum = np.zeros(b - a), 0.0
            for j in range(-smooth, smooth + 1):
                kk = k + j
                if 0 <= kk < len(marks) and voiced[kk]:
                    mj = int(marks[kk])
                    if mj - P >= start and mj + P + 1 <= end:
                        wj = 1.0 - abs(j) / (smooth + 1)
                        acc += wj * x[mj - P:mj + P + 1]
                        wsum += wj
            if wsum > 0:
                g = acc / wsum
        w = np.hanning(2 * P + 3)[1:-1][max(0, -a):max(0, -a) + len(g)]
        c = int(round(t)) + pad - (m - max(a, 0))
        if c < 0:
            g, w, c = g[-c:], w[-c:], 0
        g = g[:len(y) - c]; w = w[:len(g)]
        y[c:c + len(g)] += g * w * gain
        t += max(Pout, 8)
    return y[pad:pad + out_len]
