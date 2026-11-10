// Key poses for the reanimation, as Euler rotations (radians, XYZ) of VRM normalized bones.
//
// Model frame of these VRM0 rigs (normalized bones): up +Y, forward -Z, the character's left -X.
//   upper leg raised forward: +x      knee bent: -x
//   spine / chest / head bent forward: -x
//   left upper arm: down +z, up -z, forward -y      right upper arm: down -z, up +z, forward +y
//   left elbow bent (forearm forward/in): -y         right elbow: +y
//   fingers curled: left +z, right -z
// A pose: { hips: [dx, dy, dz] (metres, added to the rest position), b: { bone: [x, y, z] },
//           curl: [left, right] (0 open .. 1 fist), face: {...} }. Missing bones are at rest.
import * as THREE from "three";

const R = (deg) => (deg * Math.PI) / 180;
// arm: upper arm pointed along (out, up, fwd) in the character's terms, twisted about itself, elbow
// bend and wrist flex in radians (same parametrisation as dance.js's Rig)
const arm = (out, up, fwd, bend = 0.2, o = {}) => ({ out, up, fwd, bend, twist: 0, flex: 0, yaw: 0, ...o });
const d = (x, y, z) => [R(x), R(y), R(z)];

export const POSES = {
  stand: { hips: [0, 0, 0], b: { leftUpperArm: d(0, 0, 70), rightUpperArm: d(0, 0, -70), leftLowerArm: d(0, -10, 5), rightLowerArm: d(0, 10, -5) }, curl: [0.35, 0.35] },

  // on the floor, knees hugged to the chest, chin on the knees (the verse panels)
  sit: {
    hips: [0, -0.66, 0.05],
    b: {
      hips: d(-8, 0, 0),
      spine: d(-16, 0, 0), chest: d(-12, 0, 0), neck: d(-4, 0, 0), head: d(-16, 0, 0),
      leftUpperLeg: d(122, 2, 2), rightUpperLeg: d(122, -2, -2),
      leftLowerLeg: d(-146, 0, 0), rightLowerLeg: d(-146, 0, 0),
      leftFoot: d(20, 0, 0), rightFoot: d(20, 0, 0),
    },
    arms: { L: arm(0.22, -0.42, 0.88, 1.55, { twist: 0.2 }), R: arm(0.22, -0.42, 0.88, 1.55, { twist: 0.2 }) },
    curl: [0.6, 0.6],
  },
  // the same, head up, peeking over the knees (Rei)
  sitUp: {
    hips: [0, -0.66, 0.05],
    b: {
      hips: d(-8, 0, 0),
      spine: d(-16, 0, 0), chest: d(-10, 0, 0), neck: d(4, 0, 0), head: d(6, 0, 0),
      leftUpperLeg: d(122, 2, 2), rightUpperLeg: d(122, -2, -2),
      leftLowerLeg: d(-146, 0, 0), rightLowerLeg: d(-146, 0, 0),
      leftFoot: d(20, 0, 0), rightFoot: d(20, 0, 0),
    },
    arms: { L: arm(0.22, -0.42, 0.88, 1.55, { twist: 0.2 }), R: arm(0.22, -0.42, 0.88, 1.55, { twist: 0.2 }) },
    curl: [0.6, 0.6],
  },

  // chorus key poses: standing on the left leg, right knee up (the MV's "flamingo"), glowsticks
  danceA: { // right arm up high, left arm out low
    hips: [0, -0.03, 0],
    b: {
      hips: d(0, 10, -4), spine: d(-4, -6, 3), chest: d(-2, -4, 3), head: d(4, 10, -6),
      leftUpperLeg: d(-4, 0, 2), leftLowerLeg: d(-6, 0, 0),
      rightUpperLeg: d(62, -10, -38), rightLowerLeg: d(-110, 0, 0), rightFoot: d(30, 0, 0),
    },
    arms: { L: arm(1, -0.5, 0.2, 0.3), R: arm(0.3, 1, 0.15, 0.35) },
    curl: [0.9, 0.9],
  },
  danceB: { // both arms out wide, chest open
    hips: [0, -0.03, 0],
    b: {
      hips: d(0, -6, 3), spine: d(4, 4, -2), chest: d(4, 2, -2), head: d(8, -8, 6),
      leftUpperLeg: d(-4, 0, 2), leftLowerLeg: d(-6, 0, 0),
      rightUpperLeg: d(66, -14, -34), rightLowerLeg: d(-118, 0, 0), rightFoot: d(30, 0, 0),
    },
    arms: { L: arm(1, 0.3, 0.2, 0.15), R: arm(1, 0.3, 0.2, 0.15) },
    curl: [0.9, 0.9],
  },
  danceC: { // left arm up, right arm across the body, leaning
    hips: [0, -0.04, 0],
    b: {
      hips: d(0, -12, 4), spine: d(-6, 8, -4), chest: d(-4, 6, -4), head: d(-6, -12, 8),
      leftUpperLeg: d(-4, 0, 2), leftLowerLeg: d(-8, 0, 0),
      rightUpperLeg: d(58, -6, -40), rightLowerLeg: d(-104, 0, 0), rightFoot: d(30, 0, 0),
    },
    arms: { L: arm(0.35, 1, 0.1, 0.4), R: arm(0.15, -0.25, 1, 1.1) },
    curl: [0.9, 0.9],
  },
  danceD: { // singing into the right fist (the "shout" frames), left arm out
    hips: [0, -0.05, 0],
    b: {
      hips: d(0, 8, 0), spine: d(-10, -4, 0), chest: d(-8, -4, 0), head: d(-4, 6, 0),
      leftUpperLeg: d(-4, 0, 2), leftLowerLeg: d(-8, 0, 0),
      rightUpperLeg: d(64, -12, -36), rightLowerLeg: d(-114, 0, 0), rightFoot: d(30, 0, 0),
    },
    arms: { L: arm(1, -0.15, 0.3, 0.3), R: arm(0.35, -0.7, 0.55, 2.2) },
    curl: [0.9, 1],
  },

  // close-up: right hand raised to the camera, palm out
  reach: {
    hips: [0, 0, 0],
    b: { spine: d(-4, 0, 0), chest: d(-4, -8, 0), head: d(-6, 6, 4) },
    arms: { L: arm(0.25, -1, 0.05, 0.2), R: arm(0.2, 0.3, 1, 0.2, { flex: -1.2 }) },
    curl: [0.4, 0.05],
  },
  // both hands pressed to the headset
  headset: {
    hips: [0, 0, 0],
    b: { spine: d(-2, 0, 0), head: d(-4, 0, 0) },
    arms: { L: arm(0.8, 0.1, 0.45, 2.3, { twist: 1.5 }), R: arm(0.8, 0.1, 0.45, 2.3, { twist: 1.5 }) },
    curl: [0.25, 0.25],
  },
  headsetB: {
    hips: [0, 0, 0],
    b: { spine: d(-2, 0, 0), head: d(-4, 0, 0) },
    arms: { L: arm(0.8, 0.1, 0.45, 2.3, { twist: -1.5 }), R: arm(0.8, 0.1, 0.45, 2.3, { twist: -1.5 }) },
    curl: [0.25, 0.25],
  },
};

