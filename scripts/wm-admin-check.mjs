/**
 * Kiểm thử tab Admin → “Logo khi phát” bằng jsdom (không cần trình duyệt).
 * Dev-only, KHÔNG nằm trong pipeline build/deploy.
 *
 *   npm i --no-save jsdom react-test-renderer@18.3.1
 *   node scripts/wm-admin-check.mjs
 *
 * Script tự sinh entry tạm, bundle bằng esbuild (external react để dùng
 * chung bản với react-test-renderer), chạy 16 assertion rồi dọn file.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY = path.join(ROOT, ".wm-admin-entry.tmp.jsx");
const BUNDLE = path.join(ROOT, ".wm-admin-bundle.tmp.cjs");

/* ---------- DOM tối thiểu ---------- */
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", { url: "http://localhost/" });
const W = dom.window;
Object.defineProperty(globalThis, "window", { value: W, configurable: true });
globalThis.document = W.document;
try { Object.defineProperty(globalThis, "navigator", { value: W.navigator, configurable: true }); } catch {}
globalThis.HTMLElement = W.HTMLElement;
globalThis.Element = W.Element;
globalThis.Node = W.Node;
globalThis.getComputedStyle = W.getComputedStyle;
globalThis.localStorage = W.localStorage;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

/* ---------- API giả ---------- */
const ADMIN = {
  success: true,
  config: {
    enabled: 1, pos: "tr", size: 9, opacity: 82, margin: 3, style: "shadow", tint: "none",
    text: "", text_pos: "none", fit: "video",
    pages: { tv: 1, player: 1, mini: 0, movie: 0 },
    only_live: 0, hide_buffering: 1, logo_url: "/watermark.svg", version: 42,
  },
  logo: { has_custom: false, bytes: 0 },
  channels: [{ channel_id: "VTV1.vn", name: "VTV1 HD", group_title: "VTV", wm: JSON.stringify({ pos: "tc", size: 14 }), updated_at: 1 }],
  groups: ["VTV", "HTV"],
  total_channels: 155,
};
const CHANNELS = {
  success: true,
  channels: [
    { channel_id: "VTV1.vn", name: "VTV1 HD", group_title: "VTV", logo: "" },
    { channel_id: "HTV7.vn", name: "HTV7 HD", group_title: "HTV", logo: "" },
  ],
};
const posts = [];
const fetchStub = async (url, opts = {}) => {
  const u = String(url);
  if (opts && opts.body) posts.push({ url: u, body: opts.body });
  const data = u.includes("/admin/watermark") ? ADMIN : u.includes("/api/channels") ? CHANNELS : u.includes("/api/watermark") ? { success: true, config: ADMIN.config } : {};
  return { ok: true, status: 200, json: async () => data, text: async () => "" };
};
// Node định nghĩa globalThis.fetch bằng getter -> phải defineProperty mới ghi đè được
Object.defineProperty(globalThis, "fetch", { value: fetchStub, configurable: true, writable: true });

/* ---------- build ---------- */
fs.writeFileSync(ENTRY, "export { default } from './src/components/WatermarkAdminTab';\n");
try {
  execFileSync("npx", ["esbuild", ENTRY, "--bundle", "--format=cjs", "--platform=node", `--outfile=${BUNDLE}`, "--jsx=automatic", "--external:react", "--define:import.meta.env={}"], { cwd: ROOT, stdio: "pipe" });
} catch (e) {
  console.error("esbuild fail:", String(e.stdout || e.message));
  process.exit(1);
}

let pass = 0;
let fail = 0;
const ok = (c, m) => { if (c) { console.log("  \u2705", m); pass++; } else { console.log("  \u274c", m); fail++; } };

