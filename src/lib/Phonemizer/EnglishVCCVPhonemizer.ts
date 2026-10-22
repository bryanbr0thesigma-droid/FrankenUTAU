/**
 * 英語VCCV/VCV音源向けのphonemizer。OpenUtauのEnglish VCCV Phonemizerのエイリアス規則
 * (`-ba`, `ba`, `a b`, `ab-`, `aa`など。音素はCZ-SAMPA風)を、1ノート=CV+末尾VCという
 * このエンジンの構造に合わせて簡略化して移植したもの。
 */
import {
  EnglishPhonemizerBase,
  type CvCandidate,
  type CvContext,
} from "../English/EnglishPhonemizerBase";
import type { PhonemeScheme } from "../English/EnglishG2p";

/** 母音の直後に母音が来るとき、間に補う半母音 */
const vvGlides: Record<string, string> = {
  o: "w",
  O: "w",
  "8": "w",
  W: "w",
  A: "y",
  I: "y",
  Y: "y",
  E: "y",
  Q: "y",
  i: "y",
  "3": "r",
};

export class EnglishVCCVPhonemizer extends EnglishPhonemizerBase {
  name = "phonemizer.EnglishVCCVPhonemizer";
  protected readonly scheme: PhonemeScheme = "vccv";

  protected cvCandidates({ onset, v, isExt, prevV, prevCoda }: CvContext): CvCandidate[] {
    if (isExt) return [{ alias: v, lead: null }];
    const out: CvCandidate[] = [];
    const add = (alias: string, lead: string | null = null) =>
      out.push({ alias, lead });
    if (prevV === null) {
      // フレーズの先頭
      if (onset.length === 0) {
        add(`-${v}`);
        add(v);
      } else if (onset.length === 1) {
        add(`-${onset[0]}${v}`);
        add(`${onset[0]}${v}`);
      } else {
        const last = onset[onset.length - 1];
        if (onset.length === 2) add(`-${onset[0]}${onset[1]}${v}`);
        add(`_${last}${v}`);
        add(`${last}${v}`);
      }
    } else if (onset.length === 0) {
      // 直前が子音で終わっていたら、その子音から母音へ
      if (prevCoda !== null) add(`${prevCoda}${v}`);
      // 母音から母音へ
      add(`${prevV}${v}`);
      add(`${prevV} ${v}`);
      const g = vvGlides[prevV];
      if (g && prevV !== v) add(`${g}${v}`, g);
      add(`_${v}`);
      add(v);
    } else {
      const last = onset[onset.length - 1];
      add(`${last}${v}`, onset[0]);
    }
    return out;
  }

  protected vcCandidates(prev: string, c: string, ending: boolean): string[] {
    return ending
      ? [`${prev}${c}-`, `${prev} ${c}-`, `${prev}${c}`, `${prev} ${c}`]
      : [`${prev} ${c}`, `${prev}${c}`];
  }
}
