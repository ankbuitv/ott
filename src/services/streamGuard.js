/**
 * CHRTV STREAM GUARD — phát qua proxy có token, KHÔNG lộ link m3u8 gốc.
 *
 * Vì sao phải có file này: nếu client cầm `stream_url` gốc thì mọi công cụ
 * (DevTools Network, Charles/Fiddler, yt-dlp, IDM…) đều lấy được link thật chỉ
 * bằng 1 cú nhìn — mọi lớp bảo vệ khác trở thành vô nghĩa. Giờ:
 *
 *   1. /api/playlist chỉ trả METADATA (không có stream_url).
 *   2. Muốn phát -> POST/GET /api/stream/token?channel=<id> kèm JWT (user hoặc guest)
 *      -> server kiểm tra gói cước rồi trả `proxy_url` = /api/stream/proxy?t=<token>
 *      (token AES-GCM, bind user + IP/UA, TTL ngắn, URL thật nằm BÊN TRONG token).
 *   3. Worker tải playlist gốc, viết lại từng URI con thành token riêng -> client
 *      không bao giờ thấy origin thật, copy link ra chỗ khác cũng chết (khác IP/UA + hết hạn).
 *
 * Kênh do NGƯỜI DÙNG tự import (M3U cá nhân) vẫn phát thẳng vì link là của họ.
 */

import { API_BASE } from "./config";
import { ensureSessionToken } from "./session";
import { setPreviewState } from "./ads";

export const CHRTV_CLIENT_UA = "CHRTV-OTT/0.0.1";

/** Base tuyệt đối cho URL phát — Capacitor/WebView không có origin http nên phải ghép API_BASE. */
function absBase() {
  if (API_BASE) return API_BASE.replace(/\/+$/, "");
  try {
    if (typeof window !== "undefined" && window.location && /^https?:$/.test(window.location.protocol)) {
      return window.location.origin;
    }
  } catch {}
  return "";
}

