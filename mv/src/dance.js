// Procedural, beat-synced choreography for VRM humanoids.
//
// A pose is described in character terms (lean forward, turn left, arm direction as out/up/forward)
// and converted to normalized-bone rotations by applyPose. Moves are functions of the beat clock, so
// any frame can be computed on its own.
//
// Rig frame for these VRM0 models (normalized bones, before rotateVRM0 turns the scene round):
// forward is -Z, the character's left is -X, up is +Y.
import * as THREE from "three";
import { clamp, lerp, smooth, easeOut, frac, TAU, hash1 } from "./util.js";

const arm = (o = {}) => ({ out: 0.2, up: -1, fwd: 0.08, bend: 0.22, twist: 0, flex: 0, yaw: 0, curl: 0.35, thumb: 0.3, point: 0, ...o });
const leg = () => ({ lift: 0, out: 0.035, knee: 0, foot: 0, turn: 0.07 });
const rot3 = () => ({ lean: 0, twist: 0, side: 0 });

export function basePose() {
  return {
    hips: { x: 0, y: 0, z: 0, turn: 0, tilt: 0, lean: 0 },
    spine: rot3(), chest: rot3(), neck: rot3(),
    head: { nod: 0, turn: 0, tilt: 0 },
    L: arm(), R: arm(), legL: leg(), legR: leg(),
    turn: 0, // whole-body yaw (spins)
    jump: 0, // metres off the ground
  };
}

function lerpObj(a, b, t, out) {
  for (const k in a) {
    const va = a[k], vb = b[k];
    if (typeof va === "number") out[k] = va + (vb - va) * t;
    else if (va && typeof va === "object") lerpObj(va, vb, t, out[k]);
  }
  return out;
}
export function blendPose(a, b, t) { return lerpObj(a, b, t, basePose()); }

export function mirrorPose(P) {
  const o = basePose();
  lerpObj(P, P, 0, o);
  [o.L, o.R] = [lerpObj(P.R, P.R, 0, arm()), lerpObj(P.L, P.L, 0, arm())];
  [o.legL, o.legR] = [lerpObj(P.legR, P.legR, 0, leg()), lerpObj(P.legL, P.legL, 0, leg())];
  o.hips.x = -P.hips.x; o.hips.turn = -P.hips.turn; o.hips.tilt = -P.hips.tilt;
  for (const k of ["spine", "chest", "neck"]) { o[k].twist = -P[k].twist; o[k].side = -P[k].side; }
  o.head.turn = -P.head.turn; o.head.tilt = -P.head.tilt;
  o.turn = -P.turn;
  return o;
}

const setArm = (A, out, up, fwd, bend, extra = {}) => Object.assign(A, { out, up, fwd, bend }, extra);
const mixArm = (A, B, t) => lerpObj(A, B, t, A);

// ---------- building blocks ----------
function bounce(P, beat, amt) {
  const d = 0.5 + 0.5 * Math.cos(TAU * frac(beat)); // down on the beat
  const k = amt * d;
  for (const g of [P.legL, P.legR]) { g.knee += 0.55 * k; g.lift += 0.27 * k; }
  P.spine.lean += 0.05 * k; P.head.nod += 0.07 * k;
}
function sway(P, beat, amt, period = 2) {
  const s = Math.sin(TAU * beat / period);
  P.hips.x += 0.045 * amt * s; P.hips.tilt -= 0.07 * amt * s;
  P.spine.side += 0.05 * amt * s; P.chest.side += 0.04 * amt * s; P.head.tilt -= 0.05 * amt * s;
  P.legL.knee += amt * 0.2 * Math.max(0, -s); P.legL.lift += amt * 0.1 * Math.max(0, -s);
  P.legR.knee += amt * 0.2 * Math.max(0, s); P.legR.lift += amt * 0.1 * Math.max(0, s);
  return s;
}
function stepTouch(P, beat, amt) {
  // every two beats one foot taps out to the side on the off-beat
  const ph = frac(beat / 2), side = Math.floor(beat / 2) % 2 === 0 ? 1 : -1;
  const tap = Math.sin(Math.PI * clamp((ph - 0.25) / 0.5)) * amt;
  const g = side > 0 ? P.legL : P.legR;
  g.out += 0.14 * tap; g.lift += 0.12 * tap; g.knee += 0.22 * tap;
  P.hips.x -= 0.03 * side * tap;
}
const singLayer = (P, c) => {
  const s = c.sing;
  if (s <= 0.01) return;
  P.chest.lean -= 0.05 * s; P.head.nod -= 0.05 * s;
  P.head.tilt += 0.06 * s * Math.sin(c.beat * Math.PI / 2);
};

