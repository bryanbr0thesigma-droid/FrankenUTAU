// Cel-shaded 3D props for the "CRT monitor" shots: the TV (also red, and with a hand reaching
// out of it), the two glowsticks, the phone handset and flip phone, and the grey props of the
// bridge (mug with a cable, tear-off calendar, the box on bird legs). Toon materials with a
// two-step ramp and the same constant-width outline as the performers.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { addOutlines } from "../toon.js";
import { REI, CC, hex } from "./palette.js";

const ramp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 255, 255, 255, 255]), 2, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();
export const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...o });
const glowMat = (color) => new THREE.MeshBasicMaterial({ color });

function canvasTex(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext("2d"), tex };
}
const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

// ---------- TV ----------
function buildTV({ body, bezel, knobs, red = false }) {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(1.75, 1.32, 1.15, 4, 0.14), toon(body)));
  g.add(mesh(new RoundedBoxGeometry(1.38, 1.0, 0.12, 3, 0.09), toon(bezel), -0.06, 0.06, 0.55));
  const scr = canvasTex(256, 192);
  const screen = mesh(new THREE.PlaneGeometry(1.24, 0.88), new THREE.MeshBasicMaterial({ map: scr.tex }), -0.06, 0.06, 0.615);
  g.add(screen);
  knobs.forEach((k, i) => {
    const kb = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), glowMat(k), -0.32 + i * 0.13, -0.52, 0.58);
    kb.rotation.x = Math.PI / 2; g.add(kb);
  });
  for (const s of [-1, 1]) {
    const ant = new THREE.Group(); ant.position.set(s * 0.18, 0.66, -0.05); ant.rotation.z = -s * 0.55; g.add(ant);
    ant.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.95, 8), toon(bezel), 0, 0.47, 0));
    ant.add(mesh(new THREE.SphereGeometry(0.055, 14, 10), toon(0xf4f2ff), 0, 0.96, 0));
  }
  g.add(mesh(new THREE.SphereGeometry(0.16, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(bezel), 0, 0.64, -0.05));
  const bars = red ? ["#2a0306", "#ff2a3a", "#7a0610", "#ff6a6a", "#3a0508", "#c4101c"] : ["#fff4ea", REI.pale, REI.light, CC.light, CC.text, "#efe8ff"];
  g.userData.drawScreen = (t, mode = "bars") => {
    const { c, g: x } = scr, W = c.width, H = c.height;
    if (mode === "bars") {
      const n = bars.length, off = Math.floor(t * 12) % 7 === 0 ? 6 : 0;
      for (let i = 0; i < n; i++) { x.fillStyle = bars[i]; x.fillRect((i * W) / n + off, 0, W / n + 1, H); }
      x.fillStyle = red ? "#1a0204" : "#3a2d6a"; x.fillRect(0, H * 0.78, W, H * 0.22);
      for (let i = 0; i < 4; i++) { x.fillStyle = bars[(i * 2 + 1) % n]; x.fillRect((i * W) / 4, H * 0.8, W / 8, H * 0.18); }
    } else { x.fillStyle = red ? "#120102" : "#0e0a22"; x.fillRect(0, 0, W, H); }
    // rolling interference
    const yb = ((t * 0.45) % 1) * H;
    x.fillStyle = "rgba(255,255,255,0.18)"; x.fillRect(0, yb, W, 10);
    for (let i = 0; i < 26; i++) {
      const yy = (Math.sin(i * 91.7 + Math.floor(t * 15) * 13.1) * 0.5 + 0.5) * H;
      x.fillStyle = `rgba(0,0,0,${0.12 + 0.1 * (i % 3)})`; x.fillRect(0, yy, W, 2);
    }
    scr.tex.needsUpdate = true;
  };
  g.userData.screen = screen;
  return g;
}

// a cartoon hand (palm, four fingers, thumb), fingers along +y, palm facing +z
function buildHand(color) {
  const g = new THREE.Group(), m = toon(color);
  g.add(mesh(new RoundedBoxGeometry(0.46, 0.5, 0.16, 3, 0.07), m));
  [-0.16, -0.055, 0.055, 0.16].forEach((x, i) => {
    const L = [0.3, 0.36, 0.34, 0.27][i];
    const f = mesh(new THREE.CapsuleGeometry(0.052, L, 4, 10), m, x, 0.25 + L / 2, 0);
    f.rotation.z = -x * 0.5; g.add(f);
  });
  const th = mesh(new THREE.CapsuleGeometry(0.058, 0.22, 4, 10), m, -0.3, 0.02, 0.03);
  th.rotation.z = 0.9; g.add(th);
  // the wrist and forearm, running back into the screen
  const arm = mesh(new THREE.CylinderGeometry(0.15, 0.18, 1.4, 16), m, 0, -0.2, -0.72);
  arm.rotation.x = Math.PI / 2 - 0.25; g.add(arm);
  return g;
}

