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
import { similarVowels } from "../English/similarVowels";

export class EnglishARPAbetPhonemizer extends EnglishPhonemizerBase {
  name = "phonemizer.EnglishARPAbetPhonemizer";
  protected readonly scheme: PhonemeScheme = "arpa";
  protected readonly closesVowels = true;

  /**
   * 音源にその組み合わせの録音が無いとき(`s aw`など、ダイフォン音源には欠けがある)に、
   * 無音にする代わりに使う近い母音の候補。無印の母音単独へ落ちる前に試す。
   */
  private nearVowels(v: string): string[] {
    return similarVowels[v] ?? [];
  }

  protected cvCandidates({ onset, v, isExt, prevV }: CvContext): CvCandidate[] {
    if (isExt) {
      return [v, ...this.nearVowels(v)].map((alias) => ({ alias, lead: null }));
    }
    if (onset.length === 0) {
      const heads = (x: string) => (prevV === null ? `- ${x}` : `${prevV} ${x}`);
      return [
        ...[v, ...this.nearVowels(v)].map((x) => ({ alias: heads(x), lead: null })),
        { alias: v, lead: null },
      ];
    }
    const last = onset[onset.length - 1];
    const lead = prevV === null ? null : onset[0];
    const cands: CvCandidate[] = [v, ...this.nearVowels(v)].map((x) => ({
      alias: `${last} ${x}`,
      lead,
    }));
    if (prevV === null) cands.push({ alias: v, lead: null });
    return cands;
  }

  protected vcCandidates(prev: string, c: string): string[] {
    if (c === VOWEL_END) {
      return [prev, ...this.nearVowels(prev)].map((x) => `${x} -`);
    }
    return [prev, ...this.nearVowels(prev)].map((x) => `${x} ${c}`);
  }
}
