"""Render a UTAU project (JSON) to WAV with the built-in PSOLA resampler.

Usage: python -I render.py project.json out_dir [--track NAME] [--from S --to S]

Project format (times in seconds, pitch in MIDI numbers):
{"tracks": [{"name": "rei", "voicebank": "/path/to/bank", "gain_db": 0,
             "notes": [{"t0": 1.0, "t1": 1.3, "midi": 67, "lyric": "し", "vel": 100, "vol": 100}, ...],
             "pitch": {"dt": 0.005, "midi": [...]}}]}          # optional; null/NaN = follow the notes
A lyric is one mora in kana or romaji (see kana.py; the project builder splits whole lines).
"-" holds the previous vowel, "R" is a rest. Writes out_dir/<name>.wav (44.1 kHz float).

How a note is placed (classic UTAU): its sample starts `preutterance` before the note so the
vowel lands on the beat, and fades in over the previous note's tail for `overlap` ms. When the
previous note is too short for that, both are scaled down so the consonant takes at most half of it.
"""
import argparse
import json
import os
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kana  # noqa: E402
import psola  # noqa: E402
from voicebank import Voicebank  # noqa: E402

SR = 44100
ADJACENT = 0.03          # notes closer than this are sung legato (s)
PORTA = 0.035            # pitch glide half-width between legato notes (s)
TAIL = 0.03              # fade after a phrase's last note (s)
NORM_DB = -16.0          # per-note loudness target (vowel part)
NORM_MAX = 12.0          # largest correction (dB)


def load_wav(path, cache):
    if path not in cache:
        x, sr = sf.read(path, dtype="float64", always_2d=True)
        x = x.mean(axis=1)
        if sr != SR:
            import librosa
            x = librosa.resample(x, orig_sr=sr, target_sr=SR)
        cache[path] = x
    return cache[path]


def pitch_curve(notes, track_pitch, t_end, dt=0.005):
    """Target MIDI every dt seconds: the notes with short glides, overridden by track_pitch."""
    n = int(t_end / dt) + 2
    base = np.full(n, np.nan)
    for i, nt in enumerate(notes):
        a, b = int(nt["t0"] / dt), int(nt["t1"] / dt) + 1
        base[a:b] = nt["midi"]
        if i + 1 < len(notes) and notes[i + 1]["t0"] - nt["t1"] < ADJACENT:
            base[b:int(notes[i + 1]["t0"] / dt) + 1] = nt["midi"]
    # fill gaps by holding the nearest note so tails and leads have a pitch
    idx = np.where(np.isfinite(base))[0]
    if len(idx):
        base = np.interp(np.arange(n), idx, base[idx])
    # glides between legato notes
    for i in range(len(notes) - 1):
        a, b = notes[i], notes[i + 1]
        if b["t0"] - a["t1"] < ADJACENT and a["midi"] != b["midi"]:
            c = b["t0"]
            lo, hi = int((c - PORTA) / dt), int((c + PORTA) / dt)
            for k in range(max(lo, 0), min(hi, n)):
                u = (k * dt - (c - PORTA)) / (2 * PORTA)
                base[k] = a["midi"] + (b["midi"] - a["midi"]) * (0.5 - 0.5 * np.cos(np.pi * u))
    if track_pitch and track_pitch.get("midi"):
        tp = np.array([np.nan if v is None else v for v in track_pitch["midi"]], float)
        tdt = track_pitch.get("dt", dt)
        tt = np.arange(n) * dt
        src = np.interp(tt, np.arange(len(tp)) * tdt, np.nan_to_num(tp, nan=-1), left=-1, right=-1)
        ok = np.interp(tt, np.arange(len(tp)) * tdt, np.isfinite(tp).astype(float), left=0, right=0) > 0.999
        base = np.where(ok & (src > 0), src, base)
    return base


def prepare(notes, vb):
    """Resolve aliases and effective preutterance/overlap (seconds) for each sung note."""
    out = []
    prev = None
    for nt in notes:
        lyr = nt["lyric"].strip()
        if lyr in ("R", "r", "", "っ", "cl", "br"):
            prev = None
            continue
        legato = prev is not None and nt["t0"] - prev["t1"] < ADJACENT
        if lyr in ("-", "+", "ー"):
            if not prev:
                continue
            v = kana.vowel(prev["mora"])
            if v is None:
                continue
            lyr = kana.VOWEL_KANA[v]
        else:
            m = kana.moras(lyr)
            if len(m) != 1:
                raise SystemExit(f"note at {nt['t0']:.2f}s has lyric {nt['lyric']!r}: one mora per note")
            lyr = m[0]
        pv = kana.vowel(prev["mora"]) if legato else None
        e = vb.lookup(lyr, int(round(nt["midi"])), pv)
        if e is None:
            print(f"warning: {vb.name} has no sample for {lyr!r} at {nt['t0']:.2f}s; skipped", file=sys.stderr)
            continue
        vs = 2 ** ((100 - nt.get("vel", 100)) / 100)
        pre, ovl = e.preutter * vs / 1000, e.overlap * vs / 1000
        if legato:
            room = (nt["t0"] - prev["t0"]) * 0.5
            if pre - ovl > room > 0:
                k = room / (pre - ovl)
                pre, ovl = pre * k, ovl * k
        rec = dict(nt, mora=lyr, entry=e, pre=pre, ovl=ovl, legato=legato)
        out.append(rec)
        prev = rec
    for i, r in enumerate(out):
        r["next_legato"] = i + 1 < len(out) and out[i + 1]["legato"]
    return out


