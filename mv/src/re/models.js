// The props of the monitor shots, built from 3moji models (CC BY-SA 4.0, see models/3moji/):
// the TV (with colour bars on its screen), the red TV, the hand reaching out of it, the phone
// handset and the broken smartphone, the cup, the tear-off calendar and the box on bird legs.
// The models are toon-shaded and outlined like everything else, and recoloured where needed.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { addOutlines } from "../toon.js";
import { toon } from "./props.js";
import { REI, CC, hex } from "./palette.js";

const DIR = "./models/3moji/";
const loader = new GLTFLoader();
const load = async (n) => (await loader.loadAsync(DIR + n + ".glb")).scene;

// swap PBR materials for toon ones: keep the atlas texture, or one solid colour, or a tint
function toonify(root, { solid = null, tint = 0xffffff } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    o.material = toon(solid ?? tint, { map: solid !== null ? null : src.map, transparent: !!src.transparent, opacity: src.opacity ?? 1 });
    if (src.transparent) o.userData.noOutline = true;
  });
  return root;
}
// scale so the largest side is `size`, centred on x/z, standing on y = 0; returns a wrapper
function normalize(root, size) {
  const box = new THREE.Box3().setFromObject(root), d = box.getSize(new THREE.Vector3());
  const s = size / Math.max(d.x, d.y, d.z);
  root.scale.multiplyScalar(s);
  root.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(root), c = b2.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
  const g = new THREE.Group(); g.add(root); g.updateMatrixWorld(true);
  return g;
}
// the bounding box (in g's space) of the faces whose atlas colour is near `rgb` (0..255)
function findSwatch(g, rgb, tol = 40) {
  const box = new THREE.Box3(), v = new THREE.Vector3();
  g.traverse((o) => {
    if (!o.isMesh || !o.material.map) return;
    const img = o.material.map.image, c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, c.width, c.height).data;
    const uv = o.geometry.attributes.uv, pos = o.geometry.attributes.position;
    const flipY = o.material.map.flipY;
    for (let i = 0; i < uv.count; i++) {
      const u = ((uv.getX(i) % 1) + 1) % 1, vv = ((uv.getY(i) % 1) + 1) % 1;
      const X = Math.min(c.width - 1, Math.floor(u * c.width)), Y = Math.min(c.height - 1, Math.floor((flipY ? 1 - vv : vv) * c.height));
      const k = (Y * c.width + X) * 4;
      if (Math.abs(px[k] - rgb[0]) + Math.abs(px[k + 1] - rgb[1]) + Math.abs(px[k + 2] - rgb[2]) < tol) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); box.expandByPoint(v);
      }
    }
  });
  return box;
}
// the colour at the middle of a model's screen: the most common colour among vertices in a box
export function canvasTex(w, h) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext("2d"), tex };
}
// a plane over a found screen box, facing +z
function screenOver(g, box, tex, inset = 0.0, lift = 0.004) {
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const p = new THREE.Mesh(new THREE.PlaneGeometry(size.x * (1 - inset), size.y * (1 - inset)), new THREE.MeshBasicMaterial({ map: tex }));
  p.position.set(c.x, c.y, box.max.z + lift); p.userData.noOutline = true;
  g.add(p);
  return p;
}

