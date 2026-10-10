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

describe("sparse diphone banks: nearest vowel instead of silence", () => {
  const missing = ["s aw", "f uh", "v aa"];
  const sparseVb = {
    getOtoRecord: (a: string) => (missing.includes(a) ? null : records.get(a) ?? null),
  } as any;
  const alias = (lyrics: string[]) => {
    const p = new EnglishARPAbetPhonemizer();
    const notes = lyrics.map((lyric) => {
      const n = new Note();
      n.lyric = lyric; n.tempo = 120; n.notenum = 60; n.length = 480; n.phonemizer = p;
      return n;
    });
    // @ts-ignore
    notes.forEach((n, i) => { n.prev = notes[i - 1]; n.next = notes[i + 1]; });
    notes.forEach((n) => n.applyOto(sparseVb));
    return notes.map((n) => n.atAlias);
  };
  it("uses the exact alias when it exists", () => {
    expect(alias(["so"])).toEqual(["s ow"]);
  });
  it("falls back to a close vowel when the exact CV is missing", () => {
    // `full`の`f uh`は無いので、`uh`に近い母音(uw)の`f uw`を使う
    expect(alias(["I", "full"])[1]).toBe("f uw");
    expect(alias(["I", "sour"])[1]).toMatch(/^s (ow|aa|ao)$/);
  });
});

describe("short notes keep their tail consonant", () => {
  /** テンポとtick長を指定して`cat`を1ノートだけ歌わせ、CV+VCの何個のparamsになるかを返す */
  const paramCount = (tempo: number, length: number) => {
    const p = new EnglishARPAbetPhonemizer();
    const mk = (lyric: string) => {
      const n = new Note();
      n.lyric = lyric; n.tempo = tempo; n.notenum = 60; n.length = length; n.phonemizer = p;
      return n;
    };
    const notes = [mk("cat"), mk("R")];
    // @ts-ignore
    notes.forEach((n, i) => { n.prev = notes[i - 1]; n.next = notes[i + 1]; });
    notes.forEach((n) => n.applyOto(vb));
    const params = p.getRequestParam(vb, notes[0], "", {
      velocity: 100, intensity: 100, modulation: 0,
      envelope: { point: [0, 5, 35, 0], value: [0, 100, 100, 0] },
    });
    return params.length;
  };

  it("plays CV + tail on a comfortable note", () => {
    expect(paramCount(120, 480)).toBe(2);
  });
  it("still plays the tail on a short, fast note by shortening it", () => {
    // 150bpmの16分音符(約100ms)
    expect(paramCount(150, 120)).toBe(2);
  });
  it("drops the tail only when there is essentially no room for it", () => {
    expect(paramCount(150, 10)).toBe(1);
  });
});

describe("joins after a consonant ending and missing consonants (CASE has no zh)", () => {
  it("starts a vowel-initial word from the previous consonant, not from the previous vowel", () => {
    // `slice it`: 以前は`ay ih`で、`ay`がもう一度鳴っていた
    const out = sing(["slice", "it", "R"]);
    expect(out[0][0]).toBe("l ay");
    expect(out[0][1]).toBe("ay s");
    expect(out[1][0]).toBe("s ih");
  });

  it("uses the last consonant of a cluster ending for that join", () => {
    // `sides of`: 語尾はd z。ay dの後にz ahで繋ぐ
    const out = sing(["sides", "of", "R"]);
    expect(out[0][1]).toBe("ay d");
    expect(out[1][0]).toBe("z ah");
  });

  it("still joins vowel to vowel when the previous word ends in a vowel", () => {
    expect(sing(["I", "of", "R"])[1][0]).toBe("ay ah");
  });

  it("does not leave the second syllable of pleasure silent when zh is missing", () => {
    const out = sing(["pleasure", "+", "R"]);
    expect(out[0][0]).toBe("l eh");
    // `zh`の録音は無いので、近い`sh`で代用する(以前は無音になっていた)
    expect(out[1][0]).toMatch(/^(sh|jh|z) er$|^(sh|jh|z) (ah|uh|eh)$/);
    expect(out[1][0]).not.toBe("R");
  });

  it("plays type as t ay + ay p", () => {
    const out = sing(["type", "R"]);
    expect(out[0][0]).toBe("t ay");
    expect(out[0][1]).toBe("ay p");
  });
});

