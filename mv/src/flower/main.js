// Basic MV for the BAKO & Puresu cover of "Flower In A Hurricane": a 2D canvas scene, one function of the frame
// number (so any frame can be rendered on its own). Vice-City sunset over the sea, palms, a hurricane that builds
// through the song, a hibiscus in the wind, and the two singers, who light up and pulse when they actually sing
// (envelopes from the renders, assets/flower/data.json).
const W = 1280, H = 720;
const SECTIONS = [ // t0, storm level, palette
  [0, 0.15, "dusk"], [64.5, 0.75, "sunset"], [97, 0.55, "sunset"], [113, 0.45, "dusk"], [125, 0.6, "storm"],
  [141, 0.45, "dusk"], [148, 1.0, "fire"], [180, 0.7, "storm"], [197, 0.3, "night"], [225, 0.1, "night"],
];
const PALETTES = {
  dusk: { top: [44, 24, 84], mid: [168, 62, 140], low: [255, 140, 110], sun: [255, 196, 120], sea: [30, 22, 70] },
  sunset: { top: [60, 20, 90], mid: [235, 70, 120], low: [255, 170, 80], sun: [255, 220, 120], sea: [44, 24, 80] },
  storm: { top: [16, 24, 48], mid: [52, 70, 120], low: [120, 120, 160], sun: [210, 220, 255], sea: [14, 20, 40] },
  fire: { top: [70, 10, 60], mid: [255, 50, 110], low: [255, 150, 40], sun: [255, 240, 150], sea: [50, 14, 60] },
  night: { top: [8, 8, 26], mid: [30, 20, 70], low: [90, 50, 120], sun: [230, 200, 255], sea: [8, 8, 24] },
};
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => t * t * (3 - 2 * t);
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

function section(t) {
  let i = 0;
  while (i + 1 < SECTIONS.length && SECTIONS[i + 1][0] <= t) i++;
  const [t0, s0, p0] = SECTIONS[i], next = SECTIONS[Math.min(i + 1, SECTIONS.length - 1)];
  const k = ease(clamp((t - t0) / 2.5));                       // 2.5 s blend into each section
  const prev = SECTIONS[Math.max(0, i - 1)];
  const storm = lerp(prev[1], s0, i ? k : 1);
  const pal = {};
  for (const key of Object.keys(PALETTES.dusk)) pal[key] = mix(PALETTES[i ? prev[2] : p0][key], PALETTES[p0][key], i ? k : 1);
  return { storm, pal, idx: i, next };
}

