"""Japanese lyric text -> sung syllables (morae), the way you'd type them in SynthV.

moras("しかくしんごう") -> ["し", "か", "く", "し", "ん", "ご", "う"]
Katakana and romaji ("shikaku", "ka-ra") are accepted too. "ー" repeats the previous vowel,
small kana (ゃゅょぁぃぅぇぉ) join the mora before them, っ and ん are morae of their own.
Spaces, punctuation and "|" separate words but are not sung.
"""
import re

_ROMA = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "ゐ": "wi", "ゑ": "we", "を": "wo", "ん": "n", "ゔ": "vu",
    "きゃ": "kya", "きゅ": "kyu", "きぇ": "kye", "きょ": "kyo", "ぎゃ": "gya", "ぎゅ": "gyu", "ぎぇ": "gye", "ぎょ": "gyo",
    "しゃ": "sha", "しゅ": "shu", "しぇ": "she", "しょ": "sho", "じゃ": "ja", "じゅ": "ju", "じぇ": "je", "じょ": "jo",
    "ちゃ": "cha", "ちゅ": "chu", "ちぇ": "che", "ちょ": "cho", "ぢゃ": "ja", "ぢゅ": "ju", "ぢょ": "jo",
    "にゃ": "nya", "にゅ": "nyu", "にぇ": "nye", "にょ": "nyo", "ひゃ": "hya", "ひゅ": "hyu", "ひぇ": "hye", "ひょ": "hyo",
    "びゃ": "bya", "びゅ": "byu", "びぇ": "bye", "びょ": "byo", "ぴゃ": "pya", "ぴゅ": "pyu", "ぴぇ": "pye", "ぴょ": "pyo",
    "みゃ": "mya", "みゅ": "myu", "みぇ": "mye", "みょ": "myo", "りゃ": "rya", "りゅ": "ryu", "りぇ": "rye", "りょ": "ryo",
    "ふぁ": "fa", "ふぃ": "fi", "ふぇ": "fe", "ふぉ": "fo", "ふゅ": "fyu",
    "てぃ": "ti", "とぅ": "tu", "でぃ": "di", "どぅ": "du", "てゅ": "tyu", "でゅ": "dyu",
    "うぃ": "wi", "うぇ": "we", "うぉ": "wo", "いぇ": "ye", "すぃ": "si", "ずぃ": "zi",
    "つぁ": "tsa", "つぃ": "tsi", "つぇ": "tse", "つぉ": "tso",
    "ゔぁ": "va", "ゔぃ": "vi", "ゔぇ": "ve", "ゔぉ": "vo",
    "っ": "cl", "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o",
}
_KANA = {}
for k, r in _ROMA.items():
    _KANA.setdefault(r, k)
_KANA.update({"si": "し", "ti": "てぃ", "tu": "とぅ", "zi": "じ", "di": "でぃ", "du": "どぅ", "hu": "ふ",
              "nn": "ん", "wo": "を", "o": "お", "ji": "じ", "zu": "ず", "cl": "っ"})
SMALL = set("ゃゅょぁぃぅぇぉゎ")
VOWEL_KANA = {"a": "あ", "i": "い", "u": "う", "e": "え", "o": "お", "n": "ん"}


def hira(text):
    """Katakana -> hiragana (other characters unchanged)."""
    return "".join(chr(ord(c) - 0x60) if "ァ" <= c <= "ヶ" else c for c in text)


def romaji_to_kana(word):
    word = word.lower()
    out, i = [], 0
    while i < len(word):
        c = word[i]
        if c == "-":                                    # "ka-" : long vowel
            out.append("ー"); i += 1; continue
        if i + 1 < len(word) and c == word[i + 1] and c not in "aeioun":
            out.append("っ"); i += 1; continue          # doubled consonant
        for n in (3, 2, 1):
            if word[i:i + n] in _KANA:
                out.append(_KANA[word[i:i + n]]); i += n; break
        else:
            raise ValueError(f"can't read romaji {word!r} at {word[i:]!r}")
    return "".join(out)


def roma(mora):
    return _ROMA[mora]


def vowel(mora):
    """Vowel a mora ends on: "a".."o", "n" for ん, None for っ."""
    r = _ROMA[mora]
    return None if r == "cl" else ("n" if r == "n" else r[-1])


def moras(text):
    """Split lyric text into sung morae (hiragana)."""
    text = hira(text)
    out = []
    for word in re.split(r"[\s|、。,.!?！？・「」『』()（）]+", text):
        if not word:
            continue
        if re.fullmatch(r"[a-zA-Z\-]+", word):
            word = romaji_to_kana(word)
        for ch in word:
            if ch in SMALL and out and out[-1] + ch in _ROMA:
                out[-1] += ch
            elif ch in "ー〜~":
                if not out or vowel(out[-1]) in (None, "n"):
                    raise ValueError(f"long-vowel mark with no vowel before it in {text!r}")
                out.append(VOWEL_KANA[vowel(out[-1])])
            elif ch in _ROMA:
                out.append(ch)
            else:
                raise ValueError(f"not kana: {ch!r} in {text!r} (give the reading in kana)")
    return out


if __name__ == "__main__":
    import sys
    for line in sys.argv[1:]:
        m = moras(line)
        print(len(m), " ".join(m), "|", " ".join(roma(x) for x in m))
