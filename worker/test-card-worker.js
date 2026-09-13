/**
 * CHRTV TEST CARD — Cloudflare Worker trang test link m3u8 / mpd.
 *
 * Trang test dạng "test card" (bảng màu SMPTE như truyền hình): dán link
 * m3u8 (HLS) hoặc mpd (DASH) vào là phát thử ngay, kèm bảng thông số
 * (độ phân giải, bitrate, buffer, frame rơi, latency) + kiểm tra
 * server-side (CORS, content-type, manifest live hay VOD...).
 *
 * ĐỊNH DẠNG LINK:
 *   https://<worker>/test.m3u8                                  -> trang test HLS
 *   https://<worker>/test.mpd                                   -> trang test DASH
 *   https://<worker>/test.m3u8?u=<base64url của link thật>      -> chia sẻ kèm link sẵn
 *   https://<worker>/test.m3u8?url=<link thật>                  -> không cần base64
 *   https://<worker>/test.m3u8?url=<link>&auto=1                -> tự phát luôn
 *   https://<worker>/check?url=<link>                           -> API kiểm tra server-side (JSON)
 *   https://<worker>/healthz                                    -> kiểm tra worker sống
 *
 * Mọi path khác kết thúc bằng .m3u8 / .mpd đều dùng được (VD /demo.m3u8).
 *
 * DEPLOY (1 file, không cần build):
 *   npx wrangler deploy -c wrangler.test-card.toml
 * Đổi tên thương hiệu:
 *   [vars] BRAND = "TÊN BẠN"  (trong wrangler.test-card.toml hoặc `wrangler secret/vars`)
 */

// ---------------------------------------------------------------------------
// Tiện ích chung
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "*",
};

function corsHeaders() {
  return { ...CORS_HEADERS };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2) + "\n", {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(),
    },
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

