// The reanimation: renders frame i deterministically.
//
// It is animated like the hand-drawn original: the performers are "drawings" (each pose rendered
// once, cel-shaded, into a canvas by cels.js) that are swapped about ten times a second on the
// beat and moved in 2D (shifted, dropped on the beat and rebounding, squashed), and the props move
// on the same 10 fps clock. Each frame is composed on a 2D canvas (panels, text, drawn props), then
// a post pass (glow, chromatic aberration, scanlines, grain, glitches, greyscale for the bridge)
// produces the output.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { buildCorruptChan } from "../../assets/signaling/corrupt-chan-3d/cc_build.js";
import { buildRei } from "../rei.js";
import { celShade, addOutlines, outlineUniforms } from "../toon.js";
import { Timeline } from "../timeline.js";
import { POSES, addPose, vary } from "./poses.js";
import { SHOTS, SUBS, LIST, shotAt, ALL_TEXT } from "./shots.js";
import { buildProps, buildPenlight } from "./props.js";
import { createCels, attachPenlights } from "./cels.js";
import * as D from "./draw2d.js";
import { REI, CC, WHO, BG, YELLOW, hex, rgba } from "./palette.js";
import { clamp, easeOut, easeIn, hash1, hash2, frac } from "../util.js";

const W = 1280, H = 720;
const CC_DIR = "./assets/signaling/corrupt-chan-3d/";
const T10 = (t) => Math.floor(t * 10 + 1e-6) / 10; // the drawing clock: ten drawings a second

