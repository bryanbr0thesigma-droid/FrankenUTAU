import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { setEnglishDict, wordToSyllables, wordToSymbols } from "../src/lib/English/EnglishG2p";
import { isXsampaBank, isArpabetDiphoneBank } from "../src/lib/English/detectScheme";
import { splitMultiSyllableWords } from "../src/lib/English/splitSyllables";
import { Note } from "../src/lib/Note";
import { EnglishXSampaPhonemizer } from "../src/lib/Phonemizer/EnglishXSampaPhonemizer";

/** Teto English(重音テト英語)のoto.iniから作った疑似音源 */
const records = new Map<string, any>();
for (const line of readFileSync("__tests__/fixtures/teto-oto.txt", "utf8").split("\n")) {
  if (!line.includes("=")) continue;
  const [filename, rest] = [line.split("=")[0], line.split("=").slice(1).join("=")];
  const [alias, offset, velocity, blank, pre, overlap] = rest.split(",");
  records.set(alias, {
    alias, filename, dirpath: "", offset: +offset, velocity: +velocity,
    blank: +blank, pre: +pre, overlap: +overlap,
  });
}
const vb = { getOtoRecord: (a: string) => records.get(a) ?? null } as any;

beforeAll(() => {
  setEnglishDict(readFileSync("public/dict/cmudict-en.txt", "utf8"));
});

const aliasOf = (file: string, offset: number) =>
  [...records.values()].find((r) => r.filename === file && Math.max(0, r.offset) === offset)?.alias;

const sing = (lyrics: string[], len = 480) => {
  const p = new EnglishXSampaPhonemizer();
  const notes = lyrics.map((l) => {
    const n = new Note();
    n.lyric = l; n.tempo = 120; n.notenum = 60; n.length = len; n.phonemizer = p;
    return n;
  });
  // @ts-ignore
  notes.forEach((n, i) => { n.prev = notes[i - 1]; n.next = notes[i + 1]; });
  notes.forEach((n) => n.applyOto(vb));
  return notes.map((n) =>
    p.getRequestParam(vb, n, "", {
      velocity: 100, intensity: 100, modulation: 0,
      envelope: { point: [0, 5, 35, 0], value: [0, 100, 100, 0] },
    }).map((q, i) => (i === 0 ? n.atAlias : aliasOf(q.resamp!.inputWav, q.resamp!.offsetMs)))
  );
};

describe("X-SAMPA scheme", () => {
  it("maps ARPAbet to X-SAMPA symbols", () => {
    expect(wordToSymbols("cat", "xsampa")).toEqual(["k", "{", "t"]);
    expect(wordToSymbols("ship", "xsampa")).toEqual(["S", "I", "p"]);
    expect(wordToSymbols("think", "xsampa")).toEqual(["T", "I", "N", "k"]);
    expect(wordToSymbols("day", "xsampa")).toEqual(["d", "eI"]);
  });
  it("uses V for a stressed one-syllable ah and @ for weak or unstressed ones", () => {
    expect(wordToSymbols("but", "xsampa")).toEqual(["b", "V", "t"]);
    expect(wordToSymbols("the", "xsampa")).toEqual(["D", "@"]);
    expect(wordToSymbols("about", "xsampa")![0]).toBe("@");
  });
  it("reads spelled-out sounds (uh, nah, ahnd, ghen) for this scheme only", () => {
    expect(wordToSymbols("suh", "xsampa")).toEqual(["s", "V"]);
    expect(wordToSymbols("ghen", "xsampa")![0]).toBe("g");
    expect(wordToSyllables("ahnd", "xsampa")!.length).toBe(1);
  });
});

describe("EnglishXSampaPhonemizer with Teto English aliases", () => {
  it("detects the bank, and not as an ARPAbet bank", () => {
    expect(isXsampaBank(vb)).toBe(true);
    expect(isArpabetDiphoneBank(vb)).toBe(false);
  });
  it("picks - CV at phrase start, CV after, and VC / ending VC for the tail", () => {
    const out = sing(["cat", "R"]);
    expect(out[0]).toEqual(["- k{", "{ t-"]);
    const two = sing(["hello", "+", "R"]);
    expect(two[0][0]).toBe("- h@");
  });
  it("plays the syllables of a split word and a vowel-initial word", () => {
    const out = sing(["a", "bout", "R"]);
    expect(out[0][0]).toBe("- @");
  });
});

describe("splitMultiSyllableWords", () => {
  const make = (lyrics: string[], lens: number[]) => {
    const ns = lyrics.map((l, i) => {
      const n = new Note();
      n.lyric = l; n.tempo = 120; n.notenum = 60; n.length = lens[i];
      return n;
    });
    ns.forEach((n, i) => { n.prev = ns[i - 1]; n.next = ns[i + 1]; });
    return ns;
  };
  it("splits a dictionary word that has more syllables than notes", () => {
    const res = splitMultiSyllableWords(make(["reality", "R"], [960, 480]), "xsampa")!;
    expect(res.notes.map((n) => n.lyric)).toEqual(["reality", "+", "+", "+", "R"]);
    expect(res.notes.slice(0, 4).reduce((t, n) => t + n.length, 0)).toBe(960);
  });
  it("counts existing + notes and only adds the missing ones", () => {
    const res = splitMultiSyllableWords(make(["reality", "+", "R"], [480, 480, 480]), "xsampa")!;
    expect(res.notes.map((n) => n.lyric)).toEqual(["reality", "+", "+", "+", "R"]);
  });
  it("leaves respelled syllables, rests and enough-notes words alone", () => {
    expect(splitMultiSyllableWords(make(["taesks", "prowach", "R"], [480, 480, 480]), "xsampa")).toBeNull();
    expect(splitMultiSyllableWords(make(["hello", "+", "R"], [480, 480, 480]), "xsampa")).toBeNull();
  });
  it("does not split a note that would become too short", () => {
    expect(splitMultiSyllableWords(make(["reality", "R"], [100, 480]), "xsampa")).toBeNull();
  });
});

describe("missing pieces use a similar vowel (Teto has no bV / V b)", () => {
  it("but sings b@ (and @ t-) instead of staying silent", () => {
    expect(records.has("bV")).toBe(false);
    const out = sing(["but", "R"]);
    expect(out[0][0]).toBe("- b@");
    expect(out[0][1]).toBe("V t-"); // V t-はある(無いのはV b)
  });
  it("keeps the exact vowel when it exists", () => {
    expect(sing(["cut", "R"])[0][0]).toBe("- kV");
  });
});
