/**
 * X-SAMPA記号の英語VCCV音源(重音テト英語など)向けのphonemizer。
 * エイリアスは、語頭のCV`- b@`、CV`b@`、VC`@ b`、語尾のVC`@ b-`、母音単独`@`、母音から母音`@ A`、
 * 語尾の母音`@ -`。OpenUtauのEnglish VCCVのCZ-SAMPA規則(`-ba`、`ab`)とは書式も記号も違う。
 * 1ノート=CV+末尾VCというこのエンジンの構造に合わせて、EnglishVCCVPhonemizerと同じ形で並べる。
 */
import {
  EnglishPhonemizerBase,
  VOWEL_END,
  type CvCandidate,
  type CvContext,
} from "../English/EnglishPhonemizerBase";
import type { PhonemeScheme } from "../English/EnglishG2p";

/**
 * 音源に無い組(Tetoは`bV`と`V b`が無い)で、無音にする代わりに使う近い母音。
 * 近い順。`V`(cut)と`@`(schwa)、`A`と`a`、`E`と`e`は、この音源では互いに代用できる。
 */
const similarXsampaVowels: Record<string, string[]> = {
  V: ["@", "A"],
  "@": ["V"],
  A: ["a", "O"],
  a: ["A", "{"],
  E: ["e", "{"],
  e: ["E"],
  I: ["i"],
  i: ["I"],
  O: ["o", "A"],
  o: ["O", "oU"],
  U: ["u"],
  u: ["U"],
  "{": ["E", "a"],
  "3": ["@", "V"],
};

const withNear = (v: string): string[] => [
  v,
  ...(similarXsampaVowels[v] ?? []),
];

export class EnglishXSampaPhonemizer extends EnglishPhonemizerBase {
  name = "phonemizer.EnglishXSampaPhonemizer";
  protected readonly scheme: PhonemeScheme = "xsampa";
  protected readonly closesVowels = true;

  protected cvCandidates({
    onset,
    v,
    isExt,
    prevV,
    prevCoda,
  }: CvContext): CvCandidate[] {
    const vs = withNear(v);
    if (isExt) return vs.map((x) => ({ alias: x, lead: null }));
    const out: CvCandidate[] = [];
    const add = (alias: string, lead: string | null = null) =>
      out.push({ alias, lead });
    if (prevV === null) {
      // フレーズの先頭。子音連続は、母音の直前の子音とのCVだけを使う
      if (onset.length === 0) {
        vs.forEach((x) => add(`- ${x}`));
        vs.forEach((x) => add(x));
      } else {
        const last = onset[onset.length - 1];
        vs.forEach((x) => add(`- ${last}${x}`));
        vs.forEach((x) => add(`${last}${x}`));
      }
    } else if (onset.length === 0) {
      // 直前が子音で終わっていても、この音源に子音から母音への繋ぎは無いので、語頭の母音で始める。
      // 母音の直後なら、母音から母音への繋ぎ(`@ A`)
      if (prevCoda === null) vs.forEach((x) => add(`${prevV} ${x}`));
      vs.forEach((x) => add(`- ${x}`));
      vs.forEach((x) => add(x));
    } else {
      const last = onset[onset.length - 1];
      // 母音を変えるより、まず同じ母音のまま初頭CV(`- bV`)を探す
      vs.forEach((x) => add(`${last}${x}`, onset[0]));
      vs.forEach((x) => add(`- ${last}${x}`, onset[0]));
    }
    return out;
  }

  protected vcCandidates(prev: string, c: string, ending: boolean): string[] {
    const vs = withNear(prev);
    if (c === VOWEL_END) return vs.map((x) => `${x} -`);
    return ending
      ? [...vs.map((x) => `${x} ${c}-`), ...vs.map((x) => `${x} ${c}`)]
      : vs.map((x) => `${x} ${c}`);
  }
}
