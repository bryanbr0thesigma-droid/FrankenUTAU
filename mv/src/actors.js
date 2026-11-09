// A performer: one VRM (Corrupt-Chan or Ping) with its rig, face and the points the camera needs.
import * as THREE from "three";
import { Rig, mirrorPose } from "./dance.js";
import { clamp, hash1 } from "./util.js";

export class Actor {
  constructor(key, voiceKey, built, { mirror = false, seed = 0 } = {}) {
    this.key = key; this.voiceKey = voiceKey; this.built = built; this.vrm = built.vrm;
    this.group = new THREE.Group(); this.group.add(built.root);
    this.rig = new Rig(built.vrm);
    this.mirror = mirror; this.seed = seed;
    this.head = new THREE.Vector3(); this.chest = new THREE.Vector3(); this.hips = new THREE.Vector3();
    this.handL = new THREE.Vector3(); this.handR = new THREE.Vector3();
    this.pos = this.group.position; this.facing = 0;
    const H = built.vrm.humanoid;
    this.raw = { head: H.getRawBoneNode("head"), chest: H.getRawBoneNode("upperChest") || H.getRawBoneNode("chest"), hips: H.getRawBoneNode("hips"), handL: H.getRawBoneNode("leftHand"), handR: H.getRawBoneNode("rightHand") };
    // blinks at irregular, fixed times
    this.blinks = [];
    for (let tb = 1.2 + hash1(seed) * 2, i = 0; tb < 400; i++) { this.blinks.push(tb); tb += 2.2 + hash1(seed * 13 + i) * 3.4; }
  }
  place(x, z, facing, spin) {
    this.group.position.set(x, 0, z);
    this.facing = facing;
    this.group.rotation.set(0, facing + spin, 0);
  }
  pose(P) { this.rig.apply(this.mirror ? mirrorPose(P) : P); }
  face(tl, t, F) {
    const em = this.vrm.expressionManager;
    if (!em) return;
    const L = tl.loud(this.voiceKey, t);
    const v = tl.vowel(this.voiceKey, t);
    const open = clamp(L * 1.15) * 0.85;
    const names = ["aa", "ih", "ou", "ee", "oh"];
    names.forEach((n, i) => em.setValue(n, open * v[i] * (i === 0 ? 1.15 : 1)));
    // blink
    let b = 0;
    for (const tb of this.blinks) { const d = t - tb; if (d > -0.08 && d < 0.1) { b = 1 - Math.abs(d + (d < 0 ? 0 : -0.02)) / 0.1; break; } if (tb > t + 1) break; }
    const happy = F.happy || 0;
    em.setValue("blink", clamp(b) * (1 - happy) + (F.lids || 0) * (1 - b));
    em.setValue("relaxed", clamp(F.smile || 0) * (1 - open * 0.5));
    em.setValue("happy", happy);
    em.setValue("sad", F.sad || 0);
    em.setValue("angry", F.angry || 0);
  }
  step(dt, t, opts) { this.built.update(dt, t, opts); }
  refresh() {
    this.group.updateMatrixWorld(true);
    this.raw.head.getWorldPosition(this.head);
    this.raw.chest.getWorldPosition(this.chest);
    this.raw.hips.getWorldPosition(this.hips);
    this.raw.handL.getWorldPosition(this.handL);
    this.raw.handR.getWorldPosition(this.handR);
  }
  resetSprings() {
    this.vrm.springBoneManager?.reset();
    this.built.hairVrm?.springBoneManager?.reset();
  }
}
