"""Audio analysis for the MV: beat grid, sections and per-frame features.

Reads the full mix and the two vocal stems from assets/signaling/ and writes build/analysis.json:
  - tempo, beat times and bar starts (from the mix)
  - per video frame: mix loudness, low/mid/high band energy, onset strength, kick
  - per video frame and per singer: vocal loudness and rough vowel weights (a i u e o) for lip sync
  - per bar: energy level and who is singing (drives the camera and the choreography)

Only numpy is needed. Run from the mv/ folder:  python3 analyze.py
"""
import json
import os
import struct
import sys

import numpy as np

FPS = 30
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "assets", "signaling")
OUT = os.path.join(HERE, "build", "analysis.json")


def read_wav(path):
    """Return (samples float32 [n, ch], rate). Handles PCM 16/24/32 and IEEE float."""
    with open(path, "rb") as f:
        riff, _, wave = struct.unpack("<4sI4s", f.read(12))
        assert riff == b"RIFF" and wave == b"WAVE", path
        fmt = None
        while True:
            hdr = f.read(8)
            if len(hdr) < 8:
                raise ValueError("no data chunk in " + path)
            cid, size = struct.unpack("<4sI", hdr)
            if cid == b"fmt ":
                b = f.read(size)
                tag, ch, rate, _, _, bits = struct.unpack("<HHIIHH", b[:16])
                if tag == 0xFFFE:  # WAVE_FORMAT_EXTENSIBLE: real tag is in the sub-format GUID
                    tag = struct.unpack("<H", b[24:26])[0]
                fmt = (tag, ch, rate, bits)
                if size & 1:
                    f.read(1)
            elif cid == b"data":
                raw = f.read(size)
                break
            else:
                f.seek(size + (size & 1), 1)
    tag, ch, rate, bits = fmt
    if tag == 3 and bits == 32:
        x = np.frombuffer(raw, dtype="<f4")
    elif tag == 1 and bits == 16:
        x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif tag == 1 and bits == 24:
        b = np.frombuffer(raw[: len(raw) // 3 * 3], dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)
        v = np.where(v >= 1 << 23, v - (1 << 24), v)
        x = v.astype(np.float32) / float(1 << 23)
    elif tag == 1 and bits == 32:
        x = np.frombuffer(raw, dtype="<i4").astype(np.float32) / float(1 << 31)
    else:
        raise ValueError(f"unsupported wav format {fmt} in {path}")
    n = len(x) // ch
    return x[: n * ch].reshape(n, ch), rate


def stft_mag(x, n_fft, hop):
    win = np.hanning(n_fft).astype(np.float32)
    pad = np.concatenate([np.zeros(n_fft // 2, np.float32), x, np.zeros(n_fft, np.float32)])
    n_frames = 1 + (len(pad) - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(n_frames)[:, None]
    out = np.empty((n_frames, n_fft // 2 + 1), np.float32)
    step = 4096  # in blocks, to keep memory low
    for s in range(0, n_frames, step):
        fr = pad[idx[s : s + step]] * win
        out[s : s + step] = np.abs(np.fft.rfft(fr, axis=1))
    return out


def resample_linear(x, src_rate, dst_rate):
    n_out = int(len(x) * dst_rate / src_rate)
    t = np.arange(n_out) * (src_rate / dst_rate)
    return np.interp(t, np.arange(len(x)), x).astype(np.float32)


def box_lowpass(x, k):
    if k <= 1:
        return x
    c = np.cumsum(np.concatenate([[0.0], x]))
    y = (c[k:] - c[:-k]) / k
    return np.concatenate([y, np.full(k - 1, y[-1])]).astype(np.float32)


def find_offset(stem, stem_rate, mix, mix_rate, max_lag_s=30.0):
    """Seconds to add to stem time to get mix time (stem sample 0 plays at mix time `offset`)."""
    r = 8000
    a = resample_linear(box_lowpass(mix, mix_rate // r), mix_rate, r)
    b = resample_linear(box_lowpass(stem, int(stem_rate // r)), stem_rate, r)
    n = 1
    while n < len(a) + len(b):
        n *= 2
    xc = np.fft.irfft(np.fft.rfft(a, n) * np.conj(np.fft.rfft(b, n)), n)
    max_lag = int(max_lag_s * r)
    lags = np.concatenate([np.arange(0, max_lag), np.arange(-max_lag, 0)])
    vals = np.concatenate([xc[:max_lag], xc[-max_lag:]])
    best = lags[np.argmax(vals)]
    peak = vals.max() / (np.sqrt(np.sum(a * a) * np.sum(b * b)) + 1e-9)
    return best / r, float(peak)


def onset_envelope(mag):
    logm = np.log1p(100.0 * mag)
    flux = np.maximum(0.0, np.diff(logm, axis=0, prepend=logm[:1]))
    env = flux.sum(axis=1)
    env -= box_lowpass(env, 32)  # remove slow trend
    env = np.maximum(env, 0)
    return env / (np.percentile(env, 99) + 1e-9)


def estimate_tempo(env, rate):
    env = env - env.mean()
    n = 1
    while n < 2 * len(env):
        n *= 2
    ac = np.fft.irfft(np.abs(np.fft.rfft(env, n)) ** 2, n)[: len(env)]
    bpms = np.arange(70.0, 200.0, 0.05)
    lags = 60.0 * rate / bpms
    score = np.interp(lags, np.arange(len(ac)), ac)
    # include the 2x lag (bar-level periodicity) so octave errors are less likely
    score += 0.5 * np.interp(2 * lags, np.arange(len(ac)), ac)
    # mild preference for the usual pop range
    score *= np.exp(-0.5 * (np.log2(bpms / 135.0) / 0.9) ** 2)
    return float(bpms[np.argmax(score)])


def fit_beats(env, rate, bpm0):
    """Find bpm (fine) and phase that line the beat grid up with onsets over the whole track."""
    t_env = np.arange(len(env)) / rate
    dur = t_env[-1]
    best = (-1, bpm0, 0.0)
    for bpm in np.arange(bpm0 - 0.6, bpm0 + 0.6, 0.01):
        period = 60.0 / bpm
        for ph in np.arange(0, period, 0.005):
            tb = np.arange(ph, dur, period)
            s = np.interp(tb * rate, np.arange(len(env)), env).sum() / len(tb)
            if s > best[0]:
                best = (s, bpm, ph)
    return best[1], best[2]


def band(mag, freqs, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return np.sqrt((mag[:, m] ** 2).sum(axis=1))


def norm01(x, lo_pct=5, hi_pct=97):
    lo, hi = np.percentile(x, lo_pct), np.percentile(x, hi_pct)
    return np.clip((x - lo) / (hi - lo + 1e-9), 0, 1)


def smooth_attack_release(x, attack, release):
    y = np.empty_like(x)
    v = 0.0
    for i, s in enumerate(x):
        v += (s - v) * (attack if s > v else release)
        y[i] = v
    return y


def vocal_features(stem, rate, offset, n_frames):
    """Per video frame: loudness 0..1 and vowel weights for a singer's stem."""
    hop = rate / FPS
    n_fft = 2048
    mag = stem_mag = stft_mag(stem, n_fft, int(round(hop / 2)))  # 60 fps analysis
    freqs = np.fft.rfftfreq(n_fft, 1.0 / rate)
    t_ana = np.arange(len(mag)) * (int(round(hop / 2)) / rate) + offset
    voice = band(mag, freqs, 80, 6000)
    db = 20 * np.log10(voice + 1e-6)
    top = np.percentile(db, 98)
    loud = np.clip((db - (top - 34.0)) / 30.0, 0, 1)  # 34 dB window under the loudest parts
    b1 = band(mag, freqs, 250, 800)
    b2 = band(mag, freqs, 800, 1600)
    b3 = band(mag, freqs, 1600, 3500)
    b0 = band(mag, freqs, 80, 250)
    tot = b0 + b1 + b2 + b3 + 1e-6
    r0, r1, r2, r3 = b0 / tot, b1 / tot, b2 / tot, b3 / tot
    # rough vowel classes from where the energy sits:
    #   a: strong F1+F2 middle   o: F1 strong, little high   u: mostly low   i: low + high, little middle   e: in between
    va = np.clip(r1 + r2 - 0.55, 0, None) * 2.2
    vo = np.clip(r1 - r3 - 0.15, 0, None) * 1.8
    vu = np.clip(r0 - 0.35, 0, None) * 2.0
    vi = np.clip(r3 - r1 * 0.6 - 0.05, 0, None) * 2.5
    ve = np.clip(r2 + r3 - 0.45, 0, None) * 1.5
    V = np.stack([va, vi, vu, ve, vo], axis=1)
    V /= V.sum(axis=1, keepdims=True) + 1e-6
    tf = np.arange(n_frames) / FPS
    loud_f = np.interp(tf, t_ana, loud, left=0, right=0)
    loud_f = smooth_attack_release(loud_f, 0.75, 0.35)
    Vf = np.stack([np.interp(tf, t_ana, V[:, k], left=0.2, right=0.2) for k in range(5)], axis=1)
    return loud_f, Vf


def main():
    mix2, mix_rate = read_wav(os.path.join(SRC, "signaling-rei-corrupt-FULL-MIX.wav"))
    mix = mix2.mean(axis=1)
    duration = len(mix) / mix_rate
    stems = {}
    for key, name in (("rei", "signaling-adachi-rei-vocal.wav"), ("cc", "signaling-corrupt-chan-vocal.wav")):
        s, r = read_wav(os.path.join(SRC, name))
        stems[key] = (s.mean(axis=1), r)

    # --- stem alignment against the mix ---
    offsets = {}
    for key, (s, r) in stems.items():
        off, peak = find_offset(s, r, mix, mix_rate)
        offsets[key] = off
        print(f"stem {key}: offset {off:+.3f}s (correlation {peak:.3f})", file=sys.stderr)

    # --- onsets and tempo from the mix ---
    hop = 480  # 100 analysis frames per second at 48 kHz
    ana_rate = mix_rate / hop
    mag = stft_mag(mix, 2048, hop)
    freqs = np.fft.rfftfreq(2048, 1.0 / mix_rate)
    env = onset_envelope(mag)
    bpm0 = estimate_tempo(env, ana_rate)
    bpm, phase = fit_beats(env, ana_rate, bpm0)
    period = 60.0 / bpm
    beats = np.arange(phase, duration, period)
    print(f"tempo {bpm0:.2f} -> {bpm:.3f} bpm, first beat {phase:.3f}s, {len(beats)} beats", file=sys.stderr)

    # bass onsets, to pick which beat of four starts the bar
    low = band(mag, freqs, 30, 150)
    low_on = np.maximum(0, np.diff(np.log1p(50 * low), prepend=0))
    bi = np.clip(np.round(beats * ana_rate).astype(int), 0, len(low_on) - 1)
    lo_at = np.array([low_on[max(0, i - 2) : i + 3].max() for i in bi])
    # also: changes in loudness tend to land on bar starts
    rms_ana = np.sqrt((mag ** 2).sum(axis=1))
    loud = 20 * np.log10(rms_ana + 1e-6)
    jump = np.zeros(len(beats))
    for k, i in enumerate(bi):
        a, b = loud[max(0, i - 40) : i].mean() if i > 0 else loud[0], loud[i : i + 40].mean()
        jump[k] = max(0.0, b - a)
    scores = [lo_at[k::4].mean() + 0.15 * jump[k::4].mean() for k in range(4)]
    down = int(np.argmax(scores))
    bar_starts = beats[down::4]
    if bar_starts[0] > period * 0.5:  # pickup bar before the first full bar
        bar_starts = np.concatenate([[bar_starts[0] - 4 * period], bar_starts])
    print(f"downbeat offset {down}, {len(bar_starts)} bars", file=sys.stderr)

    # --- per video frame features ---
    n_frames = int(np.ceil(duration * FPS))
    tf = np.arange(n_frames) / FPS
    ta = np.arange(len(mag)) / ana_rate
    lowb = band(mag, freqs, 20, 150)
    midb = band(mag, freqs, 150, 2000)
    highb = band(mag, freqs, 2000, 14000)
    f_rms = norm01(np.interp(tf, ta, 20 * np.log10(rms_ana + 1e-6)), 3, 98)
    f_low = norm01(np.interp(tf, ta, 20 * np.log10(lowb + 1e-6)), 5, 98)
    f_mid = norm01(np.interp(tf, ta, 20 * np.log10(midb + 1e-6)), 5, 98)
    f_high = norm01(np.interp(tf, ta, 20 * np.log10(highb + 1e-6)), 5, 98)
    # onset and kick as decaying pulses so they read at 30 fps
    on_f = np.array([env[max(0, int(t * ana_rate) - 1) : int(t * ana_rate) + 3].max() for t in tf])
    on_f = smooth_attack_release(np.clip(on_f, 0, 1.5) / 1.5, 1.0, 0.25)
    kick_raw = low_on / (np.percentile(low_on, 99.5) + 1e-9)
    kick_f = np.array([kick_raw[max(0, int(t * ana_rate) - 1) : int(t * ana_rate) + 3].max() for t in tf])
    kick_f = smooth_attack_release(np.clip(kick_f, 0, 1), 1.0, 0.2)

    # 24 log-spaced spectrum bands for the visualizer ring, each normalised over the song
    edges_hz = np.geomspace(40, 14000, 25)
    spec = []
    for lo_hz, hi_hz in zip(edges_hz[:-1], edges_hz[1:]):
        bdb = 20 * np.log10(band(mag, freqs, lo_hz, hi_hz) + 1e-6)
        spec.append(norm01(np.interp(tf, ta, bdb), 10, 99))
    spec = np.stack(spec, axis=1)
    spec = np.stack([smooth_attack_release(spec[:, k], 0.9, 0.3) for k in range(spec.shape[1])], axis=1)

    voc = {}
    for key, (s, r) in stems.items():
        lf, vf = vocal_features(s, r, offsets[key], n_frames)
        voc[key] = (lf, vf)

    # --- per bar summary ---
    bars = []
    edges = list(bar_starts) + [bar_starts[-1] + 4 * period]
    for k in range(len(bar_starts)):
        t0, t1 = edges[k], edges[k + 1]
        if t0 >= duration:
            break
        m = (tf >= t0) & (tf < min(t1, duration))
        if not m.any():
            continue
        bars.append({
            "t0": round(float(t0), 4),
            "t1": round(float(t1), 4),
            "energy": round(float(f_rms[m].mean()), 3),
            "low": round(float(f_low[m].mean()), 3),
            "high": round(float(f_high[m].mean()), 3),
            "rei": round(float((voc["rei"][0][m] > 0.25).mean()), 3),
            "cc": round(float((voc["cc"][0][m] > 0.25).mean()), 3),
        })
    # energy levels: 0 quiet, 1 verse-ish, 2 full (chorus)
    e = np.array([b["energy"] * 0.6 + b["low"] * 0.4 for b in bars])
    e_s = np.convolve(np.pad(e, 1, mode="edge"), np.ones(3) / 3, mode="valid")
    q1, q2 = np.percentile(e_s, 25), np.percentile(e_s, 62)
    for b, v in zip(bars, e_s):
        b["level"] = 0 if v < q1 else (1 if v < q2 else 2)
    # sections: runs of bars, boundaries every 4 bars where level or singer pattern changes
    def sig(b):
        who = ("R" if b["rei"] > 0.2 else "") + ("C" if b["cc"] > 0.2 else "")
        return (b["level"], who or "-")
    sections = []
    k = 0
    while k < len(bars):
        j = k + 1
        while j < len(bars) and not ((j % 4 == 0) and sig(bars[j]) != sig(bars[j - 1])) and j - k < 16:
            j += 1
        lev = int(round(np.mean([bars[i]["level"] for i in range(k, j)])))
        sections.append({"bar0": k, "bar1": j, "t0": bars[k]["t0"], "t1": bars[j - 1]["t1"], "level": lev})
        k = j
    for s in sections:
        print(f"  section bars {s['bar0']:3d}-{s['bar1']:3d}  {s['t0']:7.2f}-{s['t1']:7.2f}s  level {s['level']}", file=sys.stderr)

    r3 = lambda a: [round(float(v), 3) for v in a]
    out = {
        "fps": FPS,
        "duration": round(duration, 4),
        "frames": n_frames,
        "bpm": round(bpm, 4),
        "beatPeriod": round(period, 6),
        "firstBeat": round(float(phase), 4),
        "downbeat": down,
        "barStarts": r3(bar_starts),
        "stemOffsets": {k: round(v, 4) for k, v in offsets.items()},
        "bars": bars,
        "sections": sections,
        "mix": {"rms": r3(f_rms), "low": r3(f_low), "mid": r3(f_mid), "high": r3(f_high), "onset": r3(on_f), "kick": r3(kick_f)},
        "spec": [[round(float(v), 2) for v in row] for row in spec],
        "voice": {k: {"loud": r3(v[0]), "vowel": [r3(row) for row in v[1]]} for k, v in voc.items()},
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
