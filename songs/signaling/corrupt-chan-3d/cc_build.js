// Corrupt-Chan, assembled from two CC0 VRoid models (Darkness Shibu's body/outfit, Sendagaya Shino's
// hair) with repainted textures, plus an Adachi Rei-style headset, android joint seams and glitches.
// buildCorruptChan(libs, {body, hair}) -> { root, vrm, update(dt, t, opts), joints }
export async function buildCorruptChan({ THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils }, urls) {
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const load = (x) => (x instanceof ArrayBuffer ? loader.parseAsync(x, "") : loader.loadAsync(x));
  const [gb, gh] = await Promise.all([load(urls.body), load(urls.hair)]);
  const vrm = gb.userData.vrm, hv = gh.userData.vrm;
  VRMUtils.rotateVRM0(vrm); VRMUtils.rotateVRM0(hv);
  vrm.scene.updateMatrixWorld(true); hv.scene.updateMatrixWorld(true);
  const root = vrm.scene;

  // MToon outlines make a mesh's material a [surface, outline] array
  const matName = (o) => [].concat(o.material || []).map((m) => m.name || "").join(" ");
  // body: hide its own hair (her hair comes from the second model)
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (/HAIR/.test(matName(o))) o.visible = false;
  });

  // move Shino's hair bones under this body's head bone, keeping their place relative to the head
  const byName = {};
  root.traverse((o) => { if (o.isBone || o.type === "Bone") byName[o.name] = o; });
  const headB = byName["J_Bip_C_Head"];
  let hHead = null;
  hv.scene.traverse((o) => { if (o.name === "J_Bip_C_Head") hHead = o; });
  const hairRoots = hHead.children.filter((c) => /Hair/i.test(c.name));
  for (const hb of hairRoots) headB.add(hb);            // same local transform under the new head
  // spring-bone colliders: re-attach to the matching body bones so the hair collides with this body
  if (hv.springBoneManager) {
    for (const g of hv.springBoneManager.colliderGroups || []) {
      for (const c of g.colliders) {
        const p = c.parent && byName[c.parent.name];
        if (p) p.add(c);
      }
    }
  }
  // hair meshes: rebind to this body's bones (hair bones are the moved ones, the rest by name)
  const hairMeshes = [];
  hv.scene.traverse((o) => { if (o.isSkinnedMesh && /HAIR/.test(matName(o))) hairMeshes.push(o); });
  // hair colour: white material, the gradient comes from vertex colours (set below, by height)
  for (const m of hairMeshes) for (const mat of [].concat(m.material)) {
    if (mat.color) mat.color.setRGB(1, 1, 1);
    if (mat.shadeColorFactor) mat.shadeColorFactor.setRGB(0.7, 0.62, 0.86);
    mat.vertexColors = true; if ("ignoreVertexColor" in mat) mat.ignoreVertexColor = false; mat.needsUpdate = true;
  }
  for (const m of hairMeshes) {
    const sk = m.skeleton;
    const bones = sk.bones.map((b) => (/Hair/i.test(b.name) ? b : byName[b.name] || b));
    m.bind(new THREE.Skeleton(bones, sk.boneInverses.map((x) => x.clone())), m.bindMatrix.clone());
    root.add(m);
  }
  if (hv.springBoneManager) hv.springBoneManager.setInitState();

  // relaxed pose: arms down from the T-pose
  const H = vrm.humanoid;
  const nb = (n) => H.getNormalizedBoneNode(n);
  nb("leftUpperArm").rotation.z = 1.15; nb("rightUpperArm").rotation.z = -1.15;
  nb("leftLowerArm").rotation.z = 0.12; nb("rightLowerArm").rotation.z = -0.12;
  nb("leftLowerArm").rotation.y = -0.15; nb("rightLowerArm").rotation.y = 0.15;
  vrm.update(0);
  root.updateMatrixWorld(true);

  // measure the head from the hair cap so the headset fits over the hair
  const headPos = headB.getWorldPosition(new THREE.Vector3());
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const m of hairMeshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 7) {
      m.boneTransform ? m.boneTransform(i, v.fromBufferAttribute(pos, i)) : m.applyBoneTransform(i, v.fromBufferAttribute(pos, i));
      v.applyMatrix4(m.matrixWorld);
      if (v.y > headPos.y + 0.02 && v.y < headPos.y + 0.24 && Math.abs(v.z - headPos.z) < 0.09) box.expandByPoint(v);
    }
  }
  const top = box.max.y, halfW = (box.max.x - box.min.x) / 2, cx = (box.max.x + box.min.x) / 2;
  // night purple at the crown, violet through the middle, lavender at the tips (as in the mockup)
  {
    const cTop = new THREE.Color(0x1f0f36), cMid = new THREE.Color(0x8048dc), cTip = new THREE.Color(0xf0dcff);
    let yMin = Infinity;
    const ys = hairMeshes.map((m) => {
      const pos = m.geometry.attributes.position, arr = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        m.applyBoneTransform(i, v.fromBufferAttribute(pos, i)); v.applyMatrix4(m.matrixWorld);
        arr[i] = v.y; if (v.y < yMin) yMin = v.y;
      }
      return arr;
    });
    const yTop = top - 0.02;
    hairMeshes.forEach((m, k) => {
      const n = ys[k].length, col = new Float32Array(n * 3), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const h = Math.min(1, Math.max(0, (yTop - ys[k][i]) / (yTop - yMin)));
        if (h < 0.38) c.copy(cTop).lerp(cMid, Math.pow(h / 0.38, 1.3)); else c.copy(cMid).lerp(cTip, (h - 0.38) / 0.62);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      m.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
    });
  }

  // ---------- Adachi Rei-style headset, in white (from the mockup) ----------
  const mt = (color, emissive) => new THREE.MeshToonMaterial({ color, emissive: emissive || 0x000000 });
  const white = mt(0xf0eff4), grey = mt(0x8e8c99), dark = mt(0x2a2730), led = new THREE.MeshBasicMaterial({ color: 0xff1fe0 });
  const chk = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 2;
    const g = c.getContext("2d"); g.fillStyle = "#000"; g.fillRect(0, 0, 2, 2); g.fillStyle = "#ff00dc"; g.fillRect(0, 0, 1, 1); g.fillRect(1, 1, 1, 1);
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const missing = (rx, ry) => { const t = chk.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshBasicMaterial({ map: t }); };
  const set = new THREE.Group(); set.name = "headset";
  headB.add(set);
  const toHead = (w) => headB.worldToLocal(w.clone());
  const earY = headPos.y + (top - headPos.y) * 0.3;
  const earX = halfW + 0.012;
  // band: an arc over the head from ear to ear
  const arc = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI * i / 24;
    arc.push(toHead(new THREE.Vector3(cx + Math.cos(a) * earX, earY + Math.sin(a) * (top - earY + 0.02), headPos.z - 0.01)));
  }
  set.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 48, 0.0075, 10, false), white));
  set.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc.map((p) => p.clone().multiplyScalar(0.985))), 48, 0.0045, 8, false), grey));
  const leds = [], patches = [];
  for (const sgn of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.copy(toHead(new THREE.Vector3(cx + sgn * earX, earY, headPos.z - 0.01)));
    set.add(ear);
    const along = (g) => g.rotateZ(Math.PI / 2);
    ear.add(new THREE.Mesh(along(new THREE.CylinderGeometry(0.03, 0.033, 0.026, 40)), white));
    ear.add(new THREE.Mesh(along(new THREE.CylinderGeometry(0.021, 0.024, 0.01, 36)).translate(sgn * 0.016, 0, 0), grey));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0262, 0.0024, 8, 56).rotateY(Math.PI / 2).translate(sgn * 0.0135, 0, 0), led);
    ear.add(ring); leds.push(ring);
    const inlay = new THREE.Mesh(new THREE.CircleGeometry(0.014, 32).rotateY(sgn * Math.PI / 2).translate(sgn * 0.0215, 0, 0), missing(6, 6));
    ear.add(inlay); patches.push(inlay);
    if (sgn < 0) {
      // her right: twin antenna rods angled up and back, as on Rei's headset
      for (const dz of [-0.008, 0.008]) {
        const rod = new THREE.Group(); rod.position.set(sgn * 0.004, 0.03, -0.012 + dz); rod.rotation.set(-0.35, 0, sgn * -0.12); ear.add(rod);
        rod.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0042, 0.13, 10).translate(0, 0.065, 0), dark));
        rod.add(new THREE.Mesh(new THREE.SphereGeometry(0.0052, 12, 10).translate(0, 0.131, 0), white));
      }
    } else {
      // her left: a white sensor ball on a short arm
      const arm = new THREE.Group(); arm.position.set(sgn * 0.01, 0.028, 0.01); arm.rotation.set(0.5, 0, sgn * -0.5); ear.add(arm);
      arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.045, 10).translate(0, 0.0225, 0), dark));
      arm.add(new THREE.Mesh(new THREE.SphereGeometry(0.0115, 20, 16).translate(0, 0.05, 0), white));
      arm.add(new THREE.Mesh(new THREE.TorusGeometry(0.0118, 0.0016, 6, 32).rotateX(Math.PI / 2).translate(0, 0.05, 0), led));
    }
  }

  // ---------- android seams at the knees ----------
  const seamMat = new THREE.MeshBasicMaterial({ color: 0x3b2a42 });
  const seams = [["leftLowerLeg", 0.0405, 0.004], ["rightLowerLeg", 0.0405, 0.004]];   // ankles are under the socks
  for (const [bn, r, up] of seams) {
    const b = H.getRawBoneNode(bn);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0017, 6, 40).rotateX(Math.PI / 2), seamMat);
    ring.position.y = up; b.add(ring);
  }

  // ---------- glitch: parts briefly fail to load their texture ----------
  const flashMat = missing(24, 24);
  const flashables = [];
  root.traverse((o) => { if (o.isMesh && o.visible && /CLOTH|HAIR|SKIN/.test(matName(o))) flashables.push(o); });
  set.traverse((o) => { if (o.isMesh && o.material === white) flashables.push(o); });
  let flashT = 2, flashUntil = 0, flashed = [];
  function update(dt, t, opts = {}) {
    vrm.update(dt);
    if (hv.springBoneManager) hv.springBoneManager.update(dt);
    const glitch = opts.glitch !== false;
    for (const l of leds) l.material.color.setHex(glitch && Math.sin(t * 9) > 0.93 ? 0xffffff : 0xff1fe0);
    for (const p of patches) { const s = Math.floor(t * 6); p.material.map.offset.set(glitch && s % 5 === 0 ? 0.5 : 0, 0); }
    if (glitch && t > flashT) {
      flashed = [];
      const n = 1 + Math.floor(Math.random() * 2);
      for (let k = 0; k < n; k++) { const m = flashables[Math.floor(Math.random() * flashables.length)]; flashed.push([m, m.material]); m.material = flashMat; }
      flashUntil = t + 0.08 + Math.random() * 0.08; flashT = t + 1.8 + Math.random() * 2.8;
    }
    if (flashed.length && (t > flashUntil || !glitch)) { for (const [m, mat] of flashed) m.material = mat; flashed = []; }
  }
  return { root, vrm, hairVrm: hv, update, headset: set, humanoid: H };
}
