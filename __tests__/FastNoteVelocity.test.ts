import { describe, expect, it } from "vitest";
import { Note } from "../src/lib/Note";
import { speedUpShortNotes, velocityFor } from "../src/lib/English/fastNoteVelocity";

const note = (lyric: string, length: number, velocity?: number) => {
  const n = new Note();
  n.lyric = lyric;
  n.tempo = 150;
  n.notenum = 60;
  n.length = length;
  if (velocity !== undefined) n.velocity = velocity;
  return n;
};

describe("speedUpShortNotes", () => {
  it("raises velocity on short sung notes only", () => {
    const short = note("love", 240); // 150bpm: 240 ticks = 200ms
    const long = note("sins", 960); // 800ms
    expect(speedUpShortNotes([short, long])).toBe(1);
    expect(short.velocity).toBe(150);
    expect(long.velocity).toBeUndefined();
  });
  it("leaves rests and explicit velocities alone", () => {
    const rest = note("R", 240);
    const explicit = note("love", 240, 120);
    expect(speedUpShortNotes([rest, explicit])).toBe(0);
    expect(explicit.velocity).toBe(120);
  });
  it("speeds up a CV whose fixed part would not fit in the note (y uw: 337ms fixed, 116ms pre)", () => {
    const n = note("you", 240);
    n.oto = { alias: "y uw", velocity: 337, pre: 116, overlap: 88 } as any;
    expect(velocityFor(n)).toBe(200);
    // 固定部分が短い音は、基本の150のまま
    n.oto = { alias: "t ih", velocity: 140, pre: 100, overlap: 60 } as any;
    expect(velocityFor(n)).toBe(150);
    // 長いノートは、固定部分が長くても100のまま
    const long = note("you", 1920);
    long.oto = { alias: "y uw", velocity: 337, pre: 116, overlap: 88 } as any;
    expect(velocityFor(long)).toBe(100);
  });
});
