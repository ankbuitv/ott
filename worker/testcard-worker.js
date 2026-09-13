/**
 * CHRTV TEST CARD CHANNEL — kênh test card tự sinh, phát liên tục 24/7.
 *
 * 3 đường xem:
 *   /test.m3u8        HLS mở (VLC, hls.js, Safari...)            -> hls/test-sll.m3u8
 *   /live.m3u8        HLS biến thể PROGRAM-DATE-TIME 1970        -> hls/test-slr.m3u8
 *   /test-clear.mpd   DASH MỞ (không mã hoá)                     -> dash/test.mpd
 *   /test.mpd         DASH MÃ HOÁ CENC + ClearKey (KHÔNG key KHÔNG xem) -> keyk/stream.mpd
 *   /license          license server ClearKey chuẩn EME (POST {"kids":[...]})
 *                     + GET ?kid=<hex> để xem key (kênh test — key công khai theo thiết kế)
 *
 * KEY CUSTOM: đặt biến CLEARKEY = "KID:KEY" (32 hex : 32 hex) trong
 * wrangler.testcard-channel.toml (hoặc `npx wrangler secret put CLEARKEY` nếu muốn giấu).
 * LƯU Ý: đổi key xong PHẢI chạy lại `worker/testcard-tools/encode-key.mjs`
 * với cùng --kid/--key để mã hoá lại segment, nếu không key mới sẽ không khớp media.
 *
 * KODI (inputstream.adaptive):
 *   #KODIPROP:inputstream.adaptive.manifest_type=mpd
 *   #KODIPROP:inputstream.adaptive.license_type=clearkey
 *   #KODIPROP:inputstream.adaptive.license_key=<KID>:<KEY>
 *   https://<worker>/test.mpd
 *
 * DEPLOY: npx wrangler deploy -c wrangler.testcard-channel.toml
 */

const MANIFEST_CACHE = "public, max-age=300";
const HTML_CACHE = "public, max-age=60";

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
    "access-control-allow-headers": "content-type, *",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2) + "\n", {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors() },
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Đọc biến CLEARKEY = "KID:KEY" (hex 32:hex 32). Sai định dạng -> null.
function parseClearKey(raw) {
  const m = /^([0-9a-fA-F]{32}):([0-9a-fA-F]{32})$/.exec(String(raw || "").trim());
  if (!m) return null;
  return { kid: m[1].toLowerCase(), key: m[2].toLowerCase() };
}