// ---------- moves: (P, c) where c = { b: beats into this bar (0..4), beat: global beat, e: energy, sing, t, bars: bars into move } ----------
export const MOVES = {
  idle(P, c) {
    sway(P, c.beat, 0.35, 4); bounce(P, c.beat, 0.05);
    const s = Math.sin(TAU * c.beat / 4);
    setArm(P.L, 0.22 + 0.03 * s, -1, 0.1, 0.28); setArm(P.R, 0.22 - 0.03 * s, -1, 0.1, 0.28);
    P.head.turn += 0.05 * Math.sin(c.t * 0.4);
  },
  idleSing(P, c) {
    sway(P, c.beat, 0.5, 4); bounce(P, c.beat, 0.08);
    setArm(P.L, 0.22, -0.9, 0.25, 2.0, { twist: -0.25, curl: 0.55 }); // hand at the chest
    const s = clamp(c.sing * 1.3);
    const lift = 0.5 + 0.5 * Math.sin(TAU * c.beat / 8);
    setArm(P.R, 0.45 + 0.4 * s, -0.75 + 0.6 * s * lift + 0.1, 0.55 + 0.2 * s, 0.75 - 0.4 * s, { curl: 0.15, twist: 0.3 });
    singLayer(P, c);
  },
  groove(P, c) {
    bounce(P, c.beat, 0.25 + 0.2 * c.e); const s = sway(P, c.beat, 0.6, 2);
    stepTouch(P, c.beat, 0.5 * c.e);
    const sw = Math.sin(Math.PI * c.beat);
    setArm(P.L, 0.3, -0.8, 0.3 + 0.35 * sw, 1.15, { curl: 0.6 });
    setArm(P.R, 0.3, -0.8, 0.3 - 0.35 * sw, 1.15, { curl: 0.6 });
    P.chest.twist += 0.09 * sw; P.head.turn -= 0.04 * sw; P.head.tilt += 0.03 * s;
    singLayer(P, c);
  },
  clapUp(P, c) {
    bounce(P, c.beat, 0.3);
    const q = c.b % 2, together = 1 - smooth(Math.abs(q - 1) / 0.55);
    const o = lerp(0.6, 0.04, together);
    setArm(P.L, o, 0.85, 0.3, lerp(0.5, 0.35, together), { curl: 0.05, twist: 1.2 });
    setArm(P.R, o, 0.85, 0.3, lerp(0.5, 0.35, together), { curl: 0.05, twist: 1.2 });
    P.head.nod -= 0.08; P.chest.lean -= 0.06;
  },
  wave(P, c) {
    bounce(P, c.beat, 0.22);
    const s = Math.sin(Math.PI * c.beat);
    setArm(P.L, 0.32 + 0.38 * s, 0.9, 0.18, 0.3, { curl: 0.05, twist: 1.0 });
    setArm(P.R, 0.32 - 0.38 * s, 0.9, 0.18, 0.3, { curl: 0.05, twist: 1.0 });
    P.spine.side += 0.1 * s; P.chest.side += 0.06 * s; P.hips.x -= 0.03 * s; P.head.tilt += 0.08 * s;
  },
  point(P, c) {
    bounce(P, c.beat, 0.3); stepTouch(P, c.beat, 0.4);
    const half = c.b < 2 ? 0 : 1, k = easeOut(frac(c.b / 2) / 0.18);
    const front = { out: 0.22, up: 0.35, fwd: 1, bend: 0.06 }, side = { out: 1, up: 0.5, fwd: 0.35, bend: 0.06 };
    const from = half ? front : side, to = half ? side : front;
    setArm(P.R, lerp(from.out, to.out, k), lerp(from.up, to.up, k), lerp(from.fwd, to.fwd, k), 0.06, { point: 1, curl: 0.9, twist: 0.4 });
    setArm(P.L, 0.7, -0.6, -0.05, 1.75, { curl: 0.8, twist: -0.35 }); // hand on hip
    P.spine.side -= 0.06 * (half ? 1 : 0.4); P.head.turn -= 0.12 * (half ? k : 1 - k); P.head.nod -= 0.05;
  },
  receive(P, c) {
    bounce(P, c.beat, 0.18);
    setArm(P.L, 0.75, 0.12, 0.2, 2.45, { curl: 0.3, twist: 1.45 }); // hand to the ear
    const tw = 0.05 * Math.sign(Math.sin(TAU * c.beat * 2));
    setArm(P.R, 0.85, 0.62, 0.12, 0.06, { curl: 0.05, yaw: tw, flex: -0.3 }); // arm up like an antenna
    P.spine.side -= 0.08; P.chest.side -= 0.05; P.head.tilt += 0.14; P.head.turn += 0.08; P.hips.x += 0.03;
    singLayer(P, c);
  },
  transmit(P, c) {
    const q = c.b % 2;
    const pa = q < 0.3 ? easeOut(q / 0.3) : 1 - smooth((q - 0.3) / 1.7);
    bounce(P, c.beat, 0.2);
    for (const A of [P.L, P.R]) setArm(A, 0.18, lerp(-0.45, 0.06, pa), 1, lerp(1.6, 0.12, pa), { curl: 0.05, flex: -0.6 * pa, twist: -0.4 });
    P.spine.lean += 0.12 * pa; P.head.nod -= 0.05 * pa;
    P.legL.lift += 0.15 * pa; P.legL.knee += 0.2 * pa;
    singLayer(P, c);
  },
  robot(P, c) {
    // angular poses that snap on each beat
    const poses = [
      (A, B) => { setArm(A, 1, 0, 0, 0, { curl: 0.9 }); setArm(B, 1, 0, 0, 0, { curl: 0.9 }); },
      (A, B) => { setArm(A, 0.25, 0, 1, 1.5, { curl: 0.9 }); setArm(B, 0.25, -1, 0.05, 0.1, { curl: 0.9 }); },
      (A, B) => { setArm(A, 0.05, 1, 0.05, 0, { curl: 0.9 }); setArm(B, 1, 0, 0, 0.05, { curl: 0.9 }); },
      (A, B) => { setArm(A, 0.12, 0.05, 1, 0, { curl: 0.9 }); setArm(B, 0.12, 0.05, 1, 0, { curl: 0.9 }); },
      (A, B) => { setArm(A, 0.6, 0.35, 0.3, 2.3, { curl: 0.9 }); setArm(B, 1, 0.05, 0, 0, { curl: 0.9 }); },
      (A, B) => { setArm(A, 0.45, -1, 0, 0, { curl: 0.9, flex: 0.8 }); setArm(B, 0.45, -1, 0, 0, { curl: 0.9, flex: 0.8 }); },
    ];
    const bi = Math.floor(c.beat), k = easeOut(frac(c.beat) / 0.12);
    const pick = (i) => Math.floor(hash1(i * 3.7 + c.seed) * poses.length);
    const A0 = basePose(), A1 = basePose();
    poses[pick(bi - 1)](A0.L, A0.R); poses[pick(bi)](A1.L, A1.R);
    const flip0 = hash1(bi - 1 + 0.5) > 0.5, flip1 = hash1(bi + 0.5) > 0.5;
    const a0 = flip0 ? [A0.R, A0.L] : [A0.L, A0.R], a1 = flip1 ? [A1.R, A1.L] : [A1.L, A1.R];
    Object.assign(P.L, lerpObj(a0[0], a1[0], k, arm())); Object.assign(P.R, lerpObj(a0[1], a1[1], k, arm()));
    const hd = (i) => (hash1(i * 1.3) - 0.5) * 0.6;
    P.head.turn += lerp(hd(bi - 1), hd(bi), k); P.chest.twist += lerp(hd(bi - 1), hd(bi), k) * 0.4;
    P.head.tilt += lerp(hd(bi + 5), hd(bi + 6), k) * 0.4;
    bounce(P, c.beat, 0.12);
  },
  spin(P, c) {
    // groove for two beats, then a full turn over the last two
    if (c.b < 2) { MOVES.groove(P, c); return; }
    const p = smooth((c.b - 2) / 2);
    P.turn += TAU * p;
    const w = Math.sin(Math.PI * p);
    setArm(P.L, 1, lerp(-0.6, 0.15, w), 0.1, 0.3, { curl: 0.1 });
    setArm(P.R, 1, lerp(-0.6, 0.15, w), 0.1, 0.3, { curl: 0.1 });
    P.legR.lift += 0.25 * w; P.legR.knee += 0.5 * w; P.head.nod -= 0.05 * w;
  },
  jumpPump(P, c) {
    const ph = frac(c.beat), side = Math.floor(c.beat) % 2;
    const pa = Math.exp(-ph * 5);
    const A = side ? P.L : P.R, B = side ? P.R : P.L;
    setArm(A, 0.25, lerp(0.15, 1, pa), 0.25, lerp(1.3, 0.15, pa), { curl: 1 });
    setArm(B, 0.4, -0.6, 0.3, 1.5, { curl: 1 });
    if (c.e > 0.55) {
      P.jump += 0.06 * Math.sin(Math.PI * clamp(ph / 0.6));
      const tuck = Math.sin(Math.PI * clamp(ph / 0.6));
      for (const g of [P.legL, P.legR]) { g.knee += 0.35 * tuck; g.lift += 0.15 * tuck; }
    } else bounce(P, c.beat, 0.3);
    P.head.nod -= 0.1 * pa; P.chest.lean -= 0.05 * pa;
  },
  sway(P, c) {
    sway(P, c.beat, 0.7, 4);
    setArm(P.L, 0.24, -0.62, 0.75, 1.5, { curl: 0.55, twist: -0.3 });
    setArm(P.R, 0.24, -0.62, 0.75, 1.5, { curl: 0.55, twist: -0.3 });
    P.head.nod += 0.08; P.head.tilt += 0.08 * Math.sin(TAU * c.beat / 4 + 1);
    singLayer(P, c);
  },
  reach(P, c) {
    // reach towards the other dimension (the inside of the formation is the character's left
    // for Ping; mirrored for Corrupt-Chan)
    const p = smooth(c.bars / 1.0 + c.b / 4);
    sway(P, c.beat, 0.3, 4);
    setArm(P.L, lerp(0.3, 0.85, p), lerp(-0.7, 0.25, p), lerp(0.4, 0.65, p), lerp(1.2, 0.1, p), { curl: lerp(0.4, 0.05, p), twist: -0.3 });
    setArm(P.R, 0.2, -0.65, 0.7, 1.9, { curl: 0.6, twist: -0.3 });
    P.spine.twist += 0.22 * p; P.chest.twist += 0.12 * p; P.head.turn += 0.3 * p; P.spine.side += 0.06 * p;
    P.legL.lift += 0.08 * p; P.legR.knee += 0.12 * p;
    singLayer(P, c);
  },
  outroDance(P, c) {
    bounce(P, c.beat, 0.4); sway(P, c.beat, 0.8, 2); stepTouch(P, c.beat, 0.6);
    const a = TAU * c.beat;
    setArm(P.L, 0.25 + 0.12 * Math.cos(a), -0.15 + 0.22 * Math.sin(a), 0.85, 1.7, { curl: 0.85 });
    setArm(P.R, 0.25 + 0.12 * Math.cos(a + Math.PI), -0.15 + 0.22 * Math.sin(a + Math.PI), 0.85, 1.7, { curl: 0.85 });
    P.chest.twist += 0.1 * Math.sin(a / 2); P.head.nod -= 0.04;
  },
  waveBye(P, c) {
    sway(P, c.beat, 0.4, 4); bounce(P, c.beat, 0.06);
    const w = Math.sin(TAU * c.t * 1.6);
    setArm(P.R, 0.8, 0.3, 0.25, 1.15 + 0.35 * w, { curl: 0.05, twist: 1.45, yaw: 0.15 * w });
    setArm(P.L, 0.25, -0.9, 0.2, 0.5, { curl: 0.4 });
    P.head.tilt += 0.1; P.spine.side -= 0.04;
  },
};

