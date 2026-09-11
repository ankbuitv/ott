/**
 * Kiểm tra 2 lớp chống "crash lúc có lúc không" (xem CHONG_CRASH.md):
 *   [A] fetchChannels: timeout + cache danh sách kênh tốt cuối (đỡ trắng app)
 *   [B] clientErrors: lọc nhiễu, tự cắt spam, ghi sessionStorage, gửi về /api/telemetry/player
 *
 * Dev-only, chạy:  node scripts/crash-guard-check.mjs
 * (cần `npm i --no-save jsdom`; script tự sinh entry tạm, bundle bằng esbuild rồi dọn file)
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY = path.join(ROOT, ".crashguard-entry.tmp.mjs");
const BUNDLE = path.join(ROOT, ".crashguard-bundle.tmp.cjs");

const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/" });
Object.defineProperty(globalThis, "window", { value: dom.window, configurable: true });
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
try { Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true }); } catch {}
globalThis.AbortController = dom.window.AbortController || AbortController;

const KEY = "chrtv_channels_v1";
let mode = "ok";
let lastFetchOpts = null;
const playlistCalls = [];
const telemetryCalls = [];
const fetchStub = async (url, opts = {}) => {
  lastFetchOpts = opts;
  const u = String(url);
  if (u.includes("/api/telemetry/player")) { telemetryCalls.push(opts); return { ok: true, status: 200, json: async () => ({ success: true }) }; }
  if (u.includes("/auth/")) return { ok: false, status: 404, json: async () => ({}) };
  if (u.includes("/api/playlist")) {
    playlistCalls.push(opts);
    if (mode === "boom") throw new TypeError("Failed to fetch");
    if (mode === "empty") return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
    if (mode === "500") return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ success: true, data: [{ channel_id: "VTV1.vn", name: "VTV1 HD" }, { channel_id: "HTV7.vn", name: "HTV7 HD" }] }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
Object.defineProperty(globalThis, "fetch", { value: fetchStub, configurable: true, writable: true });

fs.writeFileSync(ENTRY, "export * from './src/services/api.js';\nexport * from './src/services/clientErrors.js';\n");
try {
  execFileSync("npx", ["esbuild", ENTRY, "--bundle", "--format=cjs", "--platform=node", `--outfile=${BUNDLE}`, "--define:import.meta.env={}", "--external:react"], { cwd: ROOT, stdio: "pipe" });
} catch (e) {
  console.error("esbuild fail:", String(e.stdout || e.message));
  process.exit(1);
}

let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { console.log("  \u2705", m); pass++; } else { console.log("  \u274c", m); fail++; } };

try {
  const m = await import(pathToFileURL(BUNDLE).href);
  const api = m.default || m;
  const { fetchChannels, reportClientError, getRecentClientErrors } = api;

  console.log("== [A] fetchChannels: timeout + cache chống trắng app ==");
  localStorage.removeItem(KEY);
  mode = "ok";
  const list = await fetchChannels();
  ok(list.length === 2, "lần gọi thành công trả đủ kênh");
  ok(!!localStorage.getItem(KEY), "đã ghi cache localStorage (" + KEY + ")");
  const cached = JSON.parse(localStorage.getItem(KEY));
  ok(cached.data.length === 2 && typeof cached.t === "number", "cache chứa {t, n, data}");
  ok(lastFetchOpts && lastFetchOpts.signal, "request có AbortSignal (timeout) — không treo vô hạn nữa");

  mode = "boom";
  const afterBoom = await fetchChannels();
  ok(afterBoom.length === 2 && afterBoom[0].channel_id === "VTV1.vn", "mạng lỗi → dùng danh sách cache, KHÔNG rớt về kênh dự phòng");

  mode = "500";
  ok((await fetchChannels()).length === 2, "Worker 500 (đang import / hết quota) → vẫn còn kênh");

  mode = "empty";
  const afterEmpty = await fetchChannels();
  ok(afterEmpty.length === 2, "playlist trả mảng rỗng → cache giữ mạng");
  ok(JSON.parse(localStorage.getItem(KEY)).data.length === 2, "cache không bị response rỗng ghi đè");

  localStorage.setItem(KEY, "{not json");
  mode = "boom";
  const afterGarbage = await fetchChannels();
  ok(Array.isArray(afterGarbage) && afterGarbage.length === 1 && afterGarbage[0].channel_id === "FALLBACK_LIVE", "cache hỏng → fallback 1 kênh dự phòng, app không crash");
  ok(playlistCalls.length === 5, "gọi /api/playlist đúng 5 lần (mỗi scenario 1 lần, không retry dồn)");

  console.log("== [B] clientErrors: báo lỗi về Admin mà không spam ==");
  telemetryCalls.length = 0;
  sessionStorage.clear();

  reportClientError({ code: "render", detail: "Cannot read properties of undefined (reading map)", fatal: 1, channelId: "VTV1.vn", channelName: "VTV1 HD" });
  ok(telemetryCalls.length === 1, "1 lỗi render → đúng 1 bản gửi /api/telemetry/player");
  const body = JSON.parse(telemetryCalls[0].body);
  ok(body.engine === "js" && body.code === "render", "gắn engine:'js' code:'render' để lọc trong Admin");
  ok(body.channel_id === "VTV1.vn" && (body.fatal === true || body.fatal === 1), "kèm kênh + fatal để biết lỗi nào làm hỏng giao diện");
  ok(telemetryCalls[0].keepalive === true, "fetch có keepalive — gửi được cả lúc tab đang đóng vì lỗi");

  for (let i = 0; i < 9; i++) reportClientError({ code: "render", detail: "Cannot read properties of undefined (reading map)", fatal: 1 });
  ok(telemetryCalls.length === 1, "lỗi lặp lại 10 lần chỉ gửi 1 bản (cooldown + cap per-code)");

  const before = telemetryCalls.length;
  reportClientError({ code: "resource", detail: "ResizeObserver loop completed with undelivered notifications" });
  reportClientError({ code: "promise", detail: "The user aborted a request. (AbortError)" });
  reportClientError({ code: "uncaught", detail: "TypeError: Failed to fetch" });
  ok(telemetryCalls.length === before, "nhiễu vô hại (ResizeObserver / abort / mất mạng) bị chặn, không làm bẩn bảng");

  const recent = getRecentClientErrors();
  ok(recent.length === 1 && recent[0].detail.includes("reading map") && recent[0].t > 0, "lỗi được lưu vào sessionStorage → tải lại vẫn đọc được");

  for (let i = 0; i < 30; i++) reportClientError({ code: "code" + i, detail: "boom " + i });
  ok(telemetryCalls.length <= 12, `trần 12 bản/phiên vẫn giữ (thực tế: ${telemetryCalls.length}) — không phá quota người dùng khác`);

  ok(playlistCalls.every((o) => o && o.signal), "mọi request kênh đều có hạn giờ (không bao giờ treo vô hạn)");
} finally {
  fs.rmSync(ENTRY, { force: true });
  fs.rmSync(BUNDLE, { force: true });
}

console.log(`\nKẾT QUẢ: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
