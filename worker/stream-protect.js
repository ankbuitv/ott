/**
 * CHRTV STREAM PROTECT — mã hoá luồng HLS (AES-128) ngay tại Cloudflare Workers.
 *
 * Mục tiêu: mọi luồng đi QUA PROXY (/api/stream/proxy) đều tự được mã hoá,
 * muốn giải mã phải gọi license server (mặc định https://license.ankb.qzz.io).
 * Bỏ VLC/potplayer/ffmpeg copy link: chúng lấy được playlist nhưng gọi key
 * không có token hợp lệ -> 403 -> không giải được.
 *
 * NGUYÊN TẮC:
 *  - Stateless: key được SUY RA từ token bằng HMAC(LICENSE_SECRET) — KHÔNG ghi
 *    KV/D1 trong đường phát (KV chỉ chịu ~1 write/key/giây, dùng cho streaming
 *    là sập). Cả worker chính và license worker tính ra CÙNG một key.
 *  - Không bao giờ làm hỏng phát: luồng nào không mã hoá được (fMP4, đã có
 *    EXT-X-KEY, FPT Play, kênh tắt...) thì phát BÌNH THƯỜNG (không mã hoá).
 *  - Chỉ mã hoá MPEG-TS (.ts). fMP4/CMAF cần CENC/DRM thật — bỏ qua.
 *
 * Kiến trúc:
 *   playlist  -> chèn  #EXT-X-KEY:METHOD=AES-128,URI="<license>/k/<token>",IV=0x..
 *   segment   -> AES-128-CBC (PKCS#7) với key = HMAC(secret, token)[0..16]
 *   /k/<token>-> trả đúng 16 byte key thô (application/octet-stream)
 */

// ---------------------------------------------------------------------------
// Cấu hình mặc định (có thể đổi bằng biến môi trường của Worker)
// ---------------------------------------------------------------------------
export const KEY_ROTATE_DEFAULT = 600;   // xoay key mỗi 10 phút
export const KEY_GRACE_DEFAULT = 1800;   // key còn dùng được thêm 30 phút sau khi xoay
export const PROTECT_MAX_BYTES_DEFAULT = 8 * 1024 * 1024; // segment lớn hơn thì bỏ cuộc (CPU)

/** Những host này KHÔNG BAO GIỜ mã hoá (FPT Play tự bảo vệ + hay lỗi khi can thiệp). */
export const DEFAULT_SKIP_HOSTS = [
  "fptplay",
  "fpt-play",
  "fpt.vn",
  "fptcdn",
  "fptplaycdn",
];

// ---------------------------------------------------------------------------
// Tiện ích base64url / hex
// ---------------------------------------------------------------------------
export function b64uEncode(bytes) {
  let s = "";
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function b64uDecode(str) {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function toHex(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
  return s;
}
export async function sha256hex(str) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(str)));
  return toHex(new Uint8Array(d));
}
async function hmacBytes(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(msg)));
  return new Uint8Array(sig);
}