// ---------- glowsticks ----------
function buildSticks() {
  const g = new THREE.Group();
  const stick = (col, pale, x, rz) => {
    const s = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(0.2, 1.7, 6, 20);
    const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), c1 = new THREE.Color(col), c2 = new THREE.Color(pale), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { c.copy(c1).lerp(c2, 0.15 + 0.6 * THREE.MathUtils.clamp((pos.getY(i) + 0.9) / 1.8, 0, 1)); colors.set([c.r, c.g, c.b], i * 3); }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })));
    const cap = mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.3, 24), toon(0x221b40), 0, -0.85, 0);
    s.add(cap);
    s.position.x = x; s.rotation.z = rz;
    g.add(s);
    return s;
  };
  g.userData.sticks = [stick(hex(REI.deep), hex(REI.light), -0.32, 0.62), stick(hex(CC.deep), hex(CC.text), 0.32, 0.62)];
  return g;
}

// ---------- phones ----------
function buildPhones() {
  const g = new THREE.Group();
  const pale = toon(hex(REI.pale)), deep = toon(0x6a4a3a);
  // handset: a C-shaped grip with an earpiece and a mouthpiece
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.75, -0.15, 0), new THREE.Vector3(-0.45, 0.32, 0), new THREE.Vector3(0.0, 0.45, 0), new THREE.Vector3(0.45, 0.32, 0), new THREE.Vector3(0.75, -0.15, 0)]);
  const hs = new THREE.Group(); g.add(hs);
  hs.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.13, 14, false), pale));
  for (const [x, rz] of [[-0.78, -0.5], [0.78, 0.5]]) {
    const cup = mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.24, 24), pale, x, -0.24, 0);
    cup.rotation.z = rz; hs.add(cup);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const hole = mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: 0x4a3e6a }), x + Math.cos(a) * 0.12, -0.24 + Math.sin(a) * 0.12 * 0.4, 0.13);
      hs.add(hole);
    }
  }
  // curly cord
  const pts = [];
  for (let i = 0; i <= 160; i++) { const k = i / 160, a = k * Math.PI * 2 * 9; pts.push(new THREE.Vector3(-0.85 - k * 0.15 + Math.cos(a) * 0.06, -0.4 - k * 0.9, Math.sin(a) * 0.06)); }
  hs.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.018, 6, false), pale));
  hs.position.set(-0.45, 0.5, -0.2); hs.rotation.set(0.2, 0.25, -0.2);
  // flip phone: hinged halves, missing-texture keypad, cracked screen
  const fp = new THREE.Group(); g.add(fp);
  const shell = toon(hex(CC.text)), dark = toon(0x2b0c3a);
  const keyT = canvasTex(64, 96); { const x = keyT.g; for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) { x.fillStyle = (i + j) % 2 ? "#ff1fe0" : "#120414"; x.fillRect(i * 16, j * 16, 16, 16); } keyT.tex.magFilter = THREE.NearestFilter; keyT.tex.needsUpdate = true; }
  const scrT = canvasTex(96, 128); { const x = scrT.g; x.fillStyle = "#e8f6ff"; x.fillRect(0, 0, 96, 128); x.strokeStyle = "#1a0d2c"; x.lineWidth = 3; x.beginPath(); x.moveTo(50, 0); x.lineTo(40, 40); x.lineTo(58, 64); x.lineTo(44, 128); x.moveTo(40, 40); x.lineTo(10, 56); x.moveTo(58, 64); x.lineTo(90, 80); x.stroke(); scrT.tex.needsUpdate = true; }
  const low = new THREE.Group(); fp.add(low);
  low.add(mesh(new RoundedBoxGeometry(0.62, 0.95, 0.1, 3, 0.04), shell, 0, -0.48, 0));
  low.add(mesh(new THREE.PlaneGeometry(0.46, 0.6), new THREE.MeshBasicMaterial({ map: keyT.tex }), 0, -0.55, 0.052));
  const up = new THREE.Group(); up.rotation.x = -0.45; fp.add(up);
  up.add(mesh(new RoundedBoxGeometry(0.62, 0.95, 0.1, 3, 0.04), shell, 0, 0.48, 0));
  up.add(mesh(new THREE.PlaneGeometry(0.44, 0.62), new THREE.MeshBasicMaterial({ map: scrT.tex }), 0, 0.5, 0.052));
  fp.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 12), dark, 0, 0, 0).rotateZ(Math.PI / 2));
  fp.position.set(0.55, -0.35, 0.2); fp.rotation.set(-0.45, -0.35, 0.3);
  g.userData.parts = { hs, fp };
  return g;
}

