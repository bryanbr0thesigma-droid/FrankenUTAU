"""Sing a song with an Arpasing UTAU bank by following an isolated vocal: its words, phoneme timing and pitch.

    python follow.py align  VOCAL.wav words.json  phones.json        # CTC forced alignment of the words' phonemes
    python follow.py pitch  VOCAL.wav pitch.npy                      # f0 per 5 ms frame, cleaned (cents, 0 = unvoiced)
    python follow.py render phones.json pitch.npy cast.json out.wav  # units -> notes -> voice2utau.sing engine

words.json: [{"w", "t0", "t1"}] (rough word times, e.g. Whisper). cast.json: {"parts": [{"t0", "t1", "bank", "transpose"}]}.
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

HERE = Path(__file__).resolve().parent
sys.path.insert(0, os.environ.get("V2U", str(HERE.parent / "v2u_src")))  # Voice-2-utau checkout (voice2utau.sing)

FP = 5.0
VOW = "iy ih ey eh ae aa ao ow uh uw ah er ax ay aw oy".split()
IPA = {  # ARPAbet -> recogniser tokens accepted for it (espeak IPA)
    "aa": "ɑː ɑ a ɒ aː", "ae": "æ a ɛ", "ah": "ʌ ə ɐ", "ax": "ə ɐ ʌ ɪ ᵻ", "ao": "ɔː ɔ ɑː ɒ", "aw": "aʊ", "ay": "aɪ a aɪə",
    "eh": "ɛ e", "er": "ɚ ɜː ɜ", "ey": "eɪ e eː", "ih": "ɪ ᵻ i", "iy": "iː i", "ow": "oʊ o oː əʊ", "oy": "ɔɪ",
    "uh": "ʊ u", "uw": "uː u", "b": "b β", "ch": "tʃ", "d": "d ɾ", "dh": "ð d", "f": "f", "g": "ɡ", "hh": "h", "jh": "dʒ",
    "k": "k", "l": "l ɫ əl", "m": "m", "n": "n n̩", "ng": "ŋ", "p": "p", "r": "ɹ r", "s": "s", "sh": "ʃ", "t": "t ɾ ʔ",
    "th": "θ", "v": "v", "w": "w", "y": "j", "z": "z s", "zh": "ʒ",
}


def word_phones(w: str, d) -> list[str]:
    key = re.sub(r"[^a-z']", "", w.lower())
    pr = d.get(key) or d.get(key.strip("'")) or []
    if not pr:
        return []
    out = []
    for p in pr[0]:
        base = re.sub(r"\d", "", p).lower()
        if base == "ah" and p.endswith("0"):
            base = "ax"
        out.append(base)
    return out


# ------------------------------------------------------------------ alignment
def ctc_align(logp: np.ndarray, cols: list[list[int]], blank: int = 0) -> list[tuple[int, int]]:
    """Viterbi CTC alignment; each label is a set of token columns (max over them). Returns (first, last) frame per label."""
    T = logp.shape[0]
    em = np.stack([logp[:, c].max(1) for c in cols], 1)          # T x L
    L = len(cols)
    S = 2 * L + 1
    NEG = -1e18
    dp = np.full((T, S), NEG)
    bp = np.zeros((T, S), dtype=np.int16)
    dp[0, 0] = logp[0, blank]
    if S > 1:
        dp[0, 1] = em[0, 0]
    for t in range(1, T):
        prev = dp[t - 1]
        stay = prev
        step = np.concatenate([[NEG], prev[:-1]])
        skip = np.concatenate([[NEG, NEG], prev[:-2]])
        # skipping a blank is allowed between two labels (they are different phones, even if the same token)
        allow = np.zeros(S, bool)
        allow[3::2] = True
        skip = np.where(allow, skip, NEG)
        cand = np.stack([stay, step, skip])
        k = cand.argmax(0)
        best = cand.max(0)
        emis = np.empty(S)
        emis[0::2] = logp[t, blank]
        emis[1::2] = em[t]
        dp[t] = best + emis
        bp[t] = k
    s = S - 1 if dp[T - 1, S - 1] >= dp[T - 1, S - 2] else S - 2
    path = np.empty(T, dtype=int)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= bp[t, s]
    spans = []
    for j in range(L):
        fr = np.where(path == 2 * j + 1)[0]
        spans.append((int(fr[0]), int(fr[-1])) if len(fr) else (-1, -1))
    return spans


def align(vocal: str, words_json: str, out: str) -> None:
    import cmudict
    import torch
    from transformers import AutoTokenizer, Wav2Vec2ForCTC

    mid = "facebook/wav2vec2-xlsr-53-espeak-cv-ft"
    tok = AutoTokenizer.from_pretrained(mid)
    model = Wav2Vec2ForCTC.from_pretrained(mid).eval()
    vocab = tok.get_vocab()
    colmap = {p: [vocab[t] for t in toks.split() if t in vocab] for p, toks in IPA.items()}
    d = cmudict.dict()
    x, sr = sf.read(vocal)
    m = x.mean(1) if x.ndim > 1 else x
    m16 = resample_poly(m, 160, sr // 100).astype("float32")
    words = [w for w in json.load(open(words_json)) if word_phones(w["w"], d)]
    # chunks of <= 14 s, cut at the widest gaps between words
    chunks, cur = [], []
    for w in words:
        if cur and (w["t1"] - cur[0]["t0"] > 14 or w["t0"] - cur[-1]["t1"] > 1.5):
            chunks.append(cur)
            cur = []
        cur.append(w)
    if cur:
        chunks.append(cur)
    res = []
    for ch in chunks:
        a = max(0.0, ch[0]["t0"] - 0.5)
        b = ch[-1]["t1"] + 0.6
        seg = m16[int(a * 16000):int(b * 16000)]
        seg = (seg - seg.mean()) / (seg.std() + 1e-7)
        with torch.no_grad():
            lg = model(torch.from_numpy(seg)[None]).logits[0]
        logp = torch.log_softmax(lg, -1).numpy()
        fps = logp.shape[0] / (len(seg) / 16000)
        labels, owner = [], []
        for wi, w in enumerate(ch):
            for p in word_phones(w["w"], d):
                labels.append(p)
                owner.append(wi)
        spans = ctc_align(logp, [colmap[p] for p in labels], blank=vocab["<pad>"])
        for wi, w in enumerate(ch):
            ph = [(labels[k], spans[k]) for k in range(len(labels)) if owner[k] == wi]
            res.append({"w": w["w"], "phones": [[p, round(a + s0 / fps, 3), round(a + (s1 + 1) / fps, 3)] for p, (s0, s1) in ph]})
        print(f"aligned {a:.1f}-{b:.1f}: {len(ch)} words, {len(labels)} phones", flush=True)
    json.dump(res, open(out, "w"), indent=0)


# ------------------------------------------------------------------ pitch
def pitch(vocal: str, out: str) -> None:
    import parselmouth
    x, sr = sf.read(vocal)
    m = (x.mean(1) if x.ndim > 1 else x).astype("float64")
    snd = parselmouth.Sound(m, sr)
    p = snd.to_pitch_ac(time_step=FP / 1000, pitch_floor=75, pitch_ceiling=1000, voicing_threshold=0.3,
                        silence_threshold=0.02, octave_jump_cost=0.6)
    n = int(len(m) / sr * 1000 / FP)
    f0 = np.interp(np.arange(n) * FP / 1000, p.xs(), p.selected_array["frequency"], left=0, right=0)
    # interp across a voiced/unvoiced edge gives in-between values: keep frames whose nearest Praat frame is voiced
    near = p.selected_array["frequency"][np.clip(np.round((np.arange(n) * FP / 1000 - p.xs()[0]) / (FP / 1000)).astype(int), 0, len(p.xs()) - 1)]
    f0 = np.where(near > 0, f0, 0)
    hop = int(sr * FP / 1000)
    rms = np.array([np.sqrt((m[i * hop:(i + 1) * hop] ** 2).mean() + 1e-12) for i in range(n)])
    db = 20 * np.log10(rms / rms.max())
    f0[db < -45] = 0
    c = np.where(f0 > 0, 1200 * np.log2(np.maximum(f0, 1) / 440) + 6900, 0.0)
    # octave errors: compare with a running median of the voiced frames around (+-0.4 s)
    v = np.where(c > 0)[0]
    W = int(400 / FP)
    for i in v:
        loc = c[max(0, i - W):i + W]
        loc = loc[loc > 0]
        med = np.median(loc)
        while c[i] - med > 700:
            c[i] -= 1200
        while med - c[i] > 700:
            c[i] += 1200
    np.save(out, c.astype("float32"))
    print(f"pitch: {len(c)} frames, {int((c > 0).sum() * FP / 1000)} s voiced")


# ------------------------------------------------------------------ units -> notes
def phrases(words: list[dict], cents: np.ndarray, rest_gap: float = 0.18) -> list[list[list]]:
    """Split the phone stream into phrases at silences; return [[phone, start, end], ...] per phrase with tidy times."""
    ph = [list(p) for w in words for p in w["phones"] if p[1] >= 0]
    ph.sort(key=lambda p: p[1])
    voiced = cents > 0

    def is_voiced(t):
        return voiced[min(len(voiced) - 1, max(0, int(t * 1000 / FP)))]

    def run_end(t, limit):
        """end of the voiced stretch that contains t (gaps up to 40 ms bridged), at most `limit`"""
        while t < limit and (is_voiced(t) or is_voiced(t + 0.04)):
            t += FP / 1000
        return min(t, limit)

    # a word-final consonant before a pause comes where the held vowel actually stops (CTC tends to place it early)
    for i in range(len(ph)):
        if ph[i][0] in VOW:
            continue
        nxt = ph[i + 1][1] if i + 1 < len(ph) else ph[i][1] + 3.0
        if nxt - ph[i][1] < 0.35 or (i + 1 < len(ph) and ph[i + 1][0] not in VOW and nxt - ph[i][1] < 0.6):
            continue
        j = i
        while j > 0 and ph[j - 1][0] not in VOW:
            j -= 1
        if j == 0:
            continue
        v = ph[j - 1]
        end = run_end(v[1], nxt - 0.05)
        voiced_c = ph[j][0] in ("m", "n", "ng", "l", "r", "w", "y", "v", "dh", "z", "zh")
        target = end - (0.09 if voiced_c else 0.0) - 0.04 * (i - j)
        delta = target - ph[j][1]
        if delta > 0.05:
            for k in range(j, i + 1):
                ph[k][1] += delta
                ph[k][2] += delta

    out, cur = [], []
    for i, (p, s, e) in enumerate(ph):
        nxt = ph[i + 1][1] if i + 1 < len(ph) else s + 2.0
        # the phone lasts until the next one starts, unless the voice stops (a rest) before that
        end = nxt
        if p in VOW:
            t = e
            while t < nxt and (is_voiced(t) or is_voiced(t + 0.03)):
                t += FP / 1000
            if nxt - t > rest_gap:
                end = t
        else:
            cap = 0.22 if p in ("s", "sh", "f", "th", "z", "ch", "jh", "hh") else 0.16
            if nxt - s > cap:
                end = s + cap
        cur.append([p, s, end])
        if nxt - end > 0.06:
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    # consonants that swallowed a vowel's start: a vowel starts no later than 0.16 s after its consonant
    for phr in out:
        for i in range(1, len(phr)):
            p, s, e = phr[i]
            q = phr[i - 1]
            if p in VOW and q[0] not in VOW:
                cap = 0.22 if q[0] in ("s", "sh", "f", "th", "z", "ch", "jh", "hh") else 0.14
                if s - q[1] > cap:
                    phr[i][1] = q[1] + cap
                    q[2] = phr[i][1]
            if q[2] < phr[i][1] and q[0] in VOW:
                q[2] = phr[i][1]
    return out


def units(phr: list[list], oto: dict) -> list[tuple[str, float, float]]:
    """Arpasing units of one phrase as (alias, start, end): '- a', 'a b' at b's start, 'z -' at the end."""
    seq = []
    p0, s0, _ = phr[0]
    seq.append([f"- {p0}", s0])
    for (a, _, _), (b, sb, _) in zip(phr, phr[1:]):
        al = f"{a} {b}"
        if al in oto:
            seq.append([al, sb])
        else:  # no such unit: end one sound and start the next
            seq.append([f"{a} -", sb - 0.03])
            seq.append([f"- {b}", sb])
    last, _, e = phr[-1]
    seq.append([f"{last} -", e])
    res = []
    for i, (al, st) in enumerate(seq):
        en = seq[i + 1][1] if i + 1 < len(seq) else st + 0.22
        res.append((al, st, max(en, st + 0.03)))
    return res


