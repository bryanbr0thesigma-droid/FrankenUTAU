import { describe, expect, it } from "vitest";
import { Ust } from "../src/lib/Ust";
import { ustxToUstLines } from "../src/lib/Ustx";
import { JPCVorVCVPhonemizer } from "../src/lib/Phonemizer/JPCVorVCVPhonemizer";

const rec = (alias: string) => ({
  alias,
  filename: "a.wav",
  dirpath: "",
  offset: 0,
  velocity: 100,
  blank: 0,
  pre: 50,
  overlap: 10,
});

/** VCV音源を模したvb。"- あ"や"a い"のようなエイリアスのみ持つ。 */
const aliases = ["- あ", "a い", "i う", "u か", "a R"];
const vb = {
  getOtoRecord: (alias: string) =>
    aliases.includes(alias) ? rec(alias) : null,
} as any;

const ustx = `
tempos: [{position: 0, bpm: 120}]
voice_parts:
- {track_no: 0, position: 0, notes: [
  {position: 0, duration: 480, tone: 60, lyric: あ},
  {position: 480, duration: 480, tone: 62, lyric: い},
  {position: 960, duration: 480, tone: 64, lyric: う},
  {position: 1440, duration: 480, tone: 65, lyric: か}]}
`;

describe("ustx + VCV", () => {
  it("resolves VCV aliases for imported notes", () => {
    const ust = new Ust();
    ust.loadText(ustxToUstLines(ustx));
    const p = new JPCVorVCVPhonemizer();
    ust.notes.forEach((n) => (n.phonemizer = p));
    ust.notes.forEach((n) => n.applyOto(vb));
    expect(ust.notes.map((n) => n.atAlias)).toEqual([
      "- あ",
      "a い",
      "i う",
      "u か",
    ]);
  });
});
