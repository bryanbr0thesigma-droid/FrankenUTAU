/**
 * 漢字(中国語)の歌詞を、音源のピンイン表記のエイリアスに変換する。
 * 1ノート=1字で並んだ歌詞を、続く漢字ごとにまとめて読みを求める(多音字の読みを文脈で決めるため)。
 * 声調は付けない(声調はピッチ曲線で描く)。ピンイン辞書は大きいので、漢字があるときだけ読み込む。
 *
 * 音源のエイリアスは、無声調のピンイン(`ma`、`zhuang`、`lv`、`nve`)。英語の音と綴りが重なる`ao`と`er`は、
 * `ao_zh`と`er_zh`という名前になっている音源がある。
 * 変換後の歌詞は`!`を付けて、英語phonemizerに単語として読まれず、そのエイリアスのまま引かれるようにする。
 */
import type { Note } from "../Note";

const isHanzi = (c: string): boolean => c >= "一" && c <= "鿿";

/** ノートの歌詞が漢字1字なら、その字を返す(引用符は無視)。そうでなければnull */
const hanziOf = (lyric: string): string | null => {
  const l = lyric.trim().replace(/^['"‘’“”]+|['"‘’“”]+$/g, "");
  return [...l].length === 1 && isHanzi(l) ? l : null;
};

/** ピンイン1音節の、音源にあるエイリアス名を返す。無ければnull */
export const pinyinAlias = (
  syllable: string,
  has: (alias: string) => boolean
): string | null => {
  const candidates = ["ao", "er"].includes(syllable)
    ? [`${syllable}_zh`, syllable]
    : [syllable];
  return candidates.find(has) ?? null;
};

export type HanziResult = {
  notes: Note[];
  /** ピンインにした漢字の数 */
  converted: number;
  /** 音源にその音節が無く、漢字のまま残した数 */
  missing: number;
};

/**
 * 漢字の歌詞のノートをピンインのエイリアスにする。漢字の歌詞が無ければnull。
 * @param has 音源にそのエイリアスがあるか
 */
export const convertHanziNotes = async (
  notes: Note[],
  has: (alias: string) => boolean
): Promise<HanziResult | null> => {
  // 連続する漢字ノートの並び
  const runs: Note[][] = [];
  let cur: Note[] = [];
  for (const n of notes) {
    if (hanziOf(n.lyric) !== null) {
      cur.push(n);
    } else if (cur.length > 0) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) runs.push(cur);
  if (runs.length === 0) return null;

  const { pinyin } = await import("pinyin-pro");
  let converted = 0;
  let missing = 0;
  for (const run of runs) {
    const text = run.map((n) => hanziOf(n.lyric)).join("");
    // v: ü を v で表す(lv、nv)。声調なし
    const syllables = pinyin(text, { toneType: "none", type: "array", v: true });
    run.forEach((n, i) => {
      const alias = pinyinAlias(syllables[i] ?? "", has);
      if (alias === null) {
        missing++;
      } else {
        n.lyric = `!${alias}`;
        converted++;
      }
    });
  }
  return { notes, converted, missing };
};
