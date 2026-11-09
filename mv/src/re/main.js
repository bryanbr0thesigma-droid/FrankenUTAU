// The reanimation: renders frame i deterministically. Each frame is composed on a 2D canvas
// (panels, text, drawn props) with the cel-shaded 3D performers and props rendered into their
// panels by WebGL, then a post pass (glow, chromatic aberration, scanlines, grain, glitches,
// greyscale for the bridge) produces the output frame.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { buildCorruptChan } from "../../assets/signaling/corrupt-chan-3d/cc_build.js";
import { buildRei } from "../rei.js";
import { celShade, addOutlines, outlineUniforms, silhouette } from "../toon.js";
import { Timeline } from "../timeline.js";
import { POSES, applyPose, blendPose, mirrorPose, addPose } from "./poses.js";
import { SHOTS, SUBS, LIST, shotAt, ALL_TEXT } from "./shots.js";
import { buildProps } from "./props.js";
import * as D from "./draw2d.js";
import { REI, CC, WHO, BG, PANEL, YELLOW, hex, rgba } from "./palette.js";
import { clamp, lerp, easeOut, easeIn, easeInOut, hash1, hash2, frac } from "../util.js";

const W = 1280, H = 720;
const CC_DIR = "./assets/signaling/corrupt-chan-3d/";

