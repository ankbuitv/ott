/**
 * CHRTV TEST CARD CHANNEL — kênh test card tự sinh, phát liên tục 24/7.
 *
 * Video test card (vạch màu SMPTE + đồng hồ PHÚT:GIÁY chạy thật, khớp giờ mỗi
 * giờ quay vòng) được encode sẵn 3600 segment .ts (1 giây/segment) nằm trong
 * static assets -> worker chỉ phục vụ manifest, playback không tốn CPU worker.
 *
 * LINK:
 *   https://<worker>/test.m3u8   -> HLS  (VLC, hls.js, Safari, smart TV...)
 *   https://<worker>/live.m3u8   -> HLS biến thể PROGRAM-DATE-TIME 1970 (tương thích ngược)
 *   https://<worker>/test.mpd    -> DASH (dash.js, VLC...)
 *   https://<worker>/            -> trang web xem thử kênh
 *   https://<worker>/healthz     -> kiểm tra sống
 *   /seg/NNNN.ts                 -> segment (phục vụ trực tiếp bởi static assets)
 *
 * Segment bọc trọn 1 GIỜ: đồng hồ trên card hiển thị MM:SS trong giờ —
 * lúc N giờ hàng ngày card cũng cho đúng MM:SS của giờ đó (quay vòng).
 *
 * DEPLOY:
 *   npx wrangler deploy -c wrangler.testcard-channel.toml
 * (Tái sinh segment khi muốn đổi thương hiệu/giờ: xem worker/testcard-tools/)
 */

const MANIFEST_CACHE = "public, max-age=300"; // manifest tĩnh (vòng lặp 1 giờ)
const HTML_CACHE = "public, max-age=60";

