"""CMUdict(OpenUtauのg2p-arpabet.zip内のdict.txt)を、ブラウザ向けの軽量形式に変換する。
形式: 1行1語 `word ph ph ph`。小文字、ストレス記号なし、最初の発音のみ。"""
import re, sys
src, dst = sys.argv[1], sys.argv[2]
seen, out = set(), []
for line in open(src, encoding="latin-1"):
    if line.startswith(";;;") or not line.strip():
        continue
    word, _, phones = line.rstrip("\n").partition("  ")
    word = word.lower()
    if re.search(r"\(\d+\)$", word) or not re.fullmatch(r"[a-z][a-z']*", word) or word in seen:
        continue
    seen.add(word)
    out.append(word + " " + re.sub(r"\d", "", phones.lower()))
open(dst, "w", encoding="utf8").write("\n".join(out) + "\n")
print(len(out), "words")
