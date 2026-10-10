import { describe, expect, it } from "vitest";
import { Note } from "../src/lib/Note";
import { NaturalPitchBatchProcess } from "../src/lib/BatchProcess/NaturalPitchBatchProcess";

const make = (spec: Array<[string, number, number]>) =>
  spec.map(([lyric, notenum, length]) => {
    const n = new Note();
    n.lyric = lyric; n.notenum = notenum; n.tempo = 120; n.length = length;
    return n;
  });

describe("NaturalPitchBatchProcess", () => {
  it("adds a glide into notes that follow another sung note, not after a rest or first", () => {
    const out = new NaturalPitchBatchProcess().process(
      make([["a", 60, 480], ["b", 67, 480], ["R", 60, 480], ["c", 62, 480]]),
      undefined as unknown as void
    );
    expect(out[0].pbw).toBeUndefined();
    expect(out[1].pbw).toEqual([80]);
    expect(out[1].pbs.time).toBeCloseTo(-48, 6);
    expect(out[3].pbw).toBeUndefined();
  });

  it("adds a vibrato only to long notes and leaves rests alone", () => {
    const out = new NaturalPitchBatchProcess().process(
      make([["a", 60, 240], ["b", 62, 960], ["R", 60, 960]]),
      undefined as unknown as void
    );
    expect(out[0].vibrato).toBeUndefined(); // 250ms at 120bpm (240 ticks)
    expect(out[1].vibrato).toBeDefined();
    expect(out[2].vibrato).toBeUndefined();
  });

  it("does not touch notes that already have their own pitch, or the originals", () => {
    const src = make([["a", 60, 480], ["b", 62, 480]]);
    src[1].setPbw([30]); src[1].setPby([10]); src[1].pbs = "-20;0";
    const out = new NaturalPitchBatchProcess().process(src, undefined as unknown as void);
    expect(out[1].pbw).toEqual([30]);
    expect(src[0].pbw).toBeUndefined();
  });
});
