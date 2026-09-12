/**
 * Test end-to-end bảo vệ luồng: chạy worker local (STREAM_MODE=proxy) + 1 nguồn
 * HLS local, kiểm tra thật: playlist có EXT-X-KEY, segment đã bị mã hoá, lấy key
 * từ license endpoint rồi giải mã ra ĐÚNG bytes gốc.
 *
 *   node scripts/protect-e2e.mjs
 */
import { aes128CbcDecrypt, toHex } from "../worker/stream-protect.js";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:8787";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const H = { "User-Agent": UA };

let pass = 0, fail = 0;
const ok = (n, c, x = "") => { if (c) { pass++; console.log(`  ✅ ${n}`); } else { fail++; console.log(`  ❌ ${n}${x ? " — " + x : ""}`); } };

const guest = await (await fetch(`${BASE}/auth/guest`, { headers: H })).json();
const auth = { ...H, Authorization: `Bearer ${guest.token}` };

async function openPlaylist(channel) {
  const t = await (await fetch(`${BASE}/api/stream/token?channel=${channel}`, { headers: auth })).json();
  if (!t.proxy_url) return { err: t };
  const r = await fetch(BASE + t.proxy_url, { headers: H });
  return { text: await r.text(), protectHeader: r.headers.get("X-CHRTV-Protect"), status: r.status };
}

// ---- 1. Kênh thường: phải mã hoá ----
console.log("\n▶ Kênh thường (protect=1)");
const a = await openPlaylist("demo-ts");
ok("proxy trả playlist", a.status === 200, JSON.stringify(a.err || ""));
ok("có #EXT-X-KEY", /#EXT-X-KEY:METHOD=AES-128/.test(a.text || ""));
ok("header X-CHRTV-Protect=aes128", a.protectHeader === "aes128", a.protectHeader);
const keyLine = (a.text || "").split("\n").find((l) => l.startsWith("#EXT-X-KEY"));
const keyUri = (keyLine || "").match(/URI="([^"]+)"/)?.[1] || "";
const ivHex = ((keyLine || "").match(/IV=0x([0-9a-fA-F]+)/)?.[1] || "");
ok("URI key trỏ /lic/k/ (cùng origin khi dev)", keyUri.includes("/lic/k/"), keyUri);
ok("IV 32 hex", /^[0-9a-f]{32}$/i.test(ivHex), ivHex);

// segment đầu tiên (đã rewrite thành URL proxy)
const segUrl = (a.text || "").split("\n").map((s) => s.trim()).find((l) => l && !l.startsWith("#") && l.includes("/api/stream/proxy"));
ok("segment đi qua proxy", !!segUrl);

// ---- 2. Lấy key từ license endpoint + giải mã ----
console.log("\n▶ Lấy key từ license + giải mã");
const keyRes = await fetch(BASE + keyUri, { headers: H });
ok("license trả 200", keyRes.status === 200);
const key = new Uint8Array(await keyRes.arrayBuffer());
ok("key đúng 16 byte", key.byteLength === 16);
const iv = new Uint8Array(16);
for (let i = 0; i < 16; i++) iv[i] = parseInt(ivHex.slice(i * 2, i * 2 + 2), 16);

const segRes = await fetch(/^https?:\/\//i.test(segUrl) ? segUrl : BASE + segUrl, { headers: H });
ok("proxy trả segment", segRes.status === 200);
ok("segment content-type video/mp2t", (segRes.headers.get("Content-Type") || "").includes("mp2t"), segRes.headers.get("Content-Type") || "");
const enc = new Uint8Array(await segRes.arrayBuffer());
const original = new Uint8Array(readFileSync("/tmp/hls/serve/seg0.ts"));
ok("segment KHÁC file gốc (đã mã hoá)", toHex(enc) !== toHex(original));
const dec = await aes128CbcDecrypt(enc, key, iv);
ok("giải mã = đúng segment gốc", toHex(dec) === toHex(original), `${dec.byteLength} vs ${original.byteLength}`);
ok("key sai → giải mã lỗi", await aes128CbcDecrypt(enc, new Uint8Array(16), iv).then(() => false).catch(() => true));

// ---- 3. FPT Play: tự né ----
console.log("\n▶ FPT Play (tự né, không mã hoá)");
const b = await openPlaylist("demo-fpt");
ok("playlist vẫn phát được", b.status === 200);
ok("KHÔNG có EXT-X-KEY", !/#EXT-X-KEY/.test(b.text || ""));
ok("header báo lý do né = fpt", b.protectHeader === "fpt", b.protectHeader);

// ---- 4. Kênh tắt bảo vệ ----
console.log("\n▶ Kênh protect=0");
const c = await openPlaylist("demo-off");
ok("playlist vẫn phát được", c.status === 200);
ok("KHÔNG có EXT-X-KEY", !/#EXT-X-KEY/.test(c.text || ""));
ok("header báo channel_off", c.protectHeader === "channel_off", c.protectHeader);

console.log(`\n${fail === 0 ? "🎉" : "⚠️"}  ${pass} pass / ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
