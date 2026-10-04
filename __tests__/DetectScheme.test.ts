import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isArpabetDiphoneBank, isVccvBank } from "../src/lib/English/detectScheme";

const bankOf = (aliases: Iterable<string>) => {
  const set = new Set(aliases);
  return { getOtoRecord: (a: string) => (set.has(a) ? { alias: a } : null) } as any;
};

/** 英語VCCV/VCV音源(CZ-SAMPA)を模した、エイリアスだけの音源 */
const vccvAliases = [
  ...["b", "d", "k", "m", "p", "s", "t", "l"].flatMap((c) => [
    `-${c}a`, `${c}a`, `-${c}i`, `${c}i`, `-${c}@`, `${c}@`,
  ]),
  ...["@", "I", "E", "A", "O", "3", "9", "u", "a"].flatMap((v) => [
    `${v} t`, `${v} k`, `${v} n`, `${v}t-`, `${v}n-`,
  ]),
  "a", "i", "@",
];

describe("bank scheme detection", () => {
  it("detects an English VCCV/VCV bank", () => {
    const vb = bankOf(vccvAliases);
    expect(isVccvBank(vb)).toBe(true);
    expect(isArpabetDiphoneBank(vb)).toBe(false);
  });

  it("detects VCCV aliases written without a space", () => {
    const vb = bankOf(vccvAliases.map((a) => a.replace(/^(\S) (\S)$/, "$1$2")));
    expect(isVccvBank(vb)).toBe(true);
  });

  it("is not triggered by the ARPAbet bank CASE", () => {
    const aliases = readFileSync("__tests__/fixtures/case-oto.txt", "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => l.split("=").slice(1).join("=").split(",")[0]);
    const vb = bankOf(aliases);
    expect(isArpabetDiphoneBank(vb)).toBe(true);
    expect(isVccvBank(vb)).toBe(false);
  });

  it("is not triggered by Japanese VCV banks", () => {
    const kana = bankOf(["- あ", "a い", "i う", "u か", "a か", "- か", "あ", "か"]);
    expect(isVccvBank(kana)).toBe(false);
    const romaji = bankOf(
      ["a", "i", "u", "e", "o"].flatMap((v) =>
        ["ka", "sa", "ta", "ma", "ba", "pa", "da"].flatMap((cv) => [
          `${v} ${cv}`, `- ${cv}`, cv,
        ])
      )
    );
    expect(isVccvBank(romaji)).toBe(false);
  });
});
