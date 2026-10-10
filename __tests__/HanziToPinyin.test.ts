import { describe, expect, it } from "vitest";
import { Note } from "../src/lib/Note";
import { convertHanziNotes, pinyinAlias } from "../src/lib/Chinese/hanziToPinyin";

const bank = new Set(["hua", "ya", "li", "wei", "dong", "bei", "tong", "di", "de", "lv", "ao_zh", "er_zh", "ao", "er"]);
const has = (a: string) => bank.has(a);
const makeNotes = (lyrics: string[]) =>
  lyrics.map((lyric) => {
    const n = new Note();
    n.lyric = lyric;
    n.tempo = 120;
    n.notenum = 60;
    n.length = 240;
    return n;
  });

describe("convertHanziNotes", () => {
  it("turns one-character notes into forced pinyin aliases, reading polyphones in context", async () => {
    const r = (await convertHanziNotes(makeNotes(["化", "压", "力", "为", "动", "力"]), has))!;
    expect(r.notes.map((n) => n.lyric)).toEqual(["!hua", "!ya", "!li", "!wei", "!dong", "!li"]);
    expect(r).toMatchObject({ converted: 6, missing: 0 });
  });

  it("reads 悲 as bei and 地 as di after 境", async () => {
    const r = (await convertHanziNotes(makeNotes(["化", "悲", "痛"]), has))!;
    expect(r.notes.map((n) => n.lyric)).toEqual(["!hua", "!bei", "!tong"]);
    const r2 = (await convertHanziNotes(makeNotes(["境", "地"]), (a) => a === "jing" || a === "di"))!;
    expect(r2.notes.map((n) => n.lyric)).toEqual(["!jing", "!di"]);
  });

  it("leaves English words, rests and + alone, and counts syllables the bank lacks", async () => {
    const r = (await convertHanziNotes(makeNotes(["hello", "+", "R", "化", "为", "力"]), (a) => a === "hua" || a === "li"))!;
    expect(r.notes.map((n) => n.lyric)).toEqual(["hello", "+", "R", "!hua", "为", "!li"]);
    expect(r).toMatchObject({ converted: 2, missing: 1 });
  });

  it("returns null when there are no Chinese characters", async () => {
    expect(await convertHanziNotes(makeNotes(["hello", "world", "R"]), has)).toBeNull();
  });
});

describe("pinyinAlias", () => {
  it("uses the _zh names for ao and er, and plain names otherwise", () => {
    expect(pinyinAlias("ao", has)).toBe("ao_zh");
    expect(pinyinAlias("er", has)).toBe("er_zh");
    expect(pinyinAlias("ao", (a) => a === "ao")).toBe("ao");
    expect(pinyinAlias("hua", has)).toBe("hua");
    expect(pinyinAlias("zhuang", has)).toBeNull();
  });
});
