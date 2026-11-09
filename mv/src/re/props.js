// Toon material helper (two-step ramp) and the concert penlight. The other props are 3moji models,
// see models.js.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { addOutlines } from "../toon.js";
import { CC, hex } from "./palette.js";

const ramp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 255, 255, 255, 255]), 2, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
})();
export const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: ramp, ...o });

const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };

// A concert penlight (the MV's glowsticks): strap ring, ridged grip with two buttons, collar,
// and a clear blade with a bright core. Blade along +y from the collar; grip below. Returns a
// Group with userData.blade (the glowing parts) and setColor(hex).
export function buildPenlight(color, { scale = 1, outline = true } = {}) {
  const g = new THREE.Group();
  const body = toon(0xf2f0f8), dark = toon(0x2a2638), rubber = toon(0x3a3550);
  const L = 0.2, r = 0.0135;
  // grip
  g.add(mesh(new THREE.CylinderGeometry(0.0155, 0.0145, 0.11, 20), body, 0, -0.055, 0));
  for (let i = 0; i < 6; i++) g.add(mesh(new THREE.TorusGeometry(0.0158, 0.0022, 6, 20).rotateX(Math.PI / 2), rubber, 0, -0.1 + i * 0.011, 0));
  g.add(mesh(new RoundedBoxGeometry(0.012, 0.022, 0.008, 2, 0.003), dark, 0, -0.03, 0.015));
  g.add(mesh(new RoundedBoxGeometry(0.009, 0.012, 0.007, 2, 0.003), toon(hex(CC.text)), 0, -0.006, 0.015));
  g.add(mesh(new THREE.CylinderGeometry(0.0125, 0.0155, 0.012, 20), dark, 0, -0.116, 0));
  g.add(mesh(new THREE.TorusGeometry(0.009, 0.0025, 6, 16), dark, 0, -0.13, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.0175, 0.0158, 0.016, 20), body, 0, 0.004, 0));
  // blade: bright core inside a tinted clear shell, rounded tip
  const core = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const shell = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const coreM = mesh(new THREE.CapsuleGeometry(r * 0.45, L - r, 4, 12), core, 0, 0.012 + L / 2, 0);
  const shellM = mesh(new THREE.CapsuleGeometry(r, L - r, 6, 20), shell, 0, 0.012 + L / 2, 0);
  coreM.userData.noOutline = true; shellM.userData.noOutline = true;
  coreM.userData.blade = true; shellM.userData.blade = true;
  g.add(shellM, coreM);
  if (outline) addOutlines(g, { color: 0x140c26 });
  g.userData.blade = [shellM, coreM];
  g.userData.setColor = (c) => shell.color.set(c);
  g.scale.setScalar(scale);
  return g;
}
