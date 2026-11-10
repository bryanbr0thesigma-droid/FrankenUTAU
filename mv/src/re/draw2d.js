// 2D layer of the reanimation (Canvas 2D): panels, chat bubbles and keyboards, the chorus ring
// backgrounds and lyric cards, subtitles, the call screen, the drawn props (rays, eye, dots box,
// pixel heart, code screen, cracked wall, stars) and the credits.
import { BG, PANEL, PANEL_HI, INK, YELLOW, REI, CC, WHO, rgba } from "./palette.js";
import { clamp, lerp, easeOut, easeInOut, hash1, hash2, frac, TAU } from "../util.js";

export const W = 1280, H = 720;
export const JP = '"Noto Sans JP", "IPAGothic", sans-serif';
export const ROUND = '"M PLUS Rounded 1c", "Noto Sans JP", sans-serif';

export async function loadFonts(text) {
  const specs = [`500 20px ${JP}`, `700 20px ${JP}`, `900 20px ${JP}`, `500 20px ${ROUND}`, `700 20px ${ROUND}`, `800 20px ${ROUND}`];
  await Promise.all(specs.map((f) => document.fonts.load(f, text).catch(() => null)));
  await document.fonts.ready;
}

export function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function fitSize(g, text, weight, size, family, maxW) {
  g.font = `${weight} ${size}px ${family}`;
  const w = g.measureText(text).width;
  return w > maxW ? Math.floor((size * maxW) / w) : size;
}
const pop = (t, at, d = 0.12) => (t < at ? 0 : easeOut((t - at) / d));

// ---------- panels ----------
export function panel(g, x0, x1, color = PANEL) { g.fillStyle = color; g.fillRect(Math.round(x0), 0, Math.round(x1 - x0), H); }

// chat log + keyboard (verse 1). side "right": sender (Corrupt-Chan), "left": receiver (Rei)
export function chatPanel(g, x0, x1, who, bubbles, t, side) {
  const P = WHO[who], w = x1 - x0;
  panel(g, x0, x1);
  const shown = bubbles.filter((b) => t >= b[0]);
  const step = 54, baseY = 386;
  g.save(); g.beginPath(); g.rect(x0, 0, w, 404); g.clip();
  g.font = `500 22px ${JP}`; g.textBaseline = "middle";
  shown.forEach((b, i) => {
    const k = shown.length - 1 - i; // 0 = newest, at the bottom
    const s = 0.6 + 0.4 * pop(t, b[0], 0.14);
    const tw = g.measureText(b[1]).width, bw = tw + 30, bh = 40;
    const y = baseY - k * step - bh / 2 - (1 - pop(t, b[0], 0.18)) * -14;
    const bx = side === "right" ? x1 - 12 - bw : x0 + 12;
    g.save(); g.translate(bx + bw / 2, y + bh / 2); g.scale(s, s); g.translate(-(bx + bw / 2), -(y + bh / 2));
    g.fillStyle = P.keys; rr(g, bx, y, bw, bh, 20); g.fill();
    g.fillStyle = "#fff"; g.textAlign = "left"; g.fillText(b[1], bx + 15, y + bh / 2 + 1);
    // the little read tick beside each bubble
    g.fillStyle = P.light; g.beginPath();
    const tx = side === "right" ? bx - 12 : bx + bw + 10, ty = y + bh - 4, dir = side === "right" ? -1 : 1;
    g.moveTo(tx, ty - 4); g.lineTo(tx + dir * 7, ty); g.lineTo(tx, ty + 4); g.closePath(); g.fill();
    g.restore();
  });
  g.restore();
  keyboard(g, x0, x1, 404, P);
}
export function keyboard(g, x0, x1, y0, P) {
  const w = x1 - x0;
  g.fillStyle = "#141033"; g.fillRect(x0, y0, w, H - y0);
  g.fillStyle = P.keys; g.fillRect(x0, y0, w, 56);
  g.fillStyle = rgba("#000000", 0.25); rr(g, x0 + 8, y0 + 8, 40, 40, 6); g.fill();
  g.strokeStyle = "#fff"; g.lineWidth = 4; g.beginPath(); g.moveTo(x0 + 28, y0 + 17); g.lineTo(x0 + 28, y0 + 39); g.moveTo(x0 + 17, y0 + 28); g.lineTo(x0 + 39, y0 + 28); g.stroke();
  const m = 10, gap = 8, kw = (w - 2 * m - 9 * gap) / 10, kh = 46;
  const rowY = (r) => y0 + 72 + r * (kh + 12);
  const key = (x, y, ww, dark) => { g.fillStyle = dark ? rgba(P.keys, 0.45) : P.keys; rr(g, x, y, ww, kh, 6); g.fill(); };
  for (let i = 0; i < 10; i++) key(x0 + m + i * (kw + gap), rowY(0), kw);
  for (let i = 0; i < 9; i++) key(x0 + m + kw / 2 + gap / 2 + i * (kw + gap), rowY(1), kw);
  key(x0 + m, rowY(2), kw * 1.3, true);
  for (let i = 0; i < 7; i++) key(x0 + m + kw * 1.3 + gap + i * (kw + gap) + kw * 0.15, rowY(2), kw);
  key(x1 - m - kw * 1.3, rowY(2), kw * 1.3, true);
  g.fillStyle = "#fff"; g.beginPath(); const sx = x0 + m + kw * 0.65, sy = rowY(2) + kh / 2; g.moveTo(sx, sy - 9); g.lineTo(sx + 9, sy + 1); g.lineTo(sx - 9, sy + 1); g.closePath(); g.fill(); g.fillRect(sx - 4, sy, 8, 7);
  key(x0 + m, rowY(3), kw, true); key(x0 + m + kw + gap, rowY(3), kw, true);
  key(x0 + m + 2 * (kw + gap), rowY(3), kw * 5.3, false);
  key(x1 - m - kw * 2.3, rowY(3), kw * 2.3, true);
}

