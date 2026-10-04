import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Note } from "../src/lib/Note";
import { convertVccvNotes, parseVccvPiece } from "../src/lib/English/vccvToArpa";

/** Cyn English(ARPAbetのCVVC音源)のエイリアス名 */
const bank = new Set(
  readFileSync("__tests__/fixtures/cyn-aliases.txt", "utf8").split("\n").filter(Boolean)
);
const has = (a: string) => bank.has(a);
const resolve = (a: string) => (bank.has(a) ? a : null);

const makeNotes = (lyrics: string[]) =>
  lyrics.map((lyric) => {
    const n = new Note();
    n.lyric = lyric;
    n.tempo = 120;
    n.notenum = 60;
    n.length = 120;
    n.preutter = 90;
    n.overlap = 45;
    return n;
  });

describe("VCCV piece -> ARPAbet CVVC alias", () => {
  const conv = (l: string) => {
    const p = parseVccvPiece(l, resolve);
    return p === null ? null : p.kind === "rest" || p.kind === "hold" ? p.kind : p.alias;
  };
  it("converts CV, VC and initial-vowel pieces", () => {
    expect(conv("-dhA")).toBe("dh ey");
    expect(conv("sA")).toBe("s ey");
    expect(conv("_ra")).toBe("r aa");
    expect(conv("A s")).toBe("ey s");
    expect(conv("an")).toBe("aa n");
    expect(conv("em-")).toBe("eh m");
    expect(conv("-u")).toBe("- ah");
    expect(conv("dhu")).toBe("dh ah");
  });
  it("reads the less common vowel symbols", () => {
    expect(conv("sh1")).toBe("sh ih");
    expect(conv("w0")).toBe("w er");
    expect(conv("shx")).toBe("sh ah");
    expect(conv("k&")).toBe("k ae");
    expect(conv("mE")).toBe("m iy");
  });
  it("uses the part of CVC / VCC pieces the bank has", () => {
    expect(conv("h9l")).toBe("hh ao");
    expect(conv("arb")).toBe("aa r");
  });
  it("treats vowel-only pieces as holds and consonant clusters as rests", () => {
    expect(conv("A")).toBe("hold");
    expect(conv("AI")).toBe("hold");
    expect(conv("I1")).toBe("hold");
    expect(conv("O-")).toBe("hold");
    expect(conv("pr")).toBe("rest");
    expect(conv("st")).toBe("rest");
    expect(conv("R")).toBe("rest");
  });
  it("returns null for text that is not a VCCV piece", () => {
    expect(conv("hello")).toBeNull();
    expect(conv("!ay k")).toBeNull();
    expect(conv("あ")).toBeNull();
  });
});

describe("convertVccvNotes", () => {
  const lyrics = ["R", "-dhA", "A s", "sA", "A", "A m", "mI", "pr", "_ra", "a b", "R"];

  it("converts a VCCV-style song for an ARPAbet bank", () => {
    const notes = makeNotes(lyrics);
    const total = notes.reduce((s, n) => s + n.length, 0);
    const r = convertVccvNotes(notes, has)!;
    expect(r.notes.map((n) => n.lyric)).toEqual([
      "R", "dh ey", "ey s", "s ey", "ey m", "m ay", "R", "r aa", "aa b", "R",
    ]);
    // 伸ばし(`A`)は直前のCV(`sA`)の長さに足される。曲の長さは変わらない
    expect(r.notes[3].length).toBe(240);
    expect(r.notes.reduce((s, n) => s + n.length, 0)).toBe(total);
    // 休符(`R`)は数えない。`pr`だけが新たに休符になる
    expect(r).toMatchObject({ converted: 7, merged: 1, rests: 1 });
  });

  it("drops the timing values saved for the other bank", () => {
    const notes = makeNotes(lyrics);
    expect(notes[1].preutter).toBe(90);
    convertVccvNotes(notes, has);
    expect(notes[1].preutter).toBeUndefined();
    expect(notes[1].overlap).toBeUndefined();
  });

  it("leaves songs alone when the bank already has their lyrics", () => {
    const notes = makeNotes(["R", "dh ey", "ey s", "s ey"]);
    expect(convertVccvNotes(notes, has)).toBeNull();
    expect(notes.map((n) => n.lyric)).toEqual(["R", "dh ey", "ey s", "s ey"]);
  });

  it("leaves songs alone when the lyrics are English words", () => {
    expect(convertVccvNotes(makeNotes(["hello", "+", "world"]), has)).toBeNull();
    // `go`や`run`はVCCVのピースとしても読めるが、VCCV特有の記号が無いので変換しない
    expect(convertVccvNotes(makeNotes(["go", "run", "to", "me", "so", "be"]), has)).toBeNull();
  });

  it("does not merge a held vowel into a VC or a rest", () => {
    const r = convertVccvNotes(makeNotes(["-dhA", "A s", "A", "R", "A", "sA"]), has)!;
    expect(r.notes.map((n) => n.lyric)).toEqual(["dh ey", "ey s", "R", "R", "R", "s ey"]);
  });
});
