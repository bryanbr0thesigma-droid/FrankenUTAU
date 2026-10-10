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

  it("plays CV + tail + the t release on a comfortable note", () => {
    // 500ms以上のノートでは、語尾の閉鎖音の解放(`t -`)も足す
    expect(paramCount(120, 480)).toBe(3);
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
    // VCの先頭のピッチは、VCが実際に始まる時刻のピッチ(ピッチ列の先頭は-(preutter+stp)msの位置)
    const note = notes[1];
    const nc = (p as any).getNextConsonant(notes[2]);
    const vcRec = (p as any).getOtoRecord(vb, (p as any).getLastPhoneme(note, vb), nc.consonant, 60, "", true);
    const tail = p.getVCTargetLength(note, vcRec, nc);
    const vp = (p as any).vcAutoFitParam(note, vcRec, tail);
    const base = (note.atPreutter ?? 0) + (note.atStp ?? 0);
    const startMs = note.msLength - tail - (vp.preutter + vp.stp); // ノート開始から見たVCの開始時刻
    const idx = Math.floor((startMs + base) / 1000 / note.pitchSpan);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(vc[0]).toBe(cv[idx]);
  });
});

describe("missing consonants: keep the vowel, use a voiced neighbour, and lead in with the consonant that plays", () => {
  it("pleasure: zh is missing, so the second syllable uses z (voiced), not sh", () => {
    const out = sing(["pleasure", "+", "R"]);
    expect(out[1][0]).toBe("z er");
    // 前の音節の末尾VCも、鳴らすzに合わせる(shに繋いでから zにしない)
    expect(out[0][1]).toMatch(/^eh (z|s)$/);
  });

  it("habit: ae b is missing, so the tail keeps the ae vowel and uses a stop closure (ae p), not aa b", () => {
    const out = sing(["habit", "+", "R"]);
    expect(out[0][0]).toBe("hh ae");
    expect(out[0][1]).toBe("ae p");
    // 第2音節は、辞書のahでなくih(「ha-bit」)。聞き比べで近かった
    expect(out[1][0]).toBe("b ih");
  });
});

describe("joining from the previous word's last consonant", () => {
  it("never invents a different consonant: wrong I'd has no ng ay, so it starts on the plain vowel, not n ay", () => {
    const out = sing(["wrong", "I'd", "R"]);
    expect(out[1][0]).not.toBe("n ay");
    expect(out[1][0]).toBe("ay");
  });
  it("still uses the exact consonant when the piece exists", () => {
    expect(sing(["slice", "it", "R"])[1][0]).toBe("s ih");
  });
});

describe("two-consonant endings get a second tail piece (CC) when the note is long enough", () => {
  const render = (lyric: string, length: number, tempo = 150) => {
    const p = new EnglishARPAbetPhonemizer();
    const mk = (l: string, len: number) => {
      const n = new Note();
      n.lyric = l; n.tempo = tempo; n.notenum = 60; n.length = len; n.phonemizer = p;
      return n;
    };
    const notes = [mk(lyric, length), mk("R", 480)];
    // @ts-ignore
    notes.forEach((n, i) => { n.prev = notes[i - 1]; n.next = notes[i + 1]; });
    notes.forEach((n) => n.applyOto(vb));
    const params = p.getRequestParam(vb, notes[0], "", {
      velocity: 100, intensity: 100, modulation: 0,
      envelope: { point: [0, 5, 35, 0], value: [0, 100, 100, 0] },
    });
    return { note: notes[0], params, count: p.getNotesCount(vb, notes[0]) };
  };
  const names = (r: ReturnType<typeof render>) =>
    r.params.map((q, i) => (i === 0 ? r.note.atAlias : aliasOf(q.resamp!.inputWav, q.resamp!.offsetMs)));

  it("sins on a 400ms note plays CV, VC and CC", () => {
    const r = render("sins", 480);
    expect(names(r)).toEqual(["s ih", "ih n", "n z"]);
    expect(r.count).toBe(r.params.length);
  });

  it("keeps the note's total length (pieces overlap by their own overlap)", () => {
    const r = render("sins", 480);
    const [cv, vc, cc] = r.params.map((q) => q.append as any);
    const total = cv.length + (vc.length - vc.overlap) + (cc.length - cc.overlap);
    expect(total).toBeCloseTo(r.note.outputMs, 6);
    // 単独のVCのとき(CCの無い語尾)と同じ長さになる
    const single = render("sin", 480);
    const [scv, svc] = single.params.map((q) => q.append as any);
    expect(scv.length + (svc.length - svc.overlap)).toBeCloseTo(single.note.outputMs, 6);
  });

  it("both tail pieces get at least 30ms", () => {
    const r = render("sins", 480);
    const [, vc, cc] = r.params.map((q) => q.append as any);
    expect(vc.length).toBeGreaterThan(30);
    expect(cc.length).toBeGreaterThan(30);
  });

  it("the CC piece takes the pitch of the time it starts", async () => {
    const { decodePitch } = await import("../src/utils/pitch");
    const r = render("sins", 480);
    expect(r.params.length).toBe(3);
    const cv = decodePitch(r.params[0].resamp!.pitches as string);
    const cc = decodePitch(r.params[2].resamp!.pitches as string);
    expect(cc.length).toBeGreaterThan(0);
    // 先頭のピッチが、CVのピッチ列にある値と同じ位置(ノート後半)から始まる
    expect(cv).toContain(cc[0]);
  });

  it("falls back to the single tail on a short note, and never adds CC to a one-consonant ending", () => {
    expect(render("sins", 240).params.length).toBe(2); // 200ms
    expect(render("sin", 480).params.length).toBe(2);
    expect(render("sins", 240).count).toBe(2);
  });
});

