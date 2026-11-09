// Adachi Rei: the official 3D model ver1.0.0 by みさいる (Mechanical Girl), VRM 0.0.
// Fetched into assets/rei/ by fetch-rei.mjs (not kept in git: the file's own VRM metadata says
// redistribution is prohibited, although its readme allows it).
// buildRei(libs, url) -> { root, vrm, update(dt, t, opts), humanoid }
export async function buildRei({ GLTFLoader, VRMLoaderPlugin, VRMUtils }, url) {
  const loader = new GLTFLoader();
  loader.register((p) => new VRMLoaderPlugin(p));
  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm);
  const root = vrm.scene;
  const H = vrm.humanoid;
  const nb = (n) => H.getNormalizedBoneNode(n);
  // relaxed pose: arms down from the T-pose
  nb("leftUpperArm").rotation.z = 1.2; nb("rightUpperArm").rotation.z = -1.2;
  nb("leftLowerArm").rotation.z = 0.12; nb("rightLowerArm").rotation.z = -0.12;
  vrm.update(0);
  root.updateMatrixWorld(true);
  function update(dt) { vrm.update(dt); }
  return { root, vrm, update, humanoid: H };
}
