"""Map a Japanese vocal into UTAU notes: one note per sung mora, timed from the audio.

Usage: python -I map_ja.py vocal.wav f0.npz grid.npy lyrics.py out_dir [--tracks M=rei:/bank,T=corrupt:/bank]
                           [--force-f0 corrupt=280]

lyrics.py holds LINES = [(singer, "kana line"), ...] in sung order (kana.py splits each line into
morae, like typing a whole line in SynthV). Singer "B" = every singer; a word written "*word" is
sung by every singer while the rest of the line keeps its singer. f0.npz comes from synthv/scripts/transcribe/f0.py,
grid.npy from tempo.py. Writes out_dir/align.json, out_dir/project.json (for render.py) and
prints each line with its timing.

How: the MMS forced aligner (torchaudio) places every mora's letters in the audio; a note starts
where its vowel starts (UTAU puts the consonant before the note by itself), snapped to the nearest
sixteenth without two notes sharing one, and runs to the next note, a っ, or the end of the voicing.
Its pitch is the median pitch of its vowel. The original singer's pitch curve goes into the project
too, so the render follows its slides and vibrato.
"""
import argparse
import importlib.util
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kana  # noqa: E402

STEP = 0.25                 # grid step in beats (sixteenths)
REST_DB = 25                # a dip this far below the phrase level...
REST_MIN = 0.12             # ...for this long (s) ends a note early
MAX_DEV = 2.5               # original pitch further than this from the note (semitones) is ignored


def line_morae(text):
    """Morae of a lyric line with a flag for words marked "*" (sung by every singer)."""
    out = []
    for w in text.split():
        both = w.startswith("*")
        out += [(m, both) for m in kana.moras(w.lstrip("*"))]
    return out


