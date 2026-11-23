"""Time each line of the lyrics file to the notes of the SynthV project, for the MV's on-screen lyrics.

    python3 -I lyric_times.py <project.svp> <lyrics.txt> <out.json>

The three rewritten lines replace the originals first (same as tools/edit_lyrics.py). Each line is found in the sung
words of the project (lead parts first, then harmonies), in order, by the longest common word sequence. Each word gets
the time of its note, so the MV can light the words up as they are sung. Words with no note get times in between.
"""
import json
import re
import sys

B = 705600000
REWRITES = {
    "reduce this crowd to sacrifice": "Invite this crowd to dance tonight",
    "purge thy body and thy mind": "Free thy body and thy mind",
    "seduce this soul in sacrifice": "Lift up this soul into the light",
}
LEAD = ("Main 1", "Main 2", "Whisper", "yell")
HARM = ("Harm 3", "Harm 1", "Harm 2")


def norm(w):
    w = w.lower().replace("’", "'").replace("“", "").replace("”", "")
    w = re.sub(r"[^a-z']", "", w).replace("'", "")
    return re.sub(r"ing$", "in", w)


def sung_words(p):
    bpm = p["time"]["tempo"][0]["bpm"]
    sec = lambda b: b / B * 60 / bpm
    out = {}
    for t in p["tracks"]:
        words = []
        for n in sorted(t["mainGroup"]["notes"], key=lambda n: n["onset"]):
            a, b = sec(n["onset"]), sec(n["onset"] + n["duration"])
            if n["lyrics"] in ("+", "-", "br"):
                if words and n["lyrics"] != "br":
                    words[-1][2] = b
                continue
            for part in n["lyrics"].split():
                words.append([norm(part), a, b])
        out[t["name"]] = words
    return out


def lcs(a, b):
    """indices (i in a, j in b) of a longest common subsequence"""
    m, n = len(a), len(b)
    d = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m - 1, -1, -1):
        for j in range(n - 1, -1, -1):
            d[i][j] = d[i + 1][j + 1] + 1 if a[i] == b[j] else max(d[i + 1][j], d[i][j + 1])
    i = j = 0
    pairs = []
    while i < m and j < n:
        if a[i] == b[j]:
            pairs.append((i, j)); i += 1; j += 1
        elif d[i + 1][j] >= d[i][j + 1]:
            i += 1
        else:
            j += 1
    return pairs


def find(tokens, words, cursor):
    """earliest window at or after the cursor where most of the line is sung"""
    for s in range(len(words)):
        if words[s][1] < cursor - 0.05 or words[s][0] not in tokens[:2]:
            continue
        win = words[s:s + len(tokens) + 3]
        pairs = lcs(tokens, [w[0] for w in win])
        if pairs and len(pairs) >= max(1, round(0.7 * len(tokens))) and pairs[0][0] <= 1:
            return [(i, win[j]) for i, j in pairs]
    return None


def main(svp, txt, out):
    p = json.loads(open(svp, "rb").read().decode("utf-8").rstrip("\x00"))
    words = sung_words(p)
    lines = [l.strip().lstrip("﻿") for l in open(txt, encoding="utf-8")]
    lines = [REWRITES.get(re.sub(r"\s+", " ", l.lower()).strip(), l) for l in lines if l]
    cursor, res = 0.0, []
    for line in lines:
        disp = line.split()
        tokens = [norm(w) for w in disp]
        best = None
        for group in (LEAD, HARM):
            for name in group:
                m = find(tokens, words[name], cursor)
                if m and (best is None or m[0][1][1] < best[1][0][1][1] - 0.3):
                    best = (name, m)
            if best:
                break
        if not best:
            print("NOT FOUND:", disp[:3], "...")
            continue
        name, m = best
        times = [None] * len(disp)
        for i, w in m:
            times[i] = (w[1], w[2])
        known = [i for i, x in enumerate(times) if x]
        for i in range(len(disp)):                 # fill unmatched words between their neighbours
            if times[i] is None:
                lo = max([k for k in known if k < i], default=None)
                hi = min([k for k in known if k > i], default=None)
                a = times[lo][1] if lo is not None else times[hi][0] - 0.2
                b = times[hi][0] if hi is not None else times[lo][1] + 0.2
                times[i] = (a, b)
        res.append({"t0": round(times[0][0], 3), "t1": round(max(x[1] for x in times), 3), "part": name,
                    "words": [{"w": w, "t0": round(a, 3), "t1": round(b, 3)} for w, (a, b) in zip(disp, times)]})
        cursor = times[0][0] + 0.1
        print(f"{times[0][0]:7.2f}-{max(x[1] for x in times):7.2f} {name:8s} {len(m)}/{len(tokens)} matched  {' '.join(disp[:3])} ...")
    json.dump({"lines": res}, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(f"{out}: {len(res)} of {len(lines)} lines timed")


if __name__ == "__main__":
    main(*sys.argv[1:4])