export function isHttpUrl(u) {
  try {
    const x = new URL(u, typeof window !== "undefined" ? window.location.href : "https://x/");
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}

export function isHlsUrl(u) {
  return /\.m3u8(\?|$|#)/i.test(u || "");
}

export function isStreamableUrl(u) {
  return !!u && isHttpUrl(u) && (isHlsUrl(u) || /\.mpd(\?|$|#)/i.test(u || ""));
}

/** true nếu URL đang phát là URL proxy của CHRTV (player nên coi như HLS). */
export function isProxiedStreamUrl(u) {
  return /\/api\/stream\/proxy\?/.test(String(u || ""));
}

// ---- Thông tin xoay token theo từng kênh: { url, exp, rotateAt } ----
const rotateInfo = new Map();

/** Thời điểm (ms) nên xin token mới cho kênh này; 0 = không cần xoay. */
export function getRotateAtMs(channelId) {
  const info = rotateInfo.get(channelId);
  return info && info.rotateAt ? info.rotateAt : 0;
}

function err(code, message) {
  return Object.assign(new Error(message || code), { code });
}

function localCatchupUrl(baseUrl, atSec, catchupType = "append") {
  if (!baseUrl || !atSec) return baseUrl;
  const d = new Date(atSec * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const formatted = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const sep = baseUrl.includes("?") ? "&" : "?";
  if (catchupType === "flussonic" || baseUrl.includes("timeshift"))
    return baseUrl.replace(/\/index\.m3u8$/i, "") + `/timeshift_abs-${atSec}.m3u8`;
  if (catchupType === "shift") return `${baseUrl}${sep}shift=${atSec}`;
  return `${baseUrl}${sep}utc=${atSec}&lutc=${Math.floor(Date.now() / 1000)}&catchup_start=${formatted}`;
}

/**
 * Xin quyền phát từ server và trả về URL phát (proxy).
 * Ném Error kèm .code: LOGIN_REQUIRED | PLAN_REQUIRED | NO_SESSION | TOKEN_ERROR
 */
export async function requestStreamAccess(channel, { at = 0 } = {}) {
  if (!channel) return "";

  // Kênh người dùng tự import / kênh dự phòng: server không quản lý -> phát thẳng.
  const raw = channel.stream_url || channel.url || "";
  if (raw && channel.protected !== true) {
    if (!isHttpUrl(raw)) return raw;
    return at ? localCatchupUrl(raw, at, channel.catchup_type || "append") : raw;
  }

  const { token } = await ensureSessionToken();
  if (!token) throw err("NO_SESSION", "Không tạo được phiên xem.");

  const base = absBase();
  const qs = new URLSearchParams();
  if (channel.channel_id) qs.set("channel", channel.channel_id);
  else if (raw) qs.set("u", raw);
  else throw err("TOKEN_ERROR", "Kênh thiếu định danh.");
  if (at) qs.set("at", String(at));

  let res;
  try {
    res = await fetch(`${base}/api/stream/token?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, "X-CHRTV-Client": CHRTV_CLIENT_UA, Accept: "application/json" },
    });
  } catch (e) {
    throw err("TOKEN_ERROR", "Không kết nối được máy chủ phát.");
  }

  let data = {};
  try { data = await res.json(); } catch {}

  if (!res.ok || !data.success) {
    const code = data.error || (res.status === 401 ? "LOGIN_REQUIRED" : res.status === 403 ? "PLAN_REQUIRED" : "TOKEN_ERROR");
    // Hết 5 phút xem thử của gói Standard -> báo riêng để UI mời nâng gói
    if (code === "PREVIEW_EXPIRED") {
      setPreviewState({ ...(data.preview || {}), remaining: 0, enabled: true });
      throw err("PREVIEW_EXPIRED", data.message || "Hết thời gian xem thử.");
    }
    if (code === "LOGIN_REQUIRED" || code === "PLAN_REQUIRED") throw err(code, data.message || data.error);
    throw err("TOKEN_ERROR", data.message || data.error || `HTTP ${res.status}`);
  }

  // Phiên xem thử: server trả quota còn lại sau mỗi lần cấp token
  if (data.preview) setPreviewState({ ...data.preview, enabled: true });

  const url = data.proxy_url ? `${base}${data.proxy_url}` : "";
  if (!url) throw err("TOKEN_ERROR", "Máy chủ không trả URL phát.");

  const nowS = Math.floor(Date.now() / 1000);
  const rotateAtS = data.rotate_at || (data.exp ? data.exp - 60 : nowS + 240);
  rotateInfo.set(channel.channel_id || raw, {
    url,
    exp: (data.exp || nowS + 300) * 1000,
    rotateAt: Math.max(Date.now() + 15000, rotateAtS * 1000),
  });
  return url;
}

/** Xin token mới cho cùng kênh (gọi trước khi token hết hạn để phát liền mạch). */
export async function refreshStreamToken(channel, at = 0) {
  return requestStreamAccess(channel, { at });
}

/**
 * Filter cho shaka: gắn header định danh client cho mọi request tới proxy CHRTV.
 * (Trình duyệt không cho set User-Agent nên dùng X-CHRTV-*.)
 */
export function makeStreamRequestFilter(channel) {
  return (type, request) => {
    try {
      const uris = request.uris || [];
      if (!uris.some((u) => isProxiedStreamUrl(u))) return;
      request.headers = request.headers || {};
      request.headers["X-CHRTV-Client"] = CHRTV_CLIENT_UA;
      const ua = channel && (channel.user_agent || channel.userAgent);
      const ref = channel && channel.referer;
      if (ua) request.headers["X-CHRTV-Upstream-UA"] = ua;
      if (ref) request.headers["X-CHRTV-Upstream-Referer"] = ref;
    } catch {}
  };
}

/** Headers gắn thêm cho hls.js (xhrSetup) khi gọi proxy CHRTV. */
export function applyStreamClientHeaders(headers, channel) {
  const h = headers || {};
  h["X-CHRTV-Client"] = CHRTV_CLIENT_UA;
  const ua = channel && (channel.user_agent || channel.userAgent);
  const ref = channel && channel.referer;
  if (ua) h["X-CHRTV-Upstream-UA"] = ua;
  if (ref) h["X-CHRTV-Upstream-Referer"] = ref;
  return h;
}
