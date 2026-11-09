// Broadcast-style overlay drawn on a 2D canvas each frame: viewfinder corners, channel and signal
// meters, bar counter, timecode, a two-voice scope, the boot sequence, the title card, name tags and
// the closing credits. No lyrics are shown.
import { clamp, smooth, easeOut, hash1, PALETTE } from "./util.js";

const hex = (n) => "#" + n.toString(16).padStart(6, "0");
const CC = hex(PALETTE.cc.main), PG = hex(PALETTE.ping.main), LIME = hex(PALETTE.ping.second);
const MONO = '"JetBrains Mono", "DejaVu Sans Mono", monospace';
const SANS = '"Inter", "DejaVu Sans", sans-serif';
const DISPLAY = '"Inter Display", "Inter", sans-serif';
const JP = '"IPAGothic", "IPAPGothic", sans-serif';

export const CREDITS = [
  ["MUSIC", "次元通信 (Signaling) — AnythingBecomeMoe"],
  ["VOCALS", "Adachi Rei (missile39) · Corrupt-Chan (mono23) — UTAU cover"],
  ["CORRUPT-CHAN 3D", "fan build by bryanbr0"],
  ["PING", "original character made for this MV"],
  ["BASE MODELS", "VRoid samples “Darkness Shibu”, “Sendagaya Shino” (CC0)"],
  ["RENDER", "three.js · three-vrm · headless Chromium"],
];

