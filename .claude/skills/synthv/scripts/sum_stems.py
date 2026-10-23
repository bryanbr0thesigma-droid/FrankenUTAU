"""Add rendered vocal stems together, each with its own gain, into one 32-bit float WAV.

Usage: python3 -I sum_stems.py <out.wav> <stem.wav>[:gain-dB] [...]
For balancing tracks (e.g. harmonies under the lead) and for projects rendered in several
passes because SynthV Basic only renders 3 tracks. The result goes to mix.py like a MixDown.
"""
import subprocess
import sys

import numpy as np

R = 48000


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(R), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)


def parse(spec):
    path, _, db = spec.rpartition(":")
    try:
        return path, float(db)
    except ValueError:
        return spec, 0.0


def main(out, *specs):
    total = np.zeros((0, 2))
    for spec in specs:
        path, db = parse(spec)
        x = load(path) * 10 ** (db / 20)
        n = max(len(total), len(x))
        total = np.pad(total, ((0, n - len(total)), (0, 0))) + np.pad(x, ((0, n - len(x)), (0, 0)))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(R), "-ac", "2", "-i", "-",
                    "-c:a", "pcm_f32le", out], input=total.astype(np.float32).tobytes(), check=True)
    print(f"{out}: {len(specs)} stems, peak {20 * np.log10(max(np.abs(total).max(), 1e-9)):.1f} dBFS")


if __name__ == "__main__":
    main(*sys.argv[1:])
