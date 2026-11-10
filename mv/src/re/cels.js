// "Drawings": the performers rendered once per pose into a canvas, then animated in 2D like the
// cels of the hand-drawn MV (swapped about ten times a second, shifted, bounced, squashed).
//
// cel(spec) -> { img, glow, eyes } where spec is
//   { who, pose, mood, yaw, x, cam: [fov, px, py, pz, lx, ly, lz], w, h,
//     mode: "color" | "dark" | "flat", fill, line, sticks, outline }
// "dark" is the verses' look: the body filled with the night colour, rim lines in `line`, and the
// eye positions returned so they can glow; "flat" is a plain silhouette in `fill`.
import * as THREE from "three";
import { outlineUniforms } from "../toon.js";
import { applyPose } from "./poses.js";
import { buildPenlight } from "./props.js";

export function attachPenlights(b, color, sides, scale = 2.0) {
  const out = [];
  for (const side of sides) {
    const n = b.vrm.humanoid.getNormalizedBoneNode(side + "Hand");
    const sg = side === "left" ? -1 : 1;
    const p = buildPenlight(color, { scale });
    // in the fist, gripped round the middle of the handle: along the hand's front-back axis,
    // blade out of the thumb side (forward, -z in the rig frame)
    p.position.set(sg * 0.072, -0.02, -0.055 * scale);
    p.rotation.set(-Math.PI / 2, 0, 0);
    p.traverse((o) => { o.userData.penlight = true; });
    p.userData.side = side;
    n.add(p);
    out.push(p);
  }
  return out;
}

