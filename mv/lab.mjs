// node lab.mjs raw:full toon:full toon:faces  -> out/lab-<mode>-<view>.png
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./server.mjs";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);
const { chromium } = req("playwright");
const server = await startServer(0);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error("[page error]", e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.error(`[page ${m.type()}]`, m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:${server.address().port}/lab.html`);
await page.waitForFunction(() => window.LAB_READY === true, null, { timeout: 300000 });
fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
for (const spec of process.argv.slice(2)) {
  const [mode, view, ang] = spec.split(":");
  if (mode === "cels") {
    const url = await page.evaluate(([w, n]) => LAB.celSheet(w, n.split(",")), [view, ang]);
    const f = path.join(ROOT, "out", `lab-cels-${view}.png`);
    fs.writeFileSync(f, Buffer.from(url.split(",")[1], "base64")); console.log("wrote", f); continue;
  }
  if (mode === "names") { console.log(JSON.stringify(await page.evaluate(() => LAB.exprNames()))); continue; }
  if (mode === "expr") {
    const url = await page.evaluate((v) => LAB.expr(v), view);
    const f = path.join(ROOT, "out", `lab-expr-${Buffer.from(view).toString("hex").slice(0, 24)}.png`);
    fs.writeFileSync(f, Buffer.from(url.split(",")[1], "base64")); console.log("wrote", f); continue;
  }
  if (mode === "bones") { console.log(JSON.stringify(await page.evaluate(() => LAB.bones()))); continue; }
  const url = await page.evaluate(([m, v, a]) => { if (m === "pose") return LAB.pose(v, +(a || 0)); if (m === "toon") LAB.toon(); return LAB.view(v); }, [mode, view, ang]);
  const f = path.join(ROOT, "out", `lab-${mode}-${view}${ang ? "-" + ang : ""}.png`);
  fs.writeFileSync(f, Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote", f);
}
await browser.close(); server.close();
