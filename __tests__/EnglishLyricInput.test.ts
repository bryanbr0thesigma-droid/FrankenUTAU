import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { setEnglishDict, wordToSyllables } from "../src/lib/English/EnglishG2p";
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

/** 歌詞を1ノートずつ並べて、選ばれたエイリアスを返す */
const aliases = (lyrics: string[]) => {
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
  return notes.map((n) => n.atAlias);
};

describe("English lyric input on an ARPAbet bank", () => {
  it("reads a bare ARPAbet vowel as that phoneme, not as an English word", () => {
    expect(aliases(["ay"])).toEqual(["- ay"]);
    expect(aliases(["ah"])).toEqual(["- ah"]);
    expect(aliases(["uw"])).toEqual(["- uw"]);
    expect(aliases(["ow"])).toEqual(["- ow"]);
  });

  it("reads three or more ARPAbet tokens like a [bracketed] hint", () => {
    expect(wordToSyllables("k ae t", "arpa")).toEqual(wordToSyllables("[k ae t]", "arpa"));
    expect(aliases(["k ae t"])).toEqual(aliases(["[k ae t]"]));
    expect(aliases(["k ae t"])).not.toEqual(["R"]);
  });

  it("ignores punctuation around a word", () => {
    for (const w of ["hello,", "hello.", '"hello"', "(hello)", "hello?"]) {
      expect(aliases([w]), w).toEqual(aliases(["hello"]));
    }
  });

  it("keeps the existing behavior for words, aliases and forced aliases", () => {
    expect(aliases(["hello", "+"])).toEqual(["hh ah", "l ow"]);
    expect(aliases(["ay k"])).toEqual(["ay k"]);
    expect(aliases(["k ae"])).toEqual(["k ae"]);
    expect(aliases(["!ay k"])).toEqual(["ay k"]);
    expect(aliases(["ku"])).toEqual(["k uw"]);
    expect(aliases(["R"])).toEqual(["R"]);
    // `!`は強制エイリアスの印なので、句読点としては扱わない
    expect(aliases(["hello!"])).toEqual(["R"]);
  });
});

describe("typographic apostrophes", () => {
  it("reads I’d and I'm like their straight-apostrophe spellings", () => {
    expect(aliases(["I’d"])).toEqual(aliases(["I'd"]));
    expect(aliases(["I’d"])).not.toEqual(["R"]);
    expect(aliases(["don’t"])).toEqual(aliases(["don't"]));
  });
});
