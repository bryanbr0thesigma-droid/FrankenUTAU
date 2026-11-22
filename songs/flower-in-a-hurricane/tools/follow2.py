"""Second version of the follower: lyric-sheet alignment that keeps held notes, and a unit renderer that puts every
sound exactly where the singer's was.

    python follow2.py align  VOCAL.wav pitch.npy lyrics.json phones.json   # segmental forced alignment
    python follow2.py render phones.json pitch.npy cast.json out.wav         # exact-anchor Arpasing renderer

lyrics.json: {"sections": [{"t0", "t1", "lines": [...]}]}. phones.json: [{"w", "phones": [[p, start, end], ...]}].

Alignment: wav2vec2 phoneme posteriors (xlsr-53 espeak), but no CTC blank states: a vowel absorbs blank frames
(a held note is still that vowel), consonants barely do, and an optional silence may sit between words. Voicing is
a prior: vowels want voiced frames, s/t/k/f/... want unvoiced ones, silence wants quiet unvoiced ones.
Rendering: for unit "a b" the sample's preutterance point lands exactly on b's start; the lead-in before it is
squeezed (never shifted) when the previous sound is short; the rest is stretched to the next unit.
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
sys.path.insert(0, str(HERE))
sys.path.insert(0, os.environ.get("V2U", str(HERE.parent / "v2u_src")))
from follow import FP, IPA, VOW, fill, word_phones  # noqa: E402

UNVOICED = {"p", "t", "k", "f", "th", "s", "sh", "ch", "hh"}


# ------------------------------------------------------------------ alignment
def seg_align(post, blank, cols, kinds, voiced, quiet, word_of, loud=None, onset=None):
    """Viterbi over [sil?] w1-phones [sil?] w2-phones ... [sil?]; each phone 2+ frames, silence 1+.
    Returns per phone (start_frame, end_frame_exclusive)."""
    T = post.shape[0]
    b = post[:, blank]
    st_kind, st_phone, st_first, st_loop = [], [], [], []   # state table
    emis = []
    nw = max(word_of) + 1 if word_of else 0

    def add(kind, ph, e, first, loop):
        st_kind.append(kind); st_phone.append(ph); emis.append(e); st_first.append(first); st_loop.append(loop)

    if loud is None:
        loud = 1 - quiet
    sil_e = np.log(0.3 * b + 0.02) + np.log(0.01 + 0.99 * quiet)
    # word starts: index of first phone of each word
    starts = [word_of.index(w) for w in range(nw)]
    phone_state, phone_last, phone_n = {}, {}, {}
    sil_state = {}
    for w in range(nw + 1):
        sil_state[w] = len(st_kind)
        add("sil", -1, sil_e, True, True)
        if w == nw:
            break
        end = starts[w + 1] if w + 1 < nw else len(cols)
        for k in range(starts[w], end):
            P = post[:, cols[k]].sum(1)
            if kinds[k] in ("V", "V0"):
                hold = 0.25                                         # any vowel may carry a held note
                e = np.log(P + hold * b + 1e-4) + np.log(0.3 + 0.7 * voiced) + np.log(0.03 + 0.97 * loud)
            elif kinds[k] == "U":
                e = np.log(P + 0.05 * b + 1e-4) + np.log(0.45 + 0.55 * (1 - voiced)) + np.log(0.4 + 0.6 * loud)
            else:
                e = np.log(P + 0.05 * b + 1e-4) + np.log(0.3 + 0.7 * voiced) + np.log(0.2 + 0.8 * loud)
            phone_state[k] = len(st_kind)
            e_first = e
            if onset is not None and kinds[k] in ("V", "V0"):
                e_first = e + np.log(0.03 + 0.97 * onset)        # a syllable starts on a note change / attack
            n_min = {"V": 4, "V0": 3}.get(kinds[k], 2)            # minimum frames: 80 / 60 / 40 ms
            add("ph", k, e_first, True, False)
            for j in range(1, n_min):
                add("ph", k, e, False, j == n_min - 1)            # only the last one loops
            phone_last[k] = len(st_kind) - 1
            phone_n[k] = n_min
    S = len(st_kind)
    E = np.stack(emis, 1)                     # T x S
    NEG = -1e30
    # predecessors: each state from itself (if loop) and from listed previous states
    preds = [[] for _ in range(S)]
    for w in range(nw + 1):
        s = sil_state[w]
        last_prev = (starts[w] - 1) if w < nw else len(cols) - 1           # last phone of the previous word
        prev_phone_end = phone_last[last_prev] if w > 0 else None
        if prev_phone_end is not None:
            preds[s].append(prev_phone_end)
        if w == nw:
            break
        first = phone_state[starts[w]]
        preds[first].append(s)                # from the optional silence
        if prev_phone_end is not None:
            preds[first].append(prev_phone_end)   # or straight from the previous word
        end = starts[w + 1] if w + 1 < nw else len(cols)
        for k in range(starts[w], end):
            s0 = phone_state[k]
            for j in range(1, phone_n[k]):
                preds[s0 + j].append(s0 + j - 1)
            if k > starts[w]:
                preds[s0].append(phone_last[k - 1])
    loop = np.array(st_loop)
    # dense predecessor matrix (S is a few hundred)
    maxp = max(len(p) for p in preds)
    PM = np.full((S, maxp), -1)
    for s, p in enumerate(preds):
        PM[s, :len(p)] = p
    dp = np.full(S, NEG)
    dp[sil_state[0]] = E[0, sil_state[0]]
    dp[phone_state[0]] = E[0, phone_state[0]]
    bp = np.zeros((T, S), dtype=np.int32)
    for t in range(1, T):
        cand = np.where(PM >= 0, dp[np.clip(PM, 0, None)], NEG)          # S x maxp
        k = cand.argmax(1)
        best = cand[np.arange(S), k]
        src = PM[np.arange(S), k]
        stay = np.where(loop, dp, NEG)
        use_stay = stay >= best
        dp = np.where(use_stay, stay, best) + E[t]
        bp[t] = np.where(use_stay, np.arange(S), src)
    last_ph = phone_last[len(cols) - 1]
    s = sil_state[nw] if dp[sil_state[nw]] > dp[last_ph] else last_ph
    path = np.empty(T, dtype=int)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s = bp[t, s]
    spans = []
    ph_of_state = np.array(st_phone)
    lab = ph_of_state[path]
    for k in range(len(cols)):
        fr = np.where(lab == k)[0]
        spans.append((int(fr[0]), int(fr[-1]) + 1) if len(fr) else (-1, -1))
    return spans


def onsets(seg, T, fdur, cents, a):
    """0..1 per frame: how much a new syllable seems to start here. Selective on purpose (most frames ~0):
    a spectral attack well above the local level, a pitch step bigger than vibrato, or the voice coming in."""
    from scipy.ndimage import median_filter
    hop = fdur * 16000
    n_fft = 512
    win = np.hanning(n_fft)
    frames = np.stack([np.pad(seg, (0, n_fft))[int(i * hop):int(i * hop) + n_fft] * win for i in range(T)])
    S = np.log(np.abs(np.fft.rfft(frames, axis=1))[:, 4:160] + 1e-4)          # ~125 Hz .. 5 kHz
    flux = np.r_[0, np.maximum(np.diff(S, axis=0), 0).sum(1)]
    base = median_filter(flux, size=int(0.5 / fdur))
    hi = np.percentile(flux - base, 97) + 1e-9
    fl = np.clip((flux - base) / hi, 0, 1)
    tt = a + (np.arange(T) + 0.5) * fdur
    c = np.array([cents[min(len(cents) - 1, int(t * 200))] for t in tt])
    cs = median_filter(np.where(c > 0, c, np.nan), size=7, mode="nearest")
    cs = np.where(np.isnan(cs), 0, cs)
    pj = np.zeros(T)
    both = (cs[3:] > 0) & (cs[:-3] > 0)
    pj[3:] = np.where(both, np.clip((np.abs(cs[3:] - cs[:-3]) - 60) / 120, 0, 1), 0)
    v = (c > 0).astype(float)
    vs = median_filter(v, size=5)
    von = np.r_[0, 0, np.clip(vs[2:] - vs[:-2], 0, 1)]
    o = np.maximum.reduce([fl, pj, von]) ** 1.5
    return np.maximum(o, np.r_[o[1:], 0])                                     # 1 frame of slack


def align(vocal: str, pitch_npy: str, lyrics_json: str, out: str) -> None:
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
    cents = np.load(pitch_npy)
    res = []
    for sec in json.load(open(lyrics_json))["sections"]:
        a, b = sec["t0"], sec["t1"]
        seg = m16[int(a * 16000):int(b * 16000)]
        segn = (seg - seg.mean()) / (seg.std() + 1e-7)
        with torch.no_grad():
            lg = model(torch.from_numpy(segn)[None]).logits[0]
        post = torch.softmax(lg, -1).numpy()
        T = post.shape[0]
        fdur = (len(seg) / 16000) / T
        tt = a + (np.arange(T) + 0.5) * fdur
        voiced = np.array([(cents[int((t - fdur / 2) * 200):int((t + fdur / 2) * 200)] > 0).mean() for t in tt])
        rms = np.array([np.sqrt((seg[int(i * fdur * 16000):int((i + 1) * fdur * 16000)] ** 2).mean() + 1e-10) for i in range(T)])
        db = 20 * np.log10(rms)
        # loudness against the phrase around it (rolling max over +-1.5 s): 10 dB down starts to count as a pause,
        # 20 dB down is one (separation bleed in a gap is faint but often still "voiced")
        W = int(1.5 / fdur)
        ref = np.array([db[max(0, i - W):i + W + 1].max() for i in range(T)])
        quiet = np.clip((-10 - (db - ref)) / 10, 0, 1)
        onset = onsets(seg, T, fdur, cents, a)
        words, cols, kinds, word_of = [], [], [], []
        for line in sec["lines"]:
            for w in re.findall(r"[A-Za-z']+", line):
                ph = word_phones(w, d)
                raw = d[re.sub(r"[^a-z']", "", w.lower())][0]
                stress = [r[-1] if r[-1].isdigit() else "" for r in raw]
                nvow = sum(1 for p in ph if p in VOW)
                words.append((w, len(cols), len(ph)))
                for p, st in zip(ph, stress):
                    cols.append(colmap[p])
                    if p in VOW:
                        kinds.append("V0" if st == "0" and nvow > 1 else "V")
                    else:
                        kinds.append("U" if p in UNVOICED else "C")
                    word_of.append(len(words) - 1)
        labels = [p for w, _, _ in words for p in word_phones(w, d)]
        spans = seg_align(post, vocab["<pad>"], cols, kinds, voiced, quiet, word_of, onset=onset)
        for w, k0, n in words:
            res.append({"w": w, "phones": [[labels[k], round(a + spans[k][0] * fdur, 3), round(a + spans[k][1] * fdur, 3)]
                                           for k in range(k0, k0 + n)]})
        print(f"aligned {a}-{b}: {len(words)} words, {len(labels)} phones", flush=True)
    json.dump(res, open(out, "w"), indent=0)


# ------------------------------------------------------------------ phrases and units
def phrases2(words: list[dict], gap: float = 0.12) -> list[list[list]]:
    """phone runs from the aligner, split where it put a silence of more than `gap` s"""
    ph = sorted([list(p) for w in words for p in w["phones"] if p[1] >= 0], key=lambda p: p[1])
    out, cur = [], []
    for p in ph:
        if cur and p[1] - cur[-1][2] > gap:
            out.append(cur)
            cur = []
        if cur:
            cur[-1][2] = p[1]                 # contiguous inside a phrase
        cur.append(p)
    if cur:
        out.append(cur)
    return out


def units2(phr: list[list], oto: dict) -> list[tuple[str, float]]:
    """(alias, anchor) in order; the anchor is where the unit's preutterance point must land; plus the phrase end"""
    seq = [(f"- {phr[0][0]}", phr[0][1])]
    for (a, _, _), (b, sb, _) in zip(phr, phr[1:]):
        if f"{a} {b}" in oto:
            seq.append((f"{a} {b}", sb))
        else:
            seq.append((f"{a} -", sb))
            seq.append((f"- {b}", sb + 0.001))
    seq.append((f"{phr[-1][0]} -", phr[-1][2]))
    return seq