function cors() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, HEAD, OPTIONS",
    "access-control-allow-headers": "*",
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Lấy file từ static assets theo path nội bộ, trả Response với header chuẩn
async function serveAsset(env, request, internalPath, contentType, cache = MANIFEST_CACHE) {
  const url = new URL(request.url);
  const assetUrl = new URL(internalPath, url.origin);
  const resp = await env.ASSETS.fetch(assetUrl, { redirect: "manual" });
  if (!resp.ok) {
    return new Response("Asset khong tim thay: " + internalPath + "\n", { status: 500 });
  }
  const body = request.method === "HEAD" ? null : resp.body;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": cache,
      ...cors(),
    },
  });
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
  :root { --bg:#0b0e14; --card:#121722; --line:#232b3d; --ink:#e8edf7; --dim:#8b96ad; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.6 ui-monospace,Menlo,Consolas,monospace; }
  .bars { height:10px; background:linear-gradient(to right,#c0c0c0 0 14.28%,#c0c000 14.28% 28.57%,#00c0c0 28.57% 42.85%,#00c000 42.85% 57.14%,#c000c0 57.14% 71.42%,#c00000 71.42% 85.71%,#0000c0 85.71% 100%); }
  main { max-width:900px; margin:0 auto; padding:20px 14px 60px; }
  h1 { font-size:20px; letter-spacing:3px; margin:0 0 4px; }
  p.dim { color:var(--dim); font-size:12px; margin:0 0 16px; }
  .tv { border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#000; }
  video { display:block; width:100%; aspect-ratio:16/9; background:#000; }
  .row { display:flex; gap:8px; flex-wrap:wrap; margin:14px 0; }
  button { background:#1a2336; color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:9px 14px; font:inherit; cursor:pointer; }
  button:hover { background:#23304c; }
  button.on { background:#274bcc; border-color:#274bcc; color:#fff; }
  code { background:#0d1220; border:1px solid var(--line); border-radius:4px; padding:1px 6px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; margin-top:14px; }
  .panel { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:10px 12px; font-size:12px; color:var(--dim); }
  .panel b { color:var(--ink); }
</style>
</head>
<body>
<div class="bars"></div>
<main>
  <h1>${escapeHtml(brand)} · KÊNH TEST CARD</h1>
  <p class="dim">Phát liên tục 24/7 — vạch màu SMPTE + đồng hồ PHÚT:GIÁY (khớp giờ thật, quay vòng mỗi giờ) + tone 1kHz.</p>

  <div class="tv"><video id="video" playsinline controls muted></video></div>

  <div class="row">
    <button id="btnHls" class="on">▶ HLS (/test.m3u8)</button>
    <button id="btnDash">▶ DASH (/test.mpd)</button>
    <button id="btnMute">🔇 BẬT TIẾNG (tone 1kHz)</button>
    <button id="btnClock">🕐 ĐỐI CHIỒNG ĐỒNG HỒ</button>
  </div>

  <div class="grid">
    <div class="panel"><b>Link HLS</b><br><code id="hlsUrl"></code><br>Dán vào VLC: Media → Open Network Stream</div>
    <div class="panel"><b>Link DASH</b><br><code id="dashUrl"></code><br>dash.js / VLC / trình phát DASH</div>
    <div class="panel"><b>Đồng hồ trên card</b><br>Hiện PHÚT:GIÁY trong giờ — đến đúng giờ thật thì card cũng đúng số đó. Player trễ bao nhiêu nhìn là biết.</div>
  </div>
</main>
<script>
(function(){
  "use strict";
  var video = document.getElementById("video");
  var hls = null, dash = null;
  var origin = location.origin;
  document.getElementById("hlsUrl").textContent = origin + "/test.m3u8";
  document.getElementById("dashUrl").textContent = origin + "/test.mpd";

  function setBtn(id){ ["btnHls","btnDash"].forEach(function(b){ document.getElementById(b).className = (b===id) ? "on" : ""; }); }
  function clearPlayers(){
    if (hls) { try { hls.destroy(); } catch(e){} hls = null; }
    if (dash) { try { dash.reset(); } catch(e){} dash = null; }
    video.removeAttribute("src"); try { video.load(); } catch(e){}
  }
  function playHls(){
    setBtn("btnHls"); clearPlayers();
    var u = origin + "/test.m3u8";
    function native(){ video.src = u; video.play().catch(function(){}); }
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker:true, backBufferLength:30 });
      hls.on(Hls.Events.ERROR, function(ev, data){
        if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) { try { hls.startLoad(); } catch(e){} }
      });
      hls.loadSource(u); hls.attachMedia(video);
    } else native();
    video.play().catch(function(){});
  }
  function playDash(){
    setBtn("btnDash"); clearPlayers();
    var u = origin + "/test.mpd";
    if (window.dashjs) {
      dash = dashjs.MediaPlayer().create();
      dash.initialize(video, u, true);
    } else { video.src = u; video.play().catch(function(){}); }
  }
  function loadLib(src, cb){
    var s = document.createElement("script"); s.src = src;
    s.onload = function(){ cb(); }; s.onerror = function(){ cb(); };
    document.head.appendChild(s);
  }
  loadLib("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js", function(){
    playHls();
  });
  document.getElementById("btnHls").onclick = playHls;
  document.getElementById("btnDash").onclick = function(){
    if (window.dashjs) return playDash();
    loadLib("https://cdn.jsdelivr.net/npm/dashjs@4/dist/dash.all.min.js", playDash);
  };
  document.getElementById("btnMute").onclick = function(){
    video.muted = !video.muted;
    this.textContent = video.muted ? "🔇 BẬT TIẾNG (tone 1kHz)" : "🔊 TẮT TIẾNG";
  };
  document.getElementById("btnClock").onclick = function(){
    var now = new Date();
    var mmss = String(now.getMinutes()).padStart(2,"0") + ":" + String(now.getSeconds()).padStart(2,"0");
    alert("Giờ hiện tại (MM:SS): " + mmss + "\\n\\nTua video về đầu giờ (seek 0 hoặc đầu giờ hiện tại) rồi so đồng hồ trên card với số này — lệch bao nhiêu = player trễ bấy nhiêu.");
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
    const brand = env?.BRAND || "CHRTV";
    const url = new URL(request.url);
    const lower = url.pathname.toLowerCase();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Chi ho tro GET\n", { status: 405, headers: cors() });
    }

    if (lower === "/healthz") {
      return new Response("ok\n", { status: 200, headers: { "content-type": "text/plain; charset=utf-8", ...cors() } });
    }

    // HLS chính (chuẩn, chia sẻ được)
    if (lower === "/test.m3u8" || lower === "/index.m3u8" || lower === "/test.m3u8/") {
      return serveAsset(env, request, "/hls/test-sll.m3u8", "application/vnd.apple.mpegurl");
    }
    // HLS biến thể PROGRAM-DATE-TIME 1970 (tương thích player cũ)
    if (lower === "/live.m3u8" || lower === "/test-slr.m3u8") {
      return serveAsset(env, request, "/hls/test-slr.m3u8", "application/vnd.apple.mpegurl");
    }
    // DASH
    if (lower === "/test.mpd" || lower === "/manifest.mpd") {
      return serveAsset(env, request, "/dash/test.mpd", "application/dash+xml");
    }

    // Trang xem thử
    if (lower === "/" || lower === "/watch" || lower === "/index.html") {
      return watchPage({ brand });
    }

    // Còn lại: thử static assets (seg/*.ts, hls/*, dash/*...)
    const assetResp = await env.ASSETS.fetch(new URL(url.pathname, url.origin), { redirect: "manual" });
    if (assetResp.ok) {
      const headers = new Headers(assetResp.headers);
      for (const [k, v] of Object.entries(cors())) headers.set(k, v);
      return new Response(request.method === "HEAD" ? null : assetResp.body, { status: 200, headers });
    }

    return new Response(
      "Khong tim thay. Link kenh: /test.m3u8 (HLS) · /test.mpd (DASH) · / (trang xem thu)\n",
      { status: 404, headers: { "content-type": "text/plain; charset=utf-8", ...cors() } },
    );
  },
};
