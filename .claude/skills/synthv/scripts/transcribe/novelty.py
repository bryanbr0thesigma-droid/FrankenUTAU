"""Spectral-change curve of a vocal (10 ms frames, same grid as f0.py): peaks where the sound changes,
e.g. consonant to vowel or one vowel to another. Usage: python -I novelty.py vocal.wav out.npy"""
import sys, numpy as np, librosa
y, sr = librosa.load(sys.argv[1], sr=16000, mono=True)
M = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=sr, n_fft=1024, hop_length=160, n_mels=40, fmax=7600))
M = M - M.max(0, keepdims=True)                      # spectral shape only, not loudness
M = np.maximum(M, -60)
k = 4
nov = np.zeros(M.shape[1])
for i in range(k, M.shape[1] - k):
    nov[i] = np.linalg.norm(M[:, i:i + k].mean(1) - M[:, i - k:i].mean(1)) / np.sqrt(M.shape[0])
nov /= np.percentile(nov[nov > 0], 95)
np.save(sys.argv[2], nov)
print(len(nov), "frames")