export async function buildModelProps() {
  const [tvA, tvB, handA, handB, recv, phone, cup, cal, pkg] = await Promise.all(
    ["television", "television", "raised_hand", "raised_hand", "telephone_receiver", "mobile_phone", "hot_beverage", "tearoff_calendar", "package"].map(load));

  // ---------- TVs ----------
  const tv = normalize(toonify(tvA), 1.9);
  const tvRed = normalize(toonify(tvB, { tint: 0xff4a55 }), 1.9);
  const screenBox = findSwatch(tv, [129, 213, 250], 24);
  const bars = canvasTex(256, 192), off = canvasTex(256, 192);
  const tvScreen = screenOver(tv, screenBox, bars.tex);
  const redScreen = screenOver(tvRed, screenBox, off.tex);
  const BARS = ["#fff4ea", REI.pale, REI.light, CC.light, CC.text, "#efe8ff"], RBARS = ["#120102", "#2a0306"];
  function drawScreen(scr, t, mode, red) {
    const { c, g: x, tex } = scr, W = c.width, H = c.height;
    if (mode === "bars") {
      const n = BARS.length, offx = Math.floor(t * 12) % 7 === 0 ? 6 : 0;
      for (let i = 0; i < n; i++) { x.fillStyle = BARS[i]; x.fillRect((i * W) / n + offx, 0, W / n + 1, H); }
      x.fillStyle = "#3a2d6a"; x.fillRect(0, H * 0.78, W, H * 0.22);
      for (let i = 0; i < 4; i++) { x.fillStyle = BARS[(i * 2 + 1) % n]; x.fillRect((i * W) / 4, H * 0.8, W / 8, H * 0.18); }
    } else { x.fillStyle = red ? RBARS[0] : "#0e0a22"; x.fillRect(0, 0, W, H); }
    x.fillStyle = "rgba(255,255,255,0.16)"; x.fillRect(0, ((t * 0.45) % 1) * H, W, 10);
    for (let i = 0; i < 26; i++) { const yy = (Math.sin(i * 91.7 + Math.floor(t * 12) * 13.1) * 0.5 + 0.5) * H; x.fillStyle = `rgba(0,0,0,${0.12 + 0.1 * (i % 3)})`; x.fillRect(0, yy, W, 2); }
    tex.needsUpdate = true;
  }
  tv.userData.drawScreen = (t, mode) => drawScreen(bars, t, mode, false);
  tvRed.userData.drawScreen = (t, mode) => drawScreen(off, t, mode, true);
  tv.userData.screen = tvScreen; tvRed.userData.screen = redScreen;
  tv.userData.screenBox = screenBox;

  // ---------- the hand reaching out of the screen (with its forearm running back in) ----------
  const mkHand = (src, col) => {
    const h = normalize(toonify(src, { solid: col }), 0.62);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.9, 16), toon(col));
    arm.rotation.x = Math.PI / 2; arm.position.set(0, 0.06, -0.45); h.add(arm);
    return h;
  };
  const hand = mkHand(handA, hex(CC.light)), handRed = mkHand(handB, 0xff2a3a);

  // ---------- phones: the handset in Rei's colour, the smartphone in Corrupt-Chan's, cracked ----------
  const phones = new THREE.Group();
  const hs = normalize(toonify(recv, { solid: hex(REI.pale) }), 1.1);
  // the coiled cord hangs from the mouthpiece (the handset's lowest point)
  let low = null; hs.traverse((o) => { if (!o.isMesh) return; const pos = o.geometry.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (!low || v.y < low.y) low = v.clone(); } });
  const cord = [];
  for (let i = 0; i <= 160; i++) { const k = i / 160, a = k * Math.PI * 2 * 9; cord.push(new THREE.Vector3(low.x - k * 0.25 + Math.cos(a) * 0.05, low.y + 0.04 - k * 0.9, low.z + Math.sin(a) * 0.05)); }
  hs.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cord), 320, 0.016, 6, false), toon(hex(REI.pale))));
  hs.position.set(-0.55, 0.0, -0.2); hs.rotation.set(0.15, 0.25, -0.3);
  const ph = normalize(toonify(phone, { tint: hex(CC.light) }), 1.2);
  const crack = canvasTex(128, 224);
  { const x = crack.g; x.fillStyle = "#0b0614"; x.fillRect(0, 0, 128, 224); for (let i = 0; i < 12; i++) { x.fillStyle = (i % 2 ? "#ff1fe0" : "#000"); x.fillRect((i % 3) * 40 + 8, Math.floor(i / 3) * 40 + 20, 30, 30); } x.strokeStyle = "#f4f0ff"; x.lineWidth = 3; x.beginPath(); x.moveTo(70, 0); x.lineTo(55, 70); x.lineTo(80, 110); x.lineTo(60, 224); x.moveTo(55, 70); x.lineTo(10, 95); x.moveTo(80, 110); x.lineTo(124, 140); x.moveTo(62, 160); x.lineTo(20, 200); x.stroke(); crack.tex.needsUpdate = true; }
  const phBox = findSwatch(ph, [0, 0, 0], 12);
  if (!phBox.isEmpty()) screenOver(ph, phBox, crack.tex, 0.06, 0.02);
  ph.position.set(0.5, -0.75, 0.25); ph.rotation.set(-0.25, -0.35, 0.3);
  phones.add(hs, ph);
  phones.userData.parts = { hs, fp: ph };

  // ---------- the bridge's props ----------
  const cupG = normalize(toonify(cup), 1.25);
  const cable = [[0.15, 0.55, 0.05], [0.0, 0.95, 0.1], [-0.4, 0.85, 0.15], [-0.6, 0.3, 0.25], [-0.7, 0.02, 0.4], [-1.2, 0.0, 0.5], [-1.7, 0.02, 0.45]].map((p) => new THREE.Vector3(...p));
  cupG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cable), 60, 0.03, 8, false), toon(0xe0222f)));
  const plug = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, 0.11), toon(0xe0222f)); plug.position.set(-1.78, 0.04, 0.45); cupG.add(plug);
  const calG = normalize(toonify(cal), 1.5);
  const box = new THREE.Group();
  const pkgG = normalize(toonify(pkg), 1.05);
  pkgG.position.y = 1.1; box.add(pkgG);
  const tube = (pts, r, col) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 16, r, 8, false), toon(col));
  for (const s of [-1, 1]) { // bird legs
    const hip = [s * 0.25, 1.12, 0.1], knee = [s * 0.5, 0.62, 0.25], ankle = [s * 0.42, 0.08, 0.12];
    box.add(tube([hip, knee, ankle], 0.035, 0x8d8a99));
    for (const a of [-0.7, 0, 0.7]) box.add(tube([ankle, [ankle[0] + Math.sin(a) * 0.28 + s * 0.04, 0.02, ankle[2] + Math.cos(a) * 0.28]], 0.022, 0x8d8a99));
    box.add(tube([ankle, [ankle[0] - s * 0.05, 0.02, ankle[2] - 0.22]], 0.02, 0x8d8a99));
  }
  const ant = new THREE.Group(); ant.position.set(0.25, 2.1, 0.1); ant.rotation.set(0.3, 0, -0.55); box.add(ant);
  ant.add(tube([[0, 0, 0], [0, 0.85, 0]], 0.014, 0xe0222f));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshBasicMaterial({ color: 0xe0222f })); tip.position.y = 0.88; ant.add(tip);
  box.userData.pkg = pkgG;

  const P = { tv, tvRed, hand, handRed, phones, cup: cupG, calendar: calG, boxbird: box };
  for (const [k, g] of Object.entries(P)) { addOutlines(g, { color: k === "tvRed" || k === "handRed" ? 0x050000 : 0x140c26 }); g.visible = false; }
  return P;
}
