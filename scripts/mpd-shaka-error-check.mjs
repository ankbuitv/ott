/**
 * Kiểm tra: KÊNH DASH (.mpd) KHÔNG bị "báo lỗi shaka".
 *
 *   node scripts/mpd-shaka-error-check.mjs        (cần: npm i --no-save jsdom)
 *
 * Chạy code THẬT, không mô phỏng lại logic:
 *   [A] Client — mount `src/components/VideoPlayer.jsx` thật trong jsdom, cho shaka
 *       (đã stub) bắn event 'error', rồi đếm số request /api/telemetry/player:
 *         - kênh .mpd  → 0 báo cáo (kể cả lỗi CRITICAL), màn lỗi chỉ hiện khi CRITICAL
 *         - kênh .m3u8 → vẫn báo như cũ (engine 'shaka', fatal theo severity)
 *   [B] Client — `isDashChannel()` nhận ra kênh DASH qua URL proxy opaque nhờ cờ
 *       `mpd` mà /api/stream/token trả về (chế độ STREAM_MODE=proxy).
 *   [C] Worker — gọi handler thật (`worker/worker.js` → POST /api/telemetry/player)
 *       với D1 giả: lỗi engine=shaka của kênh .mpd KHÔNG được INSERT (chặn cả mấy
 *       bản APK cũ vẫn gửi lên).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY = path.join(ROOT, ".mpdshaka-entry.tmp.jsx");
const BUNDLE = path.join(ROOT, ".mpdshaka-bundle.tmp.cjs");
const SHAKA_STUB = path.join(ROOT, ".mpdshaka-shaka-stub.tmp.mjs");
const HLS_STUB = path.join(ROOT, ".mpdshaka-hls-stub.tmp.mjs");

let pass = 0, fail = 0;
const ok = (cond, msg, extra = "") => {
  if (cond) { pass++; console.log("  \u2705", msg); }
  else { fail++; console.log("  \u274c", msg, extra ? "\u2014 " + extra : ""); }
};

// ---------------------------------------------------------------------------
// jsdom + fetch ghi lại mọi bản báo cáo lỗi
// ---------------------------------------------------------------------------
const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom chưa cài HTMLMediaElement.play/pause — player gọi nên phải có promise thật
dom.window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
dom.window.HTMLMediaElement.prototype.pause = function () {};
dom.window.HTMLMediaElement.prototype.load = function () {};
// React + hook đo khung hình (watermark) cần mấy API này ở global scope
globalThis.requestAnimationFrame = (cb) => dom.window.setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => dom.window.clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.IntersectionObserver = globalThis.IntersectionObserver;
globalThis.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));

const telemetryCalls = [];
const tokenResponses = new Map(); // channel_id -> response của /api/stream/token
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  writable: true,
  value: async (url, opts = {}) => {
    const u = String(url);
    if (u.includes("/api/telemetry/player")) {
      telemetryCalls.push(JSON.parse(opts.body || "{}"));
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    }
    if (u.includes("/auth/guest")) {
      return { ok: true, status: 200, json: async () => ({ token: "guest.jwt.test", exp: Math.floor(Date.now() / 1000) + 7200 }) };
    }
    if (u.includes("/api/stream/token")) {
      const cid = new URL(u).searchParams.get("channel");
      const data = tokenResponses.get(cid);
      if (data) return { ok: true, status: 200, json: async () => data };
    }
    return { ok: true, status: 200, json: async () => ({ success: true }) };
  },
});

// ---------------------------------------------------------------------------
// Stub shaka-player / hls.js (chỉ để điều khiển event lỗi; logic player là thật)
// ---------------------------------------------------------------------------
fs.writeFileSync(SHAKA_STUB, `
export const shakaState = { players: [], loaded: [], destroyed: 0 };
class FakePlayer {
  constructor(video) { this.video = video; this.listeners = {}; shakaState.players.push(this); }
  configure() {}
  getNetworkingEngine() { return { registerRequestFilter() {} }; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  async load(url) { shakaState.loaded.push(url); }
  getVariantTracks() { return []; }
  selectVariantTrack() {}
  destroy() { shakaState.destroyed += 1; }
  emit(type, detail) { (this.listeners[type] || []).slice().forEach((fn) => fn({ type, detail })); }
}
FakePlayer.isBrowserSupported = () => true;
const shaka = {
  Player: FakePlayer,
  polyfill: { installAll() {} },
  util: { Error: { Severity: { RECOVERABLE: 1, CRITICAL: 2 } } },
};
export default shaka;
`);
// isSupported() = false -> player rơi xuống nhánh shaka (đúng như trình duyệt không
// hỗ trợ MSE), nhờ vậy test được handler lỗi shaka cho cả kênh .m3u8 lẫn .mpd.
fs.writeFileSync(HLS_STUB, `
class Hls {
  static Events = { MEDIA_ATTACHED: "hlsMediaAttached", MANIFEST_PARSED: "hlsManifestParsed", ERROR: "hlsError" };
  static ErrorTypes = { NETWORK_ERROR: "networkError", MEDIA_ERROR: "mediaError", OTHER_ERROR: "otherError" };
  static isSupported() { return false; }
  attachMedia() {} loadSource() {} startLoad() {} destroy() {} on() {} recoverMediaError() {}
}
export default Hls;
`);

fs.writeFileSync(ENTRY, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import VideoPlayer from './src/components/VideoPlayer.jsx';
import { ToastProvider } from './src/contexts/ToastContext.jsx';
import { I18nProvider } from './src/contexts/I18nContext.jsx';
import { SettingsProvider } from './src/contexts/SettingsContext.jsx';
import { ProfileProvider } from './src/contexts/ProfileContext.jsx';
export { React, createRoot, act, VideoPlayer, ToastProvider, I18nProvider, SettingsProvider, ProfileProvider };
export { isDashChannel, isMpdUrl, requestStreamAccess } from './src/services/streamGuard.js';
export { isCriticalShakaError, SHAKA_CRITICAL_SEVERITY } from './src/services/telemetry.js';
export { shakaState } from './.mpdshaka-shaka-stub.tmp.mjs';
`);

try {
  execFileSync("npx", ["esbuild", ENTRY, "--bundle", "--format=cjs", "--platform=node",
    `--outfile=${BUNDLE}`, "--define:import.meta.env={}",
    `--alias:shaka-player=${SHAKA_STUB}`, `--alias:hls.js=${HLS_STUB}`,
    "--log-level=error"], { cwd: ROOT, stdio: "pipe" });
} catch (e) {
  console.error("esbuild fail:", String(e.stdout || e.message));
  process.exit(1);
}

// ---------------------------------------------------------------------------
// [A] + [B] Client
// ---------------------------------------------------------------------------
try {
  const m = await import(pathToFileURL(BUNDLE).href);
  const api = m.default || m;
  const { React, createRoot, act, VideoPlayer, ToastProvider, I18nProvider, SettingsProvider, ProfileProvider,
    isDashChannel, isMpdUrl, requestStreamAccess, isCriticalShakaError, SHAKA_CRITICAL_SEVERITY, shakaState } = api;

  console.log("\n== [0] Hằng số severity phải khớp shaka-player thật ==");
  const realShakaSrc = fs.readFileSync(path.join(ROOT, "node_modules/shaka-player/lib/util/error.js"), "utf8");
  ok(/'CRITICAL':\s*2/.test(realShakaSrc) && SHAKA_CRITICAL_SEVERITY === 2,
    `SHAKA_CRITICAL_SEVERITY = ${SHAKA_CRITICAL_SEVERITY} khớp shaka.util.Error.Severity.CRITICAL`);
  ok(isCriticalShakaError({ severity: 1 }) === false, "severity 1 (RECOVERABLE) → không phải lỗi nặng");
  ok(isCriticalShakaError({ severity: 2 }) === true, "severity 2 (CRITICAL) → lỗi nặng");
  ok(isCriticalShakaError(undefined) === true, "không đọc được detail → coi là nặng (không bỏ sót kênh chết)");

  console.log("\n== [B] Nhận diện kênh .mpd ==");
  ok(isMpdUrl("https://dash.host/abc/manifest.mpd?token=Ken1402@") === true, "URL .mpd kèm ?token= vẫn nhận ra");
  ok(isMpdUrl("https://cdn.host/live/index.m3u8") === false, "URL .m3u8 không bị nhận nhầm");
  ok(isDashChannel({ channel_id: "MPD1" }, "https://dash.host/abc/manifest.mpd?token=K") === true,
    "isDashChannel: URL phát lộ đuôi .mpd");
  ok(isDashChannel({ channel_id: "HLS1", stream_url: "https://cdn.host/a/index.m3u8" }, "https://cdn.host/a/index.m3u8") === false,
    "isDashChannel: kênh .m3u8 → false");
  ok(isDashChannel({ channel_id: "IMP1", stream_url: "https://dash.host/x/manifest.mpd" }, "https://dash.host/x/manifest.mpd") === true,
    "isDashChannel: kênh user tự import (.mpd) → true");

  // URL proxy opaque: client không thấy đuôi .mpd -> phải nhờ cờ `mpd` của server
  const nowS = Math.floor(Date.now() / 1000);
  tokenResponses.set("MPD2", { success: true, proxy_url: "/api/stream/proxy?t=opaque123", mpd: true, exp: nowS + 300, rotate_at: nowS + 240, mode: "proxy" });
  tokenResponses.set("HLS2", { success: true, proxy_url: "/api/stream/proxy?t=opaque456", mpd: false, exp: nowS + 300, rotate_at: nowS + 240, mode: "proxy" });
  const proxyMpd = await requestStreamAccess({ channel_id: "MPD2", name: "Kênh DASH", protected: true });
  const proxyHls = await requestStreamAccess({ channel_id: "HLS2", name: "Kênh HLS", protected: true });
  ok(/\/api\/stream\/proxy\?t=opaque123$/.test(proxyMpd), "requestStreamAccess trả URL proxy (link gốc bị giấu)");
  ok(isDashChannel({ channel_id: "MPD2" }, proxyMpd) === true, "isDashChannel nhận ra DASH dù đang cầm URL proxy (nhờ cờ mpd của server)");
  ok(isDashChannel({ channel_id: "HLS2" }, proxyHls) === false, "kênh HLS qua proxy vẫn là false");

  console.log("\n== [A] VideoPlayer thật + shaka bắn lỗi ==");
  const wrap = (children) =>
    React.createElement(ProfileProvider, null,
      React.createElement(SettingsProvider, null,
        React.createElement(I18nProvider, null,
          React.createElement(ToastProvider, null, children))));

  async function mountPlayer(channel, streamUrl) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(wrap(React.createElement(VideoPlayer, { channel, streamUrl })));
    });
    const player = shakaState.players[shakaState.players.length - 1];
    return { host, root, player, text: () => host.textContent || "" };
  }

  // --- kênh .mpd ---------------------------------------------------------
  telemetryCalls.length = 0;
  const mpd = await mountPlayer(
    { channel_id: "MPD_PLAY", name: "Kênh DASH .mpd" },
    "https://dash.host/dashdrm/abc/manifest.mpd?token=Ken1402@"
  );
  ok(mpd.player && shakaState.loaded.includes("https://dash.host/dashdrm/abc/manifest.mpd?token=Ken1402@"),
    "kênh .mpd được nạp bằng shaka (đúng URL, giữ nguyên ?token=)");

  await act(async () => { mpd.player.emit("error", { severity: 1, code: 6001, message: "MPD_RECOVERABLE_noise" }); });
  ok(telemetryCalls.length === 0, "kênh .mpd + lỗi RECOVERABLE → KHÔNG gửi báo cáo shaka nào",
    `thực tế: ${telemetryCalls.length}`);
  ok(!mpd.text().includes("MPD_RECOVERABLE_noise"), "kênh .mpd + lỗi RECOVERABLE → không phủ màn hình lỗi lên người xem");

  await act(async () => { mpd.player.emit("error", { severity: 2, code: 4000, message: "MPD_CRITICAL_dead" }); });
  ok(telemetryCalls.length === 0, "kênh .mpd + lỗi CRITICAL → VẪN không gửi báo cáo shaka",
    `thực tế: ${telemetryCalls.length}`);
  ok(mpd.text().includes("MPD_CRITICAL_dead"), "kênh .mpd + lỗi CRITICAL → vẫn hiện màn lỗi (kênh chết thật thì người xem phải biết)");
  await act(async () => { mpd.root.unmount(); });

  // --- kênh .m3u8 (hành vi cũ phải giữ nguyên) --------------------------
  telemetryCalls.length = 0;
  const hls = await mountPlayer(
    { channel_id: "HLS_PLAY", name: "Kênh HLS" },
    "https://cdn.example.com/live/vtv1/index.m3u8"
  );
  await act(async () => { hls.player.emit("error", { severity: 1, code: 6001, message: "HLS_recoverable" }); });
  ok(telemetryCalls.length === 1, "kênh .m3u8 → vẫn báo cáo lỗi shaka như cũ", `thực tế: ${telemetryCalls.length}`);
  ok(telemetryCalls[0] && telemetryCalls[0].engine === "shaka" && telemetryCalls[0].code === "shaka_6001"
    && telemetryCalls[0].channel_id === "HLS_PLAY",
    "báo cáo đúng engine/code/kênh để lọc trong Admin");
  ok(telemetryCalls[0] && telemetryCalls[0].fatal === false, "lỗi RECOVERABLE báo fatal=false (trước đây luôn báo fatal=true → báo động giả)");
  ok(hls.text().includes("HLS_recoverable"), "kênh .m3u8 + lỗi RECOVERABLE → vẫn hiện màn lỗi như trước");

  await act(async () => { hls.player.emit("error", { severity: 2, code: 4000, message: "HLS_critical" }); });
  ok(telemetryCalls.length === 2 && telemetryCalls[1].fatal === true, "kênh .m3u8 + lỗi CRITICAL → báo cáo fatal=true");
  await act(async () => { hls.root.unmount(); });
} finally {
  fs.rmSync(ENTRY, { force: true });
  fs.rmSync(BUNDLE, { force: true });
  fs.rmSync(SHAKA_STUB, { force: true });
  fs.rmSync(HLS_STUB, { force: true });
}

// ---------------------------------------------------------------------------
// [C] Worker: POST /api/telemetry/player với D1 giả
// ---------------------------------------------------------------------------
console.log("\n== [C] Worker lọc lỗi shaka của kênh .mpd (chặn cả APK cũ) ==");
const dbLog = [];
let channelRow = { stream_url: "https://dash.host/dashdrm/abc/manifest.mpd" };
function stmt(sql) {
  const s = {
    bind(...a) { s._args = a; return s; },
    async run() { dbLog.push({ sql, args: s._args || [] }); return { success: true }; },
    async all() { dbLog.push({ sql, args: s._args || [] }); return { results: [] }; },
    async first() {
      dbLog.push({ sql, args: s._args || [] });
      return /FROM channels WHERE channel_id = \?/i.test(sql) ? channelRow : null;
    },
  };
  return s;
}
const env = {
  DB: { prepare: (sql) => stmt(sql), batch: async (list) => { for (const p of list) await p.run(); return []; } },
  JWT_SECRET: "test-jwt-secret",
  STREAM_TOKEN_SECRET: "test-stream-secret",
};
const worker = (await import("../worker/worker.js")).default;
const postTelemetry = async (body) => {
  const res = await worker.fetch(new Request("http://localhost/api/telemetry/player", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "1.2.3.4" },
    body: JSON.stringify(body),
  }), env, { waitUntil() {} });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const inserts = () => dbLog.filter((c) => /INSERT INTO player_errors/i.test(c.sql));

dbLog.length = 0;
const rMpd = await postTelemetry({ channel_id: "MPD_PLAY", channel_name: "Kênh DASH", engine: "shaka", code: "shaka_6001", detail: "noise", fatal: true });
ok(rMpd.body.skipped === "mpd", "lỗi shaka của kênh .mpd → server trả skipped:'mpd'", JSON.stringify(rMpd.body));
ok(inserts().length === 0, "lỗi shaka của kênh .mpd → KHÔNG ghi vào player_errors", `thực tế: ${inserts().length} INSERT`);
ok(dbLog.some((c) => /SELECT stream_url FROM channels WHERE channel_id = \?/i.test(c.sql)),
  "server tra stream_url của kênh để biết có phải .mpd không");

dbLog.length = 0;
channelRow = { stream_url: "https://cdn.example.com/live/vtv1/index.m3u8" }; // kênh HLS
const rHls = await postTelemetry({ channel_id: "HLS_PLAY", channel_name: "Kênh HLS", engine: "shaka", code: "shaka_6001", detail: "that su loi", fatal: true });
ok(inserts().length === 1, "lỗi shaka của kênh .m3u8 → vẫn ghi bình thường", `thực tế: ${inserts().length} INSERT`);
ok(inserts()[0] && inserts()[0].args[0] === "HLS_PLAY", "ghi đúng channel_id");

dbLog.length = 0;
channelRow = { stream_url: "https://dash.host/dashdrm/abc/manifest.mpd" }; // kênh DASH
await postTelemetry({ channel_id: "MPD_PLAY", channel_name: "Kênh DASH", engine: "hls", code: "manifestParseError", detail: "x", fatal: true });
ok(inserts().length === 1, "lỗi engine=hls của kênh .mpd vẫn ghi (chỉ bỏ qua engine=shaka)", `thực tế: ${inserts().length} INSERT`);

console.log(`\nKẾT QUẢ: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
