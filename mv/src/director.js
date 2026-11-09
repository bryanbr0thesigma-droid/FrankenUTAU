// The storyboard: where the performers stand, which move each does per bar, the shot list and
// camera moves, and the look of every moment (glitches, flashes, saturation, HUD, beams, link).
//
// Story: Corrupt-Chan and Ping start in separate dimensions (magenta / blue halves of the world),
// find each other's signal through the verses, merge for each chorus, drift apart again in the
// bridge, reach for each other, and close the song together.
import * as THREE from "three";
import { SECTIONS } from "./timeline.js";
import { clamp, lerp, smooth, easeInOut, easeOut, wobble, mulberry32, pulse, frac, hash1, PALETTE } from "./util.js";
import { basePose, MOVES, blendPose } from "./dance.js";

const APART_X = 3.2, TOGETHER_X = 0.62;
const V = () => new THREE.Vector3();

const CHOREO = {
  intro: { cc: ["idle"], ping: ["idleSing"] },
  v1cc: { cc: ["idleSing", "robot", "idleSing", "transmit"], ping: ["idle"] },
  v1ping: { cc: ["groove"], ping: ["idleSing", "groove", "idleSing", "receive", "groove"] },
  pre1: { cc: ["sway", "sway", "receive", "transmit"], ping: ["sway", "sway", "receive", "transmit"] },
  pre1cc: { cc: ["transmit", "robot", "spin"], ping: ["groove", "groove", "spin"] },
  ch1: { both: ["wave", "point", "clapUp", "jumpPump"], last: "spin" },
  inter1: { cc: ["idle", "idle", "sway", "reach"], ping: ["sway", "idleSing", "idleSing", "reach"] },
  v2: { both: ["groove", "transmit", "robot", "spin"] },
  v2ping: { cc: ["groove"], ping: ["idleSing", "groove", "receive", "idleSing"] },
  v2cc: { cc: ["robot", "idleSing", "robot", "transmit"], ping: ["groove"] },
  ch2: { both: ["point", "wave", "receive", "jumpPump"], last: "spin" },
  bridgeA: { both: ["sway", "idleSing", "reach", "sway", "idleSing", "reach", "sway", "reach", "reach"] },
  bridgeB: { both: ["idleSing", "groove", "transmit", "groove", "receive", "groove", "transmit"] },
  breakdown: { both: ["receive", "reach", "robot", "spin"] },
  ch3: { both: ["jumpPump", "wave", "point", "clapUp"], last: "spin" },
  outro: { both: ["outroDance", "outroDance", "groove", "spin", "outroDance", "clapUp"] },
  end: { both: ["waveBye", "waveBye", "idle", "idle"] },
};