// ---------- applying a pose to a VRM ----------
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();
const REST = { L: new THREE.Vector3(-1, 0, 0), R: new THREE.Vector3(1, 0, 0) };
const FINGERS = ["Index", "Middle", "Ring", "Little"];
const SEG = ["Proximal", "Intermediate", "Distal"];

export class Rig {
  constructor(vrm) {
    this.vrm = vrm;
    const H = vrm.humanoid;
    this.n = (name) => H.getNormalizedBoneNode(name);
    this.hips = this.n("hips");
    this.hipsRest = this.hips.position.clone();
    const w = (name) => H.getRawBoneNode(name).getWorldPosition(new THREE.Vector3());
    vrm.scene.updateMatrixWorld(true);
    this.L1 = w("leftUpperLeg").distanceTo(w("leftLowerLeg"));
    this.L2 = w("leftLowerLeg").distanceTo(w("leftFoot"));
    this.bones = {};
    for (const nm of ["spine", "chest", "upperChest", "neck", "head", "leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftHand", "rightHand",
      "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg", "leftFoot", "rightFoot", "leftShoulder", "rightShoulder"]) this.bones[nm] = this.n(nm);
    this.fingers = { left: [], right: [] };
    for (const side of ["left", "right"]) {
      for (const f of FINGERS) for (const s of SEG) { const b = this.n(side + f + s); if (b) this.fingers[side].push([b, f, s]); }
      this.fingers[side].thumb = ["ThumbMetacarpal", "ThumbProximal", "ThumbDistal"].map((s) => this.n(side + s)).filter(Boolean);
    }
  }
  apply(P) {
    const B = this.bones;
    const r3 = (bone, o, scale = 1) => { if (bone) bone.rotation.set(-o.lean * scale, o.twist * scale, o.side * scale); };
    // legs first: they decide how far the hips drop to keep the feet on the floor
    const legDrop = (g) => this.L1 * (1 - Math.cos(g.lift)) + this.L2 * (1 - Math.cos(g.knee - g.lift));
    const drop = Math.min(legDrop(P.legL), legDrop(P.legR));
    this.hips.position.set(this.hipsRest.x - P.hips.x, this.hipsRest.y + P.hips.y - drop + P.jump, this.hipsRest.z - P.hips.z);
    this.hips.rotation.set(-P.hips.lean, P.hips.turn, P.hips.tilt);
    // the hips rotation should not swing the legs, so legs compensate the hip tilt a little
    for (const [g, s] of [[P.legL, "left"], [P.legR, "right"]]) {
      const sg = s === "left" ? -1 : 1;
      B[s + "UpperLeg"].rotation.set(g.lift + P.hips.lean, sg * g.turn, sg * g.out - P.hips.tilt);
      B[s + "LowerLeg"].rotation.set(-g.knee, 0, 0);
      B[s + "Foot"].rotation.set(g.knee - g.lift - P.hips.lean + g.foot, 0, 0);
    }
    r3(B.spine, P.spine); r3(B.chest, P.chest); if (B.upperChest) r3(B.upperChest, P.chest, 0.4);
    r3(B.neck, P.neck);
    B.head.rotation.set(-P.head.nod, P.head.turn, P.head.tilt);
    for (const [A, s] of [[P.L, "left"], [P.R, "right"]]) {
      const sg = s === "left" ? -1 : 1;
      _v.set(sg * A.out, A.up, -A.fwd);
      if (_v.lengthSq() < 1e-6) _v.set(sg, 0, 0);
      _v.normalize();
      _q.setFromUnitVectors(s === "left" ? REST.L : REST.R, _v);
      if (A.twist) { _q2.setFromAxisAngle(_v, sg * A.twist); _q.premultiply(_q2); }
      B[s + "UpperArm"].quaternion.copy(_q);
      B[s + "LowerArm"].rotation.set(0, sg * A.bend, 0);
      B[s + "Hand"].rotation.set(0, -sg * A.yaw, sg * A.flex * -1);
      // shoulders shrug a little when the arm goes above horizontal
      const sh = B[s + "Shoulder"]; if (sh) sh.rotation.set(0, 0, -sg * 0.18 * clamp(A.up, 0, 1));
      // fingers
      const curl = clamp(A.curl);
      for (const [b, f] of this.fingers[s]) {
        const c = f === "Index" && A.point > 0.5 ? 0.03 : curl;
        b.rotation.set(0, 0, -sg * c * 1.25);
      }
      this.fingers[s].thumb.forEach((b, i) => { b.rotation.set(0, -sg * clamp(A.curl) * (i === 0 ? 0.4 : 0.6), 0); });
    }
  }
}
