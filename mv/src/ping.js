// Ping: an original companion character for this MV, built from the two CC0 VRoid samples in the
// zip the other way round from Corrupt-Chan: Sendagaya Shino's body and outfit with Darkness Shibu's
// bob haircut, all recoloured (cobalt-to-ice hair, white top, cobalt skirt, acid-lime accents),
// plus her own accessories: a floating halo with signal bars and two radio fins that send out
// arcs while she sings. No headset and no android seams, so she reads as her own character.
// buildPing(libs, {base, hair}) -> { root, vrm, update(dt, t, opts), applyVoice(level) }
const matName = (o) => [].concat(o.material || []).map((m) => m.name || "").join(" ");

export async function buildPing({ THREE, GLTFLoader, VRMLoaderPlugin, VRMUtils }, urls) {
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const [gb, gh] = await Promise.all([loader.loadAsync(urls.base), loader.loadAsync(urls.hair)]);
  const vrm = gb.userData.vrm, hv = gh.userData.vrm;
  VRMUtils.rotateVRM0(vrm); VRMUtils.rotateVRM0(hv);
  vrm.scene.updateMatrixWorld(true); hv.scene.updateMatrixWorld(true);
  const root = vrm.scene;

  root.traverse((o) => { if (o.isMesh && /HAIR/.test(matName(o))) o.visible = false; });

  // ---- hair transplant: donor hair bones go under this body's head bone ----
  const byName = {};
  root.traverse((o) => { if (o.isBone || o.type === "Bone") byName[o.name] = o; });
  const headB = byName["J_Bip_C_Head"];
  let hHead = null;
  hv.scene.traverse((o) => { if (o.name === "J_Bip_C_Head") hHead = o; });
  for (const hb of hHead.children.filter((c) => /Hair/i.test(c.name))) headB.add(hb);
  if (hv.springBoneManager) {
    for (const g of hv.springBoneManager.colliderGroups || []) {
      for (const c of g.colliders) { const p = c.parent && byName[c.parent.name]; if (p) p.add(c); }
    }
  }
  const hairMeshes = [];
  hv.scene.traverse((o) => { if (o.isSkinnedMesh && /HAIR/.test(matName(o))) hairMeshes.push(o); });
  for (const m of hairMeshes) {
    const sk = m.skeleton;
    const bones = sk.bones.map((b) => (/Hair/i.test(b.name) ? b : byName[b.name] || b));
    m.bind(new THREE.Skeleton(bones, sk.boneInverses.map((x) => x.clone())), m.bindMatrix.clone());
    root.add(m);
  }
  if (hv.springBoneManager) hv.springBoneManager.setInitState();

  const H = vrm.humanoid;
  vrm.update(0);
  root.updateMatrixWorld(true);

  // ---- recolour the body (Shino's own textures are flat placeholders, so colours carry the look) ----
  const C = (h) => new THREE.Color(h);
  const tiny = (tex) => tex && tex.image && tex.image.width <= 4;
  const paint = (mat, color, shade, opts = {}) => {
    if (tiny(mat.map)) mat.map = null;
    if (tiny(mat.shadeMultiplyTexture)) mat.shadeMultiplyTexture = null;
    if (mat.color) mat.color.copy(C(color));
    if (mat.shadeColorFactor) mat.shadeColorFactor.copy(C(shade));
    if ("matcapFactor" in mat && mat.matcapFactor) mat.matcapFactor.setRGB(0, 0, 0);
    if (mat.parametricRimColorFactor) mat.parametricRimColorFactor.copy(C(opts.rim ?? 0x000000));
    if (opts.emissive != null && mat.emissive) { mat.emissive.copy(C(opts.emissive)); if ("emissiveIntensity" in mat) mat.emissiveIntensity = opts.ei ?? 1; }
    if (opts.outline != null && mat.outlineColorFactor) mat.outlineColorFactor.copy(C(opts.outline));
    mat.needsUpdate = true;
  };
  const irisTex = (() => {
    const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#0a1440"; g.fillRect(0, 0, 1024, 512);
    for (const cx of [256, 770]) {
      const cy = 256;
      const grad = g.createLinearGradient(0, cy - 134, 0, cy + 134);
      grad.addColorStop(0, "#081a5c"); grad.addColorStop(0.45, "#2457ff"); grad.addColorStop(0.85, "#7fb6ff"); grad.addColorStop(1, "#d9f0ff");
      g.fillStyle = grad; g.beginPath(); g.ellipse(cx, cy, 124, 134, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#b6ff2e"; g.lineWidth = 7; g.beginPath(); g.ellipse(cx, cy + 4, 100, 110, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = "rgba(4,10,40,0.9)"; g.lineWidth = 10; g.beginPath(); g.ellipse(cx, cy, 122, 132, 0, 0, Math.PI * 2); g.stroke();
      // pupil: a small four-point star, her "signal" mark
      g.fillStyle = "#050a24"; g.beginPath(); g.ellipse(cx, cy - 6, 30, 46, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#c8ff5a"; g.beginPath();
      const s = 15; g.moveTo(cx, cy - 6 - s * 1.6); g.lineTo(cx + s * 0.35, cy - 6); g.lineTo(cx, cy - 6 + s * 1.6); g.lineTo(cx - s * 0.35, cy - 6); g.closePath(); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
  })();
  root.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    for (const mat of [].concat(o.material)) {
      const n = mat.name || "";
      if (/HAIR/.test(n)) continue;
      if (/Face_00_SKIN|Body_00_SKIN/.test(n)) paint(mat, 0xffe7dc, 0xf2b7ae, { outline: 0x7a4a52 });
      else if (/Tops/.test(n)) paint(mat, 0xf4f6ff, 0x9fb0ee, { outline: 0x1a2350 });
      else if (/Bottoms/.test(n)) paint(mat, 0x2443e0, 0x0f1c7a, { outline: 0x060b30, rim: 0x203cff });
      else if (/Accessory/.test(n)) paint(mat, 0xb6ff2e, 0x5f9a10, { emissive: 0x6fbf10, ei: 0.8 });
      else if (/Shoes/.test(n)) paint(mat, 0x1b1d2a, 0x0b0c14, { outline: 0x000000 });
      else if (/EyeIris/.test(n)) { mat.map = irisTex; if (mat.color) mat.color.setRGB(1, 1, 1); if (mat.shadeColorFactor) mat.shadeColorFactor.setRGB(0.85, 0.85, 0.95); if (mat.shadeMultiplyTexture) mat.shadeMultiplyTexture = irisTex; mat.needsUpdate = true; }
      else if (/EyeWhite/.test(n)) paint(mat, 0xffffff, 0xe6ecff);
      else if (/FaceMouth/.test(n)) paint(mat, 0xd06a7a, 0x9a3f52);
      else if (/FaceBrow|Eyeline|Eyelash/.test(n)) { if (mat.color) mat.color.copy(C(0x2a3470)); mat.needsUpdate = true; }
    }
  });

  // ---- hair colour: vertex-colour gradient by height, cobalt crown -> electric blue -> ice tips ----
  const headPos = headB.getWorldPosition(new THREE.Vector3());
  const v = new THREE.Vector3();
  const box = new THREE.Box3();
  let yMin = Infinity, yMax = -Infinity;
  const ys = hairMeshes.map((m) => {
    const pos = m.geometry.attributes.position, arr = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      m.applyBoneTransform(i, v.fromBufferAttribute(pos, i)); v.applyMatrix4(m.matrixWorld);
      arr[i] = v.y; yMin = Math.min(yMin, v.y); yMax = Math.max(yMax, v.y);
      if (v.y > headPos.y + 0.02 && v.y < headPos.y + 0.24 && Math.abs(v.z - headPos.z) < 0.09) box.expandByPoint(v);
    }
    return arr;
  });
  {
    const cTop = C(0x0e1a5a), cMid = C(0x2f6bff), cTip = C(0xd2ecff), c = new THREE.Color();
    const yTop = yMax - 0.01;
    hairMeshes.forEach((m, k) => {
      const n = ys[k].length, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const h = Math.min(1, Math.max(0, (yTop - ys[k][i]) / (yTop - yMin)));
        if (h < 0.45) c.copy(cTop).lerp(cMid, Math.pow(h / 0.45, 1.2)); else c.copy(cMid).lerp(cTip, (h - 0.45) / 0.55);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      m.geometry.setAttribute("color", new THREE.BufferAttribute(col, 3));
      for (const mat of [].concat(m.material)) {
        if (tiny(mat.map)) mat.map = null;
        if (tiny(mat.shadeMultiplyTexture)) mat.shadeMultiplyTexture = null;
        if (mat.color) mat.color.setRGB(1, 1, 1);
        if (mat.shadeColorFactor) mat.shadeColorFactor.setRGB(0.55, 0.62, 0.9);
        if (mat.parametricRimColorFactor) mat.parametricRimColorFactor.setRGB(0.25, 0.45, 1.0);
        if (mat.outlineColorFactor) mat.outlineColorFactor.copy(C(0x050a2a));
        mat.vertexColors = true; if ("ignoreVertexColor" in mat) mat.ignoreVertexColor = false; mat.needsUpdate = true;
      }
    });
  }
  const top = box.max.y, halfW = (box.max.x - box.min.x) / 2, cx = (box.max.x + box.min.x) / 2;

  // ---- accessories (HDR colours > 1 so the post glow picks them up) ----
  const glow = (hex, k = 1) => { const c = C(hex); c.multiplyScalar(k); return c; };
  const limeMat = new THREE.MeshBasicMaterial({ color: glow(0xb6ff2e, 1.8) });
  const dimMat = new THREE.MeshBasicMaterial({ color: glow(0x1d2f7a, 1.0) });
  const toHead = (w) => headB.worldToLocal(w.clone());

  // halo: a tilted ring floating over the head with five signal bars on its back half
  const halo = new THREE.Group(); halo.name = "halo";
  halo.position.copy(toHead(new THREE.Vector3(cx, top + 0.075, headPos.z - 0.015)));
  headB.add(halo);
  const haloTilt = new THREE.Group(); haloTilt.rotation.x = -0.32; halo.add(haloTilt);
  haloTilt.add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.0042, 8, 72).rotateX(Math.PI / 2), limeMat));
  haloTilt.add(new THREE.Mesh(new THREE.TorusGeometry(0.084, 0.0022, 6, 72).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: glow(0x2f6bff, 2.0) })));
  const bars = [];
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.62 + i * 0.19); // across the back half
    const h = 0.014 + i * 0.009;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.011, h, 0.006).translate(0, h / 2, 0), dimMat.clone());
    m.position.set(Math.cos(a) * 0.1, 0.002, Math.sin(a) * 0.1);
    m.rotation.y = -a;
    haloTilt.add(m); bars.push(m);
  }

  // radio fins: slim swept-back blades above the ears, translucent blue with a lime edge
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(0.022, 0.012); finShape.lineTo(0.09, 0.05); finShape.lineTo(0.02, -0.004); finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.004, bevelEnabled: false }).translate(0, 0, -0.002);
  const finMat = new THREE.MeshBasicMaterial({ color: glow(0x3a74ff, 1.4), transparent: true, opacity: 0.75, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ color: glow(0xb6ff2e, 2.0) });
  const arcGeo = new THREE.TorusGeometry(1, 0.05, 4, 24, Math.PI * 0.55).rotateZ(-Math.PI * 0.275);
  const fins = [], arcs = [];
  const earY = headPos.y + (top - headPos.y) * 0.42;
  for (const sgn of [-1, 1]) {
    const mount = new THREE.Group();
    mount.position.copy(toHead(new THREE.Vector3(cx + sgn * (halfW + 0.004), earY, headPos.z - 0.012)));
    headB.add(mount);
    // blade points backwards (+z in the head's frame is the back for this VRM0 rig) and up
    const blade = new THREE.Group();
    blade.rotation.set(0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    blade.add(new THREE.Mesh(finGeo, finMat));
    blade.add(new THREE.LineSegments(new THREE.EdgesGeometry(finGeo), edgeMat));
    blade.rotation.z = 0.0;
    mount.add(blade);
    fins.push(blade);
    // arcs that ripple outwards from the fin while she sings
    const arcRoot = new THREE.Group(); arcRoot.position.set(sgn * 0.01, 0.01, 0);
    arcRoot.rotation.set(0, sgn > 0 ? 0 : Math.PI, 0); // arcs open outward along +-x
    mount.add(arcRoot);
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: glow(0xb6ff2e, 1.6), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      m.rotation.y = Math.PI / 2; m.visible = false; arcRoot.add(m); arcs.push(m);
    }
  }

  // wrist bands
  for (const side of ["left", "right"]) {
    const lower = H.getRawBoneNode(side + "LowerArm"), hand = H.getRawBoneNode(side + "Hand");
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.0035, 6, 32).rotateY(Math.PI / 2), limeMat);
    ring.position.copy(hand.position).multiplyScalar(0.82);
    lower.add(ring);
  }

  // ---- per-frame ----
  let voice = 0, voiceTimes = null;
  const barOn = glow(0xb6ff2e, 2.2), barOff = glow(0x1d2f7a, 1.0);
  function update(dt, t, opts = {}) {
    vrm.update(dt);
    if (hv.springBoneManager) hv.springBoneManager.update(dt);
    const lvl = opts.voice ?? 0;
    halo.position.y += 0; // halo rides on the head; give it its own slow bob and spin
    haloTilt.position.y = Math.sin(t * 1.7) * 0.006;
    haloTilt.rotation.y = t * 0.6;
    const lit = Math.round(Math.min(1, lvl * 1.25) * 5);
    bars.forEach((b, i) => { b.material.color.copy(i < lit ? barOn : barOff); b.scale.y = i < lit ? 1 + 0.25 * lvl : 1; });
    finMat.opacity = 0.55 + 0.35 * lvl;
    // arcs: one every eighth note while singing, each lives for 4 eighths
    if (opts.loudAt && opts.eighth) {
      const e = opts.eighth, cur = Math.floor(t / e);
      for (let side = 0; side < 2; side++) {
        for (let k = 0; k < 4; k++) {
          const idx = cur - k, born = idx * e, age = t - born;
          const L = opts.loudAt(born);
          const m = arcs[side * 4 + k];
          if (L > 0.3 && age >= 0) {
            const life = age / (4 * e);
            m.visible = true;
            const s = 0.025 + life * 0.11;
            m.scale.setScalar(s);
            m.material.opacity = (1 - life) * Math.min(1, L * 1.4) * 0.9;
          } else m.visible = false;
        }
      }
    }
  }
  return { root, vrm, hairVrm: hv, update, humanoid: H, halo, fins };
}