export class Director {
  constructor(tl) {
    this.tl = tl;
    this.shots = buildShots(tl);
    this.cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 300);
    this.camB = new THREE.PerspectiveCamera(30, 8 / 9, 0.05, 300);
    this.camA = new THREE.PerspectiveCamera(30, 8 / 9, 0.05, 300);
    this.chorusStarts = SECTIONS.filter((s) => s.chorus).map((s) => tl.barStart(s.b0));
    this.sectionStarts = SECTIONS.slice(1).map((s) => tl.barStart(s.b0));
  }
  bar(t) { return Math.floor(this.tl.barF(t)); }

  // ---------- choreography ----------
  moveName(key, k) {
    const sec = SECTIONS.find((s) => k >= s.b0 && k < s.b1) || (k < 0 ? SECTIONS[0] : SECTIONS[SECTIONS.length - 1]);
    const C = CHOREO[sec.name];
    const i = k - sec.b0;
    if (C.last && k === sec.b1 - 1) return C.last;
    const list = C.both || C[key];
    return list[i % list.length];
  }
  poseFor(key, t, seed) {
    const tl = this.tl, k = this.bar(t), bF = tl.barF(t);
    const b = (bF - k) * 4, beat = tl.beatF(t);
    const info = tl.barInfo(k);
    const e = clamp((info.energy - 0.7) / 0.25) * (info.level >= 2 ? 1 : 0.75);
    const sing = tl.singing(key === "cc" ? "cc" : "rei", t);
    const name = this.moveName(key, k);
    let run = 0; while (run < 8 && this.moveName(key, k - run - 1) === name) run++;
    const c = { b, beat, e, sing, t, bars: run, seed };
    const P = basePose(); MOVES[name](P, c);
    // blend in from the previous bar's move over the first third of a beat
    if (b < 0.35 && run === 0) {
      const prev = this.moveName(key, k - 1);
      const Q = basePose(); MOVES[prev](Q, { ...c, b: b + 4, bars: 0 });
      return { pose: blendPose(Q, P, smooth(b / 0.35)), name };
    }
    return { pose: P, name };
  }

  // ---------- formation ----------
  formation(t) {
    const sec = this.tl.section(t);
    const x = sec.apart ? APART_X : TOGETHER_X;
    const inward = sec.apart ? 0.22 : 0.06;
    return { cc: { x: -x, z: 0, facing: inward }, ping: { x, z: 0, facing: -inward }, apart: !!sec.apart, sec };
  }

  // ---------- shots ----------
  shotAt(t) {
    const S = this.shots;
    let lo = 0, hi = S.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (S[m].t0 <= t) lo = m; else hi = m - 1; }
    return S[lo];
  }
  // one camera from a shot description
  frame(shot, t, A, cam, sub = null) {
    const sh = sub || shot;
    const d = Math.max(0.01, shot.t1 - shot.t0), u = clamp((t - shot.t0) / d), lt = t - shot.t0;
    const who = sh.who ? A[sh.who] : null;
    const mid = V().addVectors(A.cc.pos, A.ping.pos).multiplyScalar(0.5);
    const around = (act, ang, dist, y) => { const yaw = act.facing + ang; return V().set(act.pos.x + Math.sin(yaw) * dist, y, act.pos.z + Math.cos(yaw) * dist); };
    let pos, look, fov = 30, roll = 0, shake = 0.01;
    const ang = sh.angle || 0;
    switch (sh.type) {
      case "face": {
        const dist = (sh.dist || 1.0) * (1 - (sh.push ?? 0.08) * easeInOut(u));
        pos = around(who, ang + (sh.drift || 0) * u, dist, who.head.y + 0.02);
        look = V().copy(who.head).add(V().set(0, -0.06, 0)); fov = 27; shake = 0.004; break;
      }
      case "bust": {
        pos = around(who, ang + 0.1 * u, 1.75 - 0.15 * u, who.head.y - 0.08);
        look = V().copy(who.head).add(V().set(0, -0.22, 0)); fov = 30; shake = 0.006; break;
      }
      case "full": {
        pos = around(who, ang + 0.15 * u, 3.1 - 0.3 * u, 1.05);
        look = V().set(who.pos.x, 0.85, who.pos.z); fov = 33; shake = 0.01; break;
      }
      case "low": {
        pos = around(who, ang + 0.12 * u, 1.75 - 0.15 * u, 0.28);
        look = V().copy(who.head).add(V().set(0, -0.12, 0)); fov = 40; shake = 0.006; break;
      }
      case "profile": {
        const sd = sh.side || 1;
        pos = around(who, sd * 1.1 + 0.15 * u * sd, 2.1, who.head.y - 0.04);
        look = V().copy(who.head).add(V().set(0, -0.1, 0)); fov = 22; shake = 0.004; break;
      }
      case "orbitOne": {
        const a = lerp(sh.a0, sh.a1, easeInOut(u));
        pos = around(who, a, 2.2, 1.25); look = V().set(who.pos.x, 1.05, who.pos.z); fov = 34; break;
      }
      case "crane": {
        const c = sh.who ? who.pos : mid;
        const k = easeInOut(u);
        pos = V().set(c.x + Math.sin(0.25 - 0.4 * k) * lerp(5, 3.6, k), lerp(0.35, 3.0, k), c.z + Math.cos(0.25 - 0.4 * k) * lerp(5, 3.6, k));
        look = V().set(c.x, lerp(1.25, 0.9, k), c.z); fov = 36; shake = 0.012; break;
      }
      case "two": {
        const sep = A.cc.pos.distanceTo(A.ping.pos);
        const dist = lerp(sh.dist0 ?? 4.3, sh.dist1 ?? 3.8, easeInOut(u)) + sep * 0.4;
        const y = sh.low ? 0.45 : 1.3;
        pos = V().set(mid.x + Math.sin(ang) * dist, y, mid.z + Math.cos(ang) * dist);
        look = V().set(mid.x, sh.low ? 1.15 : 1.0, mid.z); fov = sh.low ? 38 : 34; break;
      }
      case "low2": {
        const a = lerp(-0.35, 0.35, u);
        pos = V().set(mid.x + Math.sin(a) * 3.1, 0.3, mid.z + Math.cos(a) * 3.1);
        look = V().set(mid.x, 1.2, mid.z); fov = 42; break;
      }
      case "orbit": {
        const a = lerp(sh.a0 ?? -0.7, sh.a1 ?? 0.7, easeInOut(u)), r = sh.r || 4.6;
        pos = V().set(mid.x + Math.sin(a) * r, sh.y ?? 1.6, mid.z + Math.cos(a) * r);
        look = V().set(mid.x, 1.0, mid.z); fov = 34; shake = 0.012; break;
      }
      case "overhead": {
        const a = lt * 0.35 + (sh.a || 0);
        pos = V().set(mid.x + Math.sin(a) * 0.6, 6.5 - 0.8 * u, mid.z + Math.cos(a) * 0.6 + 0.4);
        look = V().set(mid.x, 0.6, mid.z); fov = 44; roll = 0; shake = 0.006; break;
      }
      case "dolly": {
        const c = sh.who ? who.pos : mid;
        const off = lerp(-1.7, 1.7, easeInOut(u)) * (sh.dir || 1);
        pos = V().set(c.x + off, 1.2, c.z + (sh.who ? 2.4 : 3.6));
        look = V().set(c.x + off * 0.3, 1.05, c.z); fov = 33; break;
      }
      case "wide": {
        const dist = lerp(sh.dist0 ?? 11, sh.dist1 ?? 9, easeInOut(u));
        pos = V().set(Math.sin(0.08 * u - 0.04) * dist, 2.6 - 0.4 * u, Math.cos(0.08 * u - 0.04) * dist);
        look = V().set(0, 1.5, 0); fov = 38; shake = 0.015; break;
      }
      case "rush": {
        const k = easeIn2(u);
        const dist = lerp(13, 3.2, k);
        pos = V().set(0, lerp(2.8, 1.25, k), dist); look = V().set(0, lerp(1.6, 1.05, k), 0); fov = lerp(36, 52, k); shake = 0.01 + 0.03 * k; break;
      }
      case "whip": {
        const a = A[sh.a], b = A[sh.b];
        pos = V().set(mid.x, 1.35, mid.z + 3.6);
        const k = easeInOut(clamp((u - 0.6) / 0.3));
        look = V().lerpVectors(V().copy(a.head).add(V().set(0, -0.25, 0)), V().copy(b.head).add(V().set(0, -0.25, 0)), k);
        fov = lerp(22, 24, Math.sin(Math.PI * k)); shake = 0.008; break;
      }
      case "behind": {
        const o = A[sh.other];
        const dir = V().subVectors(o.pos, who.pos).setY(0).normalize();
        const side = V().set(-dir.z, 0, dir.x).multiplyScalar(sh.who === "cc" ? -0.45 : 0.45);
        pos = V().copy(who.pos).addScaledVector(dir, -1.3 + 0.2 * u).add(side).setY(1.55);
        look = V().copy(o.head).add(V().set(0, -0.3, 0)); fov = 38; break;
      }
      default: { pos = V().set(0, 1.4, 6); look = V().set(0, 1, 0); }
    }
    const seed = Math.floor(shot.t0 * 10);
    pos.x += wobble(t * 0.6, seed) * shake; pos.y += wobble(t * 0.55, seed + 3) * shake * 0.7; pos.z += wobble(t * 0.5, seed + 5) * shake;
    roll += wobble(t * 0.4, seed + 9) * 0.012 + (sh.roll || 0);
    cam.position.copy(pos);
    if (sh.type === "overhead") cam.up.set(Math.sin(lt * 0.35), 0, -Math.cos(lt * 0.35)); else cam.up.set(0, 1, 0);
    cam.lookAt(look);
    cam.rotateZ(roll);
    cam.fov = fov;
    return { pos, look };
  }

  // ---------- everything for one frame ----------
  state(t, A) {
    const tl = this.tl, k = this.bar(t), sec = tl.section(t), info = tl.barInfo(k);
    const shot = this.shotAt(t);
    const beat = tl.beatF(t), kick = tl.mix("kick", t);
    const energy = clamp((info.energy - 0.7) / 0.25) * (info.level >= 2 ? 1 : 0.7);
    const loudCC = tl.loud("cc", t), loudPing = tl.loud("rei", t);
    const singCC = tl.singing("cc", t), singPing = tl.singing("rei", t);
    const bt = (b) => tl.barStart(b);

    // cameras
    let views, splitX = -1;
    if (shot.type === "split") {
      this.frame(shot, t, A, this.camA, shot.L); this.frame(shot, t, A, this.camB, shot.R);
      views = [{ camera: this.camA, x: 0, w: 0.5 }, { camera: this.camB, x: 0.5, w: 0.5 }];
      splitX = 0.5;
    } else {
      this.frame(shot, t, A, this.cam);
      if (sec.chorus || sec.name === "outro") this.cam.fov *= 1 - 0.035 * kick * energy;
      views = [{ camera: this.cam, x: 0, w: 1 }];
    }
    const focusKey = shot.who || (shot.type === "split" ? null : null);
    const focus = focusKey ? A[focusKey].pos : V().addVectors(A.cc.pos, A.ping.pos).multiplyScalar(0.5);

    // world
    const apart = !!sec.apart;
    let bright = 1;
    if (t < bt(1)) bright = lerp(0.25, 1, smooth((t - bt(0) - 0.3) / (bt(1) - bt(0) - 0.3)));
    if (sec.name === "bridgeA") bright = 0.62; if (sec.name === "inter1") bright = 0.75;
    if (sec.name === "bridgeB") bright = lerp(0.65, 1, (t - bt(78)) / (bt(85) - bt(78)));
    if (k === 86 || k === 87) bright = 0.55;
    let beams = sec.chorus ? (sec.final ? 1.25 : 1) : sec.name === "outro" ? 0.8 : sec.name === "v2" ? 0.45 : 0;
    // flashes
    let flash = 0, flashCol = new THREE.Color(1, 1, 1);
    for (const cs of this.chorusStarts) flash = Math.max(flash, pulse(t, cs, 0.35));
    if (sec.chorus && k > sec.b0 && (k - sec.b0) % 4 === 0) { const f = 0.35 * pulse(t, bt(k), 0.25); if (f > flash) { flash = f; flashCol.set(k % 8 ? PALETTE.ping.main : PALETTE.cc.main).lerp(new THREE.Color(1, 1, 1), 0.5); } }
    flash = Math.max(flash, 0.5 * pulse(t, bt(104), 0.3));
    // link between the singers
    const mA = this.moveName("cc", k), mB = this.moveName("ping", k);
    let link = 0, linkA = A.cc.chest.clone(), linkB = A.ping.chest.clone();
    if (mA === "reach" && mB === "reach") {
      const p = smooth(((tl.barF(t) - k) + (this.moveName("cc", k - 1) === "reach" ? 1 : 0)) / 1.5);
      link = p * 0.9; linkA = A.cc.handL.clone(); linkB = A.ping.handR.clone();
    } else {
      const both = Math.min(singCC, singPing);
      link = clamp(both * 2.2) * (apart ? 1 : 0.85) + (sec.chorus ? 0.22 : 0);
    }
    if (t < bt(4)) link = 0;

    // glitch
    let glitch = 0;
    for (const sb of this.sectionStarts) { glitch += 0.85 * pulse(t, sb - 0.03, 0.12); if (t > sb - 0.18 && t < sb) glitch += 0.35 * (t - (sb - 0.18)) / 0.18; }
    if (shot.type === "whip") { const u = (t - shot.t0) / (shot.t1 - shot.t0); glitch += 0.6 * Math.sin(Math.PI * clamp((u - 0.6) / 0.3)); }
    const sixteenth = Math.floor(beat * 4);
    if (shot.who === "cc" || (sec.name === "v1cc" || sec.name === "v2cc")) if (hash1(sixteenth * 1.37) > 0.94) glitch += 0.4;
    if (sec.final) glitch += 0.12 * kick;
    if (sec.chorus) glitch += 0.25 * pulse(t, shot.t0, 0.06);
    if (k === 88) glitch += 0.25 * smooth(tl.barF(t) - 88);
    glitch = clamp(glitch, 0, 1.2);

    // colour and grading
    let sat = sec.chorus ? 1.06 : 1;
    if (sec.name === "inter1") sat = 0.72; if (sec.name === "bridgeA") sat = 0.5;
    if (sec.name === "bridgeB") sat = lerp(0.55, 1, (t - bt(78)) / (bt(85) - bt(78)));
    if (sec.name === "breakdown") sat = 0.85;
    const letter = sec.name === "bridgeA" || sec.name === "inter1" ? 0.2 : 0;
    const fadeIn = t < 0.25 ? 1 : t < bt(1) ? 1 - smooth((t - 0.25) / (bt(1) - 0.25)) * 1 : 0;
    const fadeEnd = smooth((t - (tl.duration - 4.5)) / 3.0);
    const fadeAll = smooth((t - (tl.duration - 0.8)) / 0.7);
    const tint = shot.who === "cc" ? new THREE.Color(1.04, 0.96, 1.05) : shot.who === "ping" ? new THREE.Color(0.97, 1.0, 1.05) : new THREE.Color(1, 1, 1);

    // HUD
    let channel = singCC > 0.25 && singPing > 0.25 ? "both" : singCC > 0.25 ? "cc" : singPing > 0.25 ? "ping" : null;
    const hudA = t < bt(1) ? 0 : sec.chorus ? 0.45 : sec.name === "bridgeA" || sec.name === "inter1" ? 0.3 : sec.name === "end" ? 0.5 : 0.85;
    const tags = [];
    const tag = (who, t0, t1, side) => { if (t >= t0 && t < t1) tags.push({ who, p: (t - t0) / (t1 - t0), side }); };
    tag("ping", bt(3), bt(4) - 0.05, "right");
    tag("cc", bt(5), bt(6) + 0.6, "left");
    const st = {
      a: hudA, channel, loudCC, loudPing, t,
      bar: k, beat: clamp(Math.floor((tl.barF(t) - k) * 4) + 1, 1, 4),
      boot: t < bt(1) ? clamp(t / bt(1)) : -1,
      title: t >= bt(1) && t < bt(3) + 0.3 ? (t - bt(1)) / (bt(3) + 0.3 - bt(1)) : -1,
      tags,
      credits: t >= bt(105) && t < tl.duration - 4.6 ? (t - bt(105)) / (tl.duration - 4.6 - bt(105)) : -1,
      end: t >= tl.duration - 4.0 ? (t - (tl.duration - 4.0)) / 4.0 : -1,
    };

    // faces
    const smile = sec.chorus ? 0.5 : sec.name === "outro" ? 0.6 : sec.name === "end" ? 0.4 : sec.calm || sec.name === "bridgeB" ? 0.05 : 0.25;
    const faces = {
      cc: { smile, sad: sec.calm ? 0.25 : 0, angry: this.moveName("cc", k) === "robot" ? 0.15 : 0, happy: sec.name === "end" && k >= 111 ? 0.6 : 0 },
      ping: { smile, sad: sec.calm ? 0.2 : 0, happy: sec.name === "end" && k >= 111 ? 0.6 : 0 },
    };

    return {
      views, shot,
      world: {
        split: apart ? 1 : (sec.chorus ? 0.12 : 0.3), bright, flash: flash * 0.7, energy, ring: true, beams,
        link, linkA, linkB, linkArc: apart ? 0.7 : 0.18, key: sec.calm ? 0.75 : 1, rim: sec.chorus ? 1.3 : 1,
        focus, posCC: A.cc.pos, posPing: A.ping.pos,
      },
      post: {
        glitch, ca: 0.0015 + 0.003 * kick * energy, flash, flashCol, fade: Math.max(fadeIn, fadeEnd), fadeAll, sat,
        vig: sec.calm ? 0.55 : 0.35, glow: sec.chorus ? 1.1 : 0.85, scan: shot.who === "cc" ? 0.09 : 0.05, letter,
        split: splitX, hudA: 1, tint, seed: Math.floor(t * 15),
      },
      hud: st, faces,
      glitchCC: true,
    };
  }
}