def render(phones_json: str, pitch_npy: str, cast_json: str, out: str) -> None:
    from voice2utau import sing

    words = json.load(open(phones_json))
    cents = np.load(pitch_npy).astype("float64")
    cast = json.load(open(cast_json))
    phr_all = phrases(words, cents)
    total = max(p[-1][2] for p in phr_all) + 2.0
    mix = None
    for part_bank in sorted({p["bank"] for p in cast["parts"]}):
        parts = [p for p in cast["parts"] if p["bank"] == part_bank]
        eng = sing.Engine(Path(part_bank), keep_level=True, consonant_cap_db=float(cast.get("consonant_cap", 3.0)))
        notes, t = [], 0.0
        cur = np.zeros(int(total * 1000 / FP) + 2)
        nfr = min(len(cents), len(cur))
        filled = fill(cents[:nfr])
        for phr in phr_all:
            mid = (phr[0][1] + phr[-1][2]) / 2
            part = next((p for p in parts if p["t0"] <= mid < p["t1"]), None)
            if part is None:
                continue
            us = units(phr, eng.oto)
            a, b = int(us[0][1] * 1000 / FP) - 40, int(us[-1][2] * 1000 / FP) + 40
            cur[max(0, a):b] = filled[max(0, a):b] + 100 * part.get("transpose", 0)
            for al, st, en in us:
                if st > t + 1e-4:
                    notes.append(rest(t, st))
                notes.append(note(al, st, en))
                t = en
        if not notes:
            continue
        notes.append(rest(t, total))
        sing.pitch_curve = lambda _n, _tot, c=cur: c                       # follow the singer, not note numbers
        y, info = eng.render(notes, tail_s=0.0)
        print(part_bank, info["notes"], "units, missing:", info["missing"])
        y = y[:int(total * sing.SR)]
        mix = y if mix is None else mix[:len(y)] + y[:len(mix)]
    sf.write(out, mix, sing.SR)


def fill(c: np.ndarray) -> np.ndarray:
    """Unvoiced frames take the pitch of the voiced frames around them (consonants sit on the line); light smoothing."""
    v = np.where(c > 0)[0]
    if not len(v):
        return c
    f = np.interp(np.arange(len(c)), v, c[v])
    k = np.ones(5) / 5
    return np.convolve(np.pad(f, 2, mode="edge"), k, "valid")


def note(al, st, en):
    from voice2utau import sing
    n = sing.Note(lyric=al, length=480, notenum=60, tempo=120.0)
    n.start, n.dur = st, en - st
    return n


def rest(st, en):
    return note("R", st, en)


if __name__ == "__main__":
    cmd = sys.argv[1]
    {"align": align, "pitch": pitch, "render": render}[cmd](*sys.argv[2:])
