/**
 * CHRTV OTT Backend - Cloudflare Workers
 * Auth, Admin, Analytics, Notifications, WebSocket
 *
 * ============ SECURITY (2026-09-05 — patch lỗ hổng theo báo cáo kiểm thử) ============
 *  - Admin Token Stream Engine bị lộ trong /api/playlist công khai → playlist/channels
 *    KHÔNG BAO GIỜ trả `stream_url` nữa (chỉ metadata). Client xin token phát động qua
 *    /api/stream/token (bắt buộc JWT) → phát qua /api/stream/proxy (token HMAC ngắn hạn).
 *  - Playback token: HMAC-SHA256 bằng secret phía server (env STREAM_TOKEN_SECRET),
 *    bind (channel/stream + user + sid theo IP/UA), TTL 60s, tự xoay theo mỗi request.
 *    KHÔNG dùng chung với admin token.
 *  - /api/proxy: whitelist upstream + chặn IP private/reserved (SSRF) + port 80/443 +
 *    chặn redirect ra ngoài whitelist + rate-limit theo IP.
 *  - CORS: không dùng `*` — chỉ echo Origin nằm trong allowlist.
 *  - Security headers (HSTS/CSP/XFO/...) đặt ở worker cho MỌI response (kể cả static).
 *  - /admin/*: xoá bypass `Bearer JWT_SECRET`; chỉ JWT role=admin hoặc ADMIN_MASTER_TOKEN
 *    (secret riêng, wrangler secret); audit log + alert webhook; có thể khoá theo CIDR.
 *  - /auth/*: rate-limit + lockout (verify: 5 lần sai → huỷ mã), mã CSPRNG, TTL 10 phút,
 *    1 mã dùng 1 lần, message không lộ email có tồn tại.
 *  - Secrets: đọc từ env (wrangler secret put). Giá trị fallback chỉ để dev local —
 *    SAU KHI CẤU HÌNH SECRET, các token cũ tự động vô hiệu.
 * ============
 */

const SOURCE_M3U_URL = "https://github.com/ankbuitv/mytv/raw/refs/heads/main/playlist.m3u";
// Nguồn dự phòng khi playlist chính không tải được (repo private/404/rate-limit)
const SOURCE_M3U_FALLBACK = "https://raw.githubusercontent.com/ankbuitv/ott/refs/heads/main/playlists/tv.m3u";
const SOURCE_EPG_URL = "https://epg.io.vn/epgc.xml";
const SOURCE_EPG_URL2 = "https://lichphatsong.io.vn/epgc.xml";
const SOURCE_EPG_URL3 = "https://epg.pm/vi/epgc.xml";
const FALLBACK_STREAM_URL = "http://bore.pub:30113/hls/index.m3u8";

// ---- Secrets: BẮT BUỘC set qua `wrangler secret put` (xem SECURITY_FIX_RUNBOOK.md §1) ----
// KHÔNG CÒN giá trị fallback trong code: thiếu secret = endpoint auth trả lỗi
// cấu hình rõ ràng (500), app không chạy bằng secret mặc định công khai.
// Local dev: wrangler.dev.toml có [vars] dev-only.
function jwtSecret(env) {
  const s = env && env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET chưa cấu hình — chạy: wrangler secret put JWT_SECRET (SECURITY_FIX_RUNBOOK.md §1)");
  return s;
}
function streamTokenSecret(env) {
  const s = env && env.STREAM_TOKEN_SECRET;
  if (!s) throw new Error("STREAM_TOKEN_SECRET chưa cấu hình — chạy: wrangler secret put STREAM_TOKEN_SECRET (SECURITY_FIX_RUNBOOK.md §1)");
  return s;
}

// ---- Mật khẩu: pepper RIÊNG, KHÔNG dùng chung JWT_SECRET ----
// Trước đây password_hash = sha256(password + JWT_SECRET). Hệ quả: mỗi lần xoay
// JWT_SECRET (đúng theo SECURITY_FIX_RUNBOOK §1) là TOÀN BỘ mật khẩu user chết →
// nhập đúng mật khẩu vẫn báo "Sai mật khẩu". Từ nay:
//   - hash mới dùng PASSWORD_PEPPER (nếu chưa set thì rơi về JWT_SECRET để tương thích)
//   - LEGACY_PASSWORD_PEPPERS / LEGACY_JWT_SECRETS (phân tách bằng dấu phẩy) chứa các
//     secret CŨ: user đăng nhập được 1 lần bằng hash cũ rồi hash tự nâng cấp sang pepper mới.
function passwordSecret(env) {
  const s = (env && (env.PASSWORD_PEPPER || env.JWT_SECRET)) || "";
  if (!s) throw new Error("PASSWORD_PEPPER (hoặc JWT_SECRET) chưa cấu hình — chạy: wrangler secret put PASSWORD_PEPPER");
  return s;
}
function legacyPasswordSecrets(env) {
  if (!env) return [];
  const raw = [env.LEGACY_PASSWORD_PEPPERS, env.LEGACY_JWT_SECRETS, env.JWT_SECRET_OLD]
    .filter(Boolean).join(",");
  const cur = (env.PASSWORD_PEPPER || env.JWT_SECRET || "");
  const list = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  // Khi mới bật PASSWORD_PEPPER: hash cũ vẫn theo JWT_SECRET hiện tại → thử luôn.
  if (env.JWT_SECRET && env.JWT_SECRET !== cur) list.push(env.JWT_SECRET);
  return Array.from(new Set(list));
}

const CHRTV_CLIENT_UA = "CHRTV-OTT/0.0.1"; // CHỈ dùng làm phiên bản client (log), KHÔNG phải cơ chế xác thực.
const SUPPORT_EMAIL = "support@ankb.qzz.io";

// ---- Playback token: HMAC-SHA256, TTL 60s, tự xoay theo từng request phát ----
// XOAY TOKEN: đúng 5 phút / lần. TTL = 300s (chu kỳ xoay) + 30s dự phòng để client
// kịp đổi token mà kênh không đứng — client xoay ở mốc exp-30s, tức phút thứ 5.
const STREAM_TOKEN_ROTATE = 300;  // giây — chu kỳ xoay token phát
const STREAM_TOKEN_GRACE = 30;    // giây — dư ra cho lần xoay
const STREAM_TOKEN_TTL = STREAM_TOKEN_ROTATE + STREAM_TOKEN_GRACE;
const SEGMENT_TOKEN_TTL = 60;     // giây — token segment LIVE (mới mỗi lần tải playlist)
const SEGMENT_TOKEN_TTL_VOD = 4 * 3600; // giây — playlist VOD/catch-up (#EXT-X-ENDLIST): không
                                  // tải lại playlist nên segment token phải sống hết bộ phim
// TTL manifest có thể chỉnh bằng biến môi trường STREAM_MANIFEST_TTL (60..1800 giây)
function manifestTtl(env) {
  const n = parseInt((env && env.STREAM_MANIFEST_TTL) || "", 10);
  if (!Number.isFinite(n)) return STREAM_TOKEN_TTL;
  return Math.max(60, Math.min(1800, n));
}
const GUEST_TTL = 2 * 3600;       // JWT guest: 2 giờ

// ---- CORS: chỉ echo Origin nằm trong allowlist (không dùng `*` nữa) ----
// App native Capacitor gửi Origin "https://localhost" (androidScheme=https) hoặc
// "capacitor://localhost" (iOS) — không có 2 origin này thì APK bị CORS chặn sạch.
const DEFAULT_CORS_ORIGINS = ["https://play.ankb.qzz.io", "https://localhost", "capacitor://localhost", "http://localhost"];
function corsAllowedOrigins(env) {
  const raw = (env && env.CORS_ALLOWED_ORIGINS) || "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : DEFAULT_CORS_ORIGINS;
}
function corsHeadersFor(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return {}; // request không phải browser (curl/TV app) — không cần CORS
  if (!corsAllowedOrigins(env).includes(origin)) {
    return { "Access-Control-Allow-Origin": "null", "Vary": "Origin" }; // chặn cross-origin lạ
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-CHRTV-Client, X-CHRTV-Upstream-UA, X-CHRTV-Upstream-Referer",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

// ---- SECURITY HEADERS (P2) — áp cho mọi response kể cả static assets ----
// Tách mảng directive ra để cspFor(env) gắn thêm frame-src theo allowlist domain.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline'", // React inline event handlers + SW
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob: media:",
  "media-src 'self' blob: data: media:",
  "connect-src 'self' blob: data: https://epg.io.vn https://lichphatsong.io.vn https://epg.pm https://www.thesportsdb.com https://r2.thesportsdb.com https://site.api.espn.com https://a.espncdn.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self'",
];

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "X-XSS-Protection": "0",
  // CSP: chặt trước, nới từng mục khi test. Web app chỉ nói chuyện same-origin
  // (stream qua /api/stream/proxy, TMDB qua /api/tmdb) + font + logo từ CDN + EPG fallback.
  // frame-src được gắn riêng theo env (xem cspFor) nên ở đây KHÔNG có frame-src —
  // mọi chỗ nhúng SECURITY_HEADERS trực tiếp vẫn mặc định chặn iframe bên thứ 3.
  "Content-Security-Policy": CSP_DIRECTIVES.join("; "),
};

// ---- frame-src cho player phim + NGUỒN FREE MẶC ĐỊNH (mở phim là xem được ngay) ----
// Nguồn free mặc định (kiểu vidsrc/2embed — nhận tmdb id, không cần API key).
// Kiểm chứng lần cuối theo danh sách free-streaming-apis (08/2026, tất cả ✅):
//   vidsrc.to · 2embed.cc · vidlink.pro · moviesapi.to · embed.su · vidcore.org
// Nguồn admin tự thêm (Admin Panel → Nguồn phim) luôn đứng TRƯỚC nguồn mặc định.
// Muốn tắt hẳn nguồn mặc định (chỉ dùng nguồn tự khai): đặt biến môi trường
//   MOVIE_BUILTIN_SOURCES = "0"
// Muốn thêm domain riêng (nguồn có hợp đồng) mà không sửa code:
//   wrangler secret put MOVIE_FRAME_SRC   ->   https://player.partner.vn
//   nhiều domain cách nhau bởi dấu cách/phẩy: https://a.partner.vn https://b.partner.vn
//
// DANH SÁCH NÀY LÀ CÁI CỔNG THẬT: /api/movie/sources chỉ trả nguồn mà domain có
// trong đây (custom + mặc định), và /admin/movie_sources từ chối lưu nguồn ngoài
// danh sách.
// Template dùng chung 1 chuỗi cho cả phim lẻ lẫn TV: với phim lẻ, đoạn
// /{season}/{episode} được nuốt gọn (xem expandMovieUrl) để URL thành
// .../movie/123 thay vì .../movie/123/1/1 — nhiều nguồn free không hiểu đuôi /1/1.
//
// ⚠️ CSP này hiện CHƯA áp lên tài liệu HTML của app: wrangler.toml để
//   `assets = { directory = "./dist" }` mà không bật `run_worker_first`, nên request
//   khớp asset (kể cả `/` -> index.html) do tầng Assets trả thẳng, Worker không chạy.
//   (Kiểm chứng: `curl -sI <prod>/` trả CF-Cache-Status: HIT + ETag, không có CSP.)
//   Nghĩa là "Headers bảo mật HSTS/CSP/XFO" ở SECURITY_FIX_RUNBOOK §P2 tới giờ chỉ
//   đúng với API + trang do Worker sinh (/status, 404) — KHÔNG đúng với trang người xem.
//   Muốn bật cho đúng: thêm run_worker_first = true vào assets, rồi test lại toàn bộ;
//   lúc đó nếu dùng nguồn kind='hls' ở domain khác phải thêm https://domain đó vào
//   media-src, không thì <video> bị CSP chặn.
const DEFAULT_MOVIE_FRAME_SRC = [
  "https://vidsrc.to",
  "https://www.2embed.cc",
  "https://vidlink.pro",
  "https://moviesapi.to",
  "https://www.embed.su",
  "https://vidcore.org",
];
// Thứ tự = thứ tự nút chọn server trong app. VidSrc đứng đầu theo yêu cầu.
const BUILTIN_MOVIE_SOURCES = [
  { name: "VidSrc", kind: "embed", url_template: "https://vidsrc.to/embed/{type}/{tmdb}/{season}/{episode}" },
  { name: "2Embed", kind: "embed", url_template: "https://www.2embed.cc/embed/{type}/{tmdb}/{season}/{episode}" },
  { name: "VidLink", kind: "embed", url_template: "https://vidlink.pro/{type}/{tmdb}/{season}/{episode}" },
  { name: "MoviesAPI", kind: "embed", url_template: "https://moviesapi.to/{type}/{tmdb}/{season}/{episode}" },
  { name: "EmbedSU", kind: "embed", url_template: "https://www.embed.su/embed/{type}/{tmdb}/{season}/{episode}" },
  { name: "VidCore", kind: "embed", url_template: "https://vidcore.org/embed/{type}/{tmdb}/{season}/{episode}" },
];
function movieBuiltinsEnabled(env) {
  const v = String(env?.MOVIE_BUILTIN_SOURCES ?? "1").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}
// Domain admin tự khai qua secret (không tính nguồn mặc định) — dùng để hiển thị
// phân biệt trong Admin Panel.
function customEmbedOrigins(env) {
  return String(env?.MOVIE_FRAME_SRC || "")
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/\/+$/, "").toLowerCase())
    .filter((s) => /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/.test(s));
}
function allowedEmbedOrigins(env) {
  const out = [...customEmbedOrigins(env)];
  if (movieBuiltinsEnabled(env)) {
    for (const o of DEFAULT_MOVIE_FRAME_SRC) if (!out.includes(o)) out.push(o);
  }
  return out;
}
// Thay placeholder {tmdb} {type} {season} {episode} vào template.
// Phim lẻ (type=movie): nuốt gọn đoạn /{season}/{episode} trong template để URL
// không dính đuôi /1/1 (nhiều nguồn free trả lỗi với đuôi này).
function expandMovieUrl(tpl, tmdb, type, season, episode) {
  let u = String(tpl || "")
    .replace(/\{tmdb\}/g, tmdb)
    .replace(/\{type\}/g, type);
  if (type === "movie") {
    u = u.replace(/\/\{season\}/g, "").replace(/\/\{episode\}/g, "");
    u = u.replace(/\{season\}/g, "1").replace(/\{episode\}/g, "1"); // còn sót (kiểu query ?s={season}) thì vô hại
  } else {
    u = u.replace(/\{season\}/g, season).replace(/\{episode\}/g, episode);
  }
  return u;
}

function cspFor(env) {
  const origins = allowedEmbedOrigins(env);
  return [...CSP_DIRECTIVES, `frame-src 'self'${origins.length ? " " + origins.join(" ") : ""}`].join("; ");
}

// Gộp headers CORS + security + content-type cho 1 response JSON
function jsonHeaders(request, env, extra) {
  return { ...corsHeadersFor(request, env), ...SECURITY_HEADERS, ...(extra || {}), "Content-Type": "application/json" };
}

export default {
  // Cron: tự động refresh danh sách kênh (playlists/tv.m3u) + EPG cache + dọn rác DB
  async scheduled(event, env, ctx) {
    console.error("[cron] refreshing channels + epg cache");
    ctx.waitUntil((async () => {
      try {
        await importChannelsOnce(env);
      } catch (e) {
        console.error("[cron] playlist refresh error:", e?.message || e);
      }
      try {
        await handleEPG(env, null);
      } catch (e) {
        console.error("[cron] epg refresh error:", e?.message || e);
      }
      // Dọn rác DB: session hết hạn, mã verify/reset cũ, login_attempts, analytics > 90 ngày, cache TMDB hết hạn
      if (hasDB(env)) {
        try {
          await env.DB.batch([
            env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()),
            env.DB.prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')"),
            env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(Math.floor(Date.now() / 1000) - 86400),
            env.DB.prepare("DELETE FROM audit_log WHERE created_at < datetime('now', '-90 days')"),
            env.DB.prepare("DELETE FROM analytics WHERE created_at < datetime('now', '-90 days')"),
            env.DB.prepare("DELETE FROM tmdb_cache WHERE expires_at < ?").bind(Math.floor(Date.now() / 1000)),
            env.DB.prepare("UPDATE users SET verify_code = '', reset_token = '' WHERE verify_expires < ? AND reset_expires < ? AND (verify_code != '' OR reset_token != '')").bind(Math.floor(Date.now() / 1000) - 86400, Math.floor(Date.now() / 1000) - 86400),
            env.DB.prepare("DELETE FROM trending_searches WHERE last_at < datetime('now', '-30 days')"),
            env.DB.prepare("DELETE FROM party_polls WHERE ends_at > 0 AND ends_at < ?").bind(Math.floor(Date.now() / 1000) - 6 * 3600),
          ]);
        } catch (e) {
          console.error("[cron] cleanup error:", e?.message || e);
        }
      }
    })());
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeadersFor(request, env), ...SECURITY_HEADERS } });
    // Việc chạy nền không cần cron: mỗi request "ghé nhờ" một chút, có khoá chống chạy trùng.
    try { if (ctx && ctx.waitUntil && request.method === "GET") ctx.waitUntil(runDueJobs(env)); } catch {}
    try {
      // (47) Trang trạng thái công khai — HTML tự chứa, không cần đăng nhập
      if (p === "/status" || p === "/status/") {
        return new Response(statusHtml(await getStatusSummary(env)), {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=30", ...SECURITY_HEADERS },
        });
      }
      // API routes
      if (p.startsWith("/api/v1/") || p.startsWith("/api/")) {
        return await guardApiRes(request, await handleAPI(p.startsWith("/api/v1/") ? p.replace("/api/v1", "/api") : p, request, env, ctx));
      }
      // Auth API
      if (p.startsWith("/auth/")) return await guardApiRes(request, await handleAuth(p, request, env, ctx));
      // User API
      if (p.startsWith("/user/")) return await guardApiRes(request, await handleUser(p, request, env));
      // Admin API
      if (p.startsWith("/admin/")) return await guardApiRes(request, await handleAdmin(p, request, env, ctx));
      // WebSocket upgrade
      if (p === "/ws" && request.headers.get("Upgrade") === "websocket") {
        return handleWebSocket(request, env, ctx);
      }
      // ⛔ CHẶN RÒ PLAYLIST GỐC: mọi file .m3u/.m3u8 phục vụ như static asset
      // (VD /playlists/tv.m3u lọt vào dist/) = trao trọn bộ link stream thật cho
      // bất kỳ ai chỉ bằng 1 lệnh curl. Kênh phải đi qua /api/playlist (metadata)
      // + /api/stream/token (có JWT + kiểm tra gói).
      if (/\.(m3u8?|mpd)$/i.test(p) && !p.startsWith("/api/")) {
        if (wantsHtml(request)) return html404(request, 404);
        return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: jsonHeaders(request, env) });
      }
      // Static (frontend build) — phục vụ qua ASSETS binding để worker tự gắn security headers
      if (env && env.ASSETS) {
        const res = await env.ASSETS.fetch(request);
        const headers = new Headers(res.headers);
        Object.entries(SECURITY_HEADERS).forEach(([k, v]) => { if (!headers.has(k)) headers.set(k, v); });
        // Document của app cần frame-src theo allowlist đối tác (nếu admin đã khai
        // MOVIE_FRAME_SRC) — nếu không thì iframe player phim bị CSP chặn dù có nguồn.
        headers.set("Content-Security-Policy", cspFor(env));
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      }
      if (wantsHtml(request)) return html404(request, 404);
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: jsonHeaders(request, env) });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: jsonHeaders(request, env) });
    }
  }
};

// Trình duyệt mở tay (Accept text/html, không phải app fetch JSON) -> trả trang 404 HTML
function wantsHtml(request) {
  const a = (request.headers.get("Accept") || "").toLowerCase();
  return a.includes("text/html") && !a.includes("application/json");
}
// Bọc response API: ai mở API mà thiếu quyền/sai header (401/403/404) bằng trình duyệt -> trang 404
async function guardApiRes(request, res) {
  try {
    if (res && [401, 403, 404].includes(res.status) && wantsHtml(request)) {
      return html404(request, res.status);
    }
  } catch {}
  return res;
}
// Trang 404 thương hiệu CHRTV PLAY
function html404(request, status = 404) {
  const path = (() => { try { return new URL(request.url).pathname; } catch { return ""; } })();
  const esc = String(path || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
  const body = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>404 — CHRTV PLAY</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0c10;color:#e7e5e4;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:24px}
.card{max-width:520px;width:100%;text-align:center;background:#14151c;border:1px solid rgba(255,255,255,.08);border-radius:24px;padding:44px 32px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.logo{display:inline-flex;align-items:center;gap:8px;font-weight:900;letter-spacing:.2em;font-size:12px;color:#ff9a3d;margin-bottom:20px}
.code{font-size:96px;font-weight:900;line-height:1;background:linear-gradient(135deg,#f36f21,#fbbf24);-webkit-background-clip:text;background-clip:text;color:transparent}
h1{font-size:20px;margin:12px 0 8px}.path{font-family:monospace;font-size:12px;color:#a8a29e;background:#00000055;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px 12px;margin:12px 0;word-break:break-all}
p{font-size:13px;color:#a8a29e;line-height:1.7}.btns{display:flex;gap:10px;justify-content:center;margin-top:22px;flex-wrap:wrap}
a.btn{display:inline-block;padding:11px 22px;border-radius:14px;font-weight:800;font-size:14px;text-decoration:none}
a.primary{background:linear-gradient(135deg,#f36f21,#c2570f);color:#fff}a.ghost{background:rgba(255,255,255,.07);color:#e7e5e4;border:1px solid rgba(255,255,255,.1)}
small{display:block;margin-top:18px;font-size:11px;color:#57534e}
</style></head><body><div class="card">
<div class="logo">▶ CHRTV PLAY</div>
<div class="code">404</div>
<h1>Không tìm thấy trang này</h1>
${esc ? `<div class="path">${esc}</div>` : ""}
<p>Khu vực API chỉ dành cho ứng dụng CHRTV PLAY có xác thực.<br>Nếu bạn là người xem, hãy về trang chủ để tiếp tục giải trí nhé 🍿</p>
<div class="btns"><a class="btn primary" href="/">Về trang chủ</a><a class="btn ghost" href="/?tab=plans">Xem gói cước</a></div>
<small>support@ankb.qzz.io</small>
</div></body></html>`;
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...SECURITY_HEADERS } });
}

// ========== HELPERS ==========
// Pure JS SHA-256 (no crypto.subtle.digestSync in Workers)
function sha256(message) {
  const msgBuf = new TextEncoder().encode(message);
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const l = msgBuf.length;
  const bitLen = l * 8;
  const padLen = (l + 9 + 63) & ~63;
  const padded = new Uint8Array(padLen);
  padded.set(msgBuf);
  padded[l] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(padLen - 4, bitLen >>> 0, false);

  for (let off = 0; off < padLen; off += 64) {
    const W = new Array(64);
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = ((W[i-15]>>>7)|(W[i-15]<<25)) ^ ((W[i-15]>>>18)|(W[i-15]<<14)) ^ (W[i-15]>>>3);
      const s1 = ((W[i-2]>>>17)|(W[i-2]<<15)) ^ ((W[i-2]>>>19)|(W[i-2]<<13)) ^ (W[i-2]>>>10);
      W[i] = (W[i-16] + s0 + W[i-7] + s1) | 0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e>>>6)|(e<<26)) ^ ((e>>>11)|(e<<21)) ^ ((e>>>25)|(e<<7));
      const ch = (e&f) ^ (~e&g);
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
      const S0 = ((a>>>2)|(a<<30)) ^ ((a>>>13)|(a<<19)) ^ ((a>>>22)|(a<<10));
      const maj = (a&b) ^ (a&c) ^ (b&c);
      const t2 = (S0 + maj) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0;
    h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+h)|0;
  }
  return [h0,h1,h2,h3,h4,h5,h6,h7].map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}

function hashPassword(password, env) {
  return sha256(password + passwordSecret(env));
}

// Chữ ký JWT — DÙNG JWT_SECRET (tách hẳn khỏi hash mật khẩu để xoay secret
// chỉ thu hồi phiên đăng nhập, KHÔNG khoá mật khẩu của user).
function signToken(data, env) {
  return sha256(data + jwtSecret(env));
}

// So sánh chuỗi hằng thời gian (chống timing attack khi dò hash).
function safeEqual(a, b) {
  const x = String(a || ""), y = String(b || "");
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/**
 * Kiểm tra mật khẩu với MỌI lược đồ hash từng dùng trong lịch sử app:
 *   1. sha256(password + PASSWORD_PEPPER)  — chuẩn hiện tại
 *   2. sha256(password + <secret cũ>)      — sau khi xoay JWT_SECRET/pepper
 *   3. sha256(password)                    — tài khoản đời đầu (chưa có secret)
 * Trả về { ok, needsRehash } — needsRehash = true thì caller ghi lại hash chuẩn mới.
 */
function verifyPassword(password, storedHash, env) {
  const stored = String(storedHash || "");
  if (!stored) return { ok: false, needsRehash: false };
  try {
    if (safeEqual(stored, hashPassword(password, env))) return { ok: true, needsRehash: false };
  } catch { /* thiếu secret — thử tiếp các lược đồ cũ */ }
  for (const s of legacyPasswordSecrets(env)) {
    if (safeEqual(stored, sha256(password + s))) return { ok: true, needsRehash: true };
  }
  if (safeEqual(stored, sha256(password))) return { ok: true, needsRehash: true };
  return { ok: false, needsRehash: false };
}

function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// Sinh chuỗi số ngẫu nhiên bằng CSPRNG (đúng chuẩn cho mã verify — KHÔNG dùng Math.random)
function randomDigits(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = "";
  for (let i = 0; i < n; i++) out += String(bytes[i] % 10);
  return out;
}

function generateJWT(userId, env, extra) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    userId,
    iat: Date.now(),
    exp: Date.now() + (extra && extra.ttlMs ? extra.ttlMs : 30 * 24 * 3600 * 1000),
    ...(extra || {}),
  }));
  const sig = signToken(header + "." + payload, env);
  return `${header}.${payload}.${sig}`;
}

// Trả về payload JWT hợp lệ (hoặc null). userId = 0 => phiên khách (guest).
function verifyJWT(token, env) {
  try {
    const [header, payload, sig] = token.split(".");
    const expected = signToken(header + "." + payload, env);
    if (!safeEqual(sig, expected)) return null;
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}

// ========== 2FA TOTP (RFC 6238, Google Authenticator compatible) ==========
const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes) {
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  const clean = (str || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out = [];
  for (const c of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(c); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

function generateTOTPSecret() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

// Sinh mã TOTP 6 số tại bước thời gian hiện tại (+offset để kiểm tra window ±30s)
async function totpCode(secretB32, offset = 0) {
  try {
    const key = base32Decode(secretB32);
    if (key.length === 0) return "";
    const counter = Math.floor(Date.now() / 30000) + offset;
    const counterBuf = new ArrayBuffer(8);
    const dv = new DataView(counterBuf);
    dv.setUint32(0, Math.floor(counter / 0x100000000), false);
    dv.setUint32(4, counter >>> 0, false);
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBuf));
    const idx = sig[sig.length - 1] & 0xf;
    const code = (((sig[idx] & 0x7f) << 24) | (sig[idx + 1] << 16) | (sig[idx + 2] << 8) | sig[idx + 3]) % 1000000;
    return code.toString().padStart(6, "0");
  } catch { return ""; }
}

async function verifyTOTP(secretB32, code) {
  const target = String(code || "").trim();
  if (!secretB32 || !/^\d{6}$/.test(target)) return false;
  for (const off of [-1, 0, 1]) {
    if ((await totpCode(secretB32, off)) === target) return true;
  }
  return false;
}

// ========== AUDIT LOG (nhật ký thao tác admin) ==========
async function logAudit(env, userId, action, detail) {
  try {
    await env.DB.prepare("INSERT INTO audit_log (user_id, action, detail) VALUES (?, ?, ?)")
      .bind(userId || 0, action, typeof detail === "string" ? detail : JSON.stringify(detail || {})).run();
  } catch {}
}

// ========== WEB PUSH (VAPID, không payload — SW tự fetch nội dung) ==========
const b64urlFromBytes = (bytes) => {
  let s = "";
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlToBytes = (s) => {
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0;
  const raw = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const strToB64url = (str) => b64urlFromBytes(new TextEncoder().encode(str));

// Lấy (hoặc tự sinh lần đầu) cặp khoá VAPID — lưu trong D1 push_config, có thể override bằng env
async function getVapidKeys(env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK) {
    return { publicB64url: env.VAPID_PUBLIC_KEY, privateJwk: JSON.parse(env.VAPID_PRIVATE_JWK) };
  }
  if (hasDB(env)) {
    try {
      const { results } = await env.DB.prepare("SELECT key, value FROM push_config WHERE key IN ('vapid_public','vapid_private')").all();
      const pub = results.find(r => r.key === 'vapid_public')?.value;
      const priv = results.find(r => r.key === 'vapid_private')?.value;
      if (pub && priv) return { publicB64url: pub, privateJwk: JSON.parse(priv) };
    } catch {}
    try {
      const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
      // Public key dạng "uncompressed point" (0x04 || X || Y) base64url — thứ pushManager.subscribe cần
      const x = b64urlToBytes(privJwk.x), y = b64urlToBytes(privJwk.y);
      const raw = new Uint8Array(65);
      raw[0] = 0x04; raw.set(x, 1); raw.set(y, 33);
      const pubB64url = b64urlFromBytes(raw);
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO push_config (key, value) VALUES ('vapid_public', ?)").bind(pubB64url),
        env.DB.prepare("INSERT OR REPLACE INTO push_config (key, value) VALUES ('vapid_private', ?)").bind(JSON.stringify(privJwk)),
      ]);
      return { publicB64url: pubB64url, privateJwk: privJwk };
    } catch (e) {
      console.error("[push] keygen error:", e?.message || e);
    }
  }
  return null;
}

// Ký JWT ES256 cho header Authorization của Web Push protocol
async function vapidJWT(privateJwk, audience, subject) {
  const header = strToB64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = strToB64url(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

// Gửi 1 push (không payload — service worker nhận sự kiện rồi tự lấy nội dung mới nhất)
async function sendWebPush(sub, privateJwk) {
  try {
    const origin = new URL(sub.endpoint).origin;
    const jwt = await vapidJWT(privateJwk, origin, "mailto:admin@chrtv.app");
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: { TTL: "3600", Urgency: "normal", Authorization: `vapid t=${jwt}, k=${sub._vapidPublic || ""}` },
      body: null,
    });
    return res.status;
  } catch (e) {
    return 0;
  }
}

// Fan-out push tới toàn bộ subscription (gọi khi admin tạo thông báo mới)
async function pushNotifyAll(env) {
  if (!hasDB(env)) return;
  const keys = await getVapidKeys(env);
  if (!keys) return;
  try {
    const { results } = await env.DB.prepare("SELECT endpoint FROM push_subscriptions").all();
    if (!results || results.length === 0) return;
    await Promise.allSettled(results.map(async (r) => {
      const status = await sendWebPush({ endpoint: r.endpoint, _vapidPublic: keys.publicB64url }, keys.privateJwk);
      if (status === 404 || status === 410) {
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(r.endpoint).run();
      }
    }));
  } catch (e) {
    console.error("[push] fanout error:", e?.message || e);
  }
}

// ========== TMDB PROXY (giấu api_key + cache ở edge) ==========
const DEFAULT_TMDB_KEY = "c02e885e3955667731c6267bd30fa92d";

async function handleTMDBProxy(request, env) {
  const url = new URL(request.url);
  const tmdbPath = url.searchParams.get("path") || "";
  if (!tmdbPath.startsWith("/") || tmdbPath.includes("..") || !/^\/[a-zA-Z0-9_/.-]+$/.test(tmdbPath)) {
    return json({ error: "Invalid TMDB path" }, 400, request, env);
  }
  const params = new URLSearchParams(url.search);
  params.delete("path");
  params.set("api_key", env.TMDB_KEY || DEFAULT_TMDB_KEY);
  const cacheKey = tmdbPath + "?" + params.toString();

  // 1) Cache D1 (TTL theo loại endpoint: search 30 phút, trending 1h, chi tiết 6h)
  const ttlSec = tmdbPath.includes("/search/") ? 1800 : (tmdbPath.includes("/trending/") ? 3600 : 21600);
  if (hasDB(env)) {
    try {
      const { results } = await env.DB.prepare("SELECT data, expires_at FROM tmdb_cache WHERE key = ?").bind(cacheKey).all();
      if (results[0] && results[0].expires_at > Math.floor(Date.now() / 1000)) {
        return new Response(results[0].data, { headers: { ...corsHeadersFor(request, env), ...SECURITY_HEADERS, "Content-Type": "application/json", "X-Cache": "HIT" } });
      }
    } catch {}
  }

  // 2) Gọi TMDB server-side (giấu key khỏi client)
  try {
    const resp = await fetch(`https://api.themoviedb.org/3${tmdbPath}?${params.toString()}`, {
      headers: { "User-Agent": "CHRTV-OTT/2.0", accept: "application/json" },
    });
    const text = await resp.text();
    if (resp.ok && hasDB(env)) {
      try {
        await env.DB.prepare("INSERT OR REPLACE INTO tmdb_cache (key, data, expires_at) VALUES (?, ?, ?)")
          .bind(cacheKey, text, Math.floor(Date.now() / 1000) + ttlSec).run();
      } catch {}
    }
    return new Response(text, { status: resp.status, headers: { ...corsHeadersFor(request, env), ...SECURITY_HEADERS, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (e) {
    return json({ error: "TMDB fetch failed: " + (e?.message || e) }, 502, request, env);
  }
}

// ========== SPORTS PROXY (TheSportsDB + ESPN — cùng origin, tránh CSP/CORS chặn client) ==========
// Trình duyệt KHÔNG gọi thẳng thesportsdb.com được (không có CORS header) nên toàn
// bộ màn Thể thao (lịch/tỉ số/BXH/chi tiết đội) đi qua 2 endpoint này.
const TSDB_FILES = new Set([
  "eventsseason.php", "eventspastleague.php", "eventsnextleague.php",
  "search_all_seasons.php", "lookuptable.php", "all_leagues.php",
  "search_all_leagues.php", "searchevents.php", "eventslast.php", "eventsnext.php",
  "eventsday.php", "eventsround.php", "lookupteam.php", "lookup_all_teams.php",
  "searchteams.php", "searchplayers.php", "lookup_all_players.php", "lookupplayer.php",
  "lookupevent.php", "lookupeventstats.php", "lookuplineup.php", "lookuptimeline.php",
  "lookupleague.php", "lookupequipment.php", "lookupvenue.php",
]);
const ESPN_SOCCER_SLUGS = new Set([
  "aff.championship", "afc.u20", "afc.u20.championship", "afc.u20asiancup",
  "fifa.worldu20", "fifa.u20worldcup", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1",
  "uefa.champions", "uefa.europa", "vie.1", "fifa.worldq.afc",
]);

// Cache biên: dữ liệu thể thao đổi chậm (30–60s là đủ) — giảm mạnh CPU/subrequest
// của Worker (trước hay dính lỗi 1102 "exceeded resource limits" khi nhiều tab poll).
async function cachedUpstream(request, env, ctx, cacheKeyUrl, upstreamUrl, maxAge) {
  const cache = caches.default;
  const cacheKey = new Request(cacheKeyUrl, { method: "GET" });
  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const h = new Headers(hit.headers);
      h.set("X-CHRTV-Cache", "HIT");
      return new Response(hit.body, { status: hit.status, headers: h });
    }
  } catch { /* cache API không có (local dev) — bỏ qua */ }

  const resp = await fetch(upstreamUrl, {
    headers: { "User-Agent": "CHRTV-OTT/2.0", accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });
  const text = await resp.text();
  // Nguồn đôi khi trả HTML (Cloudflare challenge / bảo trì) — đừng cache rác.
  const looksJson = /^\s*[[{]/.test(text);
  const status = resp.ok && looksJson ? 200 : (resp.ok ? 502 : resp.status);
  const body = looksJson ? text : JSON.stringify({ error: "Upstream không trả JSON" });
  const out = new Response(body, {
    status,
    headers: {
      ...corsHeadersFor(request, env),
      ...SECURITY_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
    },
  });
  if (status === 200) {
    try {
      const store = out.clone();
      if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(cache.put(cacheKey, store));
      else await cache.put(cacheKey, store);
    } catch { /* bỏ qua */ }
  }
  return out;
}

async function handleSportsTsdb(request, env, ctx) {
  const url = new URL(request.url);
  const file = String(url.searchParams.get("file") || "").trim();
  if (!TSDB_FILES.has(file)) return json({ error: "Invalid sports file" }, 400, request, env);
  const params = new URLSearchParams();
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "file") continue;
    if (!/^[a-zA-Z0-9_]+$/.test(k)) continue;
    params.set(k, String(v).slice(0, 80));
  }
  const qs = params.toString();
  const upstream = `https://www.thesportsdb.com/api/v1/json/${tsdbKey(env)}/${file}?${qs}`;
  const ttl = /^(all_leagues|search_all_leagues|lookupteam|searchteams|lookupplayer|searchplayers|lookup_all_teams|lookup_all_players|lookupleague|lookupvenue)\.php$/.test(file) ? 21600 : 60;
  try {
    return await cachedUpstream(request, env, ctx, `https://tsdb.cache/${file}?${qs}`, upstream, ttl);
  } catch (e) {
    return json({ error: "Sports fetch failed" }, 502, request, env);
  }
}

// Key TheSportsDB: mặc định key test miễn phí "3"; đặt biến môi trường
// TSDB_KEY (Patreon key) nếu muốn hạn mức cao hơn.
function tsdbKey(env) {
  const k = String((env && env.TSDB_KEY) || "").trim();
  return /^[A-Za-z0-9]{1,20}$/.test(k) ? k : "3";
}

async function handleSportsEspn(request, env, ctx) {
  const url = new URL(request.url);
  const league = String(url.searchParams.get("league") || "").trim().toLowerCase();
  if (!ESPN_SOCCER_SLUGS.has(league)) return json({ error: "Invalid league" }, 400, request, env);
  const dates = String(url.searchParams.get("dates") || "").replace(/[^0-9-]/g, "").slice(0, 17);
  const qs = dates ? `?dates=${dates}` : "";
  const upstream = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/scoreboard${qs}`;
  try {
    return await cachedUpstream(request, env, ctx, `https://espn.cache/${league}${qs}`, upstream, 45);
  } catch (e) {
    return json({ error: "Sports fetch failed" }, 502, request, env);
  }
}

// ========== WEB PUSH API ==========
async function handlePush(path, request, env) {
  if (path === "/api/push/vapid-public" && request.method === "GET") {
    const keys = await getVapidKeys(env);
    if (!keys) return json({ error: "Push chưa khả dụng (cần D1)" }, 503, request, env);
    return json({ success: true, publicKey: keys.publicB64url }, 200, request, env);
  }
  await ensureSchema(env);
  const user = await getUser(request, env); // cho phép cả khách chưa đăng nhập (user_id = 0)

  if (path === "/api/push/subscribe" && request.method === "POST") {
    const { endpoint, keys } = await request.json().catch(() => ({}));
    if (!endpoint || !keys?.p256dh || !keys?.auth) return json({ error: "Thiếu subscription" }, 400, request, env);
    await env.DB.prepare("INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)")
      .bind(user?.id || 0, endpoint, keys.p256dh, keys.auth).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/api/push/unsubscribe" && request.method === "POST") {
    const { endpoint } = await request.json().catch(() => ({}));
    if (!endpoint) return json({ error: "Thiếu endpoint" }, 400, request, env);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
    return json({ success: true }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ========== EMAIL (Brevo / Sendinblue) ==========
// Gửi email qua Brevo API. Cấu hình biến môi trường:
//   BREVO_API_KEY       — API key lấy từ https://app.brevo.com/settings/keys/api
//   BREVO_SENDER_EMAIL  — email đã verify trong Brevo (vd: noreply@yourdomain.com)
//   BREVO_SENDER_NAME   — tên người gửi (mặc định "CHRTV")
async function sendBrevoEmail(env, { to, subject, html, text }) {
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL || "noreply@chrtv.app";
  const senderName = env.BREVO_SENDER_NAME || "NO REPLY - CHRTV PL▷Y";
  if (!apiKey) {
    console.warn("[Brevo] BREVO_API_KEY chưa cấu hình — bỏ qua gửi email");
    return { ok: false, reason: "no-api-key" };
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text || html.replace(/<[^>]+>/g, ""),
      }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, messageId: data.messageId };
    }
    const errText = await res.text();
    console.error("[Brevo] Gửi thất bại:", res.status, errText);
    return { ok: false, status: res.status, error: errText };
  } catch (e) {
    console.error("[Brevo] Lỗi mạng:", e.message);
    return { ok: false, error: e.message };
  }
}

function emailTemplateVerify(code) {
  return {
    subject: "CHRTV — Mã xác minh tài khoản",
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#0b0c10;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e7e5e4;">
<div style="max-width:560px;margin:24px auto;background:#17181d;border-radius:16px;border:1px solid #26272e;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#e11d48 0%,#9f1239 100%);padding:28px 32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:28px;letter-spacing:-.02em;">🎬 CHRTV</h1>
    <p style="color:#fecdd3;margin:6px 0 0;font-size:13px;">Xác minh tài khoản của bạn</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#a8a29e;">Chào bạn,</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#d6d3d1;">Cảm ơn bạn đã đăng ký CHRTV! Nhập mã 6 số dưới đây để kích hoạt tài khoản. Mã có hiệu lực trong <b>10 phút</b>.</p>
    <div style="background:#0f1014;border:2px dashed #e11d48;border-radius:12px;padding:20px;text-align:center;margin:24px 0;">
      <span style="font-size:36px;font-weight:800;letter-spacing:.25em;color:#e11d48;font-family:monospace;">${code}</span>
    </div>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#78716c;">Nếu bạn không yêu cầu đăng ký, vui lòng bỏ qua email này.</p>
    <p style="margin:0;font-size:13px;color:#78716c;">— Đội ngũ CHRTV</p>
  </div>
  <div style="padding:18px 32px;background:#0f1014;border-top:1px solid #26272e;text-align:center;font-size:11px;color:#57534e;">
    © CHRTV · Truyền hình &amp; phim trực tuyến
  </div>
</div>
</body></html>`,
  };
}

function emailTemplateReset(token) {
  return {
    subject: "CHRTV — Đặt lại mật khẩu",
    html: `<!doctype html><html><body style="margin:0;padding:0;background:#0b0c10;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e7e5e4;">
<div style="max-width:560px;margin:24px auto;background:#17181d;border-radius:16px;border:1px solid #26272e;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#e11d48 0%,#9f1239 100%);padding:28px 32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:28px;letter-spacing:-.02em;">🔐 CHRTV</h1>
    <p style="color:#fecdd3;margin:6px 0 0;font-size:13px;">Yêu cầu đặt lại mật khẩu</p>
  </div>
  <div style="padding:28px 32px;">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#a8a29e;">Chào bạn,</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#d6d3d1;">Ai đó (hy vọng là bạn) vừa yêu cầu đặt lại mật khẩu cho tài khoản CHRTV. Nhấn nút bên dưới trong vòng <b>30 phút</b> để đặt mật khẩu mới.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="https://play.ankb.qzz.io/?reset=${token}" style="display:inline-block;background:#e11d48;color:#fff;padding:14px 36px;border-radius:12px;text-decoration:none;font-weight:800;font-size:14px;letter-spacing:.02em;">Đặt lại mật khẩu</a>
    </div>
    <p style="margin:24px 0 8px;font-size:12px;line-height:1.6;color:#78716c;">Hoặc copy mã này vào app:</p>
    <div style="background:#0f1014;border:1px solid #26272e;border-radius:10px;padding:12px;text-align:center;">
      <span style="font-family:monospace;font-size:13px;color:#d6d3d1;word-break:break-all;">${token}</span>
    </div>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#78716c;">Nếu bạn không yêu cầu điều này, vui lòng bỏ qua email — mật khẩu của bạn vẫn an toàn.</p>
  </div>
  <div style="padding:18px 32px;background:#0f1014;border-top:1px solid #26272e;text-align:center;font-size:11px;color:#57534e;">
    © CHRTV · Truyền hình &amp; phim trực tuyến
  </div>
</div>
</body></html>`,
  };
}

// Kiểm tra phiên hợp lệ (JWT). Trả về:
//   { user: <row users>, guest: false }  — user thật
//   { user: null,      guest: true  }  — phiên khách (userId=0, plan standard)
//   null — chưa đăng nhập / JWT sai
async function getAuth(request, env) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const raw = auth.slice(7);
  const payload = verifyJWT(raw, env);
  if (!payload) return null;
  if (payload.userId === 0) return { user: null, guest: true, plan: "standard" };
  if (!hasDB(env)) return null;
  // PHIÊN PHẢI CÒN SỐNG: trước đây chỉ kiểm chữ ký JWT nên "đăng xuất thiết bị"
  // (và cả đổi mật khẩu / ban / logout) KHÔNG thật sự thu hồi được quyền truy cập —
  // token bị lộ vẫn dùng ngon tới 30 ngày. Nay đối chiếu bảng sessions.
  try {
    const { results: sess } = await env.DB.prepare("SELECT id, expires_at FROM sessions WHERE token = ?").bind(raw).all();
    const s = sess && sess[0];
    if (!s) return null;                       // đã bị thu hồi / đăng xuất
    if (s.expires_at && s.expires_at < Date.now()) {
      try { await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(s.id).run(); } catch {}
      return null;
    }
  } catch { /* bảng sessions lỗi -> không chặn đăng nhập, chữ ký JWT vẫn hợp lệ */ }
  try {
    try {
      const { results } = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified, banned, plan FROM users WHERE id = ?").bind(payload.userId).all();
      const row = results[0];
      if (!row) return null;
      if (row.banned) return null; // tài khoản bị khoá => coi như chưa đăng nhập
      let plan = row.plan || "standard";
      // Hết hạn gói trả phí/gift => rớt về standard (user_plans do payments/gifts ghi)
      try {
        const { results: pr } = await env.DB.prepare("SELECT plan, expires_at FROM user_plans WHERE user_id = ?").bind(row.id).all();
        if (pr && pr[0] && pr[0].expires_at && pr[0].expires_at < Math.floor(Date.now() / 1000)) {
          plan = "standard";
          try {
            await env.DB.prepare("UPDATE users SET plan = 'standard' WHERE id = ?").bind(row.id).run();
            await env.DB.prepare("UPDATE user_plans SET plan = 'standard' WHERE user_id = ?").bind(row.id).run();
          } catch {}
        } else if (pr && pr[0] && pr[0].plan) plan = pr[0].plan;
      } catch {}
      return { user: row, guest: false, plan };
    } catch {
      const { results: r2 } = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified FROM users WHERE id = ?").bind(payload.userId).all();
      const row = r2[0];
      if (!row) return null;
      return { user: row, guest: false, plan: "standard" };
    }
  } catch { return null; }
}

// Giữ tên hàm cũ cho các caller không cần phân biệt guest
async function getUser(request, env) {
  const a = await getAuth(request, env);
  return a ? a.user : null;
}

function json(data, status = 200, request = null, env = null) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders(request, env) });
}

// ========== DATABASE BOOTSTRAP ==========
// Worker tự tạo bảng nếu D1 còn trống => chỉ cần bind D1 tên "DB" là chạy được,
// không bắt buộc phải chạy tay `wrangler d1 execute ... --file=./schema.sql`.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, avatar_url TEXT DEFAULT '', display_name TEXT DEFAULT '', role TEXT DEFAULT 'user', email_verified INTEGER DEFAULT 0, verify_code TEXT DEFAULT '', verify_expires INTEGER DEFAULT 0, reset_token TEXT DEFAULT '', reset_expires INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, user_agent TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER DEFAULT 0, channel_id TEXT DEFAULT '', message TEXT NOT NULL, client_info TEXT DEFAULT '', status TEXT DEFAULT 'new', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS shorts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT DEFAULT '', caption TEXT DEFAULT '', video_url TEXT NOT NULL, thumb_url TEXT DEFAULT '', duration INTEGER DEFAULT 0, author TEXT DEFAULT '', views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, status TEXT DEFAULT 'live', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS qr_logins (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, user_id INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', device_info TEXT DEFAULT '', created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sports_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, league TEXT DEFAULT '', thumb_url TEXT DEFAULT '', video_url TEXT NOT NULL, duration TEXT DEFAULT '', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, subtitle TEXT DEFAULT '', image_url TEXT DEFAULT '', link_type TEXT DEFAULT 'none', link_value TEXT DEFAULT '', starts_at TEXT DEFAULT '', ends_at TEXT DEFAULT '', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS plans (code TEXT PRIMARY KEY, name TEXT NOT NULL, rank INTEGER DEFAULT 1, price INTEGER DEFAULT 0, price_text TEXT DEFAULT '', tagline TEXT DEFAULT '', allows TEXT DEFAULT '[]', color TEXT DEFAULT '#f36f21', is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,  
  `CREATE TABLE IF NOT EXISTS user_settings (user_id INTEGER PRIMARY KEY, theme TEXT DEFAULT 'dark', default_quality TEXT DEFAULT 'auto', buffer_goal INTEGER DEFAULT 10, language TEXT DEFAULT 'vi', parental_pin TEXT DEFAULT '', parental_enabled INTEGER DEFAULT 0, settings_json TEXT DEFAULT '{}', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS user_favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, channel_id TEXT NOT NULL, sort_order INTEGER DEFAULT 0, group_name TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, channel_id))`,
  `CREATE TABLE IF NOT EXISTS watch_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, channel_id TEXT NOT NULL, last_position INTEGER DEFAULT 0, watch_count INTEGER DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, channel_id))`,
  `CREATE TABLE IF NOT EXISTS channels (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, logo TEXT DEFAULT '', group_title TEXT DEFAULT '', stream_url TEXT NOT NULL, catchup_type TEXT DEFAULT 'append', catchup_days INTEGER DEFAULT 7, is_active INTEGER DEFAULT 1, user_agent TEXT DEFAULT '', referer TEXT DEFAULT '', manifest_type TEXT DEFAULT '', license_type TEXT DEFAULT '', clear_key_id TEXT DEFAULT '', clear_key TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS channel_ratings (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, user_id INTEGER NOT NULL, rating INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(channel_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, type TEXT DEFAULT 'info', channel_id TEXT DEFAULT '', url TEXT DEFAULT '', is_read INTEGER DEFAULT 0, target TEXT DEFAULT 'all', created_by INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS analytics (id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, user_id INTEGER DEFAULT 0, channel_id TEXT DEFAULT '', data TEXT DEFAULT '{}', ip TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS program_reminders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, channel_id TEXT NOT NULL, program_title TEXT NOT NULL, remind_at DATETIME NOT NULL, is_sent INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS epg_cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS epg_overrides (channel_id TEXT PRIMARY KEY, channel_name TEXT DEFAULT '', programmes TEXT NOT NULL, updated_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS m3u_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS broadcasts (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL, type TEXT DEFAULT 'info', is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, expires_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS user_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, avatar_url TEXT DEFAULT '', is_child INTEGER DEFAULT 0, pin_hash TEXT DEFAULT '', active INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, login TEXT NOT NULL, ip TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(login, created_at)`,
  `CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER DEFAULT 0, action TEXT NOT NULL, detail TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS movie_watchlist (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, media_type TEXT DEFAULT 'movie', tmdb_id INTEGER NOT NULL, title TEXT DEFAULT '', poster_path TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, media_type, tmdb_id))`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER DEFAULT 0, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT DEFAULT '', auth TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS push_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tmdb_cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER DEFAULT 0, window_start INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS stream_credentials (channel_id TEXT PRIMARY KEY, upstream_token TEXT NOT NULL, updated_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS party_rooms (room TEXT PRIMARY KEY, channel_id TEXT DEFAULT '', channel_name TEXT DEFAULT '', updated_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS party_members (room TEXT NOT NULL, name TEXT NOT NULL, last_seen INTEGER DEFAULT 0, PRIMARY KEY(room, name))`,
  `CREATE TABLE IF NOT EXISTS party_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, from_name TEXT DEFAULT '', kind TEXT DEFAULT 'chat', text TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_party_messages ON party_messages(room, id)`,
  `CREATE INDEX IF NOT EXISTS idx_watch_history_user ON watch_history(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target)`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics(event, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_program_reminders_user ON program_reminders(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)`,
  `CREATE TABLE IF NOT EXISTS watch_counters (channel_id TEXT PRIMARY KEY, views INTEGER DEFAULT 0, seconds INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS presence (sid TEXT PRIMARY KEY, user_id INTEGER DEFAULT 0, name TEXT DEFAULT '', kind TEXT DEFAULT '', ref_id TEXT DEFAULT '', ref_name TEXT DEFAULT '', updated_at INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_presence_upd ON presence(updated_at)`,
  `CREATE TABLE IF NOT EXISTS user_xp (user_id INTEGER PRIMARY KEY, xp INTEGER DEFAULT 0, watch_sec INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS public_profiles (user_id INTEGER PRIMARY KEY, handle TEXT UNIQUE, bio TEXT DEFAULT '', avatar_url TEXT DEFAULT '', is_public INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT NOT NULL, user_id INTEGER NOT NULL, name TEXT DEFAULT '', body TEXT NOT NULL, status TEXT DEFAULT 'visible', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target, status, id)`,
  `CREATE TABLE IF NOT EXISTS fan_groups (id INTEGER PRIMARY KEY AUTOINCREMENT, target TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_by INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS fan_members (group_id INTEGER NOT NULL, user_id INTEGER NOT NULL, name TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(group_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS gift_codes (code TEXT PRIMARY KEY, plan TEXT DEFAULT 'signature', days INTEGER DEFAULT 30, max_uses INTEGER DEFAULT 1, used INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1, note TEXT DEFAULT '', created_by INTEGER DEFAULT 0, to_username TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS gift_redemptions (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS user_plans (user_id INTEGER PRIMARY KEY, plan TEXT DEFAULT 'standard', expires_at INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT DEFAULT '', plan TEXT NOT NULL, amount INTEGER DEFAULT 0, order_code TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'pending', payload TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, paid_at DATETIME DEFAULT NULL)`,
  `CREATE TABLE IF NOT EXISTS payment_config (id INTEGER PRIMARY KEY CHECK (id = 1), bank_id TEXT DEFAULT '', account_no TEXT DEFAULT '', account_name TEXT DEFAULT '', template TEXT DEFAULT 'compact2', sepay_token TEXT DEFAULT '', note TEXT DEFAULT '')`,
  `CREATE TABLE IF NOT EXISTS ads (id INTEGER PRIMARY KEY AUTOINCREMENT, slot TEXT DEFAULT 'banner', title TEXT DEFAULT '', image_url TEXT DEFAULT '', link_url TEXT DEFAULT '', video_url TEXT DEFAULT '', starts_at TEXT DEFAULT '', ends_at TEXT DEFAULT '', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  // Nguồn phát cho mục Phim/TV show — do admin điền, CHỈ dùng được nguồn mà domain
  // của nó có trong MOVIE_FRAME_SRC (allowlist CSP). url_template là URL nhúng, các
  // chỗ trống được server thay: {tmdb} {type}=movie|tv {season} {episode}.
  // `kind`: embed = nhúng iframe player đối tác; hls = link .m3u8 trực tiếp (app tự phát, không iframe).
  // `license_note` bắt buộc về mặt quy trình: ghi nguồn nào cấp bản quyền cho mình.
  `CREATE TABLE IF NOT EXISTS movie_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT DEFAULT 'embed', url_template TEXT NOT NULL, license_note TEXT DEFAULT '', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS scheduled_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT DEFAULT '', body TEXT DEFAULT '', link_type TEXT DEFAULT 'none', link_value TEXT DEFAULT '', image_url TEXT DEFAULT '', publish_at TEXT NOT NULL, is_done INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS predictions (user_id INTEGER NOT NULL, event_key TEXT NOT NULL, league TEXT DEFAULT '', home TEXT DEFAULT '', away TEXT DEFAULT '', ph INTEGER DEFAULT 0, pa INTEGER DEFAULT 0, points INTEGER DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, event_key))`,
  `CREATE INDEX IF NOT EXISTS idx_predictions_key ON predictions(event_key)`,
  `CREATE TABLE IF NOT EXISTS short_creator_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, handle TEXT UNIQUE NOT NULL, display_name TEXT DEFAULT '', avatar_url TEXT DEFAULT '', bio TEXT DEFAULT '', verified INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS short_follows (id INTEGER PRIMARY KEY AUTOINCREMENT, follower_user_id INTEGER NOT NULL, creator_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(follower_user_id, creator_id))`,
  // LƯU Ý: index trên shorts(creator_id) KHÔNG đặt ở đây — cột creator_id do bước
  // MIGRATION (ALTER TABLE) bên dưới thêm vào, nên nếu để trong batch này thì trên DB
  // MỚI câu lệnh fail → CẢ BATCH rollback → không có bảng users/sessions → không
  // đăng ký/đăng nhập được. Index được tạo sau phần ALTER.
  `CREATE INDEX IF NOT EXISTS idx_short_follows_creator ON short_follows(creator_id)`,
  `CREATE INDEX IF NOT EXISTS idx_short_follows_follower ON short_follows(follower_user_id)`,
  // ---- ĐỢT 1: báo kênh lỗi (20) · log lỗi player (49) · sức khoẻ kênh (46) · đang hot (3) ----
  `CREATE TABLE IF NOT EXISTS channel_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, channel_name TEXT DEFAULT '', user_id INTEGER DEFAULT 0, code TEXT DEFAULT 'other', note TEXT DEFAULT '', ua TEXT DEFAULT '', status TEXT DEFAULT 'open', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_channel_reports ON channel_reports(channel_id, status)`,
  `CREATE TABLE IF NOT EXISTS player_errors (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT DEFAULT '', channel_name TEXT DEFAULT '', engine TEXT DEFAULT '', code TEXT DEFAULT '', detail TEXT DEFAULT '', fatal INTEGER DEFAULT 0, platform TEXT DEFAULT '', user_id INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_player_errors ON player_errors(channel_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS channel_health (channel_id TEXT PRIMARY KEY, status TEXT DEFAULT 'unknown', http_code INTEGER DEFAULT 0, latency_ms INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, ok_at INTEGER DEFAULT 0, checked_at INTEGER DEFAULT 0, note TEXT DEFAULT '')`,
  `CREATE INDEX IF NOT EXISTS idx_channel_health_checked ON channel_health(checked_at)`,
  `CREATE TABLE IF NOT EXISTS watch_pulse (channel_id TEXT NOT NULL, bucket INTEGER NOT NULL, seconds INTEGER DEFAULT 0, views INTEGER DEFAULT 0, PRIMARY KEY(channel_id, bucket))`,
  `CREATE INDEX IF NOT EXISTS idx_watch_pulse_bucket ON watch_pulse(bucket)`,
  // Bộ chạy nền KHÔNG dùng cron (Workers Free đã hết 5 trigger): mỗi request có thể
  // "nhận việc" nếu tới hạn — xem runDueJobs().
  `CREATE TABLE IF NOT EXISTS jobs (name TEXT PRIMARY KEY, last_run INTEGER DEFAULT 0, running_until INTEGER DEFAULT 0, cursor TEXT DEFAULT '', last_result TEXT DEFAULT '')`,
  // ---- Quảng cáo pre-roll (34) + xem thử 5 phút cho gói Standard ----
  `CREATE TABLE IF NOT EXISTS ad_views (id INTEGER PRIMARY KEY AUTOINCREMENT, user_key TEXT NOT NULL, ad_id INTEGER DEFAULT 0, kind TEXT DEFAULT 'channel', ref_id TEXT DEFAULT '', plan TEXT DEFAULT '', completed INTEGER DEFAULT 0, created_at INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_ad_views_key ON ad_views(user_key, created_at)`,
  `CREATE TABLE IF NOT EXISTS preview_usage (user_key TEXT PRIMARY KEY, window_start INTEGER DEFAULT 0, seconds INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0)`,
  // ---- ĐỢT 48 TÍNH NĂNG MỚI (share codes / progress / follow / stars / alert / region / ...) ----
  `CREATE TABLE IF NOT EXISTS movie_share_codes (code TEXT PRIMARY KEY, kind TEXT DEFAULT 'movie', media_type TEXT DEFAULT 'movie', tmdb_id INTEGER DEFAULT 0, season INTEGER DEFAULT 0, episode INTEGER DEFAULT 0, payload TEXT DEFAULT '', created_by INTEGER DEFAULT 0, created_by_name TEXT DEFAULT '', used INTEGER DEFAULT 0, expires_at INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE INDEX IF NOT EXISTS idx_movie_share_codes_exp ON movie_share_codes(expires_at)`,
  `CREATE TABLE IF NOT EXISTS movie_progress (user_id INTEGER NOT NULL, media_type TEXT DEFAULT 'movie', tmdb_id INTEGER NOT NULL, season INTEGER DEFAULT 0, episode INTEGER DEFAULT 0, position_sec REAL DEFAULT 0, duration_sec REAL DEFAULT 0, percent REAL DEFAULT 0, title TEXT DEFAULT '', poster_path TEXT DEFAULT '', updated_at INTEGER DEFAULT 0, PRIMARY KEY (user_id, media_type, tmdb_id, season, episode))`,
  `CREATE TABLE IF NOT EXISTS resume_codes (code TEXT PRIMARY KEY, user_id INTEGER NOT NULL, payload TEXT DEFAULT '', expires_at INTEGER DEFAULT 0, used INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS series_follows (user_id INTEGER NOT NULL, tmdb_id INTEGER NOT NULL, season INTEGER DEFAULT 0, episode INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0, PRIMARY KEY (user_id, tmdb_id))`,
  `CREATE TABLE IF NOT EXISTS creator_stars (id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id INTEGER NOT NULL, user_id INTEGER DEFAULT 0, stars INTEGER DEFAULT 1, created_at INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS idx_creator_stars_c ON creator_stars(creator_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS challenges (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, hashtag TEXT DEFAULT '', description TEXT DEFAULT '', starts_at TEXT DEFAULT '', ends_at TEXT DEFAULT '', is_active INTEGER DEFAULT 1, created_by INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS watch_cc (channel_id TEXT NOT NULL, country TEXT NOT NULL, bucket INTEGER NOT NULL, seconds INTEGER DEFAULT 0, views INTEGER DEFAULT 0, PRIMARY KEY (channel_id, country, bucket))`,
  `CREATE TABLE IF NOT EXISTS user_watch (user_id INTEGER NOT NULL, kind TEXT NOT NULL, ref_id TEXT NOT NULL, ref_name TEXT DEFAULT '', sec INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0, PRIMARY KEY (user_id, kind, ref_id))`,
  `CREATE TABLE IF NOT EXISTS admin_alert_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, metric TEXT DEFAULT '', op TEXT DEFAULT 'gt', threshold REAL DEFAULT 0, enabled INTEGER DEFAULT 1, cooldown_s INTEGER DEFAULT 3600, last_fired_at INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS admin_alert_feed (id INTEGER PRIMARY KEY AUTOINCREMENT, rule_id INTEGER DEFAULT 0, level TEXT DEFAULT 'warn', message TEXT NOT NULL, data TEXT DEFAULT '', ack INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS trending_searches (query TEXT PRIMARY KEY, cnt INTEGER DEFAULT 1, last_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS party_polls (id INTEGER PRIMARY KEY AUTOINCREMENT, room TEXT NOT NULL, question TEXT NOT NULL, options TEXT DEFAULT '[]', votes TEXT DEFAULT '[]', voters TEXT DEFAULT '[]', created_by INTEGER DEFAULT 0, ends_at INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS movie_wishlists (user_id INTEGER NOT NULL, tmdb_id INTEGER NOT NULL, media_type TEXT DEFAULT 'movie', notified_at INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, tmdb_id))`,
  `CREATE TABLE IF NOT EXISTS actor_follows (user_id INTEGER NOT NULL, person_id INTEGER NOT NULL, name TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, person_id))`,
  `CREATE INDEX IF NOT EXISTS idx_admin_alert_feed ON admin_alert_feed(ack, id)`,
  `CREATE TABLE IF NOT EXISTS affiliates (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT DEFAULT 'cinema', url_template TEXT DEFAULT '', label TEXT DEFAULT '', enabled INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS user_quiz (user_id INTEGER PRIMARY KEY, answers_json TEXT DEFAULT '{}', done INTEGER DEFAULT 0, updated_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS team_follows (user_id INTEGER NOT NULL, team_name TEXT NOT NULL, updated_at INTEGER DEFAULT 0, PRIMARY KEY (user_id, team_name))`,
  // ---- LOGO / WATERMARK khi phát (xem LOGO_WATERMARK.md) ----
  // site_config: bảng key/value chung cho cấu hình của hệ thống (hiện dùng cho watermark).
  //   key "watermark"      -> JSON cấu hình mặc định toàn hệ thống
  //   key "watermark_logo" -> nội dung SVG đã sanitize (logo overlay), rỗng = dùng file gốc /watermark.svg
  // channel_watermark: tuỳ chỉnh theo TỪNG KÊNH, để riêng 1 bảng (giống channel_health)
  //   vì writeChannels() DELETE + INSERT lại bảng channels mỗi lần nạp M3U — để cột wm
  //   trong channels thì mọi tuỳ chỉnh của admin sẽ bay theo đợt refresh.
  `CREATE TABLE IF NOT EXISTS site_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS channel_watermark (channel_id TEXT PRIMARY KEY, wm TEXT NOT NULL, updated_at INTEGER DEFAULT 0)`,
  // ---- CHỦ ĐỀ TRANG TRÍ THEO SỰ KIỆN (VD: FIFA ASEAN Cup) ----
  // Admin tạo chủ đề (màu, banner, hiệu ứng) + kích hoạt → site-wide auto apply.
  `CREATE TABLE IF NOT EXISTS site_themes (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL, emoji TEXT DEFAULT '', description TEXT DEFAULT '', primary_color TEXT DEFAULT '#f36f21', secondary_color TEXT DEFAULT '#1a1c24', accent_color TEXT DEFAULT '#ffb37a', background_url TEXT DEFAULT '', banner_url TEXT DEFAULT '', logo_url TEXT DEFAULT '', confetti TEXT DEFAULT 'none', css TEXT DEFAULT '', is_active INTEGER DEFAULT 0, starts_at TEXT DEFAULT '', ends_at TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_by INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
];

let schemaReady = false;
let schemaFailedAt = 0; // mốc lần chạy schema thất bại gần nhất (xem backoff ở ensureSchema)

function hasDB(env) {
  return !!(env && env.DB && typeof env.DB.prepare === "function");
}

async function ensureSchema(env) {
  if (!hasDB(env)) return false;
  if (schemaReady) return true;
  // D1 đang lỗi/mất kết nối mà retry_every_request = mỗi request gánh thêm ~130 câu SQL.
  // Thất bại thì nghỉ 30s rồi mới thử lại (isolate sẽ tự hồi phục khi D1 sehat).
  if (schemaFailedAt && Date.now() - schemaFailedAt < 30000) return false;
  try {
    if (typeof env.DB.batch === "function") {
      try {
        await env.DB.batch(SCHEMA_STATEMENTS.map((sql) => env.DB.prepare(sql)));
      } catch (e) {
        // Batch của D1 là all-or-nothing: 1 câu lỗi là mất hết bảng.
        // Chạy lại từng câu để lỗi cục bộ không kéo sập toàn bộ schema.
        console.error("ensureSchema batch failed, fallback từng câu:", e?.message || e);
        for (const sql of SCHEMA_STATEMENTS) {
          try { await env.DB.prepare(sql).run(); } catch (err) { console.error("schema stmt lỗi:", err?.message || err); }
        }
      }
    } else {
      for (const sql of SCHEMA_STATEMENTS) {
        try { await env.DB.prepare(sql).run(); } catch (err) { console.error("schema stmt lỗi:", err?.message || err); }
      }
    }
    // MIGRATION: bảng channels cũ → tự thêm cột mới (is_active, UA, DRM...).
    // Nếu cột đã tồn tại, lệnh này fail và bị bỏ qua — không sao.
    for (const stmt of [
      "ALTER TABLE channels ADD COLUMN is_active INTEGER DEFAULT 1",
      "ALTER TABLE sessions ADD COLUMN user_agent TEXT DEFAULT ''",
      "ALTER TABLE channels ADD COLUMN user_agent TEXT DEFAULT ''",
      "ALTER TABLE channels ADD COLUMN referer TEXT DEFAULT ''",
      "ALTER TABLE channels ADD COLUMN manifest_type TEXT DEFAULT ''",
      "ALTER TABLE channels ADD COLUMN license_type TEXT DEFAULT ''",
      "ALTER TABLE channels ADD COLUMN clear_key_id TEXT DEFAULT ''",
      "ALTER TABLE channels ADD COLUMN clear_key TEXT DEFAULT ''",
    ]) {
      try { await env.DB.prepare(stmt).run(); } catch (e) { /* cột đã có — bỏ qua */ }
    }
    // MIGRATION: users — banned (khoá tài khoản), totp (2FA)
    for (const stmt of [
      "ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0",
      "ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT ''",
      "ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0",
      "ALTER TABLE users ADD COLUMN plan TEXT DEFAULT ''",
    ]) {
      try { await env.DB.prepare(stmt).run(); } catch (e) { /* cột đã có — bỏ qua */ }
    }
    // MIGRATION: gift_codes — tính năng TẶNG GÓI CHO BẠN (user -> user):
    // created_by = người tặng, to_username = tên đăng nhập người nhận (rỗng = ai có mã cũng dùng được)
    for (const stmt of [
      "ALTER TABLE gift_codes ADD COLUMN created_by INTEGER DEFAULT 0",
      "ALTER TABLE gift_codes ADD COLUMN to_username TEXT DEFAULT ''",
      "CREATE INDEX IF NOT EXISTS idx_gift_codes_creator ON gift_codes(created_by)",
    ]) {
      try { await env.DB.prepare(stmt).run(); } catch (e) { /* cột đã có — bỏ qua */ }
    }
    // MIGRATION: shorts -> creator profile + user_id
    for (const stmt of [
      "ALTER TABLE shorts ADD COLUMN user_id INTEGER DEFAULT 0",
      "ALTER TABLE shorts ADD COLUMN creator_id INTEGER DEFAULT 0",
      "CREATE TABLE IF NOT EXISTS short_creator_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, handle TEXT UNIQUE NOT NULL, display_name TEXT DEFAULT '', avatar_url TEXT DEFAULT '', bio TEXT DEFAULT '', verified INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
      "CREATE TABLE IF NOT EXISTS short_follows (id INTEGER PRIMARY KEY AUTOINCREMENT, follower_user_id INTEGER NOT NULL, creator_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(follower_user_id, creator_id))",
      // Index này phải chạy SAU ALTER TABLE shorts ADD COLUMN creator_id
      "CREATE INDEX IF NOT EXISTS idx_shorts_creator ON shorts(creator_id)",
    ]) {
      try { await env.DB.prepare(stmt).run(); } catch (e) { /* đã có — bỏ qua */ }
    }
    // MIGRATION: ĐỢT 48 — comments ghim/phút/voice · kênh vùng chặn/tài trợ/bảo trì ·
    // ads/events/movie_sources vùng chặn · shorts hashtag · sessions ip · lịch đăng hết hạn
    for (const stmt of [
      "ALTER TABLE comments ADD COLUMN tstamp INTEGER DEFAULT -1",
      "ALTER TABLE comments ADD COLUMN voice_url TEXT DEFAULT ''",
      "ALTER TABLE comments ADD COLUMN kind TEXT DEFAULT 'comment'",
      "ALTER TABLE comments ADD COLUMN pinned INTEGER DEFAULT 0",
      "ALTER TABLE channels ADD COLUMN blocked_regions TEXT DEFAULT ''",
      "ALTER TABLE channels ADD COLUMN is_sponsored INTEGER DEFAULT 0",
      "ALTER TABLE events ADD COLUMN blocked_regions TEXT DEFAULT ''",
      "ALTER TABLE ads ADD COLUMN blocked_regions TEXT DEFAULT ''",
      "ALTER TABLE movie_sources ADD COLUMN blocked_regions TEXT DEFAULT ''",
      "ALTER TABLE movie_sources ADD COLUMN label TEXT DEFAULT ''",
      "ALTER TABLE shorts ADD COLUMN hashtags TEXT DEFAULT ''",
      "ALTER TABLE channel_health ADD COLUMN maintenance_until INTEGER DEFAULT 0",
      "ALTER TABLE sessions ADD COLUMN ip TEXT DEFAULT ''",
      "ALTER TABLE scheduled_posts ADD COLUMN end_at TEXT DEFAULT ''",
      "ALTER TABLE scheduled_posts ADD COLUMN is_active INTEGER DEFAULT 1",
    ]) {
      try { await env.DB.prepare(stmt).run(); } catch (e) { /* cột đã có — bỏ qua */ }
    }
    // Seed gói mặc định (admin sửa/thêm sau trong Admin → Gói cước)
    try {
      await env.DB.prepare("INSERT OR IGNORE INTO plans (code, name, rank, price, price_text, tagline, allows, color) VALUES ('standard', 'STANDARD', 1, 0, 'TẠM FREE', 'Các kênh VTV', ?, '#42a5f5')").bind(JSON.stringify(["Các kênh VTV (VTV1, VTV2, VTV3...)", "Shorts xem miễn phí mọi gói"])).run();
      await env.DB.prepare("INSERT OR IGNORE INTO plans (code, name, rank, price, price_text, tagline, allows, color) VALUES ('recreational', 'RECREATIONAL', 2, 0, 'TẠM FREE', 'VTV + BOX Giải trí', ?, '#ab47bc')").bind(JSON.stringify(["Toàn bộ gói Standard", "38 kênh BOX - Giải trí"])).run();
      await env.DB.prepare("INSERT OR IGNORE INTO plans (code, name, rank, price, price_text, tagline, allows, color) VALUES ('ultimate', 'ULTIMATE', 3, 0, 'TẠM FREE', 'VTV + BOX + Thể thao', ?, '#22c55e')").bind(JSON.stringify(["Toàn bộ gói Recreational", "19 kênh SPORTS - Thể thao"])).run();
      await env.DB.prepare("INSERT OR IGNORE INTO plans (code, name, rank, price, price_text, tagline, allows, color) VALUES ('elite', 'ELITE', 4, 0, 'TẠM FREE', 'Thêm kênh Phim', ?, '#f59e0b')").bind(JSON.stringify(["Toàn bộ gói Ultimate", "Các kênh Phim (phim / movie)"])).run();
      await env.DB.prepare("INSERT OR IGNORE INTO plans (code, name, rank, price, price_text, tagline, allows, color) VALUES ('signature', 'SIGNATURE', 5, 0, 'TẠM FREE', 'Tất cả mọi kênh', ?, '#f36f21')").bind(JSON.stringify(["Toàn bộ gói Elite", "Mọi kênh hiện tại & tương lai", "Ưu tiên hỗ trợ 24/7"])).run();
      // MIGRATION gói 3 -> 5: cập nhật gói cũ, tắt vip, chuyển user vip -> signature
      try {
        await env.DB.prepare("UPDATE plans SET name='STANDARD', rank=1, tagline='Các kênh VTV', color='#42a5f5', allows=? WHERE code='standard'").bind(JSON.stringify(["Các kênh VTV (VTV1, VTV2, VTV3...)", "Shorts xem miễn phí mọi gói"])).run();
        await env.DB.prepare("UPDATE plans SET name='RECREATIONAL', rank=2, tagline='VTV + BOX Giải trí', color='#ab47bc', allows=? WHERE code='recreational'").bind(JSON.stringify(["Toàn bộ gói Standard", "38 kênh BOX - Giải trí"])).run();
        await env.DB.prepare("UPDATE plans SET is_active=0 WHERE code='vip'").run();
        await env.DB.prepare("UPDATE users SET plan='signature' WHERE plan='vip'").run();
        await env.DB.prepare("UPDATE gift_codes SET plan='signature' WHERE plan='vip'").run();
      } catch (e) { /* DB mới — bỏ qua */ }
      try {
        const { results: evCount } = await env.DB.prepare("SELECT COUNT(*) AS c FROM events").all();
        if (!evCount?.[0]?.c) {
          await env.DB.prepare("INSERT INTO events (title, subtitle, image_url, link_type, link_value, sort_order) VALUES (?, ?, ?, 'tab', 'movies', 0)").bind("🎬 Kho phim bom tấn", "Hàng nghìn phim & TV show — xem miễn phí", "").run();
          await env.DB.prepare("INSERT INTO events (title, subtitle, image_url, link_type, link_value, sort_order) VALUES (?, ?, ?, 'tab', 'plans', 1)").bind("💎 Khuyến mãi ra mắt", "Kích hoạt mọi gói cước MIỄN PHÍ trong thời gian ưu đãi", "").run();
        }
      } catch {}
    } catch {}
    schemaReady = true;
    schemaFailedAt = 0;
    return true;
  } catch (e) {
    console.error("ensureSchema error:", e?.message || e);
    schemaFailedAt = Date.now();
    return false;
  }
}

// Trả lỗi rõ ràng (503) thay vì 500 khó hiểu khi Worker chưa được bind D1.
function dbUnavailable() {
  return json({
    error: "Máy chủ chưa bật cơ sở dữ liệu D1 nên chưa dùng được tài khoản. Vào Cloudflare Dashboard → Workers → chrtv-backend → Settings → Bindings → thêm D1 binding tên 'DB' (hoặc bỏ comment [[d1_databases]] trong wrangler.toml) rồi deploy lại.",
    code: "NO_DB",
  }, 503);
}

// ========== API ROUTER ==========
async function handleAPI(path, request, env, ctx) {
  // Geo theo IP (Cloudflare tự gắn request.cf) — client dùng để đổi poster phim theo quốc gia.
  // Không cần DB — trả trước để luôn hoạt động.
  if (path === "/api/geo") {
    const cf = request.cf || {};
    return json({
      country: (cf.country || "").toString().toUpperCase(),
      city: cf.city || "",
      region: cf.region || "",
      timezone: cf.timezone || "",
      source: "cloudflare",
    }, 200, request, env);
  }
  if (path === "/api/playlist") return await handlePlaylist(env, request);
  if (path === "/api/epg") {
    // P0-B: EPG yêu cầu phiên hợp lệ (JWT user hoặc guest) — không còn hoàn toàn công khai
    const a = await getAuth(request, env);
    if (!a) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    return await handleEPG(env, request);
  }
  // Logo watermark khi phát (cấu hình chung + file logo admin upload) — LOGO_WATERMARK.md
  if (path === "/api/watermark") return await handleWatermarkPublic(request, env);
  if (path === "/api/watermark/logo") return await handleWatermarkLogo(request, env);
  if (path === "/api/proxy") return await handleProxy(request, env);
  if (path === "/api/stream/token") return await handleStreamToken(request, env);
  if (path === "/api/stream/proxy") return await handleStreamProxy(request, env);
  if (path === "/api/favorites") return await handleFavorites(request, env);
  if (path === "/api/history") return await handleHistory(request, env);
  if (path === "/api/rating") return await handleRating(request, env);
  if (path === "/api/notifications") return await handleNotifications(request, env);
  if (path.startsWith("/api/push/")) return await handlePush(path, request, env);
  if (path === "/api/party/polls" || path === "/api/party/poll" || path === "/api/party/vote") return await handlePartyPollExtra(path, request, env);
  if (path.startsWith("/api/party/")) return await handleParty(path, request, env);
  if (path === "/api/tmdb") return await handleTMDBProxy(request, env);
  if (path === "/api/reminders") return await handleReminders(request, env);
  if (path === "/api/feedback") return await handleFeedback(request, env);
  if (path === "/api/shorts") return await handleShorts(request, env);
  if (path === "/api/shorts/creators") return await handleShortCreators(request, env);
  if (path === "/api/shorts/creator") return await handleShortCreatorDetail(request, env);
  if (path === "/api/shorts/by-creator") return await handleShortsByCreator(request, env);
  if (path === "/api/shorts/follow") return await handleShortFollow(request, env);
  if (path === "/api/shorts/creator/profile") return await handleShortCreatorProfile(request, env);
  if (path === "/api/shorts/upload" || path === "/api/shorts/my") return await handleShortUploadMy(path, request, env);
  if (path === "/api/plans" && request.method === "GET") {
    await ensureSchema(env);
    try {
      const { results } = await env.DB.prepare("SELECT code, name, rank, price, price_text, tagline, allows, color FROM plans WHERE is_active = 1 ORDER BY rank ASC").all();
      const plans = (results || []).map(p => ({ ...p, allows: JSON.parse(p.allows || "[]") }));
      return json({ success: true, plans }, 200, request, env);
    } catch { return json({ success: true, plans: [] }, 200, request, env); }
  }
  if (path === "/api/events" && request.method === "GET") {
    await ensureSchema(env);
    try {
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const cc = viewerCountry(request);
      // (B) chặn vùng: blocked_regions rỗng = toàn cầu
      const { results } = await env.DB.prepare("SELECT id, title, subtitle, image_url, link_type, link_value FROM events WHERE is_active = 1 AND (starts_at = '' OR starts_at IS NULL OR starts_at <= ?) AND (ends_at = '' OR ends_at IS NULL OR ends_at >= ?) AND (blocked_regions IS NULL OR blocked_regions = '' OR INSTR(',' || blocked_regions || ',', ?) = 0) ORDER BY sort_order ASC, id DESC LIMIT 20").bind(now, now, "," + cc + ",").all();
      return json({ success: true, events: results || [] }, 200, request, env);
    } catch { return json({ success: true, events: [] }, 200, request, env); }
  }
  // ---- CHỦ ĐỀ TRANG TRÍ (site_themes): public active themes ----
  if (path === "/api/themes" && request.method === "GET") {
    await ensureSchema(env);
    try {
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const { results } = await env.DB.prepare("SELECT * FROM site_themes WHERE is_active = 1 AND (starts_at = '' OR starts_at IS NULL OR starts_at <= ?) AND (ends_at = '' OR ends_at IS NULL OR ends_at >= ?) ORDER BY sort_order ASC, id DESC LIMIT 20").bind(now, now).all();
      const themes = (results || []).map((r) => ({
        id: r.id, key: r.key, name: r.name, emoji: r.emoji || '', description: r.description || '',
        primary_color: r.primary_color || '#f36f21', secondary_color: r.secondary_color || '#1a1c24',
        accent_color: r.accent_color || '#ffb37a', background_url: r.background_url || '',
        banner_url: r.banner_url || '', logo_url: r.logo_url || '', confetti: r.confetti || 'none',
        css: r.css || '', starts_at: r.starts_at || '', ends_at: r.ends_at || '', sort_order: r.sort_order || 0,
      }));
      return json({ success: true, themes, active: themes[0] || null }, 200, request, env);
    } catch { return json({ success: true, themes: [], active: null }, 200, request, env); }
  }
  if (path === "/api/sports-videos" && request.method === "GET") {
    await ensureSchema(env);
    try {
      const { results } = await env.DB.prepare("SELECT id, title, league, thumb_url, video_url, duration FROM sports_videos WHERE is_active = 1 ORDER BY sort_order ASC, id DESC LIMIT 40").all();
      return json({ success: true, videos: results || [] }, 200, request, env);
    } catch { return json({ success: true, videos: [] }, 200, request, env); }
  }
  if (path === "/api/shorts/react") return await handleShortReact(request, env);
  if (path === "/auth/qr/request" || path === "/auth/qr/approve" || path === "/auth/qr/poll") return await handleQrLogin(request, env);
  if (path === "/api/broadcasts") return await handleBroadcasts(env, request);
  if (path === "/api/channels") return await handleChannels(env, request);
  if (path === "/api/search") return await handleSearch(request, env);
  if (path === "/api/analytics") return await handleAnalytics(request, env);
  if (path === "/api/stats/beat" || path === "/api/stats/top" || path === "/api/stats/top-fans" || path === "/api/stats/trending") return await handleStats(path, request, env);
  if (path === "/api/report-channel") return await handleReportChannel(request, env, ctx);
  if (path === "/api/telemetry/player") return await handlePlayerTelemetry(request, env);
  if (path === "/api/status") return json({ success: true, ...(await getStatusSummary(env)) }, 200, request, env);
  if (path === "/api/profile" || path === "/api/u") return await handlePublicProfile(path, request, env);
  if (path === "/api/comments") return await handleComments(request, env);
  if (path === "/api/fan-groups") return await handleFanGroups(request, env);
  if (path === "/api/gifts/redeem") return await handleGiftRedeem(request, env);
  if (path === "/api/gifts/create") return await handleGiftCreate(request, env);
  if (path === "/api/gifts/mine") return await handleGiftMine(request, env);
  if (path === "/api/payments/config" || path === "/api/payments/order" || path === "/api/payments/claim" || path === "/api/payments/sepay-webhook") return await handlePayments(path, request, env);
  if (path === "/api/ads") return await handleAds(request, env);
  if (path === "/api/movie/sources") return await handleMovieSources(request, env);
  if (path === "/api/ads/preroll") return await handleAdPreroll(request, env);
  if (path === "/api/ads/impression" && request.method === "POST") return await handleAdImpression(request, env);
  if (path === "/api/preview/state") {
    const a = await getAuth(request, env);
    if (!a) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const rank = await planRank(env, a.plan);
    const st = hasDB(env) ? await previewState(env, await viewerKey(request, env, a)) : { total: 0, used: 0, remaining: 0, resets_in: 0 };
    return json({ success: true, plan: a.plan, preview_enabled: rank <= 1 && !a.guest, ...st }, 200, request, env);
  }
  if (path === "/api/predictions") return await handlePredictions(request, env);
  // ---- ĐỢT 48: mã chia sẻ / progress đa thiết bị / follow series / sao creator / ...
  if (path === "/api/movie/share" || path === "/api/codes" || path === "/api/codes/claim" || path === "/api/codes/my" || path.startsWith("/api/codes/")) return await handleShareCodesApi(path, request, env);
  if (path.startsWith("/api/movie/progress") || path === "/api/resume") return await handleMovieProgressApi(path, request, env);
  if (path.startsWith("/api/movie/series-follow")) return await handleSeriesFollowApi(path, request, env);
  if (path === "/api/movie/wishlist") return await handleMovieWishlistApi(request, env);
  if (path === "/api/stats/search" || path === "/api/stats/trending-search") return await handleSearchTrending(path, request, env);
  if (path === "/api/actors/follow") return await handleActorFollowApi(request, env);
  if (path === "/api/team/notify") return await handleTeamNotify(request, env);
  if (path === "/api/shorts/star") return await handleShortStar(request, env);
  if (path === "/api/shorts/leaderboard" || path === "/api/shorts/creator/weekly") return await handleCreatorWeekly(request, env);
  if (path === "/api/challenges") return await handleChallengesPublic(request, env);
  if (path === "/api/affiliates") return await handleAffiliatesPublic(request, env);
  if (path === "/api/wrapped") return await handleWrapped(request, env);
  if (path === "/api/stats/top-country") return await handleCountryTop(request, env);
  if (path === "/api/movie/certification") return json({ success: true, ok: true }, 200, request, env);
  if (path.startsWith("/api/sports/follow")) return await handleTeamFollowApi(path, request, env);
  // Proxy dữ liệu thể thao (TheSportsDB / ESPN) — BẮT BUỘC phải có, nếu không màn
  // Thể thao (lịch, tỉ số, BXH, chi tiết đội bóng) sẽ trắng trơn vì trình duyệt
  // không gọi thẳng thesportsdb.com được (CORS/CSP).
  if (path === "/api/sports/tsdb") return await handleSportsTsdb(request, env, ctx);
  if (path === "/api/sports/espn") return await handleSportsEspn(request, env, ctx);
  return json({ error: "Not found" }, 404, request, env);
}

// ========== PLAYLIST ==========
// P0-A.3: response công khai CHỈ chứa metadata kênh — KHÔNG BAO GIỜ có `stream_url`
// (trước đây URL stream kèm token premium — kể cả ADMIN TOKEN — lộ ra cho mọi người).
// Client muốn phát thì gọi /api/stream/token?channel=<id> (JWT) → nhận proxy_url.
//
// ⚠️ `PUBLIC_STREAM_URL=1` = công tắc khẩn cấp trả lại URL gốc cho client (chế độ
// phát trực tiếp, KHÔNG bảo vệ được link). Chỉ bật khi cần cứu sự cố phát, tắt ngay sau đó.
// ---------------------------------------------------------------------------
// UA GỬI LÊN NGUỒN (upstream): mặc định DALVIK — hầu hết nguồn IPTV Việt (FPT,
// TV360, VTVgo...) chỉ chấp nhận UA của app Android; UA VLC hay bị chặn 403.
// Thứ tự ưu tiên: client chỉ định (X-CHRTV-Upstream-UA) -> UA riêng của kênh
// (#EXTVLCOPT trong M3U) -> mặc định (env UPSTREAM_UA_DEFAULT hoặc Dalvik).
const UA_DALVIK = "Dalvik/2.1.0 (Linux; U; Android 13; SM-S918B Build/TP1A.220624.014)";
const UA_CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
const UA_VLC = "VLC/3.0.21 LibVLC/3.0.21";
function defaultUpstreamUA(env) {
  const v = String((env && env.UPSTREAM_UA_DEFAULT) || "").trim();
  if (!v || v.toLowerCase() === "dalvik") return UA_DALVIK;
  if (v.toLowerCase() === "vlc") return UA_VLC;
  if (v.toLowerCase() === "chrome") return UA_CHROME_ANDROID;
  return v.slice(0, 300); // cho phép dán nguyên chuỗi UA tuỳ ý
}

// CHUỖI UA DỰ PHÒNG: nguồn nào chặn Dalvik thì thử lại bằng VLC, cuối cùng Chrome.
// Trả về danh sách UA theo thứ tự thử, UA ưu tiên đứng đầu và không bị lặp.
function upstreamUAChain(env, preferred) {
  const first = String(preferred || "").trim() || defaultUpstreamUA(env);
  const chain = [first];
  for (const ua of [UA_DALVIK, UA_VLC, UA_CHROME_ANDROID]) {
    if (!chain.some((x) => x.toLowerCase() === ua.toLowerCase())) chain.push(ua);
  }
  return chain;
}
// Status coi như "nguồn không cho xem bằng UA này" -> đáng thử UA khác
function uaWorthRetry(status) {
  return status === 401 || status === 403 || status === 404 || status === 405 ||
         status === 406 || status === 410 || status === 451 || status === 429 ||
         (status >= 500 && status <= 504);
}
// fetch có tự đổi UA khi thất bại. cb(headers) tuỳ biến header mỗi lần thử.
async function fetchWithUAFallback(url, baseInit, env, preferredUA, timeoutMs) {
  const chain = upstreamUAChain(env, preferredUA);
  let last = null;
  for (let i = 0; i < chain.length; i++) {
    const headers = Object.assign({}, baseInit.headers || {}, { "User-Agent": chain[i] });
    try {
      const r = await fetch(url, Object.assign({}, baseInit, {
        headers,
        signal: AbortSignal.timeout(timeoutMs || 9000),
      }));
      // 3xx: trả luôn cho caller xử lý redirect (giữ UA đang dùng)
      if (r.status < 300 || (r.status >= 300 && r.status < 400)) return { resp: r, ua: chain[i] };
      if (i < chain.length - 1 && uaWorthRetry(r.status)) {
        try { r.body && r.body.cancel && r.body.cancel(); } catch {}
        last = null;
        continue;
      }
      return { resp: r, ua: chain[i] };
    } catch (e) {
      last = e;
      if (i < chain.length - 1) continue;
    }
  }
  if (last) throw last;
  return { resp: null, ua: chain[0] };
}

function streamUrlIsPublic(env) {
  return String((env && env.PUBLIC_STREAM_URL) || "") === "1";
}

// ========== CHẾ ĐỘ PHÁT LUỒNG: DIRECT (mặc định) vs PROXY ==========
// Vì sao bỏ proxy làm mặc định: hầu hết nguồn IPTV (FPT, TV360, VTVgo…) chặn
// dải IP egress của Cloudflare Workers nên khi stream đi qua /api/stream/proxy
// người xem chỉ thấy lỗi 403/451 hoặc đứng hình. Chế độ DIRECT: client vẫn PHẢI
// gọi /api/stream/token (đăng nhập, gói cước, xem thử 5 phút, chống flood đều
// kiểm tra phía server như trước) nhưng server trả THẲNG URL gốc để client phát
// trực tiếp — nguồn thấy IP của người xem nên không bị chặn.
// Muốn bật lại proxy (giấu link gốc khỏi DevTools): set biến STREAM_MODE=proxy.
function streamProxyEnabled(env) {
  const v = String((env && env.STREAM_MODE) || "").trim().toLowerCase();
  return v === "proxy" || v === "1" || v === "on" || v === "true";
}
function publicChannel(ch, env) {
  const out = {
    id: ch.id,
    channel_id: ch.channel_id,
    name: ch.name,
    logo: ch.logo || "",
    group_title: ch.group_title || "",
    catchup_type: ch.catchup_type || "append",
    catchup_days: ch.catchup_days || 7,
    manifest_type: ch.manifest_type || "",
    license_type: ch.license_type || "",
    clearKeyId: ch.clear_key_id || ch.clearKeyId || "",
    clearKey: ch.clear_key || ch.clearKey || "",
    protected: true, // client hiểu: phải xin token phát, không có URL sẵn
  };
  if (ch.health_status) out.health = ch.health_status; // up | flaky | down (từ bảng channel_health)
  // (#54) biển bảo trì: status 'maintenance' + tới bao giờ + ghi chú
  if (ch.maintenance_until) out.maintenance_until = ch.maintenance_until;
  if (ch.health_note) out.maintenance_note = String(ch.health_note).slice(0, 160);
  // (#86) kênh tài trợ — hiện huy hiệu "Tài trợ"
  out.sponsored = !!ch.is_sponsored;
  // Logo watermark riêng của kênh (xem LOGO_WATERMARK.md). Không có key `wm`
  // nghĩa là kênh đó dùng cấu hình chung của hệ thống.
  const wmOverride = normalizeWatermark(ch.wm_json || ch.wm, { partial: true });
  if (wmOverride) out.wm = wmOverride;
  if (streamUrlIsPublic(env)) {
    out.stream_url = ch.stream_url || "";
    out.user_agent = ch.user_agent || "";
    out.referer = ch.referer || "";
    out.protected = false;
  }
  return out;
}

// Vùng quốc gia BLOCKLIST (#B): cột blocked_regions rỗng = phát toàn cầu.
function cleanRegionList(raw) {
  const seen = new Set();
  for (const s of String(raw || "").split(",")) {
    const c = s.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(c)) seen.add(c);
  }
  return Array.from(seen);
}
function regionBlocked(row, cc) {
  const country = String(cc || "").trim().toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) return false;
  return cleanRegionList(row && (row.blocked_regions || row.blockedRegions)).includes(country);
}
function viewerCountry(request) {
  const cf = (request && request.cf) || {};
  return String(cf.country || "").trim().toUpperCase() || "";
}

async function handlePlaylist(env, request) {
  const refresh = request && new URL(request.url).searchParams.get("refresh") === "1";
  // (Admin) cho phép xem thử playlist theo vùng khác — chỉ khi là admin
  let country = viewerCountry(request);
  const viewCountry = request && new URL(request.url).searchParams.get("viewCountry");
  if (viewCountry && /^[A-Z]{2}$/.test(String(viewCountry))) {
    const a = await getAuth(request, env);
    const isAdmin = (a && a.user && a.user.role === "admin") || (request.headers.get("Authorization") || "") === `Bearer ${env.ADMIN_MASTER_TOKEN || ""}`;
    if (isAdmin) country = String(viewCountry).toUpperCase();
  }
  let d1_count = 0;
  if (hasDB(env)) {
    await ensureSchema(env);
    if (!refresh) {
      const SQL_NO_WM = "SELECT c.*, h.status AS health_status, h.maintenance_until AS maintenance_until, h.note AS health_note FROM channels c LEFT JOIN channel_health h ON h.channel_id = c.channel_id WHERE c.is_active = 1 ORDER BY c.id ASC";
      const SQL_WM = "SELECT c.*, h.status AS health_status, h.maintenance_until AS maintenance_until, h.note AS health_note, w.wm AS wm_json FROM channels c LEFT JOIN channel_health h ON h.channel_id = c.channel_id LEFT JOIN channel_watermark w ON w.channel_id = c.channel_id WHERE c.is_active = 1 ORDER BY c.id ASC";
      try {
        // Lấy kèm wm_json (tuỳ chỉnh logo theo kênh). Bảng channel_watermark chưa có
        // (DB quá cũ) -> retry câu SQL cũ, playlist không được phép chết vì watermark.
        let results;
        try {
          ({ results } = await env.DB.prepare(SQL_WM).all());
        } catch {
          ({ results } = await env.DB.prepare(SQL_NO_WM).all());
        }
        if (results && results.length > 0) return json({ success: true, source: "d1", data: results.filter((c) => !regionBlocked(c, country)).map((c) => publicChannel(c, env)), d1_count: results.length }, 200, request, env);
      } catch (e) { console.error("handlePlaylist D1 error:", e?.message || e); }
    }
  }
  const { list: fromSource, d1_count: imported } = await importChannelsOnce(env);
  d1_count = imported;
  return json({ success: true, source: fromSource === DEFAULT_CHANNELS ? "default" : "m3u", data: fromSource.map((c) => publicChannel(c, env)), d1_count }, 200, request, env);
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const channels = []; let cur = null;
  const cleanUA = (s) => String(s || "").replace(/[\r\n\t]+/g, " ").slice(0, 300).trim();
  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith("#EXTINF:")) {
      cur = {};
      cur.channel_id = (l.match(/tvg-id="([^"]+)"/i) || [])[1] || `ch_${channels.length + 1}`;
      cur.name = (l.match(/tvg-name="([^"]+)"/i) || [])[1] || (l.lastIndexOf(",") !== -1 ? l.substring(l.lastIndexOf(",") + 1).trim() : `Kênh ${channels.length + 1}`);
      cur.logo = (l.match(/tvg-logo="([^"]+)"/i) || [])[1] || "";
      cur.group_title = (l.match(/group-title="([^"]+)"/i) || [])[1] || "Tổng Hợp";
      cur.catchup_type = (l.match(/catchup-type="([^"]+)"/i) || [])[1] || "append";
      cur.catchup_days = parseInt((l.match(/catchup-days="([^"]+)"/i) || [])[1] || "7", 10);
    } else if (l.startsWith("#EXTVLCOPT:") && cur) {
      // VD: #EXTVLCOPT:http-user-agent=Dalvik/2.1.0 — nhiều kênh TV360/FPT yêu cầu UA này
      const opt = l.substring("#EXTVLCOPT:".length).trim();
      const eq = opt.indexOf("=");
      if (eq !== -1) {
        const k = opt.substring(0, eq).trim().toLowerCase();
        const v = opt.substring(eq + 1).trim();
        if (k === "http-user-agent" && v) cur.user_agent = cleanUA(v);
        else if ((k === "http-referrer" || k === "http-referer") && v) cur.referer = v.slice(0, 300);
      }
    } else if (l.startsWith("#KODIPROP:") && cur) {
      const prop = l.substring("#KODIPROP:".length).trim();
      const mt = prop.match(/manifest_type=([^\s]+)/i);
      if (mt) cur.manifest_type = mt[1].slice(0, 16);
      const lt = prop.match(/license_type=([^\s]+)/i);
      if (lt) cur.license_type = lt[1].slice(0, 32);
      const lk = prop.match(/license_key=(.*)/);
      if (lk) {
        // Hỗ trợ cả 2 dạng: "kid:key" (hex) và {"keys":[{"kid":"...","k":"..."}]} (base64url)
        const raw = lk[1].trim();
        const hexPair = raw.match(/^([a-fA-F0-9]{32})\s*:\s*([a-fA-F0-9]{32})$/);
        if (hexPair) { cur.clear_key_id = hexPair[1].toLowerCase(); cur.clear_key = hexPair[2].toLowerCase(); }
        else {
          try {
            const obj = JSON.parse(raw);
            const first = obj && obj.keys && obj.keys[0];
            if (first && first.kid && first.k) {
              const b64ToHex = (b) => {
                try {
                  let s = String(b).replace(/-/g, "+").replace(/_/g, "/");
                  while (s.length % 4) s += "=";
                  const bin = atob(s); let hex = "";
                  for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
                  return hex;
                } catch { return ""; }
              };
              let kid = String(first.kid), k = String(first.k);
              if (!/^[a-fA-F0-9]{32}$/.test(kid)) { const h = b64ToHex(kid); if (h.length === 32) kid = h; }
              if (!/^[a-fA-F0-9]{32}$/.test(k)) { const h = b64ToHex(k); if (h.length === 32) k = h; }
              if (/^[a-fA-F0-9]{32}$/i.test(kid) && /^[a-fA-F0-9]{32}$/i.test(k)) {
                cur.clear_key_id = kid.toLowerCase(); cur.clear_key = k.toLowerCase();
              }
            }
          } catch {}
        }
      }
    } else if (l && !l.startsWith("#") && cur) {
      cur.stream_url = l; channels.push(cur); cur = null;
    }
  }
  return channels;
}

const DEFAULT_CHANNELS = [
  { channel_id: "VTV1.vn", name: "VTV1 HD", logo: "https://vtv.sub.id/images/vtv1.png", group_title: "VTV", stream_url: "https://vtv.sub.id/vtv1/index.m3u8", catchup_type: "append", catchup_days: 7 },
  { channel_id: "VTV3.vn", name: "VTV3 HD", logo: "https://vtv.sub.id/images/vtv3.png", group_title: "VTV", stream_url: "https://vtv.sub.id/vtv3/index.m3u8", catchup_type: "append", catchup_days: 7 },
  { channel_id: "VTV5.vn", name: "VTV5 HD", logo: "https://vtv.sub.id/images/vtv5.png", group_title: "VTV", stream_url: "https://vtv.sub.id/vtv5/index.m3u8", catchup_type: "append", catchup_days: 7 },
  { channel_id: "HTV7.vn", name: "HTV7 HD", logo: "https://vtv.sub.id/images/htv7.png", group_title: "HTV", stream_url: "https://vtv.sub.id/htv7/index.m3u8", catchup_type: "append", catchup_days: 7 },
  { channel_id: "HTV9.vn", name: "HTV9 HD", logo: "https://vtv.sub.id/images/htv9.png", group_title: "HTV", stream_url: "https://vtv.sub.id/htv9/index.m3u8", catchup_type: "append", catchup_days: 7 },
  { channel_id: "THVL1.vn", name: "THVL1 HD", logo: "https://vtv.sub.id/images/thvl1.png", group_title: "THVL", stream_url: "https://vtv.sub.id/thvl1/index.m3u8", catchup_type: "append", catchup_days: 7 },
  { channel_id: "ON_SPORTS.vn", name: "ON Sports+", logo: "https://vtv.sub.id/images/onsports.png", group_title: "Thể Thao", stream_url: "https://vtv.sub.id/onsports/index.m3u8", catchup_type: "append", catchup_days: 7 },
  { channel_id: "VTC1.vn", name: "VTC1 HD", logo: "https://vtv.sub.id/images/vtc1.png", group_title: "VTC", stream_url: "https://vtv.sub.id/vtc1/index.m3u8", catchup_type: "append", catchup_days: 7 },
  { channel_id: "CHRTV_FALLBACK", name: "CHRTV Test Stream", logo: "https://i.ibb.co/VcLxwgM2/logo.png", group_title: "Dự Phòng", stream_url: "http://bore.pub:30113/hls/index.m3u8", catchup_type: "default", catchup_days: 7 },
];

// ========== EPG ==========
async function handleEPG(env, request) {
  const rawOnly = request && new URL(request.url).searchParams.get("raw") === "1";
  if (env && env.DB) {
    try {
      const { results } = await env.DB.prepare("SELECT * FROM epg_cache WHERE key = 'epg_main' AND expires_at > ?").bind(Math.floor(Date.now() / 1000)).all();
      if (results.length > 0) {
        const cached = JSON.parse(results[0].data);
        if (rawOnly) return json({ success: true, source: "cache", data: cached }, 200, request, env);
        return json({ success: true, source: "cache", data: await mergeEPGOverrides(env, cached) }, 200, request, env);
      }
    } catch {}
  }

  // Try multiple EPG sources in order
  const sources = [SOURCE_EPG_URL, SOURCE_EPG_URL2, SOURCE_EPG_URL3];
  for (const src of sources) {
    try {
      const resp = await fetch(src, { headers: { "User-Agent": "CHRTV-OTT/2.0", "Accept-Encoding": "gzip, deflate" }, signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const data = parseEPGXml(await resp.text());
        if (data.programmes && data.programmes.length > 0) {
          if (env && env.DB) {
            try {
              await env.DB.prepare("INSERT OR REPLACE INTO epg_cache (key, data, expires_at) VALUES ('epg_main', ?, ?)").bind(JSON.stringify(data), Math.floor(Date.now() / 1000) + 3600).run();
            } catch {}
          }
          if (rawOnly) return json({ success: true, source: "xml", data }, 200, request, env);
          return json({ success: true, source: "xml", data: await mergeEPGOverrides(env, data) }, 200, request, env);
        }
      }
    } catch {}
  }

  // All sources failed — generate mock for ALL channels in D1 so EPG shows everywhere
  let channelIds = [];
  if (env && env.DB) {
    try {
      const { results } = await env.DB.prepare("SELECT channel_id, name FROM channels").all();
      channelIds = results || [];
    } catch {}
  }
  const mockData = generateMockEPG(channelIds);
  if (rawOnly) return json({ success: true, source: "mock", data: mockData }, 200, request, env);
  return json({ success: true, source: "mock", data: await mergeEPGOverrides(env, mockData) }, 200, request, env);
}

// Gộp EPG tùy chỉnh theo kênh (epg_overrides) — override thay thế chương trình gốc của kênh đó
async function mergeEPGOverrides(env, data) {
  if (!env || !env.DB || !data || !data.programmes) return data;
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS epg_overrides (channel_id TEXT PRIMARY KEY, channel_name TEXT DEFAULT '', programmes TEXT NOT NULL, updated_at INTEGER DEFAULT 0)").run();
    const { results } = await env.DB.prepare("SELECT * FROM epg_overrides").all();
    if (!results || results.length === 0) return data;
    const programmeList = [...data.programmes];
    const channels = { ...(data.channels || {}) };
    for (const ov of results) {
      let ovProgs = [];
      try { ovProgs = JSON.parse(ov.programmes || '[]'); } catch {}
      if (!Array.isArray(ovProgs)) ovProgs = [];
      const rest = programmeList.filter(p => p.channel !== ov.channel_id);
      programmeList.length = 0;
      programmeList.push(...rest, ...ovProgs);
      if (!channels[ov.channel_id]) {
        channels[ov.channel_id] = { id: ov.channel_id, name: ov.channel_name || ov.channel_id };
      }
    }
    return { channels, programmes: programmeList };
  } catch (e) {
    return data;
  }
}

function parseEPGXml(xml) {
  const channels = {}, programmes = [];
  const chR = /<channel\s+id="([^"]+)">[\s\S]*?<display-name[^>]*>([^<]+)<\/display-name>/g;
  let m;
  while ((m = chR.exec(xml))) channels[m[1]] = { id: m[1], name: m[2] };

  // Match programme blocks, then extract attributes regardless of order
  const pBlockR = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/g;
  while ((m = pBlockR.exec(xml))) {
    const attrs = m[1];
    const inner = m[2];
    const getAttr = (name) => {
      const am = attrs.match(new RegExp(name + '="([^"]*)"'));
      return am ? am[1] : '';
    };
    const start = getAttr('start');
    const stop = getAttr('stop');
    const channel = getAttr('channel');
    if (!start || !channel) continue;
    const tR = inner.match(/<title[^>]*>([^<]+)<\/title>/);
    const dR = inner.match(/<desc[^>]*>([^<]*)<\/desc>/);
    const title = tR ? tR[1] : 'Chương trình';
    const desc = dR ? dR[1] : '';
    programmes.push({ start, stop, channel, title, desc });
  }
  return { channels, programmes };
}

function generateMockEPG(channelList = []) {
  // If no channels passed in, use a sensible default set
  const ids = channelList.length > 0
    ? channelList.map(ch => ch.channel_id || ch)
    : ["VTV1.vn", "VTV3.vn", "HTV7.vn", "HTV9.vn", "ON_SPORTS.vn"];
  const nameMap = {};
  channelList.forEach(ch => { nameMap[ch.channel_id || ch] = ch.name || ch.channel_id || ch; });

  const progs = []; const now = new Date();
  const titles = [
    { title: "Thời sự", desc: "Bản tin thời sự trong ngày" },
    { title: "Phim truyện Việt Nam", desc: "Phim truyện hình sự, gia đình" },
    { title: "Tin tức quốc tế", desc: "Cập nhật tin tức thế giới" },
    { title: "Thể thao 24h", desc: "Tin nóng thể thao trong nước và quốc tế" },
    { title: "Ca nhạc", desc: "Chương trình ca nhạc giải trí" },
    { title: "Phim Hàn Quốc", desc: "Phim truyền hình Hàn Quốc lồng tiếng" },
    { title: "Khoa học & khám phá", desc: "Khám phá khoa học tự nhiên" },
    { title: "Kinh tế tài chính", desc: "Phân tích kinh tế, chứng khoán" },
    { title: "Thiếu nhi & hoạt hình", desc: "Chương trình dành cho thiếu nhi" },
    { title: "Talk show giải trí", desc: "Giao lưu, trò chuyện cùng nghệ sĩ" },
    { title: "Phim tài liệu", desc: "Phim tài liệu văn hóa - xã hội" },
    { title: "Âm nhạc quốc tế", desc: "Video âm nhạc nước ngoài" },
  ];
  for (let d = -6; d <= 1; d++) {
    const bd = new Date(now.getTime() + d * 86400000);
    ids.forEach((id, idx) => {
      for (let h = 0; h < 24; h += 2) {
        const s = new Date(bd); s.setHours(h, 0, 0, 0);
        const e = new Date(bd); e.setHours(h + 2, 0, 0, 0);
        const fmt = (dt) => `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}${String(dt.getHours()).padStart(2,'0')}${String(dt.getMinutes()).padStart(2,'0')}${String(dt.getSeconds()).padStart(2,'0')} +0700`;
        const prog = titles[(h / 2 + idx) % titles.length];
        progs.push({ channel: id, start: fmt(s), stop: fmt(e), title: prog.title, desc: prog.desc });
      }
    });
  }
  return { channels: ids.reduce((a, id) => { a[id] = { id, name: nameMap[id] || id }; return a; }, {}), programmes: progs };
}

// ========== PROXY CŨ (/api/proxy?url=...) — P1: KHÓA WHITELIST + CHẶN SSRF ==========
// Trước đây là OPEN PROXY (proxy bất kỳ URL nào — ai cũng dùng làm proxy ẩn danh).
// Giờ:
//  - scheme chỉ http/https; port lạ bị chặn (chỉ 80/443, hoặc host:port có trong whitelist)
//  - host phải nằm trong whitelist upstream (env PROXY_ALLOWED_HOSTS override)
//  - chặn IP literal private/reserved (SSRF): 0.0.0.0/8, 10/8, 127/8, 169.254/16
//    (kể cả metadata 169.254.169.254), 172.16/12, 192.168/16, 100.64/10, ::1, fc00::/7, fe80::/10
//  - redirect phải vẫn nằm trong whitelist (theo dõi manual, max 3 hops)
//  - rate-limit theo IP
const PROXY_ALLOWED_HOSTS_DEFAULT = [
  // Upstream stream chính (duyệt theo playlists/tv.m3u + fallback)
  "fptplay53.net", "fptplay.net", "seenow.vn", "mytvnet.vn", "tv360.vn",
  "vtvdigital.vn", "vtv.sub.id", "undo.it", "cvtv.xyz", "freem3u.xyz",
  "kbs.co.kr", "ankb.qzz.io",
  // Kênh quốc tế trong playlist
  "akamaized.net", "amagi.tv", "tubi.video", "france24.com", "nhkworld.jp",
  "cloudfront.net", "amazonaws.com",
  // TV360/FPT custom + dự phòng
  "dpdns.org", "duckdns.org",
  "198.58.104.90:8989", "206.212.244.63",
  // Stream dự phòng (dùng port 30113 — khai báo host:port rõ ràng)
  "bore.pub:30113",
];
function proxyAllowedHosts(env) {
  const raw = (env && env.PROXY_ALLOWED_HOSTS) || "";
  const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : PROXY_ALLOWED_HOSTS_DEFAULT;
}

// MỞ WHITELIST: mặc định cho proxy MỌI domain public (link nào cũng xem được).
// Vẫn giữ nguyên các lớp chống lạm dụng: chỉ http/https, chặn IP nội bộ/reserved
// (SSRF), chặn localhost/.local/.internal, rate-limit theo IP và anti-tool cho .m3u8.
// Muốn siết lại thì đặt biến môi trường PROXY_ALLOW_ALL = "0".
function proxyAllowAll(env) {
  const v = String((env && env.PROXY_ALLOW_ALL) != null ? env.PROXY_ALLOW_ALL : "1").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}

function isPrivateOrReservedIP(ip) {
  const v = String(ip || "").toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    const p = v.split(".").map(Number);
    const [a, b, c] = p;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;          // link-local + metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGN 100.64.0.0/10
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 198 && b === 51) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // ULA fc00::/7
  if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
  if (v.startsWith("::ffff:")) {
    const mapped = v.slice(7);
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(mapped) ? isPrivateOrReservedIP(mapped) : true;
  }
  return false;
}

// Entry whitelist: "host" (suffix match, port 80/443) | "*.host" | "host:port"
function hostPortAllowed(u, allowed) {
  const h = u.hostname.toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  const defPort = u.protocol === "https:" ? "443" : "80";
  const port = u.port || defPort;
  for (const entryRaw of allowed) {
    const e = String(entryRaw).toLowerCase().trim();
    if (!e) continue;
    let eh = e, ep = null;
    const ci = e.indexOf(":");
    if (ci !== -1) { eh = e.slice(0, ci); ep = e.slice(ci + 1); }
    let hostMatch = false;
    if (eh.startsWith("*.")) hostMatch = h === eh.slice(2) || h.endsWith(eh.slice(1));
    else hostMatch = h === eh || h.endsWith("." + eh);
    if (!hostMatch) continue;
    if (ep) { if (String(port) === ep) return true; }
    else if (port === "80" || port === "443") return true;
  }
  return false;
}

// Trả về {ok:true,url} hoặc {ok:false,error,code} — dùng chung /api/proxy và /api/stream/token
function validateProxyTarget(rawUrl, env) {
  let u;
  try { u = new URL(String(rawUrl || "")); } catch { return { ok: false, error: "URL không hợp lệ", code: "BAD_URL" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "Chỉ cho phép http/https", code: "BAD_SCHEME" };
  if (isPrivateOrReservedIP(u.hostname)) return { ok: false, error: "Chặn IP nội bộ/reserved (SSRF)", code: "SSRF_BLOCKED" };
  const h = u.hostname.toLowerCase();
  if (!h || h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) {
    return { ok: false, error: "Chặn host nội bộ", code: "SSRF_BLOCKED" };
  }
  if (!proxyAllowAll(env) && !hostPortAllowed(u, proxyAllowedHosts(env))) {
    return { ok: false, error: "Domain không trong danh sách whitelist", code: "NOT_ALLOWED" };
  }
  return { ok: true, url: u };
}

// ========== RATE LIMIT (D1, fallback in-memory) ==========
const memRate = new Map();
async function rateLimitCheck(env, key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  if (hasDB(env)) {
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, hits INTEGER DEFAULT 0, window_start INTEGER DEFAULT 0)").run();
      const { results } = await env.DB.prepare("SELECT hits, window_start FROM rate_limits WHERE key = ?").bind(key).all();
      let hits = 0, ws = 0;
      if (results[0]) { hits = results[0].hits || 0; ws = results[0].window_start || 0; }
      if (now - ws >= windowSec) { hits = 0; ws = now; }
      if (hits >= limit) return { allowed: false, retryAfter: Math.max(1, ws + windowSec - now) };
      await env.DB.prepare("INSERT INTO rate_limits (key, hits, window_start) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET hits = excluded.hits, window_start = excluded.window_start").bind(key, hits + 1, ws).run();
      return { allowed: true };
    } catch (e) { /* DB lỗi — fallback memory */ }
  }
  let m = memRate.get(key) || { hits: 0, ws: 0 };
  if (now - m.ws >= windowSec) { m.hits = 0; m.ws = now; }
  if (m.hits >= limit) return { allowed: false, retryAfter: Math.max(1, m.ws + windowSec - now) };
  m.hits += 1;
  memRate.set(key, m);
  if (memRate.size > 20000) memRate.clear();
  return { allowed: true };
}

async function handleProxy(request, env) {
  const reqUrl = new URL(request.url);
  const targetUrl = reqUrl.searchParams.get("url");
  if (!targetUrl) return json({ error: "Thiếu tham số url" }, 400, request, env);

  // Rate-limit theo IP (P1)
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const rl = await rateLimitCheck(env, "proxy:ip:" + ip, 60, 60);
  if (!rl.allowed) return json({ error: "Quá nhiều request — thử lại sau", code: "RATE_LIMITED", retry_after: rl.retryAfter }, 429, request, env);

  const guard = validateProxyTarget(targetUrl, env);
  if (!guard.ok) return json(guard, 403, request, env);
  let target = guard.url;

  // Target giống stream: vẫn giữ anti-tool + gating theo gói (chống curl/ffplay + lách gói)
  if (/\.(m3u8|ts|mpd)(\?|$)/i.test(targetUrl)) {
    const blocked = streamToolBlocked(request);
    if (blocked) return json({ error: "Client bị chặn", reason: blocked }, 403, request, env);
    if (!streamIdentityOk(request)) return json({ error: "Chỉ chấp nhận client CHRTV-OTT" }, 403, request, env);
    const deny = await streamAccessDenied(request, env, targetUrl);
    if (deny) return json(deny, 403, request, env);
  }

  const proxyBase = `${reqUrl.origin}${reqUrl.pathname}`;
  let proxyUA = defaultUpstreamUA(env);
  try {
    const o = String(request.headers.get("X-CHRTV-Upstream-UA") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
    if (o) proxyUA = o;
  } catch {}
  const fetchOpts = {
    headers: { "User-Agent": proxyUA, "Accept": "*/*", "Referer": target.origin + "/" },
    signal: AbortSignal.timeout(8000),
    redirect: "manual",
  };

  // Theo dõi redirect manual — mọi hop vẫn phải qua validateProxyTarget
  let resp = null;
  try {
    for (let hop = 0; hop < 3; hop++) {
      // Đổi UA tự động khi nguồn chặn: Dalvik -> VLC -> Chrome
      const r = await fetchWithUAFallback(target.toString(), fetchOpts, env, proxyUA, 8000);
      resp = r.resp;
      proxyUA = r.ua;
      fetchOpts.headers["User-Agent"] = r.ua;
      if (resp && resp.status >= 300 && resp.status < 400) {
        const loc = resp.headers.get("Location");
        const next = loc ? validateProxyTarget(new URL(loc, target.toString()).toString(), env) : null;
        if (!next || !next.ok) { resp.body && resp.body.cancel && resp.body.cancel().catch(() => {}); return json({ error: "Redirect tới địa chỉ không hợp lệ", code: "REDIRECT_BLOCKED" }, 403, request, env); }
        target = next.url;
        continue;
      }
      break;
    }
  } catch { resp = null; }

  if (resp && resp.ok) return await proxyResponse(resp, target, proxyBase, request, env);
  if (resp) { resp.body && resp.body.cancel && resp.body.cancel().catch(() => {}); }
  // Fallback stream dự phòng (chỉ khi target hợp lệ nhưng sập)
  try {
    const fbGuard = validateProxyTarget(FALLBACK_STREAM_URL, env);
    if (fbGuard.ok) {
      const fb = await fetch(fbGuard.url.toString(), { headers: fetchOpts.headers, signal: AbortSignal.timeout(8000) });
      if (fb.ok) return await proxyResponse(fb, fbGuard.url, proxyBase, request, env);
      fb.body && fb.body.cancel && fb.body.cancel().catch(() => {});
    }
  } catch {}
  return json({ error: "Stream unavailable" }, 502, request, env);
}

function safeOrigin(u) {
  try { return new URL(u).origin; } catch { return ""; }
}

// Trả response kèm CORS. Với playlist HLS (.m3u8) thì viết lại URL con thành URL
// đi qua chính proxy này (segment tương đối sẽ bị trình duyệt resolve sai nếu không viết lại).
async function proxyResponse(resp, targetUrl, proxyBase, request, env) {
  const ct = (resp.headers.get("Content-Type") || "").toLowerCase();
  const isPlaylist = ct.includes("mpegurl") || /\.m3u8(\?|$)/i.test(targetUrl.toString());
  const headers = new Headers();
  Object.entries(corsHeadersFor(request, env)).forEach(([k, v]) => headers.set(k, v));
  const upCT = resp.headers.get("Content-Type");
  if (upCT) headers.set("Content-Type", upCT.split(";")[0]);

  if (!isPlaylist) return new Response(resp.body, { status: resp.status, headers });

  const text = await resp.text();
  const rewritten = rewriteM3U8(text, targetUrl, proxyBase);
  headers.set("Content-Type", "application/vnd.apple.mpegurl");
  return new Response(rewritten, { status: resp.status, headers });
}

function rewriteM3U8(text, targetUrl, proxyBase) {
  const toProxy = (raw) => {
    try { return `${proxyBase}?url=${encodeURIComponent(new URL(raw, targetUrl).toString())}`; }
    catch { return raw; }
  };
  return text.split(/\r?\n/).map((line) => {
    const l = line.trim();
    if (!l) return line;
    if (l.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${toProxy(uri)}"`);
    }
    return toProxy(l);
  }).join("\n");
}

// ========== SECURE STREAM PROXY (HMAC PLAYBACK TOKEN) ==========
// P0-A/P0-B fix:
//  - Playback token TÁCH HOÀN TOÀN khỏi admin token: HMAC-SHA256 ký bằng
//    STREAM_TOKEN_SECRET (server-only, wrangler secret — KHÔNG hardcode).
//  - Token bind theo (URL stream + origin + thư mục + user id + sid theo IP/UA).
//    OPAQUE ROLLING TOKEN (AES-GCM): URL gốc KHÔNG BAO GIỜ xuất hiện ở client
//    (kể cả trong query ?u= — đã xoá hoàn toàn). Mỗi token là 1 blob mã hoá chứa
//    URL đích + scope + bind + TTL 60s, IV ngẫu nhiên nên KHÔNG BAO GIỜ trùng nhau.
//    TTL 60 giây, tự động xoay: client xoay manifest token; worker sinh SEGMENT
//    token MỚI (TTL 60s, duy nhất theo từng URI) cho mỗi lần phát playlist.
//  - /api/stream/token: BẮT BUỘC JWT (user hoặc guest). Entitlement kiểm tra
//    PHÍA SERVER theo gói — không tin flag client. X-CHRTV-Client chỉ là phiên bản.
//  - /api/stream/proxy: verify token + scope + sid + user, inject upstream
//    credential (token kênh premium của Stream Engine — lưu server-side, không lộ
//    ra client), chặn redirect ra ngoài origin, rewrite playlist bằng segment token.

const UA_BLOCKLIST_RE = /curl|wget|ffmpeg|ffplay|libavformat|lavf|vlc|mpv|python-requests|python-urllib|okhttp|go-http-client|postman|insomnia|httpie|libwww|scrapy|axios|node-fetch|charles|fiddler|wireshark|hlsfetch/i;

let _hmacKeyCache = null;
let _hmacKeyFor = null;
async function streamHmacKey(env) {
  const secret = streamTokenSecret(env);
  if (_hmacKeyFor === secret && _hmacKeyCache) return _hmacKeyCache;
  _hmacKeyCache = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  _hmacKeyFor = secret;
  return _hmacKeyCache;
}
function b64uEncode(buf) {
  const b = new Uint8Array(buf); let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(str) {
  let t = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function sha256hex(str) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---- OPAQUE TOKEN: AES-GCM-256 seal/open. Payload (gồm URL gốc) nằm TRONG
// blob mã hoá — client/tool sniff chỉ thấy chuỗi mờ vô nghĩa. IV ngẫu nhiên
// mỗi lần seal => token rolling, không bao giờ lặp lại dù cùng nội dung.
let _aesKeyCache = null;
let _aesKeyFor = null;
async function streamAesKey(env) {
  const secret = streamTokenSecret(env) + "|aes-gcm-v1";
  if (_aesKeyFor === secret && _aesKeyCache) return _aesKeyCache;
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  _aesKeyCache = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  _aesKeyFor = secret;
  return _aesKeyCache;
}
async function sealStreamToken(payload, env) {
  const key = await streamAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))));
  return "v1." + b64uEncode(iv) + "." + b64uEncode(ct);
}
async function openStreamToken(token, env) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;
    const key = await streamAesKey(env);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64uDecode(parts[1]) }, key, b64uDecode(parts[2]));
    const payload = JSON.parse(new TextDecoder().decode(pt));
    if (!payload || typeof payload.exp !== "number") return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return "EXPIRED";
    return payload;
  } catch { return null; }
}

function streamToolBlocked(request) {
  const ua = request.headers.get("User-Agent") || "";
  if (UA_BLOCKLIST_RE.test(ua)) return "UA bị chặn (curl/ffplay/vlc/...)";
  for (const h of ["via", "proxy-connection", "forwarded", "proxy-authorization", "x-forwarded-via", "proxy-uri"]) {
    if (request.headers.get(h)) return "header cấm: " + h;
  }
  return null;
}
// CHỈ dùng làm phiên bản client (log/compat) — KHÔNG phải cơ chế xác thực (P0-B.3)
function streamIdentityOk(request) {
  const ua = request.headers.get("User-Agent") || "";
  if (ua.trim() === CHRTV_CLIENT_UA) return true;
  if ((request.headers.get("X-CHRTV-Client") || "").trim() === CHRTV_CLIENT_UA) return true;
  return true; // không bắt buộc — xác thực thật là JWT + playback token
}
async function streamSid(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 80);
  return (await sha256hex(ip + "|" + ua + "|" + streamTokenSecret(env))).slice(0, 16);
}
function streamErr(obj, status, request, env) {
  return new Response(JSON.stringify(obj), { status, headers: jsonHeaders(request, env) });
}

// ---- GATING theo nhóm kênh (5 gói): Standard=VTV, Recreational=+BOX, Ultimate=+SPORT, Elite=+FILM, Signature=tất cả ----
// Khớp playlist thực tế: "TH - Truyền hình Việt"->VTV, "BOX - Giải trí"->BOX, "SPORTS"->SPORT
function normGroupChrtv(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function classifyGroupChrtv(g) {
  const n = normGroupChrtv(g);
  if (!n) return "VTV"; // nhóm trống = FTA mặc định
  if (/\b(th\s*truyen\s*hinh\s*viet|truyen\s*hinh\s*viet)\b/.test(n)) return "VTV";
  if (/\bvtv\w*/.test(n)) return "VTV";
  if (/\bbox\b/.test(n)) return "BOX";
  if (/(\bsport|the\s*thao|bong\s*da|\bespn\b|\bbein\b)/.test(n)) return "SPORT";
  if (/(phim|movie|cinema|film|hollywood|classic|series|drama|\bhbo\b|\baxn\b|warner|cinemax|discovery|nat\s*geo)/.test(n)) return "FILM";
  if (/(cartoon|\banim\b|\bkids\b|thieu\s*nhi|giai\s*tri)/.test(n)) return "BOX"; // thiếu nhi/giải trí -> BOX
  return "OTHER";
}
// ============================================================================
// QUẢNG CÁO PRE-ROLL (34) + XEM THỬ 5 PHÚT CHO GÓI STANDARD
//
// Luật do chủ app chốt:
//   - elite / signature : KHÔNG quảng cáo
//   - ultimate          : bỏ qua sau 5 giây
//   - recreational      : bỏ qua sau 10 giây
//   - standard / khách  : bỏ qua sau 30 giây
//   - tối đa 5 lần quảng cáo mỗi giờ cho mỗi người xem
//   - gói standard xem được MỌI kênh nhưng chỉ 5 phút/giờ; hết thì chỉ còn kênh TH
// Mọi con số đều chỉnh được bằng biến môi trường (không cần sửa code).
// ============================================================================
const AD_SKIP_BY_RANK = { 1: 30, 2: 10, 3: 5, 4: 0, 5: 0 }; // 0 = ad-free
function adSkipSecondsForRank(rank, env) {
  const envMap = {
    1: parseInt((env && env.AD_SKIP_STANDARD) || "", 10),
    2: parseInt((env && env.AD_SKIP_RECREATIONAL) || "", 10),
    3: parseInt((env && env.AD_SKIP_ULTIMATE) || "", 10),
  };
  const r = Math.max(1, Math.min(5, Number(rank) || 1));
  const v = envMap[r];
  return Number.isFinite(v) && v >= 0 ? v : (AD_SKIP_BY_RANK[r] ?? 30);
}
function adQuotaPerHour(env) {
  const n = parseInt((env && env.AD_MAX_PER_HOUR) || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}
function previewSeconds(env) {
  const n = parseInt((env && env.STANDARD_PREVIEW_SECONDS) || "", 10);
  return Number.isFinite(n) && n >= 0 ? n : 300; // 5 phút
}
function previewWindowSec(env) {
  const n = parseInt((env && env.STANDARD_PREVIEW_WINDOW) || "", 10);
  return Number.isFinite(n) && n >= 60 ? n : 3600; // mỗi giờ
}
// Khoá định danh người xem: user thật -> u<id>, khách -> theo sid (IP+UA)
async function viewerKey(request, env, auth) {
  if (auth && auth.user) return "u" + auth.user.id;
  try { return "g" + (await streamSid(request, env)).slice(0, 24); } catch { return "g0"; }
}

async function previewState(env, userKey) {
  const total = previewSeconds(env);
  const win = previewWindowSec(env);
  const now = Math.floor(Date.now() / 1000);
  let used = 0, windowStart = now;
  try {
    const { results } = await env.DB.prepare("SELECT window_start, seconds FROM preview_usage WHERE user_key = ?").bind(userKey).all();
    const row = results && results[0];
    if (row && now - (row.window_start || 0) < win) { used = row.seconds || 0; windowStart = row.window_start || now; }
  } catch {}
  return { total, used: Math.min(used, total), remaining: Math.max(0, total - used), window_start: windowStart, resets_in: Math.max(0, windowStart + win - now) };
}

async function consumePreview(env, userKey, sec) {
  const win = previewWindowSec(env);
  const now = Math.floor(Date.now() / 1000);
  try {
    const { results } = await env.DB.prepare("SELECT window_start, seconds FROM preview_usage WHERE user_key = ?").bind(userKey).all();
    const row = results && results[0];
    if (!row || now - (row.window_start || 0) >= win) {
      await env.DB.prepare("INSERT INTO preview_usage (user_key, window_start, seconds, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_key) DO UPDATE SET window_start = excluded.window_start, seconds = excluded.seconds, updated_at = excluded.updated_at")
        .bind(userKey, now, Math.max(0, sec), now).run();
    } else {
      await env.DB.prepare("UPDATE preview_usage SET seconds = seconds + ?, updated_at = ? WHERE user_key = ?")
        .bind(Math.max(0, sec), now, userKey).run();
    }
  } catch {}
}

async function adsShownLastHour(env, userKey) {
  try {
    const from = Math.floor(Date.now() / 1000) - 3600;
    const { results } = await env.DB.prepare("SELECT COUNT(*) AS n FROM ad_views WHERE user_key = ? AND created_at > ?").bind(userKey, from).all();
    return results?.[0]?.n || 0;
  } catch { return 0; }
}

// GET /api/ads/preroll?kind=channel|movie&ref=<id> — client hỏi "có phải xem QC không?"
async function handleAdPreroll(request, env) {
  if (!hasDB(env)) return json({ success: true, ad: null, reason: "no-db" }, 200, request, env);
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  const plan = auth ? auth.plan : "standard";
  const rank = await planRank(env, plan);
  const skipAfter = adSkipSecondsForRank(rank, env);
  const quota = adQuotaPerHour(env);
  const key = await viewerKey(request, env, auth);
  const base = { success: true, plan, skip_after: skipAfter, quota };

  if (skipAfter === 0) return json({ ...base, ad: null, reason: "ad_free" }, 200, request, env);
  const shown = await adsShownLastHour(env, key);
  if (shown >= quota) return json({ ...base, ad: null, reason: "quota_reached", shown }, 200, request, env);

  const q = new URL(request.url).searchParams;
  const kind = ["channel", "movie", "sport", "short"].includes(q.get("kind") || "") ? q.get("kind") : "channel";
  const ref = String(q.get("ref") || "").slice(0, 80);

  let ad = null;
  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const cc = viewerCountry(request);
    const { results } = await env.DB.prepare(
      `SELECT id, title, image_url, link_url, video_url FROM ads
       WHERE is_active = 1 AND slot = 'preroll'
         AND (starts_at = '' OR starts_at IS NULL OR starts_at <= ?)
         AND (ends_at = '' OR ends_at IS NULL OR ends_at >= ?)
         AND (blocked_regions IS NULL OR blocked_regions = '' OR INSTR(',' || blocked_regions || ',', ?) = 0)
       ORDER BY sort_order ASC, id DESC LIMIT 10`
    ).bind(now, now, "," + cc + ",").all();
    const list = results || [];
    if (list.length) ad = list[Math.floor(Math.random() * list.length)];
  } catch {}
  if (!ad) return json({ ...base, ad: null, reason: "no_inventory", shown }, 200, request, env);

  // Đếm ngay khi server phát quảng cáo ra (không tin client báo lại) — đúng "5 lần/giờ".
  try {
    await env.DB.prepare("INSERT INTO ad_views (user_key, ad_id, kind, ref_id, plan, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(key, ad.id, kind, ref, plan, Math.floor(Date.now() / 1000)).run();
  } catch {}
  return json({ ...base, ad, reason: "show", shown: shown + 1 }, 200, request, env);
}

// POST /api/ads/impression — client báo đã xem xong/bỏ qua (để thống kê)
async function handleAdImpression(request, env) {
  if (!hasDB(env)) return json({ success: true }, 200, request, env);
  await ensureSchema(env);
  const b = await request.json().catch(() => ({}));
  const auth = await getAuth(request, env);
  const key = await viewerKey(request, env, auth);
  try {
    await env.DB.prepare("UPDATE ad_views SET completed = ? WHERE user_key = ? AND ad_id = ? AND id = (SELECT MAX(id) FROM ad_views WHERE user_key = ? AND ad_id = ?)")
      .bind(b.completed ? 1 : 0, key, parseInt(b.ad_id, 10) || 0, key, parseInt(b.ad_id, 10) || 0).run();
    await env.DB.prepare("INSERT INTO analytics (event, user_id, channel_id, data) VALUES ('ad_preroll', ?, ?, ?)")
      .bind(auth && auth.user ? auth.user.id : 0, String(b.ref_id || "").slice(0, 80), JSON.stringify({ ad_id: b.ad_id, completed: !!b.completed, seconds: b.seconds || 0 })).run();
  } catch {}
  return json({ success: true }, 200, request, env);
}

const PLAN_RANK_FALLBACK = { signature: 5, elite: 4, ultimate: 3, recreational: 2, standard: 1, vip: 5 };
function planAllowsGroupChrtv(plan, g) {
  const rank = PLAN_RANK_FALLBACK[String(plan || "standard").toLowerCase()] || 1;
  if (rank >= 5) return true;
  const cls = classifyGroupChrtv(g);
  if (rank >= 4) return cls === "VTV" || cls === "BOX" || cls === "SPORT" || cls === "FILM";
  if (rank === 3) return cls === "VTV" || cls === "BOX" || cls === "SPORT";
  if (rank === 2) return cls === "VTV" || cls === "BOX";
  return cls === "VTV"; // standard / guest / mặc định
}
// Rank gói từ DB (cache 60s) — gói admin tự thêm vẫn phân quyền đúng theo rank
let _planRankCache = { at: 0, map: null };
async function planRank(env, code) {
  const c = String(code || "standard").toLowerCase();
  const fallback = PLAN_RANK_FALLBACK;
  try {
    if (!hasDB(env)) return fallback[c] || 1;
    const now = Date.now();
    if (!_planRankCache.map || now - _planRankCache.at > 60000) {
      const { results } = await env.DB.prepare("SELECT code, rank FROM plans WHERE is_active = 1").all();
      const m = { ...fallback };
      for (const r of results || []) m[String(r.code).toLowerCase()] = Number(r.rank) || 1;
      _planRankCache = { at: now, map: m };
    }
    return _planRankCache.map[c] ?? (fallback[c] || 1);
  } catch { return fallback[c] || 1; }
}
async function planAllowsGroupChrtvAsync(env, plan, g) {
  const rank = await planRank(env, plan);
  if (rank >= 5) return true;
  const cls = classifyGroupChrtv(g);
  if (rank >= 4) return cls === "VTV" || cls === "BOX" || cls === "SPORT" || cls === "FILM";
  if (rank === 3) return cls === "VTV" || cls === "BOX" || cls === "SPORT";
  if (rank === 2) return cls === "VTV" || cls === "BOX";
  return cls === "VTV";
}

// Catalog kênh (cache 5 phút): byId / byUrl / byDir
let _chanCache = null;
async function channelCatalog(env) {
  if (!hasDB(env)) return null;
  try {
    if (!_chanCache || Date.now() - _chanCache.at > 300000) {
      const { results } = await env.DB.prepare("SELECT * FROM channels WHERE is_active = 1").all();
      const byId = new Map(); const byUrl = new Map(); const byDir = new Map();
      for (const c of results || []) {
        byId.set(c.channel_id, c);
        try {
          const u = new URL(c.stream_url);
          byUrl.set(c.stream_url, c);
          byDir.set(u.origin + (u.pathname.replace(/\/[^/]*$/, "") || "/"), c);
        } catch (e) {}
      }
      _chanCache = { at: Date.now(), byId, byUrl, byDir };
    }
    return _chanCache;
  } catch { return null; }
}
function channelForUrl(cat, urlStr) {
  if (!cat) return null;
  try {
    if (cat.byUrl.has(urlStr)) return cat.byUrl.get(urlStr);
    const t = new URL(urlStr);
    return cat.byDir.get(t.origin + (t.pathname.replace(/\/[^/]*$/, "") || "/")) || null;
  } catch { return null; }
}
// Trả null nếu được phép, hoặc object lỗi (P0-B.2: entitlement phía server)
async function streamAccessDenied(request, env, urlStr) {
  if (!/\.(m3u8|ts|mpd)(\?|$)/i.test(urlStr || "")) return null;
  const cat = await channelCatalog(env);
  const ch = channelForUrl(cat, urlStr);
  if (!ch) return null; // không phải kênh đã đăng ký — caller tự xử lý
  const auth = await getAuth(request, env);
  const plan = auth ? auth.plan : "standard";
  if (await planAllowsGroupChrtvAsync(env, plan, ch.group_title)) return null;
  return { error: auth ? "PLAN_REQUIRED" : "LOGIN_REQUIRED", group: ch.group_title, plan };
}

// Catchup URL — port từ client (giữ đúng format upstream): server-side để client
// không cần biết stream_url gốc (P0-A.3).
function generateCatchupServerUrl(baseUrl, utcSec, catchupType = "append") {
  if (!baseUrl) return "";
  if (!utcSec) return baseUrl;
  const d = new Date(utcSec * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const formatted = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  const sep = baseUrl.includes("?") ? "&" : "?";
  if (catchupType === "flussonic" || baseUrl.includes("timeshift"))
    return baseUrl.replace(/\/index\.m3u8$/i, "") + `/timeshift_abs-${utcSec}.m3u8`;
  if (catchupType === "shift") return `${baseUrl}${sep}shift=${utcSec}`;
  return `${baseUrl}${sep}utc=${utcSec}&lutc=${Math.floor(Date.now() / 1000)}&catchup_start=${formatted}`;
}

// ---- Upstream credentials (token kênh premium của Stream Engine) — SERVER-SIDE ONLY ----
// Admin cấp/rotate qua /admin/stream-credentials. KHÔNG BAO GIỜ trả ra response API.
let _credCache = null;
async function upstreamCredentials(env) {
  if (!hasDB(env)) return null;
  try {
    if (!_credCache || Date.now() - _credCache.at > 60000) {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS stream_credentials (channel_id TEXT PRIMARY KEY, upstream_token TEXT NOT NULL, updated_at INTEGER DEFAULT 0)").run();
      const { results } = await env.DB.prepare("SELECT channel_id, upstream_token FROM stream_credentials").all();
      const byChannel = new Map();
      for (const r of results || []) byChannel.set(r.channel_id, r.upstream_token);
      _credCache = { at: Date.now(), byChannel };
    }
    return _credCache;
  } catch { return null; }
}
async function applyUpstreamCredential(env, ch, target) {
  if (!ch) return target.toString();
  const creds = await upstreamCredentials(env);
  if (!creds) return target.toString();
  const tok = creds.byChannel.get(ch.channel_id);
  if (!tok) return target.toString();
  try {
    const u = new URL(target.toString());
    if (u.searchParams.get("token") !== tok) {
      u.searchParams.set("token", tok);
      return u.toString();
    }
  } catch {}
  return target.toString();
}

async function handleStreamToken(request, env) {
  // 1) BẮT BUỘC phiên JWT (user hoặc guest) — P0-B: X-CHRTV-Client không còn là "xác thực"
  const auth = await getAuth(request, env);
  if (!auth) return json({ error: "LOGIN_REQUIRED", message: "Cần đăng nhập để nhận token phát." }, 401, request, env);

  // 2) Chống tool rip
  const blocked = streamToolBlocked(request);
  if (blocked) {
    try {
      await env.DB.prepare("INSERT INTO analytics (event, user_id, data) VALUES ('stream_tool_blocked', ?, ?)")
        .bind(auth.user ? auth.user.id : 0, JSON.stringify({ reason: blocked, ua: (request.headers.get("User-Agent") || "").slice(0, 120) })).run();
    } catch {}
    return json({ error: "Client bị chặn", reason: blocked }, 403, request, env);
  }

  // 2b) CHỐNG RIP HÀNG LOẠT: 1 phiên (user+thiết bị) chỉ được xin tối đa 240 token
  //     phát trong 5 phút. Xem bình thường (xoay token ~5 phút/lần + đổi kênh) không
  //     bao giờ chạm ngưỡng; script quét cả playlist để tải hàng loạt thì dính ngay.
  try {
    const uidKey = auth.user ? "u" + auth.user.id : "g" + (await streamSid(request, env));
    const rl = await rateLimitCheck(env, "stok:" + uidKey, 240, 300);
    if (!rl.allowed) {
      try {
        await env.DB.prepare("INSERT INTO analytics (event, user_id, data) VALUES ('stream_token_flood', ?, ?)")
          .bind(auth.user ? auth.user.id : 0, JSON.stringify({ ua: (request.headers.get("User-Agent") || "").slice(0, 120) })).run();
      } catch {}
      return json({ error: "STREAM_RATE_LIMITED", message: "Xin token phát quá nhanh — thử lại sau ít phút.", retry_after: rl.retryAfter }, 429, request, env);
    }
  } catch { /* DB lỗi — bỏ qua, các lớp khác vẫn chặn */ }

  const q = new URL(request.url).searchParams;
  const channelId = q.get("channel") || "";
  const uParam = q.get("u") || "";
  const atParam = q.get("at");
  let at = 0;
  if (atParam) {
    const n = parseInt(atParam, 10);
    if (Number.isFinite(n) && n > 100000000) at = n > 10000000000 ? Math.floor(n / 1000) : n;
  }
  const isCatchup = !!at;

  let channel = null;
  let targetUrl = "";
  if (channelId) {
    const cat = await channelCatalog(env);
    channel = cat ? (cat.byId.get(channelId) || null) : null;
    if (!channel) return json({ error: "CHANNEL_NOT_FOUND" }, 404, request, env);
    targetUrl = isCatchup ? generateCatchupServerUrl(channel.stream_url, at, channel.catchup_type || "append") : channel.stream_url;
    if (isCatchup && auth.guest) return json({ error: "LOGIN_REQUIRED", message: "Xem chương trình đã phát cần đăng nhập." }, 401, request, env);
  } else if (uParam) {
    // Legacy `u=`: chỉ chấp nhận URL thuộc whitelist upstream (kênh đã đăng ký HOẶC kênh import của user)
    const guard = validateProxyTarget(uParam, env);
    if (!guard.ok) return json({ error: "URL không được phép", code: guard.code }, 403, request, env);
    const cat = await channelCatalog(env);
    channel = channelForUrl(cat, uParam);
    if (!channel && auth.guest) return json({ error: "LOGIN_REQUIRED", message: "Kênh ngoài danh sách cần đăng nhập." }, 401, request, env);
    if (isCatchup && auth.guest) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    targetUrl = uParam;
  } else {
    return json({ error: "Thiếu tham số channel hoặc u" }, 400, request, env);
  }

  // (B) VÙNG QUỐC GIA BLOCKLIST — chặn cứng tại nguồn phát
  const geoCountry = viewerCountry(request);
  if (channel && regionBlocked(channel, geoCountry)) {
    return json({ error: "REGION_BLOCKED", country: geoCountry, message: `Kênh không khả dụng ở vùng ${geoCountry}. Chọn kênh khác hoặc dùng VPN nếu bạn đang ở đúng quốc gia này.`, group: channel.group_title }, 403, request, env);
  }
  // (#54) Kênh đang bảo trì — chặn phát, kèm gợi ý kênh thay thế cùng nhóm
  if (channel) {
    try {
      const { results: hr } = await env.DB.prepare("SELECT maintenance_until, note FROM channel_health WHERE channel_id = ?").bind(channel.channel_id).all();
      const mUntil = hr && hr[0] ? (hr[0].maintenance_until || 0) : 0;
      if (mUntil > Math.floor(Date.now() / 1000)) {
        return json({
          error: "CHANNEL_MAINTENANCE",
          message: `Kênh đang bảo trì đến ${new Date(mUntil * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} — thử kênh thay thế cùng nhóm nhé.`,
          group: channel.group_title, name: channel.name, maintenance_until: mUntil, note: String((hr && hr[0] && hr[0].note) || "").slice(0, 160),
        }, 403, request, env);
      }
    } catch {}
  }

  // 3) Entitlement PHÍA SERVER theo gói — không tin client (P0-B.2)
  //    NGOẠI LỆ: gói Standard (rank 1) được XEM THỬ mọi kênh 5 phút mỗi giờ.
  //    Hết quota thì chỉ còn kênh TH (nhóm VTV/Truyền hình Việt).
  let previewInfo = null;
  if (channel && !(await planAllowsGroupChrtvAsync(env, auth.plan, channel.group_title))) {
    const rank = await planRank(env, auth.plan);
    const canPreview = rank <= 1 && !auth.guest && !isCatchup && previewSeconds(env) > 0;
    if (!canPreview) {
      if (auth.guest) return json({ error: "LOGIN_REQUIRED", message: "Đăng nhập để xem thử kênh này 5 phút miễn phí.", group: channel.group_title }, 401, request, env);
      return json({ error: "PLAN_REQUIRED", group: channel.group_title, plan: auth.plan }, 403, request, env);
    }
    const key = await viewerKey(request, env, auth);
    const st = await previewState(env, key);
    if (st.remaining <= 0) {
      return json({
        error: "PREVIEW_EXPIRED",
        message: `Hết 5 phút xem thử. Nâng gói để xem tiếp "${channel.name}" — gói Standard vẫn xem thoải mái các kênh TH.`,
        group: channel.group_title, plan: auth.plan, preview: st,
      }, 403, request, env);
    }
    previewInfo = st;
  }

  // 3b) CHẾ ĐỘ DIRECT (mặc định): trả thẳng URL gốc sau khi đã qua mọi lớp
  //     kiểm tra ở trên. Nguồn stream thấy IP của người xem (không phải IP
  //     Cloudflare) nên hết bị chặn. Xem thử vẫn trừ quota 60s/lần xin và
  //     client quay lại xin URL mới mỗi phút -> hết 5 phút là chặn như cũ.
  if (!streamProxyEnabled(env)) {
    const nowD = Math.floor(Date.now() / 1000);
    let previewOutD = null;
    let rotateAtD = 0;
    if (previewInfo) {
      const chunkD = Math.min(60, previewInfo.remaining);
      const keyD = await viewerKey(request, env, auth);
      await consumePreview(env, keyD, chunkD);
      previewOutD = {
        total: previewInfo.total,
        used: Math.min(previewInfo.total, previewInfo.used + chunkD),
        remaining: Math.max(0, previewInfo.remaining - chunkD),
        resets_in: previewInfo.resets_in,
      };
      // phiên xem thử: xoay mỗi chunk để server kiểm soát quota
      rotateAtD = nowD + Math.max(15, chunkD);
    }
    return json({
      success: true,
      direct: true,
      url: targetUrl,
      exp: nowD + 3600,
      rotate_at: rotateAtD, // 0 = URL gốc không hết hạn, không cần xoay
      ...(previewOutD ? { preview: previewOutD } : {}),
    }, 200, request, env);
  }

  // 4) Cấp playback token: HMAC, TTL 60s, bind (stream + user + sid)
  const now = Math.floor(Date.now() / 1000);
  let base;
  try { base = new URL(targetUrl); } catch { return json({ error: "URL stream không hợp lệ" }, 500, request, env); }
  const dir = base.pathname.replace(/\/[^/]*$/, "") || "/";
  const uid = auth.user ? auth.user.id : 0;
  // Phiên xem thử: token chỉ sống 60s và mỗi lần cấp là trừ đúng bấy nhiêu giây
  // vào quota 5 phút -> không cần client thành thật báo cáo thời gian xem.
  const previewChunk = previewInfo ? Math.min(60, previewInfo.remaining) : 0;
  const ttl = previewInfo ? previewChunk : manifestTtl(env);
  const payload = {
    k: "manifest",
    u: targetUrl,
    o: base.origin,
    p: dir,
    cid: channel ? channel.channel_id : "",
    uid,
    sid: await streamSid(request, env),
    iat: now,
    exp: now + ttl,
  };
  if (previewInfo) payload.pv = 1; // proxy biết đây là phiên xem thử hợp lệ
  const t = await sealStreamToken(payload, env);
  let previewOut = null;
  if (previewInfo) {
    const key = await viewerKey(request, env, auth);
    await consumePreview(env, key, previewChunk);
    previewOut = {
      total: previewInfo.total,
      used: Math.min(previewInfo.total, previewInfo.used + previewChunk),
      remaining: Math.max(0, previewInfo.remaining - previewChunk),
      resets_in: previewInfo.resets_in,
    };
  }
  return json({
    success: true,
    t,
    iat: now, exp: payload.exp,
    rotate_at: payload.exp - (previewInfo ? 15 : STREAM_TOKEN_GRACE), ttl,
    proxy_url: `/api/stream/proxy?t=${t}`,
    ...(previewOut ? { preview: previewOut } : {}),
  }, 200, request, env);
}

async function handleStreamProxy(request, env) {
  // Đã BỎ proxy theo mặc định (STREAM_MODE=proxy để bật lại) — token endpoint
  // trả URL gốc trực tiếp nên endpoint này không còn được dùng ở chế độ direct.
  if (!streamProxyEnabled(env)) {
    return streamErr({
      error: "PROXY_DISABLED",
      message: "Proxy phát đã tắt. Client phát trực tiếp URL từ /api/stream/token.",
    }, 410, request, env);
  }
  const blocked = streamToolBlocked(request);
  if (blocked) return streamErr({ error: "Client bị chặn", reason: blocked }, 403, request, env);

  const q = new URL(request.url).searchParams;
  const tok = q.get("t") || "";
  // Format cũ ?u=<url gốc>&t=... BỊ CHẶN — URL gốc không được phép đi qua client nữa
  if (q.get("u")) return streamErr({ error: "LEGACY_FORMAT_BLOCKED", message: "Phiên bản app quá cũ — tải lại trang." }, 410, request, env);
  if (!tok) return json({ error: "Thiếu token" }, 400, request, env);

  // 1) Mở opaque token (AES-GCM + TTL 60s). URL đích nằm TRONG token.
  const payload = await openStreamToken(tok, env);
  if (payload === "EXPIRED") return streamErr({ error: "TOKEN_EXPIRED" }, 403, request, env);
  if (!payload) return streamErr({ error: "TOKEN_INVALID" }, 401, request, env);
  const nowS = Math.floor(Date.now() / 1000);

  // 2) Bind: cùng IP/UA (sid) + cùng user.
  //    Token HMAC đã bind (uid + sid + TTL 60s) — JWT là lớp thêm: nếu request
  //    CÓ mang JWT (shaka web) thì phải khớp uid + được re-check gói; nếu KHÔNG
  //    mang (Chromecast / external player / native) thì chấp nhận với binding
  //    token + sid — URL proxy vẫn KHÔNG dùng được ở nơi khác (IP/UA khác →
  //    sid mismatch, TTL 60s).
  if (payload.sid !== (await streamSid(request, env))) return streamErr({ error: "TOKEN_SID_MISMATCH" }, 403, request, env);
  const auth = await getAuth(request, env);
  const uid = auth ? (auth.user ? auth.user.id : 0) : payload.uid;
  if (auth && uid !== payload.uid) return streamErr({ error: "TOKEN_USER_MISMATCH" }, 403, request, env);

  // 3) Scope: URL đích lấy TỪ TRONG token (client không được chọn URL).
  // Token xác thực => đích hợp lệ; vẫn re-check origin/dir để chống token ghép.
  let target;
  try { target = new URL(payload.u || ""); } catch { return streamErr({ error: "TOKEN_SCOPE" }, 403, request, env); }
  const tu = target.toString();
  const dir = payload.p || "/";
  const inDir = dir === "/" ? target.pathname.startsWith("/") : target.pathname.startsWith(dir + "/");
  if (target.origin !== payload.o || !inDir) {
    return streamErr({ error: "TOKEN_SCOPE" }, 403, request, env);
  }

  // 4) Entitlement re-check (phòng khi tài khoản đổi/xuống gói trong thời gian
  //    token còn hạn) — chỉ khi request có JWT (không JWT: token đã cấp đúng
  //    plan tại thời điểm ký, TTL 60s nên không đáng lo)
  const cat = await channelCatalog(env);
  const ch = payload.cid ? (cat ? (cat.byId.get(payload.cid) || null) : null) : channelForUrl(cat, tu);
  if (auth && ch && !payload.pv && !(await planAllowsGroupChrtvAsync(env, auth.plan, ch.group_title))) {
    return streamErr({ error: "PLAN_REQUIRED", group: ch.group_title }, 403, request, env);
  }

  // 5) Inject upstream credential (server-side only — token premium của Stream Engine)
  const upstreamUrl = await applyUpstreamCredential(env, ch, target);

  // 6) Fetch upstream — redirect phải giữ nguyên origin
  // UA upstream: ưu tiên override từ client (người dùng chọn trong player, VD Dalvik),
  // sau đó tới UA yêu cầu của kênh (từ #EXTVLCOPT trong M3U), cuối cùng mặc định Dalvik.
  const cleanHeaderVal = (s, max) => String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, max || 300);
  let upstreamUA = defaultUpstreamUA(env);
  let upstreamRef = target.origin + "/";
  try {
    const overrideUA = cleanHeaderVal(request.headers.get("X-CHRTV-Upstream-UA") || "", 300);
    const overrideRef = cleanHeaderVal(request.headers.get("X-CHRTV-Upstream-Referer") || "", 300);
    const channelUA = cleanHeaderVal((ch && (ch.user_agent || ch.userAgent)) || "", 300);
    const channelRef = cleanHeaderVal((ch && ch.referer) || "", 300);
    if (overrideUA) upstreamUA = overrideUA;
    else if (channelUA) upstreamUA = channelUA;
    if (overrideRef) upstreamRef = overrideRef;
    else if (channelRef) upstreamRef = channelRef;
  } catch {}
  const upstreamHeaders = { "User-Agent": upstreamUA, "Accept": "*/*", "Referer": upstreamRef };
  const range = request.headers.get("Range");
  if (range) upstreamHeaders["Range"] = range;
  let resp;
  try {
    // Nguồn chặn UA nào thì tự nhảy sang UA kế: Dalvik -> VLC -> Chrome
    const r1 = await fetchWithUAFallback(upstreamUrl, { headers: upstreamHeaders, redirect: "manual" }, env, upstreamUA, 9000);
    resp = r1.resp;
    upstreamUA = r1.ua;
    upstreamHeaders["User-Agent"] = r1.ua;
    if (resp && resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("Location");
      const next = loc ? new URL(loc, upstreamUrl) : null;
      if (!next || next.origin !== target.origin) return streamErr({ error: "REDIRECT_BLOCKED" }, 403, request, env);
      const r2 = await fetchWithUAFallback(next.toString(), { headers: upstreamHeaders, redirect: "manual" }, env, upstreamUA, 9000);
      resp = r2.resp;
      upstreamHeaders["User-Agent"] = r2.ua;
    }
    if (!resp) return json({ error: "Stream unavailable" }, 502, request, env);
  } catch {
    return json({ error: "Stream unavailable" }, 502, request, env);
  }

  const ct = (resp.headers.get("Content-Type") || "").toLowerCase();
  const isPlaylist = ct.includes("mpegurl") || /\.m3u8(\?|$)/i.test(target.pathname);
  // Header TỐI THIỂU tự build — KHÔNG copy header upstream (chặn rò rỉ Server/Via/X-*)
  const headers = new Headers();
  Object.entries(corsHeadersFor(request, env)).forEach(([k, v]) => headers.set(k, v));
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => headers.set(k, v));
  if (isPlaylist) {
    headers.set("Content-Type", "application/vnd.apple.mpegurl");
    headers.set("Cache-Control", "no-store");
    const text = await resp.text();
    // Mỗi URI con => 1 OPAQUE TOKEN RIÊNG (IV ngẫu nhiên, TTL 60s, đúng 1 URL) —
    // rolling theo từng lần phát playlist, URL gốc không lộ đi đâu.
    const proxyBase = new URL(request.url).origin + "/api/stream/proxy";
    // VOD/catch-up (có #EXT-X-ENDLIST): player KHÔNG tải lại playlist nên segment
    // token phải sống lâu hơn; live giữ TTL 60s cho chặt.
    const isVod = /#EXT-X-ENDLIST/i.test(text);
    const body = await rewriteM3U8Sealed(text, target, proxyBase, {
      o: target.origin, p: dir, cid: payload.cid || "", uid: payload.uid, sid: payload.sid, vod: isVod,
    }, env);
    return new Response(body, { status: resp.status, headers });
  }
  // Segment: chỉ giữ lại Content-Type + range headers cần cho phát lại
  const upCT = resp.headers.get("Content-Type");
  if (upCT && /^(video\/|audio\/|application\/octet-stream|binary)/i.test(upCT)) headers.set("Content-Type", upCT.split(";")[0]);
  else headers.set("Content-Type", "video/MP2T");
  for (const h of ["Content-Range", "Accept-Ranges", "Content-Length"]) {
    const v = resp.headers.get(h);
    if (v) headers.set(h, v);
  }
  const rangeReq = request.headers.get("Range");
  headers.set("Cache-Control", "private, max-age=30");
  return new Response(resp.body, { status: rangeReq && resp.status === 206 ? 206 : (resp.status === 206 ? 206 : 200), headers });
}

// Playlist rewrite: mỗi URI con được seal thành 1 opaque token riêng.
// (async vì mỗi URI = 1 lần AES-GCM với IV ngẫu nhiên)
async function rewriteM3U8Sealed(text, targetUrl, proxyBase, ctx, env) {
  const nowS = Math.floor(Date.now() / 1000);
  const cache = new Map(); // cùng URI trong 1 playlist => dùng chung token
  const toProxy = async (raw) => {
    try {
      const abs = new URL(raw, targetUrl).toString();
      if (!/^https?:\/\//i.test(abs)) return raw;
      if (!cache.has(abs)) {
        const t = await sealStreamToken({
          k: "seg", u: abs, o: ctx.o, p: ctx.p, cid: ctx.cid,
          uid: ctx.uid, sid: ctx.sid, iat: nowS, exp: nowS + (ctx.vod ? SEGMENT_TOKEN_TTL_VOD : SEGMENT_TOKEN_TTL),
        }, env);
        cache.set(abs, proxyBase + "?t=" + t);
      }
      return cache.get(abs);
    } catch { return raw; }
  };
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l) { out.push(line); continue; }
    if (l.startsWith("#")) {
      // URI="..." (KEY/MAP/SESSION-DATA...) — thay từng cái (async)
      const parts = l.split(/URI="([^"]+)"/g);
      if (parts.length === 1) { out.push(line); continue; }
      let rebuilt = parts[0];
      for (let i = 1; i < parts.length; i += 2) {
        rebuilt += 'URI="' + (await toProxy(parts[i])) + '"' + (parts[i + 1] || "");
      }
      out.push(rebuilt);
      continue;
    }
    out.push(await toProxy(l));
  }
  return out.join("\n");
}

// ============================================================================
// LOGO WATERMARK — đắp logo của web lên khung hình lúc phát (tv/trang TV/player).
// Chi tiết thiết kế + cách đổi logo: LOGO_WATERMARK.md
//
// 2 lớp cấu hình:
//   • site_config "watermark"      → mặc định toàn hệ thống (admin chỉnh)
//   • channel_watermark(channel_id) → tuỳ chỉnh RIÊNG theo kênh (nạp JSON chồng lên
//     mặc định: mode 'on'/'off' + vị trí/cỡ/mờ/kiểu). Để bảng riêng vì writeChannels()
//     DELETE + INSERT lại `channels` mỗi lần nạp M3U.
// Client đọc: global từ /api/watermark, phần riêng của kênh từ `wm` trong /api/playlist.
// ============================================================================

const WM_POS = ["tl", "tr", "bl", "br", "tc", "bc", "ml", "mr", "custom"];
const WM_STYLE = ["plain", "shadow", "plate", "glass"];
const WM_TINT = ["none", "white", "black"];
const WM_TEXT_POS = ["none", "right", "bottom", "top"];
const WM_PAGES = ["tv", "player", "mini", "movie"];
const WM_LOGO_MAX_BYTES = 256 * 1024;

function wmNum(v, min, max, dflt) {
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
function wmInt(v, min, max, dflt) {
  const n = typeof v === "number" ? v : parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.round(Math.min(max, Math.max(min, n)));
}
function wmBool(v, dflt) {
  if (v === undefined || v === null || v === "") return dflt;
  return v === 1 || v === true || v === "1" || v === "on" || v === "true" ? 1 : 0;
}
function wmOneOf(v, list, dflt) {
  const s = String(v || "").trim().toLowerCase();
  return list.includes(s) ? s : dflt;
}
function wmText(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f<>]/g, " ").trim().slice(0, max);
}

/** Cấu hình mặc định toàn hệ thống (khi admin chưa lưu gì). */
function watermarkDefaults() {
  return {
    enabled: 1,
    logo_url: "",            // rỗng = dùng /watermark.svg đóng gói trong app
    pos: "tr",               // góc trên phải
    x: 92, y: 8,             // chỉ dùng khi pos = 'custom' (% của khung hình)
    size: 9,                 // % chiều cao khung hình
    opacity: 82,
    margin: 3,               // % cách mép khi bám góc
    style: "shadow",         // plain | shadow | plate | glass
    tint: "none",            // none | white | black (lọc màu để dễ nhìn trên nền tối)
    text: "",                // dòng mô tả đi kèm logo
    text_pos: "none",        // chỉ có nghĩa khi `text` khác rỗng
    fit: "video",            // video = bám khung hình thật (bỏ letterbox) | container
    pages: { tv: 1, player: 1, mini: 0, movie: 0 },
    only_live: 0,            // 1 = chỉ hiện ở kênh live, không hiện trên phim/catch-up
    hide_buffering: 1,       // 1 = ẩn lúc đang loading
    version: 0,
    updated_at: 0,
  };
}

/**
 * Chuẩn hoá 1 lớp cấu hình watermark.
 * `partial: true` (dùng cho tuỳ chỉnh theo kênh): CHỈ giữ các key có mặt trong `raw`
 * để client đem overlay lên trên mặc định; không có key nào hợp lệ → trả null.
 */
function normalizeWatermark(raw, opts = {}) {
  const partial = !!opts.partial;
  let src = raw;
  if (typeof src === "string") {
    const s = src.trim();
    if (!s) return partial ? null : watermarkDefaults();
    try { src = JSON.parse(s); } catch { return partial ? null : watermarkDefaults(); }
  }
  if (!src || typeof src !== "object") return partial ? null : watermarkDefaults();
  const has = (k) => src[k] !== undefined && src[k] !== null && src[k] !== "";
  const keep = (k) => (partial ? has(k) : true);

  const out = {};
  // mode: '' = theo chung | 'on' = bật cưỡng bức | 'off' = tắt riêng kênh này
  if (partial) {
    const mode = String(src.mode || "").trim().toLowerCase();
    if (mode === "on" || mode === "off") out.mode = mode;
    else if (src.enabled === 0 || src.enabled === "0" || src.enabled === false) out.mode = "off";
  }
  if (keep("enabled") && !partial) out.enabled = wmBool(src.enabled, 1);
  if (keep("pos")) out.pos = wmOneOf(src.pos, WM_POS, "tr");
  if (keep("x")) out.x = wmNum(src.x, 0, 100, 92);
  if (keep("y")) out.y = wmNum(src.y, 0, 100, 8);
  if (keep("size")) out.size = wmNum(src.size, 2, 40, 9);
  if (keep("opacity")) out.opacity = wmInt(src.opacity, 5, 100, 82);
  if (keep("margin")) out.margin = wmNum(src.margin, 0, 20, 3);
  if (keep("style")) out.style = wmOneOf(src.style, WM_STYLE, "shadow");
  if (keep("tint")) out.tint = wmOneOf(src.tint, WM_TINT, "none");
  // `text`: với tuỳ chỉnh theo kênh phải phân biệt "không gửi" (theo chung) và
  // "gửi rỗng" (kênh này không hiện dòng mô tả) → xét sự có mặt của key.
  const textPresent = partial ? (Object.prototype.hasOwnProperty.call(src, "text") || has("text_pos")) : true;
  if (textPresent) {
    out.text = wmText(src.text, 48);
    out.text_pos = out.text ? wmOneOf(src.text_pos, WM_TEXT_POS, "right") : "none";
  }
  if (keep("fit")) out.fit = String(src.fit) === "container" ? "container" : "video";
  if (!partial) {
    const p = src.pages && typeof src.pages === "object" ? src.pages : {};
    const pages = {};
    for (const k of WM_PAGES) pages[k] = wmBool(p[k], k === "tv" || k === "player" ? 1 : 0);
    out.pages = pages;
    out.only_live = wmBool(src.only_live, 0);
    out.hide_buffering = wmBool(src.hide_buffering, 1);
    const u = String(src.logo_url || "").trim();
    out.logo_url = /^\/api\/watermark\/logo(\?|$)/.test(u) || /^\/watermark\.(svg|png)(\?|$)/i.test(u) ? u.slice(0, 160)
      : /^https?:\/\/[^\s"'<>\\]{1,140}$/i.test(u) ? u : "";
  }
  // `mode` một mình vẫn hợp lệ (bật/tắt riêng kênh); không có key nào khác -> trả null
  if (partial && Object.keys(out).length === 0) return null;
  return out;
}

// ---- SVG tự vệ: admin upload logo → mình phải cất & phát lại đúng markup đó ----
// Ảnh chỉ được render bằng <img src>, nhưng vẫnstrip script/handler/external-ref
// để nếu có ai mở trực tiếp link .svg thì cũng không chạy được gì.
function sanitizeSvg(input) {
  let svg = String(input || "").trim();
  if (!svg || svg.length > WM_LOGO_MAX_BYTES) return { ok: false, error: svg ? "SVG_QUÁ_LỚN" : "RỖNG" };
  if (!/<svg[\s>]/i.test(svg)) return { ok: false, error: "KHONG_PHAI_SVG" };
  const drop = (re) => { svg = svg.replace(re, ""); };
  drop(/<script[\s\S]*?<\/script\s*>/gi);
  drop(/<\s*foreignObject[\s\S]*?<\s*\/\s*foreignObject\s*>/gi);
  drop(/<\s*(iframe|embed|object|animate|set|handler)\b[\s\S]*?(<\/\s*\1\s*>|\/>)/gi);
  drop(/<!DOCTYPE[^>]*>/gi);
  drop(/<!ENTITY[\s\S]*?>/gi);
  drop(/<\?xml-stylesheet[\s\S]*?\?>/gi);
  svg = svg.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "").replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // Bỏ tham chiếu ngoài (href/xlink:href/src trỏ http, data: khác loại, javascript:)
  const kill = (attr) => new RegExp(`(\\s${attr}\\s*=\\s*)("([^"]*)"|'([^']*)')`, "gi");
  for (const attr of ["href", "src", "xlink:href"]) {
    svg = svg.replace(kill(attr), (m, pre, _q, d, s) => {
      const v = String(d || s || "").trim();
      const safe = /^#[-\w:.]+$/.test(v) || /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(v);
      return safe ? m : "";
    });
  }
  svg = svg.replace(/(url\s*\(\s*)['"]?(?:https?:|\/\/|javascript:)/gi, "$1'");
  // Chỉ chèn xmlns khi thiếu (trùng thuộc tính là lỗi XML → trình duyệt từ chối render)
  if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(svg)) {
    svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  } else {
    svg = svg.replace(/(xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']\s*)\1+/gi, "$1");
  }
  svg = svg.replace(/<svg\b/i, '<svg role="img" aria-hidden="true"');
  if (svg.length > WM_LOGO_MAX_BYTES) return { ok: false, error: "SVG_QUÁ_LỚN" };
  return { ok: true, svg };
}

/** Đọc kích thước PNG từ base64 (IHDR) — không cần thư viện. */
function pngSizeFromBase64(b64) {
  try {
    const bin = atob(b64.slice(0, 64));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
    const dv = new DataView(bytes.buffer);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  } catch { return null; }
}

/**
 * PNG (hoặc ảnh raster bất kỳ) → file SVG.
 * Cách làm: giữ nguyên dữ liệu ảnh gốc, nhúng vào <image> trong một SVG có
 * viewBox đúng kích thước. Kết quả là .svg thật, trong suốt, không vỡ hạt ở
 * bất kỳ cỡ nào (vì trình duyệt render raster bên trong SVG), và KHÔNG cần
 * thư viện trace trên server.
 */
function rasterToSvg(dataUrl, mime) {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || "").trim());
  if (!m) return { ok: false, error: "DATA_URL_KHONG_HOP_LE" };
  const type = (mime || m[1]).toLowerCase();
  const b64 = m[2].replace(/\s+/g, "");
  if (b64.length * 0.75 > WM_LOGO_MAX_BYTES) return { ok: false, error: "ANH_QUA_LON" };
  let size = null;
  if (type.includes("png")) size = pngSizeFromBase64(b64);
  const w = (size && size.w) || 512;
  const h = (size && size.h) || 512;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<title>CHRTV logo</title>` +
    `<image href="data:${type};base64,${b64}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>` +
    `</svg>`;
  return { ok: true, svg };
}

// ---- Đọc/ghi cấu hình (D1) + cache in-memory 30s ----
let _wmCache = null; // { at, cfg, hasLogo, version }
async function readWatermarkState(env) {
  const now = Date.now();
  if (_wmCache && now - _wmCache.at < 30000) return _wmCache;
  const cfg = watermarkDefaults();
  let hasLogo = false, updatedAt = 0, logoBytes = 0;
  if (hasDB(env)) {
    try {
      const { results } = await env.DB.prepare(
        "SELECT key, value, updated_at FROM site_config WHERE key IN ('watermark','watermark_logo','watermark_meta')"
      ).all();
      for (const row of results || []) {
        if (row.key === "watermark") {
          const merged = normalizeWatermark(row.value);
          Object.assign(cfg, merged);
          updatedAt = Math.max(updatedAt, Number(row.updated_at) || 0);
        } else if (row.key === "watermark_logo") {
          hasLogo = !!(row.value && row.value.length);
          logoBytes = (row.value || "").length;
          updatedAt = Math.max(updatedAt, Number(row.updated_at) || 0);
        }
      }
    } catch (e) { console.error("[watermark] read lỗi:", e?.message || e); }
  }
  cfg.version = updatedAt || 1;
  cfg.updated_at = updatedAt;
  const out = { at: now, cfg, hasLogo, logoBytes };
  _wmCache = out;
  return out;
}
async function writeWatermarkState(env, cfg) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT OR REPLACE INTO site_config (key, value, updated_at) VALUES (?, ?, ?)")
    .bind("watermark", JSON.stringify(cfg), now).run();
  _wmCache = null;
  return now;
}

/** GET /api/watermark — client dùng để lấy cấu hình chung + đường dẫn logo. */
async function handleWatermarkPublic(request, env) {
  const st = await readWatermarkState(env);
  const cfg = { ...st.cfg };
  cfg.logo_url = cfg.logo_url || (st.hasLogo ? `/api/watermark/logo?v=${cfg.version}` : "/watermark.svg");
  return new Response(JSON.stringify({ success: true, config: cfg, has_custom_logo: st.hasLogo }), {
    status: 200,
    headers: jsonHeaders(request, env, { "Cache-Control": "public, max-age=20, s-maxage=120, stale-while-revalidate=600" }),
  });
}

/** GET /api/watermark/logo — phát nội dung SVG admin đã upload (đã sanitize khi lưu). */
async function handleWatermarkLogo(request, env) {
  if (!hasDB(env)) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  let row = null;
  try {
    row = await env.DB.prepare("SELECT value FROM site_config WHERE key = 'watermark_logo'").first();
  } catch { row = null; }
  if (!row || !row.value) {
    // Chưa upload gì → trỏ về file đóng gói trong app (admin thay file đó cũng được)
    return new Response(null, { status: 302, headers: { Location: "/watermark.svg" } });
  }
  return new Response(row.value, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}

/**
 * Admin: /admin/watermark*
 *   GET    /admin/watermark            → cấu hình + danh sách kênh có tuỳ chỉnh
 *   POST   /admin/watermark            → lưu cấu hình chung
 *   POST   /admin/watermark/logo       → { svg } hoặc { image: "data:image/png;base64,." } (PNG tự đổi sang SVG)
 *   DELETE /admin/watermark/logo       → xoá logo upload, quay về /watermark.svg
 *   POST   /admin/watermark/channel    → { channel_id, wm }  (wm = null/'' để xoá tuỳ chỉnh)
 *   DELETE /admin/watermark/channel    → { channel_id }
 *   POST   /admin/watermark/group      → { group_title, wm }  áp hàng loạt cho 1 nhóm kênh
 *   POST   /admin/watermark/clear-all  → xoá mọi tuỳ chỉnh theo kênh
 */
async function handleAdminWatermark(path, request, env, adminCtx) {
  const adminUser = adminCtx && adminCtx.adminUser;
  const aid = (adminUser && adminUser.id) || 0;
  const method = request.method;
  const body = method === "GET" ? {} : await request.json().catch(() => ({}));

  if (path === "/admin/watermark" && method === "GET") {
    const st = await readWatermarkState(env);
    const over = await env.DB.prepare(
      "SELECT w.channel_id, w.wm, w.updated_at, c.name, c.group_title FROM channel_watermark w LEFT JOIN channels c ON c.channel_id = w.channel_id ORDER BY c.name ASC LIMIT 400"
    ).all().catch(() => ({ results: [] }));
    const total = await env.DB.prepare("SELECT COUNT(*) AS c FROM channels WHERE is_active = 1").first().catch(() => ({ c: 0 }));
    const groups = await env.DB.prepare("SELECT DISTINCT group_title FROM channels WHERE is_active = 1 AND group_title <> '' ORDER BY group_title LIMIT 300").all().catch(() => ({ results: [] }));
    return json({
      success: true,
      config: st.cfg,
      logo: { has_custom: st.hasLogo, bytes: st.logoBytes || 0 },
      channels: (over.results || []).map((r) => ({ channel_id: r.channel_id, name: r.name || r.channel_id, group_title: r.group_title || "", wm: r.wm, updated_at: r.updated_at })),
      groups: (groups.results || []).map((g) => g.group_title),
      total_channels: (total && total.c) || 0,
    }, 200, request, env);
  }

  if (path === "/admin/watermark" && method === "POST") {
    const cur = (await readWatermarkState(env)).cfg;
    const next = normalizeWatermark({ ...cur, ...body, version: undefined, updated_at: undefined });
    const now = await writeWatermarkState(env, next);
    next.version = now;
    try { await logAudit(env, aid, "watermark.save", { enabled: next.enabled, pos: next.pos, size: next.size, style: next.style }); } catch {}
    return json({ success: true, config: next }, 200, request, env);
  }

  if (path === "/admin/watermark/logo") {
    if (method === "DELETE") {
      await env.DB.prepare("DELETE FROM site_config WHERE key = 'watermark_logo'").run();
      await writeWatermarkState(env, { ...(await readWatermarkState(env)).cfg, logo_url: "" });
      try { await logAudit(env, aid, "watermark.logo.delete", {}); } catch {}
      return json({ success: true, message: "Đã quay về logo đóng gói trong app (/watermark.svg)" }, 200, request, env);
    }
    if (method !== "POST") return json({ error: "Method không hỗ trợ" }, 405, request, env);
    let svg = "";
    let converted = false;
    if (body.svg) {
      const s = sanitizeSvg(body.svg);
      if (!s.ok) return json({ error: "SVG không hợp lệ" + (s.error ? ` (${s.error})` : ""), code: s.error }, 400, request, env);
      svg = s.svg;
    } else if (body.image) {
      const mime = String(body.mime || "").toLowerCase();
      const c = rasterToSvg(body.image, mime);
      if (!c.ok) return json({ error: "Không chuyển được ảnh sang SVG", code: c.error }, 400, request, env);
      const s = sanitizeSvg(c.svg);
      if (!s.ok) return json({ error: `SVG sau khi chuyển không hợp lệ (${s.error})`, code: s.error }, 400, request, env);
      svg = s.svg;
      converted = true;
    } else {
      return json({ error: "Thiếu `svg` hoặc `image`" }, 400, request, env);
    }
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("INSERT OR REPLACE INTO site_config (key, value, updated_at) VALUES ('watermark_logo', ?, ?)").bind(svg, now).run();
    const cur = (await readWatermarkState(env)).cfg;
    await writeWatermarkState(env, { ...cur, logo_url: `/api/watermark/logo?v=${now}` });
    try { await logAudit(env, aid, "watermark.logo.set", { bytes: svg.length, converted }); } catch {}
    return json({
      success: true, bytes: svg.length, converted,
      logo_url: `/api/watermark/logo?v=${now}`,
      message: converted ? "Đã chuyển ảnh thành SVG và lưu xong." : "Đã lưu SVG.",
    }, 200, request, env);
  }

  if (path === "/admin/watermark/channel") {
    const cid = String(body.channel_id || "").trim().slice(0, 80);
    if (method === "DELETE") {
      if (!cid) return json({ error: "Thiếu channel_id" }, 400, request, env);
      await env.DB.prepare("DELETE FROM channel_watermark WHERE channel_id = ?").bind(cid).run();
      try { await logAudit(env, aid, "watermark.channel.clear", { channel_id: cid }); } catch {}
      return json({ success: true }, 200, request, env);
    }
    if (method !== "POST") return json({ error: "Method không hỗ trợ" }, 405, request, env);
    if (!cid) return json({ error: "Thiếu channel_id" }, 400, request, env);
    const wm = normalizeWatermark(body.wm, { partial: true });
    if (!wm) {
      await env.DB.prepare("DELETE FROM channel_watermark WHERE channel_id = ?").bind(cid).run();
      return json({ success: true, cleared: true, message: "Kênh này trở lại dùng cấu hình chung." }, 200, request, env);
    }
    await env.DB.prepare("INSERT OR REPLACE INTO channel_watermark (channel_id, wm, updated_at) VALUES (?, ?, ?)")
      .bind(cid, JSON.stringify(wm), Math.floor(Date.now() / 1000)).run();
    try { await logAudit(env, aid, "watermark.channel.set", { channel_id: cid, wm }); } catch {}
    return json({ success: true, wm }, 200, request, env);
  }

  if (path === "/admin/watermark/group" && method === "POST") {
    const group = String(body.group_title || "").trim().slice(0, 120);
    if (!group) return json({ error: "Thiếu group_title" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT channel_id FROM channels WHERE is_active = 1 AND group_title = ? LIMIT 500").bind(group).all();
    const ids = (results || []).map((r) => r.channel_id);
    if (!ids.length) return json({ error: "Nhóm không có kênh nào", code: "EMPTY_GROUP" }, 404, request, env);
    const wm = normalizeWatermark(body.wm, { partial: true });
    const now = Math.floor(Date.now() / 1000);
    const wmStr = wm ? JSON.stringify(wm) : "";
    const stmts = ids.map((cid) => wmStr
      ? env.DB.prepare("INSERT OR REPLACE INTO channel_watermark (channel_id, wm, updated_at) VALUES (?, ?, ?)").bind(cid, wmStr, now)
      : env.DB.prepare("DELETE FROM channel_watermark WHERE channel_id = ?").bind(cid));
    if (typeof env.DB.batch === "function") {
      for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    } else {
      for (const s of stmts) await s.run();
    }
    try { await logAudit(env, aid, "watermark.group.apply", { group, count: ids.length, cleared: !wmStr }); } catch {}
    return json({ success: true, affected: ids.length, cleared: !wmStr }, 200, request, env);
  }

  if (path === "/admin/watermark/clear-all" && method === "POST") {
    await env.DB.prepare("DELETE FROM channel_watermark").run();
    try { await logAudit(env, aid, "watermark.clear_all", {}); } catch {}
    return json({ success: true, message: "Đã xoá tuỳ chỉnh của mọi kênh." }, 200, request, env);
  }

  return json({ error: "Not found" }, 404, request, env);
}

// ========== AUTH ==========
async function handleAuth(path, request, env, ctx) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  // QR login routes — must be handled inside handleAuth because fetch router dispatches /auth/* here
  if (path.startsWith("/auth/qr/")) return await handleQrLogin(request, env);
  const ip = request.headers.get("CF-Connecting-IP") || "local";

  // P2 (verify brute-force): rate-limit TOÀN BỘ /auth/* theo IP.
  // Ngưỡng cũ 20 req/phút quá chặt: màn QR đăng nhập poll /auth/qr/poll mỗi 2s
  // (~30 req/phút) là đủ tự khoá chính mình → user gõ mật khẩu đúng vẫn nhận 429.
  // Nay: endpoint poll có ngưỡng riêng rộng (120/phút), các endpoint auth còn lại 40/phút.
  try {
    const isPoll = path === "/auth/qr/poll";
    const g = isPoll
      ? await rateLimitCheck(env, "authpoll:ip:" + ip, 120, 60)
      : await rateLimitCheck(env, "auth:ip:" + ip, 40, 60);
    if (!g.allowed) return json({ error: "Quá nhiều request — thử lại sau.", code: "RATE_LIMITED", retry_after: g.retryAfter }, 429, request, env);
  } catch (e) { /* DB lỗi — bỏ qua rate limit, vẫn có lockout riêng từng endpoint */ }

  // Quản lý phiên đăng nhập (xem + đá thiết bị)
  if (path === "/auth/sessions") return await handleSessions(request, env);

  const body = await request.json().catch(() => ({}));

  // Register
  if (path === "/auth/register") {
    const reg = await rateLimitCheck(env, "reg:ip:" + ip, 5, 3600);
    if (!reg.allowed) return json({ error: "Quá nhiều tài khoản đăng ký từ IP này — thử lại sau.", code: "RATE_LIMITED" }, 429, request, env);
    const { username, email, password } = body;
    if (!username || !email || !password) return json({ error: "Thiếu thông tin" }, 400, request, env);
    if (password.length < 6) return json({ error: "Mật khẩu ≥ 6 ký tự" }, 400, request, env);

    const hash = hashPassword(password, env);
    const verifyCode = randomDigits(6); // CSPRNG — KHÔNG dùng Math.random
    const verifyExpires = Math.floor(Date.now() / 1000) + 600; // 10 phút

    let newUserId = 0;
    try {
      const r = await env.DB.prepare("INSERT INTO users (username, email, password_hash, verify_code, verify_expires, plan) VALUES (?, ?, ?, ?, ?, 'standard')").bind(username, email, hash, verifyCode, verifyExpires).run();
      newUserId = r.meta?.last_row_id || r.lastInsertRowid || 0;
    } catch (e) {
      if (e.message?.includes("UNIQUE")) return json({ error: "Username hoặc email đã tồn tại" }, 409, request, env);
      console.error("register INSERT error:", e?.message || e);
      return json({ error: "Lỗi đăng ký: " + (e?.message || "database") }, 500, request, env);
    }
    // Auto gán gói standard — insert vào user_plans để plan luôn tồn tại
    try {
      if (newUserId) {
        const nowSec = Math.floor(Date.now() / 1000);
        await env.DB.prepare("INSERT OR IGNORE INTO user_plans (user_id, plan, expires_at, updated_at) VALUES (?, 'standard', 0, ?)").bind(newUserId, nowSec).run();
      }
    } catch (e) {
      console.error("register plan auto error:", e?.message || e);
    }
    // Gửi email qua Brevo — KHÔNG trả mã về client khi gửi email thành công
    let emailSent = false;
    let emailError = "";
    try {
      const tmpl = emailTemplateVerify(verifyCode);
      const sent = await sendBrevoEmail(env, { to: email, subject: tmpl.subject, html: tmpl.html });
      emailSent = sent.ok;
      if (!sent.ok) emailError = sent.reason || sent.error || "unknown";
    } catch (e) {
      emailError = e?.message || String(e);
      console.error("Brevo send error (non-blocking):", emailError);
    }
    console.log(`[AUTH/register] user=${username} email=${email} emailSent=${emailSent}${emailError ? " err=" + emailError : ""}`);
    // Khi gửi email THÀNH CÔNG: không bao giờ trả verifyCode về response (tránh lộ mã qua F12).
    // Khi gửi THẤT BẠI (chưa cấu hình BREVO_API_KEY / Brevo lỗi): trả devCode kèm cảnh báo
    // để người dùng không bị kẹt ở bước xác minh — thêm key env là flow email tự bật lại.
    const resp = {
      success: true,
      emailSent,
      message: emailSent
        ? "Đăng ký thành công! Mã xác minh 6 số đã được gửi đến email của bạn."
        : "Đăng ký thành công nhưng CHƯA gửi được email xác minh (" + (emailError || "lỗi không rõ") + "). Hãy cấu hình BREVO_API_KEY trên Worker.",
    };
    if (!emailSent) resp.devCode = verifyCode;
    return json(resp, 200, request, env);
  }

  // Login
  if (path === "/auth/login") {
    let { login, password } = body;
    login = String(login || "").trim();
    password = String(password || "");
    if (!login || !password) return json({ error: "Thiếu thông tin" }, 400, request, env);

    // RATE LIMIT: sai nhiều lần trong 15 phút → khoá tạm.
    //  - theo TÀI KHOẢN: 5 lần (chống dò mật khẩu 1 user)
    //  - theo IP: 20 lần (nới ra vì nhà mạng VN dùng CGNAT — nhiều user chung 1 IP,
    //    ngưỡng 5 chung làm người dùng vô can bị khoá dù gõ đúng mật khẩu)
    try {
      const { results: fails } = await env.DB.prepare(
        "SELECT SUM(CASE WHEN login = ? THEN 1 ELSE 0 END) AS byLogin, COUNT(*) AS byIp FROM login_attempts WHERE (login = ? OR ip = ?) AND created_at > datetime('now', '-15 minutes')"
      ).bind(login, login, ip).all();
      const byLogin = fails[0]?.byLogin || 0;
      const byIp = fails[0]?.byIp || 0;
      if (byLogin >= 5 || byIp >= 20) {
        return json({ error: "Đăng nhập sai quá nhiều lần. Tạm khoá 15 phút — thử lại sau hoặc đặt lại mật khẩu.", code: "RATE_LIMITED" }, 429, request, env);
      }
    } catch (e) { /* bảng chưa có — bỏ qua */ }

    const hash = hashPassword(password, env);

    try {
      // FIX VIP: SELECT phải kèm plan để client biết gói sau khi đăng nhập lại
      // So sánh email/username KHÔNG phân biệt hoa thường (người dùng hay gõ sai case)
      let results = [];
      try {
        const r = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified, banned, totp_secret, totp_enabled, plan, password_hash FROM users WHERE (LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?))").bind(login, login).all();
        results = r.results || [];
      } catch {
        const r2 = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified, banned, totp_secret, totp_enabled, password_hash FROM users WHERE (LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?))").bind(login, login).all();
        results = r2.results || [];
      }
      if (results.length === 0) {
        try { await env.DB.prepare("INSERT INTO login_attempts (login, ip) VALUES (?, ?)").bind(login, ip).run(); } catch {}
        return json({ error: "Tài khoản không tồn tại — kiểm tra lại tên đăng nhập/email.", code: "NO_ACCOUNT" }, 401, request, env);
      }
      const user = results[0];
      // Kiểm tra mật khẩu qua verifyPassword(): chấp nhận hash chuẩn hiện tại,
      // hash theo secret CŨ (LEGACY_PASSWORD_PEPPERS/LEGACY_JWT_SECRETS) và hash
      // sha256 đời đầu — khớp bằng lược đồ cũ thì tự nâng cấp sang hash chuẩn.
      const pw = verifyPassword(password, user.password_hash, env);
      if (pw.ok && pw.needsRehash) {
        try { await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hash, user.id).run(); } catch {}
      }
      if (!pw.ok) {
        try { await env.DB.prepare("INSERT INTO login_attempts (login, ip) VALUES (?, ?)").bind(login, ip).run(); } catch {}
        return json({ error: "Sai mật khẩu — thử lại hoặc bấm Quên mật khẩu.", code: "WRONG_PASSWORD" }, 401, request, env);
      }

      // Tài khoản bị admin khoá
      if (user.banned) {
        return json({ error: "Tài khoản đã bị khoá bởi quản trị viên.", code: "BANNED" }, 403, request, env);
      }

      // BẮT BUỘC xác minh email trước khi đăng nhập (trừ admin để không tự khoá chính mình)
      if (!user.email_verified && user.role !== "admin") {
        return json({
          success: false,
          error: "Tài khoản chưa xác minh email. Kiểm tra hộp thư (cả Spam) hoặc bấm \"Gửi lại mã\".",
          code: "EMAIL_NOT_VERIFIED",
          email: user.email,
        }, 403, request, env);
      }

      // 2FA TOTP: bật thì bắt nhập mã từ Authenticator
      if (user.totp_enabled) {
        if (!body.totp) {
          return json({ success: false, error: "Nhập mã 2FA (6 số) từ Google Authenticator.", code: "TOTP_REQUIRED", email: user.email }, 401, request, env);
        }
        const okTotp = await verifyTOTP(user.totp_secret, String(body.totp));
        if (!okTotp) {
          try { await env.DB.prepare("INSERT INTO login_attempts (login, ip) VALUES (?, ?)").bind(login, ip).run(); } catch {}
          return json({ error: "Mã 2FA không đúng.", code: "TOTP_INVALID" }, 401, request, env);
        }
      }

      // Đăng nhập OK → xoá nhật ký sai của tài khoản + IP này
      try { await env.DB.prepare("DELETE FROM login_attempts WHERE login = ? OR ip = ?").bind(login, ip).run(); } catch {}

      const token = generateJWT(user.id, env);
      const expires = Date.now() + 30 * 24 * 3600 * 1000;
      try {
        await env.DB.prepare("INSERT INTO sessions (user_id, token, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)").bind(user.id, token, expires, (request.headers.get("User-Agent") || "").slice(0, 160), (request.headers.get("CF-Connecting-IP") || "").slice(0, 45)).run();
      } catch {
        try {
          await env.DB.prepare("INSERT INTO sessions (user_id, token, expires_at, user_agent) VALUES (?, ?, ?, ?)").bind(user.id, token, expires, (request.headers.get("User-Agent") || "").slice(0, 160)).run();
        } catch {
          await env.DB.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)").bind(user.id, token, expires).run();
        }
      }

      // (#48) Báo đăng nhập lạ qua email — chạy nền, không làm chậm đăng nhập
      if (ctx && ctx.waitUntil) { try { ctx.waitUntil(maybeNewDeviceAlert(env, user.id, request)); } catch {} }

      // Track analytics
      try { await env.DB.prepare("INSERT INTO analytics (event, user_id, data) VALUES ('login', ?, ?)").bind(user.id, JSON.stringify({ login })).run(); } catch {}

      if (!user.plan) user.plan = "standard";
      try { delete user.totp_secret; delete user.password_hash; } catch {}
      return json({ success: true, token, user }, 200, request, env);
    } catch (e) {
      return json({ error: "Lỗi đăng nhập" }, 500, request, env);
    }
  }

  // Verify email
  if (path === "/auth/verify") {
    const { email, code } = body;
    if (!email || !code) return json({ error: "Thiếu thông tin" }, 400, request, env);

    // P2: tối đa 5 LẦN THỬ (sai) cho 1 mã trong 15 phút → huỷ mã, phải "gửi lại mã"
    // (đếm theo email, không phụ thuộc IP — chống brute-force cả khi đổi IP)
    const vk = "verify:" + String(email).toLowerCase().trim();
    try {
      const pre = await rateLimitCheck(env, vk, 5, 900);
      if (!pre.allowed) {
        try { await env.DB.prepare("UPDATE users SET verify_code = '' WHERE email = ?").bind(String(email)).run(); } catch {}
        return json({ error: "Mã đã bị khoá do quá nhiều lần thử sai. Bấm \u201CGửi lại mã\u201D để nhận mã mới.", code: "VERIFY_LOCKED" }, 429, request, env);
      }
    } catch {}

    try {
      const nowSec = Math.floor(Date.now() / 1000);
      // Message GIỐNG NHAU cho: email không tồn tại / mã sai / hết hạn — không lộ email có tồn tại (P2.4)
      const { results } = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND verify_code = ? AND verify_expires > ?").bind(String(email), String(code).trim(), nowSec).all();
      if (results.length === 0) return json({ error: "Mã không hợp lệ hoặc đã hết hạn" }, 400, request, env);

      // 1 mã dùng 1 lần: xoá mã ngay sau khi verify thành công + xoá bộ đếm thử sai
      await env.DB.prepare("UPDATE users SET email_verified = 1, verify_code = '', verify_expires = 0 WHERE email = ?").bind(String(email)).run();
      try { await env.DB.prepare("DELETE FROM rate_limits WHERE key = ?").bind(vk).run(); } catch {}
      return json({ success: true, message: "Email đã xác minh!" }, 200, request, env);
    } catch {
      return json({ error: "Lỗi xác minh" }, 500, request, env);
    }
  }

  // Forgot password
  if (path === "/auth/forgot") {
    const { email } = body;
    if (!email) return json({ error: "Thiếu email" }, 400, request, env);
    // P2: giới hạn 3 lần/hour/email để không spam email reset
    const fk = await rateLimitCheck(env, "forgot:" + String(email).toLowerCase().trim(), 3, 3600);
    if (!fk.allowed) return json({ success: true, message: "Nếu email tồn tại, link đặt lại đã được gửi." }, 429, request, env);
    const resetToken = generateToken().slice(0, 32);
    const resetExpires = Math.floor(Date.now() / 1000) + 1800; // 30 min

    try {
      const r = await env.DB.prepare("UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?").bind(resetToken, resetExpires, email).run();
      const updated = (r.meta?.changes ?? r.changes) > 0;
      if (!updated) return json({ success: true, message: "Nếu email tồn tại, link đặt lại đã được gửi." }, 200, request, env);
      // Gửi email qua Brevo
      const tmpl = emailTemplateReset(resetToken);
      const sent = await sendBrevoEmail(env, { to: email, subject: tmpl.subject, html: tmpl.html });
      // Dev xem token trong console (không trả về response)
      console.log(`[AUTH/forgot] email=${email} resetToken=${resetToken} emailSent=${sent.ok}`);
      return json({ success: true, message: "Đã gửi liên kết đặt lại mật khẩu đến email của bạn.", emailSent: sent.ok }, 200, request, env);
    } catch (e) {
      console.error("forgot error:", e);
      return json({ success: true, message: "Nếu email tồn tại, link đặt lại đã được gửi." }, 200, request, env);
    }
  }

  // Reset password
  if (path === "/auth/reset") {
    const rk = await rateLimitCheck(env, "reset:ip:" + ip, 5, 3600);
    if (!rk.allowed) return json({ error: "Quá nhiều lần đặt lại — thử lại sau.", code: "RATE_LIMITED" }, 429, request, env);
    const { token, newPassword } = body;
    if (!token || !newPassword) return json({ error: "Thiếu thông tin" }, 400, request, env);
    if (newPassword.length < 6) return json({ error: "Mật khẩu ≥ 6 ký tự" }, 400, request, env);

    try {
      const { results } = await env.DB.prepare("SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?").bind(token, Math.floor(Date.now() / 1000)).all();
      if (results.length === 0) return json({ error: "Token không hợp lệ hoặc hết hạn" }, 400, request, env);

      await env.DB.prepare("UPDATE users SET password_hash = ?, reset_token = '', reset_expires = 0 WHERE reset_token = ?").bind(hashPassword(newPassword, env), token).run();
      return json({ success: true, message: "Đặt lại mật khẩu thành công!" }, 200, request, env);
    } catch {
      return json({ error: "Lỗi đặt lại" }, 500, request, env);
    }
  }

  // Resend verify
  if (path === "/auth/resend-verify") {
    const { email } = body;
    if (!email) return json({ error: "Thiếu email" }, 400, request, env);
    // P2: tối đa 3 lần gửi lại / giờ / email
    const sk = await rateLimitCheck(env, "resend:" + String(email).toLowerCase().trim(), 3, 3600);
    if (!sk.allowed) return json({ success: false, error: "Đã gửi lại quá nhiều lần — thử lại sau 1 giờ." }, 429, request, env);
    const code = randomDigits(6); // CSPRNG
    try {
      // Chống spam resend: nếu mã cũ còn mới (< 60s) thì bắt đợi thêm
      const { results: recent } = await env.DB.prepare("SELECT verify_expires FROM users WHERE email = ? AND email_verified = 0").bind(email).all();
      if (recent.length > 0 && (recent[0].verify_expires || 0) - 540 > Math.floor(Date.now() / 1000)) {
        return json({ success: false, error: "Vừa gửi mã rồi — đợi khoảng 1 phút nữa nhé." }, 429, request, env);
      }
      const r = await env.DB.prepare("UPDATE users SET verify_code = ?, verify_expires = ? WHERE email = ? AND email_verified = 0").bind(code, Math.floor(Date.now() / 1000) + 600, email).run();
      const updated = (r.meta?.changes ?? r.changes) > 0;
      if (!updated) return json({ success: true, message: "Email không tồn tại hoặc đã xác minh." }, 200, request, env);
      const tmpl = emailTemplateVerify(code);
      const sent = await sendBrevoEmail(env, { to: email, subject: tmpl.subject, html: tmpl.html });
      console.log(`[AUTH/resend] email=${email} emailSent=${sent.ok}`);
      const resp = { success: true, emailSent: sent.ok, message: sent.ok ? "Mã xác minh mới đã được gửi đến email." : "Chưa gửi được email — kiểm tra cấu hình Brevo trên Worker." };
      if (!sent.ok) resp.devCode = code; // dev fallback khi chưa cấu hình email
      return json(resp, 200, request, env);
    } catch (e) {
      return json({ error: "Lỗi" }, 500, request, env);
    }
  }

  // Guest session (P0-B): JWT ngắn hạn cho khách vãng lai — xem kênh FTA theo mức
  // Standard mà không cần tài khoản. Đây là phiên "đã đăng nhập" hợp lệ (userId=0)
  // nên mọi endpoint /api/stream/* vẫn buộc qua kiểm tra JWT + entitlement phía server.
  if (path === "/auth/guest" && (request.method === "GET" || request.method === "POST")) {
    const gk = await rateLimitCheck(env, "guest:ip:" + ip, 20, 3600);
    if (!gk.allowed) return json({ error: "Quá nhiều phiên khách từ IP này — thử lại sau.", code: "RATE_LIMITED" }, 429, request, env);
    const token = generateJWT(0, env, { role: "guest", plan: "standard", ttlMs: GUEST_TTL * 1000 });
    return json({ success: true, token, guest: true, exp: Math.floor(Date.now() / 1000) + GUEST_TTL }, 200, request, env);
  }

  return json({ error: "Not found" }, 404, request, env);
}

// ========== USER ==========
async function handleUser(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401, request, env);

  // ========== GÓI CƯỚC (đăng ký gói) — tạm thời FREE toàn bộ ==========
  const PLANS = {
    standard:     { code: "standard",     name: "Standard",     rank: 1, price: 0, priceText: "TẠM FREE", allows: "Các kênh VTV" },
    recreational: { code: "recreational", name: "Recreational", rank: 2, price: 0, priceText: "TẠM FREE", allows: "VTV + BOX Giải trí" },
    ultimate:     { code: "ultimate",     name: "Ultimate",     rank: 3, price: 0, priceText: "TẠM FREE", allows: "VTV + BOX + Thể thao" },
    elite:        { code: "elite",        name: "Elite",        rank: 4, price: 0, priceText: "TẠM FREE", allows: "Thêm kênh Phim" },
    signature:    { code: "signature",    name: "Signature",    rank: 5, price: 0, priceText: "TẠM FREE", allows: "Tất cả mọi kênh" },
  };
  if (path === "/user/plan" && request.method === "GET") {
    let plans = PLANS;
    try {
      const { results } = await env.DB.prepare("SELECT code, name, rank, price, price_text, tagline, allows, color FROM plans WHERE is_active = 1 ORDER BY rank ASC").all();
      if (results && results.length) {
        plans = {};
        for (const pl of results) plans[pl.code] = { code: pl.code, name: pl.name, rank: Number(pl.rank) || 1, price: Number(pl.price) || 0, priceText: pl.price_text || "", tagline: pl.tagline || "", allows: JSON.parse(pl.allows || "[]"), color: pl.color || "#f36f21" };
      }
    } catch {}
    return json({ success: true, current: user.plan || "", plans, free: true, support: SUPPORT_EMAIL }, 200, request, env);
  }
  if (path === "/user/plan/activate" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const code = (body.plan || "").toLowerCase();
    let planName = PLANS[code]?.name || "";
    try {
      const { results } = await env.DB.prepare("SELECT name FROM plans WHERE code = ? AND is_active = 1").all();
      if (results && results.length) planName = results[0].name;
      else if (!PLANS[code]) return json({ error: "Gói không hợp lệ" }, 400, request, env);
    } catch {
      if (!PLANS[code]) return json({ error: "Gói không hợp lệ" }, 400, request, env);
    }
    await env.DB.prepare("UPDATE users SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(code, user.id).run();
    return json({ success: true, plan: code, price: 0, free: true, message: `Kích hoạt gói ${planName || code} thành công — hiện tạm miễn phí. Hỗ trợ: ${SUPPORT_EMAIL}`, support: SUPPORT_EMAIL }, 200, request, env);
  }

  // Get profile + profiles + settings
  if (path === "/user/profile" && request.method === "GET") {
    const { results: settings } = await env.DB.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(user.id).all();
    const { results: profiles } = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id = ? ORDER BY id ASC").bind(user.id).all();
    return json({ success: true, user, settings: settings[0] || {}, profiles }, 200, request, env);
  }

  // Update profile
  if (path === "/user/profile" && request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const { display_name, avatar_url } = body;
    if (display_name !== undefined) await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(display_name, user.id).run();
    if (avatar_url !== undefined) await env.DB.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").bind(avatar_url, user.id).run();
    return json({ success: true }, 200, request, env);
  }

  // Update settings
  if (path === "/user/settings" && request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const s = JSON.stringify(body);
    await env.DB.prepare("INSERT OR REPLACE INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").bind(user.id, s).run();
    return json({ success: true }, 200, request, env);
  }

  // Change password
  if (path === "/user/change-password" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { oldPassword, newPassword } = body;
    const logoutOthers = body.logoutOthers !== false; // mặc định: đá các thiết bị khác
    if (!oldPassword || !newPassword) return json({ error: "Thiếu thông tin" }, 400, request, env);
    if (String(newPassword).length < 6) return json({ error: "Mật khẩu mới ≥ 6 ký tự" }, 400, request, env);
    if (String(newPassword) === String(oldPassword)) return json({ error: "Mật khẩu mới phải khác mật khẩu cũ" }, 400, request, env);
    // Đọc hash rồi so bằng verifyPassword (hỗ trợ cả hash theo secret cũ) —
    // trước đây so trực tiếp trong SQL nên đổi secret là không đổi được mật khẩu.
    const { results } = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).all();
    if (results.length === 0) return json({ error: "Không tìm thấy tài khoản" }, 404, request, env);
    if (!verifyPassword(String(oldPassword), results[0].password_hash, env).ok) {
      return json({ error: "Sai mật khẩu cũ" }, 400, request, env);
    }
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hashPassword(String(newPassword), env), user.id).run();

    // Đổi mật khẩu = thu hồi phiên của các thiết bị khác (giữ lại thiết bị hiện tại)
    let sessionsRevoked = 0;
    if (logoutOthers) {
      const curToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      try {
        const r = await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").bind(user.id, curToken).run();
        sessionsRevoked = r.meta?.changes || r.changes || 0;
      } catch {}
    }
    try {
      await env.DB.prepare("INSERT INTO analytics (event, user_id, data) VALUES ('password_change', ?, ?)")
        .bind(user.id, JSON.stringify({ logoutOthers, sessionsRevoked })).run();
    } catch {}
    return json({ success: true, sessionsRevoked }, 200, request, env);
  }

  // Logout
  if (path === "/user/logout" && request.method === "POST") {
    const auth = request.headers.get("Authorization");
    if (auth) {
      try { await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(auth.slice(7)).run(); } catch {}
    }
    return json({ success: true }, 200, request, env);
  }

  // ========== SUB-PROFILES (Netflix-style who's watching) ==========
  if (path === "/user/profiles" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id = ? ORDER BY id ASC").bind(user.id).all();
    return json({ success: true, profiles: results }, 200, request, env);
  }

  if (path === "/user/profiles" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { name, avatar_url, is_child, pin } = body;
    if (!name) return json({ error: "Thiếu tên profile" }, 400, request, env);
    if (name.length > 20) return json({ error: "Tên profile quá dài (max 20)" }, 400, request, env);

    // Limit to 5 profiles per account
    const { results: count } = await env.DB.prepare("SELECT COUNT(*) as c FROM user_profiles WHERE user_id = ?").bind(user.id).all();
    if (count[0]?.c >= 5) return json({ error: "Tối đa 5 profile cho mỗi tài khoản" }, 400, request, env);

    try {
      const pinHash = pin ? hashPassword(pin, env) : "";
      const r = await env.DB.prepare("INSERT INTO user_profiles (user_id, name, avatar_url, is_child, pin_hash) VALUES (?, ?, ?, ?, ?)").bind(user.id, name, avatar_url || "", is_child ? 1 : 0, pinHash).run();
      return json({ success: true, id: r.meta?.last_row_id || r.lastInsertRowid }, 200, request, env);
    } catch (e) {
      return json({ error: "Lỗi tạo profile: " + (e.message || e) }, 500, request, env);
    }
  }

  if (path === "/user/profiles/update" && request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const { id, name, avatar_url, is_child, pin } = body;
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);

    // Verify profile belongs to user
    const { results: owned } = await env.DB.prepare("SELECT id FROM user_profiles WHERE id = ? AND user_id = ?").bind(id, user.id).all();
    if (owned.length === 0) return json({ error: "Profile không tồn tại" }, 403, request, env);

    if (name !== undefined) await env.DB.prepare("UPDATE user_profiles SET name = ? WHERE id = ?").bind(name, id).run();
    if (avatar_url !== undefined) await env.DB.prepare("UPDATE user_profiles SET avatar_url = ? WHERE id = ?").bind(avatar_url, id).run();
    if (is_child !== undefined) await env.DB.prepare("UPDATE user_profiles SET is_child = ? WHERE id = ?").bind(is_child ? 1 : 0, id).run();
    if (pin !== undefined) await env.DB.prepare("UPDATE user_profiles SET pin_hash = ? WHERE id = ?").bind(pin ? hashPassword(pin, env) : "", id).run();

    return json({ success: true }, 200, request, env);
  }

  if (path === "/user/profiles/delete" && request.method === "DELETE") {
    const body = await request.json().catch(() => ({}));
    const { id } = body;
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM user_profiles WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    return json({ success: true }, 200, request, env);
  }

  // PIN verification for kid profiles
  if (path === "/user/profiles/verify-pin" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { id, pin } = body;
    if (!id || !pin) return json({ error: "Thiếu thông tin" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT pin_hash FROM user_profiles WHERE id = ? AND user_id = ?").bind(id, user.id).all();
    if (results.length === 0) return json({ error: "Profile không tồn tại" }, 404, request, env);
    if (!results[0].pin_hash) return json({ success: true }, 200, request, env);
    const pinCheck = verifyPassword(String(pin), results[0].pin_hash, env);
    if (pinCheck.ok) {
      if (pinCheck.needsRehash) {
        try { await env.DB.prepare("UPDATE user_profiles SET pin_hash = ? WHERE id = ?").bind(hashPassword(String(pin), env), id).run(); } catch {}
      }
      return json({ success: true }, 200, request, env);
    }
    return json({ error: "PIN sai" }, 401, request, env);
  }

  // ========== 2FA TOTP ==========
  if (path === "/user/2fa/status" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT totp_enabled FROM users WHERE id = ?").bind(user.id).all();
    return json({ success: true, enabled: !!(results[0]?.totp_enabled) }, 200, request, env);
  }

  if (path === "/user/2fa/setup" && request.method === "POST") {
    const secret = generateTOTPSecret();
    await env.DB.prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?").bind(secret, user.id).run();
    const otpauth = `otpauth://totp/CHRTV:${encodeURIComponent(user.username || user.email)}?secret=${secret}&issuer=CHRTV&algorithm=SHA1&digits=6&period=30`;
    return json({ success: true, secret, otpauth }, 200, request, env);
  }

  if (path === "/user/2fa/verify" && request.method === "POST") {
    const { code } = await request.json().catch(() => ({}));
    const { results } = await env.DB.prepare("SELECT totp_secret FROM users WHERE id = ?").bind(user.id).all();
    const secret = results[0]?.totp_secret || "";
    if (!secret) return json({ error: "Chưa setup 2FA" }, 400, request, env);
    if (!(await verifyTOTP(secret, code))) return json({ error: "Mã 2FA không đúng — thử lại." }, 401, request, env);
    await env.DB.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").bind(user.id).run();
    await logAudit(env, user.id, "2fa.enable", { username: user.username });
    return json({ success: true, message: "Đã bật 2FA! Từ giờ đăng nhập cần mã Authenticator." }, 200, request, env);
  }

  if (path === "/user/2fa/disable" && request.method === "POST") {
    const { code } = await request.json().catch(() => ({}));
    const { results } = await env.DB.prepare("SELECT totp_secret, totp_enabled FROM users WHERE id = ?").bind(user.id).all();
    if (!results[0]?.totp_enabled) return json({ success: true }, 200, request, env);
    if (!(await verifyTOTP(results[0].totp_secret, code))) return json({ error: "Mã 2FA không đúng." }, 401, request, env);
    await env.DB.prepare("UPDATE users SET totp_secret = '', totp_enabled = 0 WHERE id = ?").bind(user.id).run();
    await logAudit(env, user.id, "2fa.disable", { username: user.username });
    return json({ success: true, message: "Đã tắt 2FA." }, 200, request, env);
  }

  // ========== WATCHLIST PHIM (My List) ==========
  if (path === "/user/watchlist" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT media_type, tmdb_id, title, poster_path, created_at FROM movie_watchlist WHERE user_id = ? ORDER BY id DESC LIMIT 100").bind(user.id).all();
    return json({ success: true, watchlist: results }, 200, request, env);
  }
  if (path === "/user/watchlist" && request.method === "POST") {
    const { media_type, tmdb_id, title, poster_path } = await request.json().catch(() => ({}));
    if (!tmdb_id) return json({ error: "Thiếu tmdb_id" }, 400, request, env);
    await env.DB.prepare("INSERT OR REPLACE INTO movie_watchlist (user_id, media_type, tmdb_id, title, poster_path) VALUES (?, ?, ?, ?, ?)")
      .bind(user.id, media_type === 'tv' ? 'tv' : 'movie', tmdb_id, title || "", poster_path || "").run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/user/watchlist" && request.method === "DELETE") {
    const { media_type, tmdb_id } = await request.json().catch(() => ({}));
    if (!tmdb_id) return json({ error: "Thiếu tmdb_id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM movie_watchlist WHERE user_id = ? AND media_type = ? AND tmdb_id = ?")
      .bind(user.id, media_type === 'tv' ? 'tv' : 'movie', tmdb_id).run();
    return json({ success: true }, 200, request, env);
  }

  // ========== ONBOARDING QUIZ (#61) — 3 câu hỏi → home cá nhân hoá ==========
  if (path === "/user/quiz" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT answers_json, done FROM user_quiz WHERE user_id = ?").bind(user.id).all();
    const row = results[0];
    return json({ success: true, quiz: row ? JSON.parse(row.answers_json || "{}") : null, done: !!(row && row.done) }, 200, request, env);
  }
  if (path === "/user/quiz" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    const answers = (b.answers && typeof b.answers === "object") ? b.answers : {};
    const done = b.done ? 1 : 0;
    await env.DB.prepare("INSERT INTO user_quiz (user_id, answers_json, done, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET answers_json = ?, done = ?, updated_at = ?")
      .bind(user.id, JSON.stringify(answers).slice(0, 2000), done, Math.floor(Date.now() / 1000), JSON.stringify(answers).slice(0, 2000), done, Math.floor(Date.now() / 1000)).run();
    return json({ success: true }, 200, request, env);
  }

  return json({ error: "Not found" }, 404, request, env);
}

// ========== ADMIN ==========
// P0-A: admin token Stream Engine từng bị lộ trong playlist công khai + bypass
// `Bearer JWT_SECRET` (secret nằm trong repo = công khai) => xoá. Giờ:
//   - JWT user role=admin (UI hiện tại), HOẶC ADMIN_MASTER_TOKEN (secret RIÊNG,
//     wrangler secret put; không set = bypass tắt hoàn toàn)
//   - ADMIN_ALLOWED_CIDRS (tuỳ chọn): chỉ cho IP admin vào /admin/*
//   - MỌI truy cập (thành công + bị từ chối) đều ghi audit_log; truy cập thành
//     công + đổi credential gửi alert qua ADMIN_ALERT_WEBHOOK (email/telegram)
function ipToLong(ip) {
  const m = String(ip || "").match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
  if (!m) return null;
  const p = m[0].split(".").map(Number);
  if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}
function ipInCidrList(ip, cidrs) {
  const ipN = ipToLong(ip);
  if (ipN === null) return false; // IPv6/invalid — không khớp list IPv4 => deny
  for (const entry of cidrs) {
    const [range, bitsStr] = String(entry).split("/");
    const bits = bitsStr ? parseInt(bitsStr, 10) : 32;
    const rN = ipToLong(range);
    if (rN === null || bits > 32) continue;
    const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
    if ((ipN & mask) === (rN & mask)) return true;
  }
  return false;
}
async function adminAlert(env, ctx, action, detail) {
  const hook = env && env.ADMIN_ALERT_WEBHOOK;
  if (!hook) return;
  try {
    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "chrtv-ott", action, ts: new Date().toISOString(), ...(detail || {}) }),
      }).catch(() => {}));
    }
  } catch {}
}

async function handleAdmin(path, request, env, ctx) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const ip = request.headers.get("CF-Connecting-IP") || "local";

  // Lớp 1 (tuỳ chọn): allowlist IP phía origin
  const cidrs = ((env.ADMIN_ALLOWED_CIDRS) || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (cidrs.length > 0 && !ipInCidrList(ip, cidrs)) {
    try { await logAudit(env, 0, "admin.denied_ip", { path, ip }); } catch {}
    return json({ error: "Forbidden" }, 403, request, env);
  }

  // Lớp 2: xác thực (JWT role=admin HOẶC ADMIN_MASTER_TOKEN)
  const auth = request.headers.get("Authorization") || "";
  let adminUser = null;
  let isMaster = false;
  if (env.ADMIN_MASTER_TOKEN && auth === `Bearer ${env.ADMIN_MASTER_TOKEN}`) {
    isMaster = true;
  } else {
    adminUser = await getUser(request, env);
    if (!adminUser || adminUser.role !== 'admin') {
      try { await logAudit(env, adminUser ? adminUser.id : 0, "admin.denied", { path, ip, ua: (request.headers.get("User-Agent") || "").slice(0, 80) }); } catch {}
      return json({ error: "Không có quyền admin" }, 403, request, env);
    }
  }
  // Lớp 3: audit mọi truy cập thành công + cảnh báo
  try { await logAudit(env, adminUser ? adminUser.id : 0, "admin.access", { path, ip, master: isMaster }); } catch {}
  adminAlert(env, ctx, "admin.access", { path, ip, user: adminUser ? adminUser.username : "master-token" });

  // ---- ĐỢT 48: khu vực admin mới (cảnh báo in-dash, vùng chặn, bảo trì, challenge, affiliate, realtime) ----
  if (path.startsWith("/admin/alerts") || path.startsWith("/admin/regions") || path.startsWith("/admin/maintenance") ||
      path.startsWith("/admin/challenges") || path.startsWith("/admin/affiliates") || path.startsWith("/admin/realtime") ||
      path.startsWith("/admin/wrapped") || path === "/admin/scheduled/preview") {
    return await handleAdminPack48(path, request, env, { adminUser, isMaster });
  }

  // ---- Logo watermark khi phát (cấu hình chung + theo kênh) — LOGO_WATERMARK.md ----
  if (path.startsWith("/admin/watermark")) return await handleAdminWatermark(path, request, env, { adminUser, isMaster });

  // Gói cước do admin quản lý
  if (path === "/admin/plans" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM plans ORDER BY rank ASC").all();
    return json({ success: true, plans: results || [] }, 200, request, env);
  }
  if (path === "/admin/plans" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const code = String(b.code || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!code || !b.name) return json({ error: "Thiếu code/tên gói" }, 400, request, env);
    const allows = Array.isArray(b.allows) ? b.allows : String(b.allows || "").split("\n").map(s => s.trim()).filter(Boolean);
    try {
      await env.DB.prepare("INSERT INTO plans (code, name, rank, price, price_text, tagline, allows, color, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(code, String(b.name).slice(0, 60), parseInt(b.rank) || 1, parseInt(b.price) || 0, String(b.price_text || "").slice(0, 40), String(b.tagline || "").slice(0, 120), JSON.stringify(allows).slice(0, 2000), String(b.color || "#f36f21").slice(0, 20), b.is_active === 0 ? 0 : 1).run();
    } catch (e) {
      if (String(e?.message || "").includes("UNIQUE")) return json({ error: "Mã gói đã tồn tại" }, 409, request, env);
      throw e;
    }
    _planRankCache = { at: 0, map: null };
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/plans" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (!b.code) return json({ error: "Thiếu code" }, 400, request, env);
    const allows = b.allows === undefined ? null : JSON.stringify(Array.isArray(b.allows) ? b.allows : String(b.allows || "").split("\n").map(s => s.trim()).filter(Boolean)).slice(0, 2000);
    await env.DB.prepare("UPDATE plans SET name = COALESCE(?, name), rank = COALESCE(?, rank), price = COALESCE(?, price), price_text = COALESCE(?, price_text), tagline = COALESCE(?, tagline), allows = COALESCE(?, allows), color = COALESCE(?, color), is_active = COALESCE(?, is_active) WHERE code = ?").bind(b.name ?? null, b.rank ?? null, b.price ?? null, b.price_text ?? null, b.tagline ?? null, allows, b.color ?? null, b.is_active ?? null, b.code).run();
    _planRankCache = { at: 0, map: null };
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/plans" && request.method === "DELETE") {
    const { code } = await request.json().catch(() => ({}));
    if (!code) return json({ error: "Thiếu code" }, 400, request, env);
    if (["standard", "recreational", "ultimate", "elite", "signature"].includes(String(code).toLowerCase())) return json({ error: "Không xoá gói mặc định — hãy tắt hiển thị." }, 400, request, env);
    await env.DB.prepare("DELETE FROM plans WHERE code = ?").bind(code).run();
    _planRankCache = { at: 0, map: null };
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/events" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM events ORDER BY sort_order ASC, id DESC").all();
    return json({ success: true, events: results || [] }, 200, request, env);
  }
  if (path === "/admin/events" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (!b.title) return json({ error: "Thiếu tiêu đề" }, 400, request, env);
    await env.DB.prepare("INSERT INTO events (title, subtitle, image_url, link_type, link_value, starts_at, ends_at, is_active, sort_order, blocked_regions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(String(b.title).slice(0, 120), String(b.subtitle || "").slice(0, 300), String(b.image_url || "").slice(0, 500), String(b.link_type || "none").slice(0, 20), String(b.link_value || "").slice(0, 300), String(b.starts_at || "").slice(0, 19), String(b.ends_at || "").slice(0, 19), b.is_active === 0 ? 0 : 1, parseInt(b.sort_order) || 0, cleanRegionList(b.blocked_regions).join(",")).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/events" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("UPDATE events SET title = COALESCE(?, title), subtitle = COALESCE(?, subtitle), image_url = COALESCE(?, image_url), link_type = COALESCE(?, link_type), link_value = COALESCE(?, link_value), starts_at = COALESCE(?, starts_at), ends_at = COALESCE(?, ends_at), is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order), blocked_regions = COALESCE(?, blocked_regions) WHERE id = ?").bind(b.title ?? null, b.subtitle ?? null, b.image_url ?? null, b.link_type ?? null, b.link_value ?? null, b.starts_at ?? null, b.ends_at ?? null, b.is_active ?? null, b.sort_order ?? null, b.blocked_regions === undefined ? null : cleanRegionList(b.blocked_regions).join(","), b.id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/events" && request.method === "DELETE") {
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/sports-videos" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM sports_videos ORDER BY sort_order ASC, id DESC").all();
    return json({ success: true, videos: results || [] }, 200, request, env);
  }
  if (path === "/admin/sports-videos" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (!b.title || !b.video_url) return json({ error: "Thiếu tiêu đề/link video" }, 400, request, env);
    await env.DB.prepare("INSERT INTO sports_videos (title, league, thumb_url, video_url, duration, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(String(b.title).slice(0, 160), String(b.league || "").slice(0, 60), String(b.thumb_url || "").slice(0, 500), String(b.video_url).slice(0, 500), String(b.duration || "").slice(0, 20), b.is_active === 0 ? 0 : 1, parseInt(b.sort_order) || 0).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/sports-videos" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("UPDATE sports_videos SET title = COALESCE(?, title), league = COALESCE(?, league), thumb_url = COALESCE(?, thumb_url), video_url = COALESCE(?, video_url), duration = COALESCE(?, duration), is_active = COALESCE(?, is_active), sort_order = COALESCE(?, sort_order) WHERE id = ?").bind(b.title ?? null, b.league ?? null, b.thumb_url ?? null, b.video_url ?? null, b.duration ?? null, b.is_active ?? null, b.sort_order ?? null, b.id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/sports-videos" && request.method === "DELETE") {
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM sports_videos WHERE id = ?").bind(id).run();
    return json({ success: true }, 200, request, env);
  }
  // ---- CHỦ ĐỀ TRANG TRÍ (site_themes) — CRUD admin ----
  if (path === "/admin/themes" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM site_themes ORDER BY sort_order ASC, id DESC").all();
    return json({ success: true, themes: results || [] }, 200, request, env);
  }
  if (path === "/admin/themes" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (!b.key || !b.name) return json({ error: "Thiếu key/tên chủ đề" }, 400, request, env);
    const key = String(b.key).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40);
    if (!key) return json({ error: "Key không hợp lệ" }, 400, request, env);
    try {
      await env.DB.prepare("INSERT INTO site_themes (key, name, emoji, description, primary_color, secondary_color, accent_color, background_url, banner_url, logo_url, confetti, css, is_active, starts_at, ends_at, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
        key,
        String(b.name).slice(0, 80),
        String(b.emoji || "").slice(0, 8),
        String(b.description || "").slice(0, 500),
        String(b.primary_color || "#f36f21").slice(0, 20),
        String(b.secondary_color || "#1a1c24").slice(0, 20),
        String(b.accent_color || "#ffb37a").slice(0, 20),
        String(b.background_url || "").slice(0, 500),
        String(b.banner_url || "").slice(0, 500),
        String(b.logo_url || "").slice(0, 500),
        String(b.confetti || "none").slice(0, 20),
        String(b.css || "").slice(0, 4000),
        b.is_active === 0 ? 0 : 1,
        String(b.starts_at || "").slice(0, 19),
        String(b.ends_at || "").slice(0, 19),
        parseInt(b.sort_order) || 0,
        adminUser ? adminUser.id : 0
      ).run();
    } catch (e) {
      if (String(e?.message || "").includes("UNIQUE")) return json({ error: "Key chủ đề đã tồn tại" }, 409, request, env);
      throw e;
    }
    try { await logAudit(env, adminUser ? adminUser.id : 0, "theme.create", { key }); } catch {}
    return json({ success: true, key }, 200, request, env);
  }
  if (path === "/admin/themes" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
    const key = b.key ? String(b.key).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40) : null;
    await env.DB.prepare("UPDATE site_themes SET key = COALESCE(?, key), name = COALESCE(?, name), emoji = COALESCE(?, emoji), description = COALESCE(?, description), primary_color = COALESCE(?, primary_color), secondary_color = COALESCE(?, secondary_color), accent_color = COALESCE(?, accent_color), background_url = COALESCE(?, background_url), banner_url = COALESCE(?, banner_url), logo_url = COALESCE(?, logo_url), confetti = COALESCE(?, confetti), css = COALESCE(?, css), is_active = COALESCE(?, is_active), starts_at = COALESCE(?, starts_at), ends_at = COALESCE(?, ends_at), sort_order = COALESCE(?, sort_order) WHERE id = ?").bind(
      key, b.name ?? null, b.emoji ?? null, b.description ?? null,
      b.primary_color ?? null, b.secondary_color ?? null, b.accent_color ?? null,
      b.background_url ?? null, b.banner_url ?? null, b.logo_url ?? null,
      b.confetti ?? null, b.css ?? null, b.is_active ?? null, b.starts_at ?? null, b.ends_at ?? null, b.sort_order ?? null, b.id
    ).run();
    try { await logAudit(env, adminUser ? adminUser.id : 0, "theme.update", { id: b.id }); } catch {}
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/themes" && request.method === "DELETE") {
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM site_themes WHERE id = ?").bind(id).run();
    try { await logAudit(env, adminUser ? adminUser.id : 0, "theme.delete", { id }); } catch {}
    return json({ success: true }, 200, request, env);
  }
  // Feedback báo lỗi kênh (1 chạm từ player)
  if (path === "/admin/feedback" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100").all();
    return json({ success: true, feedback: results || [] }, 200, request, env);
  }
  if (path === "/admin/feedback" && request.method === "DELETE") {
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM feedback WHERE id = ?").bind(id).run();
    return json({ success: true }, 200, request, env);
  }
  // Shorts do admin đăng
  if (path === "/admin/shorts" && request.method === "GET") {
    try {
      const { results } = await env.DB.prepare("SELECT s.*, c.handle as creator_handle, c.display_name as creator_name, c.avatar_url as creator_avatar FROM shorts s LEFT JOIN short_creator_profiles c ON c.id = s.creator_id ORDER BY s.created_at DESC LIMIT 200").all();
      return json({ success: true, shorts: results || [] }, 200, request, env);
    } catch {
      const { results } = await env.DB.prepare("SELECT * FROM shorts ORDER BY created_at DESC LIMIT 200").all();
      return json({ success: true, shorts: results || [] }, 200, request, env);
    }
  }
  // Admin creator profiles management
  if (path === "/admin/short-creators" && request.method === "GET") {
    try {
      const { results } = await env.DB.prepare("SELECT p.*, (SELECT COUNT(*) FROM shorts WHERE creator_id = p.id) as shorts_count, (SELECT COUNT(*) FROM short_follows WHERE creator_id = p.id) as followers FROM short_creator_profiles p ORDER BY p.created_at DESC LIMIT 200").all();
      return json({ success: true, creators: results || [] }, 200, request, env);
    } catch { return json({ success: true, creators: [] }, 200, request, env); }
  }
  if (path === "/admin/short-creators" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    const id = parseInt(b.id)||0;
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    if (b.verified !== undefined) await env.DB.prepare("UPDATE short_creator_profiles SET verified = ? WHERE id = ?").bind(b.verified ? 1 : 0, id).run();
    if (b.handle) await env.DB.prepare("UPDATE short_creator_profiles SET handle = ?, display_name = COALESCE(?, display_name), avatar_url = COALESCE(?, avatar_url), bio = COALESCE(?, bio) WHERE id = ?").bind(String(b.handle).slice(0,20), b.display_name || null, b.avatar_url || null, b.bio || null, id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/short-creators" && request.method === "DELETE") {
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM short_follows WHERE creator_id = ?").bind(id).run();
    await env.DB.prepare("UPDATE shorts SET creator_id = NULL WHERE creator_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM short_creator_profiles WHERE id = ?").bind(id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/shorts" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (!b.video_url) return json({ error: "Thiếu video_url" }, 400, request, env);
    await env.DB.prepare("INSERT INTO shorts (title, caption, video_url, thumb_url, duration, author, status) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(String(b.title || "").slice(0, 120), String(b.caption || "").slice(0, 500), String(b.video_url).slice(0, 500), String(b.thumb_url || "").slice(0, 500), parseInt(b.duration) || 0, String(b.author || "").slice(0, 80), b.status === "hidden" ? "hidden" : "live").run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/shorts" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("UPDATE shorts SET title = COALESCE(?, title), caption = COALESCE(?, caption), video_url = COALESCE(?, video_url), thumb_url = COALESCE(?, thumb_url), author = COALESCE(?, author), status = COALESCE(?, status) WHERE id = ?").bind(b.title ?? null, b.caption ?? null, b.video_url ?? null, b.thumb_url ?? null, b.author ?? null, b.status ?? null, b.id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/shorts" && request.method === "DELETE") {
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM shorts WHERE id = ?").bind(id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/feedback" && request.method === "PUT") {
    const { id, status } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("UPDATE feedback SET status = ? WHERE id = ?").bind(status || "done", id).run();
    return json({ success: true }, 200, request, env);
  }

  // Dashboard stats
  if (path === "/admin/stats" && request.method === "GET") {
    const [users, channels, views, notifications] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as c FROM users").all(),
      env.DB.prepare("SELECT COUNT(*) as c FROM channels").all(),
      env.DB.prepare("SELECT COUNT(*) as c FROM analytics WHERE event = 'view'").all(),
      env.DB.prepare("SELECT COUNT(*) as c FROM notifications").all(),
    ]);
    return json({
      success: true,
      stats: {
        totalUsers: users.results[0]?.c || 0,
        totalChannels: channels.results[0]?.c || 0,
        totalViews: views.results[0]?.c || 0,
        totalNotifications: notifications.results[0]?.c || 0,
      }
    }, 200, request, env);
  }

  // Send notification
  if (path === "/admin/notify" && request.method === "POST") {
    const { title, body: msgBody, type, channel_id, target } = await request.json().catch(() => ({}));
    if (!title || !msgBody) return json({ error: "Thiếu tiêu đề/nội dung" }, 400, request, env);
    await env.DB.prepare("INSERT INTO notifications (title, body, type, channel_id, target, created_by) VALUES (?, ?, ?, ?, ?, ?)").bind(title, msgBody, type || "info", channel_id || "", target || "all", adminUser?.id || 0).run();
    await logAudit(env, adminUser?.id || 0, "notify.send", { title, type: type || "info" });
    // Web Push fan-out (không chặn response)
    try { if (ctx && ctx.waitUntil) ctx.waitUntil(pushNotifyAll(env)); } catch {}
    return json({ success: true }, 200, request, env);
  }

  // Get notifications
  if (path === "/admin/notifications" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50").all();
    return json({ success: true, notifications: results }, 200, request, env);
  }

  // Analytics events
  if (path === "/admin/analytics" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT event, COUNT(*) as count, DATE(created_at) as date FROM analytics WHERE created_at > datetime('now', '-30 days') GROUP BY event, date ORDER BY date DESC").all();
    return json({ success: true, analytics: results }, 200, request, env);
  }

  // Channel management
  if (path === "/admin/channels" && request.method === "POST") {
    const ch = await request.json().catch(() => ({}));
    if (!ch.channel_id || !ch.name || !ch.stream_url) return json({ error: "Thiếu thông tin kênh" }, 400, request, env);
    try {
      await env.DB.prepare("INSERT OR REPLACE INTO channels (channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days, is_active, user_agent, referer, manifest_type, license_type, clear_key_id, clear_key, blocked_regions, is_sponsored) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(ch.channel_id, ch.name, ch.logo || "", ch.group_title || "", ch.stream_url, ch.catchup_type || "append", ch.catchup_days || 7, ch.is_active !== undefined ? ch.is_active : 1, (ch.user_agent || "").slice(0, 300), (ch.referer || "").slice(0, 300), (ch.manifest_type || "").slice(0, 16), (ch.license_type || "").slice(0, 32), (ch.clear_key_id || ch.clearKeyId || "").slice(0, 64), (ch.clear_key || ch.clearKey || "").slice(0, 64), cleanRegionList(ch.blocked_regions).join(","), ch.is_sponsored ? 1 : 0).run();
    } catch {
      await env.DB.prepare("INSERT OR REPLACE INTO channels (channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(ch.channel_id, ch.name, ch.logo || "", ch.group_title || "", ch.stream_url, ch.catchup_type || "append", ch.catchup_days || 7, ch.is_active !== undefined ? ch.is_active : 1).run();
    }
    try { _chanCache = null; } catch {}
    await logAudit(env, adminUser?.id || 0, "channel.upsert", { channel_id: ch.channel_id, name: ch.name });
    return json({ success: true }, 200, request, env);
  }

  if (path === "/admin/channels" && request.method === "DELETE") {
    const { channel_id } = await request.json().catch(() => ({}));
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM channels WHERE channel_id = ?").bind(channel_id).run();
    await logAudit(env, adminUser?.id || 0, "channel.delete", { channel_id });
    adminAlert(env, ctx, "channel.delete", { channel_id, ip });
    return json({ success: true }, 200, request, env);
  }

  // ========== UPSTREAM CREDENTIALS (P0-A: playback token kênh premium của Stream Engine) ==========
  // Token được CẤP/ROTATE ở đây (kênh bí mật, chỉ admin) và worker tự inject khi
  // fetch upstream trong /api/stream/proxy. KHÔNG BAO GIỜ trả token trong response.
  if (path === "/admin/stream-credentials" && request.method === "GET") {
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS stream_credentials (channel_id TEXT PRIMARY KEY, upstream_token TEXT NOT NULL, updated_at INTEGER DEFAULT 0)").run();
      const { results } = await env.DB.prepare("SELECT channel_id, updated_at FROM stream_credentials ORDER BY channel_id ASC").all();
      return json({ success: true, credentials: results.map((r) => ({ channel_id: r.channel_id, updated_at: r.updated_at, has_token: true })) }, 200, request, env);
    } catch (e) {
      return json({ error: "Lỗi đọc credentials" }, 500, request, env);
    }
  }
  if (path === "/admin/stream-credentials" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { channel_id, upstream_token } = body;
    if (!channel_id || !upstream_token) return json({ error: "Thiếu channel_id/upstream_token" }, 400, request, env);
    if (String(upstream_token).length < 16) return json({ error: "Token phải ≥ 16 ký tự ngẫu nhiên" }, 400, request, env);
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS stream_credentials (channel_id TEXT PRIMARY KEY, upstream_token TEXT NOT NULL, updated_at INTEGER DEFAULT 0)").run();
      await env.DB.prepare("INSERT OR REPLACE INTO stream_credentials (channel_id, upstream_token, updated_at) VALUES (?, ?, ?)").bind(channel_id, String(upstream_token), Math.floor(Date.now() / 1000)).run();
      await logAudit(env, adminUser?.id || 0, "stream_credential.rotate", { channel_id });
      adminAlert(env, ctx, "stream_credential.rotate", { channel_id, ip, user: adminUser?.username || "master" });
      return json({ success: true }, 200, request, env);
    } catch (e) {
      return json({ error: "Lỗi lưu credential" }, 500, request, env);
    }
  }
  if (path === "/admin/stream-credentials" && request.method === "DELETE") {
    const body = await request.json().catch(() => ({}));
    const { channel_id } = body;
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM stream_credentials WHERE channel_id = ?").bind(channel_id).run();
    await logAudit(env, adminUser?.id || 0, "stream_credential.delete", { channel_id });
    adminAlert(env, ctx, "stream_credential.delete", { channel_id, ip });
    return json({ success: true }, 200, request, env);
  }

  // Broadcast
  if (path === "/admin/broadcast" && request.method === "POST") {
    const { message, type, expires_in } = await request.json().catch(() => ({}));
    if (!message) return json({ error: "Thiếu nội dung" }, 400, request, env);
    const expiresAt = expires_in ? Math.floor(Date.now() / 1000) + expires_in : 0;
    await env.DB.prepare("INSERT INTO broadcasts (message, type, expires_at) VALUES (?, ?, ?)").bind(message, type || "info", expiresAt).run();
    await logAudit(env, adminUser?.id || 0, "broadcast.send", { type: type || "info", message: (message || "").slice(0, 120) });
    return json({ success: true }, 200, request, env);
  }

  if (path === "/admin/broadcast" && request.method === "DELETE") {
    const b = await request.json().catch(() => ({}));
    const id = parseInt(b.id) || 0;
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM broadcasts WHERE id = ?").bind(id).run();
    await logAudit(env, adminUser?.id || 0, "broadcast.delete", { id });
    return json({ success: true }, 200, request, env);
  }

  if (path === "/admin/notifications" && request.method === "DELETE") {
    const b = await request.json().catch(() => ({}));
    const id = parseInt(b.id) || 0;
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM notifications WHERE id = ?").bind(id).run();
    await logAudit(env, adminUser?.id || 0, "notify.delete", { id });
    return json({ success: true }, 200, request, env);
  }


  if (path === "/admin/broadcasts" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM broadcasts WHERE is_active = 1 ORDER BY created_at DESC LIMIT 20").all();
    return json({ success: true, broadcasts: results }, 200, request, env);
  }

  // ========== EPG OVERRIDES (chỉnh EPG riêng từng kênh) ==========
  if (path === "/admin/epg-overrides" && request.method === "GET") {
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS epg_overrides (channel_id TEXT PRIMARY KEY, channel_name TEXT DEFAULT '', programmes TEXT NOT NULL, updated_at INTEGER DEFAULT 0)").run();
      const { results } = await env.DB.prepare("SELECT channel_id, channel_name, programmes FROM epg_overrides ORDER BY channel_id ASC").all();
      return json({ success: true, overrides: results.map(r => ({ channel_id: r.channel_id, channel_name: r.channel_name, programmes: JSON.parse(r.programmes || '[]') })) }, 200, request, env);
    } catch (e) {
      return json({ error: "Lỗi đọc override: " + (e.message || e) }, 500, request, env);
    }
  }

  if (path === "/admin/epg-overrides" && request.method === "POST") {
    const { channel_id, channel_name, programmes } = await request.json().catch(() => ({}));
    if (!channel_id || !Array.isArray(programmes)) return json({ error: "Thiếu channel_id hoặc programmes" }, 400, request, env);
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS epg_overrides (channel_id TEXT PRIMARY KEY, channel_name TEXT DEFAULT '', programmes TEXT NOT NULL, updated_at INTEGER DEFAULT 0)").run();
      await env.DB.prepare("INSERT OR REPLACE INTO epg_overrides (channel_id, channel_name, programmes, updated_at) VALUES (?, ?, ?, ?)").bind(channel_id, channel_name || "", JSON.stringify(programmes), Math.floor(Date.now() / 1000)).run();
      return json({ success: true }, 200, request, env);
    } catch (e) {
      return json({ error: "Lỗi lưu override: " + (e.message || e) }, 500, request, env);
    }
  }

  if (path === "/admin/epg-overrides" && request.method === "DELETE") {
    const channelId = new URL(request.url).searchParams.get("channel_id");
    if (!channelId) return json({ error: "Thiếu channel_id" }, 400, request, env);
    try {
      await env.DB.prepare("DELETE FROM epg_overrides WHERE channel_id = ?").bind(channelId).run();
      await logAudit(env, adminUser?.id || 0, "epg_override.delete", { channel_id: channelId });
      return json({ success: true }, 200, request, env);
    } catch (e) {
      return json({ error: "Lỗi xóa override: " + (e.message || e) }, 500, request, env);
    }
  }

  // ========== USER MANAGEMENT (ban/unban/promote/reset password) ==========
  if (path === "/admin/users" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, username, email, role, email_verified, banned, totp_enabled, created_at FROM users ORDER BY id DESC LIMIT 200").all();
    return json({ success: true, users: results }, 200, request, env);
  }

  if (path === "/admin/users/action" && request.method === "POST") {
    const { id, action } = await request.json().catch(() => ({}));
    if (!id || !action) return json({ error: "Thiếu id/action" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT id, username, email, role, banned, totp_enabled FROM users WHERE id = ?").bind(id).all();
    const target = results[0];
    if (!target) return json({ error: "Không tìm thấy user" }, 404, request, env);
    // Không cho admin tự ban/demote chính mình (tránh tự cách chân)
    if (adminUser && target.id === adminUser.id && ["ban", "demote", "delete"].includes(action)) {
      return json({ error: "Không thể tự thực hiện hành động này trên chính mình!" }, 400, request, env);
    }
    let extra = {};
    if (action === "ban") { await env.DB.prepare("UPDATE users SET banned = 1 WHERE id = ?").bind(id).run(); await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run(); }
    else if (action === "unban") { await env.DB.prepare("UPDATE users SET banned = 0 WHERE id = ?").bind(id).run(); }
    else if (action === "promote") { await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(id).run(); }
    else if (action === "demote") { await env.DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(id).run(); }
    else if (action === "disable_2fa") { await env.DB.prepare("UPDATE users SET totp_secret = '', totp_enabled = 0 WHERE id = ?").bind(id).run(); }
    else if (action === "reset_password") {
      const temp = "chrtv-" + generateToken().slice(0, 8);
      await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hashPassword(temp, env), id).run();
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
      extra.tempPassword = temp; // admin tự chuyển cho user
    } else if (action === "delete") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
        env.DB.prepare("DELETE FROM user_favorites WHERE user_id = ?").bind(id),
        env.DB.prepare("DELETE FROM watch_history WHERE user_id = ?").bind(id),
        env.DB.prepare("DELETE FROM user_profiles WHERE user_id = ?").bind(id),
      ]);
    } else {
      return json({ error: "Action không hợp lệ" }, 400, request, env);
    }
    await logAudit(env, adminUser?.id || 0, "user." + action, { target: target.username, target_id: target.id });
    return json({ success: true, ...(extra.tempPassword ? { tempPassword: extra.tempPassword } : {}) }, 200, request, env);
  }

  // ========== AUDIT LOG ==========
  if (path === "/admin/audit" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 100").all();
    return json({ success: true, audit: results }, 200, request, env);
  }

  // ========== ANALYTICS SUMMARY (cho biểu đồ) ==========
  if (path === "/admin/analytics/summary" && request.method === "GET") {
    const [viewsByDay, loginsByDay, topChannels, byEvent] = await Promise.all([
      env.DB.prepare("SELECT DATE(created_at) as date, COUNT(*) as count FROM analytics WHERE event = 'view' AND created_at > datetime('now', '-14 days') GROUP BY date ORDER BY date ASC").all(),
      env.DB.prepare("SELECT DATE(created_at) as date, COUNT(*) as count FROM analytics WHERE event = 'login' AND created_at > datetime('now', '-14 days') GROUP BY date ORDER BY date ASC").all(),
      env.DB.prepare("SELECT channel_id, COUNT(*) as count FROM analytics WHERE event = 'view' AND channel_id != '' AND created_at > datetime('now', '-30 days') GROUP BY channel_id ORDER BY count DESC LIMIT 8").all(),
      env.DB.prepare("SELECT event, COUNT(*) as count FROM analytics GROUP BY event ORDER BY count DESC LIMIT 8").all(),
    ]);
    return json({ success: true, viewsByDay: viewsByDay.results, loginsByDay: loginsByDay.results, topChannels: topChannels.results, byEvent: byEvent.results }, 200, request, env);
  }

  // ========== PRESENCE REALTIME (ai đang xem gì) ==========
  if (path === "/admin/presence" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM presence WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 100").bind(Math.floor(Date.now() / 1000) - 90).all();
    return json({ success: true, viewers: results || [] }, 200, request, env);
  }

  // ========== GIFT CODE ==========
  if (path === "/admin/gifts" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM gift_codes ORDER BY created_at DESC LIMIT 200").all();
    return json({ success: true, gifts: results || [] }, 200, request, env);
  }
  if (path === "/admin/gifts" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    let code = String(b.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
    if (!code) {
      const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const rnd = new Uint8Array(12);
      crypto.getRandomValues(rnd);
      code = "CHRTV-" + [...rnd].map((x) => abc[x % abc.length]).join("").slice(0, 8);
    }
    try {
      await env.DB.prepare("INSERT INTO gift_codes (code, plan, days, max_uses, note) VALUES (?, ?, ?, ?, ?)").bind(code, ["signature", "elite", "ultimate", "recreational", "standard"].includes(b.plan) ? b.plan : "signature", Math.max(1, Math.min(3650, parseInt(b.days) || 30)), Math.max(1, Math.min(100000, parseInt(b.max_uses) || 1)), String(b.note || "").slice(0, 200)).run();
    } catch (e) {
      if (String(e?.message || "").includes("UNIQUE")) return json({ error: "Mã đã tồn tại" }, 409, request, env);
      throw e;
    }
    await logAudit(env, adminUser?.id || 0, "gift.create", { code });
    return json({ success: true, code }, 200, request, env);
  }
  if (path === "/admin/gifts" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (!b.code) return json({ error: "Thiếu code" }, 400, request, env);
    await env.DB.prepare("UPDATE gift_codes SET is_active = ? WHERE code = ?").bind(b.is_active ? 1 : 0, String(b.code)).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/gifts" && request.method === "DELETE") {
    const b = await request.json().catch(() => ({}));
    if (!b.code) return json({ error: "Thiếu code" }, 400, request, env);
    await env.DB.prepare("DELETE FROM gift_codes WHERE code = ?").bind(String(b.code)).run();
    return json({ success: true }, 200, request, env);
  }

  // ========== THANH TOÁN ==========
  if (path === "/admin/payments" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM payments ORDER BY id DESC LIMIT 200").all();
    return json({ success: true, payments: results || [] }, 200, request, env);
  }
  if (path === "/admin/payments" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    const order = String(b.order_code || "");
    if (!order || !["paid", "rejected", "pending"].includes(b.status)) return json({ error: "Thiếu order/status" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT * FROM payments WHERE order_code = ?").bind(order).all();
    const pm = results[0];
    if (!pm) return json({ error: "Không tìm thấy đơn" }, 404, request, env);
    await env.DB.prepare("UPDATE payments SET status = ?, paid_at = ? WHERE order_code = ?").bind(b.status, b.status === "paid" ? new Date().toISOString().slice(0, 19).replace("T", " ") : null, order).run();
    let exp = 0;
    if (b.status === "paid" && pm.status !== "paid") exp = await activatePlan(env, pm.user_id, pm.plan, 30);
    await logAudit(env, adminUser?.id || 0, "payment." + b.status, { order });
    return json({ success: true, expires_at: exp }, 200, request, env);
  }
  if (path === "/admin/payment-config" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT bank_id, account_no, account_name, template, note, (sepay_token != '') AS has_sepay FROM payment_config WHERE id = 1").all();
    return json({ success: true, config: results[0] || {} }, 200, request, env);
  }
  if (path === "/admin/payment-config" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    const cur = await env.DB.prepare("SELECT sepay_token FROM payment_config WHERE id = 1").all();
    const token = b.sepay_token ? String(b.sepay_token).slice(0, 200) : (cur.results[0]?.sepay_token || "");
    await env.DB.prepare("INSERT INTO payment_config (id, bank_id, account_no, account_name, template, sepay_token, note) VALUES (1, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET bank_id = ?, account_no = ?, account_name = ?, template = ?, sepay_token = ?, note = ?").bind(String(b.bank_id || "").slice(0, 20), String(b.account_no || "").slice(0, 30), String(b.account_name || "").slice(0, 60), String(b.template || "compact2").slice(0, 20), token, String(b.note || "").slice(0, 200), String(b.bank_id || "").slice(0, 20), String(b.account_no || "").slice(0, 30), String(b.account_name || "").slice(0, 60), String(b.template || "compact2").slice(0, 20), token, String(b.note || "").slice(0, 200)).run();
    return json({ success: true }, 200, request, env);
  }

  // ========== QUẢNG CÁO ==========
  if (path === "/admin/ads" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM ads ORDER BY sort_order ASC, id DESC LIMIT 100").all();
    return json({ success: true, ads: results || [] }, 200, request, env);
  }
  if (path === "/admin/ads" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    await env.DB.prepare("INSERT INTO ads (slot, title, image_url, link_url, video_url, starts_at, ends_at, sort_order, is_active, blocked_regions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(String(b.slot || "banner").slice(0, 30), String(b.title || "").slice(0, 120), String(b.image_url || "").slice(0, 500), String(b.link_url || "").slice(0, 500), String(b.video_url || "").slice(0, 500), String(b.starts_at || "").slice(0, 19), String(b.ends_at || "").slice(0, 19), parseInt(b.sort_order) || 0, b.is_active === 0 ? 0 : 1, cleanRegionList(b.blocked_regions).join(",")).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/ads" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("UPDATE ads SET slot = ?, title = ?, image_url = ?, link_url = ?, video_url = ?, starts_at = ?, ends_at = ?, sort_order = ?, is_active = ?, blocked_regions = ? WHERE id = ?").bind(String(b.slot || "banner").slice(0, 30), String(b.title || "").slice(0, 120), String(b.image_url || "").slice(0, 500), String(b.link_url || "").slice(0, 500), String(b.video_url || "").slice(0, 500), String(b.starts_at || "").slice(0, 19), String(b.ends_at || "").slice(0, 19), parseInt(b.sort_order) || 0, b.is_active === 0 ? 0 : 1, cleanRegionList(b.blocked_regions).join(","), b.id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/ads" && request.method === "DELETE") {
    const b = await request.json().catch(() => ({}));
    if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM ads WHERE id = ?").bind(b.id).run();
    return json({ success: true }, 200, request, env);
  }

  // ========== NGUỒN PHÁT PHIM ==========
  // Lưu/toggle nguồn ở đây KHÔNG tự đủ để player chạy: domain của nó phải có trong
  // secret MOVIE_FRAME_SRC (allowlist CSP). POST/PUT trả về error rõ nếu thiếu,
  // kèm đúng chuỗi cần đặt — để không có cảnh "đã thêm mà sao vẫn khung đen".
  if (path === "/admin/movie_sources" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM movie_sources ORDER BY sort_order ASC, id ASC LIMIT 100").all();
    return json({
      success: true,
      sources: results || [],
      frame_allowlist: allowedEmbedOrigins(env),
      frame_allowlist_set: allowedEmbedOrigins(env).length > 0,
      custom_allowlist: customEmbedOrigins(env),
      builtin_enabled: movieBuiltinsEnabled(env),
      builtin_sources: movieBuiltinsEnabled(env) ? BUILTIN_MOVIE_SOURCES : [],
    }, 200, request, env);
  }
  if (path === "/admin/movie_sources" && (request.method === "POST" || request.method === "PUT")) {
    const b = await request.json().catch(() => ({}));
    const name = String(b.name || "").trim().slice(0, 40);
    const kind = b.kind === "hls" ? "hls" : "embed";
    const tpl = String(b.url_template || "").trim().slice(0, 500);
    const note = String(b.license_note || "").trim().slice(0, 200);
    if (!name) return json({ error: "Thiếu tên nguồn" }, 400, request, env);
    if (!note) return json({ error: "Bắt buộc ghi licence_note: nguồn này lấy bản quyền từ đâu. Không có thì không lưu." }, 400, request, env);
    const chk = movieSourceCheck(tpl, allowedEmbedOrigins(env));
    if (!chk.ok) return json({ error: chk.error }, 400, request, env);
    const active = b.is_active === 0 ? 0 : 1;
    const order = parseInt(b.sort_order, 10) || 0;
    const label = String(b.label || "").trim().slice(0, 20);
    const regions = cleanRegionList(b.blocked_regions).join(",");
    if (request.method === "POST") {
      const r = await env.DB.prepare("INSERT INTO movie_sources (name, kind, url_template, license_note, is_active, sort_order, label, blocked_regions) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(name, kind, tpl, note, active, order, label, regions).run();
      await logAudit(env, adminUser?.id || 0, "movie_source.add", { id: r?.meta?.last_row_id, name, origin: chk.origin });
    } else {
      if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
      await env.DB.prepare("UPDATE movie_sources SET name = ?, kind = ?, url_template = ?, license_note = ?, is_active = ?, sort_order = ?, label = ?, blocked_regions = ? WHERE id = ?")
        .bind(name, kind, tpl, note, active, order, label, regions, parseInt(b.id, 10) || 0).run();
      await logAudit(env, adminUser?.id || 0, "movie_source.update", { id: b.id, name, origin: chk.origin });
    }
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/movie_sources" && request.method === "DELETE") {
    const b = await request.json().catch(() => ({}));
    if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM movie_sources WHERE id = ?").bind(parseInt(b.id, 10) || 0).run();
    await logAudit(env, adminUser?.id || 0, "movie_source.delete", { id: b.id });
    return json({ success: true }, 200, request, env);
  }
  // Test nhanh 1 template ngay trong admin (không cần có phim thật): {tmdb}=550
  if (path === "/admin/movie_sources/test" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const chk = movieSourceCheck(String(b.url_template || ""), allowedEmbedOrigins(env));
    const preview = chk.ok
      ? String(b.url_template).replace(/\{tmdb\}/g, "550").replace(/\{type\}/g, "movie").replace(/\{season\}/g, "1").replace(/\{episode\}/g, "1")
      : "";
    return json({ success: chk.ok, error: chk.error || "", url: preview, frame_allowlist: allowedEmbedOrigins(env) }, chk.ok ? 200 : 400, request, env);
  }

  // ========== LỊCH ĐĂNG ==========
  if (path === "/admin/scheduled" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM scheduled_posts ORDER BY publish_at DESC LIMIT 100").all();
    return json({ success: true, posts: results || [] }, 200, request, env);
  }
  if (path === "/admin/scheduled" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (!["broadcast", "notify", "event"].includes(b.kind) || !b.publish_at) return json({ error: "Thiếu kind/publish_at" }, 400, request, env);
    await env.DB.prepare("INSERT INTO scheduled_posts (kind, title, body, link_type, link_value, image_url, publish_at, end_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(b.kind, String(b.title || "").slice(0, 160), String(b.body || "").slice(0, 1000), String(b.link_type || "none").slice(0, 20), String(b.link_value || "").slice(0, 200), String(b.image_url || "").slice(0, 500), String(b.publish_at).slice(0, 19).replace("T", " "), String(b.end_at || "").slice(0, 19).replace("T", " "), b.is_active === 0 ? 0 : 1).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/scheduled" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("UPDATE scheduled_posts SET kind = COALESCE(?, kind), title = COALESCE(?, title), body = COALESCE(?, body), link_type = COALESCE(?, link_type), link_value = COALESCE(?, link_value), image_url = COALESCE(?, image_url), publish_at = COALESCE(?, publish_at), end_at = COALESCE(?, end_at), is_active = COALESCE(?, is_active) WHERE id = ?")
      .bind(b.kind ?? null, b.title ?? null, b.body ?? null, b.link_type ?? null, b.link_value ?? null, b.image_url ?? null, b.publish_at ? String(b.publish_at).slice(0, 19).replace("T", " ") : null, b.end_at ? String(b.end_at).slice(0, 19).replace("T", " ") : null, b.is_active ?? null, b.id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/scheduled" && request.method === "DELETE") {
    const b = await request.json().catch(() => ({}));
    if (!b.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM scheduled_posts WHERE id = ?").bind(b.id).run();
    return json({ success: true }, 200, request, env);
  }

  // ========== KIỂM DUYỆT BÌNH LUẬN ==========
  if (path === "/admin/comments" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM comments ORDER BY id DESC LIMIT 200").all();
    return json({ success: true, comments: results || [] }, 200, request, env);
  }
  if (path === "/admin/comments" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    const ids = Array.isArray(b.ids) ? b.ids.map((x) => parseInt(x) || 0).filter(Boolean).slice(0, 100) : (b.id ? [parseInt(b.id) || 0] : []);
    // (#39) ghim bình luận (1 phim/kênh/short ghim tối đa 3)
    if (ids.length && b.pinned !== undefined) {
      for (const id of ids) await env.DB.prepare("UPDATE comments SET pinned = ? WHERE id = ?").bind(b.pinned ? 1 : 0, id).run();
      return json({ success: true, count: ids.length }, 200, request, env);
    }
    if (!ids.length || !["visible", "hidden"].includes(b.status)) return json({ error: "Thiếu ids/status" }, 400, request, env);
    for (const id of ids) await env.DB.prepare("UPDATE comments SET status = ? WHERE id = ?").bind(b.status, id).run();
    await logAudit(env, adminUser?.id || 0, "comments." + b.status, { count: ids.length });
    return json({ success: true, count: ids.length }, 200, request, env);
  }
  if (path === "/admin/comments" && request.method === "DELETE") {
    const b = await request.json().catch(() => ({}));
    const ids = Array.isArray(b.ids) ? b.ids.map((x) => parseInt(x) || 0).filter(Boolean).slice(0, 100) : (b.id ? [parseInt(b.id) || 0] : []);
    if (!ids.length) return json({ error: "Thiếu ids" }, 400, request, env);
    for (const id of ids) await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
    await logAudit(env, adminUser?.id || 0, "comments.delete", { count: ids.length });
    return json({ success: true, count: ids.length }, 200, request, env);
  }

  // ========== DỰ ĐOÁN: chốt kết quả ==========
  if (path === "/admin/predictions" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT event_key, league, home, away, COUNT(*) AS n, SUM(CASE WHEN points IS NOT NULL THEN 1 ELSE 0 END) AS settled FROM predictions GROUP BY event_key ORDER BY MAX(created_at) DESC LIMIT 100").all();
    return json({ success: true, events: results || [] }, 200, request, env);
  }
  if (path === "/admin/predictions" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const key = String(b.event_key || "");
    const hs = parseInt(b.hs), cs = parseInt(b.as);
    if (!key || !(hs >= 0) || !(cs >= 0)) return json({ error: "Thiếu event_key/hs/as" }, 400, request, env);
    const n = await settlePredictions(env, key, hs, cs);
    await logAudit(env, adminUser?.id || 0, "predict.settle", { key, hs, cs, n });
    return json({ success: true, settled: n }, 200, request, env);
  }

  // ========== BÁO CÁO + XUẤT EXCEL (CSV) ==========
  // ---- (20/46/49) Vận hành kênh: báo lỗi · sức khoẻ · log player ----
  if (path === "/admin/channel-reports" && request.method === "GET") {
    const status = new URL(request.url).searchParams.get("status") || "open";
    const { results } = await env.DB.prepare(
      `SELECT r.*, COALESCE(u.username, '') AS username FROM channel_reports r
       LEFT JOIN users u ON u.id = r.user_id
       WHERE (? = 'all' OR r.status = ?) ORDER BY r.id DESC LIMIT 200`
    ).bind(status, status).all();
    const { results: grouped } = await env.DB.prepare(
      `SELECT channel_id, MAX(channel_name) AS channel_name, COUNT(*) AS n, MAX(created_at) AS last_at
       FROM channel_reports WHERE status = 'open' GROUP BY channel_id ORDER BY n DESC LIMIT 50`
    ).all();
    return json({ success: true, reports: results || [], grouped: grouped || [] }, 200, request, env);
  }
  if (path === "/admin/channel-reports" && request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    const st = ["open", "fixed", "closed"].includes(b.status) ? b.status : "closed";
    if (b.channel_id) {
      await env.DB.prepare("UPDATE channel_reports SET status = ? WHERE channel_id = ? AND status = 'open'").bind(st, String(b.channel_id)).run();
    } else if (b.id) {
      await env.DB.prepare("UPDATE channel_reports SET status = ? WHERE id = ?").bind(st, parseInt(b.id, 10) || 0).run();
    } else return json({ error: "Thiếu id/channel_id" }, 400, request, env);
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/channel-health" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT c.channel_id, c.name, c.group_title, COALESCE(h.status, 'unknown') AS status, COALESCE(h.http_code, 0) AS http_code,
              COALESCE(h.latency_ms, 0) AS latency_ms, COALESCE(h.fail_count, 0) AS fail_count, COALESCE(h.checked_at, 0) AS checked_at,
              COALESCE(h.note, '') AS note
       FROM channels c LEFT JOIN channel_health h ON h.channel_id = c.channel_id
       WHERE c.is_active = 1
       ORDER BY CASE COALESCE(h.status, 'unknown') WHEN 'down' THEN 0 WHEN 'flaky' THEN 1 WHEN 'unknown' THEN 2 ELSE 3 END, c.name ASC`
    ).all();
    let job = null;
    try { const j = await env.DB.prepare("SELECT * FROM jobs WHERE name = 'channel_health'").all(); job = j.results?.[0] || null; } catch {}
    return json({ success: true, channels: results || [], job, summary: await getStatusSummary(env) }, 200, request, env);
  }
  if (path === "/admin/channel-health" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const ids = Array.isArray(b.channel_ids) ? b.channel_ids.slice(0, 20).map(String) : null;
    const result = await runChannelHealthCheck(env, parseInt(b.limit, 10) || 15, ids && ids.length ? ids : null);
    return json({ success: true, result }, 200, request, env);
  }
  if (path === "/admin/player-errors" && request.method === "GET") {
    const { results } = await env.DB.prepare(
      `SELECT channel_id, MAX(channel_name) AS channel_name, code, MAX(engine) AS engine,
              COUNT(*) AS n, SUM(fatal) AS fatal_n, MAX(created_at) AS last_at,
              MAX(substr(detail, 1, 180)) AS sample
       FROM player_errors WHERE created_at > datetime('now', '-3 days')
       GROUP BY channel_id, code ORDER BY n DESC LIMIT 100`
    ).all();
    const { results: recent } = await env.DB.prepare(
      "SELECT * FROM player_errors ORDER BY id DESC LIMIT 60"
    ).all();
    return json({ success: true, grouped: results || [], recent: recent || [] }, 200, request, env);
  }
  if (path === "/admin/reports/summary" && request.method === "GET") {
    const [rev, users, views, xp] = await Promise.all([
      env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM payments WHERE status = 'paid'").all(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM users").all(),
      env.DB.prepare("SELECT COALESCE(SUM(views), 0) AS v, COALESCE(SUM(seconds), 0) AS s FROM watch_counters").all(),
      env.DB.prepare("SELECT COALESCE(SUM(xp), 0) AS x FROM user_xp").all(),
    ]);
    const revByDay = await env.DB.prepare("SELECT DATE(paid_at) AS d, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM payments WHERE status = 'paid' AND paid_at IS NOT NULL GROUP BY d ORDER BY d DESC LIMIT 30").all();
    return json({ success: true, revenue: rev.results[0], users: users.results[0]?.n || 0, views: views.results[0], xp: xp.results[0]?.x || 0, revByDay: revByDay.results || [] }, 200, request, env);
  }
  if (path === "/admin/reports/export" && request.method === "GET") {
    const kind = String(new URL(request.url).searchParams.get("kind") || "payments");
    const esc = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    let csv = "";
    if (kind === "payments") {
      const { results } = await env.DB.prepare("SELECT id, username, plan, amount, order_code, status, created_at, paid_at FROM payments ORDER BY id DESC LIMIT 2000").all();
      csv = "id,username,plan,amount,order_code,status,created_at,paid_at\n" + (results || []).map((r) => [r.id, esc(r.username), r.plan, r.amount, r.order_code, r.status, esc(r.created_at), esc(r.paid_at)].join(",")).join("\n");
    } else if (kind === "views") {
      const { results } = await env.DB.prepare("SELECT w.channel_id, c.name, w.views, w.seconds FROM watch_counters w LEFT JOIN channels c ON c.channel_id = w.channel_id ORDER BY w.seconds DESC LIMIT 2000").all();
      csv = "channel_id,name,views,seconds\n" + (results || []).map((r) => [esc(r.channel_id), esc(r.name), r.views, r.seconds].join(",")).join("\n");
    } else {
      const { results } = await env.DB.prepare("SELECT id, username, email, display_name, role, plan, created_at FROM users ORDER BY id DESC LIMIT 2000").all();
      csv = "id,username,email,display_name,role,plan,created_at\n" + (results || []).map((r) => [r.id, esc(r.username), esc(r.email), esc(r.display_name), r.role, r.plan, esc(r.created_at)].join(",")).join("\n");
    }
    return new Response("﻿" + csv, { status: 200, headers: { ...jsonHeaders(request, env), "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="chrtv-${kind}.csv"` } });
  }

  return json({ error: "Not found" }, 404, request, env);
}

// ========== FAVORITES ==========
async function handleFavorites(request, env) {
  // Không có D1 => client tự lưu localStorage, trả về rỗng thay vì lỗi 500
  if (!hasDB(env)) return request.method === "GET" ? json({ success: true, favorites: [], local: true }, 200, request, env) : json({ success: true, local: true }, 200, request, env);
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401, request, env);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT channel_id, sort_order, group_name FROM user_favorites WHERE user_id = ? ORDER BY sort_order ASC").bind(user.id).all();
    return json({ success: true, favorites: results }, 200, request, env);
  }

  if (request.method === "POST") {
    const { channel_id, group_name } = await request.json().catch(() => ({}));
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM user_favorites WHERE user_id = ?").bind(user.id).all();
    await env.DB.prepare("INSERT OR REPLACE INTO user_favorites (user_id, channel_id, sort_order, group_name) VALUES (?, ?, ?, ?)").bind(user.id, channel_id, results[0]?.next_order || 0, group_name || "").run();
    return json({ success: true }, 200, request, env);
  }

  if (request.method === "DELETE") {
    const { channel_id } = await request.json().catch(() => ({}));
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM user_favorites WHERE user_id = ? AND channel_id = ?").bind(user.id, channel_id).run();
    return json({ success: true }, 200, request, env);
  }

  return json({ error: "Method not allowed" }, 405, request, env);
}

// ========== HISTORY ==========
async function handleHistory(request, env) {
  if (!hasDB(env)) return request.method === "GET" ? json({ success: true, history: [], local: true }, 200, request, env) : json({ success: true, local: true }, 200, request, env);
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401, request, env);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT channel_id, last_position, watch_count, updated_at FROM watch_history WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30").bind(user.id).all();
    return json({ success: true, history: results }, 200, request, env);
  }

  if (request.method === "POST") {
    const { channel_id, last_position } = await request.json().catch(() => ({}));
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400, request, env);
    await env.DB.prepare("INSERT INTO watch_history (user_id, channel_id, last_position, watch_count, updated_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_position = excluded.last_position, watch_count = watch_count + 1, updated_at = CURRENT_TIMESTAMP").bind(user.id, channel_id, last_position || 0).run();
    // Track analytics
    try { await env.DB.prepare("INSERT INTO analytics (event, user_id, channel_id, data) VALUES ('view', ?, ?, ?)").bind(user.id, channel_id, JSON.stringify({ position: last_position || 0 })).run(); } catch {}
    return json({ success: true }, 200, request, env);
  }

  return json({ error: "Method not allowed" }, 405, request, env);
}

// ========== FEEDBACK (báo lỗi kênh 1 chạm) ==========
async function handleFeedback(request, env) {
  if (!hasDB(env)) return json({ success: true, local: true }, 200, request, env);
  await ensureSchema(env);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, request, env);
  const auth = await getAuth(request, env);
  const body = await request.json().catch(() => ({}));
  const message = String(body.message || "").slice(0, 500).trim();
  if (!message) return json({ error: "Thiếu nội dung" }, 400, request, env);
  const clientInfo = JSON.stringify({
    ua: (request.headers.get("User-Agent") || "").slice(0, 160),
    upstreamUA: String(body.upstreamUA || "").slice(0, 120),
    program: String(body.program || "").slice(0, 160),
    at: new Date().toISOString(),
  });
  await env.DB.prepare("INSERT INTO feedback (user_id, channel_id, message, client_info) VALUES (?, ?, ?, ?)").bind(auth && auth.user ? auth.user.id : 0, String(body.channel_id || "").slice(0, 80), message, clientInfo).run();
  return json({ success: true }, 200, request, env);
}

// ========== SESSIONS (thiết bị đăng nhập) ==========
async function handleSessions(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "Chưa đăng nhập" }, 401, request, env);
  const cur = (request.headers.get("Authorization") || "").slice(7);
  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, user_agent, ip, expires_at, created_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 20").bind(auth.user.id, Date.now()).all();
    let currentId = 0;
    try {
      const { results: me } = await env.DB.prepare("SELECT id FROM sessions WHERE token = ?").bind(cur).all();
      currentId = me[0]?.id || 0;
    } catch {}
    return json({ success: true, sessions: results || [], currentId }, 200, request, env);
  }
  if (request.method === "DELETE") {
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    if (String(id).toLowerCase() === "others") {
      // (#48) đá toàn bộ thiết bị khác, giữ lại thiết bị hiện tại
      const n = await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token != ?").bind(auth.user.id, cur).run();
      return json({ success: true, revoked: (n && (n.meta?.changes || n.changes)) || 0 }, 200, request, env);
    }
    await env.DB.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").bind(id, auth.user.id).run();
    return json({ success: true }, 200, request, env);
  }
  return json({ error: "Method not allowed" }, 405, request, env);
}


// ========== SHORTS (do admin đăng) + CREATOR PROFILE ==========
async function handleShorts(request, env) {
  if (!hasDB(env)) return json({ success: true, shorts: [] }, 200, request, env);
  await ensureSchema(env);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, request, env);
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit")) || 30, 100);
  const auth = await getAuth(request, env);
  const uid = auth && auth.user ? auth.user.id : 0;
  try {
    const { results } = await env.DB.prepare(
      `SELECT s.id, s.title, s.caption, s.video_url, s.thumb_url, s.duration, s.author, s.views, s.likes, s.created_at, s.user_id, s.creator_id,
              c.handle as creator_handle, c.display_name as creator_name, c.avatar_url as creator_avatar, c.bio as creator_bio, c.verified as creator_verified,
              (SELECT COUNT(*) FROM short_follows WHERE creator_id = s.creator_id) as creator_followers,
              (SELECT COUNT(*) FROM shorts WHERE creator_id = s.creator_id AND status='live') as creator_shorts_count,
              (SELECT 1 FROM short_follows WHERE follower_user_id = ? AND creator_id = s.creator_id) as is_following
       FROM shorts s LEFT JOIN short_creator_profiles c ON c.id = s.creator_id
       WHERE s.status = 'live' ORDER BY s.created_at DESC LIMIT ?`
    ).bind(uid, limit).all();
    // fallback cho shorts cũ chưa có creator -> dùng author text
    const out = (results || []).map(r => ({
      ...r,
      creator: r.creator_id ? {
        id: r.creator_id,
        handle: r.creator_handle,
        display_name: r.creator_name || r.creator_handle,
        avatar_url: r.creator_avatar || "",
        bio: r.creator_bio || "",
        verified: !!r.creator_verified,
        followers: r.creator_followers || 0,
        shorts_count: r.creator_shorts_count || 0,
        is_following: !!r.is_following
      } : null
    }));
    return json({ success: true, shorts: out }, 200, request, env);
  } catch (e) {
    // fallback old schema
    try {
      const { results } = await env.DB.prepare("SELECT id, title, caption, video_url, thumb_url, duration, author, views, likes, created_at FROM shorts WHERE status = 'live' ORDER BY created_at DESC LIMIT ?").bind(limit).all();
      return json({ success: true, shorts: results || [] }, 200, request, env);
    } catch { return json({ success: true, shorts: [] }, 200, request, env); }
  }
}

async function handleShortReact(request, env) {
  if (!hasDB(env)) return json({ success: true }, 200, request, env);
  await ensureSchema(env);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, request, env);
  const { id, action } = await request.json().catch(() => ({}));
  if (!id) return json({ error: "Thiếu id" }, 400, request, env);
  if (action === "like") await env.DB.prepare("UPDATE shorts SET likes = likes + 1 WHERE id = ?").bind(id).run();
  else await env.DB.prepare("UPDATE shorts SET views = views + 1 WHERE id = ?").bind(id).run();
  return json({ success: true }, 200, request, env);
}

async function handleShortCreators(request, env) {
  if (!hasDB(env)) return json({ success: true, creators: [] }, 200, request, env);
  await ensureSchema(env);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, request, env);
  const auth = await getAuth(request, env);
  const uid = auth && auth.user ? auth.user.id : 0;
  try {
    const { results } = await env.DB.prepare(
      `SELECT p.id, p.handle, p.display_name, p.avatar_url, p.bio, p.verified,
              (SELECT COUNT(*) FROM shorts WHERE creator_id = p.id AND status='live') as shorts_count,
              (SELECT COUNT(*) FROM short_follows WHERE creator_id = p.id) as followers,
              (SELECT 1 FROM short_follows WHERE follower_user_id = ? AND creator_id = p.id) as is_following
       FROM short_creator_profiles p ORDER BY followers DESC, shorts_count DESC LIMIT 100`
    ).bind(uid).all();
    return json({ success: true, creators: results || [] }, 200, request, env);
  } catch { return json({ success: true, creators: [] }, 200, request, env); }
}

async function handleShortCreatorDetail(request, env) {
  if (!hasDB(env)) return json({ error: "No DB" }, 503, request, env);
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  const handle = String(q.get("handle") || q.get("id") || "").trim().toLowerCase();
  const idParam = parseInt(q.get("creator_id") || q.get("id")) || 0;
  if (!handle && !idParam) return json({ error: "Thiếu handle/creator_id" }, 400, request, env);
  const auth = await getAuth(request, env);
  const uid = auth && auth.user ? auth.user.id : 0;
  try {
    let creator = null;
    if (idParam) {
      const { results } = await env.DB.prepare("SELECT * FROM short_creator_profiles WHERE id = ?").bind(idParam).all();
      creator = results[0] || null;
    } else {
      const { results } = await env.DB.prepare("SELECT * FROM short_creator_profiles WHERE LOWER(handle) = ?").bind(handle).all();
      creator = results[0] || null;
      // fallback: tìm theo author text cũ trong shorts nếu chưa có profile
      if (!creator) {
        const { results: sres } = await env.DB.prepare("SELECT author FROM shorts WHERE LOWER(author) = ? LIMIT 1").bind(handle).all();
        if (sres[0]) {
          creator = { id: 0, handle: sres[0].author, display_name: sres[0].author, avatar_url: "", bio: "Người đăng: " + sres[0].author, verified: 0 };
        }
      }
    }
    if (!creator) return json({ error: "Không tìm thấy creator" }, 404, request, env);
    let shorts = [];
    let followers = 0;
    let is_following = false;
    if (creator.id) {
      const { results: sr } = await env.DB.prepare("SELECT id, title, caption, video_url, thumb_url, duration, author, views, likes, created_at FROM shorts WHERE creator_id = ? AND status='live' ORDER BY created_at DESC LIMIT 100").bind(creator.id).all();
      shorts = sr || [];
      const { results: fr } = await env.DB.prepare("SELECT COUNT(*) as c FROM short_follows WHERE creator_id = ?").bind(creator.id).all();
      followers = fr[0]?.c || 0;
      if (uid) {
        const { results: chk } = await env.DB.prepare("SELECT 1 FROM short_follows WHERE follower_user_id = ? AND creator_id = ?").bind(uid, creator.id).all();
        is_following = !!chk[0];
      }
    } else {
      // legacy author search
      const { results: sr } = await env.DB.prepare("SELECT id, title, caption, video_url, thumb_url, duration, author, views, likes, created_at FROM shorts WHERE LOWER(author) = ? AND status='live' ORDER BY created_at DESC LIMIT 100").bind(handle).all();
      shorts = sr || [];
    }
    return json({ success: true, creator: { ...creator, followers, is_following, shorts_count: shorts.length }, shorts }, 200, request, env);
  } catch (e) {
    return json({ error: "Lỗi: " + (e.message || e) }, 500, request, env);
  }
}

async function handleShortsByCreator(request, env) {
  if (!hasDB(env)) return json({ success: true, shorts: [] }, 200, request, env);
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  const handle = String(q.get("handle") || "").trim().toLowerCase();
  const creator_id = parseInt(q.get("creator_id")) || 0;
  if (!handle && !creator_id) return json({ error: "Thiếu handle" }, 400, request, env);
  try {
    if (creator_id) {
      const { results } = await env.DB.prepare("SELECT id, title, caption, video_url, thumb_url, duration, author, views, likes, created_at, creator_id FROM shorts WHERE creator_id = ? AND status='live' ORDER BY created_at DESC LIMIT 100").bind(creator_id).all();
      return json({ success: true, shorts: results || [] }, 200, request, env);
    }
    // try creator profile first
    const { results: cr } = await env.DB.prepare("SELECT id FROM short_creator_profiles WHERE LOWER(handle) = ?").bind(handle).all();
    if (cr[0]) {
      const { results } = await env.DB.prepare("SELECT id, title, caption, video_url, thumb_url, duration, author, views, likes, created_at, creator_id FROM shorts WHERE creator_id = ? AND status='live' ORDER BY created_at DESC LIMIT 100").bind(cr[0].id).all();
      return json({ success: true, shorts: results || [] }, 200, request, env);
    }
    // fallback legacy author
    const { results } = await env.DB.prepare("SELECT id, title, caption, video_url, thumb_url, duration, author, views, likes, created_at FROM shorts WHERE LOWER(author) = ? AND status='live' ORDER BY created_at DESC LIMIT 100").bind(handle).all();
    return json({ success: true, shorts: results || [] }, 200, request, env);
  } catch { return json({ success: true, shorts: [] }, 200, request, env); }
}

async function handleShortFollow(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  if (request.method === "GET") {
    const q = new URL(request.url).searchParams;
    const creator_id = parseInt(q.get("creator_id")) || 0;
    if (!creator_id) return json({ error: "Thiếu creator_id" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT 1 FROM short_follows WHERE follower_user_id = ? AND creator_id = ?").bind(auth.user.id, creator_id).all();
    const { results: cnt } = await env.DB.prepare("SELECT COUNT(*) as c FROM short_follows WHERE creator_id = ?").bind(creator_id).all();
    return json({ success: true, is_following: !!results[0], followers: cnt[0]?.c || 0 }, 200, request, env);
  }
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, request, env);
  const b = await request.json().catch(() => ({}));
  let creator_id = parseInt(b.creator_id) || 0;
  const handle = String(b.handle || "").trim().toLowerCase();
  if (!creator_id && handle) {
    const { results } = await env.DB.prepare("SELECT id FROM short_creator_profiles WHERE LOWER(handle) = ?").bind(handle).all();
    creator_id = results[0]?.id || 0;
  }
  if (!creator_id) return json({ error: "Thiếu creator_id/handle" }, 400, request, env);
  // check not self
  const { results: own } = await env.DB.prepare("SELECT user_id FROM short_creator_profiles WHERE id = ?").bind(creator_id).all();
  if (own[0] && own[0].user_id === auth.user.id) return json({ error: "Không thể tự theo dõi chính mình" }, 400, request, env);
  try {
    const { results: exists } = await env.DB.prepare("SELECT id FROM short_follows WHERE follower_user_id = ? AND creator_id = ?").bind(auth.user.id, creator_id).all();
    if (exists[0]) {
      await env.DB.prepare("DELETE FROM short_follows WHERE follower_user_id = ? AND creator_id = ?").bind(auth.user.id, creator_id).run();
      const { results: cnt } = await env.DB.prepare("SELECT COUNT(*) as c FROM short_follows WHERE creator_id = ?").bind(creator_id).all();
      return json({ success: true, is_following: false, followers: cnt[0]?.c || 0 }, 200, request, env);
    } else {
      await env.DB.prepare("INSERT INTO short_follows (follower_user_id, creator_id) VALUES (?, ?)").bind(auth.user.id, creator_id).run();
      const { results: cnt } = await env.DB.prepare("SELECT COUNT(*) as c FROM short_follows WHERE creator_id = ?").bind(creator_id).all();
      return json({ success: true, is_following: true, followers: cnt[0]?.c || 0 }, 200, request, env);
    }
  } catch (e) {
    return json({ error: "Lỗi follow: " + (e.message || e) }, 500, request, env);
  }
}

async function handleShortCreatorProfile(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM short_creator_profiles WHERE user_id = ?").bind(auth.user.id).all();
    const profile = results[0] || null;
    if (!profile) return json({ success: true, profile: null }, 200, request, env);
    const { results: cnt } = await env.DB.prepare("SELECT COUNT(*) as c FROM short_follows WHERE creator_id = ?").bind(profile.id).all();
    const { results: scnt } = await env.DB.prepare("SELECT COUNT(*) as c FROM shorts WHERE creator_id = ? AND status='live'").bind(profile.id).all();
    return json({ success: true, profile: { ...profile, followers: cnt[0]?.c || 0, shorts_count: scnt[0]?.c || 0 } }, 200, request, env);
  }
  if (request.method === "POST" || request.method === "PUT") {
    const b = await request.json().catch(() => ({}));
    let handle = String(b.handle || "").trim().toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
    const display_name = String(b.display_name || b.name || "").slice(0, 60);
    const avatar_url = String(b.avatar_url || "").slice(0, 500);
    const bio = String(b.bio || b.description || "").slice(0, 500);
    if (!handle || handle.length < 3) return json({ error: "Handle cần ≥3 ký tự (a-z,0-9,_,.)" }, 400, request, env);
    if (!display_name) return json({ error: "Thiếu tên hiển thị" }, 400, request, env);
    // check handle unique except own
    const { results: exist } = await env.DB.prepare("SELECT id, user_id FROM short_creator_profiles WHERE LOWER(handle) = ?").bind(handle).all();
    if (exist[0] && exist[0].user_id !== auth.user.id) return json({ error: "Handle này đã có người dùng" }, 409, request, env);
    const { results: own } = await env.DB.prepare("SELECT id FROM short_creator_profiles WHERE user_id = ?").bind(auth.user.id).all();
    if (own[0]) {
      await env.DB.prepare("UPDATE short_creator_profiles SET handle = ?, display_name = ?, avatar_url = ?, bio = ? WHERE user_id = ?").bind(handle, display_name, avatar_url, bio, auth.user.id).run();
      const { results: upd } = await env.DB.prepare("SELECT * FROM short_creator_profiles WHERE user_id = ?").bind(auth.user.id).all();
      return json({ success: true, profile: upd[0] }, 200, request, env);
    } else {
      try {
        const r = await env.DB.prepare("INSERT INTO short_creator_profiles (user_id, handle, display_name, avatar_url, bio) VALUES (?, ?, ?, ?, ?)").bind(auth.user.id, handle, display_name, avatar_url, bio).run();
        const id = r.meta?.last_row_id || 0;
        const { results: created } = await env.DB.prepare("SELECT * FROM short_creator_profiles WHERE id = ?").bind(id).all();
        return json({ success: true, profile: created[0] || { id, handle, display_name, avatar_url, bio } }, 200, request, env);
      } catch (e) {
        const msg = String(e.message || e || "");
        if (msg.includes("UNIQUE")) return json({ error: "Handle đã tồn tại" }, 409, request, env);
        if (/no such table/i.test(msg)) {
          try {
            await env.DB.prepare("CREATE TABLE IF NOT EXISTS short_creator_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, handle TEXT UNIQUE NOT NULL, display_name TEXT DEFAULT '', avatar_url TEXT DEFAULT '', bio TEXT DEFAULT '', verified INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)").run();
            const r2 = await env.DB.prepare("INSERT INTO short_creator_profiles (user_id, handle, display_name, avatar_url, bio) VALUES (?, ?, ?, ?, ?)").bind(auth.user.id, handle, display_name, avatar_url, bio).run();
            const id2 = r2.meta?.last_row_id || 0;
            const { results: created2 } = await env.DB.prepare("SELECT * FROM short_creator_profiles WHERE id = ?").bind(id2).all();
            return json({ success: true, profile: created2[0] || { id: id2, handle, display_name, avatar_url, bio } }, 200, request, env);
          } catch (e2) {
            return json({ error: "Không tạo được hồ sơ: " + String(e2.message || e2) }, 500, request, env);
          }
        }
        return json({ error: "Không tạo được hồ sơ: " + msg }, 500, request, env);
      }
    }
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM short_creator_profiles WHERE user_id = ?").bind(auth.user.id).run();
    return json({ success: true }, 200, request, env);
  }
  return json({ error: "Method not allowed" }, 405, request, env);
}

async function handleShortUploadMy(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  if (path === "/api/shorts/my" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT s.id, s.title, s.caption, s.video_url, s.thumb_url, s.duration, s.views, s.likes, s.status, s.created_at, p.handle as creator_handle FROM shorts s LEFT JOIN short_creator_profiles p ON p.id = s.creator_id WHERE s.user_id = ? ORDER BY s.created_at DESC LIMIT 100").bind(auth.user.id).all();
    return json({ success: true, shorts: results || [] }, 200, request, env);
  }
  if (path === "/api/shorts/upload" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const { title, caption, video_url, thumb_url, duration } = b;
    if (!video_url) return json({ error: "Thiếu video_url" }, 400, request, env);
    // must have creator profile
    const { results: cp } = await env.DB.prepare("SELECT id, handle FROM short_creator_profiles WHERE user_id = ?").bind(auth.user.id).all();
    if (!cp[0]) return json({ error: "Bạn cần tạo hồ sơ creator trước (handle, avatar, bio)" , code:"NEED_PROFILE" }, 400, request, env);
    const creator_id = cp[0].id;
    const author = cp[0].handle;
    await env.DB.prepare("INSERT INTO shorts (title, caption, video_url, thumb_url, duration, author, user_id, creator_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'live')").bind(String(title||"").slice(0,120), String(caption||"").slice(0,500), String(video_url).slice(0,500), String(thumb_url||"").slice(0,500), parseInt(duration)||0, author, auth.user.id, creator_id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/api/shorts/my" && request.method === "DELETE") {
    const b = await request.json().catch(() => ({}));
    const id = parseInt(b.id)||0;
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    const isAdmin = auth.user.role === "admin";
    if (isAdmin) await env.DB.prepare("DELETE FROM shorts WHERE id = ?").bind(id).run();
    else await env.DB.prepare("DELETE FROM shorts WHERE id = ? AND user_id = ?").bind(id, auth.user.id).run();
    return json({ success: true }, 200, request, env);
  }
  return json({ error: "Method not allowed" }, 405, request, env);
}


// ========== QR LOGIN (quét từ thiết bị đã đăng nhập) ==========
const QR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // không lẫn 0/O, 1/I/L
function genQrCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = "";
  for (const b of bytes) s += QR_ALPHABET[b % QR_ALPHABET.length];
  return s;
}

async function handleQrLogin(request, env) {
  if (!hasDB(env)) return json({ error: "Server chưa sẵn sàng" }, 503, request, env);
  await ensureSchema(env);
  const url = new URL(request.url);
  const now = Date.now();

  // Thiết bị MỚI xin mã QR
  if (url.pathname === "/auth/qr/request") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, request, env);
    try { await env.DB.prepare("DELETE FROM qr_logins WHERE expires_at < ?").bind(now).run(); } catch {}
    const code = genQrCode();
    const device = (request.headers.get("User-Agent") || "").slice(0, 120);
    try {
      await env.DB.prepare("INSERT INTO qr_logins (code, device_info, created_at, expires_at) VALUES (?, ?, ?, ?)").bind(code, device, now, now + 120000).run();
    } catch {
      return json({ error: "Thử lại" }, 500, request, env);
    }
    return json({ success: true, code, expiresIn: 120 }, 200, request, env);
  }

  // Thiết bị ĐÃ ĐĂNG NHẬP quét/duyệt mã
  if (url.pathname === "/auth/qr/approve") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, request, env);
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "Chưa đăng nhập" }, 401, request, env);
    const { code } = await request.json().catch(() => ({}));
    const c = String(code || "").trim().toUpperCase();
    if (!c) return json({ error: "Thiếu mã" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT id, status, expires_at FROM qr_logins WHERE code = ?").bind(c).all();
    const row = results && results[0];
    if (!row) return json({ error: "Mã không đúng — kiểm tra lại." }, 404, request, env);
    if (row.expires_at < now) return json({ error: "Mã đã hết hạn — tạo mã mới." }, 410, request, env);
    if (row.status !== "pending") return json({ error: "Mã này đã được dùng." }, 409, request, env);
    await env.DB.prepare("UPDATE qr_logins SET user_id = ?, status = 'approved' WHERE id = ?").bind(auth.user.id, row.id).run();
    return json({ success: true }, 200, request, env);
  }

  // Thiết bị MỚI poll chờ duyệt
  if (url.pathname === "/auth/qr/poll") {
    const c = String(url.searchParams.get("code") || "").trim().toUpperCase();
    if (!c) return json({ error: "Thiếu mã" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT id, user_id, status, expires_at FROM qr_logins WHERE code = ?").bind(c).all();
    const row = results && results[0];
    if (!row) return json({ success: false, status: "invalid" }, 200, request, env);
    if (row.expires_at < now) return json({ success: false, status: "expired" }, 200, request, env);
    if (row.status !== "approved" || !row.user_id) return json({ success: false, status: "pending" }, 200, request, env);
    // Đã duyệt → cấp session như login thường, thu hồi mã (dùng 1 lần)
    await env.DB.prepare("UPDATE qr_logins SET status = 'consumed' WHERE id = ?").bind(row.id).run();
    let user = null;
    try {
      const r = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified, banned, plan FROM users WHERE id = ?").bind(row.user_id).all();
      user = (r.results || [])[0] || null;
    } catch {
      const r2 = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified, banned FROM users WHERE id = ?").bind(row.user_id).all();
      user = (r2.results || [])[0] || null;
    }
    if (!user || user.banned) return json({ success: false, status: "invalid" }, 200, request, env);
    if (!user.plan) user.plan = "standard";
    const token = generateJWT(user.id, env);
    const expires = Date.now() + 30 * 24 * 3600 * 1000;
    try {
      await env.DB.prepare("INSERT INTO sessions (user_id, token, expires_at, user_agent) VALUES (?, ?, ?, ?)").bind(user.id, token, expires, ("QR:" + (request.headers.get("User-Agent") || "")).slice(0, 160)).run();
    } catch {
      await env.DB.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)").bind(user.id, token, expires).run();
    }
    try { await env.DB.prepare("INSERT INTO analytics (event, user_id, data) VALUES ('login_qr', ?, '{}')").bind(user.id).run(); } catch {}
    return json({ success: true, token, user }, 200, request, env);
  }

  return json({ error: "Not found" }, 404, request, env);
}

// ========== RATING ==========
async function handleRating(request, env) {
  if (!hasDB(env)) return request.method === "GET" ? json({ success: true, avg: 0, count: 0, userRating: 0, local: true }, 200, request, env) : json({ success: true, local: true }, 200, request, env);
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401, request, env);

  if (request.method === "POST") {
    const { channel_id, rating } = await request.json().catch(() => ({}));
    if (!channel_id || !rating) return json({ error: "Thiếu thông tin" }, 400, request, env);
    await env.DB.prepare("INSERT OR REPLACE INTO channel_ratings (channel_id, user_id, rating) VALUES (?, ?, ?)").bind(channel_id, user.id, rating).run();
    return json({ success: true }, 200, request, env);
  }

  if (request.method === "GET") {
    const channelId = new URL(request.url).searchParams.get("channel_id");
    if (!channelId) return json({ error: "Thiếu channel_id" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM channel_ratings WHERE channel_id = ?").bind(channelId).all();
    const userRating = await env.DB.prepare("SELECT rating FROM channel_ratings WHERE channel_id = ? AND user_id = ?").bind(channelId, user.id).all();
    return json({ success: true, avg: results[0]?.avg_rating || 0, count: results[0]?.count || 0, userRating: userRating.results[0]?.rating || 0 }, 200, request, env);
  }

  return json({ error: "Method not allowed" }, 405, request, env);
}

// ========== NOTIFICATIONS ==========
async function handleNotifications(request, env) {
  await evalScheduled(env);
  if (!hasDB(env)) return json({ success: true, notifications: [] }, 200, request, env);
  await ensureSchema(env);
  const user = await getUser(request, env);
  const userId = user?.id || 0;

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM notifications WHERE target = 'all' OR target = ? ORDER BY created_at DESC LIMIT 20").bind(userId ? String(userId) : "all").all();
    return json({ success: true, notifications: results }, 200, request, env);
  }

  return json({ error: "Method not allowed" }, 405, request, env);
}

// ========== REMINDERS ==========
async function handleReminders(request, env) {
  if (!hasDB(env)) return request.method === "GET" ? json({ success: true, reminders: [], local: true }, 200, request, env) : json({ success: true, local: true }, 200, request, env);
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401, request, env);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM program_reminders WHERE user_id = ? AND remind_at > datetime('now') ORDER BY remind_at ASC").bind(user.id).all();
    return json({ success: true, reminders: results }, 200, request, env);
  }

  if (request.method === "POST") {
    const { channel_id, program_title, remind_at } = await request.json().catch(() => ({}));
    if (!channel_id || !program_title || !remind_at) return json({ error: "Thiếu thông tin" }, 400, request, env);
    await env.DB.prepare("INSERT INTO program_reminders (user_id, channel_id, program_title, remind_at) VALUES (?, ?, ?, ?)").bind(user.id, channel_id, program_title, remind_at).run();
    return json({ success: true }, 200, request, env);
  }

  if (request.method === "DELETE") {
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM program_reminders WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    return json({ success: true }, 200, request, env);
  }

  return json({ error: "Method not allowed" }, 405, request, env);
}

// ========== BROADCASTS ==========
async function handleBroadcasts(env, request) {
  await evalScheduled(env);
  if (!hasDB(env)) return json({ success: true, broadcasts: [] }, 200, request, env);
  await ensureSchema(env);
  const { results } = await env.DB.prepare("SELECT * FROM broadcasts WHERE is_active = 1 AND (expires_at = 0 OR expires_at > ?) ORDER BY created_at DESC LIMIT 5").bind(Math.floor(Date.now() / 1000)).all();
  return json({ success: true, broadcasts: results }, 200, request, env);
}

// ========== CHANNELS ==========
async function handleChannels(env, request) {
  const refresh = request && new URL(request.url).searchParams.get("refresh") === "1";
  const country = viewerCountry(request);
  if (hasDB(env)) {
    await ensureSchema(env);
    try {
      const { results } = await env.DB.prepare("SELECT c.*, h.status AS health_status, h.maintenance_until AS maintenance_until, h.note AS health_note FROM channels c LEFT JOIN channel_health h ON h.channel_id = c.channel_id WHERE c.is_active = 1 ORDER BY c.id ASC").all();
      if (results && results.length > 0 && !refresh) return json({ success: true, channels: results.filter((c) => !regionBlocked(c, country)).map((c) => publicChannel(c, env)) }, 200, request, env);
    } catch (e) { console.error("handleChannels D1 error:", e?.message || e); }
  }
  // Bảng rỗng hoặc yêu cầu refresh → nạp từ nguồn M3U và lưu vào D1 (một lần dùng chung)
  const { list: fromSource } = await importChannelsOnce(env);
  return json({ success: true, channels: fromSource.filter((c) => !regionBlocked(c, country)).map((c) => publicChannel(c, env)) }, 200, request, env);
}

// Ghi danh sách kênh vào D1. Trả số kênh đã ghi (0 nếu không có DB).
//
// TRƯỚC: `DELETE FROM channels` rồi mới INSERT từng batch 50 hàng. Lỗi giữa chừng
// (Worker Free hết 10ms CPU / hết 50 subrequest / D1 5xx) để lại bảng RỖNG hoặc
// cụt -> /api/playlist trả `data: []` -> app trắng màn hình, người dùng tưởng crash.
// Giờ: upsert trước (không có khoảnh khắc nào bảng trống), rồi mới hạ is_active=0 những
// hàng không nằm trong đợt import này. INSERT OR REPLACE ghi đè nên created_at của hàng
// vừa ghi luôn là lúc chạy -> "created_at cũ hơn mốc bắt đầu" = kênh đã bị gỡ khỏi M3U.
async function writeChannels(env, list) {
  if (!hasDB(env) || !list || list.length === 0) return 0;
  try {
    await ensureSchema(env);
    // Trừ 2 phút làm dung sai lệch đồng hồ + khỏi ẩn oan kênh vừa thêm
    const startedAt = new Date(Date.now() - 120000).toISOString().replace("T", " ").slice(0, 19);
    const hasBatch = typeof env.DB.batch === "function";
    const runAll = async (rows) => {
      if (hasBatch) {
        for (let i = 0; i < rows.length; i += 50) await env.DB.batch(rows.slice(i, i + 50));
      } else {
        for (const row of rows) await row.run();
      }
    };
    const fullValues = list.map(ch => [ch.channel_id, ch.name, ch.logo || "", ch.group_title || "Khác", ch.stream_url, ch.catchup_type || "append", ch.catchup_days || 7, ch.user_agent || "", ch.referer || "", ch.manifest_type || "", ch.license_type || "", ch.clear_key_id || ch.clearKeyId || "", ch.clear_key || ch.clearKey || ""]);
    const baseValues = list.map(ch => [ch.channel_id, ch.name, ch.logo || "", ch.group_title || "Khác", ch.stream_url, ch.catchup_type || "append", ch.catchup_days || 7]);
    let ok = false;
    // Schema mới: kèm UA + DRM
    try {
      const stmt = env.DB.prepare("INSERT OR REPLACE INTO channels (channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days, is_active, user_agent, referer, manifest_type, license_type, clear_key_id, clear_key) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)");
      await runAll(fullValues.map(v => stmt.bind(...v)));
      ok = "full";
    } catch (e) {
      console.error("[channels] INSERT full failed, retry base:", e?.message || e);
    }
    if (!ok) {
      try {
        const stmt = env.DB.prepare("INSERT OR REPLACE INTO channels (channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)");
        await runAll(baseValues.map(v => stmt.bind(...v)));
        ok = "base";
      } catch (e2) {
        console.error("[channels] INSERT with is_active failed, retry without:", e2?.message || e2);
      }
    }
    // DB quá cũ (không có cột is_active) -> fallback kiểu cũ: thay sạch rồi ghi.
    if (!ok) {
      const stmt = env.DB.prepare("INSERT OR REPLACE INTO channels (channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days) VALUES (?, ?, ?, ?, ?, ?, ?)");
      await runAll(baseValues.map(v => stmt.bind(...v)));
      ok = "legacy";
    }
    if (ok !== "legacy") {
      // Kênh đã bị gỡ khỏi M3U: ẩn khỏi playlist (vẫn còn trong DB, đợt sau có lại là tự bật).
      try { await env.DB.prepare("UPDATE channels SET is_active = 0 WHERE created_at < ?").bind(startedAt).run(); } catch (e) { console.error("[channels] mark stale:", e?.message || e); }
      // Rác ẩn quá 30 ngày -> xoá cho gọn bảng
      try { await env.DB.prepare("DELETE FROM channels WHERE is_active = 0 AND created_at < datetime('now', '-30 days')").run(); } catch {}
    }
    try { _chanCache = null; } catch {}
    console.error(`[channels] wrote ${list.length} channels to D1 (${ok}, không còn truncate)`);
    return list.length;
  } catch (e) { console.error("writeChannels error:", e?.message || e); return 0; }
}

// ---------- Import kênh: chống Giẫm Chân Nhau ----------
// Vài request đầu tiên sau khi isolate tỉnh dậy đều thấy bảng chưa có gì và cùng
// lao đi fetch M3U + ghi D1. Trên Workers Free (50 subrequest/invocation, 10ms CPU)
// là tự giết mình. Gộp tất cả về MỘT lần import dùng chung trong 1 isolate.
let _importInFlight = null;
async function importChannelsOnce(env) {
  if (_importInFlight) return _importInFlight;
  _importInFlight = (async () => {
    const fromSource = await loadChannelsFromSource(env);
    const n = hasDB(env) && fromSource && fromSource.length > 0 ? await writeChannels(env, fromSource) : 0;
    return { list: fromSource, d1_count: n };
  })();
  try {
    return await _importInFlight;
  } finally {
    _importInFlight = null;
  }
}

// Tải danh sách kênh từ playlist M3U gốc, fallback danh sách mặc định
async function loadChannelsFromSource(env) {
  // Thứ tự nguồn M3U: secret M3U_SOURCE_URL -> playlist mặc định (ankbuitv/mytv)
  // -> nguồn dự phòng cũ. Repo nguồn nếu để PRIVATE thì phải dùng link raw kèm
  // token (đặt bằng `wrangler secret put M3U_SOURCE_URL`), nếu không sẽ 404.
  // Muốn thêm nhiều nguồn: M3U_SOURCE_URLS = "url1,url2,..." (thử lần lượt).
  const list = [];
  const multi = String((env && env.M3U_SOURCE_URLS) || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (env && env.M3U_SOURCE_URL) list.push(String(env.M3U_SOURCE_URL));
  list.push(...multi, SOURCE_M3U_URL, SOURCE_M3U_FALLBACK);

  const seen = new Set();
  for (const src of list) {
    if (!src || seen.has(src)) continue;
    seen.add(src);
    try {
      const resp = await fetch(src, {
        headers: {
          "User-Agent": "CHRTV-OTT/2.0",
          // Repo private: cho phép kèm token đọc (secret GITHUB_RAW_TOKEN)
          ...(env && env.GITHUB_RAW_TOKEN && /github/i.test(src) ? { "Authorization": "Bearer " + env.GITHUB_RAW_TOKEN } : {}),
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) { console.error(`[playlist] ${src} -> ${resp.status}`); continue; }
      const text = await resp.text();
      const parsed = parseM3U(text);
      if (parsed.length > 0) {
        console.error(`[playlist] nạp ${parsed.length} kênh từ ${src}`);
        return parsed;
      }
      console.error(`[playlist] ${src} trả về nội dung không phải M3U hợp lệ`);
    } catch (e) { console.error("loadChannelsFromSource error:", src, e?.message || e); }
  }
  return DEFAULT_CHANNELS;
}

// ========== SEARCH ==========
async function handleSearch(request, env) {
  const q = new URL(request.url).searchParams.get("q");
  if (!q) return json({ success: true, results: [] }, 200, request, env);
  if (hasDB(env)) {
    try {
      const { results } = await env.DB.prepare("SELECT channel_id, name, logo, group_title FROM channels WHERE name LIKE ? AND is_active = 1 LIMIT 20").bind(`%${q}%`).all();
      if (results && results.length > 0) return json({ success: true, results }, 200, request, env);
    } catch (e) { console.error("handleSearch D1 error:", e?.message || e); }
  }
  const needle = q.toLowerCase();
  const list = (await loadChannelsFromSource(env))
    .filter(ch => (ch.name || "").toLowerCase().includes(needle))
    .slice(0, 20)
    .map(ch => ({ channel_id: ch.channel_id, name: ch.name, logo: ch.logo, group_title: ch.group_title }));
  return json({ success: true, results: list }, 200, request, env);
}

// ========== ANALYTICS ==========
async function handleAnalytics(request, env) {
  if (!hasDB(env)) return json({ success: true, skipped: true }, 200, request, env);
  await ensureSchema(env);
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get("CF-Connecting-IP") || "";
  try {
    await env.DB.prepare("INSERT INTO analytics (event, user_id, channel_id, data, ip) VALUES (?, ?, ?, ?, ?)").bind(body.event || "pageview", body.user_id || 0, body.channel_id || "", JSON.stringify(body.data || {}), ip).run();
  } catch {}
  return json({ success: true }, 200, request, env);
}

// ============================================================================
// ĐỢT 1 — VẬN HÀNH KÊNH: báo lỗi (20) · telemetry player (49) · health check (46)
//          · status page (47) · đang hot 15 phút (3)
//
// KHÔNG DÙNG CRON: tài khoản Workers Free đã hết 5 cron trigger nên mọi việc chạy
// nền được "ghé nhờ" request thật (ctx.waitUntil) và khoá bằng bảng `jobs` để chỉ
// một request chạy tại một thời điểm.
// ============================================================================

const JOB_DEFS = {
  // tên: [chu kỳ giây, thời gian giữ khoá giây]
  channel_health: [600, 60],
  db_cleanup: [21600, 60],
  p48_alerts: [300, 45],
  p48_scheduled: [60, 30],
};

// Nhận việc: trả true nếu request này được quyền chạy job (đã tới hạn + chưa ai giữ khoá).
async function claimJob(env, name) {
  const [everySec, leaseSec] = JOB_DEFS[name] || [600, 60];
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare("INSERT OR IGNORE INTO jobs (name, last_run, running_until) VALUES (?, 0, 0)").bind(name).run();
    const res = await env.DB.prepare(
      "UPDATE jobs SET last_run = ?, running_until = ? WHERE name = ? AND last_run <= ? AND running_until <= ?"
    ).bind(now, now + leaseSec, name, now - everySec, now).run();
    return !!(res && res.meta && res.meta.changes > 0);
  } catch { return false; }
}

async function finishJob(env, name, result) {
  try {
    await env.DB.prepare("UPDATE jobs SET running_until = 0, last_result = ? WHERE name = ?")
      .bind(String(result || "").slice(0, 300), name).run();
  } catch {}
}

// Gọi từ fetch() — không await, không bao giờ ném lỗi ra ngoài.
async function runDueJobs(env) {
  if (!hasDB(env)) return;
  try {
    await ensureSchema(env);
    if (await claimJob(env, "channel_health")) {
      let msg = "";
      try { msg = await runChannelHealthCheck(env, 12); } catch (e) { msg = "error: " + (e?.message || e); }
      await finishJob(env, "channel_health", msg);
    }
    if (await claimJob(env, "db_cleanup")) {
      let msg = "ok";
      try {
        const nowS = Math.floor(Date.now() / 1000);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()),
          env.DB.prepare("DELETE FROM login_attempts WHERE created_at < datetime('now', '-1 day')"),
          env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(nowS - 86400),
          env.DB.prepare("DELETE FROM watch_pulse WHERE bucket < ?").bind(Math.floor(nowS / 300) - 24),
          env.DB.prepare("DELETE FROM player_errors WHERE created_at < datetime('now', '-14 days')"),
          env.DB.prepare("DELETE FROM channel_reports WHERE status = 'closed' AND created_at < datetime('now', '-30 days')"),
          // (A) mã chia sẻ phim hết hạn + mã resume quá cũ
          env.DB.prepare("DELETE FROM movie_share_codes WHERE expires_at > 0 AND expires_at < ?").bind(nowS),
          env.DB.prepare("DELETE FROM resume_codes WHERE expires_at < ?").bind(nowS),
          // (B) presence/xp/creator_stars cũ
          env.DB.prepare("DELETE FROM creator_stars WHERE created_at < ?").bind(nowS - 120 * 86400),
          env.DB.prepare("DELETE FROM admin_alert_feed WHERE ack = 1 AND created_at < datetime('now', '-30 days')"),
          env.DB.prepare("DELETE FROM watch_cc WHERE bucket < ?").bind(Math.floor(nowS / 300) - 576),
          env.DB.prepare("DELETE FROM movie_progress WHERE updated_at < ?").bind(nowS - 200 * 86400),
        ]);
      } catch (e) { msg = "error: " + (e?.message || e); }
      await finishJob(env, "db_cleanup", msg);
    }
    // Đợt 48: cảnh báo in-dash (#57) + lịch đăng (#56)
    await p48RunDueJobs(env);
  } catch {}
}

// ---- (46) Kiểm tra sức khoẻ kênh ----
// Mỗi lượt chỉ ping `limit` kênh lâu chưa kiểm tra nhất → 155 kênh quét hết trong
// khoảng 2 giờ mà không tốn subrequest của 1 request nào quá nhiều.
async function checkOneChannel(ch) {
  const t0 = Date.now();
  const headers = { "User-Agent": ch.user_agent || UA_DALVIK };
  if (ch.referer) headers.Referer = ch.referer;
  try {
    const res = await fetch(ch.stream_url, { headers, redirect: "follow", signal: AbortSignal.timeout(6000) });
    const latency = Date.now() - t0;
    const code = res.status;
    let ok = res.ok;
    let note = "";
    if (ok && /\.m3u8(\?|$)/i.test(ch.stream_url)) {
      const text = (await res.text().catch(() => "")).slice(0, 4000);
      if (!text.includes("#EXTM3U")) { ok = false; note = "không phải m3u8 hợp lệ"; }
    } else {
      try { await res.body?.cancel(); } catch {}
    }
    return { ok, code, latency, note };
  } catch (e) {
    return { ok: false, code: 0, latency: Date.now() - t0, note: String(e?.message || e).slice(0, 80) };
  }
}

async function runChannelHealthCheck(env, limit = 12, onlyIds = null) {
  if (!hasDB(env)) return "no-db";
  await ensureSchema(env);
  let rows = [];
  if (onlyIds && onlyIds.length) {
    const marks = onlyIds.map(() => "?").join(",");
    const r = await env.DB.prepare(`SELECT channel_id, name, stream_url, user_agent, referer FROM channels WHERE channel_id IN (${marks})`).bind(...onlyIds).all();
    rows = r.results || [];
  } else {
    const nowSq = Math.floor(Date.now() / 1000);
    const r = await env.DB.prepare(
      `SELECT c.channel_id, c.name, c.stream_url, c.user_agent, c.referer
       FROM channels c LEFT JOIN channel_health h ON h.channel_id = c.channel_id
       WHERE c.is_active = 1 AND COALESCE(h.maintenance_until, 0) <= ?
       ORDER BY COALESCE(h.checked_at, 0) ASC LIMIT ?`
    ).bind(nowSq, Math.max(1, Math.min(30, limit))).all();
    rows = r.results || [];
  }
  if (!rows.length) return "no-channels";
  const nowS = Math.floor(Date.now() / 1000);
  let down = 0, up = 0;
  const justDied = [];
  for (const ch of rows) {
    const r = await checkOneChannel(ch);
    let prevFail = 0;
    try {
      const p = await env.DB.prepare("SELECT fail_count FROM channel_health WHERE channel_id = ?").bind(ch.channel_id).all();
      prevFail = p.results?.[0]?.fail_count || 0;
    } catch {}
    const failCount = r.ok ? 0 : prevFail + 1;
    // Chỉ gọi là "chết" sau 3 lần fail liên tiếp — tránh báo động giả khi upstream
    // chặn IP Cloudflare hoặc mạng chớp nháy.
    const status = r.ok ? "up" : (failCount >= 3 ? "down" : "flaky");
    if (r.ok) up++; else down++;
    if (status === "down" && prevFail === 2) justDied.push(ch.name || ch.channel_id);
    try {
      await env.DB.prepare(
        `INSERT INTO channel_health (channel_id, status, http_code, latency_ms, fail_count, ok_at, checked_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(channel_id) DO UPDATE SET status = excluded.status, http_code = excluded.http_code,
           latency_ms = excluded.latency_ms, fail_count = excluded.fail_count, checked_at = excluded.checked_at,
           note = excluded.note, ok_at = CASE WHEN excluded.status = 'up' THEN excluded.checked_at ELSE channel_health.ok_at END`
      ).bind(ch.channel_id, status, r.code, r.latency, failCount, r.ok ? nowS : 0, nowS, r.note).run();
    } catch {}
    // Tự ẩn kênh chết — chỉ khi bật AUTO_HIDE_DEAD_CHANNELS=1 (mặc định chỉ gắn cờ)
    if (status === "down" && String(env.AUTO_HIDE_DEAD_CHANNELS || "") === "1" && failCount >= 5) {
      try { await env.DB.prepare("UPDATE channels SET is_active = 0 WHERE channel_id = ?").bind(ch.channel_id).run(); } catch {}
    }
  }
  if (justDied.length) {
    try { await env.DB.prepare("INSERT INTO analytics (event, data) VALUES ('channel_down', ?)").bind(JSON.stringify({ channels: justDied })).run(); } catch {}
    await notifyOps(env, `🔴 Kênh chết: ${justDied.slice(0, 10).join(", ")}${justDied.length > 10 ? ` (+${justDied.length - 10})` : ""}`);
  }
  return `checked=${rows.length} up=${up} down=${down}`;
}

// Báo cho vận hành: Telegram (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID) hoặc webhook chung.
async function notifyOps(env, text) {
  try {
    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: `[CHRTV] ${text}`, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(5000),
      });
      return;
    }
    if (env.ADMIN_ALERT_WEBHOOK) {
      await fetch(env.ADMIN_ALERT_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "chrtv-ott", action: "ops.alert", text, ts: new Date().toISOString() }),
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch {}
}

// ---- (20) Người xem báo kênh lỗi ----
const REPORT_CODES = ["no_play", "buffering", "no_audio", "wrong_program", "bad_quality", "other"];

async function handleReportChannel(request, env, ctx) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, request, env);
  if (!hasDB(env)) return json({ success: true, skipped: true }, 200, request, env);
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  const uid = auth && auth.user ? auth.user.id : 0;
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const rl = await rateLimitCheck(env, `report:${uid || ip}`, 12, 3600);
  if (!rl.allowed) return json({ error: "Bạn báo hơi nhiều rồi, thử lại sau nhé", retryAfter: rl.retryAfter }, 429, request, env);

  const b = await request.json().catch(() => ({}));
  const channelId = String(b.channel_id || "").slice(0, 80).trim();
  if (!channelId) return json({ error: "Thiếu channel_id" }, 400, request, env);
  const code = REPORT_CODES.includes(b.code) ? b.code : "other";
  const note = String(b.note || "").slice(0, 300).trim();
  const name = String(b.channel_name || "").slice(0, 120);
  const ua = (request.headers.get("User-Agent") || "").slice(0, 160);
  try {
    await env.DB.prepare("INSERT INTO channel_reports (channel_id, channel_name, user_id, code, note, ua) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(channelId, name, uid, code, note, ua).run();
  } catch (e) { return json({ error: "Không lưu được báo cáo" }, 500, request, env); }

  // Nhiều người cùng báo 1 kênh trong 30 phút → xác minh ngay + báo vận hành
  let openCount = 0;
  try {
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM channel_reports WHERE channel_id = ? AND status = 'open' AND created_at > datetime('now', '-30 minutes')"
    ).bind(channelId).all();
    openCount = results?.[0]?.n || 0;
  } catch {}
  if (openCount === 3 && ctx && ctx.waitUntil) {
    ctx.waitUntil((async () => {
      const res = await runChannelHealthCheck(env, 1, [channelId]).catch(() => "");
      await notifyOps(env, `⚠️ ${openCount} lượt báo lỗi kênh "${name || channelId}" trong 30 phút (${res})`);
    })());
  }
  return json({ success: true, reports: openCount }, 200, request, env);
}

// ---- (49) Player gửi mã lỗi về server ----
async function handlePlayerTelemetry(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, request, env);
  if (!hasDB(env)) return json({ success: true, skipped: true }, 200, request, env);
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  const uid = auth && auth.user ? auth.user.id : 0;
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const rl = await rateLimitCheck(env, `plerr:${uid || ip}`, 60, 3600);
  if (!rl.allowed) return json({ success: true, throttled: true }, 200, request, env);
  const b = await request.json().catch(() => ({}));
  try {
    await env.DB.prepare(
      "INSERT INTO player_errors (channel_id, channel_name, engine, code, detail, fatal, platform, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
      String(b.channel_id || "").slice(0, 80),
      String(b.channel_name || "").slice(0, 120),
      String(b.engine || "hls").slice(0, 20),
      String(b.code || "unknown").slice(0, 60),
      String(b.detail || "").slice(0, 300),
      b.fatal ? 1 : 0,
      String(b.platform || "").slice(0, 60),
      uid
    ).run();
  } catch {}
  return json({ success: true }, 200, request, env);
}

// ---- (47) Trạng thái hệ thống công khai ----
async function getStatusSummary(env) {
  const out = { channels: 0, up: 0, down: 0, flaky: 0, unknown: 0, checked_at: 0, down_list: [], api: "ok" };
  if (!hasDB(env)) { out.api = "no-db"; return out; }
  await ensureSchema(env);
  try {
    const { results } = await env.DB.prepare(
      `SELECT COALESCE(h.status, 'unknown') AS status, COUNT(*) AS n, MAX(COALESCE(h.checked_at, 0)) AS last
       FROM channels c LEFT JOIN channel_health h ON h.channel_id = c.channel_id
       WHERE c.is_active = 1 GROUP BY COALESCE(h.status, 'unknown')`
    ).all();
    for (const r of results || []) {
      out.channels += r.n;
      if (r.status === "up") out.up = r.n;
      else if (r.status === "down") out.down = r.n;
      else if (r.status === "flaky") out.flaky = r.n;
      else out.unknown += r.n;
      out.checked_at = Math.max(out.checked_at, r.last || 0);
    }
    const dl = await env.DB.prepare(
      `SELECT c.name FROM channels c JOIN channel_health h ON h.channel_id = c.channel_id
       WHERE h.status = 'down' AND c.is_active = 1 ORDER BY h.checked_at DESC LIMIT 20`
    ).all();
    out.down_list = (dl.results || []).map((r) => r.name);
  } catch (e) { out.api = "degraded"; }
  return out;
}

function statusHtml(s) {
  const pct = s.channels ? Math.round(((s.up + s.flaky) / s.channels) * 100) : 100;
  const color = pct >= 95 ? "#22c55e" : pct >= 80 ? "#fbbf24" : "#ef4444";
  const when = s.checked_at ? new Date(s.checked_at * 1000).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "chưa kiểm tra";
  const esc = (x) => String(x).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  return `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trạng thái hệ thống — CHRTV PLAY</title><meta http-equiv="refresh" content="60"><style>
*{box-sizing:border-box;margin:0;padding:0}body{min-height:100vh;background:#0b0c10;color:#e7e5e4;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:24px;display:flex;justify-content:center}
.wrap{max-width:720px;width:100%}.logo{display:inline-flex;gap:8px;font-weight:900;letter-spacing:.2em;font-size:12px;color:#ff9a3d;margin-bottom:18px}
.card{background:#14151c;border:1px solid rgba(255,255,255,.08);border-radius:22px;padding:26px;margin-bottom:14px}
h1{font-size:22px;margin-bottom:6px}.sub{font-size:12px;color:#a8a29e}
.big{font-size:52px;font-weight:900;color:${color};line-height:1.1;margin:10px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-top:16px}
.kpi{background:#0c0d11;border:1px solid rgba(255,255,255,.06);border-radius:14px;padding:14px}
.kpi b{display:block;font-size:22px;font-weight:800}.kpi span{font-size:11px;color:#a8a29e}
ul{list-style:none;margin-top:10px}li{font-size:13px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);color:#fca5a5}
a{color:#ff9a3d;text-decoration:none;font-weight:700;font-size:13px}small{color:#57534e;font-size:11px}
</style></head><body><div class="wrap">
<div class="logo">▶ CHRTV PLAY</div>
<div class="card"><h1>Trạng thái hệ thống</h1><p class="sub">Tự cập nhật mỗi 60 giây · lần kiểm tra kênh gần nhất: ${esc(when)}</p>
<div class="big">${pct}%</div><p class="sub">kênh đang phát bình thường</p>
<div class="grid">
<div class="kpi"><b>${s.channels}</b><span>tổng số kênh</span></div>
<div class="kpi"><b style="color:#22c55e">${s.up}</b><span>hoạt động tốt</span></div>
<div class="kpi"><b style="color:#fbbf24">${s.flaky}</b><span>chập chờn</span></div>
<div class="kpi"><b style="color:#ef4444">${s.down}</b><span>đang lỗi</span></div>
<div class="kpi"><b>${s.api === "ok" ? "OK" : esc(s.api)}</b><span>API</span></div>
</div></div>
${s.down_list.length ? `<div class="card"><h1 style="font-size:16px">Kênh đang lỗi</h1><ul>${s.down_list.map((n) => `<li>● ${esc(n)}</li>`).join("")}</ul></div>` : ""}
<div class="card"><a href="/">← Về CHRTV PLAY</a> &nbsp;·&nbsp; <small>Thấy kênh lỗi mà chưa có trong danh sách? Bấm nút “Báo kênh lỗi” ngay trong app nhé.</small></div>
</div></body></html>`;
}

// ========== WATCH PARTY (D1 + polling — khong phu thuoc gioi han cross-request WebSocket cua workerd) ==========
// Rooms + chat + reaction + trạng thái host lưu D1; client poll /api/party/feed mỗi ~2s.
async function handleParty(path, request, env) {
  // Lỗi D1 lẻ tẻ (bảng chưa có, quá tải…) trước đây ném thẳng ra ngoài -> Worker trả
  // 500/1102 và nút "Vào chat" ở màn Thể thao im lìm. Giờ luôn trả JSON có lý do.
  try {
    return await handlePartyInner(path, request, env);
  } catch (e) {
    console.error("party error:", e?.message || e);
    return json({ error: "Chat tạm thời không khả dụng", code: "PARTY_ERROR" }, 503, request, env);
  }
}

async function handlePartyInner(path, request, env) {
  if (!hasDB(env)) return json({ error: "Máy chủ chưa bật D1 nên chat chưa hoạt động", code: "NO_DB" }, 503, request, env);
  await ensureSchema(env);
  const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

  const touchMember = async (room, name) => {
    await env.DB.prepare("INSERT OR REPLACE INTO party_members (room, name, last_seen) VALUES (?, ?, ?)").bind(room, name, Date.now()).run();
  };

  if (path === "/api/party/join" && request.method === "POST") {
    const { room, name, channelId, channelName } = body;
    if (!room || !name) return json({ error: "Thiếu room/name" }, 400, request, env);
    // Host (người đầu tiên tạo phòng) ghi kênh đang xem
    const { results: existing } = await env.DB.prepare("SELECT room FROM party_rooms WHERE room = ?").bind(room).all();
    if (existing.length === 0 && channelId) {
      await env.DB.prepare("INSERT OR REPLACE INTO party_rooms (room, channel_id, channel_name, updated_at) VALUES (?, ?, ?, ?)").bind(room, channelId, channelName || "", Date.now()).run();
    }
    await touchMember(room, name);
    await env.DB.prepare("INSERT INTO party_messages (room, from_name, kind, text) VALUES (?, ?, 'join', ?)").bind(room, name, `${name} đã vào phòng`).run();
    return json({ success: true }, 200, request, env);
  }

  if (path === "/api/party/heartbeat" && request.method === "POST") {
    const { room, name } = body;
    if (!room || !name) return json({ error: "Thiếu room/name" }, 400, request, env);
    await touchMember(room, name);
    return json({ success: true }, 200, request, env);
  }

  if (path === "/api/party/state" && request.method === "POST") {
    const { room, channelId, channelName } = body;
    if (!room) return json({ error: "Thiếu room" }, 400, request, env);
    await env.DB.prepare("INSERT OR REPLACE INTO party_rooms (room, channel_id, channel_name, updated_at) VALUES (?, ?, ?, ?)").bind(room, channelId || "", channelName || "", Date.now()).run();
    return json({ success: true }, 200, request, env);
  }

  if (path === "/api/party/say" && request.method === "POST") {
    const { room, name, text } = body;
    if (!room || !name || !text) return json({ error: "Thiếu room/name/text" }, 400, request, env);
    await env.DB.prepare("INSERT INTO party_messages (room, from_name, kind, text) VALUES (?, ?, 'chat', ?)").bind(room, name, String(text).slice(0, 300)).run();
    return json({ success: true }, 200, request, env);
  }

  if (path === "/api/party/react" && request.method === "POST") {
    const { room, name, emoji } = body;
    if (!room || !emoji) return json({ error: "Thiếu room/emoji" }, 400, request, env);
    await env.DB.prepare("INSERT INTO party_messages (room, from_name, kind, text) VALUES (?, ?, 'reaction', ?)").bind(room, name || "Khách", String(emoji).slice(0, 8)).run();
    return json({ success: true }, 200, request, env);
  }

  if (path === "/api/party/leave" && request.method === "POST") {
    const { room, name } = body;
    if (room && name) {
      await env.DB.prepare("DELETE FROM party_members WHERE room = ? AND name = ?").bind(room, name).run();
      await env.DB.prepare("INSERT INTO party_messages (room, from_name, kind, text) VALUES (?, ?, 'leave', ?)").bind(room, name, `${name} đã rời phòng`).run();
    }
    return json({ success: true }, 200, request, env);
  }

  if (path === "/api/party/feed" && request.method === "GET") {
    const url = new URL(request.url);
    const room = url.searchParams.get("room") || "";
    const after = parseInt(url.searchParams.get("after") || "0", 10);
    if (!room) return json({ error: "Thiếu room" }, 400, request, env);
    const { results: messages } = await env.DB.prepare("SELECT id, from_name, kind, text, created_at FROM party_messages WHERE room = ? AND id > ? ORDER BY id ASC LIMIT 50").bind(room, after).all();
    const { results: roomRow } = await env.DB.prepare("SELECT channel_id, channel_name, updated_at FROM party_rooms WHERE room = ?").bind(room).all();
    const { results: members } = await env.DB.prepare("SELECT name FROM party_members WHERE room = ? AND last_seen > ? ORDER BY name ASC").bind(room, Date.now() - 45000).all();
    return json({ success: true, messages, state: roomRow[0] ? { channelId: roomRow[0].channel_id, channelName: roomRow[0].channel_name, updatedAt: roomRow[0].updated_at } : null, members: members.map((m) => ({ name: m.name })) }, 200, request, env);
  }

  return json({ error: "Not found" }, 404, request, env);
}

// ========== STATS / PRESENCE / XP (BXH kênh xem nhiều, fan cứng, dashboard realtime) ==========
async function handleStats(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const nowS = Math.floor(Date.now() / 1000);
  if (path === "/api/stats/beat" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const auth = await getAuth(request, env);
    const uid = auth && auth.user ? auth.user.id : 0;
    const name = String(b.name || (auth && auth.user ? (auth.user.display_name || auth.user.username) : "Khách") || "Khách").slice(0, 40);
    const sid = String(b.sid || "").slice(0, 48) || ("u" + uid + "_" + (request.headers.get("CF-Connecting-IP") || "local"));
    const kind = ["channel", "movie", "short", "sport"].includes(b.kind) ? b.kind : "channel";
    const refId = String(b.ref_id || "").slice(0, 80);
    const refName = String(b.ref_name || "").slice(0, 80);
    const sec = Math.max(0, Math.min(600, parseInt(b.seconds) || 0));
    try {
      // presence (ghi đè theo tab) + dọn hàng cũ > 5 phút
      await env.DB.prepare("INSERT OR REPLACE INTO presence (sid, user_id, name, kind, ref_id, ref_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(sid, uid, name, kind, refId, refName, nowS).run();
      await env.DB.prepare("DELETE FROM presence WHERE updated_at < ?").bind(nowS - 300).run();
      if (kind === "channel" && refId) {
        await env.DB.prepare("INSERT INTO watch_counters (channel_id, views, seconds, updated_at) VALUES (?, 0, ?, ?) ON CONFLICT(channel_id) DO UPDATE SET seconds = seconds + ?, updated_at = ?").bind(refId, sec, nowS, sec, nowS).run();
        if (b.viewed) await env.DB.prepare("UPDATE watch_counters SET views = views + 1 WHERE channel_id = ?").bind(refId).run();
        // (3) "Đang hot": gom theo ô 5 phút để xếp hạng 15 phút gần nhất
        const bucket = Math.floor(nowS / 300);
        await env.DB.prepare("INSERT INTO watch_pulse (channel_id, bucket, seconds, views) VALUES (?, ?, ?, ?) ON CONFLICT(channel_id, bucket) DO UPDATE SET seconds = seconds + ?, views = views + ?")
          .bind(refId, bucket, sec, b.viewed ? 1 : 0, sec, b.viewed ? 1 : 0).run();
        // (#5) tách theo quốc gia người xem — "Đang hot tại 🇻🇳"
        const cc = String(((b && b.country) || (request.cf && request.cf.country) || "")).trim().toUpperCase().slice(0, 2);
        if (/^[A-Z]{2}$/.test(cc)) {
          await env.DB.prepare("INSERT INTO watch_cc (channel_id, country, bucket, seconds, views) VALUES (?, ?, ?, ?, ?) ON CONFLICT(channel_id, country, bucket) DO UPDATE SET seconds = seconds + ?, views = views + ?")
            .bind(refId, cc, bucket, sec, b.viewed ? 1 : 0, sec, b.viewed ? 1 : 0).run();
        }
      }
      // (#84) dữ liệu cho Wrapped: giây xem theo loại
      if (uid && refId && sec > 0) {
        await env.DB.prepare("INSERT INTO user_watch (user_id, kind, ref_id, ref_name, sec, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, kind, ref_id) DO UPDATE SET sec = sec + excluded.sec, ref_name = COALESCE(NULLIF(excluded.ref_name, ''), ref_name), updated_at = excluded.updated_at")
          .bind(uid, kind, refId.slice(0, 80), refName, sec, nowS).run();
      }
      if (uid && sec > 0) {
        const xp = Math.floor(sec / 60); // 1 phút xem = 1 XP
        await env.DB.prepare("INSERT INTO user_xp (user_id, xp, watch_sec, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET xp = xp + ?, watch_sec = watch_sec + ?, updated_at = ?").bind(uid, xp, sec, nowS, xp, sec, nowS).run();
      }
    } catch {}
    return json({ success: true }, 200, request, env);
  }
  if (path === "/api/stats/top" && request.method === "GET") {
    try {
      const { results } = await env.DB.prepare("SELECT w.channel_id, w.views, w.seconds, c.name, c.logo, c.group_title FROM watch_counters w LEFT JOIN channels c ON c.channel_id = w.channel_id ORDER BY w.seconds DESC, w.views DESC LIMIT 10").all();
      return json({ success: true, top: results || [] }, 200, request, env);
    } catch { return json({ success: true, top: [] }, 200, request, env); }
  }
  if (path === "/api/stats/trending" && request.method === "GET") {
    // Xếp hạng theo 15 phút gần nhất (3 ô 5 phút). Ít dữ liệu quá thì trả rỗng để
    // client tự rơi về bảng xếp hạng tổng.
    try {
      const from = Math.floor(nowS / 300) - 2;
      const { results } = await env.DB.prepare(
        `SELECT p.channel_id, SUM(p.seconds) AS seconds, SUM(p.views) AS views, c.name, c.logo, c.group_title
         FROM watch_pulse p LEFT JOIN channels c ON c.channel_id = p.channel_id
         WHERE p.bucket >= ? GROUP BY p.channel_id ORDER BY seconds DESC, views DESC LIMIT 10`
      ).bind(from).all();
      return json({ success: true, window_min: 15, trending: results || [] }, 200, request, env);
    } catch { return json({ success: true, window_min: 15, trending: [] }, 200, request, env); }
  }
  if (path === "/api/stats/top-fans" && request.method === "GET") {
    try {
      const { results } = await env.DB.prepare("SELECT x.user_id, x.xp, x.watch_sec, COALESCE(u.display_name, u.username, '') AS name, u.avatar_url FROM user_xp x LEFT JOIN users u ON u.id = x.user_id ORDER BY x.xp DESC LIMIT 20").all();
      return json({ success: true, fans: results || [] }, 200, request, env);
    } catch { return json({ success: true, fans: [] }, 200, request, env); }
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ========== HỒ SƠ CÔNG KHAI + HUY HIỆU ==========
function serverBadges(xp, watchSec, predPoints) {
  const hrs = (watchSec || 0) / 3600;
  const out = [];
  if (xp > 0) out.push({ id: "first_watch", icon: "📺", name: "Chào sân" });
  if (hrs >= 1) out.push({ id: "hour1", icon: "⏱️", name: "Mọt phim 1h" });
  if (hrs >= 10) out.push({ id: "hour10", icon: "🔥", name: "Cày 10 giờ" });
  if (hrs >= 50) out.push({ id: "hour50", icon: "🚀", name: "Cày 50 giờ" });
  if (hrs >= 100) out.push({ id: "hour100", icon: "👑", name: "Huyền thoại 100h" });
  if (xp >= 100) out.push({ id: "xp100", icon: "⭐", name: "Ngôi sao 100 XP" });
  if (xp >= 500) out.push({ id: "xp500", icon: "💎", name: "Kim cương 500 XP" });
  if ((predPoints || 0) >= 10) out.push({ id: "oracle", icon: "🔮", name: "Thầy bói" });
  return out;
}
async function handlePublicProfile(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  if (path === "/api/profile" && request.method === "GET") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const { results } = await env.DB.prepare("SELECT handle, bio, avatar_url, is_public FROM public_profiles WHERE user_id = ?").bind(auth.user.id).all();
    return json({ success: true, profile: results[0] || { handle: "", bio: "", avatar_url: auth.user.avatar_url || "", is_public: 0 } }, 200, request, env);
  }
  if (path === "/api/profile" && (request.method === "PUT" || request.method === "POST")) {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const b = await request.json().catch(() => ({}));
    const handle = String(b.handle || "").trim().toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 20);
    if (!handle || handle.length < 3) return json({ error: "Tên hiển thị cần ≥ 3 ký tự (chữ/số/_/.)" }, 400, request, env);
    const bio = String(b.bio || "").slice(0, 200);
    const avatar = String(b.avatar_url || "").slice(0, 300);
    const pub = b.is_public ? 1 : 0;
    try {
      await env.DB.prepare("INSERT INTO public_profiles (user_id, handle, bio, avatar_url, is_public) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET handle = ?, bio = ?, avatar_url = ?, is_public = ?").bind(auth.user.id, handle, bio, avatar, pub, handle, bio, avatar, pub).run();
    } catch (e) {
      if (String(e?.message || "").includes("UNIQUE")) return json({ error: "Tên này đã có người dùng" }, 409, request, env);
      throw e;
    }
    return json({ success: true, handle }, 200, request, env);
  }
  if (path === "/api/u" && request.method === "GET") {
    const handle = String(q.get("handle") || "").trim().toLowerCase();
    if (!handle) return json({ error: "Thiếu handle" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT p.*, COALESCE(u.display_name, u.username, '') AS name FROM public_profiles p LEFT JOIN users u ON u.id = p.user_id WHERE p.handle = ? AND p.is_public = 1").bind(handle).all();
    const p = results[0];
    if (!p) return json({ error: "Không tìm thấy hồ sơ" }, 404, request, env);
    let xp = 0, watchSec = 0, predPoints = 0;
    try {
      const { results: xr } = await env.DB.prepare("SELECT xp, watch_sec FROM user_xp WHERE user_id = ?").bind(p.user_id).all();
      xp = xr[0]?.xp || 0; watchSec = xr[0]?.watch_sec || 0;
      const { results: pr } = await env.DB.prepare("SELECT COALESCE(SUM(points), 0) AS s FROM predictions WHERE user_id = ? AND points IS NOT NULL").bind(p.user_id).all();
      predPoints = pr[0]?.s || 0;
    } catch {}
    return json({ success: true, profile: { handle: p.handle, name: p.name, bio: p.bio, avatar_url: p.avatar_url, xp, watch_sec: watchSec, pred_points: predPoints, badges: serverBadges(xp, watchSec, predPoints) } }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ========== BÌNH LUẬN (phim/kênh) ==========
async function handleComments(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  if (request.method === "GET") {
    const target = String(q.get("target") || "").slice(0, 100);
    if (!target) return json({ error: "Thiếu target" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT id, user_id, name, body, created_at, tstamp, voice_url, kind, pinned FROM comments WHERE target = ? AND status = 'visible' ORDER BY pinned DESC, id DESC LIMIT 100").bind(target).all();
    return json({ success: true, comments: results || [] }, 200, request, env);
  }
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  if (request.method === "POST") {
    try {
      const rl = await rateLimitCheck(env, "comment:u:" + auth.user.id, 10, 60);
      if (!rl.allowed) return json({ error: "Bình luận quá nhanh — thử lại sau.", code: "RATE_LIMITED" }, 429, request, env);
    } catch {}
    const b = await request.json().catch(() => ({}));
    const target = String(b.target || "").slice(0, 100);
    const body = String(b.body || "").trim().slice(0, 500);
    if (!target || !body) return json({ error: "Thiếu nội dung" }, 400, request, env);
    const name = String(auth.user.display_name || auth.user.username || "Bạn xem").slice(0, 40);
    // (#9) bình luận gắn phút: tstamp >= 0; (#68) voice-note: voice_url (dataURL nhỏ) + kind='voice'
    const tstamp = Number.isFinite(Number(b.tstamp)) && Number(b.tstamp) >= 0 ? Math.floor(Number(b.tstamp)) : -1;
    const voice_url = String(b.voice_url || "").slice(0, 600000);
    const kind = b.kind === "voice" ? "voice" : "comment";
    const insert = "INSERT INTO comments (target, user_id, name, body, tstamp, voice_url, kind) VALUES (?, ?, ?, ?, ?, ?, ?)";
    const r = await env.DB.prepare(insert).bind(target, auth.user.id, name, body, tstamp, voice_url, kind).run();
    try { await env.DB.prepare("INSERT INTO user_xp (user_id, xp, watch_sec, updated_at) VALUES (?, 2, 0, ?) ON CONFLICT(user_id) DO UPDATE SET xp = xp + 2").bind(auth.user.id, Math.floor(Date.now() / 1000)).run(); } catch {}
    return json({ success: true, id: r.meta?.last_row_id || 0 }, 200, request, env);
  }
  if (request.method === "DELETE") {
    const b = await request.json().catch(() => ({}));
    const id = parseInt(b.id) || 0;
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    const isAdmin = auth.user.role === "admin";
    if (isAdmin) await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id).run();
    else await env.DB.prepare("DELETE FROM comments WHERE id = ? AND user_id = ?").bind(id, auth.user.id).run();
    return json({ success: true }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ========== NHÓM FAN (theo phim/kênh) ==========
async function handleFanGroups(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  if (request.method === "GET") {
    const target = String(q.get("target") || "").slice(0, 100);
    if (!target) return json({ error: "Thiếu target" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT * FROM fan_groups WHERE target = ?").bind(target).all();
    const g = results[0] || null;
    let members = [], joined = false;
    if (g) {
      const m = await env.DB.prepare("SELECT user_id, name FROM fan_members WHERE group_id = ? ORDER BY id DESC LIMIT 50").all();
      members = m.results || [];
      const auth = await getAuth(request, env);
      if (auth && auth.user) joined = members.some((x) => x.user_id === auth.user.id);
    }
    return json({ success: true, group: g, members, member_count: g ? members.length : 0, joined }, 200, request, env);
  }
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  const b = await request.json().catch(() => ({}));
  const target = String(b.target || "").slice(0, 100);
  if (!target) return json({ error: "Thiếu target" }, 400, request, env);
  const name = String(auth.user.display_name || auth.user.username || "Bạn xem").slice(0, 40);
  if (request.method === "POST") {
    const gname = String(b.name || "").slice(0, 60) || ("Fan " + target);
    let g;
    const { results } = await env.DB.prepare("SELECT * FROM fan_groups WHERE target = ?").bind(target).all();
    if (results[0]) g = results[0];
    else {
      const r = await env.DB.prepare("INSERT INTO fan_groups (target, name, created_by) VALUES (?, ?, ?)").bind(target, gname, auth.user.id).run();
      g = { id: r.meta?.last_row_id || 0, target, name: gname };
    }
    await env.DB.prepare("INSERT OR IGNORE INTO fan_members (group_id, user_id, name) VALUES (?, ?, ?)").bind(g.id, auth.user.id, name).run();
    return json({ success: true, group: g, joined: true }, 200, request, env);
  }
  if (request.method === "DELETE") {
    const { results } = await env.DB.prepare("SELECT id FROM fan_groups WHERE target = ?").bind(target).all();
    if (results[0]) await env.DB.prepare("DELETE FROM fan_members WHERE group_id = ? AND user_id = ?").bind(results[0].id, auth.user.id).run();
    return json({ success: true, joined: false }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// Kích hoạt gói cho user (payments/gift/admin dùng chung)
async function activatePlan(env, userId, plan, days) {
  const p = ["signature", "elite", "ultimate", "recreational", "standard"].includes(String(plan)) ? String(plan) : "signature";
  const d = Math.max(1, Math.min(3650, parseInt(days) || 30));
  const nowS = Math.floor(Date.now() / 1000);
  let base = nowS;
  try {
    const { results } = await env.DB.prepare("SELECT expires_at, plan FROM user_plans WHERE user_id = ?").bind(userId).all();
    if (results[0] && results[0].expires_at > nowS && results[0].plan === p) base = results[0].expires_at;
  } catch {}
  const exp = base + d * 86400;
  await env.DB.prepare("INSERT INTO user_plans (user_id, plan, expires_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET plan = ?, expires_at = ?, updated_at = ?").bind(userId, p, exp, nowS, p, exp, nowS).run();
  await env.DB.prepare("UPDATE users SET plan = ? WHERE id = ?").bind(p, userId).run();
  return exp;
}

// ========== GIFT CODE ==========
// Sinh mã quà ngẫu nhiên dễ đọc (bỏ I/O/0/1 chống đọc nhầm): CHRTV-XXXX-XXXX-XXXX
function randomGiftCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const pick = (n) => {
    const a = new Uint32Array(n);
    crypto.getRandomValues(a);
    return Array.from(a, (x) => alphabet[x % alphabet.length]).join("");
  };
  return `CHRTV-${pick(4)}-${pick(4)}-${pick(4)}`;
}

// TẶNG GÓI QUÀ KÊNH CHO BẠN BÈ: user tự tạo mã quà gói cước rồi gửi mã/link
// cho bạn. Nếu ghi tên đăng nhập người nhận thì CHỈ tài khoản đó dùng được mã.
async function handleGiftCreate(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  if (request.method !== "POST") return json({ error: "Not found" }, 404, request, env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED", message: "Đăng nhập để tặng quà." }, 401, request, env);
  // chống spam tạo mã: tối đa 10 quà/giờ mỗi tài khoản
  try {
    const rl = await rateLimitCheck(env, "giftmk:u:" + auth.user.id, 10, 3600);
    if (!rl.allowed) return json({ error: "Bạn tạo quà hơi nhanh — thử lại sau ít phút.", code: "RATE_LIMITED" }, 429, request, env);
  } catch {}
  const b = await request.json().catch(() => ({}));
  const plan = String(b.plan || "").toLowerCase();
  if (!["signature", "elite", "ultimate", "recreational", "standard"].includes(plan)) {
    return json({ error: "Gói không hợp lệ", code: "BAD_PLAN" }, 400, request, env);
  }
  const days = Math.max(1, Math.min(3650, parseInt(b.days) || 30));
  const toRaw = String(b.to || b.to_username || "").trim().slice(0, 40);
  const note = String(b.note || "").trim().slice(0, 200);
  let toUsername = "";
  if (toRaw) {
    const { results } = await env.DB.prepare("SELECT username FROM users WHERE username = ? COLLATE NOCASE LIMIT 1").bind(toRaw).all();
    if (!results || !results.length) {
      return json({ error: `Không tìm thấy tài khoản "${toRaw}" — kiểm tra lại tên đăng nhập của bạn bè.`, code: "USER_NOT_FOUND" }, 404, request, env);
    }
    toUsername = results[0].username;
    if (toUsername.toLowerCase() === String(auth.user.username || "").toLowerCase()) {
      return json({ error: "Không thể tặng cho chính mình.", code: "SELF_GIFT" }, 400, request, env);
    }
  }
  // sinh mã không trùng (thử tối đa 5 lần)
  let code = randomGiftCode();
  for (let i = 0; i < 5; i++) {
    const { results } = await env.DB.prepare("SELECT code FROM gift_codes WHERE code = ?").bind(code).all();
    if (!results || !results.length) break;
    code = randomGiftCode();
  }
  await env.DB.prepare(
    "INSERT INTO gift_codes (code, plan, days, max_uses, used, is_active, note, created_by, to_username) VALUES (?, ?, ?, 1, 0, 1, ?, ?, ?)"
  ).bind(code, plan, days, note, auth.user.id, toUsername).run();
  try { await logAudit(env, auth.user.id, "gift.user_create", { code, plan, days, to: toUsername }); } catch {}
  return json({ success: true, code, plan, days, to_username: toUsername, note, max_uses: 1 }, 201, request, env);
}

// Danh sách quà TÔI ĐÃ TẶNG + quà bạn bè tặng TÔI (chờ nhận)
async function handleGiftMine(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  if (request.method !== "GET") return json({ error: "Not found" }, 404, request, env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  const out = { sent: [], received: [] };
  const shape = (g) => ({
    code: g.code, plan: g.plan, days: g.days, note: g.note || "",
    to_username: g.to_username || "", used: g.used, max_uses: g.max_uses,
    is_active: !!g.is_active, created_at: g.created_at,
    status: g.used >= g.max_uses ? "redeemed" : (g.is_active ? "pending" : "disabled"),
  });
  try {
    const { results } = await env.DB.prepare(
      "SELECT code, plan, days, note, to_username, used, max_uses, is_active, created_at FROM gift_codes WHERE created_by = ? ORDER BY created_at DESC LIMIT 100"
    ).bind(auth.user.id).all();
    out.sent = (results || []).map(shape);
  } catch {}
  try {
    const { results } = await env.DB.prepare(
      "SELECT code, plan, days, note, to_username, used, max_uses, is_active, created_at FROM gift_codes WHERE to_username = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 100"
    ).bind(auth.user.username || "").all();
    out.received = (results || []).map(shape);
  } catch {}
  return json({ success: true, ...out }, 200, request, env);
}

async function handleGiftRedeem(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  if (request.method !== "POST") return json({ error: "Not found" }, 404, request, env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  try {
    const rl = await rateLimitCheck(env, "gift:u:" + auth.user.id, 10, 3600);
    if (!rl.allowed) return json({ error: "Nhập sai quá nhiều — thử lại sau 1 giờ.", code: "RATE_LIMITED" }, 429, request, env);
  } catch {}
  const b = await request.json().catch(() => ({}));
  const code = String(b.code || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 32);
  if (!code) return json({ error: "Thiếu mã quà tặng" }, 400, request, env);
  const { results } = await env.DB.prepare("SELECT * FROM gift_codes WHERE code = ?").bind(code).all();
  const g = results[0];
  if (!g || !g.is_active) return json({ error: "Mã không tồn tại hoặc đã tắt" }, 404, request, env);
  // Quà tặng CÀI TÊN người nhận (tính năng tặng gói cho bạn): chỉ tài khoản đó dùng được
  if (g.to_username && String(g.to_username).toLowerCase() !== String(auth.user.username || "").toLowerCase()) {
    return json({ error: "Mã này được tặng riêng cho người khác", code: "NOT_YOURS" }, 403, request, env);
  }
  if (g.used >= g.max_uses) return json({ error: "Mã đã hết lượt dùng" }, 410, request, env);
  const { results: mine } = await env.DB.prepare("SELECT id FROM gift_redemptions WHERE code = ? AND user_id = ?").bind(code, auth.user.id).all();
  if (mine.length) return json({ error: "Bạn đã dùng mã này rồi" }, 409, request, env);
  await env.DB.prepare("UPDATE gift_codes SET used = used + 1 WHERE code = ?").bind(code).run();
  await env.DB.prepare("INSERT INTO gift_redemptions (code, user_id) VALUES (?, ?)").bind(code, auth.user.id).run();
  const exp = await activatePlan(env, auth.user.id, g.plan, g.days);
  try { await logAudit(env, auth.user.id, "gift.redeem", { code, plan: g.plan }); } catch {}
  return json({ success: true, plan: g.plan, days: g.days, expires_at: exp }, 200, request, env);
}

// ========== THANH TOÁN (VietQR + SePay webhook + duyệt tay) ==========
async function handlePayments(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const nowS = Math.floor(Date.now() / 1000);
  if (path === "/api/payments/config" && request.method === "GET") {
    let cfg = null;
    try {
      const { results } = await env.DB.prepare("SELECT bank_id, account_no, account_name, template, note FROM payment_config WHERE id = 1").all();
      cfg = results[0] || null;
    } catch {}
    let plans = [];
    try {
      const { results } = await env.DB.prepare("SELECT code, name, price, price_text, tagline, color FROM plans WHERE is_active = 1 AND price > 0 ORDER BY rank ASC").all();
      plans = results || [];
    } catch {}
    return json({ success: true, config: cfg, plans }, 200, request, env);
  }
  if (path === "/api/payments/order" && request.method === "POST") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const b = await request.json().catch(() => ({}));
    const plan = String(b.plan || "").toLowerCase();
    const { results } = await env.DB.prepare("SELECT code, price FROM plans WHERE code = ? AND is_active = 1").bind(plan).all();
    if (!results[0] || !(results[0].price > 0)) return json({ error: "Gói không bán online" }, 400, request, env);
    const order = ("CHRTV" + auth.user.id + Date.now().toString(36)).toUpperCase().slice(0, 24);
    await env.DB.prepare("INSERT INTO payments (user_id, username, plan, amount, order_code, status) VALUES (?, ?, ?, ?, ?, 'pending')").bind(auth.user.id, auth.user.username || "", plan, results[0].price, order).run();
    return json({ success: true, order_code: order, amount: results[0].price, plan }, 200, request, env);
  }
  if (path === "/api/payments/claim" && request.method === "POST") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const b = await request.json().catch(() => ({}));
    const order = String(b.order_code || "").trim().toUpperCase().slice(0, 32);
    if (!order) return json({ error: "Thiếu mã đơn" }, 400, request, env);
    const { results } = await env.DB.prepare("SELECT * FROM payments WHERE order_code = ? AND user_id = ?").bind(order, auth.user.id).all();
    const pm = results[0];
    if (!pm) return json({ error: "Không tìm thấy đơn" }, 404, request, env);
    if (pm.status === "paid") return json({ success: true, status: "paid" }, 200, request, env);
    await env.DB.prepare("UPDATE payments SET status = 'claimed' WHERE order_code = ?").bind(order).run();
    return json({ success: true, status: "claimed" }, 200, request, env);
  }
  // Webhook SePay: POST kèm Authorization: Apikey <SEPAY_TOKEN> (khớp payment_config.sepay_token)
  // Body mẫu SePay: { content, transferType, transferAmount, referenceCode, ... }
  if (path === "/api/payments/sepay-webhook" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    let cfgToken = "";
    try {
      const { results } = await env.DB.prepare("SELECT sepay_token FROM payment_config WHERE id = 1").all();
      cfgToken = results[0]?.sepay_token || "";
    } catch {}
    const got = String(request.headers.get("Authorization") || "").replace(/^Apikey\s+/i, "").trim();
    if (!cfgToken || got !== cfgToken) return json({ error: "Forbidden" }, 403, request, env);
    if (String(b.transferType || "").toLowerCase() === "out") return json({ success: true, skipped: "out" }, 200, request, env);
    const content = String(b.content || b.description || "");
    const m = content.toUpperCase().match(/CHRTV[A-Z0-9]{3,24}/);
    const amount = parseInt(b.transferAmount ?? b.amount ?? 0) || 0;
    if (!m) return json({ success: false, error: "NO_ORDER" }, 200, request, env);
    const order = m[0];
    const { results } = await env.DB.prepare("SELECT * FROM payments WHERE order_code = ?").bind(order).all();
    const pm = results[0];
    if (!pm || pm.status === "paid") return json({ success: true, skipped: pm ? "done" : "unknown" }, 200, request, env);
    if (amount < pm.amount) {
      await env.DB.prepare("UPDATE payments SET status = 'underpaid', payload = ? WHERE order_code = ?").bind(JSON.stringify(b).slice(0, 1000), order).run();
      return json({ success: true, skipped: "underpaid" }, 200, request, env);
    }
    await env.DB.prepare("UPDATE payments SET status = 'paid', paid_at = datetime('now'), payload = ? WHERE order_code = ?").bind(JSON.stringify(b).slice(0, 1000), order).run();
    const exp = await activatePlan(env, pm.user_id, pm.plan, 30);
    try { await logAudit(env, pm.user_id, "payment.auto", { order, plan: pm.plan, amount }); } catch {}
    return json({ success: true, order, expires_at: exp }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ========== QUẢNG CÁO (kích hoạt lười theo starts_at/ends_at — như events) ==========
async function handleAds(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  if (request.method !== "GET") return json({ error: "Not found" }, 404, request, env);
  const slot = String(new URL(request.url).searchParams.get("slot") || "").slice(0, 30);
  const cc = viewerCountry(request);
  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    let sql = "SELECT id, slot, title, image_url, link_url, video_url FROM ads WHERE is_active = 1 AND (starts_at = '' OR starts_at IS NULL OR starts_at <= ?) AND (ends_at = '' OR ends_at IS NULL OR ends_at >= ?) AND (blocked_regions IS NULL OR blocked_regions = '' OR INSTR(',' || blocked_regions || ',', ?) = 0)";
    const args = [now, now, "," + cc + ","];
    if (slot) { sql += " AND slot = ?"; args.push(slot); }
    sql += " ORDER BY sort_order ASC, id DESC LIMIT 10";
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return json({ success: true, ads: results || [] }, 200, request, env);
  } catch { return json({ success: true, ads: [] }, 200, request, env); }
}

// ========== NGUỒN PHÁT PHIM (movie_sources + nguồn free mặc định) ==========
// GET /api/movie/sources?tmdb=<id>&type=movie|tv&season=1&episode=1
// Trả danh sách nguồn theo thứ tự:
//   1) nguồn admin thêm và đang BẬT (Admin Panel → Nguồn phim)
//   2) nguồn free mặc định (BUILTIN_MOVIE_SOURCES) — mở phim là xem được ngay,
//      trừ khi tắt bằng biến môi trường MOVIE_BUILTIN_SOURCES=0
// Mọi URL đều phải https:// và domain nằm trong allowlist (custom qua secret
// MOVIE_FRAME_SRC + domain của nguồn mặc định). Nguồn ở domain lạ bị lọc ngay
// ở server, chứ không phải chờ CSP chặn ở trình duyệt (user chỉ thấy khung đen).
async function handleMovieSources(request, env) {
  const empty = (reason) => json({ success: true, sources: [], reason }, 200, request, env);
  if (!hasDB(env)) return empty("no-db");
  const allow = allowedEmbedOrigins(env);
  // Chỉ xảy ra khi admin tắt nguồn mặc định mà chưa khai secret nào.
  if (allow.length === 0) return empty("no_frame_allowlist");
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  const tmdb = String(q.get("tmdb") || "");
  if (!/^\d{1,10}$/.test(tmdb)) return json({ success: false, error: "Thiếu tmdb id hợp lệ" }, 400, request, env);
  const type = q.get("type") === "tv" ? "tv" : "movie";
  const num = (v, d) => (/^\d{1,4}$/.test(String(v || "")) ? String(v) : String(d));
  const season = num(q.get("season"), 1);
  const episode = num(q.get("episode"), 1);

  let rows = [];
  try {
    const cc = viewerCountry(request);
    // (B) lọc vùng chặn ở movie_sources — nguồn không phát được ở quốc gia của khán giả
    const { results } = await env.DB.prepare(
      "SELECT id, name, kind, url_template, label FROM movie_sources WHERE is_active = 1 AND (blocked_regions IS NULL OR blocked_regions = '' OR INSTR(',' || blocked_regions || ',', ?) = 0) ORDER BY sort_order ASC, id ASC LIMIT 20"
    ).bind("," + cc + ",").all();
    rows = results || [];
  } catch { rows = []; } // bảng lỗi cũng không sao — nguồn mặc định vẫn chạy

  // Nguồn admin (id thật) trước, nguồn mặc định (id 1000+) sau.
  const combined = [
    ...rows,
    ...(movieBuiltinsEnabled(env)
      ? BUILTIN_MOVIE_SOURCES.map((b, i) => ({ id: 1000 + i, ...b }))
      : []),
  ];

  const out = [];
  for (const r of combined) {
    const url = expandMovieUrl(r.url_template, tmdb, type, season, episode);
    let origin = "";
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") continue; // không cho http:// (mix content + token lộ)
      origin = u.origin.toLowerCase();
    } catch { continue; }
    if (!allow.includes(origin)) continue;
    // (#29) label chất lượng nguồn (HD/4K...) để so "bản ngon hơn"
    const label = String(r.label || "").trim().slice(0, 20) || "";
    out.push({ id: r.id, name: String(r.name || "Nguồn").slice(0, 40), kind: r.kind === "hls" ? "hls" : "embed", url, label });
  }
  // (#29) user đang "muốn xem" phim này mà giờ có nguồn HD+ -> 1 thông báo/3 ngày
  try {
    const a = await getAuth(request, env);
    if (a && a.user) await maybeWishlistQualityNotify(env, a.user.id, Number(tmdb), type, out);
  } catch {}
  return json({ success: true, sources: out }, 200, request, env);
}

// Kiểm tra 1 url_template có nằm trong allowlist không (dùng khi admin lưu nguồn).
function movieSourceCheck(urlTemplate, allow) {
  const u = String(urlTemplate || "").trim();
  if (!u) return { ok: false, error: "Thiếu url_template" };
  if (/\{[^}]*\}/.test(u) && !/\{(?:tmdb|type|season|episode)\}/.test(u)) {
    return { ok: false, error: "Placeholder không hợp lệ (chỉ: {tmdb} {type} {season} {episode})" };
  }
  const probe = u.replace(/\{tmdb\}/g, "1").replace(/\{type\}/g, "movie").replace(/\{season\}/g, "1").replace(/\{episode\}/g, "1");
  let origin = "";
  try {
    const parsed = new URL(probe);
    if (parsed.protocol !== "https:") return { ok: false, error: "url_template phải là https://" };
    origin = parsed.origin.toLowerCase();
  } catch { return { ok: false, error: "url_template không parse được thành URL" }; }
  if (!allow.includes(origin)) {
    return { ok: false, error: `Domain ${origin} chưa có trong MOVIE_FRAME_SRC — chạy: wrangler secret put MOVIE_FRAME_SRC (nội dung: "${allow.join(" ") || origin}" — thêm domain này vào)`, origin };
  }
  return { ok: true, origin };
}

// ========== DỰ ĐOÁN TỈ SỐ ==========
async function handlePredictions(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  if (request.method === "GET") {
    const q = new URL(request.url).searchParams;
    const key = String(q.get("event") || "").slice(0, 60);
    const auth = await getAuth(request, env);
    let mine = null;
    if (key && auth && auth.user) {
      const { results } = await env.DB.prepare("SELECT ph, pa, points FROM predictions WHERE user_id = ? AND event_key = ?").bind(auth.user.id, key).all();
      mine = results[0] || null;
    }
    // BXH dự đoán: tổng điểm
    let board = [];
    try {
      const { results } = await env.DB.prepare("SELECT p.user_id, COALESCE(u.display_name, u.username, '') AS name, COALESCE(SUM(p.points), 0) AS pts, COUNT(*) AS n FROM predictions p LEFT JOIN users u ON u.id = p.user_id WHERE p.points IS NOT NULL GROUP BY p.user_id ORDER BY pts DESC LIMIT 20").all();
      board = results || [];
    } catch {}
    return json({ success: true, mine, board }, 200, request, env);
  }
  if (request.method === "POST") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const b = await request.json().catch(() => ({}));
    const key = String(b.event_key || "").slice(0, 60);
    const ph = Math.max(0, Math.min(20, parseInt(b.ph ?? -1)));
    const pa = Math.max(0, Math.min(20, parseInt(b.pa ?? -1)));
    if (!key || ph < 0 || pa < 0) return json({ error: "Thiếu dự đoán" }, 400, request, env);
    // Khoá khi đã chấm điểm
    const { results } = await env.DB.prepare("SELECT points FROM predictions WHERE user_id = ? AND event_key = ?").bind(auth.user.id, key).all();
    if (results[0] && results[0].points !== null) return json({ error: "Trận này đã chốt kết quả" }, 409, request, env);
    await env.DB.prepare("INSERT INTO predictions (user_id, event_key, league, home, away, ph, pa) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, event_key) DO UPDATE SET ph = ?, pa = ?").bind(auth.user.id, key, String(b.league || "").slice(0, 40), String(b.home || "").slice(0, 60), String(b.away || "").slice(0, 60), ph, pa, ph, pa).run();
    return json({ success: true }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}
// Chấm điểm 1 trận: đúng tỉ số = 3, đúng cửa thắng/hoà/thua = 1 (+XP tương ứng)
async function settlePredictions(env, eventKey, hs, cs) {
  const { results } = await env.DB.prepare("SELECT user_id, ph, pa FROM predictions WHERE event_key = ? AND points IS NULL").bind(eventKey).all();
  const out = (a, b) => (a > b ? 1 : a < b ? -1 : 0);
  let n = 0;
  for (const r of results || []) {
    const pts = (r.ph === hs && r.pa === cs) ? 3 : (out(r.ph, r.pa) === out(hs, cs) ? 1 : 0);
    await env.DB.prepare("UPDATE predictions SET points = ? WHERE user_id = ? AND event_key = ?").bind(pts, r.user_id, eventKey).run();
    if (pts > 0) {
      try { await env.DB.prepare("INSERT INTO user_xp (user_id, xp, watch_sec, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET xp = xp + ?").bind(r.user_id, pts, Math.floor(Date.now() / 1000), pts).run(); } catch {}
    }
    n++;
  }
  return n;
}

// ========== LỊCH ĐĂNG (lazy): tới giờ => đẩy vào broadcasts/notifications ==========
async function evalScheduled(env) {
  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const { results } = await env.DB.prepare("SELECT * FROM scheduled_posts WHERE is_done = 0 AND publish_at <= ? ORDER BY publish_at ASC LIMIT 20").bind(now).all();
    for (const p of results || []) {
      try {
        if (p.kind === "broadcast") {
          await env.DB.prepare("INSERT INTO broadcasts (message, type, is_active) VALUES (?, 'info', 1)").bind(String(p.title ? p.title + " — " : "") + String(p.body || "")).run();
        } else if (p.kind === "notify") {
          await env.DB.prepare("INSERT INTO notifications (title, body, type, url, target) VALUES (?, ?, 'promo', ?, 'all')").bind(p.title || "Thông báo", p.body || "", p.link_value || "").run();
        } else if (p.kind === "event") {
          await env.DB.prepare("INSERT INTO events (title, subtitle, image_url, link_type, link_value, is_active) VALUES (?, ?, ?, ?, ?, 1)").bind(p.title || "", p.body || "", p.image_url || "", p.link_type || "none", p.link_value || "").run();
        }
        await env.DB.prepare("UPDATE scheduled_posts SET is_done = 1 WHERE id = ?").bind(p.id).run();
      } catch {}
    }
  } catch {}
}

// ========== WEBSOCKET (Watch Party + Reactions + Presence) ==========
// wsClients: id -> { sock, rooms:Set, name }
// roomStates: room -> trang thai sync moi nhat cua host (kenh dang xem, play/pause...)
const wsClients = new Map();
const roomStates = new Map();

function wsBroadcastRoom(room, msg, exceptId = null) {
  const data = JSON.stringify(msg);
  for (const [id, c] of wsClients.entries()) {
    if (id === exceptId) continue;
    if (c.rooms && c.rooms.has(room)) {
      try { c.sock.send(data); } catch (e) { console.error("[ws] send error:", e?.message || e); }
    }
  }
}

function wsBroadcastPresence(room) {
  const members = [];
  for (const c of wsClients.values()) {
    if (c.rooms && c.rooms.has(room)) members.push({ name: c.name || "Khach" });
  }
  wsBroadcastRoom(room, { type: "presence", room, members, count: members.length });
}

function handleWebSocket(request, env, ctx) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  server.accept();
  const id = crypto.randomUUID();
  wsClients.set(id, { sock: server, rooms: new Set(), name: "Khach" });

  server.send(JSON.stringify({ type: "welcome", message: "CHRTV Connected", id }));

  // Broadcast pending notifications
  env.DB?.prepare("SELECT * FROM notifications WHERE target = 'all' AND created_at > datetime('now', '-1 hour') ORDER BY created_at DESC LIMIT 5").all()
    .then(({ results }) => { if (results.length) server.send(JSON.stringify({ type: "notifications", data: results })); })
    .catch(() => {});

  server.addEventListener("message", (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    const me = wsClients.get(id);
    if (!me) return;

    switch (msg.type) {
      case "ping":
        server.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        break;

      case "subscribe":
        server.send(JSON.stringify({ type: "subscribed", channel: msg.channel }));
        break;

      // Vao phong watch party (room vd: "party:abc123" hoac "ch:VTV3.vn" cho reaction nhanh)
      case "join": {
        const room = String(msg.room || "").slice(0, 64);
        if (!room) return;
        if (me.room) { me.rooms.delete(me.room); wsBroadcastPresence(me.room); }
        me.room = room;
        me.rooms.add(room);
        me.name = String(msg.name || "Khach").slice(0, 24);
        server.send(JSON.stringify({ type: "joined", room, name: me.name, state: roomStates.get(room) || null }));
        wsBroadcastRoom(room, { type: "chat", room, from: "He thong", text: `${me.name} da vao phong`, sys: true }, id);
        wsBroadcastPresence(room);
        break;
      }

      // Host dong bo trang thai phat (kenh, play/pause, vi tri catchup)
      case "state": {
        if (!me.room) return;
        const st = { ...msg.state, ts: Date.now() };
        roomStates.set(me.room, st);
        if (roomStates.size > 50) { const first = roomStates.keys().next().value; roomStates.delete(first); }
        wsBroadcastRoom(me.room, { type: "state", room: me.room, from: me.name, state: st }, id);
        break;
      }

      // Chat trong phong
      case "chat": {
        if (!me.room) return;
        const text = String(msg.text || "").slice(0, 300);
        if (!text.trim()) return;
        wsBroadcastRoom(me.room, { type: "chat", room: me.room, from: me.name, text }, id);
        break;
      }

      // Reaction bay tren man hinh ca phong
      case "reaction": {
        if (!me.room) return;
        const emoji = String(msg.emoji || "\u2764\uFE0F").slice(0, 8);
        wsBroadcastRoom(me.room, { type: "reaction", room: me.room, emoji, from: me.name });
        break;
      }

      case "leave": {
        if (me.room) {
          const r = me.room;
          me.rooms.delete(r);
          me.room = null;
          wsBroadcastRoom(r, { type: "chat", room: r, from: "He thong", text: `${me.name} da roi phong`, sys: true });
          wsBroadcastPresence(r);
        }
        break;
      }
    }
  });

  server.addEventListener("close", () => {
    const me = wsClients.get(id);
    if (me?.room) {
      const r = me.room;
      wsBroadcastRoom(r, { type: "chat", room: r, from: "He thong", text: `${me.name} da roi phong`, sys: true });
      setTimeout(() => wsBroadcastPresence(r), 100);
    }
    wsClients.delete(id);
  });

  return new Response(null, { status: 101, webSocket: client });
}

// ============================================================================
// ĐỢT 48 TÍNH NĂNG MỚI — handlers dùng chung (thêm cuối file, function hoisted)
// ============================================================================
const P48_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // bỏ 0/O,1/I/L
function genP48Code(len = 6) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  let s = "";
  for (let i = 0; i < len; i++) s += P48_ALPHABET[b[i] % P48_ALPHABET.length];
  return s;
}
function genP48Num(len = 6) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  let s = "";
  for (let i = 0; i < len; i++) s += String(b[i] % 10);
  return s;
}
function xpAdd(env, userId, xp) {
  if (!userId) return;
  try {
    return env.DB.prepare("INSERT INTO user_xp (user_id, xp, watch_sec, updated_at) VALUES (?, ?, 0, ?) ON CONFLICT(user_id) DO UPDATE SET xp = xp + ?")
      .bind(userId, xp, Math.floor(Date.now() / 1000), xp).run();
  } catch (e) { return null; }
}
function xpGet(env, userId) {
  try { return env.DB.prepare("SELECT xp FROM user_xp WHERE user_id = ?").bind(userId).first(); } catch { return null; }
}
async function p48UserName(env, userId) {
  try {
    const r = await env.DB.prepare("SELECT COALESCE(display_name, username, '') AS n FROM users WHERE id = ?").bind(userId).all();
    return (r.results && r.results[0] && r.results[0].n) || "";
  } catch { return ""; }
}
// Người xem đang ở vùng nào (B)
function regionCountryOf(request) {
  return viewerCountry(request);
}
function p48StoreCode(env, { kind = "movie", media_type = "movie", tmdb_id = 0, season = 0, episode = 0, payload = "", userId = 0, name = "", ttlMin = 10, code = null }) {
  const c = code || genP48Code();
  const exp = Math.floor(Date.now() / 1000) + Math.max(1, parseInt(ttlMin, 10) || 10) * 60;
  return env.DB.prepare("INSERT OR REPLACE INTO movie_share_codes (code, kind, media_type, tmdb_id, season, episode, payload, created_by, created_by_name, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(c, String(kind).slice(0, 16), media_type === "tv" ? "tv" : "movie", parseInt(tmdb_id) || 0, parseInt(season) || 0, parseInt(episode) || 0, String(payload).slice(0, 2000), userId, String(name || "").slice(0, 40), exp).run()
    .then(() => c);
}
function p48ReadCode(env, code) {
  const c = String(code || "").trim().toUpperCase().slice(0, 32);
  if (!c) return Promise.resolve(null);
  return env.DB.prepare("SELECT * FROM movie_share_codes WHERE code = ?").bind(c).first().then((row) => row || null).catch(() => null);
}

// ---------- /api/movie/share (A) + mã tổng quát (#2) + mời bạn (#10) + kèo (#35) + playlist (#11) ----------
async function handleShareCodesApi(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  const method = request.method;

  // --- Tạo mã (movie) — login + 20/h ---
  if (path === "/api/movie/share" && method === "POST") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED", message: "Đăng nhập để tạo mã chia sẻ." }, 401, request, env);
    try {
      const rl = await rateLimitCheck(env, "mvshare:u:" + auth.user.id, 20, 3600);
      if (!rl.allowed) return json({ error: "Bạn tạo mã hơi nhanh — thử lại sau.", code: "RATE_LIMITED" }, 429, request, env);
    } catch {}
    const b = await request.json().catch(() => ({}));
    const media_type = b.media_type === "tv" ? "tv" : "movie";
    const tmdb_id = parseInt(b.tmdb_id, 10) || 0;
    if (!tmdb_id) return json({ error: "Thiếu tmdb_id" }, 400, request, env);
    const code = await p48StoreCode(env, { kind: "movie", media_type, tmdb_id, season: parseInt(b.season) || 0, episode: parseInt(b.episode) || 0, userId: auth.user.id, name: auth.user.display_name || auth.user.username, ttlMin: 10 });
    return json({ success: true, code, kind: "movie", media_type, tmdb_id, ttl_sec: 600, unlimited: true }, 200, request, env);
  }

  // --- Nhập mã (movie) — public + rate-limit IP ---
  if (path === "/api/movie/share" && method === "GET") {
    const code = String(q.get("code") || "").trim().toUpperCase().slice(0, 32);
    if (!code) return json({ error: "Thiếu code" }, 400, request, env);
    try {
      const rl = await rateLimitCheck(env, "mvin:ip:" + (request.headers.get("CF-Connecting-IP") || "local"), 60, 60);
      if (!rl.allowed) return json({ error: "Thử lại sau ít phút.", code: "RATE_LIMITED" }, 429, request, env);
    } catch {}
    const row = await p48ReadCode(env, code);
    if (!row) return json({ error: "Mã không tồn tại hoặc đã hết hạn", code: "NOT_FOUND" }, 404, request, env);
    if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
      try { await env.DB.prepare("DELETE FROM movie_share_codes WHERE code = ?").bind(row.code).run(); } catch {}
      return json({ error: "Mã đã hết hạn (10 phút) — xin mã mới nhé.", code: "EXPIRED" }, 410, request, env);
    }
    return json({ success: true, code: row.code, kind: row.kind, media_type: row.media_type, tmdb_id: row.tmdb_id, season: row.season, episode: row.episode, payload: safeJsonParseP48(row.payload, {}), created_by_name: row.created_by_name }, 200, request, env);
  }

  // --- Tạo mã tổng quát theo kind (#2/#10/#35/#11) ---
  if (path === "/api/codes" && method === "POST") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const b = await request.json().catch(() => ({}));
    const kind = String(b.kind || "movie").slice(0, 16);
    const allowedKinds = ["movie", "channel", "event", "party", "invite", "challenge", "playlist", "resume", "short", "creator"];
    if (!allowedKinds.includes(kind)) return json({ error: "kind không hợp lệ" }, 400, request, env);
    try {
      const rl = await rateLimitCheck(env, "p48code:u:" + auth.user.id, 30, 3600);
      if (!rl.allowed) return json({ error: "Tạo mã hơi nhanh — thử lại sau.", code: "RATE_LIMITED" }, 429, request, env);
    } catch {}
    const name = auth.user.display_name || auth.user.username || "";
    if (kind === "invite") {
      // mỗi user 1 mã mời dài hạn (lấy lại nếu còn)
      const existing = await env.DB.prepare("SELECT code, expires_at FROM movie_share_codes WHERE kind = 'invite' AND created_by = ?").bind(auth.user.id).first().catch(() => null);
      if (existing) return json({ success: true, code: existing.code, kind: "invite", reused: true }, 200, request, env);
      const code = await p48StoreCode(env, { kind: "invite", userId: auth.user.id, name, ttlMin: 60 * 24 * 365, payload: JSON.stringify({ type: "invite" }) });
      return json({ success: true, code, kind: "invite", reused: false }, 200, request, env);
    }
    const code = await p48StoreCode(env, { kind, media_type: b.media_type || "movie", tmdb_id: b.tmdb_id, season: b.season, episode: b.episode, payload: typeof b.payload === "string" ? b.payload : JSON.stringify(b.payload || {}), userId: auth.user.id, name, ttlMin: parseInt(b.ttl_min, 10) > 0 ? Math.min(parseInt(b.ttl_min, 10), 60 * 24) : 10 });
    return json({ success: true, code, kind, ttl_sec: 600 }, 200, request, env);
  }

  // --- Mã của tôi ---
  if (path === "/api/codes/my" && method === "GET") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const r = await env.DB.prepare("SELECT code, kind, media_type, tmdb_id, season, episode, payload, created_at, expires_at FROM movie_share_codes WHERE created_by = ? AND (expires_at = 0 OR expires_at > ?) ORDER BY created_at DESC, code DESC LIMIT 30").bind(auth.user.id, Math.floor(Date.now() / 1000)).all().catch(() => ({ results: [] }));
    return json({ success: true, codes: (r.results || []).map((x) => ({ ...x, payload: safeJsonParseP48(x.payload, {}) })) }, 200, request, env);
  }

  // --- Nhập mã tổng quát (#1 party / #11 playlist / #35 kèo) ---
  if (path === "/api/codes" && method === "GET") {
    const code = String(q.get("code") || "").trim().toUpperCase().slice(0, 32);
    if (!code) return json({ error: "Thiếu code" }, 400, request, env);
    try {
      const rl = await rateLimitCheck(env, "p48in:ip:" + (request.headers.get("CF-Connecting-IP") || "local"), 60, 60);
      if (!rl.allowed) return json({ error: "Thử lại sau ít phút.", code: "RATE_LIMITED" }, 429, request, env);
    } catch {}
    const row = await p48ReadCode(env, code);
    if (!row) return json({ error: "Mã không tồn tại hoặc đã hết hạn", code: "NOT_FOUND" }, 404, request, env);
    if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
      try { await env.DB.prepare("DELETE FROM movie_share_codes WHERE code = ?").bind(row.code).run(); } catch {}
      return json({ error: "Mã đã hết hạn", code: "EXPIRED" }, 410, request, env);
    }
    if (row.kind === "invite") {
      // xem thử thông tin (không tặng quà khi chỉ GET) — claim ở POST /api/codes/claim
      return json({ success: true, code: row.code, kind: "invite", created_by_name: row.created_by_name }, 200, request, env);
    }
    const payload = safeJsonParseP48(row.payload, {});
    const out = { success: true, code: row.code, kind: row.kind, media_type: row.media_type, tmdb_id: row.tmdb_id, season: row.season, episode: row.episode, payload, created_by_name: row.created_by_name };
    if (row.kind === "movie") { out.media_type = row.media_type; out.tmdb_id = row.tmdb_id; out.season = row.season; out.episode = row.episode; }
    return json(out, 200, request, env);
  }

  // --- Nhận quà mã mời (#10): cả 2 bên +XP + ngày gói ---
  if (path === "/api/codes/claim" && method === "POST") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const b = await request.json().catch(() => ({}));
    const code = String(b.code || "").trim().toUpperCase().slice(0, 32);
    if (!code) return json({ error: "Thiếu code" }, 400, request, env);
    const row = await p48ReadCode(env, code);
    if (!row || row.kind !== "invite") return json({ error: "Mã mời không hợp lệ", code: "NOT_FOUND" }, 404, request, env);
    if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) return json({ error: "Mã mời đã hết hạn", code: "EXPIRED" }, 410, request, env);
    if (row.created_by === auth.user.id) return json({ error: "Không dùng mã của chính mình được nha", code: "SELF" }, 409, request, env);
    // 1 mã mời dùng được nhiều lần nhưng mỗi người chỉ 1 lần
    const usedBy = safeJsonParseP48(row.payload, {});
    const usedUsers = (Array.isArray(usedBy.users) ? usedBy.users : []).map(Number);
    if (usedUsers.includes(Number(auth.user.id))) return json({ error: "Bạn đã nhận thưởng từ mã này rồi", code: "USED" }, 409, request, env);
    // thưởng: người nhận +200XP & +3 ngày gói; người mời +200XP & +3 ngày
    const nowS = Math.floor(Date.now() / 1000);
    await xpAdd(env, auth.user.id, 200);
    await xpAdd(env, row.created_by, 200);
    try { await activatePlan(env, auth.user.id, "signature", 3); } catch {}
    try { if (row.created_by) await activatePlan(env, row.created_by, "signature", 3); } catch {}
    try {
      const cur = safeJsonParseP48(row.payload, {});
      cur.users = cur.users || [];
      if (!cur.users.includes(auth.user.id)) cur.users.push(auth.user.id);
      await env.DB.prepare("UPDATE movie_share_codes SET payload = ?, used = used + 1, expires_at = ? WHERE code = ?").bind(JSON.stringify(cur).slice(0, 2000), nowS + 365 * 86400, code).run();
    } catch {}
    try { await logAudit(env, auth.user.id, "invite.claim", { code, from: row.created_by }); } catch {}
    return json({ success: true, xp: 200, plan_days: 3, message: "Cả 2 đều nhận +200 XP và +3 ngày gói Signature! 🎉" }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

function safeJsonParseP48(s, fb) {
  try { return JSON.parse(String(s || "")) || fb; } catch { return fb; }
}

// ---------- (#7) Resume đa thiết bị: progress server + mã 6 số phone→TV ----------
async function handleMovieProgressApi(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  const method = request.method;

  if (path === "/api/movie/progress" && method === "GET") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const limit = Math.min(50, parseInt(q.get("limit") || "20", 10));
    const r = await env.DB.prepare("SELECT media_type, tmdb_id, season, episode, position_sec, duration_sec, percent, title, poster_path, updated_at FROM movie_progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?").bind(auth.user.id, limit).all().catch(() => ({ results: [] }));
    return json({ success: true, items: (r.results || []).map((x) => ({ ...x, percent: Number(x.percent || 0) })) }, 200, request, env);
  }

  if (path === "/api/movie/progress" && method === "PUT" || (path === "/api/movie/progress" && method === "POST")) {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const b = await request.json().catch(() => ({}));
    const media_type = b.media_type === "tv" ? "tv" : "movie";
    const tmdb_id = parseInt(b.tmdb_id, 10) || 0;
    if (!tmdb_id) return json({ error: "Thiếu tmdb_id" }, 400, request, env);
    const season = parseInt(b.season, 10) || 0;
    const episode = parseInt(b.episode, 10) || 0;
    const pos = Math.max(0, parseFloat(b.position_sec) || 0);
    const dur = Math.max(0, parseFloat(b.duration_sec) || 0);
    const pct = Math.max(0, Math.min(100, parseFloat(b.percent) || (dur > 0 ? (pos / dur) * 100 : 0)));
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare("INSERT INTO movie_progress (user_id, media_type, tmdb_id, season, episode, position_sec, duration_sec, percent, title, poster_path, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, media_type, tmdb_id, season, episode) DO UPDATE SET position_sec = excluded.position_sec, duration_sec = excluded.duration_sec, percent = excluded.percent, title = COALESCE(NULLIF(excluded.title, ''), title), poster_path = COALESCE(NULLIF(excluded.poster_path, ''), poster_path), updated_at = excluded.updated_at")
        .bind(auth.user.id, media_type, tmdb_id, season, episode, pos, dur, pct, String(b.title || "").slice(0, 160), String(b.poster_path || "").slice(0, 300), now).run();
    } catch {}
    return json({ success: true }, 200, request, env);
  }

  // Tạo mã đồng bộ phone→TV (login)
  if (path === "/api/movie/progress/code" && method === "POST") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    try {
      const rl = await rateLimitCheck(env, "resumecode:u:" + auth.user.id, 10, 300);
      if (!rl.allowed) return json({ error: "Tạo mã hơi nhanh — thử lại sau.", code: "RATE_LIMITED" }, 429, request, env);
    } catch {}
    const code = genP48Num(6);
    const exp = Math.floor(Date.now() / 1000) + 120; // 2 phút để TV nhập
    try {
      await env.DB.prepare("DELETE FROM resume_codes WHERE user_id = ? OR expires_at < ?").bind(auth.user.id, Math.floor(Date.now() / 1000)).run();
      await env.DB.prepare("INSERT INTO resume_codes (code, user_id, expires_at, used) VALUES (?, ?, ?, 0)").bind(code, auth.user.id, exp).run();
    } catch { return json({ error: "Lỗi tạo mã" }, 500, request, env); }
    return json({ success: true, code, ttl_sec: 120 }, 200, request, env);
  }

  // TV nhập mã (không cần đăng nhập — mã ngắn hạn) → trả progress đang xem dở
  if (path === "/api/movie/progress/code" && method === "GET" || path === "/api/resume" && method === "GET") {
    const code = String(q.get("code") || "").trim().slice(0, 6);
    if (!/^\d{6}$/.test(code)) return json({ error: "Mã gồm 6 chữ số" }, 400, request, env);
    try {
      const rl = await rateLimitCheck(env, "resumein:ip:" + (request.headers.get("CF-Connecting-IP") || "local"), 30, 60);
      if (!rl.allowed) return json({ error: "Thử lại sau ít phút.", code: "RATE_LIMITED" }, 429, request, env);
    } catch {}
    const row = await env.DB.prepare("SELECT * FROM resume_codes WHERE code = ?").bind(code).first().catch(() => null);
    if (!row) return json({ error: "Mã không đúng", code: "NOT_FOUND" }, 404, request, env);
    if (row.expires_at < Math.floor(Date.now() / 1000)) return json({ error: "Mã đã hết hạn — tạo mã mới trên điện thoại", code: "EXPIRED" }, 410, request, env);
    const prog = await env.DB.prepare("SELECT media_type, tmdb_id, season, episode, position_sec, duration_sec, percent, title, poster_path, updated_at FROM movie_progress WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(row.user_id).first().catch(() => null);
    try {
      await env.DB.prepare("DELETE FROM resume_codes WHERE code = ?").bind(code).run();
    } catch {}
    if (!prog) return json({ success: true, empty: true }, 200, request, env);
    return json({ success: true, item: { ...prog, percent: Number(prog.percent || 0) } }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ---------- (#8) Follow series — nhận "TẬP MỚI" khi có tập mới ----------
async function handleSeriesFollowApi(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const method = request.method;
  const q = new URL(request.url).searchParams;

  if (path === "/api/movie/series-follow" && method === "GET") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const r = await env.DB.prepare("SELECT tmdb_id, season, episode, updated_at FROM series_follows WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100").bind(auth.user.id).all().catch(() => ({ results: [] }));
    return json({ success: true, follows: (r.results || []).map((x) => ({ tmdb_id: x.tmdb_id, season: x.season, episode: x.episode })) }, 200, request, env);
  }
  if (path === "/api/movie/series-follow" && method === "POST") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
    const b = await request.json().catch(() => ({}));
    const tmdb_id = parseInt(b.tmdb_id, 10) || 0;
    if (!tmdb_id) return json({ error: "Thiếu tmdb_id" }, 400, request, env);
    const follow = b.follow === false;
    const season = parseInt(b.season, 10) || 0;
    const episode = parseInt(b.episode, 10) || 0;
    if (follow) await env.DB.prepare("DELETE FROM series_follows WHERE user_id = ? AND tmdb_id = ?").bind(auth.user.id, tmdb_id).run();
    else await env.DB.prepare("INSERT INTO series_follows (user_id, tmdb_id, season, episode, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, tmdb_id) DO UPDATE SET season = excluded.season, episode = excluded.episode, updated_at = excluded.updated_at")
      .bind(auth.user.id, tmdb_id, season, episode, Math.floor(Date.now() / 1000)).run();
    return json({ success: true, following: !follow }, 200, request, env);
  }
  if (path === "/api/movie/series-follow/latest" && method === "GET") {
    const tmdb_id = parseInt(q.get("tmdb_id"), 10) || 0;
    if (!tmdb_id) return json({ error: "Thiếu tmdb_id" }, 400, request, env);
    const r = await env.DB.prepare("SELECT COUNT(*) AS c FROM series_follows WHERE tmdb_id = ?").bind(tmdb_id).first().catch(() => ({ c: 0 }));
    return json({ success: true, followers: (r && r.c) || 0 }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ---------- (#37) Tặng sao creator bằng XP + (#38) BXH creator tuần ----------
async function handleShortStar(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  if (request.method !== "POST") return json({ error: "Not found" }, 404, request, env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  const b = await request.json().catch(() => ({}));
  const short_id = parseInt(b.short_id, 10) || 0;
  const stars = Math.max(1, Math.min(10, parseInt(b.stars, 10) || 1));
  if (!short_id) return json({ error: "Thiếu short_id" }, 400, request, env);
  const short = await env.DB.prepare("SELECT creator_id FROM shorts WHERE id = ? AND status = 'live'").bind(short_id).first().catch(() => null);
  if (!short || !short.creator_id) return json({ error: "Shorts không có creator" }, 404, request, env);
  const cost = stars * 50; // 1 sao = 50 XP
  const me = await xpGet(env, auth.user.id);
  const have = (me && me.xp) || 0;
  if (have < cost) return json({ error: `Cần ${cost} XP để tặng ${stars} sao (bạn có ${have} XP) — xem phim để kiếm XP nhé!`, code: "LOW_XP", have, need: cost }, 402, request, env);
  const now = Math.floor(Date.now() / 1000);
  try {
    // giới hạn 10 sao/giờ/người cho 1 creator (chống spam)
    const rl = await rateLimitCheck(env, "star:u:" + auth.user.id + ":c:" + short.creator_id, 10, 3600);
    if (!rl.allowed) return json({ error: "Tặng hơi nhiều rồi — thử lại sau 1 giờ.", code: "RATE_LIMITED" }, 429, request, env);
  } catch {}
  await env.DB.prepare("UPDATE user_xp SET xp = xp - ? WHERE user_id = ? AND xp >= ?").bind(cost, auth.user.id, cost).run();
  const rr = await env.DB.prepare("INSERT INTO creator_stars (creator_id, user_id, stars, created_at) VALUES (?, ?, ?, ?)").bind(short.creator_id, auth.user.id, stars, now).run();
  try { await logAudit(env, auth.user.id, "creator.star", { short_id, creator_id: short.creator_id, stars }); } catch {}
  return json({ success: true, stars, spent_xp: cost, id: rr.meta && rr.meta.last_row_id }, 200, request, env);
}

// BXH sao tuần (thứ Hai tuần này → giờ) — #38
async function handleCreatorWeekly(request, env) {
  if (!hasDB(env)) return json({ success: true, board: [] }, 200, request, env);
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  const tzOffset = parseInt(q.get("tz") || "0", 10); // phút lệch client
  const d = new Date(Date.now() + (tzOffset || 0) * 60000);
  const day = (d.getUTCDay() + 6) % 7; // Thứ 2 = 0
  const weekStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day, 0, 0, 0) - (tzOffset || 0) * 60000;
  try {
    const r = await env.DB.prepare(
      `SELECT p.id AS creator_id, p.handle, p.display_name, p.avatar_url, COALESCE(SUM(s.stars), 0) AS stars, COUNT(DISTINCT s.user_id) AS fans
       FROM creator_stars s JOIN short_creator_profiles p ON p.id = s.creator_id
       WHERE s.created_at >= ? GROUP BY p.id ORDER BY stars DESC, fans DESC LIMIT 20`
    ).bind(Math.floor(weekStart / 1000)).all();
    const mine = await env.DB.prepare("SELECT user_id FROM short_creator_profiles WHERE user_id = ?").bind(0).first().catch(() => null);
    return json({ success: true, week_start: Math.floor(weekStart / 1000), board: (r.results || []).map((x) => ({ creator_id: x.creator_id, handle: x.handle, display_name: x.display_name || x.handle, avatar_url: x.avatar_url || "", stars: Number(x.stars) || 0, fans: Number(x.fans) || 0 })) }, 200, request, env);
  } catch (e) { return json({ success: true, board: [] }, 200, request, env); }
}

// ---------- (#40) Challenge hashtag tuần ----------
async function handleChallengesPublic(request, env) {
  if (!hasDB(env)) return json({ success: true, challenges: [] }, 200, request, env);
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  if (request.method !== "GET") return json({ error: "Not found" }, 404, request, env);
  const hashtag = String(q.get("hashtag") || "").slice(0, 40);
  try {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    let rows = [];
    if (hashtag) {
      const r = await env.DB.prepare("SELECT * FROM challenges WHERE is_active = 1 AND LOWER(hashtag) = LOWER(?) AND (ends_at = '' OR ends_at IS NULL OR ends_at >= ?) LIMIT 1").bind(hashtag, now).all();
      rows = r.results || [];
    } else {
      const r = await env.DB.prepare("SELECT * FROM challenges WHERE is_active = 1 AND (ends_at = '' OR ends_at IS NULL OR ends_at >= ?) AND (starts_at = '' OR starts_at IS NULL OR starts_at <= ?) ORDER BY id DESC LIMIT 10").bind(now, now).all();
      rows = r.results || [];
    }
    // gom shorts theo hashtag
    const out = [];
    for (const c of rows) {
      const shortsR = await env.DB.prepare("SELECT s.id, s.title, s.caption, s.video_url, s.thumb_url, s.duration, s.views, s.likes, s.created_at, p.handle AS creator_handle, p.avatar_url AS creator_avatar FROM shorts s LEFT JOIN short_creator_profiles p ON p.id = s.creator_id WHERE s.status = 'live' AND s.hashtags LIKE ? ORDER BY s.created_at DESC LIMIT 60").bind("%" + c.hashtag + "%").all().catch(() => ({ results: [] }));
      out.push({ ...c, hashtag: c.hashtag || "", shorts: (shortsR.results || []).map((x) => ({ ...x, creator: { handle: x.creator_handle, avatar_url: x.creator_avatar } })) });
    }
    return json({ success: true, challenges: out }, 200, request, env);
  } catch (e) { return json({ success: true, challenges: [] }, 200, request, env); }
}

// ---------- (#85) Link affiliate (vé rạp / sách) ----------
async function handleAffiliatesPublic(request, env) {
  if (!hasDB(env)) return json({ success: true, affiliates: [] }, 200, request, env);
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  const kind = String(q.get("kind") || "").slice(0, 20);
  try {
    let rows;
    if (kind) {
      const r = await env.DB.prepare("SELECT id, name, kind, url_template, label FROM affiliates WHERE enabled = 1 AND kind = ? ORDER BY sort_order ASC, id ASC LIMIT 20").bind(kind).all();
      rows = r.results || [];
    } else {
      const r = await env.DB.prepare("SELECT id, name, kind, url_template, label FROM affiliates WHERE enabled = 1 ORDER BY sort_order ASC, id ASC LIMIT 50").all();
      rows = r.results || [];
    }
    return json({ success: true, affiliates: rows || [] }, 200, request, env);
  } catch { return json({ success: true, affiliates: [] }, 200, request, env); }
}

// ---------- (#84) Wrapped cuối năm (từ dữ liệu người dùng) ----------
async function handleWrapped(request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  const uid = auth.user.id;
  try {
    const xr = await env.DB.prepare("SELECT xp, watch_sec FROM user_xp WHERE user_id = ?").bind(uid).first().catch(() => null);
    const wt = await env.DB.prepare("SELECT kind, ref_id, ref_name, sec FROM user_watch WHERE user_id = ? ORDER BY sec DESC LIMIT 40").bind(uid).all().catch(() => ({ results: [] }));
    const mp = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN percent >= 90 THEN 1 ELSE 0 END), 0) AS done FROM movie_progress WHERE user_id = ?").bind(uid).first().catch(() => null);
    const lr = await env.DB.prepare("SELECT COUNT(*) AS n FROM analytics WHERE user_id = ? AND event = 'login'").bind(uid).first().catch(() => null);
    const tops = {};
    const byKind = {};
    let moviesWatch = 0, shortsWatch = 0;
    for (const row of (wt.results || [])) {
      const k = row.kind || "other";
      byKind[k] = (byKind[k] || 0) + (row.sec || 0);
      if ((k === "channel" || k === "movie" || k === "short") && !tops[k]) tops[k] = { name: row.ref_name || row.ref_id, sec: row.sec || 0 };
      if (k === "movie") moviesWatch += row.sec || 0;
      if (k === "short") shortsWatch += row.sec || 0;
    }
    const totalSec = (xr && xr.watch_sec) || (byKind.channel || 0) + moviesWatch + shortsWatch;
    return json({
      success: true,
      wrapped: {
        year: new Date().getFullYear(),
        total_sec: totalSec || 0,
        minutes: { channel: Math.round(((byKind.channel || 0)) / 60), movie: Math.round(moviesWatch / 60), short: Math.round(shortsWatch / 60) },
        top_channel: tops.channel || null,
        top_movie: tops.movie || null,
        top_short: tops.short || null,
        xp: (xr && xr.xp) || 0,
        movies_started: (mp && mp.n) || 0,
        movies_finished: (mp && mp.done) || 0,
        logins: (lr && lr.n) || 0,
        badges: serverBadges((xr && xr.xp) || 0, (xr && xr.watch_sec) || 0, 0),
      },
    }, 200, request, env);
  } catch (e) { return json({ error: "Chưa đủ dữ liệu để wrap — xem thêm vài phim nhé!" }, 200, request, env); }
}

// ---------- (#5) Đang hot theo quốc gia ----------
async function handleCountryTop(request, env) {
  if (!hasDB(env)) return json({ success: true, top: [] }, 200, request, env);
  await ensureSchema(env);
  const q = new URL(request.url).searchParams;
  const cc = String(q.get("cc") || viewerCountry(request) || "").toUpperCase().slice(0, 2);
  if (!cc) return json({ success: true, top: [], cc }, 200, request, env);
  const nowS = Math.floor(Date.now() / 1000);
  const hours = Math.max(1, Math.min(72, parseInt(q.get("hours") || "24", 10)));
  const fromBucket = Math.floor((nowS - hours * 3600) / 300);
  try {
    const r = await env.DB.prepare(
      `SELECT w.channel_id, SUM(w.seconds) AS seconds, SUM(w.views) AS views, c.name, c.logo, c.group_title
       FROM watch_cc w LEFT JOIN channels c ON c.channel_id = w.channel_id
       WHERE w.country = ? AND w.bucket >= ? GROUP BY w.channel_id ORDER BY seconds DESC, views DESC LIMIT 10`
    ).bind(cc, fromBucket).all();
    return json({ success: true, cc, hours, top: (r.results || []).map((x) => ({ ...x, seconds: Number(x.seconds || 0), views: Number(x.views || 0) })) }, 200, request, env);
  } catch { return json({ success: true, cc, top: [] }, 200, request, env); }
}

// ---------- (#32) Follow đội bóng ----------
async function handleTeamFollowApi(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const method = request.method;
  if (method === "GET") {
    const auth = await getAuth(request, env);
    if (!auth || !auth.user) return json({ success: true, teams: [] }, 200, request, env);
    const r = await env.DB.prepare("SELECT team_name FROM team_follows WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100").bind(auth.user.id).all().catch(() => ({ results: [] }));
    return json({ success: true, teams: (r.results || []).map((x) => x.team_name) }, 200, request, env);
  }
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  const b = await request.json().catch(() => ({}));
  const team = String(b.team || "").trim().slice(0, 60);
  if (!team) return json({ error: "Thiếu team" }, 400, request, env);
  const now = Math.floor(Date.now() / 1000);
  if (b.follow === false) await env.DB.prepare("DELETE FROM team_follows WHERE user_id = ? AND team_name = ?").bind(auth.user.id, team).run();
  else await env.DB.prepare("INSERT OR IGNORE INTO team_follows (user_id, team_name, updated_at) VALUES (?, ?, ?)").bind(auth.user.id, team, now).run();
  return json({ success: true }, 200, request, env);
}

// ---------- (#57) Cảnh báo in-dash: đánh giá rule ----------
async function evalAlertRules(env) {
  if (!hasDB(env)) return;
  try {
    await ensureSchema(env);
    const r = await env.DB.prepare("SELECT * FROM admin_alert_rules WHERE enabled = 1").all().catch(() => ({ results: [] }));
    const now = Math.floor(Date.now() / 1000);
    const metricVal = {};
    for (const rule of (r.results || [])) {
      const m = rule.metric || "";
      if (metricVal[m] === undefined) {
        if (m === "channels_down") {
          const x = await env.DB.prepare("SELECT COUNT(*) AS c FROM channel_health WHERE status = 'down'").first().catch(() => null);
          metricVal[m] = (x && x.c) || 0;
        } else if (m === "player_errors_1h") {
          const x = await env.DB.prepare("SELECT COUNT(*) AS c FROM player_errors WHERE created_at > datetime('now', '-1 hour')").first().catch(() => null);
          metricVal[m] = (x && x.c) || 0;
        } else if (m === "viewers_online") {
          const x = await env.DB.prepare("SELECT COUNT(*) AS c FROM presence WHERE updated_at > ?").bind(now - 180).first().catch(() => null);
          metricVal[m] = (x && x.c) || 0;
        } else if (m === "open_reports") {
          const x = await env.DB.prepare("SELECT COUNT(*) AS c FROM channel_reports WHERE status = 'open'").first().catch(() => null);
          metricVal[m] = (x && x.c) || 0;
        } else {
          metricVal[m] = 0;
        }
      }
      const val = metricVal[m] || 0;
      const threshold = parseFloat(rule.threshold) || 0;
      const fired = rule.op === "lt" ? val < threshold : val > threshold;
      if (fired && now - (rule.last_fired_at || 0) >= (rule.cooldown_s || 3600)) {
        await env.DB.prepare("INSERT INTO admin_alert_feed (rule_id, level, message, data) VALUES (?, 'warn', ?, ?)")
          .bind(rule.id, `${rule.name}: hiện tại = ${val} (ngưỡng ${rule.op === "lt" ? "<" : ">"} ${threshold})`, JSON.stringify({ metric: m, value: val, threshold })).run();
        await env.DB.prepare("UPDATE admin_alert_rules SET last_fired_at = ? WHERE id = ?").bind(now, rule.id).run();
      }
    }
  } catch {}
}

// ---------- (#48) Báo đăng nhập lạ qua email ----------
async function maybeNewDeviceAlert(env, userId, request) {
  try {
    if (!hasDB(env)) return;
    const ip = request.headers.get("CF-Connecting-IP") || "IP lạ";
    const ua = String(request.headers.get("User-Agent") || "").slice(0, 120);
    const usr = await env.DB.prepare("SELECT email, COALESCE(display_name, username, '') AS name FROM users WHERE id = ?").bind(userId).first().catch(() => null);
    if (!usr) return;
    const st = await env.DB.prepare("SELECT settings_json FROM user_settings WHERE user_id = ?").bind(userId).first().catch(() => null);
    let flag = false;
    try { flag = !!JSON.parse((st && st.settings_json) || "{}").notifyNewLogin; } catch {}
    if (!flag) return;
    // thiết bị đã biết = các phiên 30 ngày gần nhất cùng UA (và ip nếu có)
    const known = await env.DB.prepare("SELECT user_agent, ip FROM sessions WHERE user_id = ? AND created_at > datetime('now', '-30 days') ORDER BY id DESC LIMIT 10").bind(userId).all().catch(() => ({ results: [] }));
    const uaKey = ua.replace(/[\d.]+/g, "#");
    const seenUA = (known.results || []).some((s) => String(s.user_agent || "").replace(/[\d.]+/g, "#") === uaKey);
    const seenIP = (known.results || []).some((s) => String(s.ip || "") === ip);
    if (seenUA && seenIP) return;
    const tmpl = {
      subject: "🔐 CHRTV — Đăng nhập từ thiết bị lạ",
      html: `<div style="font-family:system-ui;background:#0b0c10;padding:24px;color:#e7e5e4"><div style="max-width:520px;margin:auto;background:#17181d;border-radius:16px;padding:24px;border:1px solid #26272e"><h2 style="margin:0 0 8px">Đăng nhập từ thiết bị lạ</h2><p style="color:#a8a29e;font-size:14px">Tài khoản <b>${escHtmlP48(usr.name || usr.email)}</b> vừa đăng nhập CHRTV trên một thiết bị bạn chưa từng dùng:</p><div style="background:#0f1014;border-radius:10px;padding:14px;margin:14px 0;font-size:13px"><div>🌐 IP: ${escHtmlP48(ip)}</div><div>📱 Trình duyệt: ${escHtmlP48(ua)}</div></div><p style="font-size:13px;color:#a8a29e">Không phải bạn? Vào <b>Cài đặt → Thiết bị của bạn</b> để đá thiết bị lạ ngay, và đổi mật khẩu.</p></div></div>`,
    };
    const sender = { name: env.BREVO_SENDER_NAME || "NO REPLY - CHRTV PL▷Y", email: env.BREVO_SENDER_EMAIL || "noreply@chrtv.app" };
    const apiKey = env.BREVO_API_KEY;
    if (!apiKey) return;
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ sender, to: [{ email: usr.email }], subject: tmpl.subject, htmlContent: tmpl.html }),
    }).catch(() => {});
  } catch {}
}
function escHtmlP48(s) {
  return String(s || "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

// ============================================================================
// ADMIN PACK 48 (đã qua xác thực admin ở handleAdmin)
// ============================================================================
async function handleAdminPack48(path, request, env, adminCtx) {
  const body = await request.json().catch(() => ({}));
  const method = request.method;
  const adminUser = adminCtx && adminCtx.adminUser;
  const aid = (adminUser && adminUser.id) || 0;

  // ---------- (#57) CẢNH BÁO IN-DASH ----------
  if (path === "/admin/alerts/rules" && method === "GET") {
    const r = await env.DB.prepare("SELECT * FROM admin_alert_rules ORDER BY id ASC").all().catch(() => ({ results: [] }));
    return json({ success: true, rules: r.results || [] }, 200, request, env);
  }
  if (path === "/admin/alerts/rules" && method === "POST") {
    const name = String(body.name || "").slice(0, 80);
    const metric = String(body.metric || "").slice(0, 30);
    if (!name || !["channels_down", "player_errors_1h", "viewers_online", "open_reports"].includes(metric)) return json({ error: "Thiếu name/metric hợp lệ" }, 400, request, env);
    const r = await env.DB.prepare("INSERT INTO admin_alert_rules (name, metric, op, threshold, enabled, cooldown_s) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(name, metric, body.op === "lt" ? "lt" : "gt", parseFloat(body.threshold) || 0, body.enabled === 0 ? 0 : 1, Math.max(60, parseInt(body.cooldown_s, 10) || 3600)).run();
    try { await logAudit(env, aid, "alert.rule.add", { name, metric }); } catch {}
    return json({ success: true, id: r.meta && r.meta.last_row_id }, 200, request, env);
  }
  if (path === "/admin/alerts/rules" && method === "PUT") {
    if (!body.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("UPDATE admin_alert_rules SET name = COALESCE(?, name), metric = COALESCE(?, metric), op = COALESCE(?, op), threshold = COALESCE(?, threshold), enabled = COALESCE(?, enabled), cooldown_s = COALESCE(?, cooldown_s) WHERE id = ?")
      .bind(body.name ?? null, body.metric ?? null, body.op ?? null, body.threshold ?? null, body.enabled ?? null, body.cooldown_s ?? null, body.id).run();
    try { await logAudit(env, aid, "alert.rule.update", { id: body.id }); } catch {}
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/alerts/rules" && method === "DELETE") {
    if (!body.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM admin_alert_rules WHERE id = ?").bind(body.id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/alerts/feed" && method === "GET") {
    const q = new URL(request.url).searchParams;
    const limit = Math.min(100, parseInt(q.get("limit") || "50", 10));
    const onlyPending = q.get("pending") === "1";
    const sql = onlyPending
      ? "SELECT f.*, r.name AS rule_name FROM admin_alert_feed f LEFT JOIN admin_alert_rules r ON r.id = f.rule_id WHERE f.ack = 0 ORDER BY f.id DESC LIMIT ?"
      : "SELECT f.*, r.name AS rule_name FROM admin_alert_feed f LEFT JOIN admin_alert_rules r ON r.id = f.rule_id ORDER BY f.id DESC LIMIT ?";
    const rr = await env.DB.prepare(sql).bind(limit).all().catch(() => ({ results: [] }));
    return json({ success: true, feed: rr.results || [] }, 200, request, env);
  }
  if (path === "/admin/alerts/ack" && method === "POST") {
    const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map((x) => parseInt(x) || 0).filter(Boolean).slice(0, 100);
    if (!ids.length) return json({ error: "Thiếu id" }, 400, request, env);
    for (const id of ids) await env.DB.prepare("UPDATE admin_alert_feed SET ack = 1 WHERE id = ?").bind(id).run();
    try { await logAudit(env, aid, "alert.ack", { count: ids.length }); } catch {}
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/alerts/test" && method === "POST") {
    await evalAlertRules(env);
    const rr = await env.DB.prepare("SELECT COUNT(*) AS c FROM admin_alert_feed WHERE created_at > datetime('now', '-1 minute')").first().catch(() => ({ c: 0 }));
    return json({ success: true, fired: (rr && rr.c) || 0, message: "Đã chạy đánh giá rule — xem feed bên dưới." }, 200, request, env);
  }
  if (path === "/admin/alerts/push" && method === "POST") {
    // thêm cảnh báo tay (vd: "kênh X đang lỗi theo báo cáo")
    const message = String(body.message || "").slice(0, 300);
    if (!message) return json({ error: "Thiếu message" }, 400, request, env);
    await env.DB.prepare("INSERT INTO admin_alert_feed (rule_id, level, message, data) VALUES (0, ?, ?, ?)").bind(body.level === "critical" ? "critical" : "warn", message, JSON.stringify({ manual: true, by: (adminUser && adminUser.username) || "admin" })).run();
    return json({ success: true }, 200, request, env);
  }

  // ---------- (B) VÙNG QUỐC GIA BLOCKLIST ----------
  if (path === "/admin/regions" && method === "GET") {
    const qq = new URL(request.url).searchParams;
    const type = String(qq.get("type") || "channel");
    const table = type === "event" ? "events" : type === "ad" ? "ads" : type === "movie_source" ? "movie_sources" : "channels";
    let sql, r;
    if (type === "channel") {
      sql = `SELECT channel_id, name, is_sponsored, blocked_regions FROM ${table} WHERE is_active = 1 ORDER BY id ASC LIMIT 300`;
      r = await env.DB.prepare(sql).all().catch(() => ({ results: [] }));
    } else if (type === "movie_source") {
      sql = `SELECT id, name AS title, blocked_regions FROM ${table} ORDER BY id DESC LIMIT 300`;
      r = await env.DB.prepare(sql).all().catch(() => ({ results: [] }));
    } else {
      sql = `SELECT id, title, subtitle, blocked_regions FROM ${table} ORDER BY id DESC LIMIT 300`;
      r = await env.DB.prepare(sql).all().catch(() => ({ results: [] }));
    }
    return json({ success: true, type, items: r.results || [] }, 200, request, env);
  }
  if (path === "/admin/regions" && method === "PUT") {
    const type = String(body.type || "channel");
    const table = type === "event" ? "events" : type === "ad" ? "ads" : type === "movie_source" ? "movie_sources" : "channels";
    const regions = cleanRegionList(body.regions).join(",");
    const id = body.id !== undefined ? parseInt(body.id, 10) || 0 : 0;
    const channelId = String(body.channel_id || "");
    try {
      if (table === "channels" && channelId) await env.DB.prepare("UPDATE channels SET blocked_regions = ? WHERE channel_id = ?").bind(regions, channelId).run();
      else if (id) await env.DB.prepare(`UPDATE ${table} SET blocked_regions = ? WHERE id = ?`).bind(regions, id).run();
      else return json({ error: "Thiếu id/channel_id" }, 400, request, env);
    } catch (e) { return json({ error: String(e.message || e) }, 500, request, env); }
    try { _chanCache = null; } catch {}
    try { await logAudit(env, aid, "region.update", { type, channel_id: channelId || undefined, id: id || undefined, regions }); } catch {}
    return json({ success: true }, 200, request, env);
  }
  // (#54) BẢO TRÌ KÊNH
  if (path === "/admin/maintenance" && method === "GET") {
    const now = Math.floor(Date.now() / 1000);
    const r = await env.DB.prepare("SELECT h.channel_id, c.name, c.group_title, h.maintenance_until, h.note FROM channel_health h LEFT JOIN channels c ON c.channel_id = h.channel_id WHERE h.maintenance_until > ? ORDER BY h.maintenance_until ASC").bind(now).all().catch(() => ({ results: [] }));
    return json({ success: true, items: (r.results || []).map((x) => ({ ...x, maintenance_until: Number(x.maintenance_until || 0) })) }, 200, request, env);
  }
  if (path === "/admin/maintenance" && method === "POST") {
    const channelId = String(body.channel_id || "");
    const minutes = Math.max(1, Math.min(10080, parseInt(body.minutes, 10) || 30));
    const note = String(body.note || "").slice(0, 200);
    if (!channelId) return json({ error: "Thiếu channel_id" }, 400, request, env);
    const until = Math.floor(Date.now() / 1000) + minutes * 60;
    const status = body.status === "up" ? "up" : body.status === "down" ? "down" : "maintenance";
    await env.DB.prepare("INSERT INTO channel_health (channel_id, status, maintenance_until, checked_at, note) VALUES (?, ?, ?, ?, ?) ON CONFLICT(channel_id) DO UPDATE SET status = excluded.status, maintenance_until = excluded.maintenance_until, checked_at = excluded.checked_at, note = excluded.note")
      .bind(channelId, status, until, Math.floor(Date.now() / 1000), note).run();
    try { await logAudit(env, aid, "channel.maintenance", { channel_id: channelId, minutes, note }); } catch {}
    try { _chanCache = null; } catch {}
    return json({ success: true, maintenance_until: until }, 200, request, env);
  }
  if (path === "/admin/maintenance" && method === "DELETE") {
    const channelId = String(body.channel_id || "");
    if (!channelId) return json({ error: "Thiếu channel_id" }, 400, request, env);
    await env.DB.prepare("UPDATE channel_health SET maintenance_until = 0, status = 'unknown' WHERE channel_id = ?").bind(channelId).run();
    return json({ success: true }, 200, request, env);
  }
  // (#40) CHALLENGE HASHTAG
  if (path === "/admin/challenges" && method === "GET") {
    const r = await env.DB.prepare("SELECT * FROM challenges ORDER BY id DESC LIMIT 100").all().catch(() => ({ results: [] }));
    return json({ success: true, challenges: r.results || [] }, 200, request, env);
  }
  if (path === "/admin/challenges" && method === "POST") {
    const title = String(body.title || "").slice(0, 120);
    const hashtag = String(body.hashtag || "").trim().replace(/^#/, "").replace(/\s+/g, "").slice(0, 40);
    if (!title || !hashtag) return json({ error: "Thiếu title/hashtag" }, 400, request, env);
    const r = await env.DB.prepare("INSERT INTO challenges (title, hashtag, description, starts_at, ends_at, is_active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(title, hashtag, String(body.description || "").slice(0, 500), String(body.starts_at || "").slice(0, 19), String(body.ends_at || "").slice(0, 19), body.is_active === 0 ? 0 : 1, aid).run();
    return json({ success: true, id: r.meta && r.meta.last_row_id }, 200, request, env);
  }
  if (path === "/admin/challenges" && method === "PUT") {
    if (!body.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("UPDATE challenges SET title = COALESCE(?, title), hashtag = COALESCE(?, hashtag), description = COALESCE(?, description), starts_at = COALESCE(?, starts_at), ends_at = COALESCE(?, ends_at), is_active = COALESCE(?, is_active) WHERE id = ?")
      .bind(body.title ?? null, body.hashtag ?? null, body.description ?? null, body.starts_at ?? null, body.ends_at ?? null, body.is_active ?? null, body.id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/challenges" && method === "DELETE") {
    if (!body.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM challenges WHERE id = ?").bind(body.id).run();
    return json({ success: true }, 200, request, env);
  }
  // (#85) AFFILIATE LINKS
  if (path === "/admin/affiliates" && method === "GET") {
    const r = await env.DB.prepare("SELECT * FROM affiliates ORDER BY sort_order ASC, id ASC").all().catch(() => ({ results: [] }));
    return json({ success: true, affiliates: r.results || [] }, 200, request, env);
  }
  if (path === "/admin/affiliates" && method === "POST") {
    const name = String(body.name || "").slice(0, 80);
    const tpl = String(body.url_template || "").slice(0, 500);
    if (!name || !tpl) return json({ error: "Thiếu name/url_template" }, 400, request, env);
    const r = await env.DB.prepare("INSERT INTO affiliates (name, kind, url_template, label, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(name, body.kind === "book" ? "book" : "cinema", tpl, String(body.label || "").slice(0, 60), body.enabled === 0 ? 0 : 1, parseInt(body.sort_order, 10) || 0).run();
    return json({ success: true, id: r.meta && r.meta.last_row_id }, 200, request, env);
  }
  if (path === "/admin/affiliates" && method === "PUT") {
    if (!body.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("UPDATE affiliates SET name = COALESCE(?, name), kind = COALESCE(?, kind), url_template = COALESCE(?, url_template), label = COALESCE(?, label), enabled = COALESCE(?, enabled), sort_order = COALESCE(?, sort_order) WHERE id = ?")
      .bind(body.name ?? null, body.kind ?? null, body.url_template ?? null, body.label ?? null, body.enabled ?? null, body.sort_order ?? null, body.id).run();
    return json({ success: true }, 200, request, env);
  }
  if (path === "/admin/affiliates" && method === "DELETE") {
    if (!body.id) return json({ error: "Thiếu id" }, 400, request, env);
    await env.DB.prepare("DELETE FROM affiliates WHERE id = ?").bind(body.id).run();
    return json({ success: true }, 200, request, env);
  }
  // (#53) DASHBOARD REALTIME
  if (path === "/admin/realtime" && method === "GET") {
    const now = Math.floor(Date.now() / 1000);
    try {
      const [pres, hot, errs, reports, down] = await Promise.all([
        env.DB.prepare("SELECT name, kind, ref_name, updated_at FROM presence WHERE updated_at > ? ORDER BY updated_at DESC LIMIT 60").bind(now - 300).all(),
        env.DB.prepare("SELECT p.channel_id, SUM(p.seconds) AS seconds, SUM(p.views) AS views, c.name, c.logo FROM watch_pulse p LEFT JOIN channels c ON c.channel_id = p.channel_id WHERE p.bucket >= ? GROUP BY p.channel_id ORDER BY seconds DESC LIMIT 10").bind(Math.floor(now / 300) - 2).all(),
        env.DB.prepare("SELECT channel_name, code, detail, platform, created_at FROM player_errors WHERE created_at > datetime('now', '-2 hours') ORDER BY id DESC LIMIT 30").all(),
        env.DB.prepare("SELECT COUNT(*) AS c FROM channel_reports WHERE status = 'open'").first(),
        env.DB.prepare("SELECT c.name FROM channels c JOIN channel_health h ON h.channel_id = c.channel_id WHERE h.status = 'down' AND c.is_active = 1 LIMIT 15").all(),
      ]);
      const online = pres.results ? pres.results.length : 0;
      return json({
        success: true,
        now,
        online,
        by_kind: (pres.results || []).reduce((a, x) => { a[x.kind || "other"] = (a[x.kind || "other"] || 0) + 1; return a; }, {}),
        presence: pres.results || [],
        hot: hot.results || [],
        errors: errs.results || [],
        open_reports: (reports && reports.c) || 0,
        down_list: (down.results || []).map((x) => x.name),
      }, 200, request, env);
    } catch (e) { return json({ success: true, error: String(e.message || e) }, 200, request, env); }
  }
  // (#56) XEM TRƯỚC lịch đăng
  if (path === "/admin/scheduled/preview" && method === "POST") {
    const id = parseInt(body.id, 10) || 0;
    if (!id) return json({ error: "Thiếu id" }, 400, request, env);
    const r = await env.DB.prepare("SELECT * FROM scheduled_posts WHERE id = ?").bind(id).first().catch(() => null);
    if (!r) return json({ error: "Không tìm thấy" }, 404, request, env);
    let preview = null;
    if (r.kind === "broadcast") preview = { type: "broadcast", title: r.title, message: String(r.title ? r.title + " — " : "") + String(r.body || ""), expires_at: r.end_at ? Math.floor(new Date(String(r.end_at).replace(" ", "T")).getTime() / 1000) : 0 };
    else if (r.kind === "notify") preview = { type: "notify", title: r.title || "Thông báo", body: r.body || "", url: r.link_value || "", target: "all", expires_at: r.end_at ? Math.floor(new Date(String(r.end_at).replace(" ", "T")).getTime() / 1000) : 0 };
    else if (r.kind === "event") preview = { type: "event", title: r.title || "", subtitle: r.body || "", image_url: r.image_url || "", link_type: r.link_type || "none", link_value: r.link_value || "" };
    return json({ success: true, post: r, preview }, 200, request, env);
  }
  // (#84) Wrapped xem nhanh cho admin (toàn hệ thống)
  if (path === "/admin/wrapped" && method === "GET") {
    try {
      const [totals, users, movies] = await Promise.all([
        env.DB.prepare("SELECT kind, SUM(sec) AS sec FROM user_watch GROUP BY kind").all(),
        env.DB.prepare("SELECT COUNT(*) AS c FROM users").first(),
        env.DB.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(percent) / 100.0, 0) AS hrs FROM movie_progress WHERE duration_sec > 0").first(),
      ]);
      const byKind = {};
      for (const t of (totals.results || [])) byKind[t.kind] = Number(t.sec || 0);
      const topCh = await env.DB.prepare("SELECT ref_name, SUM(sec) AS sec FROM user_watch WHERE kind = 'channel' GROUP BY ref_id ORDER BY sec DESC LIMIT 10").all().catch(() => ({ results: [] }));
      return json({ success: true, by_kind: byKind, total_sec: Object.values(byKind).reduce((a, b) => a + b, 0), users: (users && users.c) || 0, movie_hours: Math.round(((movies && movies.hrs) || 0) / 3600), top_channels: topCh.results || [] }, 200, request, env);
    } catch (e) { return json({ success: true, error: String(e.message || e) }, 200, request, env); }
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ============================================================================
// Job nền: dọn mã share hết hạn + đánh giá cảnh báo + lịch đăng (chạy trong runDueJobs)
// ============================================================================
// ============================================================================
// PACK48B — trending search (#64), wishlist nguồn tốt hơn (#29), actor follow
//           (#65), poll phòng xem chung (#33), team notify vi/en (#32)
// ============================================================================

// ---------- (#64) Trending searches ----------
async function handleSearchTrending(path, request, env) {
  if (!hasDB(env)) return path === "/api/stats/trending-search"
    ? json({ success: true, trending: [] }, 200, request, env)
    : json({ success: true }, 200, request, env);
  await ensureSchema(env);
  if (path === "/api/stats/search" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const q = String(b.q || "").trim().slice(0, 60);
    if (q.length >= 2) {
      try {
        const r = await env.DB.prepare("UPDATE trending_searches SET cnt = cnt + 1, last_at = CURRENT_TIMESTAMP WHERE query = ?").bind(q).run();
        if (!(r.meta && (r.meta.changes || 0))) {
          await env.DB.prepare("INSERT OR IGNORE INTO trending_searches (query, cnt) VALUES (?, 1)").bind(q).run();
        }
      } catch {}
    }
    return json({ success: true }, 200, request, env);
  }
  if (path === "/api/stats/trending-search" && request.method === "GET") {
    const limit = Math.min(20, parseInt(new URL(request.url).searchParams.get("limit") || "10", 10) || 10);
    try {
      const r = await env.DB.prepare(
        "SELECT query, cnt FROM trending_searches WHERE last_at >= datetime('now', '-21 days') ORDER BY cnt DESC, last_at DESC LIMIT ?"
      ).bind(limit).all();
      return json({ success: true, trending: r.results || [] }, 200, request, env);
    } catch { return json({ success: true, trending: [] }, 200, request, env); }
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ---------- (#27/#29) Wishlist phim server + báo khi có nguồn tốt hơn ----------
async function handleMovieWishlistApi(request, env) {
  if (!hasDB(env)) return json({ success: true, items: [] }, 200, request, env);
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  if (request.method === "GET") {
    const r = await env.DB.prepare("SELECT tmdb_id, media_type FROM movie_wishlists WHERE user_id = ? ORDER BY created_at DESC LIMIT 200").bind(auth.user.id).all().catch(() => ({ results: [] }));
    return json({ success: true, items: r.results || [] }, 200, request, env);
  }
  if (request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const tmdb_id = parseInt(b.tmdb_id, 10) || 0;
    if (!tmdb_id) return json({ error: "Thiếu tmdb_id" }, 400, request, env);
    const media_type = b.media_type === "tv" ? "tv" : "movie";
    if (b.want === false) await env.DB.prepare("DELETE FROM movie_wishlists WHERE user_id = ? AND tmdb_id = ?").bind(auth.user.id, tmdb_id).run();
    else await env.DB.prepare("INSERT OR IGNORE INTO movie_wishlists (user_id, tmdb_id, media_type) VALUES (?, ?, ?)").bind(auth.user.id, tmdb_id, media_type).run();
    return json({ success: true, wishing: b.want !== false }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// Gọi ở cuối GET /api/movie/sources: nếu user đang "muốn xem" phim này và giờ có
// nguồn chất lượng (HD/1080/4K) → 1 thông báo trong app + 1 web push (1 lần/3 ngày).
const QUALITY_RE = /4k|2160|fhd|1080|full\s?hd|\bhd\b|blu-?ray/i;
async function maybeWishlistQualityNotify(env, userId, tmdbId, rows) {
  if (!userId || !tmdbId || !rows || !rows.length) return;
  try {
    const good = rows.some((r) => QUALITY_RE.test(String(r.label || "") + " " + String(r.name || "")));
    if (!good) return;
    const wl = await env.DB.prepare("SELECT notified_at FROM movie_wishlists WHERE user_id = ? AND tmdb_id = ?").bind(userId, tmdbId).first().catch(() => null);
    if (!wl) return;
    const now = Math.floor(Date.now() / 1000);
    if (wl.notified_at && now - wl.notified_at < 3 * 86400) return;
    const label = (rows.find((r) => QUALITY_RE.test(String(r.label || "") + " " + String(r.name || ""))) || rows[0] || {}).label || "HD";
    await env.DB.prepare("INSERT INTO notifications (title, body, type, url, target, created_by) VALUES (?, ?, 'quality', ?, ?, 0)")
      .bind("🍿 Phim bạn quan tâm đã có bản ngon hơn", `Nguồn ${label} hiện phát được — bấm để xem ngay nhé!`, `/movies?tmdb=${tmdbId}`, String(userId)).run();
    await env.DB.prepare("UPDATE movie_wishlists SET notified_at = ? WHERE user_id = ? AND tmdb_id = ?").bind(now, userId, tmdbId).run();
    // web push riêng cho user này (không payload — SW tự lấy nội dung mới)
    try {
      const keys = await getVapidKeys(env);
      if (keys) {
        const subs = await env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE user_id = ?").bind(userId).all().catch(() => ({ results: [] }));
        await Promise.allSettled((subs.results || []).map(async (s) => {
          const st = await sendWebPush({ endpoint: s.endpoint, _vapidPublic: keys.publicB64url }, keys.privateJwk);
          if (st === 404 || st === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(s.endpoint).run();
        }));
      }
    } catch {}
  } catch {}
}

// ---------- (#65) Follow diễn viên ----------
async function handleActorFollowApi(request, env) {
  if (!hasDB(env)) return json({ success: true, follows: [] }, 200, request, env);
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  if (request.method === "GET") {
    const r = await env.DB.prepare("SELECT person_id, name FROM actor_follows WHERE user_id = ? ORDER BY created_at DESC LIMIT 200").bind(auth.user.id).all().catch(() => ({ results: [] }));
    return json({ success: true, follows: r.results || [] }, 200, request, env);
  }
  if (request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const person_id = parseInt(b.person_id, 10) || 0;
    if (!person_id) return json({ error: "Thiếu person_id" }, 400, request, env);
    const name = String(b.name || "").slice(0, 120);
    if (b.follow === false) await env.DB.prepare("DELETE FROM actor_follows WHERE user_id = ? AND person_id = ?").bind(auth.user.id, person_id).run();
    else await env.DB.prepare("INSERT OR IGNORE INTO actor_follows (user_id, person_id, name) VALUES (?, ?, ?)").bind(auth.user.id, person_id, name).run();
    return json({ success: true, following: b.follow !== false }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ---------- (#33) Poll phòng xem chung (realtime, cùng hạ tầng party) ----------
async function handlePartyPollExtra(path, request, env) {
  if (!hasDB(env)) return json({ success: true, polls: [] }, 200, request, env);
  await ensureSchema(env);
  const auth = await getAuth(request, env);
  const room = String(new URL(request.url).searchParams.get("room") || "").trim().slice(0, 40);
  const now = Math.floor(Date.now() / 1000);

  if (path === "/api/party/polls" && request.method === "GET") {
    if (!room) return json({ success: true, polls: [] }, 200, request, env);
    const r = await env.DB.prepare("SELECT * FROM party_polls WHERE room = ? AND (ends_at = 0 OR ends_at > ?) ORDER BY id DESC LIMIT 10").bind(room, now - 6 * 3600).all().catch(() => ({ results: [] }));
    const uid = auth && auth.user ? auth.user.id : 0;
    const out = (r.results || []).map((p) => {
      let options = [], votes = [], voters = [];
      try { options = JSON.parse(p.options || "[]"); votes = JSON.parse(p.votes || "[]"); voters = JSON.parse(p.voters || "[]"); } catch {}
      const total = votes.reduce((a, b) => a + (Number(b) || 0), 0);
      return {
        id: p.id, room: p.room, question: p.question, options,
        votes: votes.map((v, i) => ({ option: options[i] || `#${i + 1}`, count: Number(v) || 0, pct: total ? Math.round(((Number(v) || 0) / total) * 100) : 0 })),
        total, mine: voters.includes(String(uid)) ? -1 : -1, ended: !!p.ends_at && p.ends_at <= now, ends_at: p.ends_at,
      };
    });
    return json({ success: true, polls: out }, 200, request, env);
  }
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  const body = await request.json().catch(() => ({}));
  if (path === "/api/party/poll" && request.method === "POST") {
    const q = String(body.question || "").trim().slice(0, 140);
    const opts = (Array.isArray(body.options) ? body.options : []).map((o) => String(o).trim().slice(0, 60)).filter(Boolean).slice(0, 6);
    const roomB = String(body.room || "").trim().slice(0, 40);
    if (!q || opts.length < 2 || !roomB) return json({ error: "Thiếu câu hỏi/≥2 lựa chọn/phòng" }, 400, request, env);
    const ttl = Math.max(60, Math.min(86400, parseInt(body.ttl_sec, 10) || 3600));
    const r = await env.DB.prepare("INSERT INTO party_polls (room, question, options, votes, voters, created_by, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(roomB, q, JSON.stringify(opts), JSON.stringify(opts.map(() => 0)), JSON.stringify([]), auth.user.id, now + ttl).run();
    try { await env.DB.prepare("INSERT INTO party_messages (room, kind, from_name, text) VALUES (?, 'poll', ?, ?)").bind(roomB, String(auth.user.display_name || auth.user.username || "Bạn"), "📊 " + q).run(); } catch {}
    return json({ success: true, id: r.meta && r.meta.last_row_id }, 200, request, env);
  }
  if (path === "/api/party/vote" && request.method === "POST") {
    const poll_id = parseInt(body.poll_id, 10) || 0;
    const roomB = String(body.room || "").trim().slice(0, 40);
    const option = parseInt(body.option, 10);
    if (!poll_id || !roomB || !Number.isInteger(option)) return json({ error: "Thiếu poll/room/option" }, 400, request, env);
    const p = await env.DB.prepare("SELECT * FROM party_polls WHERE id = ? AND room = ?").bind(poll_id, roomB).first().catch(() => null);
    if (!p) return json({ error: "Poll không tồn tại trong phòng này", code: "NOT_FOUND" }, 404, request, env);
    if (p.ends_at && p.ends_at <= now) return json({ error: "Poll đã đóng", code: "EXPIRED" }, 410, request, env);
    let options = [], votes = [], voters = [];
    try { options = JSON.parse(p.options || "[]"); votes = JSON.parse(p.votes || "[]"); voters = JSON.parse(p.voters || "[]"); } catch {}
    if (option < 0 || option >= options.length) return json({ error: "Lựa chọn không hợp lệ" }, 400, request, env);
    if (voters.includes(String(auth.user.id))) return json({ error: "Bạn đã bình chọn rồi", code: "ALREADY" }, 409, request, env);
    votes[option] = (Number(votes[option]) || 0) + 1;
    voters.push(String(auth.user.id));
    await env.DB.prepare("UPDATE party_polls SET votes = ?, voters = ? WHERE id = ?").bind(JSON.stringify(votes), JSON.stringify(voters), poll_id).run();
    return json({ success: true, option }, 200, request, env);
  }
  return json({ error: "Not found" }, 404, request, env);
}

// ---------- (#32) Fan-out thông báo đội: vi/en theo user_settings.language ----------
async function handleTeamNotify(request, env) {
  if (!hasDB(env)) return json({ success: true }, 200, request, env);
  await ensureSchema(env);
  if (request.method !== "POST") return json({ error: "Not found" }, 404, request, env);
  const auth = await getAuth(request, env);
  if (!auth || !auth.user) return json({ error: "LOGIN_REQUIRED" }, 401, request, env);
  const b = await request.json().catch(() => ({}));
  const team = String(b.team || "").trim().slice(0, 60);
  const kind = ["kickoff", "live", "goal"].includes(b.kind) ? b.kind : "live";
  const score = String(b.score || "").slice(0, 20);
  if (!team) return json({ error: "Thiếu team" }, 400, request, env);
  try {
    const rl = await rateLimitCheck(env, "teamnotify:" + team.toLowerCase() + ":" + kind, 4, 300);
    if (!rl.allowed) return json({ success: true, limited: true }, 200, request, env);
  } catch {}
  const rows = await env.DB.prepare("SELECT user_id FROM team_follows WHERE team_name = ? COLLATE NOCASE").bind(team).all().catch(() => ({ results: [] }));
  if (!rows || !rows.results.length) return json({ success: true, fans: 0 }, 200, request, env);
  const fans = (rows.results || []).map((x) => Number(x.user_id)).filter((id) => id !== Number(auth.user.id));
  if (!fans.length) return json({ success: true, fans: 0 }, 200, request, env);
  const now = Math.floor(Date.now() / 1000);
  for (const uid of fans.slice(0, 200)) {
    try {
      const st = await env.DB.prepare("SELECT language FROM user_settings WHERE user_id = ?").bind(uid).first().catch(() => null);
      const vi = (st && st.language) !== "en";
      let title = "", body = "";
      if (kind === "kickoff") { title = vi ? `⚽ ${team} sắp đá` : `⚽ ${team} kick-off soon`; body = vi ? "Bấm xem trực tiếp để không bỏ lỡ nhé!" : "Tap watch live so you don't miss it!"; }
      else if (kind === "goal") { title = vi ? `⚽ GOAL — ${team}!` : `⚽ GOAL — ${team}!`; body = score ? (vi ? `Tỉ số hiện tại: ${score}` : `Current score: ${score}`) : (vi ? "Vào xem ngay nào!" : "Tune in now!"); }
      else { title = vi ? `🔴 ${team} đang thi đấu` : `🔴 ${team} is LIVE`; body = vi ? "Trận đang diễn ra — bấm để xem trực tiếp." : "Match is live now — tap to watch."; }
      await env.DB.prepare("INSERT INTO notifications (title, body, type, url, target, created_by) VALUES (?, ?, 'team', ?, ?, 0)").bind(title, body, `/live?team=${encodeURIComponent(team)}`, String(uid)).run();
      try {
        const keys = await getVapidKeys(env);
        if (keys) {
          const subs = await env.DB.prepare("SELECT endpoint FROM push_subscriptions WHERE user_id = ?").bind(uid).all().catch(() => ({ results: [] }));
          await Promise.allSettled((subs.results || []).map(async (s) => {
            const st2 = await sendWebPush({ endpoint: s.endpoint, _vapidPublic: keys.publicB64url }, keys.privateJwk);
            if (st2 === 404 || st2 === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(s.endpoint).run();
          }));
        }
      } catch {}
    } catch {}
  }
  return json({ success: true, fans: fans.length }, 200, request, env);
}

async function p48RunDueJobs(env) {
  if (!hasDB(env)) return;
  try {
    await ensureSchema(env);
    if (await claimJob(env, "p48_alerts")) {
      let msg = "ok";
      try { await evalAlertRules(env); } catch (e) { msg = "error: " + (e?.message || e); }
      await finishJob(env, "p48_alerts", msg);
    }
    if (await claimJob(env, "p48_scheduled")) {
      let msg = "ok";
      try { await evalScheduled(env); } catch (e) { msg = "error: " + (e?.message || e); }
      await finishJob(env, "p48_scheduled", msg);
    }
  } catch {}
}
