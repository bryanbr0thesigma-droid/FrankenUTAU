// Renders the MV with headless Chromium and muxes it with the full mix using ffmpeg.
//
//   node render.mjs                       full video -> out/signaling-mv.mp4
//   node render.mjs --from 30 --to 40     a slice (seconds)
//   node render.mjs --stills 12,31.5,90   PNG stills -> out/still-<t>.png
//   node render.mjs --jobs 3              split the frames over several browsers
//   node render.mjs --serve               just serve the live preview page
//   node render.mjs --splice ../signaling-reanimation.mp4 --redo 5.7-12.9,63.6-69.5
//                                         re-render only those time ranges and splice them into an
//                                         earlier render; the rest is stream-copied, untouched
//   node render.mjs --page index          the earlier original MV (Corrupt-Chan + Ping) instead of the
//                                         reanimation (reanim.html, the default)
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
  return acc;
}, []));

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  for (const p of ["playwright", "/opt/node-tools/node_modules/playwright"]) { try { return req(p); } catch {} }
  throw new Error("playwright not found: npm i -D playwright (and npx playwright install chromium)");
}

const OUT = path.resolve(ROOT, args.outdir || "out");
fs.mkdirSync(OUT, { recursive: true });
const AUDIO = path.join(ROOT, "assets/signaling/signaling-rei-corrupt-FULL-MIX.wav");
const PAGE = String(args.page || "reanim");

const server = await startServer(+(args.port || 0));
const port = server.address().port;
if (args.serve) {
  console.log(`preview: http://127.0.0.1:${port}/${PAGE}.html`);
} else {
  try { await main(); } finally { server.close(); }
}

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => console.error("[page error]", e.message));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.error(`[page ${m.type()}]`, m.text()); });
  await page.goto(`http://127.0.0.1:${port}/${PAGE}.html?render=1`);
  await page.waitForFunction(() => window.MV_READY === true, null, { timeout: 300000 });
  return page;
}

async function launch() {
  const { chromium } = loadPlaywright();
  return chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-background-timer-throttling"] });
}