def render_track(tr, t_from=None, t_to=None):
    vb = Voicebank(tr["voicebank"])
    notes = sorted(tr["notes"], key=lambda n: n["t0"])
    sung = prepare(notes, vb)
    t_end = max(n["t1"] for n in notes) + 1.0
    curve = pitch_curve(notes, tr.get("pitch"), t_end)
    dt = 0.005
    lead = 0.5                                       # room before t=0 for the first consonant
    y = np.zeros(int((t_end + lead) * SR))
    wavs, marks = {}, {}
    for i, r in enumerate(sung):
        if t_from is not None and (r["t1"] < t_from or r["t0"] > t_to):
            continue
        e = r["entry"]
        start = r["t0"] - r["pre"]
        if r["next_legato"]:
            nx = sung[i + 1]
            end = nx["t0"] - nx["pre"] + max(nx["ovl"], 0.005)
        else:
            end = r["t1"] + TAIL
        out_len = int((end - start) * SR)
        if out_len <= 0:
            continue
        tt = start + np.arange(out_len) / SR
        midi = np.interp(tt, np.arange(len(curve)) * dt, curve)
        f0 = 440.0 * 2 ** ((midi - 69) / 12)
        x = load_wav(e.wav, wavs)
        seg = psola.resample(x, SR, e.offset, e.consonant, e.cutoff, out_len, f0,
                             vel=r.get("vel", 100), cache=marks, force_f0=tr.get("force_f0"))
        # per-note loudness: even out the vowel level across samples
        vstart = int(min(r["pre"] + 0.02, out_len / 2 / SR) * SR)
        body = seg[vstart:]
        if len(body) > SR // 50:
            rms = np.sqrt(np.mean(body ** 2)) + 1e-9
            g = np.clip(NORM_DB - 20 * np.log10(rms), -NORM_MAX, NORM_MAX)
            seg = seg * 10 ** (g / 20)
            # keep consonant bursts (glitchy banks have very loud ones) within 6 dB of the vowel
            ceil = NORM_DB + 6
            fr = int(0.01 * SR)
            for k in range(0, min(vstart + fr, len(seg)) - fr + 1, fr // 2):
                lv = 20 * np.log10(np.sqrt(np.mean(seg[k:k + fr] ** 2)) + 1e-9)
                if lv > ceil:
                    seg[k:k + fr] *= np.hanning(fr) * (10 ** ((ceil - lv) / 20) - 1) + 1
        seg = seg * r.get("vol", 100) / 100
        # envelopes: fade in over this note's overlap when legato, fade out under the next note
        fin = int(max(r["ovl"], 0.005) * SR) if r["legato"] else int(0.004 * SR)
        fout = int(max(sung[i + 1]["ovl"], 0.005) * SR) if r["next_legato"] else int(TAIL * SR)
        fin, fout = min(fin, out_len // 2), min(fout, out_len // 2)
        env = np.ones(out_len)
        env[:fin] = np.linspace(0, 1, fin)
        if fout:
            env[-fout:] = np.minimum(env[-fout:], np.linspace(1, 0, fout))
        a = int((start + lead) * SR)
        y[a:a + out_len] += (seg * env)[:len(y) - a]
    y = y[int(lead * SR):] * 10 ** (tr.get("gain_db", 0) / 20)
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project"); ap.add_argument("out_dir")
    ap.add_argument("--track"); ap.add_argument("--from", dest="t_from", type=float); ap.add_argument("--to", type=float)
    a = ap.parse_args()
    proj = json.load(open(a.project, encoding="utf-8"))
    os.makedirs(a.out_dir, exist_ok=True)
    for tr in proj["tracks"]:
        if a.track and tr["name"] != a.track:
            continue
        y = render_track(tr, a.t_from, a.to)
        path = os.path.join(a.out_dir, f"{tr['name']}.wav")
        sf.write(path, y.astype(np.float32), SR, subtype="FLOAT")
        peak = np.max(np.abs(y)) if len(y) else 0
        print(f"{path}: {len(y) / SR:.1f} s, peak {20 * np.log10(peak + 1e-9):.1f} dBFS")


if __name__ == "__main__":
    main()
