import type { BaseVoiceBank } from "../VoiceBanks/BaseVoiceBank";

/** ARPAbetダイフォン音源に特徴的なエイリアス。`- ay`、`k ae`、`ay -`など */
const arpaProbes = [
  "- ah", "- iy", "- ae", "ah -", "iy -", "ay -",
  "k ah", "t iy", "s ah", "m aa", "n ow", "ah k", "iy t", "ae t",
];

/**
 * 音源がARPAbetダイフォン音源(CASEなど)かを、代表的なエイリアスの有無で判定する。
 * 日本語のCV/VCV音源や、CZ-SAMPAのVCCV音源ではfalseになる。
 */
export const isArpabetDiphoneBank = (vb: BaseVoiceBank): boolean => {
  const found = arpaProbes.filter(
    (a) => vb.getOtoRecord(a, 60, "") || vb.getOtoRecord(a + "1", 60, "")
  );
  return found.length >= 8;
};
