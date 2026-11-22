"""Pitch curve of a vocal stem with CREPE (full model, Viterbi decoding), in the format follow*.py use: 5 ms frames,
cents (MIDI x 100), 0 = unvoiced. CREPE does not fall to subharmonics the way an autocorrelation tracker does on a
separated stem (it read E2 or A2 where the singer holds E4).

    python crepe_pitch.py STEM.wav out.npy [periodicity_threshold]
"""
import sys

import numpy as np
import soundfile as sf
import torch
import torchcrepe
from scipy.signal import resample_poly

src, out = sys.argv[1], sys.argv[2]
thr = float(sys.argv[3]) if len(sys.argv) > 3 else 0.35
torch.set_num_threads(4)
x, sr = sf.read(src)
x = x.mean(1) if x.ndim > 1 else x
m = resample_poly(x, 16000, sr).astype("float32")
f0, per = torchcrepe.predict(torch.from_numpy(m)[None], 16000, hop_length=80, fmin=70, fmax=1000, model="full",
                             decoder=torchcrepe.decode.viterbi, return_periodicity=True, batch_size=1024, device="cpu")
f0, per = f0[0].numpy(), per[0].numpy()
per = np.convolve(per, np.ones(3) / 3, "same")
hop = 80
rms = np.array([np.sqrt((m[i * hop:(i + 1) * hop] ** 2).mean() + 1e-12) for i in range(len(f0))])
db = 20 * np.log10(rms / rms.max())
c = np.where((per > thr) & (db > -45), 1200 * np.log2(np.maximum(f0, 1) / 440) + 6900, 0.0)
n = int(len(x) / sr * 200)
c = np.pad(c, (0, max(0, n - len(c))))[:n]
np.save(out, c.astype("float32"))
print(f"{out}: {len(c)} frames, {int((c > 0).sum() * 0.005)} s voiced")
