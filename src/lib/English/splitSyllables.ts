/**
 * 1つのノートに複数音節の単語が書かれているとき、音節ごとのノートに分ける。
 * このエンジンは1ノート=1音節で、単語は先頭のノートに書き、続く音節は`+`のノートで歌う。
 * 単語の音節数が、その単語のノートと直後の`+`の数より多いと、足りない音節は歌われない。
 * 足りない分だけ、単語の最後のノートを等分して`+`のノートを足す。
 * 綴りで発音を書いた歌詞(`taesks`、`prowach`のように辞書に無いもの)は、書いた人が1ノート=1音節で
 * 打っているので触らない。短すぎて分けられないノートや、休符、`!`で音源のエイリアスを直接指定した
 * ノートにも触らない。
 */
import type { Note } from "../Note";
import {
  inEnglishDict,
  wordToSyllables,
  type PhonemeScheme,
} from "./EnglishG2p";

/** 分けたあとの1ノートの最小の長さ(tick)。1拍=480tickの16分音符の半分 */
export const MIN_SYLLABLE_TICKS = 60;

export type SplitResult = {
  /** 音節ごとに分けたノート列。prev/nextは付け直してある */
  notes: Note[];
  /** 分けた単語の数 */
  split: number;
  /** 分けた単語と、その音節数 */
  words: Array<{ word: string; syllables: number }>;
};

const isPlus = (n: Note | undefined): boolean =>
  n !== undefined && n.lyric !== undefined && n.lyric.startsWith("+");

/**
 * 複数音節の単語を音節ごとのノートに分ける。分ける単語が無ければnullを返し、ノートには触れない。
 */
export const splitMultiSyllableWords = (
  notes: Note[],
  scheme: PhonemeScheme,
): SplitResult | null => {
  const out: Note[] = [];
  const words: SplitResult["words"] = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const lyric = n.lyric;
    if (
      !lyric ||
      lyric === "R" ||
      isPlus(n) ||
      lyric.includes("!") ||
      !inEnglishDict(lyric) ||
      lyric.startsWith("[")
    ) {
      out.push(n);
      continue;
    }
    const syls = wordToSyllables(lyric, scheme);
    let k = 0;
    while (isPlus(notes[i + 1 + k])) k++;
    const need = syls ? syls.length - (1 + k) : 0;
    if (!syls || need <= 0) {
      out.push(n);
      continue;
    }
    const group = notes.slice(i, i + 1 + k);
    const last = group[group.length - 1];
    const parts = need + 1;
    if (last.length / parts < MIN_SYLLABLE_TICKS) {
      out.push(n);
      continue;
    }
    // 単語のノートと、既にある`+`のノートは、そのまま残す(最後の1つ以外)
    out.push(...group.slice(0, -1));
    const each = Math.floor(last.length / parts);
    const total = last.length;
    const pieces: Note[] = [];
    for (let p = 0; p < parts; p++) {
      const piece = p === 0 ? last : last.deepCopy();
      if (p > 0) piece.lyric = "+";
      piece.length = p === parts - 1 ? total - each * (parts - 1) : each;
      pieces.push(piece);
    }
    out.push(...pieces);
    words.push({ word: lyric, syllables: syls.length });
    i += k;
  }
  if (words.length === 0) return null;
  out.forEach((n, i) => {
    n.prev = i === 0 ? undefined : out[i - 1];
    n.next = i === out.length - 1 ? undefined : out[i + 1];
  });
  return { notes: out, split: words.length, words };
};
