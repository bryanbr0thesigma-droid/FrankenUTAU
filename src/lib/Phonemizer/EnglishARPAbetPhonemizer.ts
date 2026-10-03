/**
 * ARPAbetのダイフォン音源(`- ay`, `t ay`, `ay k`, `ey ay`, `t -`, `ay -`、
 * 母音単独の`ay`)向けの英語phonemizer。OpenUtauのArpasingと同じ系統の音源を想定する。
 * 同じエイリアスの別テイク(`t ay1`など)は、無印が無い場合に使う。
 *
 * 1ノート=CV+末尾VCという構造のため、フレーズ先頭の`- C`と子音連続の`C C`は使わない。
 */
import {
  EnglishPhonemizerBase,
  VOWEL_END,
  type CvCandidate,
  type CvContext,
} from "../English/EnglishPhonemizerBase";
import type { PhonemeScheme } from "../English/EnglishG2p";

export class EnglishARPAbetPhonemizer extends EnglishPhonemizerBase {
  name = "phonemizer.EnglishARPAbetPhonemizer";
  protected readonly scheme: PhonemeScheme = "arpa";
  protected readonly closesVowels = true;

  protected cvCandidates({ onset, v, isExt, prevV }: CvContext): CvCandidate[] {
    if (isExt) return [{ alias: v, lead: null }];
    if (onset.length === 0) {
      return prevV === null
        ? [{ alias: `- ${v}`, lead: null }, { alias: v, lead: null }]
        : [{ alias: `${prevV} ${v}`, lead: null }, { alias: v, lead: null }];
    }
    const last = onset[onset.length - 1];
    const cands: CvCandidate[] = [
      { alias: `${last} ${v}`, lead: prevV === null ? null : onset[0] },
    ];
    if (prevV === null) cands.push({ alias: v, lead: null });
    return cands;
  }

  protected vcCandidates(prev: string, c: string): string[] {
    return c === VOWEL_END ? [`${prev} -`] : [`${prev} ${c}`];
  }
}