class Renderer:
    def __init__(self, bank: Path):
        from voice2utau import sing
        self.sing = sing
        self.eng = sing.Engine(Path(bank), keep_level=True)
        self.oto = self.eng.oto
        self.SR = sing.SR

    def unit(self, alias, t_start, anchor, t_end, cents, xfade):
        """render one unit from t_start to t_end (s) with its preutterance point at `anchor`"""
        import pyworld as pw
        wav, (off, cons, cut, pre, ovl) = self.oto[alias]
        f0, sp, ap, seg = self.eng.analyse(wav, off, cut)
        N = len(f0)
        P = min(N - 2, max(0, int(round(pre / FP))))
        C = min(N - 2, max(P, int(round(cons / FP))))
        nb = max(0, int(round((anchor - t_start) * 1000 / FP)))
        na = max(1, int(round((t_end - anchor) * 1000 / FP)))
        idx_b = np.linspace(0, P, nb, endpoint=False) if nb else np.zeros(0)
        fixed = C - P
        if na <= fixed:
            idx_a = P + np.arange(na)
        else:
            idx_a = np.concatenate([P + np.arange(fixed), np.linspace(C, N - 1, na - fixed)])
        idx = np.clip(np.round(np.concatenate([idx_b, idx_a])).astype(int), 0, N - 1)
        n = len(idx)
        fr = np.clip(((t_start * 1000 + np.arange(n) * FP) / FP).astype(int), 0, len(cents) - 1)
        hz = 440.0 * 2 ** ((cents[fr] / 100 - 69) / 12)
        nf0 = np.where(f0[idx] > 0, hz, 0.0)
        y = pw.synthesize(np.ascontiguousarray(nf0), np.ascontiguousarray(sp[idx]), np.ascontiguousarray(ap[idx]), self.SR, FP)
        # level: the vowel after the anchor as loud as in the sample (WORLD's level drifts with the pitch shift)
        a0 = int(nb * FP / 1000 * self.SR) + int(0.03 * self.SR)
        vow = y[a0:a0 + int(0.2 * self.SR)]
        ref = self.eng.source_vowel_rms(wav, off, cons, cut)
        if len(vow) > int(0.04 * self.SR) and ref > 0:
            now = float(np.sqrt((vow ** 2).mean()))
            if now > 0:
                y = y * float(np.clip(ref / now, 10 ** (-12 / 20), 10 ** (12 / 20)))
        k = min(len(y) // 2, int(xfade * self.SR))
        if k:
            y[:k] *= np.sin(np.linspace(0, np.pi / 2, k)) ** 2
            y[-k:] *= np.cos(np.linspace(0, np.pi / 2, k)) ** 2
        return y

    def phrase(self, phr, cents, out):
        seq = units2(phr, self.oto)
        missing = [al for al, _ in seq if al not in self.oto]
        seq = [(al, t) for al, t in seq if al in self.oto]
        if not seq:
            return missing
        leads = []
        for i, (al, t) in enumerate(seq):
            pre = self.oto[al][1][3] / 1000
            room = (t - seq[i - 1][1]) * 0.7 if i else pre
            leads.append(min(pre, max(0.005, room)))
        XF = 0.03
        for i, (al, t) in enumerate(seq):
            t_start = t - leads[i]
            if i + 1 < len(seq):
                t_end = seq[i + 1][1] - leads[i + 1] + XF
            else:
                t_end = t + 0.18
            t_end = max(t_end, t + 0.02)
            y = self.unit(al, t_start, t, t_end, cents, XF)
            s = int(t_start * self.SR)
            out[s:s + len(y)] += y[:max(0, len(out) - s)]
        return missing


def render(phones_json: str, pitch_npy: str, cast_json: str, out: str) -> None:
    words = json.load(open(phones_json))
    cents = np.load(pitch_npy).astype("float64")
    cast = json.load(open(cast_json))
    phr_all = phrases2(words)
    total = max(p[-1][2] for p in phr_all) + 2.0
    mix = None
    for bank in sorted({p["bank"] for p in cast["parts"]}):
        parts = [p for p in cast["parts"] if p["bank"] == bank]
        R = Renderer(Path(bank))
        y = np.zeros(int(total * R.SR) + R.SR)
        filled = fill(cents)
        n_units, missing = 0, {}
        for phr in phr_all:
            run, run_part = [], None
            groups = []
            for p in phr:
                part = next((q for q in parts if q["t0"] <= p[1] < q["t1"]), None)
                if run and part is not run_part:
                    groups.append((run, run_part))
                    run = []
                run_part = part
                if part is not None:
                    run.append(p)
            if run:
                groups.append((run, run_part))
            for g, part in groups:
                c = filled + 100 * part.get("transpose", 0)
                for al in R.phrase(g, c, y):
                    missing[al] = missing.get(al, 0) + 1
                n_units += len(g) + 1
        print(bank, n_units, "units, missing:", missing)
        y = y[:int(total * R.SR)]
        peak = float(np.abs(y).max()) or 1.0
        y = (y / peak * 0.89).astype("float32")
        mix = y if mix is None else mix[:len(y)] + y[:len(mix)]
    sf.write(out, mix, 44100)


if __name__ == "__main__":
    {"align": align, "render": render}[sys.argv[1]](*sys.argv[2:])
