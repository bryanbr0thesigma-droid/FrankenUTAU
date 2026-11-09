// Song timing and audio features, from build/analysis.json (written by analyze.py).
import { clamp } from "./util.js";

// Sections by bar index (bar k starts at barStarts[0] + k * barLen). Read off the analysis:
// who sings each bar and where the energy rises; see analyze.py's printout.
export const SECTIONS = [
  { name: "intro", b0: 0, b1: 4, apart: true },
  { name: "v1cc", b0: 4, b1: 8, apart: true },
  { name: "v1ping", b0: 8, b1: 13, apart: true },
  { name: "pre1", b0: 13, b1: 17, apart: true },
  { name: "pre1cc", b0: 17, b1: 20, apart: true },
  { name: "ch1", b0: 20, b1: 36, chorus: true },
  { name: "inter1", b0: 36, b1: 40, apart: true, calm: true },
  { name: "v2", b0: 40, b1: 44 },
  { name: "v2ping", b0: 44, b1: 48 },
  { name: "v2cc", b0: 48, b1: 52 },
  { name: "ch2", b0: 52, b1: 69, chorus: true },
  { name: "bridgeA", b0: 69, b1: 78, apart: true, calm: true },
  { name: "bridgeB", b0: 78, b1: 85, apart: true },
  { name: "breakdown", b0: 85, b1: 89, apart: true },
  { name: "ch3", b0: 89, b1: 104, chorus: true, final: true },
  { name: "outro", b0: 104, b1: 110 },
  { name: "end", b0: 110, b1: 114 },
];

export class Timeline {
  constructor(A) {
    this.A = A;
    this.fps = A.fps;
    this.N = A.frames;
    this.duration = A.duration;
    this.period = A.beatPeriod;
    this.barLen = 4 * A.beatPeriod;
    this.bar0 = A.barStarts[0];
    this.firstBeat = A.firstBeat;
  }
  _s(arr, t) {
    const f = t * this.fps, i = Math.floor(f), k = f - i, n = arr.length - 1;
    const a = arr[clamp(i, 0, n)], b = arr[clamp(i + 1, 0, n)];
    return a + (b - a) * k;
  }
  mix(name, t) { return this._s(this.A.mix[name], t); }
  loud(key, t) { return t < 0 ? 0 : this._s(this.A.voice[key].loud, t); }
  vowel(key, t) {
    const v = this.A.voice[key].vowel;
    return v[clamp(Math.round(t * this.fps), 0, v.length - 1)];
  }
  spec(t) { return this.A.spec[clamp(Math.round(t * this.fps), 0, this.A.spec.length - 1)]; }
  // is this singer singing around time t (looks a little ahead so gestures lead the voice)
  singing(key, t) {
    let m = 0;
    for (let d = -0.2; d <= 0.15; d += 0.05) m = Math.max(m, this.loud(key, t + d));
    return m;
  }
  barF(t) { return (t - this.bar0) / this.barLen; }
  barStart(k) { return this.bar0 + k * this.barLen; }
  beatF(t) { return (t - this.bar0) / this.period; } // beats since bar 0's downbeat
  barInfo(k) { const B = this.A.bars; return B[clamp(k, 0, B.length - 1)]; }
  section(t) {
    const b = Math.floor(this.barF(t));
    for (const s of SECTIONS) if (b >= s.b0 && b < s.b1) return s;
    return b < 0 ? SECTIONS[0] : SECTIONS[SECTIONS.length - 1];
  }
  sectionByName(n) { return SECTIONS.find((s) => s.name === n); }
  // who sings in bar k: 'ping', 'cc', 'both' or 'none' (Ping performs the Adachi Rei vocal stem)
  singer(k) {
    const b = this.barInfo(k);
    const r = b.rei > 0.2, c = b.cc > 0.2;
    return r && c ? "both" : r ? "ping" : c ? "cc" : "none";
  }
}
