// Small deterministic helpers shared by the MV modules (no Math.random anywhere: every frame
// must come out the same however the render is split up).
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeInOut = (t) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
export const frac = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;

export function hash1(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
export function hash2(a, b) { return hash1(a * 17.17 + b * 91.31); }

// smooth value noise in 0..1
export function noise1(t, seed = 0) {
  const i = Math.floor(t), f = t - i;
  const a = hash1(i + seed * 57.31), b = hash1(i + 1 + seed * 57.31);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}
// smooth noise in -1..1, two octaves
export function wobble(t, seed = 0) {
  return (noise1(t, seed) - 0.5) * 1.4 + (noise1(t * 2.3, seed + 7) - 0.5) * 0.6;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a pulse that is 1 at time `at` and decays (seconds); 0 before it
export function pulse(t, at, decay) {
  if (t < at) return 0;
  return Math.exp(-(t - at) / decay);
}

export const PALETTE = {
  cc: { main: 0xff1fe0, second: 0x8048dc, deep: 0x1f0f36, light: 0xf0dcff },
  ping: { main: 0x2f6bff, second: 0xb6ff2e, deep: 0x071338, light: 0xcfe6ff },
};
