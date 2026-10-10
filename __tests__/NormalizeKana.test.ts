import { describe, expect, it } from "vitest";
import { Note } from "../src/lib/Note";
import { normalizeJapaneseNotes } from "../src/lib/Japanese/normalizeKana";

const bank = new Set(["あ", "い", "う", "え", "お", "か", "し", "て", "wo", "wi", "ち", "ん"]);
const has = (a: string) => bank.has(a);
const makeNotes = (lyrics: string[], length = 240) =>
  lyrics.map((lyric) => {
    const n = new Note();
    n.lyric = lyric;
    n.tempo = 120;
    n.notenum = 60;
    n.length = length;
    return n;
  });

describe("normalizeJapaneseNotes", () => {
  it("merges + holds into the previous sung note", () => {
    const r = normalizeJapaneseNotes(makeNotes(["R", "あ", "+", "+", "い"]), has)!;
    expect(r.notes.map((n) => n.lyric)).toEqual(["R", "あ", "い"]);
    expect(r.notes[1].length).toBe(720);
    expect(r.merged).toBe(2);
  });

  it("turns a + with nothing to extend into a rest", () => {
    const r = normalizeJapaneseNotes(makeNotes(["+", "あ", "R", "+", "い"]), has)!;
    expect(r.notes.map((n) => n.lyric)).toEqual(["R", "あ", "R", "R", "い"]);
    expect(r).toMatchObject({ merged: 0, rests: 2 });
  });

  it("replaces kana the bank lacks with the closest it has, in order of preference", () => {
    const r = normalizeJapaneseNotes(makeNotes(["を", "うぃ", "てぃ", "あ"]), has)!;
    expect(r.notes.map((n) => n.lyric)).toEqual(["wo", "wi", "ち", "あ"]);
    expect(r.remapped).toBe(3);
  });

  it("leaves っ and kana the bank already has alone", () => {
    const r = normalizeJapaneseNotes(makeNotes(["あ", "っ", "か", "+"]), has)!;
    expect(r.notes.map((n) => n.lyric)).toEqual(["あ", "っ", "か"]);
  });

  it("does nothing for songs that are not in kana, or that need no changes", () => {
    expect(normalizeJapaneseNotes(makeNotes(["hello", "+", "world"]), has)).toBeNull();
    expect(normalizeJapaneseNotes(makeNotes(["あ", "い", "う"]), has)).toBeNull();
  });
});
