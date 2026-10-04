import type { BaseVoiceBank } from "../VoiceBanks/BaseVoiceBank";

/** ARPAbetダイフォン音源に特徴的なエイリアス。`- ay`、`k ae`、`ay -`など */
const arpaProbes = [
  "- ah", "- iy", "- ae", "ah -", "iy -", "ay -",
  "k ah", "t iy", "s ah", "m aa", "n ow", "ah k", "iy t", "ae t",
];

/** VCCV音源(CZ-SAMPA)にしかない母音記号。日本語やARPAbetの音源には現れない */
const vccvOnlyVowels = ["@", "I", "E", "A", "O", "3", "9", "8", "6", "Q"];
/** VCCV音源でも日本語のローマ字音源でも使われる母音記号 */
const vccvCommonVowels = ["a", "e", "i", "o", "u"];
const vccvConsonants = ["t", "k", "n", "s", "d", "m", "l", "r"];

const has = (vb: BaseVoiceBank, alias: string): boolean =>
  !!(vb.getOtoRecord(alias, 60, "") || vb.getOtoRecord(alias + "1", 60, ""));

/**
 * 音源がARPAbetダイフォン音源(CASEなど)かを、代表的なエイリアスの有無で判定する。
 * 日本語のCV/VCV音源や、CZ-SAMPAのVCCV音源ではfalseになる。
 */
export const isArpabetDiphoneBank = (vb: BaseVoiceBank): boolean => {
  const found = arpaProbes.filter((a) => has(vb, a));
  return found.length >= 8;
};

/**
 * 音源が英語VCCV/VCV音源(OpenUtauのEnglish VCCV Phonemizerと同じCZ-SAMPA規則)かを判定する。
 * `@ t`、`I t`、`E n`のようなVCエイリアス(間の空白は無くてもよい)と、`-ba`、`-ka`のような
 * 語頭CVエイリアスを探す。CZ-SAMPAにしかない母音を含むVCが複数あるときだけtrueにするので、
 * 日本語のローマ字VCV音源(`a ka`)や、ARPAbet音源(`ay k`)は対象にならない。
 */
export const isVccvBank = (vb: BaseVoiceBank): boolean => {
  let vc = 0;
  for (const v of vccvOnlyVowels) {
    if (vccvConsonants.some((c) => has(vb, `${v} ${c}`) || has(vb, `${v}${c}`))) {
      vc++;
    }
  }
  if (vc < 4) return false;
  // 語頭CV。`-ba`と`ba`は、vccvOnlyVowelsを含まないので別に確かめる
  const heads = ["b", "d", "k", "m", "p", "s", "t"].filter((c) =>
    vccvCommonVowels.some((v) => has(vb, `-${c}${v}`) || has(vb, `${c}${v}`))
  );
  return heads.length >= 4;
};
