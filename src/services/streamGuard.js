/**
 * CHRTV DIRECT STREAM — bỏ proxy hoàn toàn (theo yêu cầu fix TV)
 * - Trả về stream_url gốc trực tiếp, không qua /api/stream/token hay /api/stream/proxy
 * - Không xin token, không rewrite playlist
 * - Client tự phát HLS/DASH bằng shaka hoặc native
 */

export const CHRTV_CLIENT_UA = "CHRTV-OTT/0.0.1";

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

export function isProxiedStreamUrl() {
  return false;
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
 * Trả về URL phát trực tiếp — không token, không proxy
 */
export async function requestStreamAccess(channel, { at = 0 } = {}) {
  if (!channel) return "";
  const raw = channel.stream_url || channel.url || "";
  if (!raw) return "";
  if (!isHttpUrl(raw)) return raw;
  if (at) return localCatchupUrl(raw, at, channel.catchup_type || "append");
  return raw;
}

export async function refreshStreamToken(channel, at = 0) {
  return requestStreamAccess(channel, { at });
}

export function makeStreamRequestFilter() {
  return null;
}

export function applyStreamClientHeaders(headers) {
  return headers || {};
}
