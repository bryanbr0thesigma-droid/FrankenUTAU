// One full-screen pass over the HDR scene: mip-based glow, chromatic aberration, block glitches
// (with "missing texture" checker blocks, Corrupt-Chan's motif), scanlines, grain, vignette,
// saturation, flashes, fades, letterbox, the split-screen divider and the HUD overlay.
import * as THREE from "three";

export class Post {
  constructor(renderer, w, h) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true,
    });
    this.hudCanvas = document.createElement("canvas"); this.hudCanvas.width = w; this.hudCanvas.height = h;
    this.hudTex = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTex.premultiplyAlpha = false;
    this.u = {
      tScene: { value: this.rt.texture }, tHud: { value: this.hudTex },
      uRes: { value: new THREE.Vector2(w, h) }, uTime: { value: 0 }, uSeed: { value: 0 },
      uGlitch: { value: 0 }, uCA: { value: 0.002 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) },
      uFade: { value: 0 }, uSat: { value: 1 }, uVig: { value: 0.35 }, uGlow: { value: 0.8 }, uScan: { value: 0.06 },
      uLetter: { value: 0 }, uSplit: { value: -1 }, uSplitCol: { value: new THREE.Color(1, 1, 1) }, uHudA: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) }, uExposure: { value: 1 }, uFadeAll: { value: 0 },
    };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene, tHud; uniform vec2 uRes; uniform float uTime, uSeed, uGlitch, uCA, uFlash, uFade, uSat, uVig, uGlow, uScan, uLetter, uSplit, uHudA, uExposure, uFadeAll;
        uniform vec3 uFlashCol, uSplitCol, uTint;
        varying vec2 vUv;
        float h11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
        float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
        vec3 sceneAt(vec2 uv){ return textureLod(tScene, uv, 0.0).rgb; }
        vec3 tonemap(vec3 c){ // keep toon colours as they are up to ~0.8, roll off above
          vec3 x = max(c, 0.0); vec3 hi = 0.72 + 0.28*(1.0 - exp(-(x - 0.72)*2.2));
          return mix(x, hi, step(0.72, x)); }
        vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
        void main(){
          vec2 uv = vUv;
          // block glitch: horizontal slabs shifted sideways
          float g = uGlitch;
          float row = floor(uv.y * mix(14.0, 46.0, h11(uSeed*1.7)));
          float r1 = h21(vec2(row, uSeed));
          float shift = 0.0, checker = 0.0;
          if (g > 0.001 && r1 > 1.0 - g*0.55) {
            shift = (h21(vec2(row, uSeed + 4.0)) - 0.5) * 0.18 * g;
            float col = floor(uv.x * 9.0 + h11(row)*3.0);
            if (h21(vec2(row*3.1, col + uSeed)) > 1.0 - g*0.18) checker = 1.0;
          }
          uv.x += shift;
          // chromatic aberration, stronger away from the centre and with glitches
          vec2 dc = uv - 0.5;
          float ca = uCA + g*0.012;
          vec3 c;
          c.r = sceneAt(uv + dc*ca*2.0 + vec2(g*0.004, 0.0)).r;
          c.g = sceneAt(uv).g;
          c.b = sceneAt(uv - dc*ca*2.0 - vec2(g*0.004, 0.0)).b;
          // glow from blurred mip levels
          vec3 bl = textureLod(tScene, uv, 2.5).rgb*0.35 + textureLod(tScene, uv, 4.0).rgb*0.4 + textureLod(tScene, uv, 5.5).rgb*0.45;
          c += max(bl - 0.8, 0.0) * uGlow * 0.6;
          c *= uExposure * uTint;
          c = tonemap(c);
          // saturation
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, uSat);
          // "missing texture" blocks
          if (checker > 0.5) { vec2 cp = floor(gl_FragCoord.xy / 6.0); c = mod(cp.x + cp.y, 2.0) < 1.0 ? vec3(1.0, 0.0, 0.86) : vec3(0.0); }
          c *= 1.0 - uFade; // the scene fades; the HUD (boot text, end card) stays
          // HUD (straight alpha), glitched with the image
          vec4 hud = texture2D(tHud, uv);
          c = mix(c, hud.rgb, hud.a * uHudA);
          // split-screen divider
          if (uSplit > 0.0) { float d = abs(vUv.x - uSplit) * uRes.x; c = mix(c, uSplitCol*1.2, smoothstep(3.0, 0.0, d)); c += uSplitCol * 0.25 * exp(-d*0.08); }
          // scanlines and grain
          c *= 1.0 - uScan * (0.5 + 0.5*sin(gl_FragCoord.y * 3.14159));
          c += (h21(floor(gl_FragCoord.xy*0.5) + floor(uTime*12.0)*17.0) - 0.5) * 0.01; // light grain (heavy grain bloats the video)
          // vignette
          float v = smoothstep(0.85, 0.2, length(dc*vec2(1.0, 0.8)));
          c *= mix(1.0, v, uVig);
          // flash
          c = mix(c, uFlashCol, clamp(uFlash, 0.0, 1.0)*0.85);
          // letterbox
          float lb = uLetter * 0.5;
          if (vUv.y < lb || vUv.y > 1.0 - lb) c = vec3(0.0);
          c *= 1.0 - uFadeAll;
          gl_FragColor = vec4(toSRGB(c), 1.0);
        }`,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  // views: [{camera, x, w}] in fractions of the width
  renderScene(scene, views) {
    const r = this.renderer, rt = this.rt, W = rt.width, H = rt.height;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    const auto = r.autoClear; r.autoClear = false;
    for (const v of views) {
      const x = Math.round(v.x * W), w = Math.round(v.w * W);
      rt.viewport.set(x, 0, w, H); rt.scissor.set(x, 0, w, H); rt.scissorTest = views.length > 1;
      v.camera.aspect = w / H; v.camera.updateProjectionMatrix();
      r.setRenderTarget(rt);
      if (views.length > 1) r.clear(true, true, true);
      r.render(scene, v.camera);
    }
    r.autoClear = auto;
    rt.viewport.set(0, 0, W, H); rt.scissor.set(0, 0, W, H); rt.scissorTest = false;
    r.setRenderTarget(null);
  }
  composite() {
    this.hudTex.needsUpdate = true;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }
}
