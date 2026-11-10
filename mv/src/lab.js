// Debug harness: loads both performers, cel-shades them and renders test views (see lab.mjs).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { buildCorruptChan } from "../assets/signaling/corrupt-chan-3d/cc_build.js";
import { buildRei } from "./rei.js";
import { celShade, addOutlines, outlineUniforms } from "./toon.js";
import { mulberry32 } from "./util.js";
import { POSES, applyPose } from "./re/poses.js";
import { createCels, attachPenlights } from "./re/cels.js";
import { REI, CC } from "./re/palette.js";
Math.random = mulberry32(7);

export async function createLab({ width = 1280, height = 720 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(width, height);
  document.body.appendChild(renderer.domElement);
  const libs = { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils };
  const CC = "./assets/signaling/corrupt-chan-3d/";
  const [rei, cc] = await Promise.all([
    buildRei(libs, "./assets/rei/adachi_rei_v1.0.0.vrm"),
    buildCorruptChan(libs, { body: CC + "corrupt_chan_body.vrm", hair: CC + "corrupt_chan_hair.vrm" }),
  ]);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d1640);
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-2.6, 2.0, 1.6); scene.add(key);
  const amb = new THREE.AmbientLight(0xffffff, 0.75); scene.add(amb);
  scene.add(rei.root, cc.root);
  rei.root.position.x = -0.45; cc.root.position.x = 0.45;
  for (const b of [rei, cc]) b.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const cam = new THREE.PerspectiveCamera(30, width / height, 0.05, 50);
  let toonOn = false;
  function toon() {
    if (toonOn) return; toonOn = true;
    celShade(rei.root); celShade(cc.root);
    addOutlines(rei.root); addOutlines(cc.root);
  }
  function settle() { for (let i = 0; i < 60; i++) { rei.update(1 / 30, i / 30); cc.update(1 / 30, i / 30, { glitch: false }); } }
  settle();
  function view(name) {
    if (name === "full") { cam.fov = 30; cam.position.set(0, 0.85, 4.2); cam.lookAt(0, 0.82, 0); outlineUniforms.uOutlinePx.value = 1.8; }
    if (name === "faces") { cam.fov = 20; cam.position.set(0, 1.38, 1.9); cam.lookAt(0, 1.33, 0); outlineUniforms.uOutlinePx.value = 2.6; }
    if (name === "back") { cam.fov = 30; cam.position.set(0, 0.85, -4.2); cam.lookAt(0, 0.82, 0); outlineUniforms.uOutlinePx.value = 1.8; }
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    return renderer.domElement.toDataURL("image/png");
  }
  // both performers in one key pose, seen from angle (degrees, 0 = front)
  function pose(name, angle = 0, dist = 4.2, y = 0.75) {
    toon();
    for (const b of [rei, cc]) applyPose(b.vrm, POSES[name]);
    for (let i = 0; i < 40; i++) { rei.update(1 / 30); cc.update(1 / 30, i / 30, { glitch: false }); }
    const a = (angle * Math.PI) / 180;
    cam.fov = 30; cam.position.set(Math.sin(a) * dist, y + 0.1, Math.cos(a) * dist); cam.lookAt(0, y, 0); cam.updateProjectionMatrix();
    outlineUniforms.uOutlinePx.value = 1.6;
    renderer.render(scene, cam);
    return renderer.domElement.toDataURL("image/png");
  }
  // close-up of both faces wearing an expression (names as three-vrm registers them)
  function expr(spec) {
    toon();
    for (const b of [rei, cc]) {
      applyPose(b.vrm, POSES.stand);
      const em = b.vrm.expressionManager;
      for (const e of em.expressions) em.setValue(e.expressionName, 0);
      for (const part of spec.split("+")) { const [n, v] = part.split("="); if (em.getExpression(n)) em.setValue(n, v ? +v : 1); }
    }
    for (let i = 0; i < 30; i++) { rei.update(1 / 30); cc.update(1 / 30, i / 30, { glitch: false }); }
    // each face in its own half, camera on the head bone
    renderer.setScissorTest(true);
    [[rei, 0], [cc, 1]].forEach(([b, k]) => {
      const hp = b.vrm.humanoid.getRawBoneNode("head").getWorldPosition(new THREE.Vector3());
      cam.fov = 18; cam.aspect = (width / 2) / height; cam.position.set(hp.x, hp.y + 0.06, hp.z + 0.95); cam.lookAt(hp.x, hp.y + 0.05, hp.z); cam.updateProjectionMatrix();
      renderer.setViewport(k * width / 2, 0, width / 2, height); renderer.setScissor(k * width / 2, 0, width / 2, height);
      outlineUniforms.uRes.value.set(width / 2, height); outlineUniforms.uOutlinePx.value = 2.6;
      renderer.render(scene, cam);
    });
    renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); cam.aspect = width / height;
    return renderer.domElement.toDataURL("image/png");
  }
  function exprNames() { return { rei: rei.vrm.expressionManager.expressions.map((e) => e.expressionName), cc: cc.vrm.expressionManager.expressions.map((e) => e.expressionName) }; }
  // chorus drawings: one character, several poses, on her panel colour, penlights and glow
  let cels = null;
  function celSheet(who, names) {
    toon();
    if (!cels) {
      const mk = (b, k) => { const g = new THREE.Group(); scene.add(g); g.add(b.root); b.root.position.x = 0; const H = b.vrm.humanoid; b.root.updateMatrixWorld(true); return { key: k, b, vrm: b.vrm, holder: g, H, footY: H.getRawBoneNode("leftFoot").getWorldPosition(new THREE.Vector3()).y }; };
      const actors = { rei: mk(rei, "rei"), cc: mk(cc, "cc") };
      actors.rei.sticks = attachPenlights(rei, 0xffa23f, ["left", "right"]);
      actors.cc.sticks = attachPenlights(cc, 0xb070ff, ["right"]);
      const faceFn = (a, mood) => { const em = a.vrm.expressionManager; for (const e of em.expressions) em.setValue(e.expressionName, 0); for (const [n, w] of Object.entries(mood)) if (em.getExpression(n)) em.setValue(n, w); };
      scene.background = null; renderer.setClearColor(0x000000, 0);
      cels = createCels({ gl: renderer, H: height, actors, scene, faceFn });
    }
    const out = document.createElement("canvas"); out.width = 255 * names.length; out.height = 360;
    const g = out.getContext("2d");
    names.forEach((n, i) => {
      g.fillStyle = who === "rei" ? REI.main : CC.main; g.fillRect(i * 255, 0, 255, 360);
      const c = cels.cel({ who, pose: POSES[n], mood: { aa: 0.6 }, yaw: who === "rei" ? 0.22 : -0.22, cam: [28, 0, 1.0, 4.5, 0, 0.86, 0], w: 510, h: 720, sticks: true });
      g.drawImage(c.img, i * 255, 0, 255, 360);
      if (c.glow) { g.globalCompositeOperation = "lighter"; g.drawImage(c.glow, i * 255, 0, 255, 360); g.globalCompositeOperation = "source-over"; }
      g.fillStyle = "#fff"; g.font = "12px sans-serif"; g.fillText(n, i * 255 + 4, 14);
    });
    return out.toDataURL("image/png");
  }
  // Corrupt-Chan curled up (the verse), with a skirt drape to test: "f0,f1,f2,s0,s1,b0" in degrees
  function sitTest(drape) {
    celSheet("cc", []); // sets up the drawing system
    const [f0, f1, f2, s0, s1, b0] = drape === "drape" ? [0, 0, 0, 0, 0, 0] : drape.split(",").map(Number);
    const bones = {};
    for (const S of ["L", "R"]) {
      bones[`J_Sec_${S}_SkirtFront0`] = [f0, 0, 0]; bones[`J_Sec_${S}_SkirtFront1`] = [f1, 0, 0]; bones[`J_Sec_${S}_SkirtFront2`] = [f2, 0, 0];
      bones[`J_Sec_${S}_SkirtSide0`] = [s0, 0, 0]; bones[`J_Sec_${S}_SkirtSide1`] = [s1, 0, 0];
      bones[`J_Sec_${S}_SkirtBack0`] = [b0, 0, 0];
    }
    const out = document.createElement("canvas"); out.width = 760; out.height = 540; const g = out.getContext("2d");
    g.fillStyle = "#3a1670"; g.fillRect(0, 0, 760, 540);
    [[-0.42, 0], [0.9, 380]].forEach(([yaw, x]) => {
      const c = cels.cel({ who: "cc", pose: POSES.sit, mood: {}, yaw, cam: [30, -0.25, 0.86, 2.25, 0, 0.5, 0], w: 508, h: 720, outline: 2.0, ...(drape === "drape" ? { drape: true } : { bones }) });
      g.drawImage(c.img, x, 0, 380, 540);
    });
    g.fillStyle = "#fff"; g.font = "14px sans-serif"; g.fillText(drape, 6, 16);
    return out.toDataURL("image/png");
  }
  function bones() {
    const out = {};
    for (const [k, b] of Object.entries({ rei, cc })) {
      const H = b.vrm.humanoid, w = (n) => H.getRawBoneNode(n)?.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(3));
      out[k] = { hips: w("hips"), head: w("head"), lFoot: w("leftFoot"), lHand: w("leftHand"), lUpLeg: w("leftUpperLeg"), lKnee: w("leftLowerLeg") };
    }
    return out;
  }
  return { view, toon, pose, expr, exprNames, celSheet, sitTest, bones, rei, cc, scene, renderer };
}