// ---------- chorus "drawings" ----------
// Rei: standing on her left leg, right knee raised in front (the MV's flamingo), a penlight in
// each fist. Corrupt-Chan: standing on her left leg, right leg bent back behind her (a raised
// knee would push through her skirt), one penlight in her right fist.
const REI_LEGS = { leftUpperLeg: d(-4, 0, 2), leftLowerLeg: d(-6, 0, 0), rightUpperLeg: d(64, -12, -30), rightLowerLeg: d(-112, 0, 0), rightFoot: d(30, 0, 0) };
const CC_LEGS = { leftUpperLeg: d(-2, 0, 2), leftLowerLeg: d(-4, 0, 0), rightUpperLeg: d(14, -4, -6), rightLowerLeg: d(-104, 0, 0), rightFoot: d(-20, 0, 0) };
const chor = (legs, hips, b, L, Rr, curl = [0.92, 0.92]) => ({ hips: [0, -0.03, 0], b: { ...legs, hips: d(...hips), ...b }, arms: { L, R: Rr }, curl });
Object.assign(POSES, {
  // both arms up in a V, chin up
  R_V: chor(REI_LEGS, [0, 6, 0], { spine: d(4, 0, 0), chest: d(6, 0, 0), head: d(10, 0, 4) }, arm(0.55, 1, 0.12, 0.25), arm(0.55, 1, 0.12, 0.25)),
  // arms spread wide, slightly up
  R_spread: chor(REI_LEGS, [0, -6, 2], { spine: d(2, 4, -2), chest: d(2, 2, -3), head: d(4, -8, 8) }, arm(1, 0.25, 0.15, 0.2), arm(1, 0.25, 0.15, 0.2)),
  // spread, lower, leaning the other way
  R_spread2: chor(REI_LEGS, [0, 8, -3], { spine: d(-2, -4, 4), chest: d(-2, -2, 4), head: d(2, 10, -9) }, arm(1, -0.05, 0.25, 0.35), arm(1, 0.05, 0.2, 0.3)),
  // leaning to her left, right arm up, left arm out low
  R_lean: chor(REI_LEGS, [0, -10, 6], { spine: d(-4, 6, 8), chest: d(-2, 4, 6), head: d(-2, -10, 10) }, arm(1, -0.55, 0.15, 0.3), arm(0.35, 1, 0.15, 0.35)),
  // the shout: right fist to the mouth, left arm flung out
  R_shout: chor(REI_LEGS, [0, 8, 0], { spine: d(-10, -4, 0), chest: d(-8, -4, 0), head: d(-6, 6, 0) }, arm(1, -0.1, 0.3, 0.3), arm(0.35, -0.7, 0.55, 2.2), [0.92, 1]),

  // right arm straight up with the penlight, left arm out low, hand open
  C_up: chor(CC_LEGS, [0, -8, 0], { spine: d(0, -4, -3), chest: d(2, -4, -3), head: d(6, -12, -8) }, arm(1, -0.35, 0.1, 0.3), arm(0.15, 1, 0.08, 0.15), [0.25, 0.92]),
  C_spread: chor(CC_LEGS, [0, 6, -2], { spine: d(2, 4, 2), chest: d(4, 2, 2), head: d(6, 8, 6) }, arm(1, 0.15, 0.12, 0.2), arm(1, 0.2, 0.12, 0.2), [0.25, 0.92]),
  C_spreadHi: chor(CC_LEGS, [0, -4, 3], { spine: d(4, -2, -2), chest: d(6, -2, -3), head: d(10, -6, -6) }, arm(1, 0.5, 0.15, 0.3), arm(1, 0.55, 0.15, 0.3), [0.25, 0.92]),
  C_spreadLo: chor(CC_LEGS, [0, 10, 4], { spine: d(-4, 6, 5), chest: d(-2, 4, 4), head: d(2, 12, 8) }, arm(1, -0.2, 0.2, 0.35), arm(1, -0.1, 0.25, 0.3), [0.25, 0.92]),
  C_shout: chor(CC_LEGS, [0, -6, 0], { spine: d(-10, 4, 0), chest: d(-8, 4, 0), head: d(-6, -6, 0) }, arm(0.4, -0.7, 0.55, 2.0), arm(1, 0.05, 0.3, 0.3), [0.9, 0.92]),
});