export class Hud {
  constructor(canvas, tl) {
    this.c = canvas; this.g = canvas.getContext("2d"); this.tl = tl;
    this.W = canvas.width; this.H = canvas.height;
    this.s = this.H / 720; // layout is designed at 720p
    this.off = document.createElement("canvas"); this.off.width = this.W; this.off.height = this.H;
  }
  static async loadFonts() {
    const specs = [`500 18px ${MONO}`, `700 18px ${MONO}`, `400 20px ${SANS}`, `600 20px ${SANS}`, `900 96px ${DISPLAY}`, `400 60px ${JP}`];
    await Promise.all(specs.map((f) => document.fonts.load(f).catch(() => null)));
  }
  draw(t, st) {
    const g = this.g, W = this.W, H = this.H, s = this.s;
    g.clearRect(0, 0, W, H);
    g.save(); g.scale(s, s);
    const w = W / s, h = H / s;
    const A = st.a;
    if (A > 0.01) {
      g.globalAlpha = A;
      this.corners(g, w, h);
      this.channel(g, st);
      this.counter(g, w, st);
      this.scope(g, h, t);
      this.timecode(g, w, h, t);
      g.globalAlpha = 1;
    }
    if (st.boot >= 0) this.boot(g, w, h, st.boot);
    if (st.title >= 0) this.title(g, w, h, st.title, t);
    for (const tag of st.tags) this.tag(g, w, h, tag);
    if (st.credits >= 0) this.credits(g, w, h, st.credits);
    if (st.end >= 0) this.endCard(g, w, h, st.end, t);
    g.restore();
  }
  corners(g, w, h) {
    g.strokeStyle = "rgba(255,255,255,0.75)"; g.lineWidth = 2;
    const m = 30, L = 34;
    for (const [x, y, dx, dy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y + dy * L); g.lineTo(x, y); g.lineTo(x + dx * L, y); g.stroke();
    }
  }
  channel(g, st) {
    const x = 48, y = 58;
    const ch = st.channel;
    const label = ch === "cc" ? "CH.01  CORRUPT-CHAN" : ch === "ping" ? "CH.02  PING" : ch === "both" ? "CH.01 ⇄ CH.02  LINKED" : "CH.--  SCANNING";
    const color = ch === "cc" ? CC : ch === "ping" ? PG : ch === "both" ? LIME : "#9aa0b4";
    const blink = Math.floor(st.t * 2) % 2 === 0;
    g.fillStyle = color; g.globalAlpha *= blink || ch === "both" ? 1 : 0.35;
    g.beginPath(); g.arc(x + 6, y - 6, 6, 0, Math.PI * 2); g.fill();
    g.globalAlpha = st.a;
    g.font = `700 17px ${MONO}`; g.fillStyle = "#ffffff"; g.fillText(label, x + 20, y);
    // signal bars for each channel
    const meter = (mx, my, lvl, col) => {
      for (let i = 0; i < 5; i++) {
        const on = i < Math.round(clamp(lvl * 1.25) * 5);
        g.fillStyle = on ? col : "rgba(255,255,255,0.18)";
        const bh = 5 + i * 3.5; g.fillRect(mx + i * 7, my - bh, 5, bh);
      }
    };
    g.font = `500 12px ${MONO}`; g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillText("01", x + 20, y + 26); meter(x + 42, y + 28, st.loudCC, CC);
    g.fillStyle = "rgba(255,255,255,0.7)"; g.fillText("02", x + 92, y + 26); meter(x + 114, y + 28, st.loudPing, PG);
  }
  counter(g, w, st) {
    g.font = `500 14px ${MONO}`; g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,0.85)";
    const bar = Math.max(0, st.bar), beat = st.beat;
    g.fillText(`SIG 150.000 BPM`, w - 48, 54);
    g.fillText(`BAR ${String(bar).padStart(3, "0")} · ${beat}`, w - 48, 74);
    // beat pips
    for (let i = 0; i < 4; i++) { g.fillStyle = i === beat - 1 ? LIME : "rgba(255,255,255,0.25)"; g.fillRect(w - 48 - (3 - i) * 14 - 8, 84, 8, 8); }
    g.textAlign = "left";
  }
  scope(g, h, t) {
    const x0 = 48, y0 = h - 64, n = 56, dt = 2.2 / n;
    g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(x0 - 6, y0 - 34, n * 5 + 12, 52);
    for (let i = 0; i < n; i++) {
      const tt = t - (n - 1 - i) * dt;
      const a = this.tl.loud("cc", tt), b = this.tl.loud("rei", tt);
      g.fillStyle = CC; g.fillRect(x0 + i * 5, y0 - a * 28, 3, Math.max(1, a * 28));
      g.fillStyle = PG; g.fillRect(x0 + i * 5, y0 + 2, 3, Math.max(1, b * 14));
    }
    g.font = `500 11px ${MONO}`; g.fillStyle = "rgba(255,255,255,0.6)"; g.fillText("RX", x0 - 2, y0 - 38);
  }
  timecode(g, w, h, t) {
    const tt = Math.max(0, t), m = Math.floor(tt / 60), sec = Math.floor(tt % 60), f = Math.floor((tt % 1) * 30);
    g.font = `500 15px ${MONO}`; g.textAlign = "right"; g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillText(`TX ${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}:${String(f).padStart(2, "0")}`, w - 48, h - 46);
    g.textAlign = "left";
  }
  boot(g, w, h, p) {
    const lines = ["> SCANNING DIMENSIONS ...", "> 2 SIGNALS FOUND", "> CH.01  ⇄  CH.02"];
    g.font = `500 20px ${MONO}`;
    const total = lines.join("").length, shown = Math.floor(clamp(p * 1.25) * total);
    let used = 0;
    lines.forEach((ln, i) => {
      const n = clamp(shown - used, 0, ln.length); used += ln.length;
      g.fillStyle = i === 2 ? LIME : "rgba(255,255,255,0.9)";
      g.fillText(ln.slice(0, n) + (n > 0 && n < ln.length ? "_" : ""), w / 2 - 170, h / 2 - 30 + i * 32);
    });
  }
  title(g, w, h, p, t) {
    // p: 0..1 over the card's life; slices glitch on entry and exit
    const a = smooth(p / 0.12) * (1 - smooth((p - 0.85) / 0.15));
    if (a <= 0) return;
    const o = this.off.getContext("2d");
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, this.off.width, this.off.height); o.scale(this.s, this.s);
    const x = 84, y = h * 0.62;
    o.font = `400 46px ${JP}`; o.fillStyle = "#ffffff"; o.fillText("次元通信", x, y - 92);
    o.font = `900 104px ${DISPLAY}`;
    const word = "SIGNALING"; let cx = x;
    for (let i = 0; i < word.length; i++) {
      const k = clamp((p - 0.02 - i * 0.012) / 0.08);
      o.fillStyle = i % 2 ? PG : CC; o.globalAlpha = k;
      o.fillText(word[i], cx, y + (1 - easeOut(k)) * 30);
      cx += o.measureText(word[i]).width + 6;
    }
    o.globalAlpha = 1;
    o.fillStyle = "#ffffff"; o.font = `600 20px ${SANS}`;
    o.fillText("UTAU cover  ·  vocals Adachi Rei × Corrupt-Chan", x + 4, y + 42);
    o.font = `400 17px ${SANS}`; o.fillStyle = "rgba(255,255,255,0.8)";
    o.fillText("MV  ·  Corrupt-Chan × Ping", x + 4, y + 70);
    o.setTransform(1, 0, 0, 1, 0, 0);
    // slice the card for the glitch
    const edge = Math.max(1 - smooth(p / 0.1), smooth((p - 0.86) / 0.1));
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = a;
    const H = this.off.height, rows = 18;
    for (let r = 0; r < rows; r++) {
      const y0 = Math.floor(H * r / rows), hh = Math.ceil(H / rows);
      const j = hash1(r * 7.3 + Math.floor(t * 20)) - 0.5;
      const dx = Math.abs(j) > 0.3 ? j * 80 * this.s * (edge + 0.04) : j * 6 * this.s * edge;
      g.drawImage(this.off, 0, y0, this.off.width, hh, dx, y0, this.off.width, hh);
    }
    g.restore();
  }
  tag(g, w, h, tg) {
    const a = smooth(tg.p / 0.15) * (1 - smooth((tg.p - 0.8) / 0.2));
    if (a <= 0) return;
    const right = tg.side === "right";
    const x = right ? w - 84 : 84, y = h - 132;
    g.save(); g.globalAlpha = a; g.textAlign = right ? "right" : "left";
    const col = tg.who === "cc" ? CC : PG;
    g.fillStyle = col; g.fillRect(right ? x - 4 : x, y - 44, 4, 70);
    const tx = right ? x - 16 : x + 16;
    g.font = `500 14px ${MONO}`; g.fillStyle = tg.who === "cc" ? CC : LIME;
    g.fillText(tg.who === "cc" ? "CH.01 // CONNECTED" : "CH.02 // CONNECTED", tx, y - 26);
    g.font = `900 38px ${DISPLAY}`; g.fillStyle = "#ffffff";
    g.fillText(tg.who === "cc" ? "CORRUPT-CHAN" : "PING", tx, y + 10);
    g.font = `400 15px ${SANS}`; g.fillStyle = "rgba(255,255,255,0.8)";
    g.fillText(tg.who === "cc" ? "voice: Corrupt-Chan" : "voice: Adachi Rei", tx, y + 32);
    g.restore();
  }
  credits(g, w, h, p) {
    const n = CREDITS.length;
    const fadeOut = 1 - smooth((p - 0.92) / 0.08);
    g.save();
    const grad = g.createLinearGradient(0, h * 0.45, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, `rgba(0,0,0,${0.65 * fadeOut})`);
    g.fillStyle = grad; g.fillRect(0, h * 0.45, w, h * 0.55);
    CREDITS.forEach(([k, v], i) => {
      const a = smooth((p * (n + 1) - i) / 0.8) * fadeOut;
      if (a <= 0) return;
      const y = h - 250 + i * 30;
      g.globalAlpha = a;
      g.font = `700 13px ${MONO}`; g.fillStyle = i % 2 ? PG : CC; g.fillText(k, 84, y);
      g.font = `400 18px ${SANS}`; g.fillStyle = "#ffffff"; g.fillText(v, 270, y);
    });
    g.restore();
  }
  endCard(g, w, h, p, t) {
    const a = smooth(p / 0.25);
    g.save(); g.globalAlpha = a; g.textAlign = "center";
    g.font = `700 22px ${MONO}`; g.fillStyle = "#ffffff";
    const msg = "END OF TRANSMISSION";
    const n = Math.floor(clamp(p / 0.4) * msg.length);
    g.fillText(msg.slice(0, n) + (n < msg.length && Math.floor(t * 4) % 2 ? "_" : ""), w / 2, h / 2);
    g.font = `400 15px ${MONO}`; g.fillStyle = LIME; g.fillText("CH.01 ⇄ CH.02", w / 2, h / 2 + 30);
    g.restore();
  }
}