function easeIn2(t) { t = clamp(t); return t * t; }

function buildShots(tl) {
  const S = [];
  const bt = (k) => tl.barStart(k);
  const add = (b0, b1, type, o = {}) => S.push({ t0: bt(b0), t1: bt(b1), type, ...o });
  const addT = (t0, t1, type, o = {}) => S.push({ t0, t1, type, ...o });
  const half = tl.barLen / 2;

  function chorus(b0, b1, seed, opts = {}) {
    const R = mulberry32(seed);
    const pick = (arr, prev) => { let x; let n = 0; do { x = arr[Math.floor(R() * arr.length)]; n++; } while (x === prev && n < 8); return x; };
    let prev = opts.open;
    add(b0, b0 + 1, opts.open, opts.open === "orbit" ? { a0: -0.9, a1: 0.9 } : {});
    for (let b = b0 + 1; b < b1; b++) {
      const who = tl.singer(b), e = tl.barInfo(b).energy;
      if (b === b1 - 1) { add(b, b1, "orbit", { a0: 0.8, a1: -0.8, r: 4.2, y: 1.4 }); prev = "orbit"; continue; }
      if ((b - b0) % 4 === 0) {
        const type = pick(["crane", "orbit", "two", "overhead", "dolly", "low2"], prev);
        add(b, b + 1, type, type === "orbit" ? { a0: R() > 0.5 ? -0.8 : 0.8, a1: 0 } : type === "dolly" ? { dir: R() > 0.5 ? 1 : -1 } : type === "two" ? { angle: (R() - 0.5) * 0.6 } : {});
        prev = type; continue;
      }
      if (who === "both") {
        if (opts.splits && R() < 0.45) {
          const t1 = pick(["face", "bust"]), t2 = pick(["face", "bust"]);
          add(b, b + 1, "split", { L: { type: t1, who: "cc", angle: 0.25 }, R: { type: t2, who: "ping", angle: -0.25 } });
          prev = "split";
        } else { const type = pick(["two", "orbit", "dolly", "low2"], prev); add(b, b + 1, type, type === "orbit" ? { a0: -0.5, a1: 0.5 } : {}); prev = type; }
      } else if (who === "ping" || who === "cc") {
        const other = who === "ping" ? "cc" : "ping";
        const sgn = who === "cc" ? 1 : -1;
        if (opts.halfCuts && e > 0.93 && R() < 0.5) {
          addT(bt(b), bt(b) + half, pick(["face", "bust"]), { who, angle: sgn * (0.15 + R() * 0.4), push: 0.12 });
          addT(bt(b) + half, bt(b + 1), pick(["low", "full", "profile"]), { who, angle: -sgn * (0.2 + R() * 0.4), side: sgn });
          prev = "half";
        } else {
          const type = pick(["face", "bust", "low", "profile", "full"], prev);
          add(b, b + 1, type, { who, angle: sgn * (R() - 0.3) * 0.9, side: R() > 0.5 ? 1 : -1, push: 0.1 });
          prev = type;
        }
      } else { add(b, b + 1, "two", {}); prev = "two"; }
    }
  }

  // intro: boot sequence in the dark, then Ping's intro line
  addT(-2, bt(1), "wide", { dist0: 14, dist1: 11.5 });
  add(1, 3, "face", { who: "ping", angle: -0.35, push: 0.14, drift: 0.2 });
  add(3, 4, "crane", { who: "ping" });
  // verse 1, Corrupt-Chan
  add(4, 5, "whip", { a: "ping", b: "cc" });
  add(5, 6, "bust", { who: "cc", angle: 0.3 });
  add(6, 7, "face", { who: "cc", angle: -0.25, push: 0.12 });
  add(7, 8, "low", { who: "cc", angle: 0.4 });
  // verse 1, Ping
  add(8, 9, "split", { L: { type: "face", who: "cc", angle: 0.25 }, R: { type: "face", who: "ping", angle: -0.25 } });
  add(9, 10, "dolly", { who: "ping" });
  add(10, 11, "face", { who: "ping", angle: 0.35, push: 0.1 });
  add(11, 12, "profile", { who: "ping", side: -1 });
  add(12, 13, "orbitOne", { who: "ping", a0: -0.8, a1: 0.4 });
  // pre-chorus
  add(13, 15, "wide", { dist0: 11, dist1: 8.5 });
  add(15, 16, "face", { who: "ping", angle: -0.5 });
  add(16, 17, "split", { L: { type: "bust", who: "cc", angle: 0.3 }, R: { type: "bust", who: "ping", angle: -0.3 } });
  add(17, 18, "face", { who: "cc", angle: 0.3, push: 0.16 });
  add(18, 19, "low", { who: "cc", angle: -0.3 });
  add(19, 20, "whip", { a: "cc", b: "ping" });
  // chorus 1
  chorus(20, 36, 101, { open: "crane" });
  // interlude
  add(36, 37, "wide", { dist0: 9, dist1: 10.5 });
  add(37, 39, "face", { who: "ping", angle: 0.25, push: 0.16, drift: -0.2 });
  add(39, 40, "behind", { who: "ping", other: "cc" });
  // verse 2
  add(40, 41, "crane", {});
  add(41, 42, "orbit", { a0: -0.6, a1: 0.6, r: 4.2 });
  add(42, 43, "overhead", {});
  add(43, 44, "two", { low: true });
  add(44, 45, "bust", { who: "ping", angle: -0.3 });
  add(45, 46, "face", { who: "ping", angle: 0.3 });
  add(46, 47, "full", { who: "ping", angle: -0.5 });
  add(47, 48, "face", { who: "ping", angle: -0.2, push: 0.15 });
  add(48, 49, "bust", { who: "cc", angle: 0.35 });
  add(49, 50, "face", { who: "cc", angle: -0.3 });
  add(50, 51, "low", { who: "cc", angle: 0.2 });
  add(51, 52, "face", { who: "cc", angle: 0.25, push: 0.2 });
  // chorus 2
  chorus(52, 69, 202, { open: "overhead", halfCuts: true, splits: true });
  // bridge: apart again, quiet, reaching
  add(69, 71, "wide", { dist0: 12, dist1: 9.5 });
  add(71, 72, "face", { who: "ping", angle: 0.3, push: 0.1 });
  add(72, 73, "split", { L: { type: "face", who: "cc", angle: 0.3 }, R: { type: "face", who: "ping", angle: -0.3 } });
  add(73, 74, "face", { who: "cc", angle: -0.2, push: 0.12 });
  add(74, 75, "behind", { who: "cc", other: "ping" });
  add(75, 76, "face", { who: "ping", angle: -0.25 });
  add(76, 77, "split", { L: { type: "bust", who: "cc", angle: 0.2 }, R: { type: "bust", who: "ping", angle: -0.2 } });
  add(77, 78, "behind", { who: "ping", other: "cc" });
  for (let b = 78; b < 85; b++) {
    const who = tl.singer(b);
    if (who === "both") add(b, b + 1, "split", { L: { type: b % 2 ? "face" : "bust", who: "cc", angle: 0.3 }, R: { type: b % 2 ? "face" : "bust", who: "ping", angle: -0.3 } });
    else if (who === "cc" || who === "ping") add(b, b + 1, b % 2 ? "face" : "bust", { who, angle: (who === "cc" ? 1 : -1) * 0.3, push: 0.12 });
    else add(b, b + 1, "wide", {});
  }
  add(85, 86, "face", { who: "cc", angle: 0.35, push: 0.1 });
  add(86, 87, "profile", { who: "cc", side: 1 });
  add(87, 88, "split", { L: { type: "face", who: "cc", angle: 0.2 }, R: { type: "face", who: "ping", angle: -0.2 } });
  add(88, 89, "rush", {});
  // final chorus
  chorus(89, 104, 303, { open: "two", halfCuts: true, splits: true });
  // outro dance break, credits, goodbye
  add(104, 105, "orbit", { a0: 0.9, a1: -0.9, r: 5 });
  add(105, 106, "low2", {});
  add(106, 107, "overhead", { a: 1.0 });
  add(107, 108, "dolly", { dir: -1 });
  add(108, 109, "full", { who: "cc", angle: 0.4 });
  addT(bt(109) - 0, bt(110), "full", { who: "ping", angle: -0.4 });
  add(110, 115, "two", { dist0: 3.6, dist1: 6.5 });
  S.sort((a, b) => a.t0 - b.t0);
  return S;
}
