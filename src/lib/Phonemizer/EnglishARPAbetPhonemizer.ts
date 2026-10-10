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
import { similarConsonants, similarVowels } from "../English/similarVowels";

export class EnglishARPAbetPhonemizer extends EnglishPhonemizerBase {
  name = "phonemizer.EnglishARPAbetPhonemizer";
  protected readonly scheme: PhonemeScheme = "arpa";
  protected readonly closesVowels = true;

  /**
   * 音源にその組み合わせの録音が無いとき(ダイフォン音源には欠けがある。CASEは`zh`が全く無い)に、
   * 無音にする代わりに使う候補。録音のある組み合わせが見つかるまで、次の順に試す。
   * 1. 母音はそのまま、子音を近い子音に 2. 母音を近い母音に(子音は元のものから) 3. 子音も母音も近いもの
   */
  private near(
    list: readonly string[],
    table: Record<string, string[]>,
  ): string[] {
    return list.flatMap((x) => [x, ...(table[x] ?? [])]);
  }

  /**
   * `c v`の形の候補を、母音を変えない順に並べる(母音の近さが外側、子音の近さが内側)。
   * 録音が無い組では、母音を変えるより子音を近い子音に変えるほうが目立たない。母音は伸ばして歌うので、
   * 変えると前後の母音と繋がらず途切れて聞こえる(`ae b`が無いとき、`aa b`でなく`ae p`を使う)。
   */
  private pairs(
    cs: string[],
    vs: string[],
    join: (c: string, v: string) => string,
  ): string[] {
    return vs.flatMap((v) => cs.map((c) => join(c, v)));
  }

  protected cvCandidates({
    onset,
    v,
    isExt,
    prevV,
    prevCoda,
  }: CvContext): CvCandidate[] {
    const vowels = [v, ...(similarVowels[v] ?? [])];
    const bare = vowels.map((x) => ({ alias: x, lead: null as string | null }));
    if (isExt) return bare;
    if (onset.length === 0) {
      // 直前が子音で終わっていたら、その子音から母音へ。母音から母音への繋ぎ(`ay ih`)では、
      // 語尾の子音の後で母音がもう一度鳴ってしまう
      // 語尾の子音からの繋ぎでは、近い子音で代用しない(`ng ay`が無いからと`n ay`にすると、語にない子音が増える)。
      // 無ければ、母音だけで始める
      const cs = prevCoda !== null ? [prevCoda] : [];
      const heads =
        prevCoda !== null
          ? this.pairs(cs, vowels, (c, x) => `${c} ${x}`)
          : vowels.map((x) => (prevV === null ? `- ${x}` : `${prevV} ${x}`));
      return [...heads.map((alias) => ({ alias, lead: null })), ...bare];
    }
    const last = onset[onset.length - 1];
    const lead = prevV === null ? null : onset[0];
    const cands = this.pairs(
      this.near([last], similarConsonants),
      vowels,
      (c, x) => `${c} ${x}`,
    ).map((alias) => ({ alias, lead }));
    // CASEの`y uw`(you)は、母音が`iy`のまま約340ms続いてから`uw`になるので、短いノートでは`yee`になる。
    // 別テイクの`y uw3`は約150msで`uw`に移る。別テイクが無い音源では、普通の`y uw`を使う
    if (last === "y" && v === "uw") cands.unshift({ alias: "y uw3", lead });
    // 録音がどれも無いときの最後の手段。子音は落ちるが、母音は鳴らす
    return [...cands, ...bare];
  }

  protected vcCandidates(prev: string, c: string): string[] {
    if (c === VOWEL_END) {
      return [prev, ...(similarVowels[prev] ?? [])].map((x) => `${x} -`);
    }
    // 母音の間の`g`(sugar)で`uh g`が無いときは、`k`より有声の`d`を先に代用する(`g~`の印。sharp cutoffを避ける)
    const voicedG = c === "g~";
    if (voicedG) c = "g";
    const table = voicedG
      ? { ...similarConsonants, g: ["d", "k"] }
      : similarConsonants;
    return this.pairs(
      this.near([c], table),
      [prev, ...(similarVowels[prev] ?? [])],
      (cc, x) => `${x} ${cc}`,
    );
  }
}