// ---------- chorus character panel: rhythm-game ring ----------
export function ringPanel(g, x0, x1, who, t, beat, o = {}) {
  const P = WHO[who], w = x1 - x0, cx = (x0 + x1) / 2, cy = H * 0.47;
  g.save(); g.beginPath(); g.rect(x0, 0, w, H); g.clip();
  g.fillStyle = o.bg || P.main; g.fillRect(x0, 0, w, H);
  const r1 = w * 0.36, r2 = w * 1.25, n = 8;
  const rot = -Math.PI / 2 + (o.spin || 0);
  // highlighted sectors step round on the beat
  const hi = Math.floor(beat) % n, hl = o.special ? YELLOW : (o.hiCol || P.light);
  for (const [k, a] of [[hi, o.special ? 0.95 : 0.6], [(hi + 1) % n, o.special ? 0.95 : 0.45], [(hi + 5) % n, 0.3]]) {
    const a0 = rot + (k * TAU) / n, a1 = a0 + TAU / n;
    g.fillStyle = rgba(hl, a); g.beginPath(); g.arc(cx, cy, r2, a0, a1); g.arc(cx, cy, r1, a1, a0, true); g.closePath(); g.fill();
  }
  if (o.grid) { // chorus 3: a wall of windows behind her
    g.fillStyle = rgba(P.deep, 0.45);
    for (let gx = x0 + 12; gx < x1; gx += 46) for (let gy = 14; gy < H; gy += 58) g.fillRect(gx, gy, 32, 42);
  }
  g.strokeStyle = rgba(P.pale, 0.35); g.lineWidth = 2;
  for (let k = 0; k < n; k++) { const a = rot + (k * TAU) / n; g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke(); }
  for (const r of [r1, r1 * 1.85]) { g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke(); }
  // sparkles (choruses 2 and 3)
  if (o.sparkle) {
    for (let i = 0; i < 26; i++) {
      const px = x0 + hash1(i * 3.1) * w, py = frac(hash1(i * 7.7) - t * (0.05 + hash1(i) * 0.08)) * H, s = 2 + hash1(i * 5.3) * 4;
      g.fillStyle = rgba(o.special ? YELLOW : P.pale, 0.55 + 0.45 * Math.sin(t * 6 + i));
      g.fillRect(px - s / 2, py - s / 2, s, s);
    }
  }
  g.restore();
}
export function ringOverlay(g, x0, x1, who, prog, inner) {
  const P = WHO[who];
  g.font = `600 13px ${JP}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = rgba(P.pale, 0.75);
  g.fillText("-PERFECT-", (x0 + x1) / 2, H - 38);
  const bx = inner === "right" ? x1 - 16 : x0 + 16, ya = H * 0.16, yb = H * 0.88;
  g.strokeStyle = rgba(P.pale, 0.7); g.lineWidth = 2; g.beginPath(); g.moveTo(bx, ya); g.lineTo(bx, yb); g.stroke();
  const my = lerp(ya, yb, clamp(prog)), d = inner === "right" ? -1 : 1;
  g.fillStyle = "#fff"; g.beginPath(); g.moveTo(bx + d * 2, my - 7); g.lineTo(bx + d * 12, my); g.lineTo(bx + d * 2, my + 7); g.closePath(); g.fill();
}

// the spinning "listening" pie above the lyrics
export function pieIcon(g, cx, cy, r, beat, col, eyes) {
  g.save(); g.translate(cx, cy);
  if (eyes) { // ▶◀ "squint" icon of the glow cards
    g.fillStyle = "#fff"; g.shadowColor = "#fff"; g.shadowBlur = 10;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 22, -9); g.lineTo(s * 6, 0); g.lineTo(s * 22, 9); g.closePath(); g.fill(); }
    g.restore(); return;
  }
  g.fillStyle = rgba("#ffffff", 0.08); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  const n = 8, on = [0, 3, 5].map((k) => (k + Math.floor(beat)) % n);
  for (let k = 0; k < n; k++) {
    const a0 = -Math.PI / 2 + (k * TAU) / n + 0.06, a1 = a0 + TAU / n - 0.12;
    g.fillStyle = on.includes(k) ? col : rgba("#ffffff", 0.07);
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, a0, a1); g.closePath(); g.fill();
  }
  g.restore();
}

const SIZE = { c: 44, w: 62, W: 104, s: 30, sc: 30, L: 70, x: 40 };
const WEIGHT = { c: 900, w: 900, W: 900, s: 800, sc: 800, L: 900, x: 900 };
// lyric card: lines appear on cue; dim = faded (chorus 3), glow = bloom + blur-in (glow cards)
export function lyricCard(g, x0, x1, who, lines, t, o = {}) {
  const P = WHO[who], w = x1 - x0, cx = (x0 + x1) / 2, maxW = w - 36;
  let y = o.top || 230, lastX = null, lastY = 0, lastSize = 0;
  g.textAlign = "center"; g.textBaseline = "middle";
  for (const [t0, text, kind, t2] of lines) {
    let s = SIZE[kind];
    const a = pop(t, t0, 0.1);
    if (kind === "x") { // the loop line running down the panel
      if (a <= 0) continue;
      g.font = `${WEIGHT.x} ${lastSize}px ${JP}`;
      lastY += lastSize * 0.92;
      drawText(g, text, lastX, lastY, "#fff", a, o);
      continue;
    }
    s = fitSize(g, text, WEIGHT[kind], s, JP, maxW);
    y += s * 0.55;
    if (a > 0) {
      let shown = text;
      if (t2 !== undefined && t < t2) shown = text.split(" ")[0];
      g.font = `${WEIGHT[kind]} ${s}px ${JP}`;
      const col = kind === "c" || kind === "sc" || kind === "L" ? (kind === "L" ? (who === "rei" ? REI.main : CC.magenta) : P.text) : "#ffffff";
      const sc = 1 + 0.18 * (1 - a);
      g.save(); g.translate(cx, y); g.scale(sc, sc);
      // full-line width so a line that grows ("絶えぬ 無限の") does not jump sideways
      const fullW = g.measureText(text).width, partW = g.measureText(shown).width;
      drawText(g, shown, -fullW / 2 + partW / 2, 0, col, a, o);
      g.restore();
      if (text.includes(" ")) { lastX = cx + fullW / 2 - g.measureText(text.split(" ").pop()).width / 2; lastY = y; lastSize = s; }
    }
    y += s * 0.55 + 4;
  }
}
function drawText(g, s, x, y, col, a, o) {
  g.globalAlpha = a * (o.dim ? 0.42 : 1);
  if (o.dim) col = col === "#ffffff" ? "#cfc8ef" : "#a49ccc";
  if (o.glow) { g.shadowColor = col; g.shadowBlur = 18; }
  g.fillStyle = col; g.fillText(s, x, y);
  if (o.glow) { g.shadowBlur = 36; g.globalAlpha *= 0.5; g.fillText(s, x, y); }
  g.shadowBlur = 0; g.globalAlpha = 1;
}

// signal between the panels; amp 0..1 from the singer's loudness
export function waveform(g, xa, xb, y, amp, col, t) {
  g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
  for (let x = xa; x <= xb; x += 2) {
    const k = (x - xa) / Math.max(1, xb - xa), env = Math.sin(Math.PI * k);
    const v = (Math.sin(x * 0.55 + t * 40) * 0.6 + Math.sin(x * 1.3 - t * 23) * 0.4) * amp * 22 * env;
    x === xa ? g.moveTo(x, y + v) : g.lineTo(x, y + v);
  }
  g.stroke();
}

// ---------- verse backgrounds ----------
export function verseBg(g, x0, x1, who, t, bar, local) {
  const P = WHO[who], w = x1 - x0, cx = (x0 + x1) / 2;
  g.save(); g.beginPath(); g.rect(x0, 0, w, H); g.clip();
  g.fillStyle = P.night; g.fillRect(x0, 0, w, H);
  const k = bar % 5;
  if (who === "cc") {
    if (k === 0) { // a huge magenta moon behind her head
      g.fillStyle = P.text; g.beginPath(); g.arc(cx, 150, 150, 0, TAU); g.fill();
      g.fillStyle = P.night; g.fillRect(x0, 210, w, 26); g.fillRect(x0, 252, w, 12);
    } else if (k === 1) { // gears
      for (const [gx, gy, r, sp] of [[x0 + 90, 120, 90, 1], [x1 - 70, 210, 70, -1.4], [cx + 20, 40, 55, 1.8]]) gear(g, gx, gy, r, local * sp, P.text, P.night);
    } else if (k === 2) { // missing-texture blocks
      for (let i = 0; i < 9; i++) {
        const bx = x0 + hash1(i * 4.1) * w, by = 40 + hash1(i * 2.3) * 300, s = 30 + hash1(i * 9.7) * 50;
        checker(g, bx, by + Math.sin(local * 3 + i) * 6, s, s, 8);
      }
    } else if (k === 3) { // glitch stripes
      for (let i = 0; i < 14; i++) { g.fillStyle = [P.main, P.text, P.deep, P.light][i % 4]; g.fillRect(x0 + ((i * 37 + Math.floor(local * 8) * 23) % w), 0, 10 + (i % 3) * 12, H * 0.6); }
    } else { // antenna crown
      g.strokeStyle = P.text; g.lineWidth = 6;
      for (let i = 0; i < 9; i++) { const a = Math.PI * (0.15 + 0.7 * (i / 8)); g.beginPath(); g.moveTo(cx, 330); g.lineTo(cx - Math.cos(a) * 320, 330 - Math.sin(a) * 320); g.stroke(); }
      g.fillStyle = P.text; g.beginPath(); g.arc(cx, 330, 40, 0, TAU); g.fill();
    }
  } else {
    // night sky: stars, a crescent moon, clouds, a signal tower
    for (let i = 0; i < 40; i++) { g.fillStyle = rgba(P.pale, 0.3 + 0.5 * hash1(i * 1.7)); g.fillRect(x0 + hash1(i * 3.3) * w, hash1(i * 5.9) * 420, 2, 2); }
    if (k === 0 || k === 3) { g.fillStyle = P.light; g.beginPath(); g.arc(x0 + 110, 110, 46, 0, TAU); g.fill(); g.fillStyle = P.night; g.beginPath(); g.arc(x0 + 128, 98, 42, 0, TAU); g.fill(); }
    if (k === 1) { g.fillStyle = rgba(P.pale, 0.9); for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(x0 + i * 100 - 20 + (local * 20) % 100, 150 + (i % 2) * 20, 60, 0, TAU); g.fill(); } g.fillRect(x0, 150, w, 80); }
    if (k === 2) {
      g.fillStyle = P.light; g.fillRect(cx - 14, 40, 28, 300);
      for (let i = 0; i < 4; i++) { g.fillRect(cx - 90 + i * 12, 80 + i * 60, 180 - i * 24, 10); }
      g.strokeStyle = P.light; g.lineWidth = 4;
      for (let r = 40; r < 200; r += 50) { const a = (local * 2) % 1; g.globalAlpha = 1 - a; g.beginPath(); g.arc(cx, 40, r + a * 50, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
      g.globalAlpha = 1;
    }
    if (k === 3) for (let i = 0; i < 3; i++) { const p = frac(local * 0.7 + i * 0.33); g.strokeStyle = rgba(P.pale, 1 - p); g.lineWidth = 2; g.beginPath(); g.moveTo(x1 - p * w, 40 + i * 60 + p * 120); g.lineTo(x1 - p * w + 50, 40 + i * 60 + p * 120 - 14); g.stroke(); }
  }
  g.restore();
}
export function verseFloor(g, x0, x1, who) {
  const P = WHO[who];
  g.fillStyle = P.floor; g.fillRect(x0, H * 0.82, x1 - x0, H * 0.18);
  g.fillStyle = who === "cc" ? P.text : P.main; g.fillRect(x0, H * 0.82, x1 - x0, 6);
}
function gear(g, x, y, r, a, col, hole) {
  g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.beginPath();
  const n = 10;
  for (let i = 0; i < n * 2; i++) { const rr_ = i % 2 ? r : r * 0.8, aa = (i / (n * 2)) * TAU; g.lineTo(Math.cos(aa) * rr_, Math.sin(aa) * rr_); }
  g.closePath(); g.fill(); g.fillStyle = hole; g.beginPath(); g.arc(0, 0, r * 0.35, 0, TAU); g.fill(); g.restore();
}
export function checker(g, x, y, w, h, s = 6) {
  for (let i = 0; i < w / s; i++) for (let j = 0; j < h / s; j++) { g.fillStyle = (i + j) % 2 ? "#ff00dc" : "#000"; g.fillRect(x + i * s, y + j * s, s, s); }
}

// ---------- small screens ----------
export function subtitle(g, text, cx, y, a = 1) {
  if (!text || a <= 0) return;
  g.save(); g.globalAlpha = a; g.font = `800 30px ${ROUND}`; g.textAlign = "center"; g.textBaseline = "middle";
  g.lineJoin = "round"; g.lineWidth = 7; g.strokeStyle = "rgba(10,8,30,0.85)"; g.strokeText(text, cx, y);
  g.shadowColor = "rgba(190,220,255,0.9)"; g.shadowBlur = 10; g.fillStyle = "#eef0ff"; g.fillText(text, cx, y);
  g.restore();
}
export function title(g, sh, t) {
  const [tr, ruby] = sh.ruby, [tt, text] = sh.text;
  g.textAlign = "left"; g.textBaseline = "middle";
  g.font = `900 40px ${JP}`;
  const full = g.measureText(text).width, x = 640 - full / 2;
  const n = Math.floor(clamp((t - tt) / 0.07, 0, text.length));
  g.fillStyle = "#fff"; g.fillText(text.slice(0, n), x, 372);
  const ra = pop(t, tr, 0.15);
  if (ra > 0) { g.globalAlpha = ra; g.font = `800 18px ${JP}`; g.fillStyle = REI.light; g.textAlign = "center"; g.fillText(ruby, x + 20, 336); g.globalAlpha = 1; }
}
export function readyScreen(g, t, local) {
  const a = clamp(local / 0.12);
  g.globalAlpha = a;
  const cx = 700, cy = 372;
  g.strokeStyle = rgba(REI.pale, 0.8); g.lineWidth = 6; g.setLineDash([16, 12]); g.lineDashOffset = -local * 60;
  g.beginPath(); g.arc(cx, cy, 64, 0, TAU); g.stroke(); g.setLineDash([]);
  g.font = `700 16px ${JP}`; g.fillStyle = rgba(REI.pale, 0.8); g.textAlign = "center"; g.fillText("Ready!", cx, cy - 92);
  phoneGlyph(g, 560, cy + 6, 1, REI.light);
  g.globalAlpha = 1;
}
export function phoneGlyph(g, x, y, s, col) {
  g.save(); g.translate(x, y); g.scale(s, s); g.rotate(-0.6);
  g.strokeStyle = col; g.lineWidth = 9; g.lineCap = "round"; g.shadowColor = col; g.shadowBlur = 14;
  g.beginPath(); g.arc(0, 0, 26, Math.PI * 0.7, Math.PI * 1.3, false); g.stroke();
  g.lineWidth = 14; g.beginPath(); g.moveTo(-22, -22); g.lineTo(-14, -26); g.moveTo(-22, 22); g.lineTo(-14, 26); g.stroke();
  g.restore();
}
export function linkLine(g, k, to) {
  const col = WHO[to].text, x = lerp(-20, W + 20, easeInOut(k));
  g.strokeStyle = rgba("#cfc8ef", 0.45); g.lineWidth = 2; g.setLineDash([2, 7]);
  g.beginPath(); g.moveTo(0, 360); g.lineTo(x, 360); g.stroke(); g.setLineDash([]);
  g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 12; g.beginPath(); g.arc(x, 360, 4, 0, TAU); g.fill(); g.shadowBlur = 0;
}
// "< Hello?": a message on its own, a blue gradient down the left edge (matches the original)
export function helloScreen(g) {
  const grd = g.createLinearGradient(0, 0, 440, 0);
  grd.addColorStop(0, "#202462"); grd.addColorStop(0.45, "#1b1c56"); grd.addColorStop(1, "rgba(9,4,35,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 440, H);
  g.textAlign = "left"; g.textBaseline = "middle"; g.fillStyle = "#9db6ff";
  g.font = `400 34px ${JP}`; g.fillText("<", 34, 360);
  g.font = `400 46px ${JP}`; g.fillText("Hello?", 72, 362);
}

// ---------- drawn props ----------
export function monitorFrame(g, x0, x1, col = "#1b1826") {
  g.fillStyle = col; g.fillRect(x0, 0, x1 - x0, H);
  const grd = g.createRadialGradient((x0 + x1) / 2, H / 2, 100, (x0 + x1) / 2, H / 2, 560);
  grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = grd; g.fillRect(x0, 0, x1 - x0, H);
}
export function stageFloor(g, x0, x1, col) {
  g.fillStyle = col; g.beginPath(); g.moveTo(x0 + 40, H); g.lineTo(x0 + 120, H * 0.82); g.lineTo(x1 - 120, H * 0.82); g.lineTo(x1 - 40, H); g.closePath(); g.fill();
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (const s of [0, 1]) { const xa = s ? x1 - 150 : x0 + 30; g.beginPath(); g.moveTo(xa, H); g.lineTo(xa + 60, H * 0.84); g.lineTo(xa + 90, H * 0.84); g.lineTo(xa + 30, H); g.fill(); }
}
export function dotsBox(g, cx, cy, local, drip) {
  const w = 360, h = 150;
  g.save(); g.shadowColor = "rgba(220,230,255,0.8)"; g.shadowBlur = 16; g.fillStyle = "#e9e7f2";
  g.beginPath();
  const pts = 28;
  for (let i = 0; i <= pts; i++) { const k = i / pts; g.lineTo(cx - w / 2 + k * w, cy - h / 2 + (hash2(i, Math.floor(local * 8)) - 0.5) * 6); }
  for (let i = 0; i <= pts; i++) { const k = i / pts; g.lineTo(cx + w / 2 - k * w, cy + h / 2 + (hash2(i + 50, Math.floor(local * 8)) - 0.5) * 6); }
  g.closePath(); g.fill(); g.restore();
  g.fillStyle = "#2a2338";
  [-1, 0, 1].forEach((k, i) => { const bounce = Math.max(0, Math.sin(local * 7 - i * 0.9)) * (drip ? 0 : 6); g.beginPath(); g.arc(cx + k * 82, cy - bounce, 11, 0, TAU); g.fill(); });
  if (drip) {
    const len = clamp(local / 2.4) * (H - cy - 30);
    g.fillStyle = "#e0222f"; g.fillRect(cx + 82 - 4, cy, 8, len);
    g.beginPath(); g.arc(cx + 82, cy + len, 7, 0, TAU); g.fill();
    g.beginPath(); g.arc(cx + 82, cy, 12, 0, TAU); g.fill();
  }
}
export function rays(g, x0, x1, local) {
  const cx = (x0 + x1) / 2, cy = H * 0.46, n = 12;
  g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, H); g.clip();
  for (let k = 0; k < n; k++) {
    const a0 = local * 0.25 + (k * TAU) / n, a1 = a0 + TAU / n;
    g.fillStyle = k % 2 ? "#cfc8ec" : CC.text;
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 900, a0, a1); g.closePath(); g.fill();
  }
  const grd = g.createRadialGradient(cx, cy, 30, cx, cy, 220);
  grd.addColorStop(0, "#120a2e"); grd.addColorStop(0.55, "rgba(18,10,46,0.95)"); grd.addColorStop(1, "rgba(18,10,46,0)");
  g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, 220, 0, TAU); g.fill();
  // the eye
  const open = 0.75 + 0.25 * Math.sin(local * 3), col = REI.light;
  g.strokeStyle = col; g.lineWidth = 4; g.shadowColor = col; g.shadowBlur = 10;
  g.beginPath(); g.ellipse(cx, cy, 70, 40 * open, 0, 0, TAU); g.stroke();
  g.beginPath(); g.arc(cx, cy, 24 * open + 4, 0, TAU); g.stroke();
  g.fillStyle = "#ff3a5a"; g.beginPath(); g.arc(cx, cy, 5, 0, TAU); g.fill();
  for (let i = 0; i < 4; i++) { const xx = cx - 45 + i * 30; g.beginPath(); g.moveTo(xx, cy + 40 * open + 4); g.lineTo(xx - 4, cy + 40 * open + 16); g.stroke(); }
  g.beginPath(); g.arc(cx + 6, cy - 6, 88, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
  g.restore();
}
export function colorEye(g, cx, cy, local) {
  const w = 300, h = 150;
  g.save(); g.fillStyle = "#e8e6ee"; g.shadowColor = "rgba(255,255,255,0.6)"; g.shadowBlur = 20;
  g.beginPath(); g.moveTo(cx - w, cy); g.quadraticCurveTo(cx, cy - h * 1.6, cx + w, cy); g.quadraticCurveTo(cx, cy + h * 1.6, cx - w, cy); g.fill(); g.restore();
  g.save(); g.beginPath(); g.moveTo(cx - w, cy); g.quadraticCurveTo(cx, cy - h * 1.6, cx + w, cy); g.quadraticCurveTo(cx, cy + h * 1.6, cx - w, cy); g.clip();
  const cols = ["#e8202a", "#f5d21e", "#3bc43b", "#2ab8d8", "#2f3bd8", "#c42ad8"];
  cols.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 128, local * 0.8 + (i * TAU) / 6, local * 0.8 + ((i + 1) * TAU) / 6); g.closePath(); g.fill(); });
  g.fillStyle = "#111"; g.beginPath(); g.arc(cx, cy, 40, 0, TAU); g.fill();
  g.fillStyle = "#fff"; g.beginPath(); g.arc(cx + 14, cy - 14, 9, 0, TAU); g.fill();
  g.restore();
}
export function pixelHeart(g, x0, x1, who, local) {
  const P = WHO[who], cx = (x0 + x1) / 2, cy = H / 2, s = 22;
  g.fillStyle = P.main; g.fillRect(x0, 0, x1 - x0, H);
  const rows = ["01100000110", "11110001111", "11111111111", "11111111111", "01111111110", "00111111100", "00011111000", "00001110000", "00000100000"];
  const crack = [5, 6, 5, 4, 5, 6, 5, 5, 5];
  const sep = easeOut(clamp((local - 0.1) / 0.35)) * 26;
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < 11; c++) {
    if (rows[r][c] !== "1") continue;
    const left = c < crack[r];
    g.fillStyle = P.pale;
    g.fillRect(cx + (c - 5.5) * s + (left ? -sep : sep), cy + (r - 4.5) * s + (left ? sep * 0.3 : -sep * 0.2), s - 1, s - 1);
  }
}
export function codeScreen(g, local) {
  g.fillStyle = "#050308"; g.fillRect(0, 0, W, H);
  const glyphs = "アイウエオカキクケコサシスセソ01#%&$@<>[]{}信号返事無限通信受信送信ERRORNULL";
  g.font = `500 15px ${JP}`; g.textBaseline = "middle"; g.textAlign = "left";
  const f = Math.floor(local * 12);
  for (let r = 0; r < 18; r++) {
    const y = 250 + r * 18, n = 18 + Math.floor(hash1(r * 7.1) * 30);
    if (hash2(r, f) < 0.08) continue;
    let s = "";
    for (let i = 0; i < n; i++) s += glyphs[Math.floor(hash2(r * 31 + i, f >> 1) * glyphs.length)];
    const shift = hash2(r, f) > 0.85 ? (hash2(r + 3, f) - 0.5) * 60 : 0;
    g.fillStyle = `rgba(230,228,240,${0.55 + 0.4 * hash2(r, 3)})`;
    g.fillText(s, 400 + shift, y);
  }
}
export function heartGlitch(g, local) {
  g.fillStyle = "#3a1c8c"; g.fillRect(0, 0, W, H);
  const f = Math.floor(local * 15);
  for (let i = 0; i < 12; i++) { g.fillStyle = rgba(hash2(i, f) > 0.5 ? "#5a2ad8" : "#24106a", 0.8); g.fillRect(0, hash2(i + 9, f) * H, W, 6 + hash2(i, 2) * 30); }
  g.font = `900 30px ${JP}`; g.textAlign = "center"; g.fillStyle = CC.magenta; g.fillText("返信", 240 + (hash2(1, f) - 0.5) * 30, 240);
  g.fillStyle = "#e6dcff";
  for (let i = 0; i < 4; i++) { g.font = `700 ${20 + i * 2}px ${JP}`; g.fillText("ｴﾗｰ 送信失敗 ｴﾗｰ".slice(i, 12 + i), 260 + (hash2(i, f) - 0.5) * 40, 290 + i * 28); }
  const s = 18, rows = ["01100110", "11111111", "11111111", "01111110", "00111100", "00011000"];
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < 8; c++) if (rows[r][c] === "1") { g.fillStyle = "#1a0a4a"; g.fillRect(860 + c * s + (c < 4 ? -8 : 8), 260 + r * s, s - 1, s - 1); }
}
export function crackedWall(g, x0, x1, local, pink) {
  g.fillStyle = pink ? "#d8b8d8" : "#b4b0bc"; g.fillRect(x0, 0, x1 - x0, H);
  g.strokeStyle = "rgba(40,30,50,0.6)"; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    let x = x0 + hash1(i * 3.7) * (x1 - x0), y = hash1(i * 1.3) * H;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (hash2(i, j) - 0.5) * 90; y += (hash2(j, i) - 0.3) * 70; g.lineTo(x, y); }
    g.stroke();
  }
}
export function starfield(g, x0, x1, local, speed) {
  g.fillStyle = "#16103a"; g.fillRect(x0, 0, x1 - x0, H);
  const cx = (x0 + x1) / 2, cy = H / 2;
  for (let i = 0; i < 260; i++) {
    const a = hash1(i * 1.1) * TAU, z = frac(hash1(i * 7.3) + local * speed * (0.15 + hash1(i) * 0.1));
    const r = 20 + z * z * 700, r2 = r * (1 - 0.06 * speed * z);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75;
    if (x < x0 || x > x1) continue;
    g.strokeStyle = rgba(i % 3 ? "#e6dcff" : CC.light, 0.3 + z * 0.7); g.lineWidth = 1 + z * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.75); g.stroke();
  }
}
export function staticNoise(g, x0, x1, local) {
  const f = Math.floor(local * 24);
  for (let y = 0; y < H; y += 4) {
    const v = hash2(y, f);
    g.fillStyle = v > 0.92 ? (hash2(y, f + 1) > 0.5 ? CC.text : REI.main) : `rgba(${(v * 255) | 0},${(v * 235) | 0},${(v * 255) | 0},1)`;
    g.fillRect(x0 + (hash2(y + 1, f) - 0.5) * 30, y, x1 - x0, 4);
  }
}

// ---------- credits ----------
export function creditText(g, sh, local, side) {
  const P = WHO[sh.who], a = clamp(local / 0.25) * clamp((sh.t1 - sh.t0 - local) / 0.2);
  g.globalAlpha = a;
  const x = side === "right" ? 1010 : 270, align = side === "right" ? "left" : "right";
  g.textAlign = align; g.textBaseline = "middle";
  let y = 360 - (sh.roles.length * 26 + 60) / 2;
  g.font = `800 22px ${JP}`; g.fillStyle = P.text;
  for (const r of sh.roles) { g.fillText(r, x, y); y += 26; }
  if (sh.sub) { g.fillText(sh.sub, x, y + 52); }
  y += 20; g.font = `900 24px ${JP}`; g.fillStyle = "#fff"; g.fillText(sh.name, x, y);
  if (sh.extra) { g.font = `700 16px ${JP}`; g.fillStyle = rgba(P.pale, 0.85); sh.extra.forEach((e, i) => g.fillText(e, x, y + (sh.sub ? 100 : 50) + i * 22)); }
  g.globalAlpha = 1;
}
export function endLogo(g, local) {
  const a = clamp((local - 0.2) / 0.3) * clamp((2.4 - local) / 0.4);
  if (a <= 0) return;
  g.globalAlpha = a; g.font = `900 20px ${JP}`; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = REI.text; g.fillText("次元", 640, 350);
  g.fillStyle = CC.text; g.fillText("通信", 640, 372);
  g.globalAlpha = 1;
}
export { BG, PANEL, PANEL_HI, INK, rgba };

// ---------- verse motifs: flash up behind the silhouette on the lyric ----------
export function motif(g, kind, x0, x1, who, local) {
  const P = WHO[who], w = x1 - x0, cx = (x0 + x1) / 2;
  const col = who === "cc" ? P.text : P.light;
  g.save(); g.beginPath(); g.rect(x0, 0, w, H); g.clip();
  if (kind === "sun") {
    const sx = cx + 10, sy = 150;
    g.fillStyle = "#ffc23a"; g.beginPath(); g.arc(sx, sy, 62, 0, TAU); g.fill();
    g.strokeStyle = "#ffc23a"; g.lineCap = "round";
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU, r0 = 82 + (i % 3) * 10, r1 = r0 + 30 + (i % 2) * 34;
      g.lineWidth = i % 2 ? 4 : 6; g.beginPath(); g.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0); g.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1); g.stroke();
    }
    for (let i = 0; i < 26; i++) { const a = hash1(i) * TAU, r = 170 + hash1(i * 3) * 90; g.fillStyle = "#ffc23a"; g.fillRect(sx + Math.cos(a) * r, sy + Math.sin(a) * r, 4, 4); }
  } else if (kind === "moon") {
    g.fillStyle = P.light; g.beginPath(); g.arc(cx - 40, 110, 46, 0, TAU); g.fill();
    g.fillStyle = P.night; g.beginPath(); g.arc(cx - 18, 94, 44, 0, TAU); g.fill();
  } else if (kind === "clouds") {
    g.fillStyle = P.light;
    for (let i = 0; i < 9; i++) { const yy = 30 + (i % 3) * 52 + hash1(i) * 20, xx = x0 - 40 + hash1(i * 7) * (w + 40), ww = 120 + hash1(i * 5) * 200; rr(g, xx, yy, ww, 22 + hash1(i * 9) * 26, 14); g.fill(); }
    for (let i = 0; i < 14; i++) { g.fillRect(x0 + hash1(i * 11) * w, 200 + hash1(i * 13) * 40, 40 + hash1(i) * 120, 4); }
  } else if (kind === "gears") {
    for (const [gx, gy, r, sp] of [[x0 + 60, 120, 120, 1], [x1 - 40, 70, 90, -1.3], [cx + 30, 300, 80, 1.6], [x0 + 30, 400, 70, -1.1], [x1 - 60, 380, 110, 0.9], [cx - 60, 30, 60, -2]]) {
      g.save(); g.translate(gx, gy); g.rotate(local * sp); g.strokeStyle = col; g.lineWidth = 7; g.beginPath();
      const n = 14;
      for (let i = 0; i <= n * 2; i++) { const rr_ = i % 2 ? r : r * 0.86, aa = (i / (n * 2)) * TAU; g.lineTo(Math.cos(aa) * rr_, Math.sin(aa) * rr_); }
      g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.32, 0, TAU); g.stroke();
      for (let k = 0; k < 6; k++) { const aa = (k / 6) * TAU; g.beginPath(); g.moveTo(Math.cos(aa) * r * 0.32, Math.sin(aa) * r * 0.32); g.lineTo(Math.cos(aa) * r * 0.82, Math.sin(aa) * r * 0.82); g.stroke(); }
      g.restore();
    }
    g.fillStyle = col; for (let i = 0; i < 30; i++) g.fillRect(x0 + hash1(i * 2.3) * w, hash1(i * 4.1) * 480, 6 + hash1(i) * 14, 3 + hash1(i * 7) * 8);
  } else if (kind === "spikes") {
    g.fillStyle = col;
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 1.05 + (i / 15) * Math.PI * 1.9, r0 = 150, r1 = 330 + hash1(i) * 120, ox = cx, oy = 330;
      const p0 = [ox + Math.cos(a) * r0, oy + Math.sin(a) * r0], p1 = [ox + Math.cos(a) * r1, oy + Math.sin(a) * r1];
      const nx = -Math.sin(a) * 9, ny = Math.cos(a) * 9;
      g.beginPath(); g.moveTo(p0[0] - nx, p0[1] - ny); g.lineTo((p0[0] + p1[0]) / 2 + nx * 2, (p0[1] + p1[1]) / 2 + ny * 2); g.lineTo(p1[0], p1[1]); g.lineTo((p0[0] + p1[0]) / 2 - nx * 0.5, (p0[1] + p1[1]) / 2 - ny * 0.5); g.lineTo(p0[0] + nx, p0[1] + ny); g.closePath(); g.fill();
    }
  } else if (kind === "bars") {
    const shades = who === "cc" ? [P.text, "#c4189f", "#8a1576", "#5a1050", P.main] : [P.main, P.light, "#c4600f", "#7a3a0a", P.pale];
    let xx = x0;
    for (let i = 0; xx < x1; i++) { const ww = 30 + hash1(i * 3.3 + Math.floor(local * 10)) * 60; g.fillStyle = shades[i % shades.length]; g.fillRect(xx, 0, ww, H * 0.55); xx += ww; }
    g.fillStyle = shades[0]; g.fillRect(x0, H * 0.55, 40, 60); g.fillRect(x1 - 70, H * 0.42, 50, 40);
  } else if (kind === "cracks") {
    g.strokeStyle = CC.text; g.lineWidth = 4; g.shadowColor = CC.text; g.shadowBlur = 10;
    const n = 3 + Math.floor(local * 14);
    for (let i = 0; i < n; i++) {
      let x = x0 + 60 + hash1(i * 5.1) * (w - 120), y = 10 + hash1(i * 2.7) * 300;
      g.beginPath(); g.moveTo(x, y);
      for (let j = 0; j < 4; j++) { x += (hash2(i, j) - 0.5) * 70; y += 10 + hash2(j, i) * 50; g.lineTo(x, y); }
      g.stroke();
    }
  }
  g.restore();
}
// little drips running down the dark silhouette (Corrupt-Chan's "anxiety")
export function drips(g, cx, top, local, col) {
  g.strokeStyle = col; g.lineWidth = 3; g.lineCap = "round";
  for (let i = 0; i < 12; i++) {
    const x = cx - 150 + hash1(i * 3.7) * 300, y = top + hash1(i * 1.9) * 150 + Math.min(1, local * 2) * 8;
    g.beginPath(); g.moveTo(x - 5, y); g.quadraticCurveTo(x, y + 14, x + 5, y); g.stroke();
  }
}
// glowing eyes in a dark face
export function glowEyes(g, pts, col, r = 6) {
  for (const [x, y] of pts) {
    g.save(); g.shadowColor = col; g.shadowBlur = 14;
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x, y, r * 0.45, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r * 1.7, 0, TAU); g.stroke();
    g.restore();
  }
}

// tears streaming from the eyes
export function tears(g, pts, len, phase) {
  g.save(); g.strokeStyle = "rgba(190,235,255,0.9)"; g.lineWidth = 5; g.lineCap = "round";
  for (const [x, y] of pts) {
    g.beginPath(); g.moveTo(x, y + 6);
    for (let k = 1; k <= 6; k++) g.lineTo(x + Math.sin(k * 1.3 + phase) * 3, y + 6 + (k / 6) * len);
    g.stroke();
  }
  g.restore();
}