export async function createFlowerMV({ container }) {
  const data = await (await fetch("./assets/flower/data.json")).json();
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  container.appendChild(cv);
  const g = cv.getContext("2d");
  await document.fonts.ready;
  const N = data.frames, fps = data.fps;
  const at = (arr, f) => arr[Math.max(0, Math.min(arr.length - 1, f))] || 0;
  const smooth = (arr, f, k = 3) => { let s = 0; for (let i = -k; i <= k; i++) s += at(arr, f + i); return s / (2 * k + 1); };
  const beatAge = (f) => { for (let i = 0; i < 20; i++) if (at(data.beat, f - i)) return i; return 99; };

  function sky(pal, t) {
    const gr = g.createLinearGradient(0, 0, 0, H * 0.62);
    gr.addColorStop(0, rgb(pal.top)); gr.addColorStop(0.6, rgb(pal.mid)); gr.addColorStop(1, rgb(pal.low));
    g.fillStyle = gr; g.fillRect(0, 0, W, H * 0.62);
  }
  function sun(pal, low, t) {
    const cx = W / 2, cy = H * 0.6, r = 150 + 10 * low;
    g.save();
    g.beginPath(); g.rect(0, 0, W, cy); g.clip();
    const gr = g.createLinearGradient(0, cy - r, 0, cy);
    gr.addColorStop(0, rgb(pal.sun)); gr.addColorStop(1, rgb(mix(pal.sun, pal.mid, 0.6)));
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, r, Math.PI, 0); g.fill();
    g.globalCompositeOperation = "destination-out";               // synthwave stripes
    for (let i = 0; i < 7; i++) { const y = cy - 12 - i * 16 - ((t * 10) % 16); g.fillRect(cx - r, y, 2 * r, 3 + i * 0.6); }
    g.restore();
    g.save(); g.globalCompositeOperation = "lighter";
    const glow = g.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2.4);
    glow.addColorStop(0, rgb(pal.sun, 0.35)); glow.addColorStop(1, rgb(pal.sun, 0));
    g.fillStyle = glow; g.fillRect(0, 0, W, H); g.restore();
  }
  function sea(pal, t, storm) {
    const y0 = H * 0.6;
    const gr = g.createLinearGradient(0, y0, 0, H);
    gr.addColorStop(0, rgb(mix(pal.sea, pal.mid, 0.35))); gr.addColorStop(1, rgb(pal.sea));
    g.fillStyle = gr; g.fillRect(0, y0, W, H - y0);
    for (let i = 0; i < 26; i++) {                                // sun glitter + swell lines
      const y = y0 + 6 + i * i * 0.45;
      const w = (220 - i * 5) * (1 + 0.15 * Math.sin(t * 2 + i));
      g.fillStyle = rgb(pal.sun, clamp(0.5 - i * 0.017));
      g.fillRect(W / 2 - w / 2 + Math.sin(t * 1.7 + i * 1.3) * (8 + 20 * storm), y, w, 2);
    }
  }
  function hurricane(t, storm, pal) {
    const cx = W / 2, cy = H * 0.26, R = 520;
    g.save(); g.translate(cx, cy); g.scale(1, 0.42);
    const spin = t * (0.15 + 0.5 * storm);
    for (let arm = 0; arm < 5; arm++) {
      for (let k = 0; k < 36; k++) {
        const u = k / 36, ang = spin + arm * (Math.PI * 2 / 5) + u * 4.2;
        const rr = 40 + u * R;
        g.strokeStyle = rgb(mix([235, 225, 255], pal.top, u * 0.6), (0.05 + 0.13 * storm) * (1 - u));
        g.lineWidth = 30 * (1 - u) + 6;
        g.beginPath(); g.arc(0, 0, rr, ang, ang + 0.5); g.stroke();
      }
    }
    const eye = g.createRadialGradient(0, 0, 0, 0, 0, 90);
    eye.addColorStop(0, rgb(pal.sun, 0.35 * storm)); eye.addColorStop(1, rgb(pal.sun, 0));
    g.fillStyle = eye; g.beginPath(); g.arc(0, 0, 90, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function palm(x, base, h, wind, flip) {
    g.save(); g.translate(x, base); g.scale(flip, 1);
    g.strokeStyle = "rgba(10,6,24,0.95)"; g.fillStyle = "rgba(10,6,24,0.95)";
    const bend = wind * 60;
    g.lineWidth = 16; g.lineCap = "round";
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(30 + bend * 0.3, -h * 0.5, 50 + bend, -h); g.stroke();
    const tx = 50 + bend, ty = -h;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.95 + i * (Math.PI * 0.95 / 6) + wind * 0.5 + Math.sin(i * 7.3) * 0.08;
      const len = 150 + (i % 2) * 30;
      const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.6 + 40;
      g.lineWidth = 9;
      g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo((tx + ex) / 2, ty - 40 + (i % 3) * 10, ex, ey); g.stroke();
    }
    g.restore();
  }
  function rain(f, storm, wind) {
    const n = Math.floor(30 + 260 * storm);
    g.strokeStyle = `rgba(220,230,255,${0.12 + 0.18 * storm})`; g.lineWidth = 1.5;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const sp = 26 + 20 * hash(i * 3.1);
      const x = (hash(i) * (W + 300) + f * wind * 9) % (W + 300) - 150;
      const y = (hash(i * 7.7) * H + f * sp) % H;
      g.moveTo(x, y); g.lineTo(x - wind * 22, y + 26);
    }
    g.stroke();
  }
  function flower(t, wind, lift) {
    const bx = W / 2, by = H + 10;
    const sway = wind * 0.28 + Math.sin(t * 1.4) * 0.05;
    const hx = bx + Math.sin(sway) * 230, hy = by - Math.cos(sway) * 230 - lift * 6;
    g.strokeStyle = "#1d5c3a"; g.lineWidth = 10; g.lineCap = "round";
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + wind * 30, by - 120, hx, hy); g.stroke();
    g.fillStyle = "#2b8a57";                                       // leaf
    g.beginPath(); g.ellipse(bx + 34 + wind * 12, by - 90, 40, 14, -0.6 + wind * 0.3, 0, Math.PI * 2); g.fill();
    g.save(); g.translate(hx, hy); g.rotate(sway * 1.4);
    for (let i = 0; i < 5; i++) {
      g.save(); g.rotate(i * (Math.PI * 2 / 5) + Math.sin(t * 6 + i) * 0.06 * (0.3 + Math.abs(wind)));
      const pg = g.createRadialGradient(0, 0, 4, 0, -48, 70);
      pg.addColorStop(0, "#7a0030"); pg.addColorStop(0.35, "#e8326e"); pg.addColorStop(1, "#ff8fb2");
      g.fillStyle = pg;
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-46, -24, -40, -84, 0, -82); g.bezierCurveTo(40, -84, 46, -24, 0, 0); g.fill();
      g.restore();
    }
    g.strokeStyle = "#ffd76a"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(18, -46); g.stroke();
    g.fillStyle = "#ffe9a0"; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(16 + i * 2, -44 - i * 3, 3, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  function petals(f, storm, wind) {                                 // petals torn off in the strongest parts
    if (storm < 0.8) return;
    const n = Math.floor((storm - 0.8) * 60);
    for (let i = 0; i < n; i++) {
      const life = 90, seed = Math.floor((f + i * 13) / life) * 31 + i;
      const p = ((f + i * 13) % life) / life;
      const x = W / 2 + 60 + p * (500 + 400 * hash(seed)) * Math.sign(wind || 1), y = H - 230 - p * 260 * hash(seed + 1) + Math.sin(p * 9 + i) * 20;
      g.save(); g.translate(x, y); g.rotate(p * 8 + i);
      g.fillStyle = `rgba(255,120,160,${1 - p})`;
      g.beginPath(); g.ellipse(0, 0, 10, 5, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  function singer(x, y, name, col, dark, env, beat, appear, style) {
    if (appear <= 0) return;
    const on = clamp((env - 0.05) * 4);
    const bob = Math.sin(beat) * 4 * on;
    const s = 1 + 0.06 * on;
    g.save(); g.globalAlpha = appear; g.translate(x, y + bob); g.scale(s, s);
    const halo = g.createRadialGradient(0, 0, 40, 0, 0, 170);         // glow when singing
    halo.addColorStop(0, rgb(col, 0.55 * on)); halo.addColorStop(1, rgb(col, 0));
    g.fillStyle = halo; g.beginPath(); g.arc(0, 0, 170, 0, Math.PI * 2); g.fill();
    g.fillStyle = rgb(dark); g.strokeStyle = rgb(col); g.lineWidth = 5;    // body: a little stand
    g.beginPath(); g.roundRect(-34, 70, 68, 60, 14); g.fill(); g.stroke();
    if (style === "box") {                                              // BAKO: a chunky rounded box head
      g.beginPath(); g.roundRect(-82, -76, 164, 150, 34); g.fill(); g.stroke();
      g.fillStyle = rgb(mix(col, [255, 255, 255], 0.25), 0.25 + 0.75 * on);
      g.beginPath(); g.roundRect(-64, -58, 128, 112, 24); g.fill();
      g.fillStyle = rgb([16, 24, 16]);
      for (const ex of [-28, 28]) { g.beginPath(); g.arc(ex, -12, 11, 0, Math.PI * 2); g.fill(); }
    } else {                                                            // Puresu: a sleek oval visor
      g.beginPath(); g.ellipse(0, 0, 92, 78, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = rgb(mix(col, [255, 255, 255], 0.2), 0.25 + 0.75 * on);
      g.beginPath(); g.ellipse(0, -6, 72, 44, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgb([10, 14, 40]); g.lineWidth = 7; g.lineCap = "round";
      for (const ex of [-26, 26]) { g.beginPath(); g.moveTo(ex - 13, -12); g.lineTo(ex + 13, -12); g.stroke(); }
      g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.ellipse(-30, -38, 26, 8, -0.3, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = style === "box" ? rgb([16, 24, 16]) : rgb([10, 14, 40]);   // mouth opens with the voice
    const mw = 34 + 14 * on, mh = 4 + 26 * clamp(env * 1.4);
    g.beginPath(); g.roundRect(-mw / 2, 22 - mh / 2 + 4, mw, mh, Math.min(10, mh / 2)); g.fill();
    g.restore();
    g.save(); g.globalAlpha = appear;
    g.font = "800 30px 'M PLUS Rounded 1c', sans-serif"; g.textAlign = "center";
    g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,0.6)"; g.strokeText(name, x, y + 172);
    g.fillStyle = on > 0.2 ? rgb(mix(col, [255, 255, 255], 0.5)) : "rgba(255,255,255,0.75)"; g.fillText(name, x, y + 172);
    g.restore();
  }
  function textBlock(lines, a) {
    if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.textAlign = "center";
    for (const [txt, size, y, weight, col] of lines) {
      g.font = `${weight} ${size}px 'M PLUS Rounded 1c', sans-serif`;
      g.lineWidth = Math.max(4, size / 7); g.strokeStyle = "rgba(20,8,40,0.75)"; g.strokeText(txt, W / 2, y);
      g.fillStyle = col; g.fillText(txt, W / 2, y);
    }
    g.restore();
  }

  function renderFrame(f) {
    const t = f / fps;
    const { storm, pal } = section(t);
    const low = smooth(data.low, f, 2), age = beatAge(f);
    const kick = age < 99 ? Math.exp(-age / 3) : 0;
    const wind = storm * (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3) * 0.25 + 0.35) + kick * 0.15 * storm;
    g.save();
    const zoom = 1.04 + 0.02 * Math.sin(t * 0.12) + 0.012 * kick * storm;   // slow drift, a nudge on the beat
    g.translate(W / 2, H / 2); g.scale(zoom, zoom); g.translate(-W / 2 + Math.sin(t * 0.07) * 12, -H / 2);
    sky(pal, t); hurricane(t, storm, pal); sun(pal, low, t); sea(pal, t, storm);
    palm(70, H * 0.66, 300, wind, 1); palm(W - 70, H * 0.66, 330, wind, -1);
    const appear = ease(clamp((t - 58) / 4)) * (1 - ease(clamp((t - 199) / 3)));
    const ph = t * Math.PI * 2 * 2.0;
    singer(300, H * 0.5, "BAKO", [70, 220, 110], [14, 40, 22], smooth(data.bako, f, 1), ph, appear, "box");
    singer(W - 300, H * 0.5, "Puresu", [80, 140, 255], [10, 18, 52], smooth(data.puresu, f, 1), ph + 1, appear, "visor");
    flower(t, wind, kick); petals(f, storm, wind); rain(f, storm, wind);
    if (storm > 0.95 && age === 0 && hash(f) > 0.55) { g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(-50, -50, W + 100, H + 100); }
    g.restore();
    const vig = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
    vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vig; g.fillRect(0, 0, W, H);
    textBlock([["FLOWER IN A HURRICANE", 76, 250, 800, "#fff3fa"], ["BAKO & Puresu cover", 38, 312, 700, "#ffd0e4"],
      ["original: Justice ft. Tame Impala, SZA, King Gizzard & the Lizard Wizard", 20, 356, 500, "#f3e8ff"]],
      ease(clamp((t - 0.5) / 1.2)) * (1 - ease(clamp((t - 6.5) / 1.5))));
    textBlock([["BAKO as SZA  ·  Puresu as Kevin Parker", 34, 220, 800, "#ffffff"],
      ["UTAU voicebanks from Voice-2-utau", 24, 270, 500, "#e8ddff"],
      ["vocals isolated with UVR5 models, sung back from the original performances", 22, 306, 500, "#e8ddff"],
      ["original song: Justice – Flower In A Hurricane", 22, 352, 500, "#ffd0e4"],
      ["ft. Tame Impala, SZA, King Gizzard & the Lizard Wizard (from GTA VI)", 20, 384, 500, "#ffd0e4"]],
      ease(clamp((t - 203) / 1.5)) * (1 - ease(clamp((t - 222) / 2))));
    const out = clamp((t - 222.5) / 2.4);                               // fade to black
    if (out > 0) { g.fillStyle = `rgba(0,0,0,${out})`; g.fillRect(0, 0, W, H); }
    const inn = 1 - clamp(t / 1.0);
    if (inn > 0) { g.fillStyle = `rgba(0,0,0,${inn})`; g.fillRect(0, 0, W, H); }
  }

  return {
    frames: N, fps, duration: N / fps, renderFrame,
    shots: SECTIONS.slice(0, -1).map(([t0]) => ({ t0, type: "section" })),
    capture(type = "image/jpeg", q = 0.92) { return cv.toDataURL(type, q); },
  };
}
