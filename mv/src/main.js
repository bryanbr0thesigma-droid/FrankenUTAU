// Sets up the scene and renders frame i of the MV deterministically.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { buildCorruptChan } from "../assets/signaling/corrupt-chan-3d/cc_build.js";
import { buildPing } from "./ping.js";
import { Timeline } from "./timeline.js";
import { Actor } from "./actors.js";
import { buildStage } from "./stage.js";
import { Post } from "./post.js";
import { Hud } from "./hud.js";
import { Director } from "./director.js";
import { mulberry32 } from "./util.js";

// cc_build.js's glitch flashes use Math.random: seed it so a render always comes out the same
Math.random = mulberry32(20261108);

const ASSET = "./assets/signaling/corrupt-chan-3d/";

export async function createMV({ width = 1280, height = 720, container = document.body } = {}) {
  const A = await (await fetch("./build/analysis.json")).json();
  const tl = new Timeline(A);
  await Hud.loadFonts();

  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const libs = { THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils };
  const [ccB, pgB] = await Promise.all([
    buildCorruptChan(libs, { body: ASSET + "corrupt_chan_body.vrm", hair: ASSET + "corrupt_chan_hair.vrm" }),
    buildPing(libs, { base: ASSET + "corrupt_chan_hair.vrm", hair: ASSET + "corrupt_chan_body.vrm" }),
  ]);
  const actors = {
    cc: new Actor("cc", "cc", ccB, { mirror: false, seed: 11 }),
    ping: new Actor("ping", "rei", pgB, { mirror: true, seed: 23 }),
  };
  for (const a of Object.values(actors)) {
    scene.add(a.group);
    a.group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  }
  const stage = buildStage(scene, tl);
  const director = new Director(tl);
  const post = new Post(renderer, width, height);
  const hud = new Hud(post.hudCanvas, tl);
  // performers look at whichever camera is filming
  const lookTarget = new THREE.Object3D(); scene.add(lookTarget);
  for (const a of Object.values(actors)) if (a.vrm.lookAt) a.vrm.lookAt.target = lookTarget;

  const dt = 1 / tl.fps;
  let lastFrame = -999;

  function simulate(frame) {
    const t = frame / tl.fps;
    const F = director.formation(t);
    for (const key of ["cc", "ping"]) {
      const a = actors[key], f = F[key];
      const { pose } = director.poseFor(key, t, a.seed);
      const spin = a.mirror ? -pose.turn : pose.turn;
      const jumped = Math.abs(a.pos.x - f.x) > 1.0;
      a.place(f.x, f.z, f.facing, spin);
      a.pose(pose);
      if (jumped) a.resetSprings();
    }
    return { t, F };
  }

  function stepActors(t, faces) {
    for (const key of ["cc", "ping"]) {
      const a = actors[key];
      a.face(tl, t, faces ? faces[key] : {});
      const opts = key === "cc"
        ? { glitch: true }
        : { voice: tl.loud("rei", t), loudAt: (tt) => tl.loud("rei", tt), eighth: tl.period / 2 };
      a.step(dt, t, opts);
      a.refresh();
    }
  }

  // run the simulation (no rendering) up to a frame so the spring bones are settled there
  function preroll(frame, n = 75) {
    for (let f = Math.max(-90, frame - n); f < frame; f++) {
      const { t } = simulate(f);
      stepActors(t, null);
    }
    lastFrame = frame - 1;
  }

  function renderFrame(frame) {
    if (frame !== lastFrame + 1) preroll(frame);
    lastFrame = frame;
    const { t } = simulate(frame);
    // faces need the director's mood; it needs actor positions, so use last frame's points for that
    const S0 = director.state(t, actors);
    lookTarget.position.copy(S0.views[0].camera.position);
    stepActors(t, S0.faces);
    const S = director.state(t, actors); // cameras from this frame's bone positions
    if (S.views.length === 1) lookTarget.position.copy(S.views[0].camera.position);
    stage.update(t, frame, S.world);
    post.renderScene(scene, S.views);
    hud.draw(t, S.hud);
    const p = post.u, P = S.post;
    p.uTime.value = t; p.uSeed.value = P.seed; p.uGlitch.value = P.glitch; p.uCA.value = P.ca;
    p.uFlash.value = P.flash; p.uFlashCol.value.copy(P.flashCol); p.uFade.value = P.fade; p.uSat.value = P.sat;
    p.uVig.value = P.vig; p.uGlow.value = P.glow; p.uScan.value = P.scan; p.uLetter.value = P.letter;
    p.uSplit.value = P.split; p.uHudA.value = P.hudA; p.uTint.value.copy(P.tint); p.uFadeAll.value = P.fadeAll;
    post.composite();
    return S;
  }

  // settle the hair before frame 0
  preroll(0, 90);

  // debug: both performers side by side doing one move at beat position b, fixed front camera
  async function poseTest(name, b, angle = 0) {
    const { MOVES, basePose } = await import("./dance.js");
    const cam = new THREE.PerspectiveCamera(30, width / height, 0.05, 100);
    cam.position.set(Math.sin(angle) * 4.6, 1.0, Math.cos(angle) * 4.6); cam.lookAt(0, 0.9, 0);
    for (let i = 0; i < 20; i++) {
      for (const key of ["cc", "ping"]) {
        const a = actors[key];
        const P = basePose();
        MOVES[name](P, { b: b % 4, beat: b, e: 0.9, sing: 0.6, t: b * tl.period, bars: 1, seed: a.seed });
        a.place(key === "cc" ? -0.65 : 0.65, 0, 0, a.mirror ? -P.turn : P.turn);
        a.pose(P);
        a.face(tl, 0, { smile: 0.3 });
        a.step(dt, 0, key === "cc" ? { glitch: false } : { voice: 0 });
        a.refresh();
      }
    }
    lookTarget.position.copy(cam.position);
    stage.update(10, 300, { split: 0.3, bright: 0.6, flash: 0, energy: 0, ring: false, beams: 0, link: 0, linkA: actors.cc.chest, linkB: actors.ping.chest, linkArc: 0, key: 1, rim: 1, focus: new THREE.Vector3(), posCC: actors.cc.pos, posPing: actors.ping.pos });
    post.renderScene(scene, [{ camera: cam, x: 0, w: 1 }]);
    hud.draw(0, { a: 0, tags: [], boot: -1, title: -1, credits: -1, end: -1 });
    const g = post.hudCanvas.getContext("2d"); g.font = "700 28px monospace"; g.fillStyle = "#fff"; g.fillText(`${name}  b=${b}`, 30, 50);
    const p = post.u; p.uGlitch.value = 0; p.uFlash.value = 0; p.uFade.value = 0; p.uFadeAll.value = 0; p.uSplit.value = -1; p.uLetter.value = 0; p.uSat.value = 1; p.uTint.value.setRGB(1, 1, 1);
    post.composite();
    lastFrame = -999;
  }

  return {
    tl, renderer, frames: tl.N, fps: tl.fps, duration: tl.duration, poseTest,
    renderFrame,
    capture(type = "image/jpeg", q = 0.95) { return renderer.domElement.toDataURL(type, q); },
    shots: director.shots,
  };
}
