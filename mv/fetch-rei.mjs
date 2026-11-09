// Downloads the official Adachi Rei 3D model (ver1.0.0, MMD + VRM, by みさいる / Mechanical Girl)
// from its BowlRoll page and puts the VRM at assets/rei/adachi_rei_v1.0.0.vrm.
//
//   node fetch-rei.mjs
//
// The download is public (no login, no key), but BowlRoll's page needs a real browser for its
// Download button, so this drives Playwright's Chromium. The model is not kept in git: the file's
// own VRM metadata says redistribution is prohibited, although its readme (2019.8.9 guideline)
// allows it. Network hosts needed: bowlroll.net, code.jquery.com, cdnjs.cloudflare.com and
// storage-file-download-common.bowlroll.cloud.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PAGE = "https://bowlroll.net/file/204581";
const MD5 = "a925d4f8aa91a201bf7e4026229f305f"; // as listed on the BowlRoll page
const OUT_DIR = path.join(ROOT, "assets/rei");
const ZIP = path.join(OUT_DIR, "adachi-rei-v1.0.0.zip");
const VRM = path.join(OUT_DIR, "adachi_rei_v1.0.0.vrm");

fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(VRM)) { console.log("already there:", VRM); process.exit(0); }

if (!fs.existsSync(ZIP)) {
  const req = createRequire(import.meta.url);
  let pw; for (const p of ["playwright", "/opt/node-tools/node_modules/playwright"]) { try { pw = req(p); break; } catch {} }
  if (!pw) throw new Error("playwright not found");
  const browser = await pw.chromium.launch();
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 60000 });
  const btn = page.locator("#file-show-download-control button[type=submit]");
  await btn.waitFor({ timeout: 60000 });
  console.log("downloading the model zip (136 MB) ...");
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 600000 }), btn.click()]);
  await dl.saveAs(ZIP);
  await browser.close();
}
const md5 = crypto.createHash("md5").update(fs.readFileSync(ZIP)).digest("hex");
if (md5 !== MD5) throw new Error(`checksum mismatch: ${md5} (expected ${MD5})`);

// the archive's names are Shift_JIS; pull out the VRM and the readme with Python's zipfile
const py = `
import zipfile, sys
z = zipfile.ZipFile(sys.argv[1])
for i in z.infolist():
    n = i.filename.encode('cp437').decode('cp932', 'replace')
    if n.endswith('ver1.0.0.vrm'): open(sys.argv[2], 'wb').write(z.read(i))
    if n.endswith('readme.txt'): open(sys.argv[3], 'wb').write(z.read(i))
`;
const r = spawnSync("python3", ["-I", "-c", py, ZIP, VRM, path.join(OUT_DIR, "readme_cp932.txt")], { stdio: "inherit" });
if (r.status !== 0 || !fs.existsSync(VRM)) throw new Error("could not extract the VRM");
fs.unlinkSync(ZIP);
console.log("wrote", VRM);