function hexToB64url(hex) {
  let bin = "";
  for (let i = 0; i < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

// base64url -> hex (để so KID an toàn, không đụng chữ hoa/thường)
function b64urlToHex(s) {
  try {
    let b64 = String(s).replaceAll("-", "+").replaceAll("_", "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    let hex = "";
    for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
    return hex;
  } catch {
    return "";
  }
}

async function serveAsset(env, request, internalPath, contentType, cache = MANIFEST_CACHE, transform = null) {
  const url = new URL(request.url);
  const resp = await env.ASSETS.fetch(new URL(internalPath, url.origin), { redirect: "manual" });
  if (!resp.ok) {
    return new Response("Asset khong tim thay: " + internalPath + "\n", { status: 500, headers: cors() });
  }
  let body = request.method === "HEAD" ? null : resp.body;
  const headers = { "content-type": contentType, "cache-control": cache, ...cors() };
  if (transform) {
    const text = await resp.text();
    const out = transform(text, url);
    headers["content-length"] = undefined;
    body = request.method === "HEAD" ? null : out;
  }
  return new Response(body, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// License server ClearKey (chuẩn EME: POST {"kids":["<b64url>"]})
// ---------------------------------------------------------------------------
async function handleLicense(request, env, url) {
  const ck = parseClearKey(env?.CLEARKEY);
  if (!ck) {
    return json({ error: "Chưa cấu hình CLEARKEY (định dạng KID:KEY 32hex:32hex) trong wrangler.testcard-channel.toml" }, 500);
  }
  const kidB64 = hexToB64url(ck.kid);
  const keyB64 = hexToB64url(ck.key);

  // GET: tra cứu thông tin key (kênh test — key công khai theo thiết kế)
  if (request.method === "GET") {
    const qKid = (url.searchParams.get("kid") || url.pathname.split("/license/")[1] || "").toLowerCase().trim();
    if (qKid && qKid !== ck.kid) {
      return json({ error: "KID không tồn tại", expectedKid: ck.kid }, 404);
    }
    return json({
      kid: ck.kid,
      key: ck.key,
      kidB64,
      keyB64,
      mpd: url.origin + "/test.mpd",
      kodi: [
        "#KODIPROP:inputstream.adaptive.manifest_type=mpd",
        "#KODIPROP:inputstream.adaptive.license_type=clearkey",
        "#KODIPROP:inputstream.adaptive.license_key=" + ck.kid + ":" + ck.key,
        url.origin + "/test.mpd",
      ].join("\n"),
      note: "Kênh TEST — ClearKey công khai theo thiết kế. Đổi key: biến CLEARKEY + encode-key.mjs",
    });
  }

  // POST: giao thức EME ClearKey
  let body = "";
  try { body = await request.text(); } catch { /* rỗng */ }
  let kids = [];
  try {
    const parsed = JSON.parse(body || "{}");
    kids = Array.isArray(parsed.kids) ? parsed.kids : [];
  } catch {
    return json({ keys: [], type: "temporary" }, 400);
  }
  if (!kids.length) {
    return json({ keys: [], type: "temporary" }, 400);
  }
  const keys = [];
  for (const kid of kids) {
    // So KID dưới dạng hex — tránh lỗi hoa/thường của base64url
    if (b64urlToHex(kid) === ck.kid) {
      keys.push({ kty: "oct", kid, k: keyB64 });
    }
  }
  // Trả đúng giao thức: key chỉ cấp khi KID khớp kênh
  return json({ keys, type: "temporary" });
}

// ---------------------------------------------------------------------------
// Trang web xem thử
// ---------------------------------------------------------------------------
function watchPage({ brand }) {
  return new Response(
    `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(brand)} · KÊNH TEST CARD 24/7</title>
<style>
  :root { --bg:#0b0e14; --card:#121722; --line:#232b3d; --ink:#e8edf7; --dim:#8b96ad; --ok:#3ddc84; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.6 ui-monospace,Menlo,Consolas,monospace; }
  .bars { height:10px; background:linear-gradient(to right,#c0c0c0 0 14.28%,#c0c000 14.28% 28.57%,#00c0c0 28.57% 42.85%,#00c000 42.85% 57.14%,#c000c0 57.14% 71.42%,#c00000 71.42% 85.71%,#0000c0 85.71% 100%); }
  main { max-width:920px; margin:0 auto; padding:20px 14px 60px; }
  h1 { font-size:20px; letter-spacing:3px; margin:0 0 4px; }
  p.dim { color:var(--dim); font-size:12px; margin:0 0 16px; }
  .tv { border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#000; }
  video { display:block; width:100%; aspect-ratio:16/9; background:#000; }
  .row { display:flex; gap:8px; flex-wrap:wrap; margin:14px 0; }
  button { background:#1a2336; color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:9px 14px; font:inherit; cursor:pointer; }
  button:hover { background:#23304c; }
  button.on { background:#274bcc; border-color:#274bcc; color:#fff; }
  code { background:#0d1220; border:1px solid var(--line); border-radius:4px; padding:1px 6px; }
  pre { background:#0d1220; border:1px solid var(--line); border-radius:8px; padding:10px 12px; font-size:12px; overflow:auto; white-space:pre-wrap; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:10px; margin-top:14px; }
  .panel { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px 12px; font-size:12px; color:var(--dim); }
  .panel b { color:var(--ink); }
  .lock { color:var(--ok); }
</style>
</head>
<body>
<div class="bars"></div>
<main>
  <h1>${escapeHtml(brand)} · KÊNH TEST CARD</h1>
  <p class="dim">Phát 24/7 — SMPTE + đồng hồ PHÚT:GIÁY + tone 1kHz. Có 3 kênh: HLS mở · DASH mở · <span class="lock">DASH mã hoá ClearKey (cần license key)</span></p>

  <div class="tv"><video id="video" playsinline controls muted></video></div>

  <div class="row">
    <button id="btnHls" class="on">▶ HLS mở (/test.m3u8)</button>
    <button id="btnDashOpen">▶ DASH mở (/test-clear.mpd)</button>
    <button id="btnDashKey" class="lock">🔒 DASH ClearKey (/test.mpd)</button>
    <button id="btnMute">🔇 BẬT TIẾNG</button>
    <button id="btnClock">🕐 ĐỐI CHIỀNG ĐỒNG HỒ</button>
  </div>

  <div class="grid">
    <div class="panel"><b>🔒 Xem DASH mã hoá bằng VLC/Kodi</b><br>Dán link <code>/test.mpd</code> kèm key (xem khối Kodi bên dưới).<br>VLC: không hỗ trợ ClearKey — dùng <b>mpv + Kodi inputstream</b> hoặc Kodi.</div>
    <div class="panel"><b>Snippet Kodi (copy nguyên khối vào .m3u/.strm)</b><pre id="kodi">Đang tải key...</pre><button id="btnCopyKodi">📋 COPY SNIPPET KODI</button></div>
    <div class="panel"><b>License server</b><br>Endpoint: <code id="licUrl"></code><br>Chuẩn EME ClearKey: POST <code>{"kids":["..."]}</code> → trả <code>{"keys":[...]}</code>. Tra cứu: <code>GET /license</code>.</div>
  </div>
</main>
<script>
(function(){
  "use strict";
  var video = document.getElementById("video");
  var hls = null, dash = null, KODI = "";
  var origin = location.origin;

  function clearPlayers(){
    if (hls) { try { hls.destroy(); } catch(e){} hls = null; }
    if (dash) { try { dash.reset(); } catch(e){} dash = null; }
    video.removeAttribute("src"); try { video.load(); } catch(e){}
  }
  function setBtn(id){ ["btnHls","btnDashOpen","btnDashKey"].forEach(function(b){ document.getElementById(b).className = (b===id) ? "on" : ""; }); }
  function playHls(){
    setBtn("btnHls"); clearPlayers();
    var u = origin + "/test.m3u8";
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker:true, backBufferLength:30 });
      hls.loadSource(u); hls.attachMedia(video);
    } else { video.src = u; }
    video.play().catch(function(){});
  }
  function playDashOpen(){
    setBtn("btnDashOpen"); clearPlayers();
    var u = origin + "/test-clear.mpd";
    if (window.dashjs) { dash = dashjs.MediaPlayer().create(); dash.initialize(video, u, true); }
    else { video.src = u; }
    video.play().catch(function(){});
  }
  function playDashKey(){
    setBtn("btnDashKey"); clearPlayers();
    if (!window.dashjs) { setTimeout(playDashKey, 300); return; }
    var u = origin + "/test.mpd";
    dash = dashjs.MediaPlayer().create();
    dash.updateSettings({
      streaming: {
        protection: { keepProtectionMediaKeys: true },
      }
    });
    try {
      dash.setProtectionData({ "com.w3.clearkey": { serverURL: origin + "/license" } });
    } catch(e) {}
    dash.initialize(video, u, true);
    video.play().catch(function(){});
  }
  function loadLib(src, cb){ var s=document.createElement("script"); s.src=src; s.onload=cb; s.onerror=cb; document.head.appendChild(s); }

  loadLib("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js", playHls);
  setTimeout(function(){ loadLib("https://cdn.jsdelivr.net/npm/dashjs@4/dist/dash.all.min.js", function(){}); }, 0);

  document.getElementById("btnHls").onclick = playHls;
  document.getElementById("btnDashOpen").onclick = playDashOpen;
  document.getElementById("btnDashKey").onclick = playDashKey;
  document.getElementById("btnMute").onclick = function(){
    video.muted = !video.muted;
    this.textContent = video.muted ? "🔇 BẬT TIẾNG" : "🔊 TẮT TIẾNG";
  };
  document.getElementById("btnClock").onclick = function(){
    var now = new Date();
    var mmss = String(now.getMinutes()).padStart(2,"0") + ":" + String(now.getSeconds()).padStart(2,"0");
    alert("Giờ hiện tại (MM:SS): " + mmss + "\\n\\nTua về đầu giờ rồi so với đồng hồ trên card — lệch = player trễ.");
  };

  fetch(origin + "/license").then(function(r){ return r.json(); }).then(function(d){
    document.getElementById("licUrl").textContent = origin + "/license";
    KODI = d.kodi || "";
    document.getElementById("kodi").textContent = KODI;
  });
  document.getElementById("btnCopyKodi").onclick = function(){
    if (!KODI) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(KODI).then(function(){
        var b = document.getElementById("btnCopyKodi"); b.textContent = "✓ ĐÃ COPY";
        setTimeout(function(){ b.textContent = "📋 COPY SNIPPET KODI"; }, 1500);
      });
    }
  };
})();
</script>
</body>
</html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": HTML_CACHE, ...cors() } },
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const lower = url.pathname.toLowerCase();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }
    if (request.method !== "GET" && request.method !== "HEAD" && !(request.method === "POST" && lower === "/license")) {
      return new Response("Chi ho tro GET/HEAD (POST chi cho /license)\n", { status: 405, headers: cors() });
    }

    if (lower === "/healthz") {
      return new Response("ok\n", { status: 200, headers: { "content-type": "text/plain; charset=utf-8", ...cors() } });
    }

    // ---- License server ClearKey ----
    if (lower === "/license" || lower.startsWith("/license/")) {
      return handleLicense(request, env, url);
    }

    // ---- HLS mở ----
    if (lower === "/test.m3u8" || lower === "/index.m3u8") {
      return serveAsset(env, request, "/hls/test-sll.m3u8", "application/vnd.apple.mpegurl");
    }
    if (lower === "/live.m3u8" || lower === "/test-slr.m3u8") {
      return serveAsset(env, request, "/hls/test-slr.m3u8", "application/vnd.apple.mpegurl");
    }

    // ---- DASH mã hoá ClearKey (link chính) ----
    if (lower === "/test.mpd") {
      const ck = parseClearKey(env?.CLEARKEY);
      if (!ck) {
        return new Response(
          "Kenh ma hoa chua co key. Dat CLEARKEY=\"KID:KEY\" trong wrangler.testcard-channel.toml,\n" +
          "va chay lai worker/testcard-tools/encode-key.mjs de ma hoa segment.\n",
          { status: 503, headers: { "content-type": "text/plain; charset=utf-8", ...cors() } },
        );
      }
      return serveAsset(env, request, "/keyk/stream.mpd", "application/dash+xml", MANIFEST_CACHE,
        (text, u) => text
          .replaceAll("__LICENSE_URI__", u.origin + "/license")
          // MPD gốc nằm trong thư mục con keyk/ — đưa đường dẫn segment về đúng gốc domain
          .replaceAll("$RepresentationID$/", "keyk/$RepresentationID$/"));
    }

    // ---- DASH mở (không mã hoá) ----
    if (lower === "/test-clear.mpd" || lower === "/manifest.mpd") {
      return serveAsset(env, request, "/dash/test.mpd", "application/dash+xml");
    }

    // ---- Trang xem thử ----
    if (lower === "/" || lower === "/watch" || lower === "/index.html") {
      return watchPage({ brand: env?.BRAND || "CHRTV" });
    }

    // ---- Còn lại: static assets (keyk/*, seg/*, hls/*, dash/*) ----
    const assetResp = await env.ASSETS.fetch(new URL(url.pathname, url.origin), { redirect: "manual" });
    if (assetResp.ok) {
      const headers = new Headers(assetResp.headers);
      for (const [k, v] of Object.entries(cors())) headers.set(k, v);
      return new Response(request.method === "HEAD" ? null : assetResp.body, { status: 200, headers });
    }

    return new Response(
      "Khong tim thay. Kenh: /test.m3u8 (HLS mo) · /test.mpd (DASH ClearKey) · /test-clear.mpd (DASH mo) · /license (key) · / (trang xem thu)\n",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8", ...cors() } },
    );
  },
};
