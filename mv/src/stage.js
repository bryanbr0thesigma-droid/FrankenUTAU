// The MV's world: two "dimensions" that share one space. Corrupt-Chan's side (-x) is magenta and
// glitchy, Ping's side (+x) is blue and clean; `split` decides how sharply the sky and floor divide
// between them (1 = two worlds, 0 = merged). The floor carries each singer's voice outwards as rings.
import * as THREE from "three";
import { hash1, PALETTE, TAU, clamp } from "./util.js";

const col = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);

export function buildStage(scene, tl) {
  const U = {
    uTime: { value: 0 }, uSplit: { value: 1 }, uLow: { value: 0 }, uHigh: { value: 0 }, uKick: { value: 0 },
    uBright: { value: 1 }, uFlash: { value: 0 },
    uCC: { value: col(PALETTE.cc.main) }, uCC2: { value: col(PALETTE.cc.second) }, uCCd: { value: col(PALETTE.cc.deep) },
    uPG: { value: col(PALETTE.ping.main) }, uPG2: { value: col(PALETTE.ping.second) }, uPGd: { value: col(PALETTE.ping.deep) },
    uFrame: { value: 0 }, uFrames: { value: tl.N }, uFps: { value: tl.fps },
    uEmitA: { value: new THREE.Vector2(-3, 0) }, uEmitB: { value: new THREE.Vector2(3, 0) },
  };
  // per-frame voice loudness as textures, so the floor can look back in time for its ripples
  const voiceTex = (key) => {
    const L = tl.A.voice[key].loud, d = new Uint8Array(L.length * 4);
    for (let i = 0; i < L.length; i++) { const v = Math.round(clamp(L[i]) * 255); d[i * 4] = v; d[i * 4 + 3] = 255; }
    const t = new THREE.DataTexture(d, L.length, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
  };
  U.tVoiceA = { value: voiceTex("cc") };
  U.tVoiceB = { value: voiceTex("rei") };

  const common = /* glsl */ `
    uniform float uTime, uSplit, uLow, uHigh, uKick, uBright, uFlash;
    uniform vec3 uCC, uCC2, uCCd, uPG, uPG2, uPGd;
    float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    // 0 = Corrupt-Chan side, 1 = Ping side; merged: slow swirl between them
    float sideOf(vec3 d, float x){
      float s = smoothstep(-0.25, 0.25, x);
      float m = 0.5 + 0.5*sin(atan(d.z, d.x)*2.0 + uTime*0.35 + d.y*3.0);
      return mix(m, s, uSplit);
    }`;

  // ---------- sky ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 24), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: common + /* glsl */ `
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float side = sideOf(d, d.x);
        vec3 deep = mix(uCCd, uPGd, side), main = mix(uCC, uPG, side), sec = mix(uCC2, uPG2, side);
        float h = d.y;
        vec3 c = mix(deep*0.55, deep*0.15, smoothstep(0.0, 0.7, h));
        // horizon glow
        c += main * 0.55 * exp(-abs(h)*9.0) * (0.75 + 0.5*uLow);
        // horizontal signal bands drifting upwards
        float bands = smoothstep(0.92, 1.0, sin(h*70.0 - uTime*1.6)) * smoothstep(0.75, 0.05, h) * step(0.0, h);
        c += sec * bands * 0.18 * (0.5 + uHigh);
        // waveform aurora: Ping side smooth sines, Corrupt side stepped/quantised
        float ang = atan(d.z, d.x);
        float wv = sin(ang*9.0 + uTime*0.7)*0.05 + sin(ang*23.0 - uTime*1.3)*0.025*(0.5+uLow);
        float wq = floor(wv*40.0)/40.0;
        float w = mix(wq, wv, side);
        float aur = exp(-pow((h - 0.18 - w)*28.0, 2.0));
        c += mix(uCC, uPG2, side) * aur * (0.25 + 0.6*uLow);
        // stars / data points
        vec2 g = vec2(ang*60.0, h*60.0); vec2 id = floor(g); vec2 f = fract(g)-0.5;
        float st = step(0.985, h21(id)) * smoothstep(0.12, 0.0, length(f)) * smoothstep(0.02, 0.2, h);
        c += vec3(1.0) * st * (0.4 + 0.6*h21(id+3.1)) * (0.6 + 0.4*sin(uTime*3.0 + h21(id)*20.0));
        c *= uBright;
        c += main * uFlash * 0.6;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);

  // ---------- floor ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160, 1, 1).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: U, fog: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: common + /* glsl */ `
      uniform sampler2D tVoiceA, tVoiceB; uniform float uFrame, uFrames, uFps; uniform vec2 uEmitA, uEmitB;
      varying vec3 vW;
      float gridLine(vec2 p, float w){ vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p); return 1.0 - min(min(g.x, g.y)/w, 1.0); }
      float voiceAt(sampler2D t, float frame){ if (frame < 0.0) return 0.0; return texture2D(t, vec2((frame+0.5)/uFrames, 0.5)).r; }
      float ripple(sampler2D t, vec2 e, vec2 p){
        float r = length(p - e);
        float speed = 2.6;
        float L = voiceAt(t, uFrame - r/speed*uFps);
        float rings = pow(0.5 + 0.5*cos(r*9.0 - uTime*speed*9.0), 6.0);
        return L * (0.08 + rings*0.55) * exp(-r*0.22) * smoothstep(0.35, 0.8, r);
      }
      void main(){
        vec2 p = vW.xz;
        float dist = length(p);
        vec3 d = normalize(vec3(p.x, 0.0, p.y));
        float side = sideOf(d, p.x/6.0);
        vec3 main = mix(uCC, uPG, side), sec = mix(uCC2, uPG2, side), deep = mix(uCCd, uPGd, side);
        // Corrupt side: grid jitters in blocks
        vec2 q = p;
        float blk = h21(floor(p*0.5) + floor(uTime*6.0));
        q.x += (1.0-side) * step(0.93, blk) * (blk-0.95) * 2.0 * (0.5+uKick);
        float g1 = gridLine(q, 1.2), g2 = gridLine(q*4.0, 1.0)*0.35;
        vec3 c = deep*0.25;
        c += main * (g1*0.55 + g2*0.18);
        float rip = ripple(tVoiceA, uEmitA, p) + ripple(tVoiceB, uEmitB, p);
        vec3 ripCol = mix(uCC, uPG2, smoothstep(-1.0, 1.0, p.x));
        c += ripCol * rip * 0.6;
        // pads under the singers
        for (int i = 0; i < 2; i++){
          vec2 e = i == 0 ? uEmitA : uEmitB; vec3 pc = i == 0 ? uCC : uPG2;
          float r = length(p - e);
          c += pc * (smoothstep(0.03, 0.0, abs(r - 0.62))*1.4 + smoothstep(0.02, 0.0, abs(r - 0.48))*0.6);
          float a = atan(p.y - e.y, p.x - e.x);
          float ticks = step(0.5, fract(a*12.0/6.2831 + uTime*(i == 0 ? -0.2 : 0.2))) * smoothstep(0.08, 0.0, abs(r - 0.75));
          c += pc * ticks * 0.6;
          c *= 1.0 - 0.55*smoothstep(0.62, 0.3, r); // darker inside the pad so the feet read
        }
        c *= uBright;
        c += main * uFlash * 0.25;
        float fade = exp(-dist*0.045);
        gl_FragColor = vec4(c*fade + deep*0.18*(1.0-fade), 1.0);
      }`,
    extensions: { derivatives: true },
  }));
  scene.add(floor);

  // ---------- visualizer ring behind the stage ----------
  const NB = 48;
  const barGeo = new THREE.BoxGeometry(0.09, 1, 0.09).translate(0, 0.5, 0);
  const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const ring = new THREE.InstancedMesh(barGeo, barMat, NB);
  ring.position.set(0, 3.4, -9); scene.add(ring);
  const ringCore = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.025, 8, 128), new THREE.MeshBasicMaterial({ color: col(0xffffff, 1.6) }));
  ringCore.position.copy(ring.position); scene.add(ringCore);
  const ringCol = new THREE.Color(), _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _qq = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);

  // ---------- distant antenna towers (both sides) ----------
  const towerMat = new THREE.MeshBasicMaterial({ color: 0x07070d });
  const towers = new THREE.Group(); scene.add(towers);
  const beacons = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + hash1(i) * 0.3, r = 26 + hash1(i + 9) * 18;
    const hgt = 6 + hash1(i + 3) * 10;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 6);
    // lattice: tapered core plus cross struts
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.45, hgt, 4, 1, true), towerMat));
    for (let k = 1; k < 6; k++) { const y = hgt * k / 6, w = 0.45 * (1 - k / 6) + 0.06; const s = new THREE.Mesh(new THREE.BoxGeometry(w * 2.2, 0.05, 0.05), towerMat); s.position.y = y - hgt / 2; s.rotation.y = k * 0.8; g.add(s); }
    if (hash1(i + 1) > 0.5) { const dish = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 8, 0, TAU, 0, 1.0), towerMat); dish.position.y = hgt * 0.35; dish.rotation.x = -1.1; g.add(dish); }
    g.children.forEach((m) => { m.position.y += hgt / 2; });
    const bm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    bm.position.y = hgt + 0.15; g.add(bm); beacons.push([bm, g.position.x, i]);
    towers.add(g);
  }

  // ---------- floating glitch cubes (Corrupt side) and rings (Ping side) ----------
  const NC = 70;
  const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), NC);
  const cubeData = [];
  for (let i = 0; i < NC; i++) cubeData.push({ x: -4 - hash1(i * 1.1) * 18, y: 0.6 + hash1(i * 2.3) * 7, z: -14 + hash1(i * 3.7) * 18, s: 0.12 + hash1(i * 4.1) * 0.45, sp: 0.3 + hash1(i * 5.3) });
  scene.add(cubes);
  const NR = 26;
  const rings = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.035, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }), NR);
  const ringData = [];
  for (let i = 0; i < NR; i++) ringData.push({ x: 4 + hash1(i * 1.7) * 18, y: 0.8 + hash1(i * 2.9) * 7, z: -14 + hash1(i * 3.1) * 18, s: 0.25 + hash1(i * 4.7) * 0.8, sp: 0.2 + hash1(i * 6.1) * 0.5 });
  scene.add(rings);

  // ---------- rising data particles ----------
  const NP = 1600, pp = new Float32Array(NP * 3), pseed = new Float32Array(NP);
  for (let i = 0; i < NP; i++) { pp[i * 3] = (hash1(i * 1.31) - 0.5) * 40; pp[i * 3 + 1] = hash1(i * 2.17) * 12; pp[i * 3 + 2] = (hash1(i * 3.73) - 0.5) * 30 - 4; pseed[i] = hash1(i * 7.7); }
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute("position", new THREE.BufferAttribute(pp, 3));
  pgeo.setAttribute("seed", new THREE.BufferAttribute(pseed, 1));
  const particles = new THREE.Points(pgeo, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: common + /* glsl */ `
      attribute float seed; varying float vSide; varying float vA;
      void main(){
        vec3 p = position; p.y = mod(p.y + uTime*(0.25 + seed*0.5)*(1.0 + uLow), 12.0);
        vSide = smoothstep(-0.5, 0.5, p.x/4.0); vSide = mix(0.5 + 0.5*sin(seed*20.0 + uTime*0.4), vSide, uSplit);
        vA = smoothstep(0.0, 1.5, p.y) * smoothstep(12.0, 8.0, p.y) * (0.35 + 0.65*seed);
        vec4 mv = modelViewMatrix*vec4(p, 1.0);
        gl_PointSize = (2.0 + 3.0*seed) * (1.0 + uKick*0.6) * 6.0 / -mv.z;
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: common + /* glsl */ `
      varying float vSide; varying float vA;
      void main(){ vec2 q = abs(gl_PointCoord - 0.5); if (max(q.x, q.y) > 0.5) discard;
        vec3 c = mix(uCC, uPG2, vSide); gl_FragColor = vec4(c*vA*uBright*1.4, 1.0); }`,
  }));
  particles.frustumCulled = false;
  scene.add(particles);

  // ---------- light beams from above ----------
  const beamGeo = new THREE.CylinderGeometry(0.05, 1.1, 14, 24, 1, true).translate(0, -7, 0);
  const beamMat = (c) => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col(c) }, uI: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vY; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = smoothstep(-14.0, -1.0, vY) * (1.0 - smoothstep(-1.0, 0.0, vY)*0.5);
        a *= mix(1.0, smoothstep(-14.0, -6.0, vY), 0.5); gl_FragColor = vec4(uColor*uI*a*edge*0.55, 1.0); }`,
  });
  const beams = [];
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(beamGeo, beamMat(i % 2 ? PALETTE.ping.main : PALETTE.cc.main));
    b.position.set((i - 2.5) * 2.2, 9, -2.5); scene.add(b); beams.push(b);
  }

  // ---------- the link: a beam of signal between the two singers ----------
  const linkMat = new THREE.ShaderMaterial({
    uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uT: { value: 0 }, uI: { value: 0 }, uArc: { value: 0.3 }, uCA: { value: col(PALETTE.cc.main) }, uCB: { value: col(PALETTE.ping.second) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform vec3 uA, uB; uniform float uArc; varying float vU; varying float vR;
      void main(){ float u = position.x; vU = u; vR = length(position.yz);
        vec3 p = mix(uA, uB, u); p.y += sin(3.14159*u)*uArc;
        vec3 dir = normalize(uB - uA); vec3 up = vec3(0.0,1.0,0.0); vec3 side = normalize(cross(dir, up)); up = cross(side, dir);
        p += side*position.z + up*position.y;
        gl_Position = projectionMatrix*viewMatrix*vec4(p, 1.0); }`,
    fragmentShader: `uniform float uT, uI; uniform vec3 uCA, uCB; varying float vU; varying float vR;
      void main(){ float dash = smoothstep(0.4, 0.5, fract(vU*14.0 - uT*3.0)) * smoothstep(0.9, 0.6, fract(vU*14.0 - uT*3.0));
        float flow = 0.35 + dash; vec3 c = mix(uCA, uCB, vU);
        float ends = smoothstep(0.0, 0.08, vU) * smoothstep(1.0, 0.92, vU);
        gl_FragColor = vec4(c*flow*uI*ends*1.6, 1.0); }`,
  });
  const linkGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 6, 80, true).rotateZ(-Math.PI / 2).translate(0.5, 0, 0);
  const link = new THREE.Mesh(linkGeo, linkMat); link.frustumCulled = false; scene.add(link);

  // ---------- lights ----------
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(0.5, 3, 4); scene.add(key); scene.add(key.target);
  const rimA = new THREE.DirectionalLight(PALETTE.cc.main, 1.4); rimA.position.set(-4, 3, -3); scene.add(rimA);
  const rimB = new THREE.DirectionalLight(PALETTE.ping.main, 1.4); rimB.position.set(4, 3, -3); scene.add(rimB);
  const amb = new THREE.AmbientLight(0xffffff, 0.55); scene.add(amb);

  function update(t, frame, S) {
    // S: world state from the director
    U.uTime.value = t; U.uFrame.value = frame;
    U.uSplit.value = S.split; U.uLow.value = tl.mix("low", t); U.uHigh.value = tl.mix("high", t); U.uKick.value = tl.mix("kick", t);
    U.uBright.value = S.bright; U.uFlash.value = S.flash;
    U.uEmitA.value.set(S.posCC.x, S.posCC.z); U.uEmitB.value.set(S.posPing.x, S.posPing.z);
    // visualizer
    const sp = tl.spec(t);
    for (let i = 0; i < NB; i++) {
      const half = i < NB / 2 ? i : NB - 1 - i; // mirrored left/right
      const band = sp[Math.min(sp.length - 1, Math.floor(half / (NB / 2) * sp.length))];
      const a = (i / NB) * TAU + Math.PI / 2;
      const len = 0.15 + band * 1.6 * (0.6 + 0.4 * S.energy);
      _p.set(Math.cos(a) * 2.8, Math.sin(a) * 2.8, 0);
      _qq.setFromAxisAngle(_z, a - Math.PI / 2);
      _s.set(1, len, 1);
      _m.compose(_p, _qq, _s); ring.setMatrixAt(i, _m);
      ringCol.set(i < NB / 2 ? PALETTE.cc.main : PALETTE.ping.main).lerp(new THREE.Color(0xffffff), band * 0.35).multiplyScalar((0.35 + 0.9 * band) * S.bright);
      ring.setColorAt(i, ringCol);
    }
    ring.instanceMatrix.needsUpdate = true; ring.instanceColor.needsUpdate = true;
    ring.rotation.z = t * 0.05; ringCore.material.color.setScalar(0.6 + 1.2 * tl.mix("kick", t) * S.energy).multiplyScalar(S.bright);
    ring.visible = ringCore.visible = S.ring;
    // beacons blink
    for (const [bm, x, i] of beacons) {
      const on = Math.sin(t * 2.1 + i * 1.7) > 0.6 ? 1 : 0.15;
      bm.material.color.set(x < 0 ? PALETTE.cc.main : PALETTE.ping.second).multiplyScalar(on * 2.5 * S.bright);
    }
    // cubes: drift, and on the Corrupt side some teleport on kicks
    const kick = tl.mix("kick", t), cc = new THREE.Color(PALETTE.cc.main), cc2 = new THREE.Color(PALETTE.cc.second);
    for (let i = 0; i < NC; i++) {
      const d = cubeData[i];
      const jump = Math.floor(t * 2 + hash1(i)) ;
      const jx = hash1(i * 9.1 + jump) > 0.85 ? (hash1(i + jump) - 0.5) * 1.5 * kick : 0;
      _p.set(d.x + jx, d.y + Math.sin(t * d.sp + i) * 0.4, d.z);
      _qq.setFromEuler(new THREE.Euler(t * d.sp * 0.5 + i, t * d.sp * 0.7, 0));
      _s.setScalar(d.s * (1 + 0.3 * kick * S.energy));
      _m.compose(_p, _qq, _s); cubes.setMatrixAt(i, _m);
      cubes.setColorAt(i, (i % 3 ? cc : cc2).clone().multiplyScalar((0.35 + 0.9 * (hash1(i + Math.floor(t * 8)) > 0.9 ? 1 : 0.2)) * S.bright));
    }
    cubes.instanceMatrix.needsUpdate = true; cubes.instanceColor.needsUpdate = true;
    const pg = new THREE.Color(PALETTE.ping.main), pg2 = new THREE.Color(PALETTE.ping.second);
    for (let i = 0; i < NR; i++) {
      const d = ringData[i];
      _p.set(d.x, d.y + Math.sin(t * d.sp + i * 2) * 0.5, d.z);
      _qq.setFromEuler(new THREE.Euler(Math.sin(t * d.sp + i) * 0.6 + 1.2, t * d.sp, 0));
      _s.setScalar(d.s * (1 + 0.15 * tl.mix("high", t)));
      _m.compose(_p, _qq, _s); rings.setMatrixAt(i, _m);
      rings.setColorAt(i, (i % 4 ? pg : pg2).clone().multiplyScalar(0.9 * S.bright));
    }
    rings.instanceMatrix.needsUpdate = true; rings.instanceColor.needsUpdate = true;
    // beams sweep on the beat when the director turns them on
    const beat = tl.beatF(t);
    beams.forEach((b, i) => {
      const sw = Math.sin(beat * Math.PI / 2 + i * 1.3);
      b.rotation.z = sw * 0.35; b.rotation.x = 0.25 + Math.cos(beat * Math.PI / 4 + i) * 0.15;
      b.material.uniforms.uI.value = S.beams * (0.55 + 0.45 * kick);
      b.visible = S.beams > 0.01;
    });
    // link
    linkMat.uniforms.uA.value.copy(S.linkA); linkMat.uniforms.uB.value.copy(S.linkB);
    linkMat.uniforms.uT.value = t; linkMat.uniforms.uI.value = S.link; linkMat.uniforms.uArc.value = S.linkArc;
    link.visible = S.link > 0.01;
    // lights
    key.intensity = 1.3 * S.key; amb.intensity = 0.32 * S.key;
    rimA.intensity = (0.8 + 1.2 * kick * S.energy) * S.rim; rimB.intensity = (0.8 + 1.2 * kick * S.energy) * S.rim;
    key.target.position.set(S.focus.x, 1, S.focus.z); key.position.set(S.focus.x + 0.5, 3.2, S.focus.z + 4);
    rimA.position.set(S.focus.x - 4, 3, S.focus.z - 3); rimB.position.set(S.focus.x + 4, 3, S.focus.z - 3);
    rimA.target = key.target; rimB.target = key.target;
  }
  return { update, uniforms: U };
}
