"""Turn a pitch track plus word alignment into quantized SynthV notes with English lyrics.
Usage: python -I transcribe.py f0.npz align.json grid.npy out.json [novelty.npy]

For each lyric line, syllable starts are picked from onset evidence in the audio (voicing starting
after a consonant, loudness dips, pitch steps) by dynamic programming: exactly as many starts as the
line has syllables, staying near where the aligner put each word. Pitch steps inside a syllable that
last at least a sixteenth become "-" slur notes."""
import json, math, sys
import numpy as np
import pronouncing

STEP = 0.25                                    # quantize to sixteenths (beats)
SPECIAL = {"uhh": 1, "ohh": 1, "wanna": 2, "gonna": 2, "gotta": 2}
LAMBDA = 2.0                                   # cost per second of distance from the aligner's guess
MIN_GAP = 0.08                                 # shortest syllable (s)
SQUEEZE = 0.6                                  # cost per halving of a syllable's expected length

f0d = np.load(sys.argv[1]); A = json.load(open(sys.argv[2])); words = A["words"]
off, per = [float(x) for x in np.load(sys.argv[3])]
t, f0, pr, rms = f0d["t"], f0d["f0"], f0d["per"], f0d["rms"]
dt = float(t[1] - t[0]); T = len(t)
db = 20 * np.log10(rms + 1e-9)
voiced = (pr > 0.45) & (db > np.percentile(db, 95) - 35) & (f0 > 60)
midi = np.where(voiced, 69 + 12 * np.log2(np.maximum(f0, 1) / 440), np.nan)
dev = midi[voiced] - np.round(midi[voiced])
tune = float(np.angle(np.mean(np.exp(2j * np.pi * dev))) / (2 * np.pi))
midi = midi - tune