def load_lines(path):
    spec = importlib.util.spec_from_file_location("lyr", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m.LINES


def align(wav, lines):
    import librosa
    import torch
    import torchaudio
    torch.set_num_threads(4)
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=True).eval()
    D = bundle.get_dict(star="*")
    y, sr = librosa.load(wav, sr=bundle.sample_rate, mono=True)
    yt = torch.tensor(y)[None]
    win, hop, ctx = 30 * sr, 26 * sr, 2 * sr
    ems = []
    with torch.inference_mode():
        for s in range(0, yt.shape[1], hop):
            a, b = max(0, s - ctx), min(yt.shape[1], s + win)
            e, _ = model(yt[:, a:b])
            fr = e.shape[1] / (b - a)
            ems.append(e[0, int(round((s - a) * fr)):int(round((min(s + hop, yt.shape[1]) - a) * fr))])
            if b >= yt.shape[1]:
                break
    em = torch.cat(ems)[None]
    frame = yt.shape[1] / em.shape[1] / sr
    morae = []                       # (line, index in line, mora)
    tokens, owner = [], []
    for li, (_, text) in enumerate(lines):
        tokens.append(D["*"]); owner.append(-1)
        for k, (m, _both) in enumerate(line_morae(text)):
            morae.append((li, k, m))
            r = kana.roma(m)
            if r == "cl":
                continue
            for c in r:
                tokens.append(D[c]); owner.append(len(morae) - 1)
    tokens.append(D["*"]); owner.append(-1)
    ali, scores = torchaudio.functional.forced_align(em, torch.tensor([tokens], dtype=torch.int32), blank=0)
    spans = torchaudio.functional.merge_tokens(ali[0], scores[0].exp())
    assert len(spans) == len(tokens)
    out = []
    for i, (li, k, m) in enumerate(morae):
        ss = [(tok, sp) for tok, sp, o in zip(tokens, spans, owner) if o == i]
        chars = [[bundle.get_labels(star="*")[tok], round(sp.start * frame, 3), round(sp.end * frame, 3),
                  round(float(sp.score), 3)] for tok, sp in ss]
        out.append(dict(line=li, k=k, mora=m, chars=chars))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("vocal"); ap.add_argument("f0"); ap.add_argument("grid"); ap.add_argument("lyrics"); ap.add_argument("out")
    ap.add_argument("--tracks", default="")
    ap.add_argument("--force-f0", default="")
    ap.add_argument("--realign", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    lines = load_lines(a.lyrics)
    apath = os.path.join(a.out, "align.json")
    if a.realign or not os.path.exists(apath):
        json.dump(align(a.vocal, lines), open(apath, "w"), ensure_ascii=False, indent=0)
    A = json.load(open(apath))
    f = np.load(a.f0)
    t, f0, per, rms = f["t"], f["f0"], f["per"], f["rms"]
    dt = float(t[1] - t[0])
    db = 20 * np.log10(rms + 1e-9)
    voiced = (per > 0.4) & (f0 > 60) & (db > np.percentile(db, 95) - 35)
    midi = np.where(voiced, 69 + 12 * np.log2(np.maximum(f0, 1) / 440), np.nan)
    off, spb = [float(x) for x in np.load(a.grid)]
    step = STEP * spb

    def fi(sec):
        return int(np.clip(round(sec / dt), 0, len(t) - 1))

    # raw note starts: the vowel of each mora (ん: its own start; っ: no note)
    for m in A:
        cs = m["chars"]
        if not cs:
            m["v"] = None
            continue
        vow = [c for c in cs if c[0] in "aeiou"]
        m["c0"] = cs[0][1]
        m["v"] = (vow[0] if vow else cs[-1])[1]
    sung = [m for m in A if m["v"] is not None]
    # snap to sixteenths per line, keeping order (DP over candidate slots)
    for li in range(len(lines)):
        ms = [m for m in sung if m["line"] == li]
        if not ms:
            continue
        raw = [(m["v"] - off) / step for m in ms]
        cands = [list(range(int(np.floor(r)) - 2, int(np.ceil(r)) + 3)) for r in raw]
        cost = [{c: abs(c - raw[0]) for c in cands[0]}]
        back = [{}]
        for i in range(1, len(ms)):
            cost.append({}); back.append({})
            for c in cands[i]:
                best = min(((cost[i - 1][p] + abs(c - raw[i]), p) for p in cost[i - 1] if p < c), default=None)
                if best:
                    cost[i][c], back[i][c] = best
        c = min(cost[-1], key=cost[-1].get)
        slots = [c]
        for i in range(len(ms) - 1, 0, -1):
            c = back[i][c]
            slots.append(c)
        for m, s in zip(ms, reversed(slots)):
            m["slot"] = s
            m["t0"] = off + s * step
    # note ends: next note in the line (or the next mora's consonant after っ), else voicing end
    for i, m in enumerate(sung):
        nxt = sung[i + 1] if i + 1 < len(sung) and sung[i + 1]["line"] == m["line"] else None
        mi = A.index(m)
        cl = mi + 1 < len(A) and A[mi + 1]["mora"] == "っ" and A[mi + 1]["line"] == m["line"]
        if nxt:
            end = nxt["t0"]
            if cl:
                end = min(end, off + round((nxt["c0"] - off) / step) * step)
        else:
            # last mora of a line: until voicing stops (at most 3 s), snapped to the grid
            k = fi(m["t0"]) + 3
            while k < len(t) - 1 and voiced[k] and t[k] - m["t0"] < 3.0:
                k += 1
            end = off + max(round((t[k] - off) / step), m["slot"] + 1) * step
            later = [s["t0"] for s in sung[i + 1:i + 2]]
            if later and later[0] > m["t0"]:
                end = min(end, later[0])          # the next line's first note (either singer)
        # a real rest inside the note ends it early
        a0, a1 = fi(m["t0"]), fi(end)
        if a1 > a0 + 3:
            ref = np.percentile(db[a0:a1], 90)
            quiet = db[a0:a1] < ref - REST_DB
            run = 0
            for k in range(len(quiet)):
                run = run + 1 if quiet[k] else 0
                if run * dt >= REST_MIN and k - run > 2:
                    cut = t[a0 + k - run + 1]
                    end = max(off + round((cut - off) / step) * step, m["t0"] + step)
                    break
        m["t1"] = max(end, m["t0"] + step / 2)
        seg = midi[fi(m["t0"] + 0.25 * (m["t1"] - m["t0"])):fi(m["t1"] - 0.1 * (m["t1"] - m["t0"])) + 1]
        seg = seg[np.isfinite(seg)]
        m["midi"] = int(round(np.median(seg))) if len(seg) else None
    # notes the pitch tracker missed take their neighbour's pitch
    for i, m in enumerate(sung):
        if m["midi"] is None:
            near = [s["midi"] for s in sung[max(0, i - 2):i + 3] if s["midi"] is not None and s["line"] == m["line"]]
            m["midi"] = near[0] if near else 64
    # project
    tracks = {}
    for spec in filter(None, a.tracks.split(",")):
        who, rest = spec.split("=", 1)
        name, bank = rest.split(":", 1)
        tracks[who] = dict(name=name, voicebank=bank, notes=[])
    forced = dict(s.split("=") for s in filter(None, a.force_f0.split(",")))
    flags = {li: line_morae(text) for li, (_, text) in enumerate(lines)}
    for m in sung:
        who = lines[m["line"]][0]
        both = who == "B" or flags[m["line"]][m["k"]][1]
        for w in (list(tracks) if both else [who]):
            tr = tracks.setdefault(w, dict(name=w, voicebank="", notes=[]))
            tr["notes"].append(dict(t0=round(m["t0"], 4), t1=round(m["t1"], 4), midi=m["midi"], lyric=m["mora"],
                                    line=m["line"]))
    # original pitch curve, only where it is close to a note being sung
    curve = np.full(len(t), np.nan)
    for m in sung:
        a0, a1 = fi(m["t0"] - 0.05), fi(m["t1"])
        seg = midi[a0:a1]
        ok = np.abs(seg - m["midi"]) <= MAX_DEV
        curve[a0:a1] = np.where(ok, seg, curve[a0:a1])
    k = np.ones(3) / 3
    good = np.isfinite(curve)
    sm = np.convolve(np.nan_to_num(curve), k, "same") / np.maximum(np.convolve(good.astype(float), k, "same"), 1e-9)
    curve = np.where(good, sm, np.nan)
    pitch = dict(dt=dt, midi=[None if not np.isfinite(v) else round(float(v), 3) for v in curve])
    proj = dict(bpm=round(60 / spb, 3), grid=[off, spb], tracks=[])
    for who, tr in tracks.items():
        tr["pitch"] = pitch
        if tr["name"] in forced:
            tr["force_f0"] = float(forced[tr["name"]])
        proj["tracks"].append(tr)
    json.dump(proj, open(os.path.join(a.out, "project.json"), "w"), ensure_ascii=False)
    for li, (who, text) in enumerate(lines):
        ms = [m for m in sung if m["line"] == li]
        print(f"{ms[0]['t0']:7.2f}-{ms[-1]['t1']:7.2f} {who} {len(ms):2d} notes  {text}")
    low = [m for m in A if m["chars"] and min(c[3] for c in m["chars"]) < 0.2]
    print(f"{len(sung)} notes; {len(low)} morae aligned with low confidence")


if __name__ == "__main__":
    main()
