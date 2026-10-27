"""Force-align lyrics to a vocal stem (wav2vec2 MMS aligner): word start/end times.
Usage: python -I align.py vocal.wav lyrics.txt out.json
Lines are aligned in order; a <star> token between lines soaks up ad-libs and backing bleed."""
import json, re, sys
import numpy as np, torch, torchaudio, librosa

NUM = {"1": "one", "2": "two", "3": "three", "4": "four"}
torch.set_num_threads(4)
bundle = torchaudio.pipelines.MMS_FA
model = bundle.get_model(with_star=True).eval()
DICT = bundle.get_dict(star="*")

lines = [l.strip() for l in open(sys.argv[2], encoding="utf-8") if l.strip()]
words, line_of = [], []
for li, line in enumerate(lines):
    for raw in line.split():
        for part in re.split(r"[,]", raw):
            w = NUM.get(re.sub(r"[^0-9]", "", part), None) if re.fullmatch(r"\d+[,.!?]*", part) else None
            norm = w or re.sub(r"[^a-z']", "", part.lower().replace("’", "'"))
            if norm:
                words.append((raw.strip(",.!?"), norm)); line_of.append(li)

y, sr = librosa.load(sys.argv[1], sr=bundle.sample_rate, mono=True)
# cut the silent tail so the last line cannot drift into it
frames = librosa.feature.rms(y=y, frame_length=1024, hop_length=320)[0]
loud = np.nonzero(20 * np.log10(frames + 1e-9) > -50)[0]
if len(loud):
    y = y[:min(len(y), (loud[-1] + 1) * 320 + sr // 2)]
y = torch.tensor(y)[None]
# emissions in overlapping 30 s windows (full-song attention would not fit in memory)
win, hop, ctx = 30 * sr, 26 * sr, 2 * sr
ems = []
with torch.inference_mode():
    for s in range(0, y.shape[1], hop):
        a = max(0, s - ctx); b = min(y.shape[1], s + win)
        e, _ = model(y[:, a:b])
        fr = e.shape[1] / (b - a)
        keep0 = int(round((s - a) * fr)); keep1 = int(round((min(s + hop, y.shape[1]) - a) * fr))
        ems.append(e[0, keep0:keep1])
        if b >= y.shape[1]: break
em = torch.cat(ems)[None]
frame = y.shape[1] / em.shape[1] / sr
print(f"{em.shape[1]} frames of {frame*1000:.1f} ms")

tokens, owner = [], []
for i, (_, w) in enumerate(words):
    if i and line_of[i] != line_of[i - 1]:
        tokens.append(DICT["*"]); owner.append(-1)
    for c in w:
        if c in DICT:
            tokens.append(DICT[c]); owner.append(i)
tgt = torch.tensor([tokens], dtype=torch.int32)
ali, scores = torchaudio.functional.forced_align(em, tgt, blank=0)
ali, scores = ali[0], scores[0].exp()
spans = torchaudio.functional.merge_tokens(ali, scores)
assert len(spans) == len(tokens), (len(spans), len(tokens))
out = []
for i, (raw, w) in enumerate(words):
    ss = [sp for sp, o in zip(spans, owner) if o == i]
    chars = [c for c in w if c in DICT]
    out.append(dict(word=raw, norm=w, line=line_of[i], start=round(ss[0].start * frame, 3),
                    end=round(ss[-1].end * frame, 3), score=round(float(np.mean([s.score for s in ss])), 3),
                    chars=[[c, round(sp.start * frame, 3), round(sp.end * frame, 3)] for c, sp in zip(chars, ss)]))
json.dump(dict(lines=lines, words=out), open(sys.argv[3], "w"), indent=1)
low = [o for o in out if o["score"] < 0.3]
print(f"{len(out)} words aligned, {len(low)} with low confidence")
for li in range(len(lines)):
    ws = [o for o in out if o["line"] == li]
    print(f"{ws[0]['start']:7.2f}-{ws[-1]['end']:7.2f}  {lines[li][:60]}")
