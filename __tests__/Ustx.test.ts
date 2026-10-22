import { describe, expect, it } from "vitest";
import { Ust } from "../src/lib/Ust";
import { dumpUstx, ustxToUstLines } from "../src/lib/Ustx";

const sample = `
name: t
tempos:
- {position: 0, bpm: 140}
- {position: 960, bpm: 90}
voice_parts:
- name: p
  track_no: 0
  position: 0
  notes:
  - {position: 0, duration: 480, tone: 60, lyric: あ}
  - {position: 720, duration: 240, tone: 62, lyric: い, vibrato: {length: 50, period: 175, depth: 25, in: 10, out: 10, shift: 0, drift: 0}}
  - {position: 960, duration: 480, tone: 64, lyric: う}
`;

describe("ustx", () => {
  it("converts to ust with rests and tempo", () => {
    const ust = new Ust();
    ust.loadText(ustxToUstLines(sample));
    expect(ust.tempo).toBe(140);
    expect(ust.notes.map((n) => [n.lyric, n.length, n.notenum])).toEqual([
      ["あ", 480, 60],
      ["R", 240, 60],
      ["い", 240, 62],
      ["う", 480, 64],
    ]);
    expect(ust.notes[2].vibrato.length).toBe(50);
    expect(ust.notes[3].tempo).toBe(90);
  });
  it("round-trips", () => {
    const ust = new Ust();
    ust.loadText(ustxToUstLines(sample));
    const out = dumpUstx(ust.notes, ust.tempo);
    const ust2 = new Ust();
    ust2.loadText(ustxToUstLines(out));
    expect(ust2.notes.map((n) => [n.lyric, n.length, n.notenum])).toEqual(
      ust.notes.map((n) => [n.lyric, n.length, n.notenum])
    );
  });
});

describe("track selection", () => {
  const multi = (names: string[]) => `
tempos: [{position: 0, bpm: 120}]
tracks: [${names.map((n) => `{track_name: "${n}"}`).join(", ")}]
voice_parts:
${names
  .map(
    (n, i) =>
      `- {track_no: ${i}, position: 0, notes: [{position: 0, duration: 480, tone: ${60 + i}, lyric: ${n.replace(/\W/g, "")}}]}`
  )
  .join("\n")}
`;
  const lyricsOf = (text: string) => {
    const ust = new Ust();
    ust.loadText(ustxToUstLines(text));
    return ust.notes.map((n) => n.lyric);
  };

  it("imports the track named main even when a harmony track comes first", () => {
    expect(lyricsOf(multi(["high harmony", "low harmony", "main", "rah"]))).toEqual(["main"]);
  });
  it("also recognizes lead", () => {
    expect(lyricsOf(multi(["harmony", "Lead Vocal"]))).toEqual(["LeadVocal"]);
  });
  it("falls back to the first track when none is named main or lead", () => {
    expect(lyricsOf(multi(["alto", "soprano"]))).toEqual(["alto"]);
  });
});
