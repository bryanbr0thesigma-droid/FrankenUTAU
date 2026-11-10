// The props of the monitor shots, built from 3moji models (CC BY-SA 4.0, see models/3moji/):
// the TV (with colour bars on its screen), the hand reaching out of it, the red TV (its screen a
// mouth with a hand clawing out), the phone handset and the broken smartphone, the can and the red
// plug, and the tear-off calendar. The box on bird legs is built here from plain geometry.
// The models are toon-shaded and outlined like everything else, and recoloured where needed.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
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

// copy a model's atlas with some colours replaced ([from rgb, to rgb], exact within tol)
function recolorAtlas(root, pairs, tol = 6) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material.map) return;
    const src = o.material.map, img = src.image, c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) for (const [f, t] of pairs) {
      if (Math.abs(d[i] - f[0]) + Math.abs(d[i + 1] - f[1]) + Math.abs(d[i + 2] - f[2]) <= tol) { d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2]; break; }
    }
    x.putImageData(id, 0, 0);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = src.colorSpace; tex.flipY = src.flipY;
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    o.material.map = tex; o.material.needsUpdate = true;
  });
}

export async function buildModelProps(gl) {
  const [tvA, tvB, handA, recv, phone, can, cal, plugM, claw] = await Promise.all(
    ["television", "television", "raised_hand", "telephone_receiver", "mobile_phone", "canned_food", "tearoff_calendar", "electric_plug", "hand_with_fingers_splayed"].map(load));

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
  // the red TV's screen is a mouth ("君を喰らったTV"): rows of black teeth and a black hand
  // clawing out of the throat. The hand is the 3moji splayed hand rendered once as a silhouette.
  const clawImg = (() => {
    const sc = new THREE.Scene(), h = normalize(toonify(claw, { solid: 0x000000 }), 1);
    h.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshBasicMaterial({ color: 0x0a0002 }); });
    h.rotation.set(0.25, 0, -0.35); sc.add(h);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20); cam.position.set(0, 0.5, 2.3); cam.lookAt(0, 0.5, 0);
    const S = 256, Hh = gl.domElement.height;
    gl.setScissorTest(true); gl.setViewport(0, Hh - S, S, S); gl.setScissor(0, Hh - S, S, S);
    gl.clear(true, true, true); gl.render(sc, cam); gl.setScissorTest(false);
    const c = document.createElement("canvas"); c.width = c.height = S;
    c.getContext("2d").drawImage(gl.domElement, 0, 0, S, S, 0, 0, S, S);
    return c;
  })();
  function drawMouth(t) {
    const { c, g: x, tex } = off, W = c.width, H = c.height, f = Math.floor(t * 10);
    x.fillStyle = "#c80f1e"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#0a0002";
    const tooth = (tx, ty, tw, th, down) => { x.beginPath(); if (down) { x.moveTo(tx, ty); x.lineTo(tx + tw, ty); x.lineTo(tx + tw, ty + th - tw / 2); x.arc(tx + tw / 2, ty + th - tw / 2, tw / 2, 0, Math.PI); } else { x.moveTo(tx, ty + th); x.lineTo(tx + tw, ty + th); x.lineTo(tx + tw, ty + tw / 2); x.arc(tx + tw / 2, ty + tw / 2, tw / 2, 0, Math.PI, true); } x.closePath(); x.fill(); };
    for (let i = 0; i < 6; i++) tooth(18 + i * 38, 8, 24, 48 + (i % 2) * 12 + Math.sin(i * 2.1) * 6, true);
    for (let i = 0; i < 6; i++) tooth(22 + i * 38, H - 44 - (i % 2) * 6, 24, 38 + (i % 2) * 6, false);
    // the throat and the hand clawing out of it, twitching with the drawings
    x.beginPath(); x.ellipse(W * 0.5, H * 0.66, 40, 28, 0, 0, Math.PI * 2); x.fill();
    const s = 230 + (f % 2) * 10, j = (f % 3) - 1;
    x.drawImage(clawImg, W * 0.52 - s / 2 + j * 3, H * 0.47 - s / 2 + j * 2, s, s);
    for (let i = 0; i < 26; i++) { const yy = (Math.sin(i * 91.7 + f * 13.1) * 0.5 + 0.5) * H; x.fillStyle = `rgba(0,0,0,${0.08 + 0.06 * (i % 3)})`; x.fillRect(0, yy, W, 2); }
    tex.needsUpdate = true;
  }
  tvRed.userData.drawScreen = (t) => drawMouth(t);
  tv.userData.screen = tvScreen; tvRed.userData.screen = redScreen;
  tv.userData.screenBox = screenBox;

  // ---------- the hand reaching out of the screen (with its forearm running back in) ----------
  const mkHand = (src, col) => {
    const h = normalize(toonify(src, { solid: col }), 0.62);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.9, 16), toon(col));
    arm.rotation.x = Math.PI / 2; arm.position.set(0, 0.06, -0.45); h.add(arm);
    return h;
  };
  const hand = mkHand(handA, hex(CC.light));

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

  // ---------- the bridge's props (white and grey, red accents) ----------
  const GREY = 0xdedce6, GREY2 = 0x8d8a99, RED = 0xe0222f;
  // a white can lying on its side, its flip lid open, the red plug lying on the floor beside it
  const cupG = new THREE.Group();
  const canM = normalize(toonify(can, { solid: GREY }), 0.7);
  const cb = new THREE.Box3().setFromObject(canM), r = (cb.max.x - cb.min.x) / 2, top = cb.max.y;
  const hole = new THREE.Mesh(new THREE.CircleGeometry(r * 0.86, 40), new THREE.MeshBasicMaterial({ color: 0x141218 }));
  hole.rotation.x = -Math.PI / 2; hole.position.y = top + 0.002; hole.userData.noOutline = true; canM.add(hole);
  const lidHinge = new THREE.Group(); lidHinge.position.set(r * 0.98, top, 0); canM.add(lidHinge);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, 0.045, 40), toon(GREY)); lid.position.set(-r * 0.97, 0.02, 0); lidHinge.add(lid);
  lidHinge.rotation.z = -1.95;
  canM.rotation.set(0, 0, Math.PI / 2); canM.position.set(0.25, r, 0); // on its side, open end to the camera's left
  const can2 = new THREE.Group(); can2.add(canM); can2.rotation.y = 0.75; can2.position.x = 0.3; cupG.add(can2); // open end towards the camera
  const plug = normalize(toonify(plugM, { solid: RED }), 0.42);
  plug.rotation.set(0.3, 0.6, Math.PI / 2 + 0.2); plug.position.set(-0.6, 0.08, 0.15); cupG.add(plug);
  cupG.userData.lid = lidHinge;
  // the tear-off calendar: dark top block, a page with a big red "1" and cracks across it
  recolorAtlas(cal, [[[238, 63, 58], [52, 50, 60]], [[255, 255, 255], [52, 50, 60]], [[33, 33, 33], [254, 235, 237]]]);
  const calG = normalize(toonify(cal), 1.5);
  const pageT = canvasTex(256, 256);
  { const x = pageT.g; x.clearRect(0, 0, 256, 256); x.fillStyle = "#d4111f"; x.font = "900 220px 'Noto Sans JP'"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("1", 128, 140);
    x.strokeStyle = "#2a2430"; x.lineWidth = 3; x.beginPath(); x.moveTo(150, 0); x.lineTo(138, 60); x.lineTo(176, 110); x.lineTo(160, 180); x.lineTo(200, 256); x.moveTo(176, 110); x.lineTo(240, 128); x.moveTo(40, 30); x.lineTo(70, 50); x.lineTo(60, 80); x.stroke(); pageT.tex.needsUpdate = true; }
  const pb = new THREE.Box3().setFromObject(calG);
  const page = new THREE.Mesh(new THREE.PlaneGeometry((pb.max.x - pb.min.x) * 0.7, (pb.max.y - pb.min.y) * 0.62), new THREE.MeshBasicMaterial({ map: pageT.tex, transparent: true }));
  page.position.set(0, pb.min.y + (pb.max.y - pb.min.y) * 0.36, 0.06); page.userData.noOutline = true; calG.add(page);
  // the box: a plain box whose lid flaps open, on grey bird legs, a red antenna from inside
  const box = new THREE.Group();
  const bw = 1.0, bh = 0.78, bd = 0.9;
  const body = new THREE.Mesh(new RoundedBoxGeometry(bw, bh, bd, 2, 0.025), toon(GREY)); body.position.y = 0.62 + bh / 2; box.add(body);
  const hinge = new THREE.Group(); hinge.position.set(0, 0.62 + bh, -bd / 2); box.add(hinge);
  const lidB = new THREE.Mesh(new RoundedBoxGeometry(bw + 0.08, 0.16, bd + 0.08, 2, 0.02), toon(GREY)); lidB.position.set(0, 0.06, bd / 2); hinge.add(lidB);
  const tube = (pts, rr, col) => new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((pp) => new THREE.Vector3(...pp))), 16, rr, 8, false), toon(col));
  for (const sg of [-1, 1]) { // bird legs, splayed out to the sides
    const hip = [sg * 0.42, 0.66, 0.05], knee = [sg * 0.78, 0.4, 0.15], ankle = [sg * 0.88, 0.06, 0.08];
    box.add(tube([hip, knee, ankle], 0.04, GREY2));
    for (const a of [-0.8, 0, 0.8]) box.add(tube([ankle, [ankle[0] + sg * (0.12 + Math.cos(a) * 0.16), 0.02, ankle[2] + Math.sin(a) * 0.28]], 0.026, GREY2));
  }
  const ant = new THREE.Group(); ant.position.set(0.3, 0.62 + bh - 0.05, 0.1); ant.rotation.set(0.25, 0, -0.6); box.add(ant);
  ant.add(tube([[0, 0, 0], [0.02, 0.45, 0], [0, 0.9, 0]], 0.014, RED));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshBasicMaterial({ color: RED })); tip.position.y = 0.92; ant.add(tip);
  box.userData.lid = hinge;

  const P = { tv, tvRed, hand, phones, cup: cupG, calendar: calG, boxbird: box };
  for (const [k, g] of Object.entries(P)) { addOutlines(g, { color: k === "tvRed" ? 0x050000 : 0x140c26 }); g.visible = false; }
  return P;
}
