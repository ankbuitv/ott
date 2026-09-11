#!/usr/bin/env node
/**
 * png-to-svg.mjs — đổi file ảnh (PNG/JPG/WEBP) thành file SVG.
 *
 * Cách chuyển: giữ nguyên dữ liệu ảnh gốc, nhúng vào <image> bên trong một file
 * <svg> có viewBox đúng kích thước thật. Kết quả là SVG hợp lệ, trong suốt, không
 * vỡ hạt ở mọi cỡ (trình duyệt render raster bên trong SVG) và KHÔNG cần thư viện
 * trace nào. Đây đúng là cách Admin → "Logo kênh" tự chuyển khi anh upload PNG.
 *
 *   node scripts/png-to-svg.mjs brand/chrtv-logo-1024.png          → brand/chrtv-logo-1024.svg
 *   node scripts/png-to-svg.mjs logo.png out.svg --size 512         → ép viewBox về 512
 *   node scripts/png-to-svg.mjs logo.png --no-trim                  → không cắt viền trong suốt
 *
 * Tuỳ chọn: nếu máy có ImageMagick (`convert`/`magick`) sẽ tự cắt phần viền trong
 * suốt thừa cho logo bám sát mép khung hình; không có thì bỏ qua bước cắt.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const pos = argv.filter((a) => !a.startsWith("--"));
const getOpt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.split("=")[1] : dflt;
};

const src = pos[0];
if (!src) {
  console.error("Dùng: node scripts/png-to-svg.mjs <anh.png> [ra.svg] [--size 512] [--no-trim]");
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error(`Không thấy file: ${src}`);
  process.exit(1);
}
const out = pos[1] && !pos[1].startsWith("--") ? pos[1] : src.replace(/\.(png|jpe?g|webp|gif)$/i, "") + ".svg";
const trim = !flags.has("--no-trim");

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const ext = path.extname(src).toLowerCase();
const mime = MIME[ext] || "image/png";

function im(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}
const IM = (() => {
  if (im("magick", ["-version"])) return "magick";
  if (im("convert", ["-version"])) return "convert";
  return null;
})();

let workFile = src;
let trimmedBox = null;
if (trim && IM && ext === ".png") {
  const outTmp = path.join(path.dirname(src), `.chrtv-trim-${Date.now()}.png`);
  const res = im(IM, [src, "-background", "none", "-trim", "+repage", outTmp]);
  if (res !== null && fs.existsSync(outTmp) && fs.statSync(outTmp).size > 0) {
    const box = (im(IM, [outTmp, "-format", "%wx%h", "info:"]) || "").trim();
    if (/^\d+x\d+$/.test(box)) {
      workFile = outTmp;
      trimmedBox = box;
    } else {
      try { fs.unlinkSync(outTmp); } catch {}
    }
  }
}

let svgSize = null;
if (fs.existsSync(workFile)) {
  const dim = IM ? im(IM, [workFile, "-format", "%w %h", "info:"]) : null;
  if (dim && /^\d+\s+\d+/.test(dim.trim())) {
    const [w, h] = dim.trim().split(/\s+/).map(Number);
    svgSize = { w, h };
  }
}
if (!svgSize && ext === ".png") {
  // Đọc IHDR trực tiếp (8 byte chữ ký + 4 byte độ dài + "IHDR" rồi tới W,H)
  const buf = fs.readFileSync(workFile);
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) svgSize = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}
if (!svgSize) svgSize = { w: 512, h: 512 };

const forced = parseInt(getOpt("size", ""), 10);
const W = Number.isFinite(forced) && forced > 0 ? forced : svgSize.w;
const H = Number.isFinite(forced) && forced > 0 ? Math.round((forced * svgSize.h) / svgSize.w) : svgSize.h;

const b64 = fs.readFileSync(workFile).toString("base64");
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n` +
  `  <title>${path.basename(out, ".svg")}</title>\n` +
  `  <image href="data:${mime};base64,${b64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>\n` +
  `</svg>\n`;

fs.writeFileSync(out, svg);
if (workFile !== src) {
  try { fs.unlinkSync(workFile); } catch {}
}

console.log(`✓ ${path.relative(process.cwd(), out)}  (${(svg.length / 1024).toFixed(1)} KB, viewBox ${W}×${H}${trimmedBox ? `, đã cắt viền: ${trimmedBox}` : ""})`);
if (!IM && trim) console.log("  (gợi ý: cài ImageMagick để tự cắt viền trong suốt — không có vẫn dùng được)");
