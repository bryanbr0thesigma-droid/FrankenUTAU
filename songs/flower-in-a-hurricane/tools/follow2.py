"""Second version of the follower: lyric-sheet alignment that keeps held notes, and a unit renderer that puts every
sound exactly where the singer's was.

    python follow2.py align  VOCAL.wav pitch.npy lyrics.json phones.json   # segmental forced alignment
    python follow2.py render phones.json pitch.npy cast.json out.wav [REF.wav]  # exact-anchor Arpasing renderer;
                                                                               # REF: the original voice to follow

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
FUNCTION_WORDS = {"a", "an", "the", "in", "on", "of", "to", "and", "or", "but", "for", "at", "as", "is", "it", "its",
                  "by", "if", "so", "has", "than", "that", "this", "with", "from", "into", "till"}


# ------------------------------------------------------------------ alignment
def seg_align(post, blank, cols, kinds, voiced, quiet, word_of, loud=None, onset=None, notes=None):
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
            if kinds[k] in ("V", "V0", "VF"):
                # who carries a held note: stressed vowels most easily, unstressed ones less, function words
                # ("in", "a", "the" ...) hardly ever
                hold = 0.25 * {"V": 1.0, "V0": 0.85, "VF": 0.4}[kinds[k]]
                e = np.log(P + hold * b + 1e-4) + np.log(0.3 + 0.7 * voiced) + np.log(0.03 + 0.97 * loud)
            elif kinds[k] == "U":
                e = np.log(P + 0.05 * b + 1e-4) + np.log(0.45 + 0.55 * (1 - voiced)) + np.log(0.4 + 0.6 * loud)
            else:
                e = np.log(P + 0.05 * b + 1e-4) + np.log(0.3 + 0.7 * voiced) + np.log(0.2 + 0.8 * loud)
            phone_state[k] = len(st_kind)
            e_first = e
            if onset is not None and kinds[k] in ("V", "V0", "VF"):
                o = np.maximum(onset, notes) if notes is not None else onset
                e_first = e + np.log(0.03 + 0.97 * o)            # a syllable starts on a note change / attack
            if notes is not None and kinds[k] in ("V", "V0", "VF"):
                e = e + np.log(1.0 - 0.97 * notes)               # holding one vowel through a note change costs a lot
            n_min = {"V": 4, "V0": 3, "VF": 3}.get(kinds[k], 2)            # minimum frames: 80 / 60 / 40 ms
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


def note_changes(cents, T, fdur, a):
    """1 where the original moves to a new note (a step of 80+ cents between the 60 ms medians on either side,
    CREPE curve), on the aligner's frame grid, with one frame of slack"""
    from scipy.ndimage import median_filter
    v = cents > 0
    cs = median_filter(np.where(v, cents, np.nan), size=13, mode="nearest")
    tt = a + (np.arange(T) + 0.5) * fdur
    out = np.zeros(T)
    for k, t in enumerate(tt):
        i = int(t * 200)
        if 12 <= i < len(cents) - 12 and v[i] and not np.isnan(cs[i + 6]) and not np.isnan(cs[i - 6]):
            out[k] = float(np.clip((abs(cs[i + 6] - cs[i - 6]) - 60) / 60, 0, 1))
    return np.maximum.reduce([out, np.r_[out[1:], 0], np.r_[0, out[:-1]]])


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
        notes = note_changes(cents, T, fdur, a)
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
                        if re.sub(r"[^a-z']", "", w.lower()) in FUNCTION_WORDS:
                            kinds.append("VF")
                        else:
                            kinds.append("V0" if st == "0" and nvow > 1 else "V")
                    else:
                        kinds.append("U" if p in UNVOICED else "C")
                    word_of.append(len(words) - 1)
        labels = [p for w, _, _ in words for p in word_phones(w, d)]
        spans = seg_align(post, vocab["<pad>"], cols, kinds, voiced, quiet, word_of, onset=onset, notes=notes)
        for w, k0, n in words:
            res.append({"w": w, "phones": [[labels[k], round(a + spans[k][0] * fdur, 3), round(a + spans[k][1] * fdur, 3)]
                                           for k in range(k0, k0 + n)]})
        print(f"aligned {a}-{b}: {len(words)} words, {len(labels)} phones", flush=True)
    json.dump(res, open(out, "w"), indent=0)