export function createCels({ gl, H, actors, scene, faceFn, max = 90 }) {
  const cache = new Map();
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
  const look = new THREE.Object3D(); scene.add(look);
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  let stats = { made: 0, hits: 0 };

  function placeOnFloor(a) {
    a.vrm.humanoid.update();
    a.holder.updateMatrixWorld(true);
    const y = Math.min(a.H.getRawBoneNode("leftFoot").getWorldPosition(v).y, a.H.getRawBoneNode("rightFoot").getWorldPosition(v2).y);
    a.holder.position.y += a.footY - y;
  }
  function swapDark(root, fill, line, flat) {
    const saved = [];
    // double-sided, so the insides of sleeves and skirts hide the outline shell behind them
    const fillM = new THREE.MeshBasicMaterial({ color: fill, side: THREE.DoubleSide });
    root.traverse((o) => {
      if (!o.isMesh) return;
      saved.push([o, o.material, o.visible]);
      if (o.userData.penlight) { o.visible = false; return; }
      if (o.userData.isOutline) {
        if (flat) { o.visible = false; return; }
        const mats = [].concat(o.material);
        for (const m of mats) { m.userData.c0 = m.color.getHex(); m.color.set(line); }
        return;
      }
      const src = [].concat(o.material)[0];
      let m = fillM;
      // cut-outs and blended parts (Corrupt-Chan's dress is a blended material) keep their alpha
      // as a hard cut-out, so the silhouette has no holes and nothing behind shows through
      if (src && (src.alphaTest > 0 || src.transparent) && src.map) {
        m = new THREE.MeshBasicMaterial({ color: fill, map: src.map, alphaTest: src.alphaTest > 0 ? src.alphaTest : 0.5, side: THREE.DoubleSide });
        m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = diffuse;"); };
      }
      o.material = Array.isArray(o.material) ? o.material.map(() => m) : m;
    });
    return () => {
      for (const [o, m, vis] of saved) {
        o.material = m; o.visible = vis;
        if (o.userData.isOutline) for (const mm of [].concat(m)) if (mm.userData.c0 !== undefined) { mm.color.setHex(mm.userData.c0); delete mm.userData.c0; }
      }
    };
  }
  // clean line art for the dark silhouette: every material in its own flat colour, then lines
  // only where two parts meet or at the outer edge (no hair-strand or seam lines)
  function swapID(root) {
    const saved = [], cache = new Map(); let n = 0;
    root.traverse((o) => {
      if (!o.isMesh) return;
      saved.push([o, o.material, o.visible]);
      if (o.userData.isOutline || o.userData.penlight) { o.visible = false; return; }
      const repl = [].concat(o.material).map((src) => {
        if (cache.has(src)) return cache.get(src);
        n++;
        const col = new THREE.Color().setRGB(((n * 67) % 251) / 255, ((n * 131) % 241) / 255, ((n * 197) % 239) / 255, THREE.SRGBColorSpace);
        let m;
        if (src && (src.alphaTest > 0 || src.transparent) && src.map) {
          m = new THREE.MeshBasicMaterial({ color: col, map: src.map, alphaTest: src.alphaTest > 0 ? src.alphaTest : 0.5, side: THREE.DoubleSide });
          m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = diffuse;"); };
        } else m = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
        cache.set(src, m); return m;
      });
      o.material = Array.isArray(o.material) ? repl : repl[0];
    });
    return () => { for (const [o, m, vis] of saved) { o.material = m; o.visible = vis; } };
  }
  function traceLines(idc, fill, line) {
    const w = idc.width, h = idc.height, x = idc.getContext("2d");
    const d = x.getImageData(0, 0, w, h).data, out = x.createImageData(w, h), o = out.data;
    const F = new THREE.Color(fill), L = new THREE.Color(line);
    const rgb = (c) => { const v = c.getHex(); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }; // sRGB bytes
    const fr = rgb(F), lr = rgb(L);
    const diff = (i, j) => Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]);
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const i = (yy * w + xx) * 4;
      if (d[i + 3] < 128) continue;
      let edge = false;
      for (const [dx, dy, outer] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [2, 0, 1], [-2, 0, 1], [0, 2, 1], [0, -2, 1]]) {
        const X = xx + dx, Y = yy + dy;
        if (X < 0 || Y < 0 || X >= w || Y >= h) { edge = true; break; }
        const j = (Y * w + X) * 4;
        if (d[j + 3] < 128) { edge = true; break; }          // the outer contour (2 px)
        if (!outer && diff(i, j) > 30) { edge = true; break; } // where two parts meet (1 px each side)
      }
      const c = edge ? lr : fr;
      o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; o[i + 3] = 255;
    }
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").putImageData(out, 0, 0);
    return c;
  }
  function renderTo(w, h) {
    gl.setScissorTest(true); gl.setViewport(0, H - h, w, h); gl.setScissor(0, H - h, w, h);
    gl.clear(true, true, true);
    gl.render(scene, cam);
    gl.setScissorTest(false);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(gl.domElement, 0, 0, w, h, 0, 0, w, h);
    return c;
  }

  function cel(spec) {
    const key = JSON.stringify(spec);
    if (cache.has(key)) { const r = cache.get(key); cache.delete(key); cache.set(key, r); stats.hits++; return r; }
    const a = actors[spec.who];
    for (const k of Object.keys(actors)) actors[k].holder.visible = k === spec.who;
    // sticks: true, or "left" (the shouts: the right fist is at her mouth, its glow would hide her face)
    for (const p of a.sticks || []) p.visible = spec.sticks === true || spec.sticks === p.userData.side;
    applyPose(a.vrm, spec.pose);
    a.holder.position.set(spec.x || 0, 0, 0); a.holder.rotation.set(0, spec.yaw || 0, 0);
    placeOnFloor(a);
    // pad: a margin round the panel (a fraction of its size), rendered with a matching wider field
    // of view, so the drawing can shift and squash in its panel without showing its edge
    const [fov, px, py, pz, lx, ly, lz] = spec.cam;
    const pad = spec.pad || 0, k = 1 + 2 * pad, rw = Math.round(spec.w * k), rh = Math.round(spec.h * k);
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * k));
    cam.aspect = spec.w / spec.h; cam.position.set(px, py, pz); cam.lookAt(lx, ly, lz); cam.updateProjectionMatrix();
    look.position.copy(cam.position);
    if (a.vrm.lookAt) a.vrm.lookAt.target = look;
    faceFn(a, spec.mood || {});
    a.vrm.springBoneManager?.reset(); a.b.hairVrm?.springBoneManager?.reset();
    for (let i = 0; i < 36; i++) spec.who === "cc" ? a.b.update(1 / 30, i / 30, { glitch: false }) : a.b.update(1 / 30);
    a.holder.updateMatrixWorld(true);
    outlineUniforms.uRes.value.set(rw, rh);
    outlineUniforms.uOutlinePx.value = spec.outline ?? 1.8;
    // faces for the later choruses: "blank" (features gone) or "void" (the face filled black)
    const faceUndo = [];
    if (spec.face) {
      const FEAT = /FaceMouth|EyeWhite|Eyeline|Eyelash|Brow|EyeIris|EyeHighlight|EyeExtra/i;
      const black = new THREE.MeshBasicMaterial({ color: 0x07020c });
      a.b.root.traverse((o) => {
        if (!o.isMesh || o.userData.isOutline) return;
        const mats = [].concat(o.material);
        mats.forEach((m, k) => {
          if (FEAT.test(m.name)) { faceUndo.push(() => { m.visible = true; }); m.visible = false; }
          else if (spec.face === "void" && /Face_00_SKIN/.test(m.name)) {
            const prev = o.material;
            if (Array.isArray(o.material)) { const arr = o.material.slice(); arr[k] = black; o.material = arr; } else o.material = black;
            faceUndo.push(() => { o.material = prev; });
          }
        });
      });
    }
    let img;
    if (spec.mode === "dark") {
      const restore = swapID(a.b.root);
      const idc = renderTo(rw, rh);
      restore();
      img = traceLines(idc, spec.fill, spec.line);
    } else {
      let restore = null;
      if (spec.mode === "flat") restore = swapDark(a.b.root, spec.fill, spec.fill, true);
      img = renderTo(rw, rh);
      if (restore) restore();
    }
    for (const u of faceUndo.reverse()) u();
    // penlight glow: the blades alone, blurred
    let glow = null;
    if (spec.sticks && spec.mode !== "dark" && spec.mode !== "flat" && (a.sticks || []).length) {
      const hidden = [];
      scene.traverse((o) => { if (o.isMesh && o.visible && !o.userData.blade) { hidden.push(o); o.visible = false; } });
      const raw = renderTo(rw, rh);
      for (const o of hidden) o.visible = true;
      glow = document.createElement("canvas"); glow.width = rw >> 1; glow.height = rh >> 1;
      const gg = glow.getContext("2d"); gg.filter = "blur(5px)"; gg.drawImage(raw, 0, 0, glow.width, glow.height); gg.filter = "blur(2px)"; gg.drawImage(raw, 0, 0, glow.width, glow.height);
    }
    // eye positions (for the glowing eyes of the dark verse look)
    const eyes = [];
    for (const n of ["leftEye", "rightEye"]) {
      const b = a.H.getRawBoneNode(n); if (!b) continue;
      b.getWorldPosition(v).project(cam);
      eyes.push([(v.x + 1) / 2 * rw, (1 - v.y) / 2 * rh]);
    }
    const r = { img, glow, eyes, w: rw, h: rh, pad };
    cache.set(key, r); stats.made++;
    if (cache.size > max) cache.delete(cache.keys().next().value);
    return r;
  }
  return { cel, stats: () => stats };
}