describe("tail consonants that the recordings cannot play", () => {
  it("that's plays the s, since the t before it is only a silent closure", () => {
    const out = sing(["that's", "R"]);
    expect(out[0]).toEqual(["dh ae", "ae s"]);
    // 有声の閉鎖音(sidesのd z)は、これまでどおり先頭の子音を鳴らす
    expect(sing(["sides", "R"])[0][1]).toBe("ay d");
  });
  it("bit slow skips the unreleased t and goes straight to the s", () => {
    const out = sing(["bit", "slow", "R"]);
    expect(out[0][1]).toBe("ih s");
    expect(out[1][0]).toBe("l ow");
    // 次の語が子音連続でなければ、語尾の子音のまま
    expect(sing(["bit", "low", "R"])[0][1]).toBe("ih t");
  });
  it("you uses the quicker take y uw3 so the vowel is reached on a short note", () => {
    expect(sing(["you", "R"])[0][0]).toBe("y uw3");
  });
});

describe("the last note of a song", () => {
  it("still plays its ending consonant when no rest follows", () => {
    const p = new EnglishARPAbetPhonemizer();
    const n = new Note();
    n.lyric = "more"; n.tempo = 150; n.notenum = 60; n.length = 960; n.phonemizer = p;
    n.applyOto(vb);
    const params = p.getRequestParam(vb, n, "", {
      velocity: 100, intensity: 100, modulation: 0,
      envelope: { point: [0, 5, 35, 0], value: [0, 100, 100, 0] },
    });
    expect(params.length).toBe(2);
    expect(aliasOf(params[1].resamp!.inputWav, params[1].resamp!.offsetMs)).toBe("ao r");
  });
});

describe("release piece only on notes long enough", () => {
  const count = (lyric: string, ticks: number) => {
    const p = new EnglishARPAbetPhonemizer();
    const mk = (l: string, len: number) => {
      const n = new Note();
      n.lyric = l; n.tempo = 150; n.notenum = 60; n.length = len; n.phonemizer = p;
      return n;
    };
    const notes = [mk(lyric, ticks), mk("R", 480)];
    // @ts-ignore
    notes.forEach((n, i) => { n.prev = notes[i - 1]; n.next = notes[i + 1]; });
    notes.forEach((n) => n.applyOto(vb));
    return p.getRequestParam(vb, notes[0], "", {
      velocity: 100, intensity: 100, modulation: 0,
      envelope: { point: [0, 5, 35, 0], value: [0, 100, 100, 0] },
    });
  };
  it("stick (300ms) gets the k release at lower volume; up (200ms) does not", () => {
    const stick = count("stick", 360);
    expect(stick.length).toBe(3);
    expect(stick[2].resamp!.intensity).toBeCloseTo(40, 6);
    expect(count("up", 240).length).toBe(2);
  });
});

describe("stops and affricates before another word", () => {
  const pieces = (lyrics: string[], lens: number[]) => {
    const p = new EnglishARPAbetPhonemizer();
    const notes = lyrics.map((l, i) => {
      const n = new Note();
      n.lyric = l; n.tempo = 150; n.notenum = 60; n.length = lens[i]; n.phonemizer = p;
      return n;
    });
    // @ts-ignore
    notes.forEach((n, i) => { n.prev = notes[i - 1]; n.next = notes[i + 1]; });
    notes.forEach((n) => n.applyOto(vb));
    return notes.map((n) =>
      p
        .getRequestParam(vb, n, "", {
          velocity: 100, intensity: 100, modulation: 0,
          envelope: { point: [0, 5, 35, 0], value: [0, 100, 100, 0] },
        })
        .map((q, i) => (i === 0 ? n.atAlias : aliasOf(q.resamp!.inputWav, q.resamp!.offsetMs)))
    );
  };
  it("sip before please gets the quiet p release on a long note", () => {
    expect(pieces(["sip", "please", "R"], [480, 480, 480])[0]).toEqual(["s ih", "ih p", "p -"]);
  });
  it("hatch before a vowel ends on t, and it starts with ch", () => {
    const out = pieces(["hatch", "it", "R"], [240, 240, 480]);
    expect(out[0]).toEqual(["hh ae", "ae t"]);
    expect(out[1][0]).toBe("ch ih");
    // 休符の前や子音の前は、これまでどおり`sh`で終える
    expect(pieces(["hatch", "R"], [240, 480])[0][1]).toBe("ae sh");
  });
});

describe("s + consonant onsets and missing g", () => {
  const run = (lyrics: string[], lens: number[]) => {
    const p = new EnglishARPAbetPhonemizer();
    const notes = lyrics.map((l, i) => {
      const n = new Note();
      n.lyric = l; n.tempo = 150; n.notenum = 60; n.length = lens[i]; n.phonemizer = p;
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
  it("my skull joins the s to the k with the s k piece, not a short ay s", () => {
    const out = run(["my", "skull", "R"], [240, 480, 480]);
    expect(out[0]).toEqual(["m ay", "s k"]);
    expect(out[1][0]).toBe("k ah");
  });
  it("sugar: with no uh g, the stand-in is the voiced d, not k", () => {
    const out = run(["sugar", "+", "R"], [240, 240, 480]);
    expect(records.has("uh g")).toBe(false);
    expect(out[0][1]).toBe("uh d");
  });
});