export async function createReanim({ container = document.body } = {}) {
  const A = await (await fetch("./build/analysis.json")).json();
  const tl = new Timeline(A);
  const fps = tl.fps;
  const N = Math.round(179.7 * fps);
  await D.loadFonts(ALL_TEXT());

  // ---------- canvases ----------
  const gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  gl.setPixelRatio(1); gl.setSize(W, H); gl.setClearColor(0x000000, 0);
  const comp = document.createElement("canvas"); comp.width = W; comp.height = H;
  const g = comp.getContext("2d");
  const tmp = document.createElement("canvas"); const tg = tmp.getContext("2d");
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
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const actors = {};
  for (const [k, b] of [["rei", reiB], ["cc", ccB]]) {
    celShade(b.root); addOutlines(b.root);
    b.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    const holder = new THREE.Group(); holder.add(b.root); scene.add(holder);
    const Hn = b.vrm.humanoid;
    b.root.updateMatrixWorld(true);
    actors[k] = { key: k, b, vrm: b.vrm, holder, H: Hn, footY: Hn.getRawBoneNode("leftFoot").getWorldPosition(new THREE.Vector3()).y };
  }
  actors.rei.sticks = attachPenlights(reiB, hex(REI.light), ["left", "right"]);
  actors.cc.sticks = attachPenlights(ccB, hex(CC.text), ["right"]);
  for (const a of Object.values(actors)) for (const p of a.sticks) p.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const goggles = buildGoggles(reiB);
  // faces: no lip sync (the original has none); each drawing holds its expression and mouth
  function faceFn(a, mood) {
    const em = a.vrm.expressionManager; if (!em) return;
    for (const e of em.expressions) if (!e.expressionName.startsWith("look")) em.setValue(e.expressionName, 0);
    for (const [n, w] of Object.entries(mood)) if (em.getExpression(n)) em.setValue(n, w);
    goggles.visible = !!mood.goggles;
    if (mood.goggles) goggles.userData.draw(mood.ecg || 0);
  }
  const cels = createCels({ gl, H, actors, scene, faceFn });
  const C = (spec) => cels.cel(spec);

  // ---------- props ----------
  const props = buildProps();
  const propScene = new THREE.Scene();
  propScene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const pkey = new THREE.DirectionalLight(0xffffff, 2.0); pkey.position.set(-2, 3, 4); propScene.add(pkey);
  for (const p of Object.values(props)) propScene.add(p);
  // the glowstick shot: two big penlights, Rei's and Corrupt-Chan's
  const bigSticks = new THREE.Group(); bigSticks.visible = false; propScene.add(bigSticks);
  const stickR = buildPenlight(hex(REI.light), { scale: 7 }), stickC = buildPenlight(hex(CC.text), { scale: 7 });
  stickR.position.set(-0.32, -0.5, 0); stickR.rotation.z = 0.6; stickC.position.set(0.32, -0.5, 0); stickC.rotation.z = 0.6;
  bigSticks.add(stickR, stickC);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);

  function render3D(sc, camera, rect, o = {}) {
    camera.aspect = rect.w / rect.h; camera.updateProjectionMatrix();
    outlineUniforms.uRes.value.set(rect.w, rect.h);
    outlineUniforms.uOutlinePx.value = o.outline ?? 1.8;
    gl.setScissorTest(true); gl.setViewport(0, H - rect.h, rect.w, rect.h); gl.setScissor(0, H - rect.h, rect.w, rect.h);
    gl.clear(true, true, true); gl.render(sc, camera); gl.setScissorTest(false);
    g.drawImage(gl.domElement, 0, 0, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
    if (o.bloom) {
      g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = o.bloom; g.filter = "blur(10px)";
      g.drawImage(gl.domElement, 0, 0, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h); g.restore();
    }
  }
  // draw a drawing into a box (x, y, w, h), transformed about its bottom centre
  function blit(c, x, y, w, h, o = {}) {
    g.save();
    if (o.clip) { g.beginPath(); o.clip(g); g.clip(); }
    g.translate(x + w / 2 + (o.dx || 0), y + h + (o.dy || 0));
    g.rotate(o.rot || 0);
    g.scale(o.sx || 1, o.sy || 1);
    g.globalAlpha = o.alpha ?? 1;
    if (o.filter) g.filter = o.filter;
    let src = c.img;
    if (o.pixel > 1) { // Corrupt-Chan's corruption: rendered coarse, scaled up without smoothing
      tmp.width = Math.ceil(w / o.pixel); tmp.height = Math.ceil(h / o.pixel);
      tg.imageSmoothingEnabled = true; tg.clearRect(0, 0, tmp.width, tmp.height); tg.drawImage(c.img, 0, 0, tmp.width, tmp.height);
      g.imageSmoothingEnabled = false; src = tmp;
    }
    g.drawImage(src, -w / 2, -h, w, h);
    g.imageSmoothingEnabled = true; g.filter = "none";
    if (c.glow && o.glow !== 0) { g.globalCompositeOperation = "lighter"; g.globalAlpha = (o.alpha ?? 1) * (o.glow ?? 1); g.drawImage(c.glow, -w / 2, -h, w, h); }
    if (o.bloom) { g.globalCompositeOperation = "lighter"; g.globalAlpha = (o.alpha ?? 1) * o.bloom; g.filter = "blur(12px)"; g.drawImage(c.img, -w / 2, -h, w, h); }
    g.restore();
  }
  function sliceGlitch(x, y, w, h, seed, amount) {
    for (let i = 0; i < 7; i++) {
      if (hash2(i, seed) > amount) continue;
      const sy = y + hash2(i + 3, seed) * h, sh = 6 + hash2(i + 7, seed) * 40, dx = (hash2(i + 11, seed) - 0.5) * 70;
      g.drawImage(comp, x, sy, w, sh, x + dx, sy, w, sh);
    }
  }
  // 2D motion of the drawing on slot `sub` (0..3) of beat `bi`: shifted around, dropped on the
  // beat, rebounding after it, a little squash and tilt (all stepped with the drawings)
  function wobble(bi, sub, amt = 1) {
    const h = (n) => hash2(bi * 7 + sub * 3, n);
    const drop = sub === 0 ? 1 : sub === 1 ? -0.6 : 0;
    return { dx: (h(1) - 0.5) * 30 * amt, dy: drop * 10 * amt, sy: 1 - drop * 0.03 * amt, sx: 1 + drop * 0.02 * amt, rot: (h(2) - 0.5) * 0.045 * amt };
  }

  // ---------- chorus drawings ----------
  const CYCLE = { rei: ["R_V", "R_spread", "R_lean", "R_spread2"], cc: ["C_up", "C_spread", "C_spreadHi", "C_spreadLo"] };
  const CHORUS_CAM = [28, 0, 1.02, 3.75, 0, 0.9, 0];
  function chorusDrawing(who, t, card, extra = {}) {
    const tq = T10(t), beat = tl.beatF(tq + 1e-4), bi = Math.floor(beat), sub = Math.floor((beat - bi) * 4) & 3;
    const shout = card && card.lines.some(([lt, , k]) => k === "W" && tq >= lt && tq < lt + 0.8);
    const name = shout ? (who === "rei" ? "R_shout" : "C_shout") : CYCLE[who][((bi % 4) + 4) % 4];
    const v = sub >= 2 ? 1 + (((bi % 3) + 3) % 3) : 0;
    let mood = who === "rei" ? (v ? { happy: 0.3, oh: 0.45 } : { happy: 0.3, aa: 0.65 }) : (v ? { relaxed: 0.25, oh: 0.4 } : { relaxed: 0.3, aa: 0.55 });
    if (card?.dim && who === "cc") mood = { sad: 0.6, blink: 0.3, oh: 0.15 };
    else if (card?.special && who === "cc") mood = { sad: 0.5, oh: v ? 0.2 : 0.35 };
    if (shout) mood = who === "rei" ? { "＞＜": 1, aa: 1 } : { Extra: 1, aa: 1 };
    if (extra.mood) mood = extra.mood;
    const c = C({ who, pose: vary(POSES[name], v), mood, yaw: who === "rei" ? 0.22 : -0.22, cam: CHORUS_CAM, w: 510, h: 720, sticks: true });
    return { c, bi, sub };
  }

  // ---------- shot renderers ----------
  const R = {};
  const CARD_LAYOUT = { rei: { char: [96, 606], text: [714, 1146], inner: "right" }, cc: { text: [124, 556], char: [684, 1194], inner: "left" } };
  function slide(sh, t) {
    const a = clamp((t - sh.t0) / 0.22), b = sh.tEnd > sh.t1 ? clamp((t - sh.t1) / Math.min(0.25, sh.tEnd - sh.t1)) : 0;
    return { dx: (1 - easeOut(a)) * 240 - easeIn(b) * 240, alpha: easeOut(a) * (1 - b) };
  }
  R.card = (sh, t, S) => {
    const c = sh.card, who = c.who, L = CARD_LAYOUT[who], P = WHO[who], beat = tl.beatF(t);
    const { dx, alpha } = slide(sh, t);
    g.globalAlpha = alpha;
    const [cx0, cx1] = L.char.map((x) => x + dx), [tx0, tx1] = L.text.map((x) => x + dx);
    D.ringPanel(g, cx0, cx1, who, t, beat, { special: c.special, sparkle: c.ch > 1 });
    const corrupt = who === "cc" && c.ch > 1;
    const { c: dr, bi, sub } = chorusDrawing(who, t, c);
    g.save(); g.beginPath(); g.rect(cx0, 0, cx1 - cx0, H); g.clip();
    blit(dr, cx0, 0, cx1 - cx0, H, { ...wobble(bi, sub), alpha, pixel: corrupt ? (hash1(Math.floor(T10(t) * 10)) > 0.8 ? 7 : 4) : 1, bloom: who === "rei" && c.ch > 1 ? 0.35 : 0 });
    g.restore();
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
    const { c: dr, bi, sub } = sh.intro
      ? { c: C({ who: "rei", pose: POSES.R_V, mood: {}, yaw: 0.22, cam: CHORUS_CAM, w: 510, h: 720, mode: "flat", fill: hex(REI.deep) }), bi: 0, sub: 2 }
      : chorusDrawing("rei", t, null, { mood: { happy: 0.4, aa: 0.6 } });
    g.save(); g.beginPath(); g.rect(96, 0, 510, H); g.clip();
    blit(dr, 96, 0, 510, H, { ...wobble(bi, sub, sh.intro ? 0.4 : 1), filter: blur > 0.5 ? `blur(${blur}px)` : null, bloom: 0.5 });
    g.restore();
    g.save(); if (blur > 0.5) g.filter = `blur(${blur * 0.4}px)`;
    D.panel(g, 714, 1146); D.pieIcon(g, 930, 100, 24, beat, "#fff", true);
    D.lyricCard(g, 714, 1146, "rei", sh.lines, t, { glow: true });
    g.restore();
    D.waveform(g, 606, 714, 360, tl.loud("rei", t), REI.text, t);
    S.post.glow = 1.3; S.post.ca = 0.003;
  };
  R.title = (sh, t) => { D.title(g, sh, t); };

  // ---- verses: the sitting girl as a dark silhouette with rim lines, a hard diagonal of light,
  // glowing eyes, and a picture flashing up behind her on each line ----
  const MOTIFS = {
    cc: [[5.7, 6.45, "lit"], [7.15, 7.75, "gears"], [7.75, 8.5, "drips"], [8.55, 9.2, "spikes"], [10.35, 11.0, "bars"], [11.05, 11.75, "other"]],
    rei: [[12.85, 13.45, "sun"], [13.45, 14.1, "moon"], [14.1, 14.75, "clouds"], [15.35, 16.1, "other"], [16.7, 17.3, "gears"], [17.6, 99, "cracks"]],
  };
  function verseDrawings(who) {
    const P = WHO[who], cc = who === "cc";
    const base = { who, pose: cc ? POSES.sit : POSES.sitUp, yaw: cc ? -0.42 : 0.42, cam: [30, cc ? -0.25 : 0.25, 0.86, 2.25, 0, 0.5, 0], w: 508, h: 720, outline: 2.0 };
    return {
      dark: C({ ...base, mood: {}, mode: "dark", fill: hex(P.night), line: hex(cc ? P.text : P.light) }),
      lit: C({ ...base, mood: cc ? { sad: 0.35, blink: 0.25 } : { "困る": 0.6, blink: 0.15 } }),
    };
  }
  // the other girl, as a big flat silhouette in this verse's colour
  function otherSilhouette(who, col) {
    const other = who === "cc" ? "rei" : "cc";
    return C({ who: other, pose: POSES[other === "cc" ? "C_spread" : "R_V"], mood: {}, yaw: 0, cam: [30, 0, 1.25, 2.6, 0, 1.25, 0], w: 508, h: 720, mode: "flat", fill: hex(col) });
  }
  function drawVerse(who, x0, x1, t, extra = {}) {
    const P = WHO[who], cc = who === "cc", w = x1 - x0, local = t - (cc ? 5.7 : 12.85), tq = T10(t);
    const m = MOTIFS[who].find(([a, b]) => tq >= a && tq < b);
    g.save(); g.beginPath(); g.rect(x0, 0, w, H); g.clip();
    g.fillStyle = extra.bg || P.night; g.fillRect(x0, 0, w, H);
    if (m && m[2] === "other") { const o = otherSilhouette(who, cc ? P.text : P.light); blit(o, x0, -360, w, H, { dy: Math.sin(tq * 6) * 6 }); }
    else if (m && !["lit", "drips"].includes(m[2])) D.motif(g, m[2], x0, x1, who, tq - m[0]);
    D.verseFloor(g, x0, x1, who);
    const { dark, lit } = verseDrawings(who);
    const zoom = extra.zoom || 1, bob = Math.floor(tq * 2.5) % 2 ? -2 : 0;
    const box = { x: x0 - (w * (zoom - 1)) / 2, y: -H * (zoom - 1) * 0.55, w: w * zoom, h: H * zoom };
    if (m && m[2] === "lit") blit(lit, box.x, box.y, box.w, box.h, { dy: bob, bloom: 0.25 });
    else {
      blit(dark, box.x, box.y, box.w, box.h, { dy: bob, bloom: extra.glowLines || 0 });
      // the light: everything below/right of a diagonal from the top right to the bottom left
      // the light: below/right of a diagonal through the face, top right to bottom left
      const [ax, ay, bx, by] = cc ? [0.85, 0.05, 0.05, 0.8] : [0.9, 0.08, 0.05, 0.85];
      const diag = (gg) => { gg.moveTo(x0 + w * ax, H * ay); gg.lineTo(x1 + 60, H * ay); gg.lineTo(x1 + 60, H + 10); gg.lineTo(x0 - 60, H + 10); gg.lineTo(x0 - 60, H * by); gg.lineTo(x0 + w * bx, H * by); gg.closePath(); };
      blit(lit, box.x, box.y, box.w, box.h, { dy: bob, clip: diag });
      const eyes = dark.eyes.map(([ex, ey]) => [box.x + (ex / dark.w) * box.w, box.y + (ey / dark.h) * box.h + bob]);
      D.glowEyes(g, eyes, cc ? P.text : P.light, 6 * zoom);
      if (m && m[2] === "drips") D.drips(g, x0 + w * 0.45, 230, tq - m[0], P.text);
    }
    if (m && m[2] === "cracks") D.motif(g, "cracks", x0, x1, who, tq - m[0]);
    g.restore();
  }
  R.verse = (sh, t, S) => {
    const cc = sh.who === "cc";
    const [cx0, cx1] = cc ? [684, 1192] : [86, 594], [hx0, hx1] = cc ? [124, 556] : [724, 1156];
    drawVerse(sh.who, cx0, cx1, t, { glowLines: !cc && t > 17.4 ? 0.4 : 0 });
    D.chatPanel(g, hx0, hx1, sh.who, sh.bubbles, t, cc ? "right" : "left");
    S.post.glow = 0.5;
  };
  // the end of Rei's verse: the outlines glow, Corrupt-Chan's colour cracks through and floods the panel
  R.faceFlash = (sh, t, S) => {
    const local = t - sh.t0, flood = clamp((local - 0.45) / 0.15);
    drawVerse("rei", 86, 594, t, { glowLines: 0.6, zoom: 1 + easeIn(clamp((local - 0.45) / 0.55)) * 0.7, bg: flood > 0 ? CC.text : null });
    D.chatPanel(g, 724, 1156, "rei", SHOTS[sh.index - 1].bubbles, t, "left");
    if (flood > 0) sliceGlitch(86, 0, 508, H, Math.floor(local * 20), 0.6);
    S.post.glitch = flood > 0 ? 0.3 + 0.3 * (Math.floor(local * 15) % 2) : 0.05; S.post.ca = 0.006; S.post.glow = 0.9;
  };
  R.ready = (sh, t) => D.readyScreen(g, t, t - sh.t0);
  R.link = (sh, t) => D.linkLine(g, (t - sh.t0) / (sh.t1 - sh.t0), sh.to);

  // ---- the second verse: close-ups of Rei and the list she types ----
  R.close = (sh, t, S) => {
    const local = t - sh.t0, tq = T10(t), reach = sh.pose === "reach";
    const x0 = 44, x1 = 600, beat = tl.beatF(tq + 1e-4), bi = Math.floor(beat), sub = Math.floor((beat - bi) * 4) & 3;
    g.save(); g.beginPath(); g.rect(x0, 0, x1 - x0, H); g.clip();
    g.fillStyle = REI.night; g.fillRect(x0, 0, x1 - x0, H);
    if (reach) {
      const grd = g.createRadialGradient(320, 260, 20, 320, 260, 420); grd.addColorStop(0, rgba(CC.text, 0.55)); grd.addColorStop(1, rgba(CC.main, 0));
      g.fillStyle = grd; g.fillRect(x0, 0, x1 - x0, H);
      for (let i = 0; i < 18; i++) { g.fillStyle = rgba("#ffffff", 0.06); g.fillRect(x0, ((i * 41 + tq * 30) % H), x1 - x0, 2); }
    } else {
      for (let i = 0; i < 7; i++) {
        const bx = x0 + hash1(i * 2.1) * 560, by = hash1(i * 5.3) * 400, r = 60 + hash1(i * 8.1) * 90 + Math.sin(tq * 4 + i) * 10;
        g.fillStyle = rgba(i % 2 ? CC.text : CC.main, 0.85); g.beginPath(); g.arc(bx, by, r, 0, Math.PI * 2); g.fill();
      }
      if (local > 4.5) D.checker(g, x0 + 40, 300 + (local - 4.5) * 40, 120, 60, 10);
    }
    // drawings: the hand comes closer in three steps; the headset pose bobs on the beat
    const step = reach ? Math.min(2, Math.floor(local / 1.6)) : 0;
    const pose = reach ? addPose(POSES.reach, { rightUpperArm: [0, 0, 0], hips_pos: [0, 0, step * 0.0] }) : POSES.headset;
    const mood = reach ? (local < 2.6 ? { "びっくり": 1, oh: 0.6 } : { happy: 0.45, aa: 0.4 }) : (t < 66.9 ? { happy: 0.6, aa: sub < 2 ? 0.7 : 0.45 } : { "両目見開き": 1, oh: 0.4 });
    const camSpec = reach ? [24 - step * 1.5, -0.12, 1.48, 1.05, -0.05, 1.43, 0] : [26, 0, 1.15, 1.9, 0, 1.15, 0];
    const dr = C({ who: "rei", pose: vary(pose, sub >= 2 ? 1 : 0, 0.5), mood: { ...mood, goggles: true, ecg: (bi % 4) }, yaw: reach ? 0.15 : 0, cam: camSpec, w: 556, h: 720, outline: reach ? 2.8 : 2.2 });
    blit(dr, x0, 0, x1 - x0, H, wobble(bi, sub, reach ? 0.35 : 0.7));
    g.restore();
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

  // ---- CRT monitor shots (props move on the 10 fps clock too) ----
  const PROP_KEYS = Object.keys(props);
  function showProp(...ks) { for (const k of PROP_KEYS) props[k].visible = ks.includes(k); bigSticks.visible = ks.includes("bigSticks"); }
  R.prop = (sh, t, S) => {
    const tq = T10(t), local = tq - sh.t0, f12 = Math.floor(t * 12);
    const jx = (hash2(f12, 1) - 0.5) * 5, jy = (hash2(f12, 2) - 0.5) * 3;
    g.save(); g.translate(jx, jy);
    const x0 = 280, x1 = 1000, rect = { x: x0, y: 0, w: x1 - x0, h: H };
    D.monitorFrame(g, x0, x1, sh.mono ? "#18171c" : "#1b1826");
    const camProp = (dist, y = 0, look = 0) => { cam.fov = 32; cam.position.set(Math.sin(local * 0.3) * 0.25, y + 0.25, dist); cam.lookAt(0, look, 0); };
    const beat = tl.beatF(tq + 1e-4), bi = Math.floor(beat), sub = Math.floor((beat - bi) * 4) & 3;
    switch (sh.prop) {
      case "tv": case "tvHand": case "tvRed": {
        const red = sh.prop === "tvRed", tv = red ? props.tvRed : props.tv;
        D.stageFloor(g, x0, x1, red ? "#3a0a0e" : "#e9e4ff");
        const hand = red ? props.handRed : props.hand;
        showProp(red ? "tvRed" : "tv", ...(sh.prop !== "tv" ? [red ? "handRed" : "hand"] : []));
        tv.position.set(0, -0.15 + (sub === 0 ? -0.03 : 0), 0); tv.rotation.set(0.05, -0.18 + Math.sin(local * 0.7) * 0.05, 0);
        tv.userData.drawScreen(tq, sh.prop === "tv" ? "bars" : "off");
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
        showProp("bigSticks");
        bigSticks.rotation.set(0.25, -0.5 + local * 0.35, Math.sin(local * 1.5) * 0.06);
        bigSticks.position.y = sub === 0 ? -0.05 : 0;
        camProp(4.8, 0, -0.1);
        render3D(propScene, cam, rect, { outline: 2.2, bloom: 0.55 });
        S.post.glow = 0.6;
        break;
      }
      case "phones": {
        showProp("phones");
        props.phones.rotation.set(Math.sin(local * 0.9) * 0.08, Math.sin(local * 0.6) * 0.2, 0);
        props.phones.userData.parts.fp.position.y = -0.35 + (sub === 0 ? -0.05 : 0);
        camProp(6.0);
        render3D(propScene, cam, rect, { outline: 2.0 });
        break;
      }
      case "cup": case "calendar": case "boxbird": {
        g.fillStyle = "#3a3842"; g.beginPath(); g.moveTo(x0, H * 0.62); g.lineTo(x1, H * 0.55); g.lineTo(x1, H); g.lineTo(x0, H); g.closePath(); g.fill();
        g.fillStyle = "rgba(0,0,0,0.45)"; g.beginPath(); g.ellipse(640, H * 0.74, 190, 40, 0, 0, Math.PI * 2); g.fill();
        showProp(sh.prop);
        const p = props[sh.prop];
        p.position.set(0, sh.prop === "boxbird" ? 0.38 + (sub === 0 ? 0 : 0.06) : 0, 0);
        if (sh.prop === "cup") p.rotation.set(0.15, -0.5 + local * 0.08, 0);
        if (sh.prop === "boxbird") { p.rotation.set(0.15, -0.6 + Math.sin(local) * 0.15, 0); p.userData.lid.rotation.x = -0.45 - (sub % 2) * 0.25; }
        if (sh.prop === "boxbird") camProp(5.4, 0.2, -0.05); else camProp(4.0, 0.3, 0.0);
        render3D(propScene, cam, rect, { outline: 2.0 });
        break;
      }
      case "dots": D.dotsBox(g, 640, 300, local, !!sh.drip); break;
      case "rays": D.rays(g, x0, x1, local); break;
      case "eye": {
        D.colorEye(g, 640, 250, local);
        const dr = C({ who: "rei", pose: addPose(POSES.stand, { head: [0.3, 0, 0] }), mood: {}, cam: [28, 0, 0.9, 6.5, 0, 1.6, 0], w: 720, h: 720, mode: "flat", fill: 0x2a2733 });
        blit(dr, x0, 0, 720, H, { dy: sub === 0 ? 3 : 0 });
        break;
      }
      case "duo": {
        g.fillStyle = "rgba(230,226,255,0.08)"; g.beginPath(); g.moveTo(x0, H); g.lineTo(x0 + 260, H * 0.55); g.lineTo(x0 + 420, H * 0.55); g.lineTo(x0 + 200, H); g.fill();
        for (const k of ["cc", "rei"]) {
          const left = (k === "rei") !== !!sh.flip, v = (bi + (k === "rei" ? 0 : 1)) % 2;
          const pose = vary(addPose(POSES.stand, { head: [-0.25, 0, 0], neck: [-0.1, 0, 0], spine: [-0.06, 0, 0] }), v, 0.6);
          const dr = C({ who: k, pose, mood: {}, yaw: left ? -Math.PI / 2 : Math.PI / 2, x: (left ? 1 : -1) * 0.12, cam: [30, 0, 1.25, 2.0, 0, 1.2, 0], w: 720, h: 720, mode: "flat", fill: k === "rei" ? 0xfff1df : hex(CC.sil) });
          blit(dr, x0, 0, 720, H, { dy: sub === 0 ? 4 : 0, bloom: 0.45 });
        }
        break;
      }
      case "window": {
        D.crackedWall(g, x0, x1, local, local > 1.4);
        g.fillStyle = "#26222c"; g.fillRect(420, 110, 330, 520);
        g.strokeStyle = "#0e0c12"; g.lineWidth = 10; g.strokeRect(420, 110, 330, 520);
        g.fillStyle = "#0b0a0e"; g.fillRect(780, 140, 170, 480); g.strokeRect(780, 140, 170, 480);
        const dr = C({ who: "rei", pose: vary(POSES.sit, bi % 2, 0.4), mood: { "瞳ハイライト消": 1, sad: 0.5 }, yaw: 0.3, cam: [30, 0.3, 0.75, 2.6, 0, 0.5, 0], w: 330, h: 520, outline: 1.8 });
        blit(dr, 420, 110, 330, 520, { clip: (gg) => gg.rect(425, 115, 320, 510) });
        break;
      }
      case "stars": {
        D.starfield(g, x0, x1, local, 0.6 + local * 0.9);
        const s = 0.35 + easeIn(local / 3) * 0.9, w = 330 * s, h = 520 * s;
        g.strokeStyle = CC.light; g.lineWidth = 8 * s; g.fillStyle = "#2a1a40";
        g.fillRect(640 - w / 2, 360 - h / 2, w, h); g.strokeRect(640 - w / 2, 360 - h / 2, w, h);
        const dr = C({ who: "rei", pose: POSES.sit, mood: { "瞳ハイライト消": 1, sad: 0.5 }, yaw: 0.3, cam: [30, 0.3, 0.75, 2.6, 0, 0.5, 0], w: 330, h: 520, outline: 1.8 });
        blit(dr, 640 - w / 2, 360 - h / 2, w, h, { clip: (gg) => gg.rect(640 - w / 2, 360 - h / 2, w, h) });
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
    D.pixelHeart(g, 684, 1194, sh.who, T10(t) - sh.t0);
    S.post.glitch = (t - sh.t0) < 0.15 ? 0.4 : 0;
  };
  R.heartGlitch = (sh, t, S) => { D.heartGlitch(g, t - sh.t0); S.post.glitch = 0.4; S.post.ca = 0.006; };
  R.code = (sh, t, S) => { D.codeScreen(g, t - sh.t0); S.post.scan = 0.15; S.post.glitch = hash1(Math.floor(t * 10)) > 0.8 ? 0.3 : 0; };
  R.hello = (sh, t) => D.helloScreen(g, t - sh.t0);
  R.credit = (sh, t, S) => {
    const local = t - sh.t0, rei = sh.who === "rei", [x0, x1] = rei ? [80, 700] : [580, 1200];
    const a = clamp(local / 0.25) * clamp((sh.t1 - sh.t0 - local) / 0.2);
    const tq = T10(t), beat = tl.beatF(tq + 1e-4), bi = Math.floor(beat), sub = Math.floor((beat - bi) * 4) & 3;
    // the silhouette dances: it changes pose every two beats
    const seq = rei ? ["R_spread", "R_V", "R_lean"] : ["C_spread", "C_up", "C_spreadHi"];
    const pose = POSES[seq[Math.floor(bi / 2) % 3]];
    const dr = C({ who: sh.who, pose, mood: {}, yaw: rei ? 0.22 : -0.22, cam: [28, 0, 1.0, 4.3, 0, 0.92, 0], w: 620, h: 720, mode: "flat", fill: hex(WHO[sh.who].sil) });
    blit(dr, x0, 0, x1 - x0, H, { ...wobble(bi, sub, 0.5), alpha: a });
    D.creditText(g, sh, local, rei ? "right" : "left");
    S.post.glow = 0.3;
  };
  R.end = (sh, t) => D.endLogo(g, t - sh.t0);
  R.black = () => {};

  // ---------- frame ----------
  function renderFrame(frame) {
    const t = frame / fps;
    const sh = SHOTS[shotAt(t)];
    const S = { post: { glow: 0.5, ca: 0.0015, scan: 0.06, grain: 0.03, vig: 0.3, glitch: 0, flash: 0, fade: 0, sat: 1, keepRed: 0 } };
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.filter = "none"; g.globalCompositeOperation = "source-over";
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    (R[sh.type] || R.black)(sh, t, S);
    for (const [a, b, text] of SUBS) if (t >= a && t < b) D.subtitle(g, text, 640, 688, clamp((t - a) / 0.08) * clamp((b - t) / 0.08));
    if (t - sh.t0 < 0.06 && sh.type !== "black") S.post.glitch = Math.max(S.post.glitch, 0.25);
    post.draw(S.post, t, frame);
    return sh;
  }

  return {
    tl, frames: N, fps, duration: N / fps, renderFrame, celStats: () => cels.stats(),
    shots: SHOTS.map((s) => ({ t0: s.t0, type: s.type })),
    capture(type = "image/jpeg", q = 0.92) { return out.domElement.toDataURL(type, q); },
  };
}

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
  // phase 0..3: where the heartbeat blip is on the screen
  grp.userData.draw = (phase) => {
    x.fillStyle = "#1a0a1c"; x.fillRect(0, 0, 128, 72);
    x.strokeStyle = REI.light; x.lineWidth = 5; x.shadowColor = REI.light; x.shadowBlur = 8; x.beginPath();
    const ph = phase / 4;
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
