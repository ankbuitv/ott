// Encode toàn bộ kênh test card: 3600 segment .ts (1 giây/segment) bằng ffmpeg libx264.
// Cách dùng:
//   node encode.mjs --out ../testcard-assets/seg --brand CHRTV --date 13-09-2026
//   node encode.mjs --seconds 8 --out /tmp/test   (encode thử cho nhanh)
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Card } from "./render.mjs";

const W = parseInt(arg("w", "384"), 10);
const H = parseInt(arg("h", "216"), 10);
const FPS = parseInt(arg("fps", "12"), 10);

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 ? process.argv[i + 1] : def;
}

const OUT = arg("out", "../testcard-assets/seg");
const BRAND = arg("brand", "CHRTV");
const DATE = arg("date", "");
const SECONDS = parseInt(arg("seconds", "3600"), 10);
const CRF = arg("crf", "32");
const TONE = arg("tone", "1") === "1";
const ABIT = arg("ab", "16k");
const SR = arg("sr", "8000");
const FFMPEG = arg("ffmpeg", "ffmpeg");

mkdirSync(OUT, { recursive: true });

const weekday = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const now = new Date();
const dateText = DATE || `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;

const card = new Card(W, H);
card.buildBase({ brand: BRAND, dateText });

const totalFrames = SECONDS * FPS;

// Chuỗi tham số ffmpeg
const ffArgs = [
  "-hide_banner", "-loglevel", "warning", "-y",
  "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", `${W}x${H}`, "-r", String(FPS), "-i", "pipe:0",
];
if (TONE) ffArgs.push("-f", "lavfi", "-i", `sine=frequency=1000:sample_rate=${SR}`, "-ac", "1");
ffArgs.push(
  "-map", "0:v",
  ...(TONE ? ["-map", "1:a"] : []),
  "-c:v", "libx264", "-preset", "veryfast",
  "-crf", CRF, "-pix_fmt", "yuv420p",
  "-profile:v", "baseline", "-level", "3.0",
  "-g", String(FPS), "-keyint_min", String(FPS), "-sc_threshold", "0",
  "-x264-params", `keyint=${FPS}:min-keyint=${FPS}:scenecut=0:psy-rd=0:aq-mode=0`,
);
if (TONE) ffArgs.push("-c:a", "aac", "-b:a", ABIT);
ffArgs.push(
  "-t", String(SECONDS),
  "-copyts", "-muxdelay", "0", "-muxpreload", "0", "-mpegts_copyts", "1",
  "-f", "segment", "-segment_time", "1", "-segment_format", "mpegts",
  "-segment_start_number", "0", "-reset_timestamps", "0",
  "-break_non_keyframes", "0",
  path.join(OUT, "%04d.ts"),
);

const ff = spawn(FFMPEG, ffArgs, { stdio: ["pipe", "inherit", "inherit"] });

let frameNo = 0;
let lastPct = -1;

function writeFrame() {
  const s = Math.floor(frameNo / FPS);
  const { mm, ss } = { mm: Math.floor(s / 60), ss: s % 60 };
  const f = card.frame({ mm, ss });
  const bytes = new Uint8Array(f.y.length + f.u.length + f.v.length);
  bytes.set(f.y, 0);
  bytes.set(f.u, f.y.length);
  bytes.set(f.v, f.y.length + f.u.length);
  if (!ff.stdin.write(bytes)) ff.stdin.once("drain", pump);
  else pump();
}

function pump() {
  frameNo++;
  if (frameNo >= totalFrames) { ff.stdin.end(); return; }
  const pct = Math.floor((frameNo / totalFrames) * 100);
  if (pct !== lastPct && pct % 5 === 0) { lastPct = pct; console.error(`render ${pct}%`); }
  // nhường event loop mỗi 50 frame để stdin kịp drains
  if (frameNo % 50 === 0) setImmediate(writeFrame);
  else writeFrame();
}

ff.on("close", (code) => {
  console.error(`Xong: ${SECONDS} giây -> ${OUT} (exit ${code})`);
  process.exit(code === 0 ? 0 : 1);
});

writeFrame();
