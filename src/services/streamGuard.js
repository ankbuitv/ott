import { API_BASE } from "./config";

// ===== CHRTV SECURE STREAM GUARD =====
// - Mọi luồng m3u8 đi qua proxy của worker: /api/stream/proxy?u=<enc>&t=<token>
// - Token: AES-128-GCM, TTL 10 phút, client CHỦ ĐỘNG xoay ở phút thứ 9 (rotate_at)
//   để người đang xem chuyển token mới mượt mà, không giật.
// - Browser không được phép tự set header User-Agent (forbidden header), nên client
//   định danh bản thân bằng header X-CHRTV-Client: CHRTV-OTT/0.0.1 — worker chấp nhận
//   UA HOẶC header này; curl/ffplay/vlc bị chặn cứng ở worker.

export const CHRTV_CLIENT_UA = "CHRTV-OTT/0.0.1";
const ROTATE_MARGIN_MS = 60 * 1000; // xin token mới trước khi hết hạn tối thiểu 1 phút
const REFRESH_CHECK_MS = 15 * 1000;

const _cache = { u: "", t: "", exp: 0, rotateAt: 0, lastError: 0 };
let _ticker = null;

function isHttpUrl(u) {
  try { const x = new URL(u, window.location.href); return x.protocol === "http:" || x.protocol === "https:"; } catch { return false; }
}

export function isHlsUrl(u) {
  return /\.m3u8(\?|$|#)/i.test(u || "");
}

export function isStreamableUrl(u) {
  return !!u && isHttpUrl(u) && (isHlsUrl(u) || /\.mpd(\?|$|#)/i.test(u || ""));
}

// Xin token cho 1 upstream URL. Token bind (origin + thư mục path) nên các
// segment/playlist con trong cùng thư mục đều dùng lại được token này.
export async function getStreamToken(u, { force = false } = {}) {
  if (!u) return "";
  const now = Date.now();
  if (!force && _cache.t && _cache.u && sameScope(_cache.u, u) && _cache.exp * 1000 - ROTATE_MARGIN_MS > now) {
    scheduleRotate(u);
    return _cache.t;
  }
  try {
    const res = await fetch(`${API_BASE}/api/stream/token?u=${encodeURIComponent(u)}`, {
      headers: { "X-CHRTV-Client": CHRTV_CLIENT_UA },
    });
    if (!res.ok) { _cache.lastError = now; return _cache.t || ""; }
    const j = await res.json();
    if (!j || !j.t) return _cache.t || "";
    _cache.u = u; _cache.t = j.t; _cache.exp = j.exp || 0; _cache.rotateAt = j.rotate_at || 0;
    scheduleRotate(u);
    return _cache.t;
  } catch {
    _cache.lastError = now;
    return _cache.t || "";
  }
}

function sameScope(a, b) {
  try {
    const x = new URL(a), y = new URL(b);
    if (x.origin !== y.origin) return false;
    const dx = x.pathname.replace(/\/[^/]*$/, "") || "/", dy = y.pathname.replace(/\/[^/]*$/, "") || "/";
    return dx === dy;
  } catch { return false; }
}

// Đúng phút thứ 9: chủ động xin token MỚI (IV luôn xoay) — người xem tiếp tục,
// các lần reload playlist sau của shaka/hls tự mang token mới, không cần restart.
async function rotateNow() {
  if (!_cache.u || !_cache.t) return;
  const remain = _cache.exp * 1000 - Date.now();
  if (remain > ROTATE_MARGIN_MS * 2) { scheduleRotate(_cache.u); return; }
  await getStreamToken(_cache.u, { force: true });
}

function scheduleRotate() {
  if (_ticker) return;
  _ticker = setInterval(() => {
    if (!_cache.t) return;
    const remain = _cache.exp * 1000 - Date.now();
    if (remain <= ROTATE_MARGIN_MS * 2) rotateNow();
  }, REFRESH_CHECK_MS);
}

// Trả về URL đi qua proxy bảo vệ (token nhúng sẵn). Nếu chưa lấy được token thì
// trả URL gốc để player tự thử (worker vẫn chặn nếu thiếu token).
export async function proxifyStreamUrl(u, { force = false } = {}) {
  if (!u || !isHttpUrl(u) || !isHlsUrl(u)) return u;
  if (u.startsWith("/")) return u; // URL nội bộ (/api/proxy fallback...) — giữ nguyên
  if (u.includes("/api/stream/proxy") && !force) return u; // đã proxied (catchup variant...)
  // Catchup variant cùng thư mục (timeshift_abs-*.m3u8) dùng lại token của base
  const t = await getStreamToken(u, { force });
  if (!t) return u;
  return `${API_BASE}/api/stream/proxy?u=${encodeURIComponent(u)}&t=${t}`;
}

// Ép xoay token ngay (worker trả TOKEN_EXPIRED thì gọi cái này rồi load lại)
export async function refreshStreamToken(u) {
  _cache.t = ""; _cache.exp = 0;
  return getStreamToken(u, { force: true });
}

// Header định danh bắt buộc cho mọi request stream (shaka requestFilter gọi cái này)
export function applyStreamClientHeaders(headers) {
  try { headers["X-CHRTV-Client"] = CHRTV_CLIENT_UA; } catch {}
  return headers;
}
