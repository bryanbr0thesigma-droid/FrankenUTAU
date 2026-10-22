/**
 * 日本語(かな)の歌詞で打たれたustを、音源で歌える形に整える。
 * - OpenUtauの`+`(直前の音を伸ばす)は、直前のノートの長さに足して1つにまとめる。
 * - 音源に無い外来音のかな(`を`、`てぃ`、`ふぁ`など)は、ローマ字表記か近いかなに置き換える。
 * `っ`のように音源に無いものは、そのまま(無音)にする。
 */
import type { Note } from "../Note";

/** 音源に無いかなの代わりに試す表記。先に書いたものほど優先 */
const fallbacks: Record<string, string[]> = {
  を: ["wo", "お", "o"],
  うぃ: ["wi", "い"],
  うぇ: ["we", "え"],
  うぉ: ["wo", "お"],
  てぃ: ["ti", "ち"],
  でぃ: ["di", "じ"],
  とぅ: ["tu", "つ"],
  どぅ: ["du", "ず"],
  ふぁ: ["fa", "は"],
  ふぃ: ["fi", "ひ"],
  ふぇ: ["fe", "へ"],
  ふぉ: ["fo", "ほ"],
  しぇ: ["she", "せ"],
  じぇ: ["je", "ぜ"],
  ちぇ: ["che", "せ"],
};

const kana = /[ぁ-んァ-ヶ]/;

export type NormalizeKanaResult = {
  notes: Note[];
  /** 直前のノートにまとめた`+`の数 */
  merged: number;
  /** 近い表記に置き換えたかなの数 */
  remapped: number;
  /** 伸ばす相手がなく、休符にした`+`の数 */
  rests: number;
};

/**
 * かなの歌詞のustを整える。かなの歌詞が半数に満たなければnullを返し、ノートには触れない。
 * 変えるものが無い場合もnull。
 * @param has 音源にそのエイリアスがあるか
 */
export const normalizeJapaneseNotes = (
  notes: Note[],
  has: (alias: string) => boolean
): NormalizeKanaResult | null => {
  const sung = notes.filter((n) => n.lyric !== "R" && n.lyric !== "+");
  if (sung.length === 0) return null;
  if (sung.filter((n) => kana.test(n.lyric)).length < sung.length * 0.5) {
    return null;
  }
  const out: Note[] = [];
  let merged = 0;
  let remapped = 0;
  let rests = 0;
  /** 直前のノートが歌うノートか。伸ばしを足せるのはそれだけ */
  let prevSung = false;
  for (const n of notes) {
    if (n.lyric === "+") {
      if (prevSung) {
        const prev = out[out.length - 1];
        prev.length = prev.length + n.length;
        merged++;
        continue;
      }
      n.lyric = "R";
      rests++;
      out.push(n);
      continue;
    }
    if (n.lyric !== "R" && !has(n.lyric)) {
      const alt = (fallbacks[n.lyric] ?? []).find(has);
      if (alt !== undefined) {
        n.lyric = alt;
        remapped++;
      }
    }
    prevSung = n.lyric !== "R";
    out.push(n);
  }
  return merged + remapped + rests === 0
    ? null
    : { notes: out, merged, remapped, rests };
};
