import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { setEnglishDict } from "../src/lib/English/EnglishG2p";
import { Note } from "../src/lib/Note";
import { EnglishARPAbetPhonemizer } from "../src/lib/Phonemizer/EnglishARPAbetPhonemizer";

/** CASE音源のoto.iniから作った、エイリアスだけを持つ疑似音源 */
const records = new Map<string, any>();
for (const line of readFileSync("__tests__/fixtures/case-oto.txt", "utf8").split("\n")) {
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

/** wavは複数のエイリアスを含むので、ファイル名と開始位置でエイリアスを特定する */
const aliasOf = (file: string, offset: number) =>
  [...records.values()].find(
    (r) => r.filename === file && Math.max(0, r.offset) === offset
  )?.alias;

const sing = (lyrics: string[]) => {
  const p = new EnglishARPAbetPhonemizer();
  const notes = lyrics.map((lyric) => {
    const n = new Note();
    n.lyric = lyric;
    n.tempo = 120;
    n.notenum = 60;
    n.length = 480;
    n.phonemizer = p;
    return n;
  });
  notes.forEach((n, i) => {
    // @ts-ignore
    n.prev = notes[i - 1];
    // @ts-ignore
    n.next = notes[i + 1];
  });
  notes.forEach((n) => n.applyOto(vb));
  return notes.map((n) => {
    const params = n.phonemizer.getRequestParam(vb, n, "", {
      velocity: 100, intensity: 100, modulation: 0,
      envelope: { point: [0, 5, 35, 0], value: [0, 100, 100, 0] },
    });
    // [CV, 末尾VC]の順にエイリアス(ファイル名ではなく原音設定名)を並べる
    return params.map((q, i) =>
      i === 0 ? n.atAlias : aliasOf(q.resamp!.inputWav, q.resamp!.offsetMs)
    );
  });
};

describe("EnglishARPAbetPhonemizer with CASE aliases", () => {
  it("hello + (consonant start, vowel ending)", () => {
    const out = sing(["hello", "+", "R"]);
    expect(out[0][0]).toBe("hh ah");
    expect(out[0][1]).toBe("ah l");
    expect(out[1][0]).toBe("l ow");
    expect(out[1][1]).toBe("ow -");
  });
  it("cat (coda before rest)", () => {
    const out = sing(["cat", "R"]);
    expect(out[0][0]).toBe("k ae");
    expect(out[0][1]).toBe("ae t");
  });
  it("vowel start and vowel-vowel", () => {
    const out = sing(["i", "+", "R"]);
    expect(out[0][0]).toBe("- ay");
  });
  it("extension notes repeat the vowel", () => {
    const out = sing(["go", "+", "+"]);
    expect(out[0][0]).toBe("g ow");
    expect(out[2][0].replace(/\d+$/, "")).toBe("ow");
  });
  it("never leaves a plain English word without an alias", () => {
    const words = ["hello", "world", "sing", "love", "dream", "beautiful", "night", "fire", "stars", "through"];
    for (const w of words) {
      const notes = sing([w, "+", "+", "+", "R"]);
      expect(notes.length).toBe(5);
    }
  });
});

describe("romaji-style syllables and voicebank detection", () => {
  it("reads ku / ba / shi as one consonant+vowel syllable", () => {
    const out = sing(["ku", "ba", "shi", "R"]);
    expect(out[0][0]).toBe("k uw");
    expect(out[1][0]).toMatch(/^b aa\d*$/);
    expect(out[2][0]).toMatch(/^sh iy\d*$/);
  });
  it("detects an ARPAbet diphone bank, but not a Japanese one", async () => {
    const { isArpabetDiphoneBank } = await import("../src/lib/English/detectScheme");
    expect(isArpabetDiphoneBank(vb)).toBe(true);
    expect(isArpabetDiphoneBank({ getOtoRecord: (a: string) => (["あ", "ka"].includes(a) ? {} : null) } as any)).toBe(false);
  });
  it("accepts exact aliases typed with a space", () => {
    const out = sing(["k ae", "ae t", "R"]);
    expect(out[0][0]).toBe("k ae");
    expect(out[1][0]).toBe("ae t");
  });
});
