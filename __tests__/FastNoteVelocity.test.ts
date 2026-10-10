import { describe, expect, it } from "vitest";
import { Note } from "../src/lib/Note";
import { speedUpShortNotes } from "../src/lib/English/fastNoteVelocity";

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
  it("leaves rests, forced aliases and explicit velocities alone", () => {
    const rest = note("R", 240);
    const forced = note("!ma", 240);
    const explicit = note("love", 240, 120);
    expect(speedUpShortNotes([rest, forced, explicit])).toBe(0);
    expect(explicit.velocity).toBe(120);
  });
});
