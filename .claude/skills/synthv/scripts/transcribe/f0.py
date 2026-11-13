"""Pitch-track a vocal stem with CREPE: f0 in Hz, periodicity and loudness every 10 ms.
Usage: python -I f0.py vocal.wav out.npz [full|tiny]
"full" takes about 8 minutes for a 4.5-minute song on 4 cores; "tiny" about 3 and is enough for checks."""
import sys, numpy as np, torch, torchcrepe, librosa
torch.set_num_threads(4)
MODEL = sys.argv[3] if len(sys.argv) > 3 else "full"
y, sr = librosa.load(sys.argv[1], sr=16000, mono=True)
hop = 160
x = torch.tensor(y)[None]
f0, per = torchcrepe.predict(x, sr, hop, fmin=65, fmax=1400, model=MODEL, batch_size=512,
                             device="cpu", return_periodicity=True, decoder=torchcrepe.decode.viterbi)
per = torchcrepe.filter.median(per, 3)
f0 = f0[0].numpy(); per = per[0].numpy()
rms = librosa.feature.rms(y=y, frame_length=640, hop_length=hop, center=True)[0][:len(f0)]
t = np.arange(len(f0)) * hop / sr
np.savez(sys.argv[2], t=t, f0=f0, per=per, rms=rms)
v = (per > 0.5) & (rms > 0.01)
print(f"{len(t)} frames, voiced {v.mean()*100:.0f}%")