export async function createReanim({ container = document.body } = {}) {
  const A = await (await fetch("./build/analysis.json")).json();
  const tl = new Timeline(A);
  const fps = tl.fps, dt = 1 / fps;
  const N = Math.round(179.7 * fps);
  await D.loadFonts(ALL_TEXT());

  // ---------- canvases ----------
  const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1); gl.setSize(W, H); gl.setClearColor(0x000000, 0);
  const comp = document.createElement("canvas"); comp.width = W; comp.height = H;
  const g = comp.getContext("2d");
  const out = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  out.setPixelRatio(1); out.setSize(W, H);
  container.appendChild(out.domElement);
  const post = makePost(out, comp);

  // ---------- performers ----------
  const libs = { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils };
  const [reiB, ccB] = await Promise.all([
    buildRei(libs, "./assets/rei/adachi_rei_v1.0.0.vrm"),
    buildCorruptChan(libs, { body: CC_DIR + "corrupt_chan_body.vrm", hair: CC_DIR + "corrupt_chan_hair.vrm" }),
  ]);
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(-2.4, 2.2, 2.0); scene.add(key);
  const amb = new THREE.AmbientLight(0xffffff, 0.8); scene.add(amb);
  const lookTarget = new THREE.Object3D(); scene.add(lookTarget);
  const actors = {};
  for (const [k, b] of [["rei", reiB], ["cc", ccB]]) {
    celShade(b.root); addOutlines(b.root);
    b.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const holder = new THREE.Group(); holder.add(b.root); scene.add(holder);
    if (b.vrm.lookAt) b.vrm.lookAt.target = lookTarget;
    const Hn = b.vrm.humanoid;
    b.root.updateMatrixWorld(true);
    const footY = Hn.getRawBoneNode("leftFoot").getWorldPosition(new THREE.Vector3()).y;
    actors[k] = { key: k, b, vrm: b.vrm, holder, footY, H: Hn, blinkSeed: k === "rei" ? 3 : 9 };
  }
  const goggles = buildGoggles(reiB);
  const props = buildProps();
  const propScene = new THREE.Scene();
  propScene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const pkey = new THREE.DirectionalLight(0xffffff, 2.0); pkey.position.set(-2, 3, 4); propScene.add(pkey);
  for (const p of Object.values(props)) propScene.add(p);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);

  // ---------- 3D into a panel ----------
  function render3D(sc, camera, rect, o = {}) {
    const px = o.pixel || 1;
    const rw = Math.max(2, Math.round(rect.w / px)), rh = Math.max(2, Math.round(rect.h / px));
    camera.aspect = rect.w / rect.h; camera.updateProjectionMatrix();
    outlineUniforms.uRes.value.set(rw, rh);
    outlineUniforms.uOutlinePx.value = (o.outline ?? 1.7) * (rh / rect.h) * (rect.h / 720) * (o.zoom || 1);
    gl.setScissorTest(true); gl.setViewport(0, H - rh, rw, rh); gl.setScissor(0, H - rh, rw, rh);
    gl.clear(true, true, true);
    gl.render(sc, camera);
    gl.setScissorTest(false);
    g.save();
    if (o.clip) { g.beginPath(); g.rect(o.clip.x, o.clip.y, o.clip.w, o.clip.h); g.clip(); }
    g.imageSmoothingEnabled = px === 1;
    g.globalAlpha = o.alpha ?? 1;
    if (o.blur) g.filter = `blur(${o.blur}px)`;
    g.drawImage(gl.domElement, 0, 0, rw, rh, rect.x, rect.y, rect.w, rect.h);
    g.filter = "none";
    if (o.bloom) { // soft glow: a blurred, brightened copy on top
      g.globalCompositeOperation = "lighter"; g.globalAlpha = o.bloom; g.filter = "blur(10px)";
      g.drawImage(gl.domElement, 0, 0, rw, rh, rect.x, rect.y, rect.w, rect.h);
      g.filter = "none"; g.globalCompositeOperation = "source-over";
    }
    g.globalAlpha = 1; g.imageSmoothingEnabled = true;
    g.restore();
  }
  // horizontal slices of a region pushed sideways (Corrupt-Chan's glitch)
  function sliceGlitch(x, y, w, h, seed, amount) {
    for (let i = 0; i < 7; i++) {
      if (hash2(i, seed) > amount) continue;
      const sy = y + hash2(i + 3, seed) * h, sh = 6 + hash2(i + 7, seed) * 40, dx = (hash2(i + 11, seed) - 0.5) * 70;
      g.drawImage(comp, x, sy, w, sh, x + dx, sy, w, sh);
    }
  }

  // ---------- performers per frame ----------
  function show(...keys) { for (const k of ["rei", "cc"]) actors[k].holder.visible = keys.includes(k); }
  function placeOnFloor(a) {
    a.vrm.humanoid.update();
    a.holder.updateMatrixWorld(true);
    const y = Math.min(a.H.getRawBoneNode("leftFoot").getWorldPosition(_v).y, a.H.getRawBoneNode("rightFoot").getWorldPosition(_v2).y);
    a.holder.position.y += a.footY - y;
  }
  // No lip sync (the official MV has none): mouths are held shapes chosen per pose, like the 2D
  // drawings, set through the mood with the other named expressions (mood: { name: weight }).
  // Rei's model has extra ones (＞＜, びっくり, 瞳ハイライト消 ...); Corrupt-Chan's ＞＜ is "Extra"
  function face(a, t, mood = {}) {
    const em = a.vrm.expressionManager; if (!em) return;
    for (const e of em.expressions) if (!e.expressionName.startsWith("look")) em.setValue(e.expressionName, 0);
    let b = 0; const per = 3.1 + a.blinkSeed * 0.1, ph = frac((t + a.blinkSeed) / per) * per;
    if (ph < 0.14) b = Math.sin((ph / 0.14) * Math.PI);
    const closed = ["＞＜", "Extra", "happy"].some((n) => (mood[n] || 0) > 0.5);
    if (!closed) em.setValue("blink", Math.max(b, mood.blink || 0));
    for (const [n, w] of Object.entries(mood)) if (n !== "mute" && n !== "blink" && em.getExpression(n)) em.setValue(n, w);
  }
  // what each performer does in a shot at time t: { pose, x, yaw, mood }
  function perform(sh, k, t) {
    const beat = tl.beatF(t), local = t - sh.t0;
    if (sh.type === "verse") {
      const sway = Math.sin(beat * Math.PI * 0.5) * 0.05;
      return { pose: addPose(k === "rei" ? POSES.sitUp : POSES.sit, { head: [Math.sin(beat * Math.PI) * 0.04, sway, 0], spine: [0, 0, sway * 0.5] }), yaw: k === "cc" ? -0.42 : 0.42, mood: k === "cc" ? { sad: 0.35, blink: 0.25 } : { "困る": 0.6, blink: 0.15 } };
    }
    if (sh.type === "card" || sh.type === "glow" || sh.type === "credit") {
      const seq = k === "rei" ? ["danceA", "danceB", "danceC", "danceB"] : ["danceB", "danceA", "danceC", "danceA"];
      const step = Math.floor(beat / 2), ph = (beat / 2) - step;
      let cur = POSES[seq[step % 4]], prev = POSES[seq[(step + 3) % 4]];
      if (sh.type === "credit") { cur = POSES[sh.pose]; prev = cur; }
      const lines = sh.card?.lines || [];
      const shout = lines.some(([lt, , kind]) => kind === "W" && t >= lt && t < lt + 0.8);
      if (shout) { cur = POSES.danceD; }
      let p = blendPose(prev, cur, easeOut(ph / 0.15));
      if (k === "cc") p = mirrorPose(p);
      const bounce = -0.025 * Math.abs(Math.sin(beat * Math.PI));
      p = addPose(p, { hips_pos: [0, bounce, 0], head: [0, 0, Math.sin(beat * Math.PI * 0.5) * 0.06] });
      // mouth held per pose step: open (singing) or a smaller "oh", switching with the pose
      const mouth = step % 4 === 2 ? { oh: 0.55 } : { aa: 0.6 };
      let mood = k === "rei" ? { happy: 0.3, ...mouth } : { relaxed: 0.3, ...mouth };
      if (sh.card?.dim) mood = { sad: 0.6, blink: 0.3, oh: 0.15 };
      else if (k === "cc" && sh.card?.special) mood = { sad: 0.5, oh: 0.35 };
      if (shout) mood = k === "rei" ? { "＞＜": 1, aa: 1 } : { Extra: 1, aa: 1 };
      if (sh.type === "glow") mood = { happy: 0.4, aa: 0.6 };
      if (sh.type === "credit") mood = {};
      return { pose: p, yaw: k === "rei" ? 0.22 : -0.22, mood };
    }
    if (sh.type === "close") {
      const base = POSES[sh.pose];
      const reachIn = sh.pose === "reach" ? { rightUpperArm: [0, 0, 0] } : {};
      const p = addPose(base, { head: [Math.sin(local * 2) * 0.03, Math.sin(local * 1.3) * 0.05, 0], ...reachIn });
      const mood = sh.pose === "reach" ? (local < 2.6 ? { "びっくり": 1, oh: 0.6 } : { happy: 0.45, aa: 0.4 }) : (t < 66.9 ? { happy: 0.6, aa: 0.7 } : { "両目見開き": 1, oh: 0.4 });
      return { pose: p, yaw: sh.pose === "reach" ? 0.15 : 0, mood };
    }
    if (sh.type === "faceFlash") return { pose: addPose(POSES.stand, { head: [0.25, 0.15, 0.1], neck: [0.1, 0, 0] }), yaw: 0, mood: { "瞳小": 1, "両目見開き": 0.8, oh: 0.5 } };
    if (sh.type === "prop" && sh.prop === "duo") {
      const p = addPose(POSES.stand, { head: [-0.25, 0, 0], neck: [-0.1, 0, 0], spine: [-0.06, 0, 0] });
      return { pose: p, yaw: (k === "rei") !== !!sh.flip ? -Math.PI / 2 : Math.PI / 2, mood: { blink: 0.4 }, x: ((k === "rei") !== !!sh.flip ? 1 : -1) * 0.12 };
    }
    if (sh.type === "prop" && (sh.prop === "window" || sh.prop === "stars")) return { pose: POSES.sit, yaw: 0.3, mood: { "瞳ハイライト消": 1, sad: 0.5 } };
    if (sh.type === "prop" && sh.prop === "eye") return { pose: addPose(POSES.stand, { head: [0.3, 0, 0] }), yaw: 0, mood: {} };
    return { pose: POSES.stand, yaw: 0, mood: {} };
  }
  function whoIn(sh) {
    if (sh.type === "card") return [sh.card.who];
    if (sh.type === "verse" || sh.type === "credit") return [sh.who];
    if (sh.type === "glow" || sh.type === "close" || sh.type === "faceFlash") return ["rei"];
    if (sh.type === "prop" && sh.prop === "duo") return ["rei", "cc"];
    if (sh.type === "prop" && ["window", "stars", "eye"].includes(sh.prop)) return ["rei"];
    return [];
  }
  function simulate(sh, t, step = true) {
    const ks = whoIn(sh);
    show(...ks);
    for (const k of ks) {
      const a = actors[k], P = perform(sh, k, Math.max(t, sh.t0));
      applyPose(a.vrm, P.pose);
      a.holder.position.set(P.x || 0, 0, 0); a.holder.rotation.set(0, P.yaw || 0, 0);
      placeOnFloor(a);
      face(a, t, P.mood);
      if (step) k === "cc" ? a.b.update(dt, t, { glitch: false }) : a.b.update(dt, t);
    }
    return ks;
  }
  function resetSprings() {
    for (const a of Object.values(actors)) { a.vrm.springBoneManager?.reset(); a.b.hairVrm?.springBoneManager?.reset(); }
  }
  let curShot = -1, lastFrame = -999;
  function prepare(i, frame) {
    const sh = SHOTS[i];
    simulate(sh, sh.t0, false);
    resetSprings();
    const f0 = Math.round(sh.t0 * fps) - 24;
    for (let f = f0; f < frame; f++) simulate(sh, Math.max(f / fps, sh.t0 - 0.0001));
    curShot = i;
  }

  // ---------- shot renderers ----------
  const R = {};
  const CARD_LAYOUT = { rei: { char: [96, 606], text: [714, 1146], inner: "right" }, cc: { text: [124, 556], char: [684, 1194], inner: "left" } };
  function slide(sh, t) {
    const a = clamp((t - sh.t0) / 0.22), b = sh.tEnd > sh.t1 ? clamp((t - sh.t1) / Math.min(0.25, sh.tEnd - sh.t1)) : 0;
    return { dx: (1 - easeOut(a)) * 240 - easeIn(b) * 240, alpha: easeOut(a) * (1 - b) };
  }
  function fullBody(k, camDist = 4.5) {
    const a = actors[k];
    cam.fov = 28; cam.position.set(0, 1.0, camDist); cam.lookAt(0, 0.86, 0);
    lookTarget.position.copy(cam.position);
    return a;
  }
  function charPanel(k, x0, x1, t, o = {}) {
    fullBody(k);
    render3D(scene, cam, { x: x0, y: 0, w: x1 - x0, h: H }, o);
  }
  R.card = (sh, t, S) => {
    const c = sh.card, who = c.who, L = CARD_LAYOUT[who], P = WHO[who], beat = tl.beatF(t);
    const { dx, alpha } = slide(sh, t);
    g.globalAlpha = alpha;
    const [cx0, cx1] = L.char.map((x) => x + dx), [tx0, tx1] = L.text.map((x) => x + dx);
    D.ringPanel(g, cx0, cx1, who, t, beat, { special: c.special, sparkle: c.ch > 1 });
    const corrupt = who === "cc" && c.ch > 1;
    charPanel(who, cx0, cx1, t, { pixel: corrupt ? (hash1(Math.floor(t * 8)) > 0.8 ? 7 : 4) : 1, bloom: who === "rei" && c.ch > 1 ? 0.45 : 0, alpha, outline: corrupt ? 1.2 : 1.7 });
    if (corrupt) sliceGlitch(cx0, 0, cx1 - cx0, H, Math.floor(t * 12), 0.35);
    D.ringOverlay(g, cx0, cx1, who, (t - sh.t0) / (sh.t1 - sh.t0), L.inner);
    D.panel(g, tx0, tx1);
    D.pieIcon(g, (tx0 + tx1) / 2, 100, 24, beat, c.special ? YELLOW : "#ffffff");
    D.lyricCard(g, tx0, tx1, who, c.lines, t, { dim: c.dim });
    const [wa, wb] = who === "rei" ? [cx1, tx0] : [tx1, cx0];
    D.waveform(g, wa, wb, 360, tl.loud(who, t), P.text, t);
    g.globalAlpha = 1;
    S.post.ca = c.ch > 1 ? 0.003 : 0.0015; S.post.glow = c.ch > 1 ? 0.9 : 0.5;
  };
  R.glow = (sh, t, S) => {
    const local = t - sh.t0, beat = tl.beatF(t);
    const blur = sh.intro ? 5 : 14 * (1 - easeOut(local / 0.7));
    D.ringPanel(g, 96, 606, "rei", t, beat, { sparkle: !sh.intro });
    fullBody("rei");
    let restore = null;
    if (sh.intro) restore = silhouette(actors.rei.b.root, hex(REI.deep));
    render3D(scene, cam, { x: 96, y: 0, w: 510, h: H }, { blur, bloom: 0.6 });
    if (restore) restore();
    g.save(); if (blur > 0.5) g.filter = `blur(${blur * 0.4}px)`;
    D.panel(g, 714, 1146); D.pieIcon(g, 930, 100, 24, beat, "#fff", true);
    D.lyricCard(g, 714, 1146, "rei", sh.lines, t, { glow: true });
    g.restore();
    D.waveform(g, 606, 714, 360, tl.loud("rei", t), REI.text, t);
    S.post.glow = 1.3; S.post.ca = 0.003;
  };
  R.title = (sh, t) => { D.title(g, sh, t); };
  R.verse = (sh, t, S) => {
    const local = t - sh.t0, bar = Math.floor(tl.barF(t)) - Math.floor(tl.barF(sh.t0));
    const cc = sh.who === "cc";
    const [cx0, cx1] = cc ? [684, 1194] : [86, 594], [hx0, hx1] = cc ? [124, 556] : [724, 1156];
    D.verseBg(g, cx0, cx1, sh.who, t, bar, local);
    D.verseFloor(g, cx0, cx1, sh.who);
    cam.fov = 30; cam.position.set(cc ? -0.25 : 0.25, 0.86, 2.25); cam.lookAt(0, 0.5, 0);
    lookTarget.position.copy(cam.position);
    render3D(scene, cam, { x: cx0, y: 0, w: cx1 - cx0, h: H }, { outline: 2.0 });
    D.chatPanel(g, hx0, hx1, sh.who, sh.bubbles, t, cc ? "right" : "left");
    S.post.glow = 0.4;
  };
  R.faceFlash = (sh, t, S) => {
    const local = t - sh.t0;
    const grd = g.createLinearGradient(0, 0, 0, H); grd.addColorStop(0, CC.text); grd.addColorStop(1, CC.main);
    g.fillStyle = grd; g.fillRect(320, 0, 640, H);
    for (let i = 0; i < 5; i++) { g.fillStyle = rgba(CC.deep, 0.9); g.beginPath(); g.arc(320 + hash1(i) * 640, 600 + hash1(i * 3) * 160, 90 + hash1(i * 7) * 80, 0, Math.PI * 2); g.fill(); }
    const a = actors.rei, head = a.H.getRawBoneNode("head").getWorldPosition(new THREE.Vector3());
    cam.fov = 26; cam.position.set(head.x + 0.05, head.y - 0.12, head.z + 0.75); cam.lookAt(head.x, head.y + 0.02, head.z);
    lookTarget.position.copy(cam.position);
    render3D(scene, cam, { x: 320, y: 0, w: 640, h: H }, { outline: 3.2, zoom: 1 });
    sliceGlitch(320, 0, 640, H, Math.floor(local * 20), 0.5);
    S.post.glitch = 0.35 + 0.3 * (Math.floor(local * 15) % 2); S.post.ca = 0.008;
  };
  R.ready = (sh, t) => D.readyScreen(g, t, t - sh.t0);
  R.link = (sh, t) => D.linkLine(g, (t - sh.t0) / (sh.t1 - sh.t0), sh.to);
  R.close = (sh, t, S) => {
    const local = t - sh.t0, reach = sh.pose === "reach";
    const x0 = 44, x1 = 600;
    g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, H); g.clip();
    g.fillStyle = REI.night; g.fillRect(x0, 0, x1 - x0, H);
    if (reach) {
      const grd = g.createRadialGradient(320, 260, 20, 320, 260, 420); grd.addColorStop(0, rgba(CC.text, 0.55)); grd.addColorStop(1, rgba(CC.main, 0));
      g.fillStyle = grd; g.fillRect(x0, 0, x1 - x0, H);
      for (let i = 0; i < 18; i++) { g.fillStyle = rgba("#ffffff", 0.06); g.fillRect(x0, ((i * 41 + local * 30) % H), x1 - x0, 2); }
    } else {
      for (let i = 0; i < 7; i++) { // Corrupt-Chan's colour splashing into Rei's panel
        const bx = x0 + hash1(i * 2.1) * 560, by = hash1(i * 5.3) * 400, r = 60 + hash1(i * 8.1) * 90 + Math.sin(local * 4 + i) * 10;
        g.fillStyle = rgba(i % 2 ? CC.text : CC.main, 0.85); g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
      }
      if (local > 4.5) D.checker(g, x0 + 40, 300 + (local - 4.5) * 40, 120, 60, 10);
    }
    g.restore();
    const a = actors.rei, head = a.H.getRawBoneNode("head").getWorldPosition(new THREE.Vector3());
    if (reach) { cam.fov = 24; cam.position.set(head.x - 0.12, head.y - 0.02, head.z + 1.05 - local * 0.03); cam.lookAt(head.x - 0.05, head.y - 0.07, head.z); }
    else { cam.fov = 26; cam.position.set(head.x, head.y - 0.35, head.z + 1.9); cam.lookAt(head.x, head.y - 0.35, head.z); }
    lookTarget.position.copy(cam.position);
    goggles.visible = true; goggles.userData.draw(t);
    render3D(scene, cam, { x: x0, y: 0, w: x1 - x0, h: H }, { outline: reach ? 2.8 : 2.2 });
    goggles.visible = false;
    // the list she types
    D.panel(g, 722, 1158);
    g.textAlign = "left"; g.textBaseline = "middle";
    LIST.forEach(([ta, tb, text, colour], i) => {
      const y = 132 + i * 54;
      g.strokeStyle = "#3a3484"; g.lineWidth = 2; g.beginPath(); g.moveTo(742, y + 22); g.lineTo(1138, y + 22); g.stroke();
      if (ta === null || t < ta) return;
      const n = Math.ceil(text.length * clamp((t - ta) / Math.max(0.1, tb - ta)));
      g.font = `700 25px ${D.ROUND}`; g.fillStyle = colour ? REI.light : "#ffffff";
      g.fillText(text.slice(0, n), 748, y);
    });
    S.post.scan = 0.12; S.post.ca = 0.003; S.post.glow = 0.7;
  };
  R.static = (sh, t, S) => { D.monitorFrame(g, 280, 1000); D.staticNoise(g, 280, 1000, t - sh.t0); S.post.glitch = 0.5; S.post.scan = 0.2; };

  // CRT monitor shots
  const PROP_KEYS = Object.keys(props);
  function showProp(...ks) { for (const k of PROP_KEYS) props[k].visible = ks.includes(k); }
  R.prop = (sh, t, S) => {
    const local = t - sh.t0, f12 = Math.floor(t * 12);
    const jx = (hash2(f12, 1) - 0.5) * 5, jy = (hash2(f12, 2) - 0.5) * 3;
    g.save(); g.translate(jx, jy);
    const x0 = 280, x1 = 1000, rect = { x: x0, y: 0, w: x1 - x0, h: H };
    D.monitorFrame(g, x0, x1, sh.mono ? "#18171c" : "#1b1826");
    const camProp = (dist, y = 0, look = 0) => { cam.fov = 32; cam.position.set(Math.sin(local * 0.3) * 0.25, y + 0.25, dist); cam.lookAt(0, look, 0); };
    switch (sh.prop) {
      case "tv": case "tvHand": case "tvRed": {
        const red = sh.prop === "tvRed", tv = red ? props.tvRed : props.tv;
        D.stageFloor(g, x0, x1, red ? "#3a0a0e" : "#e9e4ff");
        const hand = red ? props.handRed : props.hand;
        showProp(red ? "tvRed" : "tv", ...(sh.prop !== "tv" ? [red ? "handRed" : "hand"] : []));
        tv.position.set(0, -0.15 + Math.sin(local * 2) * 0.02, 0); tv.rotation.set(0.05, -0.18 + Math.sin(local * 0.7) * 0.05, 0);
        tv.userData.drawScreen(t, sh.prop === "tv" ? "bars" : "off");
        if (sh.prop !== "tv") {
          const ext = red ? 0.42 + 0.08 * Math.sin(local * 5) : 0.25 + 0.75 * easeOut(local / 1.6);
          hand.position.set(-0.06 + Math.sin(local * 3) * 0.03, -0.12, 0.35 + ext); hand.rotation.set(-0.35 + Math.sin(local * 4) * 0.08, -0.18, Math.sin(local * 2.5) * 0.1);
          hand.position.applyEuler(tv.rotation); hand.position.add(tv.position);
        }
        camProp(5.1, 0.1, 0.2);
        render3D(propScene, cam, rect, { outline: 2.0 });
        break;
      }
      case "sticks": {
        showProp("sticks");
        props.sticks.rotation.set(0.2, local * 0.6, Math.sin(local * 1.5) * 0.08);
        camProp(4.6);
        render3D(propScene, cam, rect, { outline: 2.2, bloom: 0.3 });
        S.post.glow = 0.4;
        break;
      }
      case "phones": {
        showProp("phones");
        props.phones.rotation.set(Math.sin(local * 0.9) * 0.08, Math.sin(local * 0.6) * 0.2, 0);
        props.phones.userData.parts.fp.position.y = -0.35 + Math.sin(local * 2.2) * 0.04;
        camProp(6.0);
        render3D(propScene, cam, rect, { outline: 2.0 });
        break;
      }
      case "cup": case "calendar": case "boxbird": {
        g.fillStyle = "#3a3842"; g.beginPath(); g.moveTo(x0, H * 0.62); g.lineTo(x1, H * 0.55); g.lineTo(x1, H); g.lineTo(x0, H); g.closePath(); g.fill();
        g.fillStyle = "rgba(0,0,0,0.45)"; g.beginPath(); g.ellipse(640, H * 0.74, 190, 40, 0, 0, Math.PI * 2); g.fill();
        showProp(sh.prop);
        const p = props[sh.prop];
        p.position.set(0, sh.prop === "boxbird" ? 0.38 + Math.abs(Math.sin(local * 4)) * 0.05 : 0, 0);
        if (sh.prop === "cup") p.rotation.set(0.15, -0.5 + local * 0.08, 0);
        if (sh.prop === "boxbird") { p.rotation.set(0.15, -0.6 + Math.sin(local) * 0.15, 0); p.userData.lid.rotation.x = -0.45 - Math.abs(Math.sin(local * 5)) * 0.25; }
        if (sh.prop === "calendar") { p.userData.flip = local; }
        if (sh.prop === "boxbird") camProp(5.4, 0.2, -0.05); else camProp(4.0, 0.3, 0.0);
        render3D(propScene, cam, rect, { outline: 2.0 });
        break;
      }
      case "dots": D.dotsBox(g, 640, 300, local, !!sh.drip); break;
      case "rays": D.rays(g, x0, x1, local); break;
      case "eye": {
        D.colorEye(g, 640, 250, local);
        cam.fov = 28; cam.position.set(0, 0.9, 6.5); cam.lookAt(0, 1.6, 0);
        const restore = silhouette(actors.rei.b.root, 0x2a2733);
        render3D(scene, cam, rect, {});
        restore();
        break;
      }
      case "duo": {
        g.fillStyle = "rgba(230,226,255,0.08)"; g.beginPath(); g.moveTo(x0, H); g.lineTo(x0 + 260, H * 0.55); g.lineTo(x0 + 420, H * 0.55); g.lineTo(x0 + 200, H); g.fill();
        cam.fov = 30; cam.position.set(0, 1.25, 2.0); cam.lookAt(0, 1.2, 0);
        const r1 = silhouette(actors.rei.b.root, 0xfff1df), r2 = silhouette(actors.cc.b.root, hex(CC.sil));
        render3D(scene, cam, rect, { bloom: 0.5 });
        r1(); r2();
        break;
      }
      case "window": {
        D.crackedWall(g, x0, x1, local, local > 1.4);
        g.fillStyle = "#26222c"; g.fillRect(420, 110, 330, 520);
        g.strokeStyle = "#0e0c12"; g.lineWidth = 10; g.strokeRect(420, 110, 330, 520);
        g.fillStyle = "#0b0a0e"; g.fillRect(780, 140, 170, 480); g.strokeRect(780, 140, 170, 480);
        cam.fov = 30; cam.position.set(0.3, 0.75, 2.6); cam.lookAt(0, 0.5, 0);
        lookTarget.position.copy(cam.position);
        render3D(scene, cam, { x: 420, y: 110, w: 330, h: 520 }, { outline: 1.8, clip: { x: 425, y: 115, w: 320, h: 510 } });
        break;
      }
      case "stars": {
        D.starfield(g, x0, x1, local, 0.6 + local * 0.9);
        const s = 0.35 + easeIn(local / 3) * 0.9, w = 330 * s, h = 520 * s;
        g.strokeStyle = CC.light; g.lineWidth = 8 * s; g.fillStyle = "#2a1a40";
        g.fillRect(640 - w / 2, 360 - h / 2, w, h); g.strokeRect(640 - w / 2, 360 - h / 2, w, h);
        cam.fov = 30; cam.position.set(0.3, 0.75, 2.6); cam.lookAt(0, 0.5, 0);
        render3D(scene, cam, { x: 640 - w / 2, y: 360 - h / 2, w, h }, { outline: 1.4 * s, clip: { x: 640 - w / 2, y: 360 - h / 2, w, h } });
        break;
      }
    }
    g.restore();
    S.post.scan = 0.18; S.post.ca = 0.004; S.post.glow = 0.8; S.post.grain = 0.05;
    if (sh.mono) { S.post.sat = 0; S.post.keepRed = 1; }
  };
  R.heart = (sh, t, S) => {
    const prev = SHOTS[sh.index - 1];
    if (prev && prev.card) { const L = CARD_LAYOUT.cc; D.panel(g, L.text[0], L.text[1]); D.pieIcon(g, (L.text[0] + L.text[1]) / 2, 100, 24, tl.beatF(t), "#fff"); D.lyricCard(g, L.text[0], L.text[1], "cc", prev.card.lines, t, { dim: prev.card.dim }); }
    D.pixelHeart(g, 684, 1194, sh.who, t - sh.t0);
    S.post.glitch = (t - sh.t0) < 0.15 ? 0.4 : 0;
  };
  R.heartGlitch = (sh, t, S) => { D.heartGlitch(g, t - sh.t0); S.post.glitch = 0.4; S.post.ca = 0.006; };
  R.code = (sh, t, S) => { D.codeScreen(g, t - sh.t0); S.post.scan = 0.15; S.post.glitch = hash1(Math.floor(t * 10)) > 0.8 ? 0.3 : 0; };
  R.hello = (sh, t) => D.helloScreen(g, t - sh.t0);
  R.credit = (sh, t, S) => {
    const local = t - sh.t0, rei = sh.who === "rei", [x0, x1] = rei ? [80, 700] : [580, 1200];
    const a = clamp(local / 0.25) * clamp((sh.t1 - sh.t0 - local) / 0.2);
    cam.fov = 28; cam.position.set(0, 1.0, 4.3); cam.lookAt(0, 0.92, 0);
    const restore = silhouette(actors[sh.who].b.root, hex(WHO[sh.who].sil));
    render3D(scene, cam, { x: x0, y: 0, w: x1 - x0, h: H }, { alpha: a });
    restore();
    D.creditText(g, sh, local, rei ? "right" : "left");
    S.post.glow = 0.3;
  };
  R.end = (sh, t) => D.endLogo(g, t - sh.t0);
  R.black = () => {};

  // ---------- frame ----------
  function renderFrame(frame) {
    const t = frame / fps;
    const i = shotAt(t), sh = SHOTS[i];
    if (i !== curShot || frame !== lastFrame + 1) prepare(i, frame);
    lastFrame = frame;
    simulate(sh, t);
    const S = { post: { glow: 0.5, ca: 0.0015, scan: 0.06, grain: 0.03, vig: 0.3, glitch: 0, flash: 0, fade: 0, sat: 1, keepRed: 0 } };
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = "none";
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    (R[sh.type] || R.black)(sh, t, S);
    for (const [a, b, text] of SUBS) if (t >= a && t < b) D.subtitle(g, text, 640, 688, clamp((t - a) / 0.08) * clamp((b - t) / 0.08));
    // a beat of glitch on every cut
    if (t - sh.t0 < 0.06 && sh.type !== "black") S.post.glitch = Math.max(S.post.glitch, 0.25);
    post.draw(S.post, t, frame);
    return sh;
  }

  // debug: one shot type at a time without the timeline
  return {
    tl, frames: N, fps, duration: N / fps, renderFrame,
    shots: SHOTS.map((s) => ({ t0: s.t0, type: s.type })),
    capture(type = "image/jpeg", q = 0.92) { return out.domElement.toDataURL(type, q); },
  };
}
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

