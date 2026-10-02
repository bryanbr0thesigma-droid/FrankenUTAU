import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { setEnglishDict, wordToSyllables } from "../src/lib/English/EnglishG2p";
import { Note } from "../src/lib/Note";
import { EnglishVCCVPhonemizer } from "../src/lib/Phonemizer/EnglishVCCVPhonemizer";

beforeAll(() => {
  setEnglishDict(readFileSync("public/dict/cmudict-en.txt", "utf8"));
});

const rec = (alias: string) => ({
  alias,
  filename: `${alias}.wav`,
  dirpath: "",
  offset: 0,
  velocity: 50,
  blank: -200,
  pre: 60,
  overlap: 20,
});
const makeVb = (aliases: string[]) =>
  ({
    getOtoRecord: (a: string) => (aliases.includes(a) ? rec(a) : null),
  }) as any;

const makeNotes = (lyrics: string[], p = new EnglishVCCVPhonemizer()) => {
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
  return notes;
};

describe("English G2P", () => {
  it("syllabifies dictionary words", () => {
    const fmt = (w: string) =>
      wordToSyllables(w)!.map((s) => [...s.onset, s.v, "|", ...s.coda].join(" "));
    expect(fmt("hello")).toEqual(["h u |", "l O |"]);
    expect(fmt("cat")).toEqual(["k @ | t"]);
    expect(fmt("water")).toEqual(["w 9 |", "t 3 |"]);
    expect(wordToSyllables("a b")).toBeNull();
  });
  it("accepts ARPAbet hints and falls back for unknown words", () => {
    expect(wordToSyllables("[k ae t]")![0].v).toBe("@");
    expect(wordToSyllables("zzxqwv")).toBeNull();
    expect(wordToSyllables("blorp")!.length).toBe(1);
  });
});

describe("EnglishVCCVPhonemizer", () => {
  const vb = makeVb([
    "-hu", "hu", "lO", "l O", "u l", "-k@", "k@", "@ t", "@ t-", "@t-",
    "-@", "u", "tO", "O t",
  ]);
  it("picks -CV at phrase start and CV after, with trailing VC", () => {
    const notes = makeNotes(["hello", "+"]);
    notes.forEach((n) => n.applyOto(vb));
    expect(notes.map((n) => n.atAlias)).toEqual(["-hu", "lO"]);
    expect(notes[0].phonemizer.getNotesCount(vb, notes[0])).toBe(2);
    const params = notes[0].phonemizer.getRequestParam(
      vb, notes[0], "", { velocity: 100, intensity: 100, modulation: 0,
        envelope: { point: [0, 5, 35, 0], value: [0, 100, 100, 0] } }
    );
    expect(params.length).toBe(2);
    expect(params[1].resamp!.inputWav).toBe("u l.wav");
  });
  it("uses a closing VC for the coda before a rest", () => {
    const notes = makeNotes(["cat", "R"]);
    notes.forEach((n) => n.applyOto(vb));
    expect(notes[0].atAlias).toBe("-k@");
    const p = notes[0].phonemizer as EnglishVCCVPhonemizer;
    expect(p.getNextConsonant(notes[1])!.consonant).toBe("t-");
    expect(notes[0].phonemizer.getNotesCount(vb, notes[0])).toBe(2);
  });
  it("passes through direct aliases and rests", () => {
    const notes = makeNotes(["!@ t", "R"]);
    notes.forEach((n) => n.applyOto(vb));
    expect(notes[0].atAlias).toBe("@ t");
    expect(notes[1].atAlias).toBe("R");
  });
});
