// Cel shading for the VRM performers: hard two-tone MToon shading with a tinted shadow colour, no
// rim or matcap, and an inverted-hull outline of constant on-screen width (in pixels), so the 3D
// models read like the flat, line-drawn characters of a 2D MV.
import * as THREE from "three";

// shared by every outline material; set per render pass (outline width scales with the panel)
export const outlineUniforms = {
  uOutlinePx: { value: 1.6 },
  uRes: { value: new THREE.Vector2(1280, 720) },
};

const mtoons = (o) => [].concat(o.material || []).filter((m) => m && m.isMToonMaterial);

// shade: RGB multiplier for the shadow side (a cool lavender keeps it in the MV's palette)
export function celShade(root, { shade = [0.6, 0.56, 0.84], toony = 0.98, shift = 0.05, gi = 0.9 } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of mtoons(o)) {
      if (m.isOutline) { m.visible = false; continue; } // our own outline replaces MToon's
      m.shadingToonyFactor = toony;
      m.shadingShiftFactor = shift;
      if (!m.shadeMultiplyTexture && m.map) m.shadeMultiplyTexture = m.map;
      m.shadeColorFactor.setRGB(shade[0], shade[1], shade[2]);
      m.giEqualizationFactor = gi;
      m.rimLightingMixFactor = 0;
      m.parametricRimColorFactor.setRGB(0, 0, 0);
      m.matcapFactor.setRGB(0, 0, 0);
      m.needsUpdate = true;
    }
  });
}

function outlineMaterial(src, color) {
  const transparentBlend = src && src.transparent && !(src.alphaTest > 0);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  mat.userData.isOutline = true;
  if (!src || src.visible === false || src.isOutline || transparentBlend) { mat.visible = false; return mat; }
  if (src.alphaTest > 0 && src.map) { mat.map = src.map; mat.alphaTest = src.alphaTest; mat.color.set(color); }
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uOutlinePx = outlineUniforms.uOutlinePx;
    sh.uniforms.uRes = outlineUniforms.uRes;
    sh.vertexShader = "uniform float uOutlinePx; uniform vec2 uRes;\n" + sh.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      #ifndef USE_SKINNING
        vec3 objectNormal = normal;
      #endif
      {
        vec3 vn = normalMatrix * objectNormal;
        vec2 d = (projectionMatrix * vec4(vn, 0.0)).xy;
        float L = length(d);
        if (L > 1e-6) gl_Position.xy += (d / L) * uOutlinePx * 2.0 / uRes * gl_Position.w;
      }`);
    if (mat.map) { // the map is only for alpha cut-outs: keep the line colour flat
      sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>",
        "#include <map_fragment>\n diffuseColor.rgb = diffuse;");
    }
  };
  return mat;
}

// adds an outline twin next to every visible mesh under root; returns the outline meshes
export function addOutlines(root, { color = 0x170d2c } = {}) {
  const meshes = [];
  const flat = (o) => o.userData.noOutline || /^(Plane|Circle)Geometry$/.test(o.geometry?.type);
  root.traverse((o) => { if (o.isMesh && o.visible && !o.userData.isOutline && !flat(o)) meshes.push(o); });
  const out = [];
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material.map((s) => outlineMaterial(s, color)) : outlineMaterial(m.material, color);
    if (!Array.isArray(mats) && !mats.visible) continue;
    let ol;
    if (m.isSkinnedMesh) {
      ol = new THREE.SkinnedMesh(m.geometry, mats);
      ol.bindMode = m.bindMode;
      ol.bind(m.skeleton, m.bindMatrix);
    } else {
      ol = new THREE.Mesh(m.geometry, mats);
    }
    if (m.morphTargetInfluences) { ol.morphTargetInfluences = m.morphTargetInfluences; ol.morphTargetDictionary = m.morphTargetDictionary; }
    ol.userData.isOutline = true;
    ol.frustumCulled = false;
    ol.renderOrder = m.renderOrder;
    ol.position.copy(m.position); ol.quaternion.copy(m.quaternion); ol.scale.copy(m.scale);
    m.parent.add(ol);
    m.userData.outline = ol;
    out.push(ol);
  }
  return out;
}

// swap every surface for a flat colour (silhouette shots and the credits); returns a restore()
export function silhouette(root, color) {
  const flat = new THREE.MeshBasicMaterial({ color });
  const saved = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    saved.push([o, o.material, o.visible]);
    if (o.userData.isOutline) { o.visible = false; return; }
    const src = [].concat(o.material)[0];
    if (src && src.transparent && !(src.alphaTest > 0)) { o.visible = false; return; }
    if (src && src.alphaTest > 0 && src.map) {
      const m = new THREE.MeshBasicMaterial({ color, map: src.map, alphaTest: src.alphaTest });
      m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n diffuseColor.rgb = diffuse;"); };
      o.material = Array.isArray(o.material) ? o.material.map(() => m) : m;
    } else {
      o.material = Array.isArray(o.material) ? o.material.map(() => flat) : flat;
    }
  });
  return () => { for (const [o, m, v] of saved) { o.material = m; o.visible = v; } };
}