async function main() {
  if (args.poses) {
    const browser = await launch();
    const page = await openPage(browser);
    const names = String(args.poses).split(",");
    for (const n of names) for (const b of [0, 0.5, 1, 2, 3]) {
      const url = await page.evaluate(async ([n, b, a]) => { await MV.poseTest(n, b, a); return MV.capture("image/jpeg", 0.85); }, [n, b, +(args.angle || 0)]);
      fs.writeFileSync(path.join(OUT, `pose-${n}-${b}.jpg`), Buffer.from(url.split(",")[1], "base64"));
    }
    await browser.close();
    return;
  }
  if (args.stills) {
    const browser = await launch();
    const page = await openPage(browser);
    for (const ts of String(args.stills).split(",").map(Number)) {
      const url = await page.evaluate((t) => { const f = Math.round(t * MV.fps); MV.renderFrame(f); return MV.capture("image/png"); }, ts);
      const file = path.join(OUT, `still-${ts.toFixed(2)}.png`);
      fs.writeFileSync(file, Buffer.from(url.split(",")[1], "base64"));
      console.log("wrote", file);
    }
    await browser.close();
    return;
  }
  const info = await (async () => { const b = await launch(); const p = await openPage(b); const r = await p.evaluate(() => ({ frames: MV.frames, fps: MV.fps, duration: MV.duration, cuts: MV.shots.map((s) => s.t0) })); await b.close(); return r; })();
  if (args.splice) return splice(info);
  const f0 = Math.max(0, Math.round((+args.from || 0) * info.fps));
  const f1 = Math.min(info.frames, args.to ? Math.round(+args.to * info.fps) : info.frames);
  const jobs = Math.max(1, +(args.jobs || 1));
  // split at camera cuts near even shares, so spring-bone restarts are hidden by the cut
  const cutFrames = info.cuts.map((t) => Math.round(t * info.fps)).filter((f) => f > f0 && f < f1);
  const bounds = [f0];
  for (let j = 1; j < jobs; j++) {
    const ideal = f0 + Math.round(((f1 - f0) * j) / jobs);
    const near = cutFrames.reduce((best, f) => (Math.abs(f - ideal) < Math.abs(best - ideal) ? f : best), ideal);
    if (near > bounds[bounds.length - 1]) bounds.push(near);
  }
  bounds.push(f1);
  console.log(`rendering frames ${f0}..${f1 - 1} (${f1 - f0} frames) in ${bounds.length - 1} job(s)`);
  const t0 = Date.now();
  const parts = await Promise.all(bounds.slice(0, -1).map((a, j) => renderPart(a, bounds[j + 1], j, info.fps, t0, info.cuts)));
  const name = args.out || (args.from || args.to ? `slice-${(f0 / info.fps).toFixed(1)}-${(f1 / info.fps).toFixed(1)}.mp4` : (PAGE === "reanim" ? "signaling-reanimation.mp4" : "signaling-mv.mp4"));
  const outFile = path.join(OUT, name);
  const list = path.join(OUT, "parts.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-ss", String(f0 / info.fps), "-t", String((f1 - f0) / info.fps), "-i", AUDIO,
    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", outFile]);
  for (const p of parts) fs.unlinkSync(p);
  fs.unlinkSync(list);
  console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min -> ${outFile}`);
}

// a keyframe at every shot start, so a later --splice can cut exactly at any shot
function keyArgs(a, b, fps, cuts) {
  const ts = (cuts || []).map((t) => Math.round(t * fps)).filter((f) => f > a && f < b).map((f) => ((f - a) / fps).toFixed(4));
  return ts.length ? ["-force_key_frames", ts.join(",")] : [];
}
async function renderPart(a, b, j, fps, tStart, cuts) {
  const browser = await launch();
  const page = await openPage(browser);
  const file = path.join(OUT, `part-${j}.mp4`);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", args.preset || "medium", "-crf", String(args.crf || 20), "-maxrate", args.maxrate || "4M", "-bufsize", "8M", "-pix_fmt", "yuv420p", "-r", String(fps),
    ...keyArgs(a, b, fps, cuts), file], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exited " + c)))));
  const q = +(args.quality || 0.95);
  for (let f = a; f < b; f++) {
    const url = await page.evaluate(([fr, qq]) => { MV.renderFrame(fr); return MV.capture("image/jpeg", qq); }, [f, q]);
    const buf = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if ((f - a) % 150 === 0 || f === b - 1) {
      const el = (Date.now() - tStart) / 1000, done_ = f - a + 1, rate = done_ / el;
      console.log(`[job ${j}] frame ${f} (${done_}/${b - a}) ${rate.toFixed(2)} fps, eta ${((b - a - done_) / rate / 60).toFixed(1)} min`);
    }
  }
  ff.stdin.end();
  await done;
  await browser.close();
  return file;
}

// re-render some time ranges and splice them into an earlier render (same encoder settings).
// Each range is widened to the earlier render's keyframes, so the untouched stretches between
// them are copied bit for bit; the audio is muxed again from the full mix.
async function splice(info) {
  const base = path.resolve(String(args.splice)), fps = info.fps, N = info.frames;
  const kf = String(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v", "-skip_frame", "nokey", "-show_entries", "frame=pts_time", "-of", "csv=p=0", base]).stdout)
    .split(/[\s,]+/).filter(Boolean).map((x) => Math.round(+x * fps));
  kf.push(N);
  const ranges = String(args.redo).split(",").map((r) => r.split("-").map(Number)).map(([a, b]) => {
    const fa = Math.round(a * fps), fb = Math.round(b * fps);
    return [Math.max(...kf.filter((k) => k <= fa)), Math.min(...kf.filter((k) => k >= fb))];
  }).sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const r of ranges) { const m = merged[merged.length - 1]; if (m && r[0] <= m[1]) m[1] = Math.max(m[1], r[1]); else merged.push([...r]); }
  console.log("re-rendering frames", merged.map(([a, b]) => `${a}..${b - 1} (${(a / fps).toFixed(2)}-${(b / fps).toFixed(2)} s)`).join(", "));
  const t0 = Date.now();
  const fresh = await Promise.all(merged.map(([a, b], j) => renderPart(a, b, j, fps, t0, info.cuts)));
  const pieces = []; let at = 0, k = 0;
  for (const [i, [a, b]] of merged.entries()) {
    if (a > at) { const seg = path.join(OUT, `keep-${k++}.mp4`); await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", (at / fps).toFixed(6), "-i", base, "-frames:v", String(a - at), "-map", "0:v", "-c", "copy", seg]); pieces.push(seg); }
    pieces.push(fresh[i]); at = b;
  }
  if (at < N) { const seg = path.join(OUT, `keep-${k++}.mp4`); await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", (at / fps).toFixed(6), "-i", base, "-map", "0:v", "-c", "copy", seg]); pieces.push(seg); }
  const list = path.join(OUT, "splice.txt"), outFile = path.join(OUT, args.out || "signaling-reanimation.mp4");
  fs.writeFileSync(list, pieces.map((p) => `file '${p}'`).join("\n"));
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-i", AUDIO,
    "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", outFile]);
  for (const p of pieces) fs.unlinkSync(p);
  fs.unlinkSync(list);
  const frames = String(spawnSync("ffprobe", ["-v", "error", "-count_packets", "-select_streams", "v", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", outFile]).stdout).trim();
  console.log(`spliced in ${((Date.now() - t0) / 60000).toFixed(1)} min -> ${outFile} (${frames} frames, expected ${N})`);
}

function run(cmd, a) {
  return new Promise((res, rej) => { const p = spawn(cmd, a, { stdio: "inherit" }); p.on("close", (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`)))); });
}