// ---------- the bridge's grey props ----------
const GREY = 0xd9d7e0, GREY2 = 0x8d8a99, RED = 0xe0222f;
function buildCup() {
  const g = new THREE.Group();
  const prof = [[0, -0.5], [0.42, -0.5], [0.46, -0.44], [0.48, 0.42], [0.5, 0.5], [0.44, 0.5], [0.42, -0.42], [0, -0.42]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 40), toon(GREY, { side: THREE.DoubleSide })));
  const handle = mesh(new THREE.TorusGeometry(0.24, 0.06, 10, 24, Math.PI * 1.1), toon(GREY), 0.48, 0.02, 0);
  handle.rotation.z = -Math.PI * 0.55; g.add(handle);
  const pts = [[-0.1, 0.35, 0], [-0.3, 0.75, 0.05], [-0.6, 0.62, 0.1], [-0.75, 0.0, 0.2], [-0.85, -0.5, 0.35], [-1.3, -0.52, 0.5], [-1.7, -0.5, 0.45]].map((p) => new THREE.Vector3(...p));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.035, 8, false), toon(RED)));
  g.add(mesh(new RoundedBoxGeometry(0.22, 0.1, 0.12, 2, 0.02), toon(RED), -1.78, -0.5, 0.45));
  return g;
}
function buildCalendar() {
  const g = new THREE.Group();
  const page = canvasTex(256, 220);
  { const x = page.g; x.fillStyle = "#f2f1f5"; x.fillRect(0, 0, 256, 220); x.fillStyle = "#c81e2a"; x.fillRect(0, 0, 256, 34); x.font = "900 170px 'Noto Sans JP'"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("1", 128, 130); x.strokeStyle = "#1a1420"; x.lineWidth = 4; x.strokeRect(2, 2, 252, 216); page.tex.needsUpdate = true; }
  g.userData.page = page;
  g.add(mesh(new RoundedBoxGeometry(1.5, 0.22, 1.25, 2, 0.04), toon(GREY2), 0, -0.2, 0));
  g.add(mesh(new RoundedBoxGeometry(1.36, 0.22, 1.12, 2, 0.03), toon(GREY), 0, 0.02, 0));
  const top = mesh(new THREE.PlaneGeometry(1.32, 1.08), new THREE.MeshBasicMaterial({ map: page.tex }), 0, 0.135, 0);
  top.rotation.x = -Math.PI / 2; g.add(top);
  for (let i = 0; i < 5; i++) { const r = mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 16), toon(0x4a4752), -0.5 + i * 0.25, 0.14, -0.52); r.rotation.y = Math.PI / 2; g.add(r); }
  g.rotation.set(0.85, -0.5, 0.1);
  return g;
}
function buildBoxBird() {
  const g = new THREE.Group();
  g.add(mesh(new RoundedBoxGeometry(1.0, 0.85, 0.9, 2, 0.03), toon(GREY), 0, 0, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.43, -0.46); lid.rotation.x = -0.45; g.add(lid);
  lid.add(mesh(new RoundedBoxGeometry(1.08, 0.12, 0.98, 2, 0.02), toon(GREY), 0, 0.03, 0.47));
  const ant = new THREE.Group(); ant.position.set(0.25, 0.35, 0.1); ant.rotation.set(0.3, 0, -0.55); g.add(ant);
  ant.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), toon(RED), 0, 0.45, 0));
  ant.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), glowMat(RED), 0, 0.92, 0));
  // bird legs: hip, knee, ankle, three toes each
  const tube = (pts, r) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 16, r, 8, false), toon(GREY2));
  for (const s of [-1, 1]) {
    const hip = [s * 0.3, -0.4, 0.1], knee = [s * 0.56, -0.74, 0.22], ankle = [s * 0.48, -1.12, 0.12];
    g.add(tube([hip, knee, ankle], 0.032));
    for (const a of [-0.7, 0, 0.7]) g.add(tube([ankle, [ankle[0] + Math.sin(a) * 0.26 + s * 0.04, -1.16, ankle[2] + Math.cos(a) * 0.26]], 0.02));
    g.add(tube([ankle, [ankle[0] - s * 0.05, -1.15, ankle[2] - 0.2]], 0.018));
  }
  g.userData.lid = lid; g.userData.ant = ant;
  return g;
}

export function buildProps() {
  const P = {
    tv: buildTV({ body: 0xc9c2ea, bezel: 0x3b3456, knobs: [0xfff4ea, hex(REI.light), hex(REI.main), hex(CC.light), hex(CC.text)] }),
    tvRed: buildTV({ body: 0x5a0c14, bezel: 0x1e0306, knobs: [0xff3040, 0x80101a, 0xff6a6a, 0x80101a, 0xff3040], red: true }),
    hand: buildHand(hex(CC.light)),
    handRed: buildHand(0xff2a3a),
    sticks: buildSticks(),
    phones: buildPhones(),
    cup: buildCup(),
    calendar: buildCalendar(),
    boxbird: buildBoxBird(),
  };
  for (const [k, g] of Object.entries(P)) {
    addOutlines(g, { color: k === "tvRed" || k === "handRed" ? 0x050000 : 0x140c26 });
    g.visible = false;
  }
  return P;
}