try {
  const React = (await import("react")).default;
  const RT = await import("react-test-renderer");
  const m = RT.default || RT;
  const RTT = m.create ? m : (m.default || m);
  const act = RTT.act;
  const t = await import(pathToFileURL(BUNDLE).href);
  const Tab = (t.default && t.default.default) || t.default || t;

  const tree = (() => { let x; act(() => { x = RTT.create(React.createElement(Tab, { BASE: "", headers: {}, addToast: () => {} })); }); return x; })();
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });

  const all = () => JSON.stringify(tree.toJSON());
  const findByText = (needle) => {
    const out = [];
    const walk = (n) => {
      if (!n) return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (typeof n === "string") return;
      const txt = typeof n.children === "string" ? n.children : Array.isArray(n.children) ? n.children.filter((c) => typeof c === "string").join(" ") : "";
      if (txt.includes(needle)) out.push(n);
      if (n.children) walk(n.children);
    };
    walk(tree.toJSON());
    return out;
  };
  const findByProp = (key, val) => {
    const out = [];
    const walk = (n) => {
      if (!n) return;
      if (Array.isArray(n)) return n.forEach(walk);
      if (typeof n === "string") return;
      if (n.props && n.props[key] === val) out.push(n);
      if (n.children) walk(n.children);
    };
    walk(tree.toJSON());
    return out;
  };

  console.log("== tab Admin → Logo khi phát ==");
  ok(all().includes("Logo") , "tab render (không crash trong jsdom)");
  ok(all().includes("16:9") || all().includes("16") , "có khung kéo 16:9");
  ok(all().includes("Cấu hình chung"), "studio cấu hình chung");
  ok(all().includes("VTV1 HD") && all().includes("HTV7 HD"), "danh sách kênh để tuỳ chỉnh");
  ok(all().includes("Tuỳ chỉnh"), "badge kênh đang có tuỳ chỉnh (VTV1.vn)");
  ok(all().includes("42"), "hiển thị phiên bản cấu hình");
  ok(all().includes("Đã lưu") && !all().includes("Lưu cấu hình chung"), "chưa sửa gì → nút Lưu ở trạng thái ‘Đã lưu’");

  const pad = findByProp("title", "Trên · giữa");
  ok(pad.length > 0, "bàn phím 9 vị trí có ô ‘Trên · giữa’");
  if (pad.length) {
    await act(async () => { pad[0].props.onClick && pad[0].props.onClick(); });
    ok(all().includes("Lưu cấu hình chung"), "sửa xong → dirty → hiện nút Lưu");
    const save = findByText("Lưu cấu hình chung")[0];
    await act(async () => { save && save.props.onClick && save.props.onClick(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const p = posts.find((x) => x.url.includes("/admin/watermark") && !x.url.includes("/channel") && !x.url.includes("/logo"));
    ok(!!p, "bấm Lưu gọi POST /admin/watermark");
    if (p) {
      const body = JSON.parse(p.body);
      ok(body.pos === "tc", "payload mang vị trí vừa bấm (tc)");
      ok(body.size === 9 && body.pages.tv === 1, "payload giữ nguyên các field khác");
      ok(!("version" in body) && !("updated_at" in body), "payload không gửi field chỉ-đọc");
    }
  }

  const ptext = (n, d = 0) => {
    if (n == null || d > 30) return "";
    let o = "";
    let ch;
    try { ch = n.props ? n.props.children : n.children; } catch { return ""; }
    const arr = Array.isArray(ch) ? ch : ch == null ? [] : [ch];
    for (const c of arr) {
      if (typeof c === "string" || typeof c === "number") o += " " + c;
      else if (c && typeof c === "object") o += " " + ptext(c, d + 1);
    }
    return o;
  };
  const hasText = (inst, needle) => { try { return ptext(inst).includes(needle); } catch { return false; } };
  const edit = findByText("Bật riêng")[0] || findByText("Sửa")[0];

  if (edit) {
    await act(async () => { edit.props.onClick(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    ok(all().includes("Lưu cho kênh này") || all().includes("kênh này"), "mở được khung kéo cho từng kênh");
    ok(all().includes("Áp cho cả nhóm"), "có nút áp hàng loạt cho nhóm");
    ok(all().includes("Theo cấu hình chung"), "có 3 chế độ: theo chung / bật riêng / tắt riêng");

    // sửa vị trí trong khung kéo CỦA KÊN -> lưu -> payload chỉ mang field đã đụng tới
    const pads = findByProp("title", "Dưới · trái");
    if (pads.length) {
      await act(async () => { pads[pads.length - 1].props.onClick(); });
      const saveCh = findByText("Lưu cho kênh này")[0];
      await act(async () => { saveCh && saveCh.props.onClick(); });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      const pc = posts.filter((x) => x.url.includes("/admin/watermark/channel")).pop();
      ok(!!pc, "bấm Lưu kênh gọi POST /admin/watermark/channel");
      if (pc) {
        const b = JSON.parse(pc.body);
        const wm = b.wm || {};
        ok(b.channel_id === "VTV1.vn" && wm.pos === "bl", "payload gửi {channel_id, wm:{pos:bl,...}}");
        ok(!("opacity" in wm) && !("style" in wm) && !("pages" in wm), "chỉ gửi field đã sửa (không ghi đè cái chưa đụng)");
      }
    } else {
      ok(false, "không tìm thấy ô 'Dưới · trái' trong khung kéo của kênh");
    }
  } else {
    ok(false, "không tìm thấy nút sửa của kênh");
  }
} finally {
  fs.rmSync(ENTRY, { force: true });
  fs.rmSync(BUNDLE, { force: true });
}

console.log(`\nKẾT QUẢ: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