# ------------------------------------------------------------------ phrases and units
def phrases2(words: list[dict], gap: float = 0.12, cents=None) -> list[list[list]]:
    """phone runs from the aligner, split where it put a silence of more than `gap` s; with `cents`, a phrase's last
    vowel (or the vowel before its final consonants) is held for as long as the singer keeps a voiced note there"""
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
    if cents is not None:
        v = cents > 0
        isv = lambda t: v[min(len(v) - 1, max(0, int(t * 1000 / FP)))]
        for i, phr in enumerate(out):
            nxt = out[i + 1][0][1] - 0.06 if i + 1 < len(out) else phr[-1][2] + 3.0
            j = len(phr) - 1
            while j > 0 and phr[j][0] not in VOW:
                j -= 1
            if phr[j][0] not in VOW:
                continue
            tail = sum(p[2] - p[1] for p in phr[j + 1:])           # final consonants keep their length
            t = phr[j][2] + tail
            base = cents[min(len(cents) - 1, int(phr[j][2] * 1000 / FP))]
            while t < nxt and any(isv(t + d) for d in (0.0, 0.04, 0.08, 0.12)):   # bridge voicing gaps < 120 ms
                now = cents[min(len(cents) - 1, int(t * 1000 / FP))]
                if base > 0 and now > 0 and abs(now - base) > 120:   # the singer moved to another note: done
                    break
                if now > 0 and base <= 0:
                    base = now
                t += FP / 1000
            while t > phr[j][2] + tail and not isv(t):                # end on the last voiced frame, not in a gap
                t -= FP / 1000
            ext = min(t, nxt) - (phr[j][2] + tail)
            if ext > 0.03:
                phr[j][2] += ext
                for p in phr[j + 1:]:
                    p[1] += ext
                    p[2] += ext
    return out


CONS_MS = {**{c: 70 for c in ("p", "t", "k", "b", "d", "g", "m", "n", "ng", "l", "r", "w", "y", "dh", "v")},
           **{c: 100 for c in ("s", "sh", "f", "th", "z", "zh", "ch", "jh")}, "hh": 60}


def retime(phr: list[list]) -> list[list]:
    """UTAU-style timing: every vowel keeps its start (it sits on its note); the consonants before it get natural
    lengths (stops/nasals ~70 ms, s/f/sh ~100 ms), taken from the end of the vowel before, which may give up at most
    half of itself; consonants after the phrase's last vowel get their natural length too."""
    out = [list(p) for p in phr]
    vi = [i for i, p in enumerate(out) if p[0] in VOW]
    if not vi:
        return out
    for n, i in enumerate(vi):
        j = i - 1
        cluster = []
        while j >= 0 and out[j][0] not in VOW:
            cluster.append(j)
            j -= 1
        if not cluster:
            continue
        cluster.reverse()
        want = [CONS_MS.get(out[k][0], 70) / 1000 for k in cluster]
        prev_v = j if j >= 0 else None
        room = (out[i][1] - out[prev_v][1]) * 0.5 if prev_v is not None else sum(want)
        scale = min(1.0, room / max(1e-6, sum(want)))
        t = out[i][1]
        for k, d in zip(reversed(cluster), reversed(want)):
            d = max(0.025, d * scale)
            out[k][2] = t
            out[k][1] = t - d
            t -= d
        if prev_v is not None:
            out[prev_v][2] = out[cluster[0]][1]
    last = vi[-1]
    t = out[last][2]
    for k in range(last + 1, len(out)):
        d = CONS_MS.get(out[k][0], 70) / 1000
        out[k][1], out[k][2] = t, t + d
        t += d
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
        rest, avail = na - fixed, N - 1 - C
        if na <= fixed:
            idx_a = P + np.arange(na)
        elif rest <= avail:                                       # shorter than the sample: compress evenly
            idx_a = np.concatenate([P + np.arange(fixed), np.linspace(C, N - 1, rest)])
        else:
            # a long note: the vowel's attack (its first 60 %) plays at its own speed, like a singer's onset, and
            # only the steady end stretches; stretching the whole sample made every long note creep in (the
            # banks' vowels swell) and then snap to the next syllable
            M = C + int(0.6 * avail)
            idx_a = np.concatenate([P + np.arange(fixed), np.arange(C, M), np.linspace(M, N - 1, rest - (M - C))])
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


