"""Shared helpers for Synthesizer V project (.svp) files and Japanese lyric data."""
import importlib.util
import json

Q = 705600000  # blicks per quarter note


def load(path):
    """Read an .svp file (SynthV pads saved files with NUL bytes)."""
    return json.loads(open(path, "rb").read().rstrip(b"\x00"))


def save(d, path):
    json.dump(d, open(path, "w", encoding="utf-8"), ensure_ascii=False)


def split_phrases(notes):
    """Split onset-sorted notes into phrases at rests of an eighth note or longer."""
    phrases, cur, prev_end = [], [], None
    for n in notes:
        if prev_end is not None and n["onset"] - prev_end >= Q // 2:
            phrases.append(cur)
            cur = []
        cur.append(n)
        prev_end = n["onset"] + n["duration"]
    if cur:
        phrases.append(cur)
    return phrases


def group_phrases(group):
    return split_phrases(sorted(group["notes"], key=lambda n: n["onset"]))


def notes_group(d, track=0):
    """The group holding a track's notes and its blick offset: the track's own notes if it has any,
    else its first placed note group."""
    t = d["tracks"][track]
    if t["mainGroup"]["notes"] or not t.get("groups"):
        return t["mainGroup"], 0
    ref = t["groups"][0]
    return next(g for g in d["library"] if g["uuid"] == ref["groupID"]), ref["blickOffset"]


def load_lyrics(path):
    """Import a lyrics module (a .py file defining GROUPS) by path."""
    spec = importlib.util.spec_from_file_location("lyrics_module", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.GROUPS


def tokens_of(phrase):
    return phrase[0].replace("|", " ").split()


ROMAJI = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o", "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go", "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo", "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do", "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no", "は": "ha", "ひ": "hi",
    "ふ": "fu", "へ": "he", "ほ": "ho", "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo", "ぱ": "pa", "ぴ": "pi",
    "ぷ": "pu", "ぺ": "pe", "ぽ": "po", "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo", "や": "ya", "ゆ": "yu",
    "よ": "yo", "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro", "わ": "wa", "ん": "n",
    "しゅ": "shu", "しょ": "sho", "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho", "きゅ": "kyu", "きょ": "kyo",
    "ぎょ": "gyo", "じゅ": "ju", "りょ": "ryo", "ふぃ": "fi", "ふぉ": "fo",
    "しゃ": "sha", "じゃ": "ja", "じょ": "jo", "きゃ": "kya", "ぎゃ": "gya", "ぎゅ": "gyu", "にゃ": "nya",
    "にゅ": "nyu", "にょ": "nyo", "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo", "びゃ": "bya", "びゅ": "byu",
    "びょ": "byo", "ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo", "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
    "りゃ": "rya", "りゅ": "ryu", "ふぁ": "fa", "ふぇ": "fe", "てぃ": "ti", "でぃ": "di", "ちぇ": "che",
    "しぇ": "she", "じぇ": "je", "うぃ": "wi", "うぇ": "we",
}


def romaji(kana):
    """Hepburn romaji for a word written in hiragana (small っ doubles the next consonant)."""
    if kana == "br":
        return "(breath)"
    out, i, double = "", 0, False
    while i < len(kana):
        if kana[i] == "っ":
            double = True
            i += 1
            continue
        if kana[i:i + 2] in ROMAJI:
            syl, i = ROMAJI[kana[i:i + 2]], i + 2
        else:
            syl, i = ROMAJI[kana[i]], i + 1
        if double:
            syl = ("t" if syl.startswith("ch") else syl[0]) + syl
            double = False
        out += syl
    return out + ("t" if double else "")


def romaji_line(phrase):
    return " ".join(romaji("".join(w.split())) for w in phrase[0].split("|"))
