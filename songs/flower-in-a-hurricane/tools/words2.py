"""Word timings with Whisper, in windows that overlap by 2 s on each side; a word belongs to the window whose core
(non-overlapping part) holds its midpoint, so nothing is doubled. Known hallucinations are dropped."""
import json, sys, re
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
from transformers import pipeline
x, sr = sf.read(sys.argv[1]); m = x.mean(1) if x.ndim > 1 else x
m16 = resample_poly(m, 160, sr // 100).astype("float32")
asr = pipeline("automatic-speech-recognition", model="openai/whisper-large-v3-turbo", device="cpu")
cores = json.load(open(sys.argv[2]))["cores"]
HALL = re.compile(r"^(thank you|thanks for watching|you)\W*$", re.I)
out = []
for a, b in cores:
    wa, wb = max(0, a - 2.0), b + 2.0
    seg = m16[int(wa * 16000):int(wb * 16000)]
    r = asr({"raw": seg, "sampling_rate": 16000}, return_timestamps="word",
            generate_kwargs={"language": "en", "task": "transcribe", "condition_on_prev_tokens": False})
    ws = []
    for c in r["chunks"]:
        t0, t1 = c["timestamp"]
        t1 = t1 if t1 is not None else t0 + 0.3
        ws.append({"w": c["text"].strip(), "t0": round(wa + t0, 2), "t1": round(wa + t1, 2)})
    # drop "thank you" style hallucinations (whole phrases only)
    txt = " ".join(w["w"] for w in ws)
    keep = [w for w in ws if a <= (w["t0"] + w["t1"]) / 2 < b]
    keep = [w for i, w in enumerate(keep) if not (w["w"].lower().strip(".,!?") in ("thank", "you") and
            any(k["w"].lower().startswith("thank") for k in keep[max(0, i - 1):i + 2]))]
    out += keep
    print(f"core {a}-{b}: {len(keep)} words", flush=True)
json.dump(out, open(sys.argv[3], "w"), indent=0)
