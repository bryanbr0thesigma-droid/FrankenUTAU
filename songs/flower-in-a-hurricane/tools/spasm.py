"""Find "spasms" in a rendered part and in the pitch curve it was given, and lead/harmony syllables out of sync.

    python spasm.py part.wav [part2.wav ...]                  pitch yelps and volume jerks in renders
    python spasm.py --curve pitch.npy                          yelps already in a pitch curve (5 ms frames)
    python spasm.py --sync phones_lead.json phones_harm.json cast_harm.json
"""
import json
import sys

import numpy as np


def yelps(c, fp=0.005, max_len=0.15, jump=150):
    """short excursions: the pitch leaves its local line by > jump cents and comes back within max_len s"""
    from scipy.ndimage import median_filter
    v = c > 0
    ref = median_filter(np.where(v, c, np.nan), size=int(0.25 / fp), mode="nearest")
    dev = np.where(v & ~np.isnan(ref), np.abs(c - ref), 0)
    out, i = [], 0
    while i < len(c):
        if dev[i] > jump:
            j = i
            while j < len(c) and dev[j] > jump:
                j += 1
            if (j - i) * fp <= max_len and v[max(0, i - 1)] and v[min(len(c) - 1, j)]:
                out.append((i * fp, (j - i) * fp, float(np.max(dev[i:j]))))
            i = j
        else:
            i += 1
    return out


if sys.argv[1] in ("--vowels", "--holes"):
    pass
elif sys.argv[1] == "--curve":
    c = np.load(sys.argv[2]).astype(float)
    y = yelps(c)
    print(f"{sys.argv[2]}: {len(y)} yelps; e.g. " + ", ".join(f"{int(t // 60)}:{t % 60:04.1f} ({d * 1000:.0f} ms, {dv:.0f} c)" for t, d, dv in y[:8]))
elif sys.argv[1] == "--sync":
    L = json.load(open(sys.argv[2]))
    Hh = json.load(open(sys.argv[3]))
    parts = json.load(open(sys.argv[4]))["parts"]
    VOW = set("iy ih ey eh ae aa ao ow uh uw ah er ax ay aw oy".split())
    lv = np.array(sorted(p[1] for w in L for p in w["phones"] if p[0] in VOW and p[1] >= 0))
    hv = [p[1] for w in Hh for p in w["phones"] if p[0] in VOW and p[1] >= 0 and any(q["t0"] <= p[1] < q["t1"] for q in parts)]
    d = np.array([np.min(np.abs(lv - t)) for t in hv])
    print(f"harmony syllables: {len(d)}; off the nearest lead syllable by >80 ms: {100 * np.mean(d > 0.08):.0f}%, >150 ms: {100 * np.mean(d > 0.15):.0f}%")
else:
    import parselmouth
    import soundfile as sf
    for p in sys.argv[1:]:
        x, sr = sf.read(p)
        x = x.mean(1) if x.ndim > 1 else x
        pt = parselmouth.Sound(x, sr).to_pitch_ac(time_step=0.005, pitch_floor=70, pitch_ceiling=1100, voicing_threshold=0.45)
        f = pt.selected_array["frequency"]
        c = np.where(f > 0, 1200 * np.log2(np.maximum(f, 1) / 440) + 6900, 0)
        y = yelps(c)
        H = sr // 100
        k = len(x) // H
        db = 20 * np.log10(np.sqrt((x[:k * H].reshape(k, H) ** 2).mean(1)) + 1e-7)
        sung = db > db.max() - 35
        jerk = np.where(sung[2:] & sung[:-2] & (np.abs(db[2:] - db[:-2]) > 10))[0]
        jerks = [t for i, t in enumerate(jerk) if i == 0 or t - jerk[i - 1] > 10]
        print(f"{p}: {len(y)} pitch yelps, {len(jerks)} volume jerks (>10 dB in 20 ms)")


def in_vowels(wav, phones_json, cast_json=None, margin=0.04):
    """volume jerks (>6 dB within 20 ms) and pitch yelps that happen inside vowels, away from their edges"""
    import parselmouth
    import soundfile as sf
    sys.path.insert(0, ".")
    from follow2 import phrases2
    VOW = set("iy ih ey eh ae aa ao ow uh uw ah er ax ay aw oy".split())
    parts = json.load(open(cast_json))["parts"] if cast_json else None
    x, sr = sf.read(wav)
    x = x.mean(1) if x.ndim > 1 else x
    H = sr // 100
    k = len(x) // H
    db = 20 * np.log10(np.sqrt((x[:k * H].reshape(k, H) ** 2).mean(1)) + 1e-7)
    pt = parselmouth.Sound(x, sr).to_pitch_ac(time_step=0.005, pitch_floor=70, pitch_ceiling=1100, voicing_threshold=0.45)
    kp = int(len(x) / sr / 0.005)
    f = np.interp(np.arange(kp) * 0.005, pt.xs(), pt.selected_array["frequency"], left=0, right=0)
    c = np.where(f > 0, 1200 * np.log2(np.maximum(f, 1) / 440) + 6900, 0)
    nj = ny = nv = 0
    for phr in phrases2(json.load(open(phones_json))):
        for p, s, e in phr:
            if p not in VOW or e - s < 2 * margin + 0.05:
                continue
            if parts is not None and not any(q["t0"] <= s < q["t1"] for q in parts):
                continue
            a, b = int((s + margin) / 0.01), int((e - margin) / 0.01)
            seg = db[a:b]
            if len(seg) < 3 or seg.max() < db.max() - 40:
                continue
            nv += 1
            nj += int((np.abs(seg[2:] - seg[:-2]) > 6).any())
            cs = c[int((s + margin) / 0.005):int((e - margin) / 0.005)]
            cs = cs[cs > 0]
            ny += int(len(cs) > 4 and (np.abs(np.diff(cs)) > 120).any())
    return nv, nj, ny


if __name__ == "__main__" and sys.argv[1] == "--vowels":
    for w in sys.argv[4:]:
        nv, nj, ny = in_vowels(w, sys.argv[2], sys.argv[3] if sys.argv[3] != "-" else None)
        print(f"{w}: {nv} vowels; with a volume jerk inside {100 * nj / max(1, nv):.0f}%, with a pitch jump inside {100 * ny / max(1, nv):.0f}%")


if __name__ == "__main__" and sys.argv[1] == "--holes":
    # dropouts: 10+ ms inside a vowel more than 25 dB below that vowel's own median level
    import soundfile as sf
    sys.path.insert(0, ".")
    from follow2 import phrases2
    VOW = set("iy ih ey eh ae aa ao ow uh uw ah er ax ay aw oy".split())
    parts = json.load(open(sys.argv[3]))["parts"]
    for w in sys.argv[4:]:
        x, sr = sf.read(w)
        x = x.mean(1) if x.ndim > 1 else x
        H = sr // 100
        k = len(x) // H
        db = 20 * np.log10(np.sqrt((x[:k * H].reshape(k, H) ** 2).mean(1)) + 1e-9)
        nv = nh = 0
        for phr in phrases2(json.load(open(sys.argv[2]))):
            for p, s, e in phr:
                if p in VOW and e - s > 0.12 and any(q["t0"] <= s < q["t1"] for q in parts):
                    seg = db[int((s + 0.03) / 0.01):int((e - 0.03) / 0.01)]
                    if len(seg) < 3 or seg.max() < db.max() - 40:
                        continue
                    nv += 1
                    nh += int((seg < np.median(seg) - 25).any())
        print(f"{w}: {nv} vowels, {100 * nh / max(1, nv):.0f}% with a dropout")
