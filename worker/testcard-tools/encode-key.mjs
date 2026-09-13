// Sinh kênh TEST CARD mã hoá CENC + ClearKey:
//   card YUV -> ffmpeg (plain mp4) -> mp4fragment -> mp4dash --encryption-key --clearkey
// KID/KEY do người dùng chọn (--kid --key) hoặc tự sinh ngẫu nhiên.
//
// CẦN: ffmpeg (bản nào cũng được), Bento4 đã build (mp4fragment, mp4dump, ...,
//       sinh bằng scripts/build-bento4.sh) và Python 3 cho mp4dash.
//
//   node encode-key.mjs --kid <32hex> --key <32hex> --license-uri "https://<worker>/license"
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, existsSync, writeFileSync, rmSync, cpSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Card } from "./render.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : def;
}

const OUT = arg("out", path.join(HERE, "..", "..", "testcard-assets"));
const BRAND = arg("brand", "CHRTV");
const DATE = arg("date", "GMT+7 24/7");
const SECONDS = parseInt(arg("seconds", "3600"), 10);
const CRF = arg("crf", "32");
const ABIT = arg("ab", "16k");
const FFMPEG = arg("ffmpeg", "ffmpeg");
const B4BIN = arg("exec-dir", arg("b4bin", "/tmp/bin"));
const MP4DASH = arg("mp4dash", path.join(HERE, "bento4", "Source", "Python", "wrappers", "mp4dash"));
const LICENSE_URI = arg("license-uri", "__LICENSE_URI__");

// ---- KID/KEY: người dùng chọn hoặc tự sinh ----
const HEXRE = /^[0-9a-fA-F]{32}$/;
let KID = arg("kid", "");
let KEY = arg("key", "");
if (KID && !HEXRE.test(KID)) { console.error("KID phải là 32 ký tự hex"); process.exit(1); }
if (KEY && !HEXRE.test(KEY)) { console.error("KEY phải là 32 ký tự hex"); process.exit(1); }
if (!KID) KID = randomBytes(16).toString("hex");
if (!KEY) KEY = randomBytes(16).toString("hex");

const W = 384, H = 216, FPS = 1;
const TMP = arg("tmp", "/tmp/tc-key-build");
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(path.join(OUT, "keyk"), { recursive: true });

console.error(`KID = ${KID}`);
console.error(`KEY = ${KEY}`);

// ---------------------------------------------------------------------------
// 1) Render card -> plain.mp4
// ---------------------------------------------------------------------------
const card = new Card(W, H);
card.buildBase({ brand: BRAND, dateText: DATE });
const plain = path.join(TMP, "plain.mp4");
const ff = spawn(FFMPEG, [
  "-hide_banner", "-loglevel", "warning", "-y",
  "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "pipe:0",
  "-f", "lavfi", "-i", "sine=frequency=1000:sample_rate=8000", "-ac", "1",
  "-map", "0:v", "-map", "1:a",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", CRF, "-pix_fmt", "yuv420p",
  "-profile:v", "baseline", "-level", "3.0",
  "-g", String(FPS), "-keyint_min", String(FPS), "-sc_threshold", "0",
  "-x264-params", `keyint=${FPS}:min-keyint=${FPS}:scenecut=0:psy-rd=0:aq-mode=0`,
  "-c:a", "aac", "-b:a", ABIT,
  "-t", String(SECONDS),
  plain,
], { stdio: ["pipe", "inherit", "inherit"] });

let frameNo = 0, lastPct = -1;
function writeFrame() {
  const s = Math.floor(frameNo / FPS);
  const f = card.frame({ mm: Math.floor(s / 60) % 60, ss: s % 60 });
  const bytes = new Uint8Array(f.y.length + f.u.length + f.v.length);
  bytes.set(f.y, 0); bytes.set(f.u, f.y.length); bytes.set(f.v, f.y.length + f.u.length);
  if (!ff.stdin.write(bytes)) ff.stdin.once("drain", pump); else pump();
}
function pump() {
  frameNo++;
  if (frameNo >= SECONDS * FPS) { ff.stdin.end(); return; }
  const pct = Math.floor((frameNo / (SECONDS * FPS)) * 100);
  if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; console.error(`render ${pct}%`); }
  if (frameNo % 100 === 0) setImmediate(writeFrame); else writeFrame();
}
ff.on("close", (code) => {
  if (code !== 0) { console.error("ffmpeg thất bại " + code); process.exit(1); }
  step2();
});

writeFrame(); // khởi động vòng render

// ---------------------------------------------------------------------------
// 2) mp4fragment -> mp4dash (mã hoá CENC + ClearKey)
// ---------------------------------------------------------------------------
function run(cmd, args, label) {
  console.error(`>> ${label || cmd}`);
  execFileSync(cmd, args, { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, PATH: B4BIN + ":" + process.env.PATH } });
}

function step2() {
  const frag = path.join(TMP, "frag.mp4");
  run(path.join(B4BIN, "mp4fragment"), [plain, frag], "mp4fragment");

  const dashOut = path.join(TMP, "dash");
  rmSync(dashOut, { recursive: true, force: true });
  run("bash", [
    MP4DASH,
    "--encryption-key=" + KID + ":" + KEY,
    "--clearkey",
    "--clearkey-license-uri=" + LICENSE_URI,
    "-o", dashOut, frag,
  ], "mp4dash (mã hoá CENC + ClearKey)");

  // 3) copy vào assets + ghi info key
  const dest = path.join(OUT, "keyk");
  rmSync(dest, { recursive: true, force: true });
  cpSync(dashOut, dest, { recursive: true });
  writeFileSync(path.join(OUT, "keyk", "key.json"), JSON.stringify({
    kid: KID, key: KEY, note: "ClearKey của kênh test — đổi bằng cách chạy lại encode-key.mjs với --kid/--key, và cập nhật CLEARKEY trong wrangler.testcard-channel.toml",
  }, null, 2) + "\n");

  console.error("XONG! Assets mã hoá: " + dest);
  console.error("Chép vào config:\n  CLEARKEY = \"" + KID + ":" + KEY + "\"");
  process.exit(0);
}