// goggles with two heartbeat screens, worn on Rei's forehead in the second verse
function buildGoggles(reiB) {
  const head = reiB.humanoid.getRawBoneNode("head");
  const grp = new THREE.Group(); grp.visible = false; head.add(grp);
  const c = document.createElement("canvas"); c.width = 128; c.height = 72;
  const x = c.getContext("2d"), tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const frame = new THREE.MeshToonMaterial({ color: 0x2a2440 });
  const scr = new THREE.MeshBasicMaterial({ map: tex });
  for (const s of [-1, 1]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.046, 0.03), frame); box.position.set(s * 0.042, 0.105, -0.1); grp.add(box);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.036), scr); p.position.set(s * 0.042, 0.105, -0.1155); p.rotation.y = Math.PI; grp.add(p);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.008, 6, 40, Math.PI), frame); band.position.set(0, 0.105, -0.0); band.rotation.set(Math.PI / 2, 0, Math.PI); grp.add(band);
  addOutlines(grp, { color: 0x170d2c });
  grp.userData.draw = (t) => {
    x.fillStyle = "#1a0a1c"; x.fillRect(0, 0, 128, 72);
    x.strokeStyle = REI.light; x.lineWidth = 5; x.shadowColor = REI.light; x.shadowBlur = 8; x.beginPath();
    const ph = (t * 1.6) % 1;
    for (let i = 0; i <= 64; i++) { const k = i / 64, u = frac(k - ph); const yv = u > 0.45 && u < 0.55 ? (u < 0.5 ? -26 : 22) * Math.sin(((u - 0.45) / 0.1) * Math.PI) : 0; x.lineTo(k * 128, 36 + yv); }
    x.stroke(); x.shadowBlur = 0; tex.needsUpdate = true;
  };
  return grp;
}

