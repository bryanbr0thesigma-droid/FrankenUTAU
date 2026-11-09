// Colours of the reanimation. The official MV pairs Miku with blue and Teto with magenta; here
// Adachi Rei (Miku's part) takes her own orange and Corrupt-Chan (Teto's part) her violet and
// missing-texture magenta. The night-indigo base and the panel colours stay as in the original.
export const BG = "#0a0620";        // the screen behind the panels
export const PANEL = "#1d1842";     // lyric, chat and list panels
export const PANEL_HI = "#2a2358";
export const INK = "#170d2c";       // outline / line colour
export const YELLOW = "#ffe14a";    // the "special" highlight on some chorus cards

export const REI = {
  key: "rei", name: "Adachi Rei",
  main: "#f2821f",   // chorus panel
  light: "#ffb35c",  // ring highlights, text accents
  pale: "#ffe2bf",
  deep: "#8a3a06",
  text: "#ffa23f",   // first line of each lyric card
  keys: "#f0892c",   // chat keyboard
  night: "#1a1640",  // her verse panel (night sky)
  floor: "#ffcf9a",
  sil: "#ffa23f",    // credits silhouette
};

export const CC = {
  key: "cc", name: "Corrupt-Chan",
  main: "#7d34e0",
  light: "#b98bff",
  pale: "#eadcff",
  deep: "#2c0f5c",
  text: "#ff3fdc",   // magenta, like her LEDs
  magenta: "#ff1fe0",
  keys: "#a03ae8",
  night: "#3a1670",
  floor: "#f1d8ff",
  sil: "#a868ff",
};

export const WHO = { rei: REI, cc: CC };

export const hex = (h) => parseInt(h.slice(1), 16);
export function rgba(h, a) {
  const n = hex(h);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