// both fists clenched in front of her chest (the second verse, "さあ、強く、派手に")
Object.assign(POSES, {
  fists: { hips: [0, 0, 0], b: { spine: d(-3, 0, 0), chest: d(-2, 0, 0), head: d(-4, 0, 0) }, arms: { L: arm(0.3, -0.85, 0.3, 1.85, { twist: 0.3 }), R: arm(0.3, -0.85, 0.3, 1.85, { twist: 0.3 }) }, curl: [1, 1] },
  fists2: { hips: [0, 0, 0], b: { spine: d(-3, 0, 0), chest: d(-2, 0, 0), head: d(-4, 0, 0) }, arms: { L: arm(0.25, -0.9, 0.2, 2.1, { twist: 0.5 }), R: arm(0.25, -0.9, 0.2, 2.1, { twist: 0.5 }) }, curl: [1, 1] },
});

// a hand-drawn variant of a pose: small deterministic changes (k = 0 is the pose itself)
export function vary(p, k, amt = 1) {
  if (!k) return p;
  const h = (i) => (Math.sin(k * 12.9898 + i * 78.233) * 43758.5453) % 1;
  const a = amt * 0.07;
  const out = addPose(p, { head: [h(1) * a, h(2) * a * 1.4, h(3) * a], chest: [h(4) * a * 0.5, h(5) * a * 0.6, h(6) * a * 0.5], hips_pos: [0, -Math.abs(h(7)) * 0.012 * amt, 0] });
  if (out.arms) for (const s of ["L", "R"]) { out.arms[s] = { ...out.arms[s], up: out.arms[s].up + h(8 + (s === "L" ? 0 : 1)) * 0.12 * amt, bend: out.arms[s].bend + h(10) * 0.12 * amt }; }
  return out;
}

const FINGERS = ["Index", "Middle", "Ring", "Little"];
const PARTS = ["Proximal", "Intermediate", "Distal"];
const BONES = [
  "hips", "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot",
];

// blend two poses (t = 0..1); bones missing from one side count as rest
export function blendPose(a, b, t) {
  const out = { hips: [0, 0, 0], b: {}, curl: [0, 0] };
  for (let i = 0; i < 3; i++) out.hips[i] = (a.hips?.[i] || 0) * (1 - t) + (b.hips?.[i] || 0) * t;
  const names = new Set([...Object.keys(a.b || {}), ...Object.keys(b.b || {})]);
  for (const n of names) {
    const x = a.b?.[n] || [0, 0, 0], y = b.b?.[n] || [0, 0, 0];
    out.b[n] = [0, 1, 2].map((i) => x[i] * (1 - t) + y[i] * t);
  }
  for (let i = 0; i < 2; i++) out.curl[i] = (a.curl?.[i] || 0) * (1 - t) + (b.curl?.[i] || 0) * t;
  if (a.arms || b.arms) {
    out.arms = {};
    for (const k of ["L", "R"]) {
      const x = a.arms?.[k] || armFromEuler(a, k), y = b.arms?.[k] || armFromEuler(b, k);
      out.arms[k] = {};
      for (const f of ["out", "up", "fwd", "bend", "twist", "flex", "yaw"]) out.arms[k][f] = (x[f] || 0) * (1 - t) + (y[f] || 0) * t;
    }
  }
  return out;
}
// poses without an arms block keep the arms near the sides
const armFromEuler = () => ({ out: 0.25, up: -1, fwd: 0.05, bend: 0.2 });

