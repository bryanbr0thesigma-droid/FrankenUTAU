"""Check that every note of a SynthV project has sound in its rendered stem.

    python -I notecheck.py project.svp <track-index>:<stem.wav> [...]

Prints, per track, how many notes render below -50 dB (silent), and the median and 95th-percentile note level.
Breaths ("br") and "-" continuations are skipped. Needs numpy and soundfile.
"""
import json
import sys

import numpy as np
import soundfile as sf

B = 705600000
p = json.loads(open(sys.argv[1], "rb").read().decode("utf-8").rstrip("\x00"))
bpm = p["time"]["tempo"][0]["bpm"]
lib = {g["uuid"]: g for g in p["library"]}
for spec in sys.argv[2:]:
    ti, wav = spec.split(":", 1)
    t = p["tracks"][int(ti)]
    x, sr = sf.read(wav, dtype="float32")
    m = x.mean(1) if x.ndim > 1 else x
    groups = [(t["mainGroup"], 0)] + [(lib[r["groupID"]], r["blickOffset"]) for r in t.get("groups", [])]
    silent, levels = [], []
    for g, off in groups:
        for n in g["notes"]:
            if n["lyrics"] in ("br", "-"):
                continue
            a = (off + n["onset"]) / B * 60 / bpm
            b = (off + n["onset"] + n["duration"]) / B * 60 / bpm
            seg = m[int(a * sr):int(b * sr)]
            lvl = 20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9) if len(seg) else -200.0
            levels.append(lvl)
            if lvl < -50:
                silent.append((round(a, 2), n["lyrics"], round(lvl)))
    print(f"{t['name']:10s} {len(levels)} notes, silent {len(silent)} {silent[:8]}  "
          f"note level p50 {np.median(levels):.1f} p95 {np.percentile(levels, 95):.1f} dB")