def nanmed_filter(x, k):
    out = np.full_like(x, np.nan)
    for i in range(len(x)):
        s = x[max(0, i - k // 2): i + k // 2 + 1]; s = s[~np.isnan(s)]
        if len(s): out[i] = np.median(s)
    return out


m = nanmed_filter(midi, 7)


def syllables(w):
    if w in SPECIAL: return SPECIAL[w]
    ph = pronouncing.phones_for_word(w)
    if ph: return pronouncing.syllable_count(ph[0])
    return max(1, sum(1 for i, c in enumerate(w) if c in "aeiouy" and (i == 0 or w[i - 1] not in "aeiouy")))


def vowel_times(w, n):
    """Start times of the word's spelled vowel groups (a syllable's note starts at its vowel),
    trimmed to n: a silent final e is dropped first. None when the spelling has too few groups."""
    ch = w.get("chars") or []
    groups = []
    for i, (c, a, b) in enumerate(ch):
        v = c in "aeiou" or (c == "y" and i > 0)
        if v and (not groups or groups[-1][1] != i - 1):
            groups.append([a, i])
        elif v:
            groups[-1][1] = i
    if len(groups) > n and ch and ch[-1][0] in "es" and groups[-1][1] >= len(ch) - 2 and ch[groups[-1][1]][0] == "e":
        groups.pop()
    if len(groups) < n:
        return None
    return [g[0] for g in groups[:n]]


# ---- onset evidence per frame ----
O = np.zeros(T)
for i in range(3, T - 3):
    if voiced[i] and not voiced[i - 3:i].any():
        O[i] = max(O[i], 1.0)                                      # voicing starts after a gap
    if voiced[i] and not voiced[i - 1] and db[i] > db[max(0, i - 30):i + 30].max() - 12:
        O[i] = max(O[i], 0.6)                                      # (not voicing flickering in a fade-out)
    w = db[max(0, i - 6):i + 7]
    if db[i] == w.min():                                           # loudness dip: onset just after it
        depth = min(db[max(0, i - 6):i].max(), db[i + 1:i + 7].max()) - db[i]
        if depth > 2:
            O[min(T - 1, i + 2)] = max(O[min(T - 1, i + 2)], min(1.0, depth / 8))
    if voiced[i - 3:i + 4].all() and not np.isnan(m[i - 3]) and not np.isnan(m[i + 3]):
        step = abs(m[i + 3] - m[i - 3])
        if step >= 1.5:                                            # a clear step usually starts a syllable
            O[i] = max(O[i], min(0.9, 0.3 + 0.2 * step))
        elif step > 0.8:
            O[i] = max(O[i], 0.35)                                 # a small one may just be a slur
# spectral change (vowel to vowel, consonant to vowel) while voiced
nov = np.load(sys.argv[5]) if len(sys.argv) > 5 else np.zeros(T)
nov = np.pad(nov, (0, max(0, T - len(nov))))[:T]
for i in range(6, T - 6):
    if voiced[i] and nov[i] >= nov[i - 6:i + 7].max() and nov[i] > 0.5:
        O[i] = max(O[i], min(0.8, 0.8 * (nov[i] - 0.3)))
# keep local maxima only (60 ms)
cand_mask = np.zeros(T, bool)
for i in np.nonzero(O > 0.15)[0]:
    if O[i] >= O[max(0, i - 6):i + 7].max():
        cand_mask[i] = True

notes = []
lines = sorted(set(w["line"] for w in words))
for li in lines:
    W = [w for w in words if w["line"] == li]
    nxt = [w for w in words if w["line"] == li + 1]
    prv = [w for w in words if w["line"] == li - 1]
    s0 = max(W[0]["start"] - 0.35, prv[-1]["end"] if prv else 0)
    s1 = min(W[-1]["end"] + 0.6, nxt[0]["start"] - 0.05 if nxt else 1e9)
    a, b = int(s0 / dt), min(T - 1, int(s1 / dt))
    # expected syllable times from the aligner
    syl = []
    for wi, w in enumerate(W):
        n = syllables(w["norm"]); span = max(0.12 * n, w["end"] - w["start"])
        guess = vowel_times(w, n)
        for k in range(n):
            # the first syllable starts with the word; vowel letters only place the later ones
            # (in "my" or "be" the vowel letter is the word's last sound and comes late)
            at = w["start"] if k == 0 else (guess[k] if guess else w["start"] + span * k / n)
            syl.append((w, k, n, at))
    # candidates: real onsets plus voiced frames every 50 ms (for syllables on one sustained pitch)
    C = sorted(set([i for i in range(a, b) if cand_mask[i]] + [i for i in range(a, b, 5) if voiced[i]]))
    if len(C) < len(syl):
        C = sorted(set(C + list(range(a, b, 2))))
    sc = np.array([O[i] for i in C]); tc = np.array([t[i] for i in C])
    n, K = len(syl), len(C)
    NEG = -1e9
    D = np.full((n, K), NEG); P = np.zeros((n, K), int)
    for k in range(K):
        D[0, k] = sc[k] - LAMBDA * abs(tc[k] - syl[0][3])
    for j in range(1, n):
        # squeezing a syllable well under the length the aligner heard costs extra, so words keep
        # their spacing instead of being crammed onto the tail of the note before
        expect = max(0.06, syl[j][3] - syl[j - 1][3])
        for k in range(K):
            dur = tc[k] - tc[:k]
            ok = dur >= MIN_GAP
            if not ok.any(): continue
            squeeze = SQUEEZE * np.maximum(0, np.log2(expect / np.maximum(dur, 1e-3)) - 0.5)
            tot = np.where(ok, D[j - 1, :k] - squeeze, NEG)
            kp = int(np.argmax(tot))
            if tot[kp] > NEG / 2:
                D[j, k] = tot[kp] + sc[k] - LAMBDA * abs(tc[k] - syl[j][3]); P[j, k] = kp
    k = int(np.argmax(D[n - 1])); path = [k]
    for j in range(n - 1, 0, -1):
        k = P[j, k]; path.append(k)
    path = path[::-1]
    on = [C[k] for k in path]
    # each syllable runs to the next syllable start, or to where voicing stops
    for j, (w, k, nsyl, _) in enumerate(syl):
        st = on[j]; lim = on[j + 1] if j + 1 < n else b
        en = st
        while en < lim and (voiced[en] or voiced[en:en + 4].any()):
            en += 1
        en = max(en, st + 4)
        lyric = w["norm"] if k == 0 else "+"
        # pitch plateaus inside the syllable (>= ~a sixteenth) become slurs
        seg_m = m[st:en]
        plates, cur_s = [], st
        i = st
        while i < en:
            ref = np.nanmedian(m[cur_s:i + 1]) if not np.all(np.isnan(m[cur_s:i + 1])) else np.nan
            j2 = i
            while j2 < en and not np.isnan(ref) and not np.isnan(m[j2]) and abs(m[j2] - ref) > 0.7:
                j2 += 1
            if j2 - i >= 9 and i - cur_s >= 9:
                plates.append((cur_s, i)); cur_s = i; i = j2
            else:
                i = max(j2, i + 1)
        plates.append((cur_s, en))

        def pitch_of(p0, p1):
            core = m[p0 + (p1 - p0) // 5: p1 - (p1 - p0) // 5 + 1]; core = core[~np.isnan(core)]
            if not len(core):
                core = m[max(0, p0 - 15):p1 + 15]; core = core[~np.isnan(core)]
            return int(round(float(np.median(core)))) if len(core) else (notes[-1]["pitch"] if notes else 64)

        plates = [[p0, p1, pitch_of(p0, p1)] for p0, p1 in plates]
        # a short opening plateau still on the previous note's pitch is the transition into this note
        prev_pitch = notes[-1]["pitch"] if notes else None
        while len(plates) > 1 and (plates[0][1] - plates[0][0]) * dt < 0.16 and (
                plates[0][2] == prev_pitch                                   # still on the previous note
                or (1 <= plates[1][2] - plates[0][2] <= 2                    # a scoop from just below
                    and plates[1][1] - plates[1][0] >= plates[0][1] - plates[0][0])):
            plates[1][0] = plates[0][0]; plates.pop(0)
        # plateaus shorter than ~a sixteenth are scoops and falls: fold them into the longer neighbour
        changed = True
        while changed and len(plates) > 1:
            changed = False
            for q, (p0, p1, _) in enumerate(plates):
                if (p1 - p0) * dt < 0.11:
                    nb = q - 1 if q == len(plates) - 1 or (q > 0 and plates[q - 1][1] - plates[q - 1][0] >= plates[q + 1][1] - plates[q + 1][0]) else q + 1
                    lo_, hi_ = min(q, nb), max(q, nb)
                    plates[lo_:hi_ + 1] = [[plates[lo_][0], plates[hi_][1], plates[nb][2]]]
                    changed = True
                    break
        for pi, (p0, p1, pitch) in enumerate(plates):
            notes.append(dict(t0=float(t[p0]), t1=float(t[p1]), pitch=pitch, lyric=lyric if pi == 0 else "-",
                              word=w["norm"], line=li))

# quantize. Detected starts include the consonant sung before each note (SynthV starts a note at its
# vowel), so they run early by a steady amount; measure it over the song and shift it out before
# rounding, or starts sitting halfway between grid lines round apart and squash syllables together.
ph = np.array([(nt["t0"] - off) / per / STEP for nt in notes if nt["lyric"] != "-"])
LEAD = -float(np.angle(np.mean(np.exp(2j * np.pi * ph))) / (2 * np.pi)) * STEP * per
for nt in notes:
    nt["b0"] = round((nt["t0"] + LEAD - off) / per / STEP) * STEP
    nt["b1"] = round((nt["t1"] + LEAD - off) / per / STEP) * STEP
for i, nt in enumerate(notes):
    if i and nt["b0"] < notes[i - 1]["b0"] + STEP:
        nt["b0"] = notes[i - 1]["b0"] + STEP
    nt["b1"] = max(nt["b1"], nt["b0"] + STEP)
# Note ends: hold each note until the next one unless the original really rests in between (its level
# drops 28 dB under the phrase's peak for 140 ms). Pitch and voicing stop at consonants and releases
# well before the sound does, so ending notes there made the voice drop out mid-phrase. A syllable
# continuation ("+") or slur ("-") must touch the note before it, or SynthV leaves it silent.
# The singer also leaves short breaks between words (a dip of 12 dB for 50 ms); without them notes on
# one pitch run together ("more, more, more" became one long "more"), so those end a 32nd early too.
REST_DB, REST_MIN = 28, 0.14
ART_DB, ART_MIN = 12, 0.05


SOFT = {"R", "L", "W", "Y", "M", "N", "NG", "HH"}


def soft_end(word):
    """True when the word ends on a vowel or a sonorant (r, l, m, n...), which runs into the next word."""
    ph = pronouncing.phones_for_word(word)
    if not ph:
        return word[-1:] in "aeiouywrlmnh"
    last = ph[0].split()[-1].rstrip("012")
    return last in SOFT or any(c.isdigit() for c in ph[0].split()[-1])


def rest_start(ta, tb, depth=REST_DB, length=REST_MIN):
    a, b = int(ta / dt), min(T, int(tb / dt))
    if b <= a: return None
    peak = db[max(0, a - 100):b].max()
    run = 0
    for k in range(a, b):
        run = run + 1 if db[k] < peak - depth else 0
        if run * dt >= length:
            return float(t[k - run + 1])
    return None


for i, nt in enumerate(notes):
    nxt = notes[i + 1] if i + 1 < len(notes) else None
    if nxt and nxt["lyric"] in ("+", "-"):
        nt["b1"] = nxt["b0"]; continue
    rs = rest_start(nt["t0"] + 0.05, nxt["t0"] if nxt else nt["t0"] + 8)
    if rs is None and nxt:
        # a word ending in a hard consonant already separates itself (SynthV sings that consonant at
        # the end of the note); ending it early only made the consonant cut the vowel short
        art = None if not soft_end(nt["word"]) else rest_start(nt["t0"] + 0.05, nxt["t0"] + 0.03, ART_DB, ART_MIN)
        end = round((art + LEAD - off) / per / (STEP / 2)) * (STEP / 2) if art else nxt["b0"]
        end = max(end, nt["b0"] + STEP)
        nt["b1"] = end if nxt["b0"] - end >= STEP / 2 else nxt["b0"]
        continue
    if rs is None:
        continue
    end = math.ceil((rs - off) / per / STEP) * STEP
    end = max(end, nt["b0"] + STEP)
    if nxt and nxt["b0"] - end < STEP:
        end = nxt["b0"]
    nt["b1"] = min(end, nxt["b0"]) if nxt else end
# merge a slur back into its note when quantizing left it on the same pitch
merged = []
for nt in notes:
    if merged and nt["lyric"] == "-" and nt["pitch"] == merged[-1]["pitch"] and nt["b0"] == merged[-1]["b1"]:
        merged[-1]["b1"] = nt["b1"]; merged[-1]["t1"] = nt["t1"]
    else:
        merged.append(nt)
notes = merged
ph = np.array([nt["b0"] % 1 for nt in notes])
print(f"consonant lead {LEAD * 1000:+.0f} ms; tuning {tune * 100:+.0f} cents, {len(notes)} notes, {sum(n['lyric'] == '-' for n in notes)} slurs;"
      f" onset phases {[int(np.sum(np.isclose(ph, q))) for q in (0, .25, .5, .75)]}")
json.dump(dict(tune=tune, off=off, per=per, notes=notes), open(sys.argv[4], "w"), indent=0)
