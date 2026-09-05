import { API_BASE } from "./config";
import { ensureSessionToken } from "./session";

/**
 * CHRTV SECURE STREAM GUARD (2026-09-05 — patch bảo mật)
 *
 * Luồng phát mới:
 *  1. App KHÔNG còn giữ `stream_url` gốc (API /api/playlist chỉ trả metadata).
 *  2. Khi bắt đầu phát, client gọi /api/stream/token?channel=<id> (kèm JWT
 *     user hoặc guest) → server kiểm tra entitlement theo gói PHÍA SERVER và
 *     trả `proxy_url` chứa playback token HMAC (TTL 60s, bind user+IP+channel).
 *  3. Player tải `proxy_url`; worker rewrite playlist con bằng SEGMENT token
 *     MỚI cho mỗi lần phát (tự động xoay — P0-A).
 *  4. shaka requestFilter: token sắp hết hạn → tự xin token mới và rewrite
 *     `t=` trước mỗi lần fetch manifest — phát liên tục không gián đoạn.
 *
 * X-CHRTV-Client giờ CHỈ là phiên bản client (marker), KHÔNG phải xác thực.
 */

export const CHRTV_CLIENT_UA = "CHRTV-OTT/0.0.1";
const REFRESH_MARGIN_MS = 25 * 1000; // manifest token TTL 60s — đổi mới khi còn < 25s

// cache token theo (channel, at): tránh xin lặp lại khi player re-load
const _cache = new Map();
function cacheKey(channel, at) {
  return `${channel?.channel_id || ""}|${at || 0}`;
}

