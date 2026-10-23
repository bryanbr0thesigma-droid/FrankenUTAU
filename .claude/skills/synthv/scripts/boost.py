"""Even out vocal levels by raising SynthV's Loudness curve on notes that render quiet.

Usage: python3 -I boost.py <in.svp> <out.svp> <track-index>:<track-stem.wav>:<target-dB> [...]
Measures each note's level in that track's rendered stem, then writes a group Loudness curve
point at each note: boost = target - level, median-smoothed over neighbouring notes, clamped
to 0..12 dB (SynthV's maximum). Existing curve values are added to, so it can be run again on a
re-render. Breaths ("br") are not measured. Typical targets: -19.5 for a lead, -20.5 for backing.
"""
import math
import os
import statistics
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svp  # noqa: E402

RATE = 8000
MAX_DB = 12.0
SILENT_DB = -60.0


def mono(path):
    # Average the channels explicitly: ffmpeg's "-ac 1" scales differently per output format,
    # and the targets above are calibrated on the channel average.
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-af", "pan=mono|c0=0.5*c0+0.5*c1",
                          "-ar", str(RATE), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def curve_value(points, blick):
    pts = list(zip(points[0::2], points[1::2]))
    if not pts:
        return 0.0
    if blick <= pts[0][0]:
        return pts[0][1]
    for (b0, v0), (b1, v1) in zip(pts, pts[1:]):
        if b0 <= blick <= b1:
            return v0 + (v1 - v0) * (blick - b0) / (b1 - b0) if b1 > b0 else v1
    return pts[-1][1]


def note_db(audio, blick_offset, n, bpm):
    s0 = (blick_offset + n["onset"]) / svp.Q * 60 / bpm
    s1 = s0 + n["duration"] / svp.Q * 60 / bpm
    seg = audio[int(s0 * RATE):int(s1 * RATE)]
    rms = math.sqrt(float(np.mean(seg ** 2))) if len(seg) else 0.0
    return 20 * math.log10(max(rms, 1e-9))


def boost_track(d, track_index, wav, target):
    bpm = d["time"]["tempo"][0]["bpm"]
    audio = mono(wav)
    lib = {g["uuid"]: g for g in d["library"]}
    # A group can be placed more than once (a repeated chorus); its curve is shared, so measure
    # every placement and boost once by the average.
    offsets = {}
    for ref in d["tracks"][track_index].get("groups", []):
        offsets.setdefault(ref["groupID"], []).append(ref["blickOffset"])
    for gid, offs in offsets.items():
        g = lib[gid]
        old = g["parameters"]["loudness"]["points"]
        pts, silent = [], []
        for notes in svp.group_phrases(g):
            raw = []
            for n in notes:
                levels = [note_db(audio, off, n, bpm) for off in offs]
                if n["lyrics"] != "br" and max(levels) < SILENT_DB:
                    silent.append(n["lyrics"])
                raw.append(None if n["lyrics"] == "br" else target - sum(levels) / len(levels))
            for i, n in enumerate(notes):
                window = [b for b in raw[max(0, i - 2):i + 3] if b is not None]
                extra = statistics.median(window) if window else 0.0
                pts += [n["onset"], round(min(MAX_DB, max(0.0, curve_value(old, n["onset"]) + extra)), 2)]
            pts += [notes[-1]["onset"] + notes[-1]["duration"], pts[-1]]
        g["parameters"]["loudness"] = {"mode": "cubic", "points": pts}
        vals = pts[1::2]
        if max(vals) > 0.5:
            print(f"track {track_index} {g['name'].strip():20} x{len(offs)} boost avg {sum(vals) / len(vals):4.1f} dB, max {max(vals):4.1f} dB")
        if silent:
            print(f"warning: track {track_index} {g['name'].strip()}: {len(silent)} notes rendered silent "
                  f"({' '.join(silent[:8])}...); check their language overrides")


def main(src, dst, *specs):
    d = svp.load(src)
    for spec in specs:
        ti, rest = spec.split(":", 1)
        wav, target = rest.rsplit(":", 1)
        boost_track(d, int(ti), wav, float(target))
    svp.save(d, dst)


if __name__ == "__main__":
    main(*sys.argv[1:])