// ---------------------------------------------------------------------------
// Phát hiện luồng "né" (FPT Play + danh sách host do admin cấu hình)
// ---------------------------------------------------------------------------
export function hostOf(u) {
  try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ""; }
}
/** FPT Play: host hoặc đường dẫn có dấu hiệu fptplay/fpt-play/fpt.vn/fptcdn. */
export function isFptPlayUrl(u) {
  const s = String(u || "").toLowerCase();
  if (!s) return false;
  const h = hostOf(s);
  if (h && (h.includes("fptplay") || h.includes("fpt-play") || h.includes("fptcdn") || h.endsWith("fpt.vn") || h.includes(".fpt."))) return true;
  return /\/fptplay[\/.-]/i.test(s) || /[?&](ch|id)=fpt/i.test(s);
}
/** Trả 'fpt' | 'host' | null — lý do phải né luồng này. */
export function protectSkipReason(u, extraHosts) {
  if (isFptPlayUrl(u)) return "fpt";
  const h = hostOf(u);
  if (!h) return null;
  const extra = Array.isArray(extraHosts) ? extraHosts : String(extraHosts || "").split(",");
  for (const raw of extra) {
    const p = String(raw || "").trim().toLowerCase();
    if (!p) continue;
    if (h === p || h.endsWith("." + p) || h.includes(p)) return "host";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Playlist có mã hoá được không?
// ---------------------------------------------------------------------------
export function isMasterPlaylist(text) {
  return /#EXT-X-STREAM-INF/i.test(String(text || ""));
}
/** { ok, reason } — reason: 'master' | 'encrypted' | 'byterange' | 'fmp4' | 'empty' */
export function playlistProtectable(text) {
  const t = String(text || "");
  if (!t.trim()) return { ok: false, reason: "empty" };
  if (isMasterPlaylist(t)) return { ok: false, reason: "master" };          // playlist gốc, con sẽ xử lý
  if (/#EXT-X-KEY/i.test(t)) return { ok: false, reason: "encrypted" };     // upstream đã mã hoá/DRM
  if (/#EXT-X-BYTERANGE/i.test(t)) return { ok: false, reason: "byterange" };
  if (/#EXT-X-MAP/i.test(t)) return { ok: false, reason: "fmp4" };
  if (/\.(m4s|mp4|cmfv|cmfa|cmft)(\?|$)/im.test(t)) return { ok: false, reason: "fmp4" };
  if (!/#EXTINF/i.test(t)) return { ok: false, reason: "nosegment" };
  return { ok: true, reason: "" };
}

// ---------------------------------------------------------------------------
// Token license (stateless) + key
// ---------------------------------------------------------------------------
export function keyBucket(nowSec, rotate = KEY_ROTATE_DEFAULT) {
  return Math.floor(Number(nowSec || 0) / rotate);
}

/**
 * Token dạng: L1.<base64url(payload)>.<base64url(hmac)>
 * payload = { v, u: userId, s: hash(sid), c: channelId, b: bucket, e: exp, ip?: hash(ip) }
 * Cùng đầu vào -> CÙNG chuỗi token -> cả 2 worker suy ra cùng key.
 */
export async function buildLicenseToken(opts, secret) {
  const {
    uid = 0, sid = "", cid = "", bucket = 0, exp = 0,
    iph = "", rotate = KEY_ROTATE_DEFAULT, grace = KEY_GRACE_DEFAULT,
  } = opts || {};
  const e = Number(exp) > 0 ? Math.floor(exp) : (Number(bucket) + 1) * rotate + grace;
  const payload = {
    v: 1,
    u: Number(uid) || 0,
    s: (await sha256hex(String(sid || ""))).slice(0, 12),
    c: String(cid || "").slice(0, 64),
    b: Number(bucket) || 0,
    e,
  };
  if (iph) payload.ip = String(iph).slice(0, 16);
  const body = b64uEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = b64uEncode(await hmacBytes(secret, "chrtv-lic-v1|" + body));
  return "L1." + body + "." + sig;
}

/** { ok, payload, reason } — reason: 'bad' | 'sig' | 'expired' | 'ip' */
export async function verifyLicenseToken(token, secret, opts) {
  const { now = Math.floor(Date.now() / 1000), iph = "", strictIp = false } = opts || {};
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "L1") return { ok: false, reason: "bad" };
  if (!secret) return { ok: false, reason: "bad" };
  const expect = b64uEncode(await hmacBytes(secret, "chrtv-lic-v1|" + parts[1]));
  if (expect !== parts[2]) return { ok: false, reason: "sig" };
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(b64uDecode(parts[1]))); }
  catch { return { ok: false, reason: "bad" }; }
  if (!Number.isFinite(payload.e) || now > payload.e) return { ok: false, reason: "expired" };
  if (strictIp && payload.ip && iph && payload.ip !== iph) return { ok: false, reason: "ip" };
  return { ok: true, payload };
}

/** Đọc payload mà không cần secret (debug/log). */
export function peekLicenseToken(token) {
  try { return JSON.parse(new TextDecoder().decode(b64uDecode(String(token || "").split(".")[1] || ""))); }
  catch { return null; }
}

export async function deriveKeyBytes(token, secret) {
  return (await hmacBytes(secret, "chrtv-aes-key-v1|" + token)).slice(0, 16);
}
export async function deriveIvBytes(token, secret) {
  return (await hmacBytes(secret, "chrtv-aes-iv-v1|" + token)).slice(0, 16);
}

// ---------------------------------------------------------------------------
// AES-128-CBC (PKCS#7 — đúng chuẩn HLS EXT-X-KEY METHOD=AES-128)
// ---------------------------------------------------------------------------
export async function aes128CbcEncrypt(bytes, key, iv) {
  const k = await crypto.subtle.importKey("raw", key, { name: "AES-CBC" }, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-CBC", iv }, k, bytes);
  return new Uint8Array(ct);
}
export async function aes128CbcDecrypt(bytes, key, iv) {
  const k = await crypto.subtle.importKey("raw", key, { name: "AES-CBC" }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, k, bytes);
  return new Uint8Array(pt);
}

// ---------------------------------------------------------------------------
// Chèn #EXT-X-KEY vào playlist (ngay trước segment đầu tiên)
// ---------------------------------------------------------------------------
export function insertExtXKey(text, keyUri, ivHex) {
  const lines = String(text || "").split(/\r?\n/);
  const tag = `#EXT-X-KEY:METHOD=AES-128,URI="${keyUri}",IV=0x${String(ivHex || "").replace(/^0x/, "")}`;
  const out = [];
  let inserted = false;
  for (const line of lines) {
    const l = line.trim();
    if (!inserted && l && !l.startsWith("#")) {
      out.push(tag);
      inserted = true;
    }
    out.push(line);
  }
  if (!inserted) out.push(tag);
  return out.join("\n");
}