const SWAP = (n) => (n.startsWith("left") ? "right" + n.slice(4) : n.startsWith("right") ? "left" + n.slice(5) : n);
export function mirrorPose(p) {
  const out = { hips: [-(p.hips?.[0] || 0), p.hips?.[1] || 0, p.hips?.[2] || 0], b: {}, curl: [p.curl?.[1] || 0, p.curl?.[0] || 0] };
  if (p.arms) out.arms = { L: { ...p.arms.R }, R: { ...p.arms.L } };
  for (const [n, r] of Object.entries(p.b || {})) out.b[SWAP(n)] = [r[0], -r[1], -r[2]];
  return out;
}

// extra offsets layered on a pose: { bone: [x, y, z] } added in radians
export function addPose(p, extra) {
  const out = { hips: [...(p.hips || [0, 0, 0])], b: { ...p.b }, curl: [...(p.curl || [0, 0])] };
  if (p.arms) out.arms = { L: { ...p.arms.L }, R: { ...p.arms.R } };
  for (const [n, r] of Object.entries(extra || {})) {
    if (n === "hips_pos") { for (let i = 0; i < 3; i++) out.hips[i] += r[i]; continue; }
    const base = out.b[n] || [0, 0, 0];
    out.b[n] = [base[0] + r[0], base[1] + r[1], base[2] + r[2]];
  }
  return out;
}

const restHips = new WeakMap();
const _v = new THREE.Vector3(), _rest = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
export function applyPose(vrm, p) {
  const H = vrm.humanoid;
  const hipsNode = H.getNormalizedBoneNode("hips");
  if (!restHips.has(vrm)) restHips.set(vrm, hipsNode.position.clone());
  const r0 = restHips.get(vrm);
  hipsNode.position.set(r0.x + (p.hips?.[0] || 0), r0.y + (p.hips?.[1] || 0), r0.z + (p.hips?.[2] || 0));
  for (const n of BONES) {
    const node = H.getNormalizedBoneNode(n);
    if (!node) continue;
    const r = p.b?.[n];
    if (r) node.rotation.set(r[0], r[1], r[2]); else node.rotation.set(0, 0, 0);
  }
  if (p.arms) {
    for (const [k, side] of [["L", "left"], ["R", "right"]]) {
      const A = p.arms[k]; if (!A) continue;
      const sg = side === "left" ? -1 : 1;
      _v.set(sg * A.out, A.up, -A.fwd);
      if (_v.lengthSq() < 1e-6) _v.set(sg, 0, 0);
      _v.normalize();
      _q.setFromUnitVectors(_rest.set(sg, 0, 0), _v);
      if (A.twist) { _q2.setFromAxisAngle(_v, sg * A.twist); _q.premultiply(_q2); }
      H.getNormalizedBoneNode(side + "UpperArm").quaternion.copy(_q);
      H.getNormalizedBoneNode(side + "LowerArm").rotation.set(0, sg * A.bend, 0);
      H.getNormalizedBoneNode(side + "Hand").rotation.set(0, -sg * (A.yaw || 0), -sg * (A.flex || 0));
      const sh = H.getNormalizedBoneNode(side + "Shoulder");
      if (sh && !p.b?.[side + "Shoulder"]) sh.rotation.set(0, 0, -sg * 0.18 * Math.max(0, Math.min(1, A.up)));
    }
  }
  for (const [side, sgn, k] of [["left", 1, 0], ["right", -1, 1]]) {
    const c = p.curl?.[k] || 0;
    for (const f of FINGERS) for (let j = 0; j < 3; j++) {
      const node = H.getNormalizedBoneNode(`${side}${f}${PARTS[j]}`);
      if (node) node.rotation.set(0, 0, sgn * c * (j === 0 ? 1.25 : 1.4));
    }
    const th = H.getNormalizedBoneNode(`${side}ThumbIntermediate`);
    if (th) th.rotation.set(0, -sgn * c * 0.6, 0);
  }
}

export const POSE_NAMES = Object.keys(POSES);
export { THREE };
