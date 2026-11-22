"""Word timings of a vocal stem with Whisper (kept to a JSON file, not printed)."""
import json, sys
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
from transformers import pipeline
x, sr = sf.read(sys.argv[1]); m = x.mean(1) if x.ndim > 1 else x
m16 = resample_poly(m, 160, sr // 100).astype("float32")
asr = pipeline("automatic-speech-recognition", model="openai/whisper-large-v3-turbo", device="cpu", chunk_length_s=30)
out = []
for a, b in json.load(open(sys.argv[2]))["sections"]:
    seg = m16[int(a * 16000):int(b * 16000)]
    r = asr({"raw": seg, "sampling_rate": 16000}, return_timestamps="word", generate_kwargs={"language": "en", "task": "transcribe"})
    for c in r["chunks"]:
        t0, t1 = c["timestamp"]
        out.append({"w": c["text"].strip(), "t0": round(a + t0, 2), "t1": round(a + (t1 if t1 is not None else t0 + 0.3), 2)})
    print(f"section {a}-{b}: {sum(1 for o in out if a <= o['t0'] < b)} words", flush=True)
json.dump(out, open(sys.argv[3], "w"), indent=0)