describe("diphthong stand-ins start like the diphthong", () => {
  it("sour: when s aw is missing, uses s aa (aw starts like aa), not s ow", () => {
    const out = sing(["sour", "+", "R"]);
    expect(out[0][0]).toBe("s aa");
    // 続く`aw er`の繋ぎは、元の`aw`から始まるので、`aa`の後なら自然に繋がる
    expect(out[1][0]).toBe("aw er");
  });
});

describe("tail length cap (35% of the note)", () => {
  const tailMs = (tempo: number, length: number) => {
    const p: any = new EnglishARPAbetPhonemizer();
    const mk = (lyric: string) => {
      const n = new Note();
      n.lyric = lyric; n.tempo = tempo; n.notenum = 60; n.length = length; n.phonemizer = p;
      return n;
    };
    const notes = [mk("cat"), mk("R")];
    // @ts-ignore
    notes.forEach((n, i) => { n.prev = notes[i - 1]; n.next = notes[i + 1]; });
    notes.forEach((n) => n.applyOto(vb));
    notes.forEach((n) => n.autoFitParam());
    const nc = p.getNextConsonant(notes[1]);
    const vc = p.getOtoRecord(vb, p.getLastPhoneme(notes[0], vb), nc.consonant, 60, "", true);
    return { ms: notes[0].msLength, tail: p.getVCTargetLength(notes[0], vc, nc) };
  };

  it("keeps the tail piece to about a third of a fast note so the vowel has room", () => {
    const { ms, tail } = tailMs(150, 240); // 200ms
    expect(tail).toBeLessThanOrEqual(ms * 0.35 + 0.001);
  });
  it("never goes below the 30 ms floor", () => {
    expect(tailMs(150, 60).tail).toBeGreaterThanOrEqual(30);
  });
  it("leaves a long note's natural tail length alone", () => {
    const { tail } = tailMs(60, 1920);
    expect(tail).toBeGreaterThan(60);
  });
});

describe("the tail piece gets the pitch of its own time span, not the end of the note", () => {
  it("pads with the first pitch value when the tail starts before the pitch curve", async () => {
    const { decodePitch, pitchFromIndex } = await import("../src/utils/pitch");
    expect(pitchFromIndex([5, 6, 7, 8], 1)).toEqual([6, 7, 8]);
    // 以前は`slice(-2)`になり、[7, 8]だけが返っていた
    expect(pitchFromIndex([5, 6, 7, 8], -2)).toEqual([5, 5, 5, 6, 7, 8]);
    expect(pitchFromIndex([], -2)).toEqual([0, 0]);

    // 実際のノート: 前のノートと音高が違う短いノートの末尾VC
    const p = new EnglishARPAbetPhonemizer();
    const mk = (lyric: string, notenum: number) => {
      const n = new Note();
      n.lyric = lyric; n.tempo = 150; n.notenum = notenum; n.length = 240; n.phonemizer = p;
      return n;
    };
    const notes = [mk("I", 72), mk("cat", 60), mk("R", 60)];
    // @ts-ignore
    notes.forEach((n, i) => { n.prev = notes[i - 1]; n.next = notes[i + 1]; });
    notes.forEach((n) => n.applyOto(vb));
    const params = p.getRequestParam(vb, notes[1], "", {
      velocity: 100, intensity: 100, modulation: 0,
      envelope: { point: [0, 5, 35, 0], value: [0, 100, 100, 0] },
    });
    expect(params.length).toBe(2);
    const cv = decodePitch(params[0].resamp!.pitches as string);
    const vc = decodePitch(params[1].resamp!.pitches as string);
    // 前のノートより低い音への移り変わりがあるので、先頭はノート本来の音高から離れている
    expect(Math.abs(cv[0])).toBeGreaterThan(Math.abs(cv[cv.length - 1]));
    // VCの先頭は、ノート終わりの音高ではなく、ピッチ列の先頭の値から始まる
    expect(vc[0]).toBe(cv[0]);
  });
});