function makePost(renderer, comp) {
  const tex = new THREE.CanvasTexture(comp);
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  const u = {
    tComp: { value: tex }, uRes: { value: new THREE.Vector2(W, H) }, uTime: { value: 0 }, uSeed: { value: 0 },
    uGlow: { value: 0.5 }, uCA: { value: 0.0015 }, uScan: { value: 0.06 }, uGrain: { value: 0.03 }, uVig: { value: 0.3 },
    uGlitch: { value: 0 }, uFlash: { value: 0 }, uFade: { value: 0 }, uSat: { value: 1 }, uKeepRed: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, depthTest: false, depthWrite: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform sampler2D tComp; uniform vec2 uRes; uniform float uTime, uSeed, uGlow, uCA, uScan, uGrain, uVig, uGlitch, uFlash, uFade, uSat, uKeepRed;
      varying vec2 vUv;
      float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
      vec3 at(vec2 uv, float lod){ return textureLod(tComp, uv, lod).rgb; }
      void main(){
        vec2 uv = vUv;
        float g = uGlitch;
        float row = floor(uv.y * 38.0);
        if (g > 0.001 && h21(vec2(row, uSeed)) > 1.0 - g*0.5) uv.x += (h21(vec2(row, uSeed + 3.0)) - 0.5) * 0.12 * g;
        vec2 dc = uv - 0.5; float ca = uCA + g*0.01;
        vec3 c = vec3(at(uv + dc*ca*2.0 + vec2(g*0.004,0.0), 0.0).r, at(uv, 0.0).g, at(uv - dc*ca*2.0 - vec2(g*0.004,0.0), 0.0).b);
        vec3 bl = at(uv, 2.5)*0.3 + at(uv, 4.0)*0.4 + at(uv, 5.5)*0.45;
        c += max(bl - 0.45, 0.0) * uGlow * 0.55;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        float red = clamp((c.r - max(c.g, c.b)) * 3.0, 0.0, 1.0) * uKeepRed;
        c = mix(vec3(l), c, max(uSat, red));
        c *= 1.0 - uScan * (0.5 + 0.5*sin(gl_FragCoord.y * 3.14159));
        c += (h21(floor(gl_FragCoord.xy*0.5) + floor(uTime*12.0)*17.0) - 0.5) * uGrain;
        float v = smoothstep(0.9, 0.25, length(dc*vec2(1.0, 0.85)));
        c *= mix(1.0, v, uVig);
        c = mix(c, vec3(1.0), clamp(uFlash, 0.0, 1.0));
        c *= 1.0 - uFade;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(quad);
  const oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the 2D canvas is already display-ready
  return {
    draw(P, t, frame) {
      u.uTime.value = t; u.uSeed.value = frame % 97;
      u.uGlow.value = P.glow; u.uCA.value = P.ca; u.uScan.value = P.scan; u.uGrain.value = P.grain; u.uVig.value = P.vig;
      u.uGlitch.value = P.glitch; u.uFlash.value = P.flash; u.uFade.value = P.fade; u.uSat.value = P.sat; u.uKeepRed.value = P.keepRed;
      tex.needsUpdate = true;
      renderer.render(sc, oc);
    },
  };
}
