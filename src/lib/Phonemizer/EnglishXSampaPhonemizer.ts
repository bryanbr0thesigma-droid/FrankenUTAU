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
    if (isExt) return [{ alias: v, lead: null }];
    const out: CvCandidate[] = [];
    const add = (alias: string, lead: string | null = null) =>
      out.push({ alias, lead });
    if (prevV === null) {
      // フレーズの先頭。子音連続は、母音の直前の子音とのCVだけを使う
      if (onset.length === 0) {
        add(`- ${v}`);
        add(v);
      } else {
        const last = onset[onset.length - 1];
        add(`- ${last}${v}`);
        add(`${last}${v}`);
      }
    } else if (onset.length === 0) {
      // 直前が子音で終わっていても、この音源に子音から母音への繋ぎは無いので、語頭の母音で始める。
      // 母音の直後なら、母音から母音への繋ぎ(`@ A`)
      if (prevCoda === null) add(`${prevV} ${v}`);
      add(`- ${v}`);
      add(v);
    } else {
      const last = onset[onset.length - 1];
      add(`${last}${v}`, onset[0]);
      add(`- ${last}${v}`, onset[0]);
    }
    return out;
  }

  protected vcCandidates(prev: string, c: string, ending: boolean): string[] {
    if (c === VOWEL_END) return [`${prev} -`];
    return ending ? [`${prev} ${c}-`, `${prev} ${c}`] : [`${prev} ${c}`];
  }
}
