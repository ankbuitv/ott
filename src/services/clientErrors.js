/**
 * Thu thập lỗi phía client để hết đoán.
 *
 * Vấn đề: app "crash" từng lúc (màn "⚠️ Có lỗi bất ngờ xảy ra" của ErrorBoundary,
 * hoặc tự nhiên trắng/ treo) nhưng không ai nhìn thấy dòng lỗi vì nó chỉ nằm trong
 * console của người dùng rồi mất khi tải lại trang.
 *
 * Cách này dùng hạ tầng đã có sẵn trong repo:
 *   POST /api/telemetry/player  → bảng D1 `player_errors`  → Admin → tab "Lỗi player"
 * (worker.js:1305 · 5335 · 4383). Lỗi JS gửi lên với `engine: "js"` nên tách ra được
 * bằng bộ lọc, và server đã tự giới hạn 60 lần/giờ/IP.
 *
 * Quy tắc: im lặng khi không gửi được (không bao giờ được làm app hỏng thêm),
 * tự cắt trùng lặp, và bỏ qua nhiễu vô hại (ResizeObserver loop, abort khi đổi kênh).
 */
import { logPlayerError } from "./telemetry";

/** Không phải lỗi app — đừng làm bẩn bảng. */
const NOISE = [
  /ResizeObserver loop/i,
  /AbortError|user aborted a request/i,
  /NetworkError when attempting to fetch|Failed to fetch|Load failed|net::ERR_/i,
  /Importing a module script failed/i,
];

const MAX_PER_CODE = 3; // mỗi loại lỗi tối đa 3 bản báo cáo/phiên
const COOLDOWN_MS = 15000;
const MAX_TOTAL = 12; // trần cho cả phiên — 1 người xem 8 tiếng không được spam DB

const sent = new Map();
let total = 0;

function isNoise(msg) {
  const s = String(msg || "");
  return NOISE.some((rx) => rx.test(s));
}

function platformTag() {
  try {
    const ua = String(navigator.userAgent || "");
    let kind = "web";
    if (typeof window !== "undefined" && window.Capacitor) kind = "app";
    else if (/Android.*Version\/[\d.]+.*Mobile/i.test(ua) || /SmartTV|BRAVIA|Tizen|AFT|GoogleTV/i.test(ua)) kind = "tv";
    else if (/Android|iPhone|iPad|iPod/i.test(ua)) kind = "mobile";
    return `${kind} ${(typeof location !== "undefined" ? location.hostname : "") || ""}`.slice(0, 60);
  } catch {
    return "unknown";
  }
}

/** Lưu 3 lỗi gần nhất vào sessionStorage để còn thấy SAU khi tải lại (lúc đó console đã mất). */
const SEEN_KEY = "chrtv_last_errors";
function rememberLocal(entry) {
  try {
    const arr = JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]");
    arr.unshift({ ...entry, t: Date.now() });
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(arr.slice(0, 3)));
  } catch {}
}

/** Đọc mấy lỗi đã gặp trong phiên hiện tại (dùng cho màn hình lỗi + tab Admin nội bộ). */
export function getRecentClientErrors() {
  try {
    const arr = JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * @param {object} o
 * @param {string} o.code     nhãn nhóm lỗi (mapper trong Admin): 'render' | 'uncaught' | 'promise' | 'resource' | 'hls' | 'shaka'
 * @param {string} o.detail   thông điệp lỗi + vị trí (server cắt 300 ký tự)
 * @param {number} o.fatal    1 = lỗi làm hỏng giao diện
 * @param {string} [o.channelId]
 * @param {string} [o.channelName]
 */
export function reportClientError({ code = "error", detail = "", fatal = 0, channelId = "", channelName = "" } = {}) {
  try {
    const msg = String(detail || "");
    if (isNoise(msg)) return;
    const key = String(code || "error").slice(0, 40);
    const now = Date.now();
    const st = sent.get(key) || { n: 0, t: 0 };
    if (st.n >= MAX_PER_CODE || now - st.t < COOLDOWN_MS || total >= MAX_TOTAL) return;
    st.n += 1;
    st.t = now;
    sent.set(key, st);
    total += 1;

    // Lưu ở đây TRƯỚC khi gửi: nếu trình duyệt chết ngay sau lỗi thì vẫn còn đọc được,
    // và logPlayerError tự chặn spam (2 phút/(kênh+code)) nên có thể nó bỏ qua bản gửi.
    rememberLocal({ code: key, detail: msg.slice(0, 400), fatal: fatal ? 1 : 0 });
    // Gửi qua telemetry có sẵn của app: kèm JWT (server ghi được user_id) + keepalive.
    logPlayerError({
      channel: channelId || channelName ? { channel_id: channelId, name: channelName } : null,
      engine: "js",
      code: key,
      detail: msg,
      fatal: !!fatal,
      platform: platformTag(),
    });
  } catch {
    /* không bao giờ để việc báo lỗi làm hỏng app */
  }
}

let installed = false;

/** Gắn 1 lần ở src/main.jsx — bắt lỗi ngoài React (script/ảnh lỗi, promise reject). */
export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // capture = true để bắt cả lỗi tải asset (script/img) — không nổi bubbled
  window.addEventListener(
    "error",
    (ev) => {
      const target = ev && ev.target;
      if (target && target !== window && target.tagName) {
        const src = target.currentSrc || target.src || target.href || "";
        reportClientError({
          code: "resource",
          detail: `${target.tagName.toLowerCase()} lỗi tải: ${String(src).slice(0, 160)}`,
          fatal: 0,
        });
        return;
      }
      const err = ev && ev.error;
      const stack = err && err.stack ? String(err.stack).split("\n").slice(1, 4).join(" <- ") : "";
      reportClientError({
        code: "uncaught",
        detail: `${String((ev && ev.message) || "error")} @ ${String((ev && ev.filename) || "").slice(-60)}:${(ev && ev.lineno) || 0}${stack ? " || " + stack.slice(0, 120) : ""}`,
        fatal: 0,
      });
    },
    true
  );

  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev && ev.reason;
    const msg = (r && (r.message || (r.error && r.error.message))) || String(r || "unhandled rejection");
    const stack = r && r.stack ? String(r.stack).split("\n").slice(1, 3).join(" <- ") : "";
    reportClientError({ code: "promise", detail: `${msg}${stack ? " || " + stack.slice(0, 140) : ""}`, fatal: 0 });
  });
}