function errWithCode(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

export function isHttpUrl(u) {
  try {
    const x = new URL(u, window.location.href);
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

export function isProxiedStreamUrl(u) {
  return !!u && u.includes("/api/stream/proxy") && /t=/.test(u);
}

// Catchup variant — CHỈ dùng cho kênh import của user (client có URL từ M3U của
// chính họ). Kênh chuẩn: server tự tính catchup từ `at` (client không biết URL).
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
 * Xin quyền phát 1 kênh → trả proxy_url (đã chứa token).
 * Ném Error.code: LOGIN_REQUIRED | PLAN_REQUIRED | TOKEN_ERROR | NO_SESSION
 */
export async function requestStreamAccess(channel, { at = 0, force = false } = {}) {
  if (!channel || !channel.channel_id) return "";
  const key = cacheKey(channel, at);
  const c = _cache.get(key);
  if (!force && c && c.proxyUrl && c.exp * 1000 - REFRESH_MARGIN_MS > Date.now()) {
    return c.proxyUrl;
  }

  let qs;
  let directUrl = ""; // URL phát trực tiếp (fallback hợp lệ cho kênh import của user)
  if (channel.stream_url && isHttpUrl(channel.stream_url) && isStreamableUrl(channel.stream_url)) {
    // Kênh import (M3U riêng của user — client biết URL, server verify theo whitelist)
    directUrl = at ? localCatchupUrl(channel.stream_url, at, channel.catchup_type) : channel.stream_url;
    qs = "u=" + encodeURIComponent(directUrl);
  } else {
    // Kênh chuẩn: server tra URL + tính catchup + kiểm tra gói
    qs = "channel=" + encodeURIComponent(channel.channel_id);
    if (at) qs += "&at=" + at;
  }

  // Chỉ các lỗi "domain không whitelist" / "sơ khai URL" mới được fallback phát
  // trực tiếp — KHÔNG bao giờ fallback khi PLAN_REQUIRED / SSRF (giữ nguyên
  // quyền truy cập kiểm tra phía server).
  const DOMAIN_ONLY = new Set(["NOT_ALLOWED", "BAD_URL", "BAD_SCHEME", "SSRF_BLOCKED"]);
  const fallbackDirect = () => {
    if (!directUrl) return false;
    _cache.set(key, { token: "", exp: Math.floor(Date.now() / 1000) + 300, proxyUrl: directUrl, at });
    return true;
  };

  const session = await ensureSessionToken();
  if (!session.token) {
    if (fallbackDirect()) return directUrl; // API không đạt — kênh import vẫn xem trực tiếp
    throw errWithCode("NO_SESSION", "Chưa có phiên");
  }

  try {
    const res = await fetch(`${API_BASE}/api/stream/token?${qs}`, {
      headers: {
        Authorization: `Bearer ${session.token}`,
        "X-CHRTV-Client": CHRTV_CLIENT_UA, // marker phiên bản — không phải xác thực
        Accept: "application/json",
      },
    });
    if (res.status === 401) {
      let code = "LOGIN_REQUIRED";
      try { const j = await res.json(); code = j.error || code; } catch {}
      throw errWithCode(code);
    }
    if (res.status === 403) {
      let code = "PLAN_REQUIRED";
      try { const j = await res.json(); code = j.code || j.error || code; } catch {}
      if (DOMAIN_ONLY.has(code) && fallbackDirect()) return directUrl;
      throw errWithCode(code);
    }
    if (!res.ok) throw errWithCode("TOKEN_ERROR");
    const j = await res.json();
    if (!j || !j.t || !j.proxy_url) throw errWithCode("TOKEN_ERROR");
    // player.load cần URL TỐI ĐA tuyệt đối (Capacitor = origin https, web = relative)
    const full = API_BASE ? API_BASE + j.proxy_url : j.proxy_url;
    _cache.set(key, { token: j.t, exp: j.exp || 0, proxyUrl: full, at });
    return full;
  } catch (e) {
    // Lỗi có code (entitlement/login) → truyền thẳng. Mạng/API down → kênh import
    // phát trực tiếp; kênh chuẩn (không có directUrl) → báo lỗi rõ.
    if (e && e.code) throw e;
    if (fallbackDirect()) return directUrl;
    throw errWithCode("TOKEN_ERROR");
  }
}
/** Ép xoay token (player gặp TOKEN_EXPIRED) rồi load lại. */
export async function refreshStreamToken(channel, at = 0) {
  return requestStreamAccess(channel, { at, force: true });
}

/**
 * shaka requestFilter — "tự động xoay" token (P0-A) + JWT session header:
 *  - Mọi request tới /api/stream/proxy được kèm `Authorization: Bearer <JWT>`
 *    (lớp thêm: server re-check uid + gói). Server chấp nhận cả không-JWT
 *    (Chromecast/external) nhờ binding token+sid, nhưng web luôn gửi JWT.
 *  - Request MANIFEST (proxy_url đã cấp): nếu token còn < REFRESH_MARGIN_MS
 *    thì xin token MỚI và thay thẳng URI — không gián đoạn stream.
 *  - Request SEGMENT: chỉ thêm header (token segment do worker ký mới
 *    theo mỗi lần fetch playlist — không rewrite).
 */
export function makeStreamRequestFilter(channel, at = 0) {
  if (!channel) return null;
  return (type, req) => {
    try {
      const uri = req.uri || "";
      if (!isProxiedStreamUrl(uri)) return true;
      return ensureSessionToken()
        .then((s) => {
          if (s.token) {
            try { req.headers["Authorization"] = `Bearer ${s.token}`; } catch (e) {}
          }
          const c = _cache.get(cacheKey(channel, at));
          if (!c || !c.proxyUrl) return true;
          if (uri !== c.proxyUrl) return true; // segment — không rewrite
          if (c.exp * 1000 - Date.now() > REFRESH_MARGIN_MS) return true;
          // manifest sắp hết hạn → xin token mới, thay URI
          return requestStreamAccess(channel, { at, force: true })
            .then((fresh) => {
              if (fresh && isProxiedStreamUrl(fresh)) req.uri = fresh;
              return true;
            })
            .catch(() => true);
        })
        .catch(() => true);
    } catch {
      return true;
    }
  };
}

/** Header marker phiên bản client (KHÔNG phải cơ chế xác thực). */
export function applyStreamClientHeaders(headers) {
  try { headers["X-CHRTV-Client"] = CHRTV_CLIENT_UA; } catch {}
  return headers;
}
