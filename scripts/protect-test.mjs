/**
 * Test bảo vệ luồng (AES-128 + license server) — chạy offline, không cần mạng.
 *
 *   node scripts/protect-test.mjs
 *
 * Kiểm tra:
 *   1. Tự né FPT Play + host trong danh sách đen
 *   2. Playlist nào mã hoá được (TS) / không được (master, đã mã hoá, fMP4)
 *   3. Token license: hợp lệ / sai chữ ký / hết hạn
 *   4. Hai worker (chính + license) suy ra CÙNG một key
 *   5. Mã hoá → giải mã ra đúng bytes gốc
 *   6. Chèn #EXT-X-KEY đúng vị trí
 *   7. End-to-end: playlist → segment mã hoá → lấy key từ license worker → giải mã
 */

import {
  isFptPlayUrl, protectSkipReason, playlistProtectable, buildLicenseToken,
  verifyLicenseToken, deriveKeyBytes, deriveIvBytes, aes128CbcEncrypt,
  aes128CbcDecrypt, insertExtXKey, keyBucket, toHex,
} from "../worker/stream-protect.js";
import licenseWorker from "../worker/license-worker.js";

const SECRET = "test-secret-123";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? " — " + extra : ""}`); }
};
const section = (t) => console.log(`\n▶ ${t}`);

const TS_PLAYLIST = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:4",
  "#EXT-X-MEDIA-SEQUENCE:100",
  "#EXTINF:4.000,",
  "seg100.ts",
  "#EXTINF:4.000,",
  "seg101.ts",
  "",
].join("\n");

// ---------------------------------------------------------------------------
section("1. Tự né FPT Play / host đen");
ok("fptplay.net bị né", isFptPlayUrl("https://stream.fptplay.net/hls/vtv1/master.m3u8"));
ok("mtv.fptplay.vn bị né", isFptPlayUrl("https://mtv.fptplay.vn/live/vtv1.m3u8"));
ok("fpt.vn bị né", isFptPlayUrl("https://cdn.fpt.vn/live/x.m3u8"));
ok("link thường KHÔNG né", !isFptPlayUrl("https://cdn.example.com/live/vtv1/index.m3u8"));
ok("skipReason trả 'fpt'", protectSkipReason("https://a.fptplay.net/live/x.m3u8") === "fpt");
ok("host trong đen bị né", protectSkipReason("https://cdn.myhost.tv/live/x.m3u8", ["myhost.tv"]) === "host");
ok("link thường = null", protectSkipReason("https://cdn.example.com/live/x.m3u8") === null);

// ---------------------------------------------------------------------------
section("2. Playlist nào mã hoá được");
ok("TS playlist → được", playlistProtectable(TS_PLAYLIST).ok === true);
ok("master playlist → bỏ (master)",
  playlistProtectable("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow.m3u8").reason === "master");
ok("đã có EXT-X-KEY → bỏ (encrypted)",
  playlistProtectable("#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=\"k\"\n#EXTINF:4,\nseg.ts").reason === "encrypted");
ok("fMP4 (EXT-X-MAP) → bỏ (fmp4)",
  playlistProtectable("#EXTM3U\n#EXT-X-MAP:URI=\"init.mp4\"\n#EXTINF:4,\nseg.m4s").reason === "fmp4");
ok("byte-range → bỏ (byterange)",
  playlistProtectable("#EXTM3U\n#EXT-X-BYTERANGE:100@0\n#EXTINF:4,\nseg.ts").reason === "byterange");

// ---------------------------------------------------------------------------
section("3. Token license");
const now = Math.floor(Date.now() / 1000);
const bucket = keyBucket(now, 600);
const tok = await buildLicenseToken({ uid: 42, sid: "abc123", cid: "vtv1", bucket, exp: now + 900 }, SECRET);
ok("token đúng định dạng L1.x.y", /^L1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(tok));
ok("token hợp lệ", (await verifyLicenseToken(tok, SECRET, { now })).ok === true);
const badSig = tok.slice(0, -4) + "AAAA";
ok("sai chữ ký → 'sig'", (await verifyLicenseToken(badSig, SECRET, { now })).reason === "sig");
const expired = await buildLicenseToken({ uid: 42, sid: "abc123", cid: "vtv1", bucket, exp: now - 10 }, SECRET);
ok("hết hạn → 'expired'", (await verifyLicenseToken(expired, SECRET, { now })).reason === "expired");
const otherSecret = await buildLicenseToken({ uid: 42, sid: "abc123", cid: "vtv1", bucket, exp: now + 900 }, "khac-secret");
ok("khác secret → không qua", (await verifyLicenseToken(otherSecret, SECRET, { now })).ok === false);

// ---------------------------------------------------------------------------
section("4. Hai worker suy ra CÙNG key");
const keyMain = await deriveKeyBytes(tok, SECRET);
const keyLic = await deriveKeyBytes(tok, SECRET);
const ivMain = await deriveIvBytes(tok, SECRET);
ok("key dài 16 byte", keyMain.byteLength === 16);
ok("key giống hệt nhau", toHex(keyMain) === toHex(keyLic));
ok("IV dài 16 byte", ivMain.byteLength === 16);
ok("key ≠ IV", toHex(keyMain) !== toHex(ivMain));
const tok2 = await buildLicenseToken({ uid: 7, sid: "abc123", cid: "vtv1", bucket, exp: now + 900 }, SECRET);
ok("đổi user → đổi key", toHex(await deriveKeyBytes(tok2, SECRET)) !== toHex(keyMain));

// ---------------------------------------------------------------------------
section("5. Mã hoá / giải mã AES-128-CBC");
const original = new Uint8Array(1000);
for (let i = 0; i < original.length; i++) original[i] = i % 256;
const enc = await aes128CbcEncrypt(original, keyMain, ivMain);
ok("mã hoá phình lên bội số 16", enc.byteLength % 16 === 0 && enc.byteLength >= original.byteLength);
ok("mã hoá KHÁC bản gốc", toHex(enc.slice(0, 16)) !== toHex(original.slice(0, 16)));
const dec = await aes128CbcDecrypt(enc, keyMain, ivMain);
ok("giải mã ra đúng gốc", toHex(dec) === toHex(original));

// ---------------------------------------------------------------------------
section("6. Chèn #EXT-X-KEY");
const withKey = insertExtXKey(TS_PLAYLIST, "https://license.ankb.qzz.io/k/" + tok, toHex(ivMain));
const lines = withKey.split("\n");
const keyLine = lines.find((l) => l.startsWith("#EXT-X-KEY"));
ok("có dòng EXT-X-KEY", !!keyLine);
ok("METHOD=AES-128", /METHOD=AES-128/.test(keyLine || ""));
ok("URI trỏ license", (keyLine || "").includes("https://license.ankb.qzz.io/k/"));
ok("IV dạng 0x + 32 hex", /IV=0x[0-9a-f]{32}/.test(keyLine || ""));
const firstSeg = lines.findIndex((l) => l.trim() === "seg100.ts");
ok("KEY nằm TRƯỚC segment đầu", lines.indexOf(keyLine) < firstSeg);

// ---------------------------------------------------------------------------
section("7. End-to-end qua license worker");
const licenseEnv = { LICENSE_SECRET: SECRET, ADMIN_SECRET: "adm" };
const keyRes = await licenseWorker.fetch(
  new Request("https://license.ankb.qzz.io/k/" + tok, { headers: { Origin: "https://play.ankb.qzz.io" } }),
  licenseEnv
);
ok("license trả 200", keyRes.status === 200);
ok("content-type octet-stream", keyRes.headers.get("Content-Type") === "application/octet-stream");
ok("đúng 16 byte", (await keyRes.arrayBuffer()).byteLength === 16);
ok("có CORS cho app", keyRes.headers.get("Access-Control-Allow-Origin") === "*");
const keyFromServer = new Uint8Array(await (await licenseWorker.fetch(
  new Request("https://license.ankb.qzz.io/k/" + tok), licenseEnv)).arrayBuffer());
ok("key từ server = key worker chính", toHex(keyFromServer) === toHex(keyMain));
const dec2 = await aes128CbcDecrypt(enc, keyFromServer, ivMain);
ok("giải mã bằng key server → đúng gốc", toHex(dec2) === toHex(original));

const badRes = await licenseWorker.fetch(
  new Request("https://license.ankb.qzz.io/k/L1.eyJ2IjoxfQ.badsig"), licenseEnv);
ok("token giả → 403", badRes.status === 403);

const health = await (await licenseWorker.fetch(new Request("https://license.ankb.qzz.io/health"), licenseEnv)).json();
ok("/health báo có secret", health.has_secret === true && health.has_kv === false);

// ---------------------------------------------------------------------------
console.log(`\n${fail === 0 ? "🎉" : "⚠️"}  ${pass} pass / ${fail} fail\n`);
process.exit(fail === 0 ? 0 : 1);
