"""Finish a SynthV vocal render: either a vocals-only master or a full mix with an instrumental.

Usage:
  python3 -I mix.py <vocals.wav> <out.wav>                        vocals only, -16 LUFS
  python3 -I mix.py <vocals.wav> <out.wav> --inst <instrumental.wav> [--vocal-db 0] [--ride 115.5:156.5:2.5 ...]
Full mix: the instrumental stays as it is, the vocals are set to the instrumental's loudness
plus --vocal-db, and each --ride START:END:DB adds gain to the vocals over that span (0.5 s fades).
Only a fast peak limiter is applied after that (ceiling -1.5 dB full mix, -2 dB vocals only).
Output is 24-bit 48 kHz WAV.
"""
import argparse
import re
import subprocess

import numpy as np

R = 48000


def lufs(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", out)[-1])


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(R), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def write(samples, path, ceiling_db):
    limit = 10 ** (ceiling_db / 20)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(R), "-ac", "2", "-i", "-",
                    "-af", f"alimiter=limit={limit:.3f}:attack=3:release=50:level=0:asc=0", "-c:a", "pcm_s24le", path],
                   input=samples.astype(np.float32).tobytes(), check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("vocals")
    ap.add_argument("out")
    ap.add_argument("--inst")
    ap.add_argument("--vocal-db", type=float, default=0.0)
    ap.add_argument("--ride", action="append", default=[])
    a = ap.parse_args()
    v = load(a.vocals)
    if not a.inst:
        write(v * 10 ** ((-16 - lufs(a.vocals)) / 20), a.out, -2.0)
    else:
        i = load(a.inst)
        n = max(len(v), len(i))
        v = np.pad(v, ((0, n - len(v)), (0, 0)))
        i = np.pad(i, ((0, n - len(i)), (0, 0)))
        gain = np.full(n, lufs(a.inst) - lufs(a.vocals) + a.vocal_db)
        t = np.arange(n) / R
        for spec in a.ride:
            start, end, db = map(float, spec.split(":"))
            gain += np.clip(np.minimum((t - start) / 0.5, (end - t) / 0.5), 0, 1) * db
        write(v * (10 ** (gain / 20))[:, None] + i, a.out, -1.5)
    print(f"{a.out}: {lufs(a.out):.1f} LUFS")


if __name__ == "__main__":
    main()
