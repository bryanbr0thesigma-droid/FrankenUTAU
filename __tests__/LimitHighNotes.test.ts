import { describe, expect, it } from "vitest";
import { Note } from "../src/lib/Note";
import { LimitHighNotesBatchProcess } from "../src/lib/BatchProcess/LimitHighNotesBatchProcess";

const makeNotes = (spec: Array<[string, number]>) =>
  spec.map(([lyric, notenum]) => {
    const n = new Note();
    n.lyric = lyric;
    n.notenum = notenum;
    n.tempo = 120;
    n.length = 480;
    return n;
  });

describe("LimitHighNotesBatchProcess", () => {
  const run = (spec: Array<[string, number]>, ceiling: number) =>
    new LimitHighNotesBatchProcess()
      .process(makeNotes(spec), { ceiling })
      .map((n) => n.notenum);

  it("drops notes above the ceiling by whole octaves, keeping the note name", () => {
    // D5(74)は上限内。D#5(75)→D#4(63)、C6(84)→C5(72)、F#5(78)→F#4(66)
    expect(run([["a", 74], ["a", 75], ["a", 84], ["a", 78]], 74)).toEqual([74, 63, 72, 66]);
  });

  it("leaves notes at or below the ceiling and rests alone", () => {
    expect(run([["a", 60], ["a", 74], ["R", 90]], 74)).toEqual([60, 74, 90]);
  });

  it("does not modify the original notes", () => {
    const notes = makeNotes([["a", 84]]);
    new LimitHighNotesBatchProcess().process(notes, { ceiling: 72 });
    expect(notes[0].notenum).toBe(84);
  });

  it("keeps the pitch of every note a multiple of 12 away from the original", () => {
    for (const nn of [66, 71, 75, 80, 84, 95, 107]) {
      const out = run([["a", nn]], 72)[0];
      expect(out).toBeLessThanOrEqual(72);
      expect((nn - out) % 12).toBe(0);
    }
  });
});
