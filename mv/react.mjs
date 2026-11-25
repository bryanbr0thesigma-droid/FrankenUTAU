// Corrupt-Chan's reaction drawings for the Harlequin Contraption MV (the player flips between videos and she notices).
//   node react.mjs OUTDIR            -> OUTDIR/<name>.png (510x720, transparent), one per pose below
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { startServer } from "./server.mjs";
const req = createRequire(import.meta.url);
const { chromium } = req("playwright");
const R = (x) => (x * Math.PI) / 180;
const d = (x, y, z) => [R(x), R(y), R(z)];
const arm = (out, up, fwd, bend = 0.2, o = {}) => ({ out, up, fwd, bend, twist: 0, flex: 0, yaw: 0, ...o });
// the model faces the camera: her left is screen right (where the sidebar's chaos is)
// Hands are aimed with targets in the head's frame (x = her right, y up, -z forward, metres); the lab solves the arms.
const torso = (back, turn) => ({ hips: [0, 0, 0.02 * back], b: { spine: d(5 * back, turn * 8, 0), chest: d(4 * back, turn * 8, 0),
  neck: d(2 * back, turn * 10, 0), head: d(4 * back, turn * 16, 0) }, curl: [0.25, 0.25] });
const MOUTH = [0, -0.075, -0.115], CHEST = [-0.03, -0.34, -0.17];
const CHEEK = (sg) => [sg * 0.085, -0.02, -0.065], TOP = (sg) => [sg * 0.085, 0.07, -0.02], UP = (sg) => [sg * 0.24, -0.02, -0.16];
const SIDEBAR = [-2.2, 1.35, 1.2];                                   // screen right, where the thumbnails flip (checked by eye)
const CAM = { rei: [22, 0, 1.38, 2.1, 0, 1.355, 0], cc: [22, 0, 1.29, 2.1, 0, 1.265, 0] };
const R_ = (who, o) => ({ who, cam: CAM[who], w: 600, h: 720, outline: 2.2, ...o });
export const REACT = {
  rei_mouth: R_("rei", { pose: torso(1, 0), targets: { R: MOUTH, L: CHEST }, mood: { "瞳小": 1, "両目見開き": 1 }, yaw: 0.12 }),
  rei_startle: R_("rei", { pose: torso(1.5, 0.6), targets: { L: [-0.27, -0.06, -0.12], R: UP(1) }, mood: { "両目見開き": 1, aa: 0.7 }, yaw: -0.12, look: SIDEBAR }),
  rei_cheeks: R_("rei", { pose: torso(0.5, 0), targets: { L: CHEEK(-1), R: CHEEK(1) }, mood: { "瞳小": 1, oh: 1 }, yaw: 0.1 }),
  cc_startle: R_("cc", { pose: torso(1.5, 1), targets: { L: UP(-1), R: UP(1) }, mood: { Surprised: 1 }, yaw: -0.05, look: SIDEBAR }),
  cc_mouth: R_("cc", { pose: torso(1, 0), targets: { R: MOUTH, L: CHEST }, mood: { Surprised: 1 }, yaw: -0.12 }),
  cc_head: R_("cc", { pose: torso(0.5, 0), targets: { L: TOP(-1), R: TOP(1) }, mood: { Surprised: 1, sad: 0.5 }, yaw: -0.1 }),
  cc_cheeks: R_("cc", { pose: torso(0.5, 0), targets: { L: CHEEK(-1), R: CHEEK(1) }, mood: { Surprised: 1 }, yaw: -0.1 }),
};
const out = path.resolve(process.argv[2] || "out/react");
fs.mkdirSync(out, { recursive: true });
const server = await startServer(0);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error("[page error]", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/lab.html`);
await page.waitForFunction(() => window.LAB_READY === true, null, { timeout: 300000 });
for (const [name, spec] of Object.entries(REACT)) {
  const url = await page.evaluate((s) => LAB.reactCel(s), spec);
  fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote", name);
}
await browser.close();
server.close();