function b64urlDecode(str) {
  try {
    let s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// API /check — probe link stream từ phía server (không vướng CORS của browser)
// ---------------------------------------------------------------------------

const CHECK_MAX_BYTES = 64 * 1024; // chỉ đọc đầu manifest để sniff
const CHECK_TIMEOUT_MS = 10_000;

function sniffManifest(text) {
  const head = text.slice(0, 8192);
  const t = head.trimStart();

  if (t.startsWith("#EXTM3U")) {
    const variants = (head.match(/#EXT-X-STREAM-INF/g) || []).length;
    const segments = (head.match(/#EXTINF/g) || []).length;
    const live = !head.includes("#EXT-X-ENDLIST");
    let maxBw = 0;
    let res = null;
    for (const line of head.split("\n")) {
      if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
      const bw = /BANDWIDTH=(\d+)/.exec(line);
      if (bw) maxBw = Math.max(maxBw, Number(bw[1]));
      const r = /RESOLUTION=(\d+x\d+)/.exec(line);
      if (r) res = r[1];
    }
    return {
      kind: variants ? "HLS master playlist" : "HLS media playlist",
      live,
      ...(variants ? { variants } : {}),
      ...(segments ? { segments } : {}),
      ...(maxBw ? { maxBandwidthBps: maxBw } : {}),
      ...(res ? { resolution: res } : {}),
    };
  }

  if (/<MPD[\s>]/i.test(t)) {
    const dynamic = /type\s*=\s*["']?dynamic/i.test(head);
    const profiles = /profiles="([^"]+)"/i.exec(head);
    return {
      kind: "DASH (MPD)",
      live: dynamic,
      ...(profiles ? { profiles: profiles[1].slice(0, 120) } : {}),
    };
  }

  if (/^</.test(t)) return { kind: "HTML/XML — KHÔNG PHẢI manifest (trang lỗi?)" };
  if (t.startsWith("{") || t.startsWith("[")) return { kind: "JSON — KHÔNG PHẢI manifest (API lỗi?)" };
  return { kind: "Không nhận ra manifest (có thể là segment .ts/.m4s trực tiếp)" };
}

async function handleCheck(url) {
  const target = (url.searchParams.get("url") || "").trim();
  if (!/^https?:\/\/.+/i.test(target)) {
    return json({ ok: false, error: "Thiếu hoặc sai tham số ?url= (phải là http/https)" }, 400);
  }

  const started = Date.now();
  let resp;
  try {
    resp = await fetch(target, {
      redirect: "follow",
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      headers: {
        "user-agent": "Mozilla/5.0 (SMART-TV; Linux) CHRTV-TestCard/1.0",
        accept: "*/*",
      },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
  } catch (e) {
    return json({
      ok: false,
      target,
      ms: Date.now() - started,
      error: "fetch thất bại: " + (e?.message || String(e)),
      hints: [
        "Server không kết nối được nguồn (timeout / DNS / TLS).",
        "Nếu link là http:// thì thử https://; nếu nguồn chặn UA/datacenter IP của Cloudflare thì phải dùng proxy riêng.",
      ],
    });
  }

  // Đọc tối đa CHECK_MAX_BYTES rồi huỷ phần còn lại (không tải nguyên segment)
  let text = "";
  try {
    if (resp.body) {
      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let received = 0;
      const chunks = [];
      while (received < CHECK_MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (received >= CHECK_MAX_BYTES) {
          try { await resp.body.cancel(); } catch { /* bỏ qua */ }
          break;
        }
      }
      const all = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) { all.set(c, off); off += c.length; }
      text = decoder.decode(all);
    }
  } catch { /*.body lỗi thì bỏ qua phần sniff */ }

  const ms = Date.now() - started;
  const contentType = resp.headers.get("content-type") || "";
  const acao = resp.headers.get("access-control-allow-origin");

  const sniff = sniffManifest(text);
  const hints = [];

  if (!resp.ok) {
    hints.push(`HTTP ${resp.status} từ nguồn — bị chặn hotlink/referrer/token hết hạn, hoặc link sai.`);
  }
  if (contentType.includes("text/html")) {
    hints.push("content-type là text/html — nguồn trả trang web thay vì manifest (link sai hoặc bị chặn).");
  }
  if (!acao) {
    hints.push("Nguồn KHÔNG có header CORS (access-control-allow-origin) — hls.js/dash.js chạy trên web sẽ bị chặn; app native/VLC thì vẫn xem được.");
  } else if (acao !== "*" && acao !== "") {
    hints.push(`CORS chỉ cho phép origin "${acao}" — nhúng vào web khác domain sẽ bị chặn.`);
  }
  if (target.startsWith("http://")) {
    hints.push("Link là http:// — các trang https sẽ chặn vì mixed content. Nên dùng https://.");
  }
  if (sniff.kind && sniff.kind.includes("KHÔNG PHẢI")) {
    hints.push("Nội dung trả về không phải manifest m3u8/mpd — kiểm tra lại link.");
  }

  return json({
    ok: resp.ok,
    target,
    status: resp.status,
    finalUrl: resp.url,
    ms,
    contentType,
    cors: acao || null,
    sniffedBytes: text.length,
    sniff,
    hints,
  });
}

// ---------------------------------------------------------------------------
// Trang test card (HTML)
// ---------------------------------------------------------------------------

function page({ brand, mode, prefill, auto }) {
  const engineTag = mode === "dash" ? "DASH · MPD" : "HLS · M3U8";
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(brand)} · TEST CARD</title>
<style>
  :root { --bg:#0b0e14; --card:#121722; --line:#232b3d; --ink:#e8edf7; --dim:#8b96ad; --ok:#3ddc84; --err:#ff5d5d; --warn:#ffc857; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
  .bars { height:12px; background:linear-gradient(to right,
    #c0c0c0 0 14.28%, #c0c000 14.28% 28.57%, #00c0c0 28.57% 42.85%, #00c000 42.85% 57.14%,
    #c000c0 57.14% 71.42%, #c00000 71.42% 85.71%, #0000c0 85.71% 100%); }
  main { max-width:980px; margin:0 auto; padding:18px 14px 60px; }
  header.top { display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
  h1 { font-size:22px; letter-spacing:4px; margin:0; }
  h1 small { display:block; letter-spacing:1px; font-size:11px; color:var(--dim); font-weight:normal; }
  .clock { text-align:right; color:var(--dim); font-size:12px; white-space:nowrap; }
  .clock b { display:block; color:var(--ink); font-size:16px; }
  .badge { display:inline-block; padding:2px 10px; border:1px solid var(--line); border-radius:999px; font-size:11px; color:var(--dim); }
  .row { display:flex; gap:8px; flex-wrap:wrap; margin:10px 0; }
  input[type=text] { flex:1 1 320px; background:#0d1220; color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:11px 12px; font:inherit; outline:none; }
  input[type=text]:focus { border-color:#4f6ab8; }
  button { background:#1a2336; color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:10px 14px; font:inherit; cursor:pointer; }
  button:hover { background:#23304c; }
  button.primary { background:#274bcc; border-color:#274bcc; color:#fff; font-weight:bold; }
  button.primary:hover { background:#3057e0; }
  .chips { display:flex; gap:6px; flex-wrap:wrap; margin:8px 0 2px; }
  .chip { font-size:11px; color:var(--dim); border:1px dashed var(--line); border-radius:999px; padding:3px 10px; cursor:pointer; background:transparent; }
  .chip:hover { color:var(--ink); border-color:#4f6ab8; }
  .tv { position:relative; margin-top:8px; border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#000; }
  .tv video { display:block; width:100%; aspect-ratio:16/9; background:#000; }
  .overlay { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
    background:linear-gradient(to bottom,
      #c0c0c0 0 14.28%, #c0c000 14.28% 28.57%, #00c0c0 28.57% 42.85%, #00c000 42.85% 57.14%,
      #c000c0 57.14% 71.42%, #c00000 71.42% 85.71%, #0000c0 85.71% 100%);
    color:#000; text-align:center; }
  .overlay .big { font-size:26px; font-weight:bold; letter-spacing:6px; background:#000c; color:#fff; padding:8px 22px; border-radius:6px; }
  .overlay .hint { background:#000c; color:#fff; padding:5px 14px; border-radius:6px; font-size:12px; }
  .stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:8px; margin-top:10px; }
  .stat { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:8px 10px; }
  .stat .k { font-size:10px; color:var(--dim); letter-spacing:1px; }
  .stat .v { font-size:15px; font-weight:bold; margin-top:2px; }
  .panel { background:var(--card); border:1px solid var(--line); border-radius:8px; margin-top:10px; }
  .panel h2 { font-size:11px; letter-spacing:2px; color:var(--dim); margin:0; padding:8px 12px; border-bottom:1px solid var(--line); }
  .panel .body { padding:10px 12px; max-height:260px; overflow:auto; }
  #checkOut { white-space:pre-wrap; color:var(--dim); margin:0; font-size:12px; }
  #log { margin:0; font-size:12px; }
  #log div { padding:1px 0; border-bottom:1px dashed #1b2233; word-break:break-all; }
  #log .err { color:var(--err); }
  #log .warn { color:var(--warn); }
  #log .ok { color:var(--ok); }
  footer { margin-top:18px; color:var(--dim); font-size:11px; }
  footer code { background:#0d1220; border:1px solid var(--line); border-radius:4px; padding:1px 6px; }
  .fmt { color:var(--dim); }
  @media (prefers-reduced-motion: no-preference) { .tv:active { transform:scale(0.999); } }
</style>
</head>
<body>
<div class="bars"></div>
<main>
  <header class="top">
    <h1>${escapeHtml(brand)} · TEST CARD<small>trang kiểm tra link stream — ${engineTag}</small></h1>
    <div class="clock"><b id="clock">--:--:--</b><span id="today"></span></div>
  </header>

  <span class="badge">ENGINE: <b id="mode">${mode === "dash" ? "DASH (mpd)" : "HLS (m3u8)"}</b></span>
  <span class="badge">TỰ NHẬN DIỆN .m3u8 / .mpd KHI PHÁT</span>

  <div class="row">
    <input id="url" type="text" placeholder="Dán link vào đây: https://.../stream.m3u8 hoặc .mpd" value="${escapeHtml(prefill)}" spellcheck="false" autocomplete="off">
  </div>
  <div class="row">
    <button id="play" class="primary">▶ PHÁT</button>
    <button id="stopBtn">⏹ DỪNG</button>
    <button id="check">📡 KIỂM TRA SERVER</button>
    <button id="copy">🔗 COPY LINK TEST</button>
  </div>

  <div class="chips">
    <span class="fmt">Stream mẫu:</span>
    <button class="chip" data-u="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8">HLS · Sintel (mux.dev)</button>
    <button class="chip" data-u="https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8">HLS · Apple BipBop</button>
    <button class="chip" data-u="https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd">DASH · Big Buck Bunny</button>
    <button class="chip" data-u="https://dash.akamaized.net/dash264/TestCases/1a/sony/SNE_DASH_SD_CASE1A_REVISED.mpd">DASH · DASH-IF Case1a</button>
  </div>

  <div class="tv">
    <video id="video" playsinline controls></video>
    <div class="overlay" id="overlay">
      <div class="big">TEST CARD</div>
      <div class="hint">DÁN LINK M3U8 / MPD RỒI BẤM ▶ PHÁT</div>
    </div>
  </div>

  <div class="stats">
    <div class="stat"><div class="k">ĐỘ PHÂN GIẢI</div><div class="v" id="res">—</div></div>
    <div class="stat"><div class="k">BITRATE</div><div class="v" id="rate">—</div></div>
    <div class="stat"><div class="k">BUFFER</div><div class="v" id="buf">—</div></div>
    <div class="stat"><div class="k">FRAME RƠI</div><div class="v" id="drop">—</div></div>
    <div class="stat"><div class="k">LATENCY (LIVE)</div><div class="v" id="lat">—</div></div>
    <div class="stat"><div class="k">THỜI GIAN</div><div class="v" id="time">—</div></div>
  </div>

  <div class="panel"><h2>KIỂM TRA TỪ SERVER (/check)</h2><div class="body"><pre id="checkOut">Chưa chạy. Bấm “📡 KIỂM TRA SERVER”.</pre></div></div>
  <div class="panel"><h2>NHẬT KÝ</h2><div class="body"><div id="log"></div></div></div>

  <footer>
    Định dạng link: <code>/test.m3u8</code> · <code>/test.mpd</code> · chia sẻ kèm link:
    <code>/test.m3u8?u=&lt;base64url&gt;</code> hoặc <code>?url=&lt;link&gt;</code> · tự phát: thêm <code>&amp;auto=1</code><br>
    API kiểm tra: <code>/check?url=&lt;link&gt;</code> (JSON) · sức khoẻ worker: <code>/healthz</code>
  </footer>
</main>
<script>
(function () {
  "use strict";
  var MODE = ${JSON.stringify(mode)};
  var AUTOPLAY = ${auto ? "true" : "false"};
  var video, hls, dashPlayer, statsTimer;

  function $(id) { return document.getElementById(id); }

  function log(msg, cls) {
    var box = $("log");
    var line = document.createElement("div");
    line.className = cls || "";
    line.textContent = "[" + new Date().toLocaleTimeString("vi-VN") + "] " + msg;
    box.insertBefore(line, box.firstChild);
  }

  // ---- base64url (giống backend stream-protect) ----
  function b64uEnc(s) {
    var bytes = new TextEncoder().encode(s), bin = "", i;
    for (i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  }
  function b64uDec(s) {
    s = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s), bytes = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  // ---- nhận diện engine từ link ----
  function detectMode(u) {
    var clean = (u.split("?")[0] || "").toLowerCase();
    if (clean.slice(-4) === ".mpd") return "dash";
    return "hls";
  }
  function badge(mode) { $("mode").textContent = mode === "dash" ? "DASH (mpd)" : "HLS (m3u8)"; }

  function loadScript(src, cb) {
    var s = document.createElement("script");
    s.src = src;
    s.onload = function () { cb(null); };
    s.onerror = function () { cb(new Error("Không tải được thư viện: " + src)); };
    document.head.appendChild(s);
  }
  function ensureLib(mode, cb) {
    if (mode === "hls") {
      if (window.Hls) return cb(null);
      loadScript("https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js", cb);
    } else {
      if (window.dashjs) return cb(null);
      loadScript("https://cdn.jsdelivr.net/npm/dashjs@4/dist/dash.all.min.js", cb);
    }
  }

  // ---- phát / dừng ----
  function stop(silent) {
    if (statsTimer) { clearInterval(statsTimer); statsTimer = null; }
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    if (dashPlayer) { try { dashPlayer.reset(); } catch (e) {} dashPlayer = null; }
    video.removeAttribute("src");
    try { video.load(); } catch (e) {}
    $("overlay").style.display = "flex";
    ["res", "rate", "buf", "drop", "lat", "time"].forEach(function (id) { $(id).textContent = "—"; });
    if (!silent) log("Đã dừng phát.");
  }

  function play() {
    var u = $("url").value.trim();
    if (!u) { log("Nhập link m3u8/mpd trước đã bro 😄", "warn"); return; }
    if (!/^https?:\\/\\//i.test(u)) { log("Link phải bắt đầu bằng http:// hoặc https://", "err"); return; }
    MODE = detectMode(u);
    badge(MODE);
    stop(true);
    log("Phát bằng " + (MODE === "dash" ? "DASH" : "HLS") + ": " + u);
    ensureLib(MODE, function (err) {
      if (err) { log(err.message, "err"); return; }
      if (MODE === "hls") playHls(u); else playDash(u);
    });
  }

  function playHls(u) {
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 90 });
      hls.on(Hls.Events.MANIFEST_PARSED, function (ev, data) {
        log("✓ Manifest OK — " + data.levels.length + " mức chất lượng", "ok");
        $("overlay").style.display = "none";
        video.play().catch(function () { log("Trình duyệt chặn autoplay — bấm nút play trên video.", "warn"); });
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, function (ev, data) {
        var lv = hls.levels[data.level];
        if (lv && lv.height) log("Chuyển chất lượng: " + lv.height + "p @" + Math.round((lv.bitrate || 0) / 1000) + " kbps");
      });
      hls.on(Hls.Events.ERROR, function (ev, data) {
        if (!data.fatal) { if (data.details) log("⚠ " + data.details, "warn"); return; }
        log("✖ HLS lỗi: " + data.details + (data.response ? " (HTTP " + data.response.code + ")" : ""), "err");
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          log("→ Lỗi mạng/manifest — chạy kiểm tra server-side...", "warn");
          runCheck(u);
          try { hls.startLoad(); } catch (e) {}
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          log("→ Thử phục hồi media...", "warn");
          try { hls.recoverMediaError(); } catch (e) { stop(); }
        } else {
          stop();
        }
      });
      hls.loadSource(u);
      hls.attachMedia(video);
      startStats();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      log("Dùng HLS gốc của trình duyệt (Safari/iOS).");
      video.src = u;
      $("overlay").style.display = "none";
      video.play().catch(function () {});
      startStats();
    } else {
      log("Trình duyệt không hỗ trợ MSE cũng như HLS gốc.", "err");
    }
  }

  function playDash(u) {
    dashPlayer = dashjs.MediaPlayer().create();
    dashPlayer.on(dashjs.MediaPlayer.events.MANIFEST_LOADED, function () {
      log("✓ Manifest DASH OK", "ok");
      $("overlay").style.display = "none";
    });
    dashPlayer.on(dashjs.MediaPlayer.events.ERROR, function (e) {
      var msg = (e && e.error && (e.error.message || (e.error.event && e.error.event.message))) || "không rõ";
      log("✖ DASH lỗi: " + msg, "err");
      runCheck(u);
    });
    dashPlayer.initialize(video, u, true);
    startStats();
  }

  // ---- bảng thông số ----
  function startStats() {
    if (statsTimer) clearInterval(statsTimer);
    statsTimer = setInterval(updateStats, 1000);
    updateStats();
  }
  function updateStats() {
    var b = video.buffered, bufTxt = "—";
    if (b && b.length) {
      bufTxt = Math.max(0, b.end(b.length - 1) - video.currentTime).toFixed(1) + "s";
    }
    $("buf").textContent = bufTxt;
    $("res").textContent = video.videoWidth ? video.videoWidth + "×" + video.videoHeight : "—";
    if (hls && hls.levels && hls.currentLevel >= 0 && hls.levels[hls.currentLevel]) {
      var lv = hls.levels[hls.currentLevel];
      $("rate").textContent = lv.bitrate ? Math.round(lv.bitrate / 1000) + " kbps" : "—";
    } else if (dashPlayer) {
      try {
        var q = dashPlayer.getQualityFor("video");
        var list = dashPlayer.getBitrateInfoListFor("video");
        if (list && list[q] && list[q].bitrate) $("rate").textContent = Math.round(list[q].bitrate / 1000) + " kbps";
      } catch (e) {}
    }
    var pq = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
    $("drop").textContent = pq ? pq.droppedVideoFrames : "—";
    var dur = video.duration, timeTxt;
    if (dur === Infinity) timeTxt = "LIVE";
    else if (isFinite(dur) && dur > 0) timeTxt = fmtTime(video.currentTime) + " / " + fmtTime(dur);
    else timeTxt = "—";
    $("time").textContent = timeTxt;
    if (hls && isFinite(hls.latency) && hls.latency > 0) $("lat").textContent = hls.latency.toFixed(1) + "s";
  }
  function fmtTime(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  }

  // ---- kiểm tra server-side ----
  function runCheck(u) {
    u = u || $("url").value.trim();
    if (!u) { log("Chưa có link để kiểm tra.", "warn"); return; }
    $("checkOut").textContent = "Đang probe nguồn từ server...";
    fetch("/check?url=" + encodeURIComponent(u))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var lines = [];
        lines.push("URL      : " + (d.target || "—"));
        lines.push("KẾT QUẢ  : " + (d.ok ? "OK" : "LỖI") + (d.status ? "  (HTTP " + d.status + ")" : "") + (d.ms != null ? "  · " + d.ms + "ms" : ""));
        if (d.error) lines.push("LỖI      : " + d.error);
        if (d.contentType) lines.push("TYPE     : " + d.contentType);
        lines.push("CORS     : " + (d.cors || "không có header access-control-allow-origin"));
        if (d.sniff) {
          lines.push("SNIFF    : " + d.sniff.kind + (d.sniff.live === true ? "  · LIVE" : d.sniff.live === false ? "  · VOD" : ""));
          if (d.sniff.variants) lines.push("           " + d.sniff.variants + " variant" + (d.sniff.resolution ? " · max " + d.sniff.resolution : "") + (d.sniff.maxBandwidthBps ? " · " + Math.round(d.sniff.maxBandwidthBps / 1000) + " kbps" : ""));
          if (d.sniff.segments) lines.push("           ~" + d.sniff.segments + " segment trong đoạn đầu manifest");
        }
        if (d.hints && d.hints.length) {
          lines.push("GỢI Ý    :");
          d.hints.forEach(function (h) { lines.push("  • " + h); });
        }
        $("checkOut").textContent = lines.join("\\n");
        log(d.ok ? "✓ Server probe: HTTP " + d.status + " — " + (d.sniff ? d.sniff.kind : "") : "✖ Server probe: " + (d.error || "HTTP " + d.status), d.ok ? "ok" : "err");
      })
      .catch(function (e) { $("checkOut").textContent = "Lỗi gọi /check: " + e; });
  }

  // ---- copy link test dạng ?u=base64url ----
  function copyLink() {
    var u = $("url").value.trim();
    if (!u) { log("Nhập link trước rồi mới copy.", "warn"); return; }
    var link = location.origin + "/test." + (detectMode(u) === "dash" ? "mpd" : "m3u8") + "?u=" + b64uEnc(u);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () { log("✓ Đã copy link test: " + link, "ok"); },
        function () { $("url").value = link; log("Không copy được tự động — link đã ghi vào ô input.", "warn"); });
    } else {
      $("url").value = link;
      log("Link test (copy tay): " + link);
    }
  }

  // ---- đồng hồ test card ----
  function tickClock() {
    var now = new Date();
    $("clock").textContent = now.toLocaleTimeString("vi-VN");
    $("today").textContent = now.toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  }

  // ---- khởi động ----
  video = $("video");
  $("play").addEventListener("click", play);
  $("stopBtn").addEventListener("click", function () { stop(); });
  $("check").addEventListener("click", function () { runCheck(); });
  $("copy").addEventListener("click", copyLink);
  $("url").addEventListener("keydown", function (e) { if (e.key === "Enter") play(); });
  Array.prototype.forEach.call(document.querySelectorAll(".chip"), function (c) {
    c.addEventListener("click", function () { $("url").value = c.getAttribute("data-u"); play(); });
  });
  tickClock();
  setInterval(tickClock, 1000);
  log("Sẵn sàng. Dán link rồi bấm ▶ PHÁT — engine tự chọn HLS/DASH theo đuôi .m3u8/.mpd.");
  if (AUTOPLAY && $("url").value.trim()) play();
})();
</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(),
    },
  });
}

// ---------------------------------------------------------------------------
// Router chính
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const brand = env?.BRAND || "CHRTV";
    const url = new URL(request.url);
    const path = url.pathname;
    const lower = path.toLowerCase();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Chỉ hỗ trợ GET" }, 405);
    }

    if (lower === "/healthz") {
      return new Response("ok\n", { headers: { "content-type": "text/plain; charset=utf-8", ...corsHeaders() } });
    }

    if (lower === "/check") {
      return handleCheck(url);
    }

    // Trang test card: mặc định HLS; đuôi .mpd -> DASH.
    // Mọi path khác (kể cả /) đều ra trang test cho tiện chia sẻ.
    let mode = "hls";
    if (lower.endsWith(".mpd") || lower.endsWith(".mpd/")) mode = "dash";

    // Prefill link: ?url=<link> hoặc ?u=<base64url>
    let prefill = url.searchParams.get("url") || "";
    if (!prefill && url.searchParams.get("u")) prefill = b64urlDecode(url.searchParams.get("u"));
    const auto = url.searchParams.get("auto") === "1";

    const resp = page({ brand, mode, prefill, auto });
    if (request.method === "HEAD") return new Response(null, { status: resp.status, headers: resp.headers });
    return resp;
  },
};