def follow_expression(y: np.ndarray, ref_wav: str, sr: int, effort: float = 0.5) -> np.ndarray:
    """Make a rendered part sing like the original: its loudness follows the reference voice syllable by syllable
    (30 ms envelope), and its brightness (1-5 kHz against the lows) follows the reference's, so where the singer
    pushes, the bank pushes. Brightness is matched on average too (the banks are duller than the singers)."""
    from scipy.signal import istft, stft
    r, rsr = sf.read(ref_wav, dtype="float32", always_2d=True)
    r = r.mean(1)
    if rsr != sr:
        r = resample_poly(r, sr, rsr)
    r = np.pad(r, (0, max(0, len(y) - len(r))))[:len(y)]
    nfft, hop = 2048, 512
    f, _, Y = stft(y, sr, nperseg=nfft, noverlap=nfft - hop)
    _, _, Rr = stft(r, sr, nperseg=nfft, noverlap=nfft - hop)
    n = min(Y.shape[1], Rr.shape[1])
    Y, Rr = Y[:, :n], Rr[:, :n]
    hi = (f >= 1000) & (f < 5000)
    lo = (f >= 80) & (f < 1000)
    def tilt(S):
        P = np.abs(S) ** 2
        return 10 * np.log10(P[hi].sum(0) + 1e-12) - 10 * np.log10(P[lo].sum(0) + 1e-12)
    def lvl(S):
        return 10 * np.log10((np.abs(S) ** 2).sum(0) + 1e-12)
    ly, lr = lvl(Y), lvl(Rr)
    act = (ly > ly.max() - 45) & (lr > lr.max() - 45)
    if act.sum() < 10:
        return y
    k = np.ones(9) / 9                                          # ~100 ms smoothing for the brightness follow
    dt = np.convolve(np.where(act, tilt(Rr) - tilt(Y), 0.0), k, "same") / np.maximum(np.convolve(act.astype(float), k, "same"), 1e-3)
    effort = float(os.environ.get("EFFORT", effort))
    cap = float(os.environ.get("EFFORT_CAP", 12))
    dt = np.clip(dt * effort, -6, cap) * ("t" in os.environ.get("FOLLOW", "lt"))
    shape = np.clip((f - 700) / 1800, 0, 1)[:, None]          # 0 below 700 Hz, full from 2.5 kHz
    Y = Y * 10 ** (shape * dt[None, :] / 20)
    # loudness: follow the reference envelope at 30 ms, full depth, where both sing
    ly2 = lvl(Y)
    k2 = np.ones(3) / 3
    g = np.convolve(np.where(act, lr - ly2, 0.0), k2, "same")
    g -= np.median(g[act])                                      # the level itself is set in the mix
    g = np.clip(g, -18, 12) * ("l" in os.environ.get("FOLLOW", "lt"))
    Y = Y * 10 ** (g[None, :] / 20)
    _, z = istft(Y, sr, nperseg=nfft, noverlap=nfft - hop)
    z = np.pad(z, (0, max(0, len(y) - len(z))))[:len(y)]
    return z.astype("float32")


def render(phones_json: str, pitch_npy: str, cast_json: str, out: str, ref_wav: str = "") -> None:
    words = json.load(open(phones_json))
    cents = np.load(pitch_npy).astype("float64")
    cast = json.load(open(cast_json))
    phr_all = phrases2(words, cents=cents)
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
                if os.environ.get("RETIME", "1") == "1":
                    g = retime(g)
                c = filled + 100 * part.get("transpose", 0)
                lim = part["t1"] + 0.2                               # a held note never runs past its singer's turn
                if g[-1][2] > lim:
                    over = g[-1][2] - lim
                    g = [list(p) for p in g]
                    g[-1][2] = max(g[-1][1] + 0.06, g[-1][2] - over)
                for al in R.phrase(g, c, y):
                    missing[al] = missing.get(al, 0) + 1
                n_units += len(g) + 1
        print(bank, n_units, "units, missing:", missing)
        y = y[:int(total * R.SR)]
        if ref_wav:
            y = follow_expression(y, ref_wav, R.SR)
        peak = float(np.abs(y).max()) or 1.0
        y = (y / peak * 0.89).astype("float32")
        mix = y if mix is None else mix[:len(y)] + y[:len(mix)]
    sf.write(out, mix, 44100)


if __name__ == "__main__":
    {"align": align, "render": render}[sys.argv[1]](*sys.argv[2:])
