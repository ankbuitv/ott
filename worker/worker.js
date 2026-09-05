/**
 * CHRTV OTT Backend - Cloudflare Workers
 * Auth, Admin, Analytics, Notifications, WebSocket
 */

const SOURCE_M3U_URL = "https://raw.githubusercontent.com/ankbuitv/ott/refs/heads/main/playlists/tv.m3u";
const SOURCE_EPG_URL = "https://epg.io.vn/epgc.xml";
const SOURCE_EPG_URL2 = "https://lichphatsong.io.vn/epgc.xml";
const SOURCE_EPG_URL3 = "https://epg.pm/vi/epgc.xml";
const FALLBACK_STREAM_URL = "http://bore.pub:30113/hls/index.m3u8";
const JWT_SECRET = "chrtv_ott_secret_2026";
// Khoá AES-128 cho token stream (rolling 10 phút). NOTE: hardcode tạm như JWT_SECRET — nên chuyển sang wrangler secret.
const STREAM_TOKEN_SECRET = "chrtv_stream_aes128_2026";
const CHRTV_CLIENT_UA = "CHRTV-OTT/0.0.1";
const SUPPORT_EMAIL = "support@ankb.qzz.io";
const STREAM_TOKEN_TTL = 600;
const STREAM_TOKEN_ROTATE = 540;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  // Cron: tự động refresh danh sách kênh (playlists/tv.m3u) + EPG cache + dọn rác DB
  async scheduled(event, env, ctx) {
    console.error("[cron] refreshing channels + epg cache");
    ctx.waitUntil((async () => {
      try {
        const fromSource = await loadChannelsFromSource();
        if (hasDB(env) && fromSource && fromSource.length > 0) {
          await writeChannels(env, fromSource);
        }
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
            env.DB.prepare("DELETE FROM analytics WHERE created_at < datetime('now', '-90 days')"),
            env.DB.prepare("DELETE FROM tmdb_cache WHERE expires_at < ?").bind(Math.floor(Date.now() / 1000)),
            env.DB.prepare("UPDATE users SET verify_code = '', reset_token = '' WHERE verify_expires < ? AND reset_expires < ? AND (verify_code != '' OR reset_token != '')").bind(Math.floor(Date.now() / 1000) - 86400, Math.floor(Date.now() / 1000) - 86400),
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
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    try {
      // API routes
      if (p.startsWith("/api/v1/") || p.startsWith("/api/")) {
        return await handleAPI(p.startsWith("/api/v1/") ? p.replace("/api/v1", "/api") : p, request, env, ctx);
      }
      // Auth API
      if (p.startsWith("/auth/")) return await handleAuth(p, request, env);
      // User API
      if (p.startsWith("/user/")) return await handleUser(p, request, env);
      // Admin API
      if (p.startsWith("/admin/")) return await handleAdmin(p, request, env, ctx);
      // WebSocket upgrade
      if (p === "/ws" && request.headers.get("Upgrade") === "websocket") {
        return handleWebSocket(request, env, ctx);
      }
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...CORS, "Content-Type": "application/json" } });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    }
  }
};

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

function hashPassword(password) {
  return sha256(password + JWT_SECRET);
}

function generateToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateJWT(userId) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({ userId, iat: Date.now(), exp: Date.now() + 30 * 24 * 3600 * 1000 }));
  const sig = hashPassword(header + "." + payload);
  return `${header}.${payload}.${sig}`;
}

function verifyJWT(token) {
  try {
    const [header, payload, sig] = token.split(".");
    const expected = hashPassword(header + "." + payload);
    if (sig !== expected) return null;
    const data = JSON.parse(atob(payload));
    if (data.exp < Date.now()) return null;
    return data.userId;
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
    return json({ error: "Invalid TMDB path" }, 400);
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
        return new Response(results[0].data, { headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "HIT" } });
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
    return new Response(text, { status: resp.status, headers: { ...CORS, "Content-Type": "application/json", "X-Cache": "MISS" } });
  } catch (e) {
    return json({ error: "TMDB fetch failed: " + (e?.message || e) }, 502);
  }
}

// ========== WEB PUSH API ==========
async function handlePush(path, request, env) {
  if (path === "/api/push/vapid-public" && request.method === "GET") {
    const keys = await getVapidKeys(env);
    if (!keys) return json({ error: "Push chưa khả dụng (cần D1)" }, 503);
    return json({ success: true, publicKey: keys.publicB64url });
  }
  await ensureSchema(env);
  const user = await getUser(request, env); // cho phép cả khách chưa đăng nhập (user_id = 0)

  if (path === "/api/push/subscribe" && request.method === "POST") {
    const { endpoint, keys } = await request.json().catch(() => ({}));
    if (!endpoint || !keys?.p256dh || !keys?.auth) return json({ error: "Thiếu subscription" }, 400);
    await env.DB.prepare("INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)")
      .bind(user?.id || 0, endpoint, keys.p256dh, keys.auth).run();
    return json({ success: true });
  }
  if (path === "/api/push/unsubscribe" && request.method === "POST") {
    const { endpoint } = await request.json().catch(() => ({}));
    if (!endpoint) return json({ error: "Thiếu endpoint" }, 400);
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(endpoint).run();
    return json({ success: true });
  }
  return json({ error: "Not found" }, 404);
}

// ========== EMAIL (Brevo / Sendinblue) ==========
// Gửi email qua Brevo API. Cấu hình biến môi trường:
//   BREVO_API_KEY       — API key lấy từ https://app.brevo.com/settings/keys/api
//   BREVO_SENDER_EMAIL  — email đã verify trong Brevo (vd: noreply@yourdomain.com)
//   BREVO_SENDER_NAME   — tên người gửi (mặc định "CHRTV")
async function sendBrevoEmail(env, { to, subject, html, text }) {
  const apiKey = env.BREVO_API_KEY;
  const senderEmail = env.BREVO_SENDER_EMAIL || "noreply@chrtv.app";
  const senderName = env.BREVO_SENDER_NAME || "CHRTV";
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
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#d6d3d1;">Cảm ơn bạn đã đăng ký CHRTV! Nhập mã 6 số dưới đây để kích hoạt tài khoản. Mã có hiệu lực trong <b>1 giờ</b>.</p>
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

async function getUser(request, env) {
  if (!hasDB(env)) return null;
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const userId = verifyJWT(auth.slice(7));
  if (!userId) return null;
  try {
    try {
      const { results } = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified, plan FROM users WHERE id = ?").bind(userId).all();
      return results[0] || null;
    } catch {
      const { results: r2 } = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified FROM users WHERE id = ?").bind(userId).all();
      return r2[0] || null;
    }
  } catch { return null; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ========== DATABASE BOOTSTRAP ==========
// Worker tự tạo bảng nếu D1 còn trống => chỉ cần bind D1 tên "DB" là chạy được,
// không bắt buộc phải chạy tay `wrangler d1 execute ... --file=./schema.sql`.
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, avatar_url TEXT DEFAULT '', display_name TEXT DEFAULT '', role TEXT DEFAULT 'user', email_verified INTEGER DEFAULT 0, verify_code TEXT DEFAULT '', verify_expires INTEGER DEFAULT 0, reset_token TEXT DEFAULT '', reset_expires INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, token TEXT UNIQUE NOT NULL, expires_at INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS user_settings (user_id INTEGER PRIMARY KEY, theme TEXT DEFAULT 'dark', default_quality TEXT DEFAULT 'auto', buffer_goal INTEGER DEFAULT 10, language TEXT DEFAULT 'vi', parental_pin TEXT DEFAULT '', parental_enabled INTEGER DEFAULT 0, settings_json TEXT DEFAULT '{}', updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS user_favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, channel_id TEXT NOT NULL, sort_order INTEGER DEFAULT 0, group_name TEXT DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, channel_id))`,
  `CREATE TABLE IF NOT EXISTS watch_history (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, channel_id TEXT NOT NULL, last_position INTEGER DEFAULT 0, watch_count INTEGER DEFAULT 1, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, channel_id))`,
  `CREATE TABLE IF NOT EXISTS channels (id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, logo TEXT DEFAULT '', group_title TEXT DEFAULT '', stream_url TEXT NOT NULL, catchup_type TEXT DEFAULT 'append', catchup_days INTEGER DEFAULT 7, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
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
];

let schemaReady = false;

function hasDB(env) {
  return !!(env && env.DB && typeof env.DB.prepare === "function");
}

async function ensureSchema(env) {
  if (!hasDB(env)) return false;
  if (schemaReady) return true;
  try {
    if (typeof env.DB.batch === "function") {
      await env.DB.batch(SCHEMA_STATEMENTS.map((sql) => env.DB.prepare(sql)));
    } else {
      for (const sql of SCHEMA_STATEMENTS) await env.DB.prepare(sql).run();
    }
    // MIGRATION: bảng channels cũ (tạo trước khi có cột is_active) → tự thêm cột.
    // Nếu cột đã tồn tại, lệnh này fail và bị bỏ qua — không sao.
    try {
      await env.DB.prepare("ALTER TABLE channels ADD COLUMN is_active INTEGER DEFAULT 1").run();
    } catch (e) {
      // cột đã tồn tại hoặc lỗi khác — bỏ qua
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
    schemaReady = true;
    return true;
  } catch (e) {
    console.error("ensureSchema error:", e?.message || e);
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
    });
  }
  if (path === "/api/playlist") return await handlePlaylist(env, request);
  if (path === "/api/epg") return await handleEPG(env, request);
  if (path === "/api/proxy") return await handleProxy(request, env);
  if (path === "/api/stream/token") return await handleStreamToken(request, env);
  if (path === "/api/stream/proxy") return await handleStreamProxy(request, env);
  if (path === "/api/favorites") return await handleFavorites(request, env);
  if (path === "/api/history") return await handleHistory(request, env);
  if (path === "/api/rating") return await handleRating(request, env);
  if (path === "/api/notifications") return await handleNotifications(request, env);
  if (path.startsWith("/api/push/")) return await handlePush(path, request, env);
  if (path.startsWith("/api/party/")) return await handleParty(path, request, env);
  if (path === "/api/tmdb") return await handleTMDBProxy(request, env);
  if (path === "/api/reminders") return await handleReminders(request, env);
  if (path === "/api/broadcasts") return await handleBroadcasts(env);
  if (path === "/api/channels") return await handleChannels(env);
  if (path === "/api/search") return await handleSearch(request, env);
  if (path === "/api/analytics") return await handleAnalytics(request, env);
  return json({ error: "Not found" }, 404);
}

// ========== PLAYLIST ==========
async function handlePlaylist(env, request) {
  const refresh = request && new URL(request.url).searchParams.get("refresh") === "1";
  let d1_count = 0;
  if (hasDB(env)) {
    await ensureSchema(env);
    if (!refresh) {
      try {
        const { results } = await env.DB.prepare("SELECT * FROM channels WHERE is_active = 1 ORDER BY id ASC").all();
        if (results && results.length > 0) return json({ success: true, source: "d1", data: results, d1_count: results.length });
      } catch (e) { console.error("handlePlaylist D1 error:", e?.message || e); }
    }
  }
  const fromSource = await loadChannelsFromSource();
  if (hasDB(env) && fromSource && fromSource.length > 0) {
    d1_count = await writeChannels(env, fromSource);
  }
  return json({ success: true, source: fromSource === DEFAULT_CHANNELS ? "default" : "m3u", data: fromSource, d1_count });
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/);
  const channels = []; let cur = null;
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
  { channel_id: "CHRTV_FALLBACK", name: "CHRTV Test Stream", logo: "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png", group_title: "Dự Phòng", stream_url: "http://bore.pub:30113/hls/index.m3u8", catchup_type: "default", catchup_days: 7 },
];

// ========== EPG ==========
async function handleEPG(env, request) {
  const rawOnly = request && new URL(request.url).searchParams.get("raw") === "1";
  if (env && env.DB) {
    try {
      const { results } = await env.DB.prepare("SELECT * FROM epg_cache WHERE key = 'epg_main' AND expires_at > ?").bind(Math.floor(Date.now() / 1000)).all();
      if (results.length > 0) {
        const cached = JSON.parse(results[0].data);
        if (rawOnly) return json({ success: true, source: "cache", data: cached });
        return json({ success: true, source: "cache", data: await mergeEPGOverrides(env, cached) });
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
          if (rawOnly) return json({ success: true, source: "xml", data });
          return json({ success: true, source: "xml", data: await mergeEPGOverrides(env, data) });
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
  if (rawOnly) return json({ success: true, source: "mock", data: mockData });
  return json({ success: true, source: "mock", data: await mergeEPGOverrides(env, mockData) });
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

// ========== PROXY ==========
async function handleProxy(request, env) {
  const reqUrl = new URL(request.url);
  const targetUrl = reqUrl.searchParams.get("url");
  if (!targetUrl) return new Response("Missing url", { status: 400, headers: CORS });
  // Không cho dùng proxy cũ để lách gói: target stream phải đúng nhóm kênh của plan
  const deny = await streamAccessDenied(request, env, targetUrl);
  if (deny) return new Response(JSON.stringify(deny), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
  // Target giống stream thì cũng phải là client CHRTV-OTT (chặn curl/ffplay qua cổng cũ)
  if (/\.(m3u8|ts|mpd)(\?|$)/i.test(targetUrl)) {
    const blocked = streamToolBlocked(request);
    if (blocked) return new Response(JSON.stringify({ error: "Client bị chặn", reason: blocked }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
    if (!streamIdentityOk(request)) return new Response(JSON.stringify({ error: "Chỉ chấp nhận client CHRTV-OTT/0.0.1" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const proxyBase = `${reqUrl.origin}${reqUrl.pathname}`;
  const fetchOpts = {
    headers: { "User-Agent": "VLC/3.0.21 LibVLC/3.0.21", "Accept": "*/*", "Referer": safeOrigin(targetUrl) },
    signal: AbortSignal.timeout(8000),
  };

  for (let i = 0; i < 3; i++) {
    try {
      const resp = await fetch(targetUrl, fetchOpts);
      if (resp.ok) return await proxyResponse(resp, targetUrl, proxyBase);
    } catch {}
  }
  try {
    const fb = await fetch(FALLBACK_STREAM_URL, { headers: fetchOpts.headers });
    if (fb.ok) return await proxyResponse(fb, FALLBACK_STREAM_URL, proxyBase);
  } catch {}
  return new Response("Stream unavailable", { status: 502, headers: CORS });
}

function safeOrigin(u) {
  try { return new URL(u).origin; } catch { return ""; }
}

// Trả response kèm CORS. Với playlist HLS (.m3u8) thì viết lại URL con thành URL
// đi qua chính proxy này — nếu không, segment tương đối (vd: seg-1.ts) sẽ bị trình
// duyệt resolve thành /api/seg-1.ts và luồng không phát được.
async function proxyResponse(resp, targetUrl, proxyBase) {
  const ct = (resp.headers.get("Content-Type") || "").toLowerCase();
  const isPlaylist = ct.includes("mpegurl") || /\.m3u8(\?|$)/i.test(targetUrl);
  const headers = new Headers(resp.headers);
  headers.delete("Content-Encoding");
  headers.delete("Content-Length");
  Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));

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
      // Viết lại URI="..." trong các tag (EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA...)
      return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${toProxy(uri)}"`);
    }
    return toProxy(l);
  }).join("\n");
}

// ========== SECURE STREAM PROXY (AES-128 ROLLING TOKEN) ==========
// Proxy m3u8 + segment với token động: AES-128-GCM, TTL 10 phút, client xoay ở phút 9.
// Chặn curl/ffplay/VLC...; chỉ nhận client định danh CHRTV-OTT/0.0.1 (UA hoặc header X-CHRTV-Client).
const UA_BLOCKLIST_RE = /curl|wget|ffmpeg|ffplay|libavformat|lavf|vlc|mpv|python-requests|python-urllib|okhttp|go-http-client|postman|insomnia|httpie|libwww|scrapy|axios|node-fetch|charles|fiddler|wireshark|hlsfetch/i;
let _streamKeyCache = null;
async function streamKey(env) {
  if (_streamKeyCache) return _streamKeyCache;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode((env && env.STREAM_TOKEN_SECRET) || STREAM_TOKEN_SECRET));
  const raw = new Uint8Array(digest.slice(0, 16)); // AES-128
  _streamKeyCache = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  return _streamKeyCache;
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
async function issueStreamToken(payload, env) {
  const key = await streamKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
  const merged = new Uint8Array(12 + ct.byteLength);
  merged.set(iv, 0); merged.set(new Uint8Array(ct), 12);
  return b64uEncode(merged);
}
async function verifyStreamToken(token, env) {
  try {
    const raw = b64uDecode(token);
    if (raw.length <= 12) return null;
    const key = await streamKey(env);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
    return JSON.parse(new TextDecoder().decode(pt));
  } catch { return null; }
}
function streamToolBlocked(request) {
  const ua = request.headers.get("User-Agent") || "";
  if (UA_BLOCKLIST_RE.test(ua)) return "UA bị chặn (curl/ffplay/vlc/...)";
  // Heuristics chặn proxy-tool (Charles/Fiddler explicit proxy hay thêm các header này)
  for (const h of ["via", "proxy-connection", "forwarded", "proxy-authorization", "x-forwarded-via", "proxy-uri"]) {
    if (request.headers.get(h)) return "header cấm: " + h;
  }
  return null;
}
function streamIdentityOk(request) {
  const ua = request.headers.get("User-Agent") || "";
  if (ua.trim() === CHRTV_CLIENT_UA) return true;
  if ((request.headers.get("X-CHRTV-Client") || "").trim() === CHRTV_CLIENT_UA) return true;
  return false;
}
async function streamSid(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = (request.headers.get("User-Agent") || "").slice(0, 80);
  return (await sha256hex(ip + "|" + ua + "|" + STREAM_TOKEN_SECRET)).slice(0, 16);
}
function streamErr(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
// ---- GATING theo nhóm kênh: Standard=VN, Recreational=VN+PHIM, VIP=tất cả ----
const CHRTV_VN_RE = /(vtv|htv|thvl|sctv|antv|qu\u1ed1c gia|nh\u00e2n d\u00e2n|qu\u1ed1c h\u1ed9i|truy\u1ec1n h\u00ecnh vi\u1ec7t nam|\u0111\u1ecba ph\u01b0\u01a1ng|h\u00e0 n\u1ed9i|v\u0129nh long|c\u1ea7n th\u01a1|vietnam|n\u00f4ng nghi\u1ec7p|ph\u1ed5 th\u00f4ng|d\u00e2n t\u1ed9c)/i;
const CHRTV_PHIM_RE = /(phim|movie|cinema|film|hollywood|classic|series|drama)/i;
function classifyGroupChrtv(g) {
  g = String(g || "");
  if (CHRTV_PHIM_RE.test(g)) return "PHIM";
  if (CHRTV_VN_RE.test(g)) return "VN";
  return "KHAC";
}
function planAllowsGroupChrtv(plan, g) {
  const c = String(plan || "standard").toLowerCase();
  if (c === "vip") return true;
  const cls = classifyGroupChrtv(g);
  if (c === "recreational") return cls === "VN" || cls === "PHIM";
  return cls === "VN"; // standard / mặc định
}
let _chanDirCache = null;
async function channelGroupForUrl(urlStr, env) {
  if (!hasDB(env)) return null;
  try {
    if (!_chanDirCache || Date.now() - _chanDirCache.at > 300000) {
      const { results } = await env.DB.prepare("SELECT stream_url, group_title FROM channels WHERE is_active = 1").all();
      const dirs = {};
      for (const c of results || []) {
        try {
          const u = new URL(c.stream_url);
          dirs[u.origin + (u.pathname.replace(/\/[^/]*$/, "") || "/")] = c.group_title || "";
        } catch (e) {}
      }
      _chanDirCache = { at: Date.now(), dirs };
    }
    const t = new URL(urlStr);
    const key = t.origin + (t.pathname.replace(/\/[^/]*$/, "") || "/");
    return Object.prototype.hasOwnProperty.call(_chanDirCache.dirs, key) ? _chanDirCache.dirs[key] : null;
  } catch { return null; }
}
async function streamAccessDenied(request, env, urlStr) {
  // Chỉ áp dụng cho target giống stream; nhóm kênh phải có trong DB (không rõ thì cho qua)
  if (!/\.(m3u8|ts|mpd)(\?|$)/i.test(urlStr || "")) return null;
  const group = await channelGroupForUrl(urlStr, env);
  if (group === null) return null;
  let usr = null;
  try { usr = await getUser(request, env); } catch (e) {}
  const plan = usr ? (usr.plan || "standard") : "standard";
  if (planAllowsGroupChrtv(plan, group)) return null;
  return { error: usr ? "PLAN_REQUIRED" : "LOGIN_REQUIRED", group, plan };
}
async function handleStreamToken(request, env) {
  const blocked = streamToolBlocked(request);
  if (blocked) return json({ error: "Client bị chặn", reason: blocked }, 403);
  if (!streamIdentityOk(request)) return json({ error: "Chỉ chấp nhận client CHRTV-OTT/0.0.1" }, 403);
  const u = new URL(request.url).searchParams.get("u") || "";
  let base;
  try { base = new URL(u); } catch { return json({ error: "Thiếu/sai tham số u" }, 400); }
  if (!/^https?:$/.test(base.protocol)) return json({ error: "u phải là http(s)" }, 400);
  const now = Math.floor(Date.now() / 1000);
  // Có Bearer hợp lệ thì gắn uid (token chặt hơn); khách = Standard (chỉ kênh VN)
  let uid = 0;
  let usr = null;
  try { usr = await getUser(request, env); uid = usr ? usr.id : 0; } catch (e) {}
  const denial = await streamAccessDenied(request, env, base.toString());
  if (denial) return json(denial, 403);
  const payload = {
    u: base.toString(),
    p: base.pathname.replace(/\/[^/]*$/, "") || "/",
    sid: await streamSid(request, env),
    uid, iat: now, exp: now + STREAM_TOKEN_TTL,
  };
  return json({
    success: true,
    t: await issueStreamToken(payload, env),
    iat: now, exp: payload.exp, rotate_at: now + STREAM_TOKEN_ROTATE, ttl: STREAM_TOKEN_TTL,
  });
}
async function handleStreamProxy(request, env) {
  const blocked = streamToolBlocked(request);
  if (blocked) return streamErr({ error: "Client bị chặn", reason: blocked }, 403);
  if (!streamIdentityOk(request)) return streamErr({ error: "Chỉ chấp nhận client CHRTV-OTT/0.0.1" }, 403);
  const q = new URL(request.url).searchParams;
  const tu = q.get("u") || ""; const tok = q.get("t") || "";
  if (!tu || !tok) return new Response("Missing u/t", { status: 400, headers: CORS });
  const payload = await verifyStreamToken(tok, env);
  const nowS = Math.floor(Date.now() / 1000);
  if (!payload) return streamErr({ error: "TOKEN_INVALID" }, 403);
  if (payload.exp < nowS) return streamErr({ error: "TOKEN_EXPIRED" }, 403);
  if (payload.sid !== (await streamSid(request, env))) return streamErr({ error: "TOKEN_SID_MISMATCH" }, 403);
  let target;
  try { target = new URL(tu); } catch { return new Response("Bad u", { status: 400, headers: CORS }); }
  // Token chỉ dùng được cho cùng origin + cùng thư mục path với URL đã cấp (chống biến proxy thành open relay)
  const tokBase = (() => { try { return new URL(payload.u); } catch { return null; } })();
  const dir = (payload.p || "/");
  if (!tokBase || tokBase.origin !== target.origin || !(target.pathname === tokBase.pathname || target.pathname.startsWith(dir + "/") || (dir === "/" && target.pathname.startsWith("/")))) {
    return streamErr({ error: "TOKEN_SCOPE" }, 403);
  }
  const upstreamHeaders = { "User-Agent": "VLC/3.0.21 LibVLC/3.0.21", "Accept": "*/*", "Referer": target.origin + "/" };
  const range = request.headers.get("Range");
  if (range) upstreamHeaders["Range"] = range;
  let resp;
  try {
    resp = await fetch(target.toString(), { headers: upstreamHeaders, signal: AbortSignal.timeout(9000), redirect: "follow" });
  } catch {
    return new Response("Stream unavailable", { status: 502, headers: CORS });
  }
  const ct = (resp.headers.get("Content-Type") || "").toLowerCase();
  const isPlaylist = ct.includes("mpegurl") || /\.m3u8(\?|$)/i.test(target.pathname);
  const headers = new Headers(resp.headers);
  headers.delete("Content-Encoding"); headers.delete("Content-Length");
  Object.entries(CORS).forEach(([k, v]) => headers.set(k, v));
  if (isPlaylist) {
    headers.set("Content-Type", "application/vnd.apple.mpegurl");
    headers.set("Cache-Control", "no-store");
    const text = await resp.text();
    const proxyBase = new URL(request.url).origin + "/api/stream/proxy";
    return new Response(rewriteM3U8Secure(text, target, proxyBase, tok), { status: resp.status, headers });
  }
  headers.set("Cache-Control", "private, max-age=30");
  return new Response(resp.body, { status: resp.status, headers });
}
function rewriteM3U8Secure(text, targetUrl, proxyBase, tok) {
  const toProxy = (raw) => {
    try {
      const abs = new URL(raw, targetUrl).toString();
      return proxyBase + "?u=" + encodeURIComponent(abs) + "&t=" + tok;
    } catch { return raw; }
  };
  return text.split(/\r?\n/).map((line) => {
    const l = line.trim();
    if (!l) return line;
    if (l.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_m, uri) => 'URI="' + toProxy(uri) + '"');
    return toProxy(l);
  }).join("\n");
}

// ========== AUTH ==========
async function handleAuth(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const body = await request.json().catch(() => ({}));

  // Register
  if (path === "/auth/register") {
    const { username, email, password } = body;
    if (!username || !email || !password) return json({ error: "Thiếu thông tin" }, 400);
    if (password.length < 6) return json({ error: "Mật khẩu ≥ 6 ký tự" }, 400);

    const hash = hashPassword(password);
    const verifyCode = String(Math.floor(100000 + Math.random() * 900000));
    const verifyExpires = Math.floor(Date.now() / 1000) + 3600; // 1 hour

    try {
      await env.DB.prepare("INSERT INTO users (username, email, password_hash, verify_code, verify_expires) VALUES (?, ?, ?, ?, ?)").bind(username, email, hash, verifyCode, verifyExpires).run();
    } catch (e) {
      if (e.message?.includes("UNIQUE")) return json({ error: "Username hoặc email đã tồn tại" }, 409);
      console.error("register INSERT error:", e?.message || e);
      return json({ error: "Lỗi đăng ký: " + (e?.message || "database") }, 500);
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
    return json(resp);
  }

  // Login
  if (path === "/auth/login") {
    const { login, password } = body;
    if (!login || !password) return json({ error: "Thiếu thông tin" }, 400);
    const ip = request.headers.get("CF-Connecting-IP") || "local";

    // RATE LIMIT: sai ≥5 lần trong 15 phút (theo tài khoản hoặc IP) → khoá tạm
    try {
      const { results: fails } = await env.DB.prepare("SELECT COUNT(*) as c FROM login_attempts WHERE (login = ? OR ip = ?) AND created_at > datetime('now', '-15 minutes')").bind(login, ip).all();
      if ((fails[0]?.c || 0) >= 5) {
        return json({ error: "Đăng nhập sai quá nhiều lần. Tạm khoá 15 phút — thử lại sau hoặc đặt lại mật khẩu.", code: "RATE_LIMITED" }, 429);
      }
    } catch (e) { /* bảng chưa có — bỏ qua */ }

    const hash = hashPassword(password);

    try {
      const { results } = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified, banned, totp_secret, totp_enabled FROM users WHERE (email = ? OR username = ?) AND password_hash = ?").bind(login, login, hash).all();
      if (results.length === 0) {
        // Ghi nhận lần sai để rate limit
        try { await env.DB.prepare("INSERT INTO login_attempts (login, ip) VALUES (?, ?)").bind(login, ip).run(); } catch {}
        return json({ error: "Sai tài khoản hoặc mật khẩu" }, 401);
      }
      const user = results[0];

      // Tài khoản bị admin khoá
      if (user.banned) {
        return json({ error: "Tài khoản đã bị khoá bởi quản trị viên.", code: "BANNED" }, 403);
      }

      // BẮT BUỘC xác minh email trước khi đăng nhập (trừ admin để không tự khoá chính mình)
      if (!user.email_verified && user.role !== "admin") {
        return json({
          success: false,
          error: "Tài khoản chưa xác minh email. Kiểm tra hộp thư (cả Spam) hoặc bấm \"Gửi lại mã\".",
          code: "EMAIL_NOT_VERIFIED",
          email: user.email,
        }, 403);
      }

      // 2FA TOTP: bật thì bắt nhập mã từ Authenticator
      if (user.totp_enabled) {
        if (!body.totp) {
          return json({ success: false, error: "Nhập mã 2FA (6 số) từ Google Authenticator.", code: "TOTP_REQUIRED", email: user.email }, 401);
        }
        const okTotp = await verifyTOTP(user.totp_secret, String(body.totp));
        if (!okTotp) {
          try { await env.DB.prepare("INSERT INTO login_attempts (login, ip) VALUES (?, ?)").bind(login, ip).run(); } catch {}
          return json({ error: "Mã 2FA không đúng.", code: "TOTP_INVALID" }, 401);
        }
      }

      // Đăng nhập OK → xoá nhật ký sai của tài khoản + IP này
      try { await env.DB.prepare("DELETE FROM login_attempts WHERE login = ? OR ip = ?").bind(login, ip).run(); } catch {}

      const token = generateJWT(user.id);
      const expires = Date.now() + 30 * 24 * 3600 * 1000;
      await env.DB.prepare("INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)").bind(user.id, token, expires).run();

      // Track analytics
      try { await env.DB.prepare("INSERT INTO analytics (event, user_id, data) VALUES ('login', ?, ?)").bind(user.id, JSON.stringify({ login })).run(); } catch {}

      return json({ success: true, token, user });
    } catch (e) {
      return json({ error: "Lỗi đăng nhập" }, 500);
    }
  }

  // Verify email
  if (path === "/auth/verify") {
    const { email, code } = body;
    if (!email || !code) return json({ error: "Thiếu thông tin" }, 400);

    try {
      const { results } = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND verify_code = ? AND verify_expires > ?").bind(email, code, Math.floor(Date.now() / 1000)).all();
      if (results.length === 0) return json({ error: "Mã không hợp lệ hoặc đã hết hạn" }, 400);

      await env.DB.prepare("UPDATE users SET email_verified = 1, verify_code = '' WHERE email = ?").bind(email).run();
      return json({ success: true, message: "Email đã xác minh!" });
    } catch {
      return json({ error: "Lỗi xác minh" }, 500);
    }
  }

  // Forgot password
  if (path === "/auth/forgot") {
    const { email } = body;
    if (!email) return json({ error: "Thiếu email" }, 400);
    const resetToken = generateToken().slice(0, 32);
    const resetExpires = Math.floor(Date.now() / 1000) + 1800; // 30 min

    try {
      const r = await env.DB.prepare("UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?").bind(resetToken, resetExpires, email).run();
      const updated = (r.meta?.changes ?? r.changes) > 0;
      if (!updated) return json({ success: true, message: "Nếu email tồn tại, link đặt lại đã được gửi." });
      // Gửi email qua Brevo
      const tmpl = emailTemplateReset(resetToken);
      const sent = await sendBrevoEmail(env, { to: email, subject: tmpl.subject, html: tmpl.html });
      // Dev xem token trong console (không trả về response)
      console.log(`[AUTH/forgot] email=${email} resetToken=${resetToken} emailSent=${sent.ok}`);
      return json({ success: true, message: "Đã gửi liên kết đặt lại mật khẩu đến email của bạn.", emailSent: sent.ok });
    } catch (e) {
      console.error("forgot error:", e);
      return json({ success: true, message: "Nếu email tồn tại, link đặt lại đã được gửi." });
    }
  }

  // Reset password
  if (path === "/auth/reset") {
    const { token, newPassword } = body;
    if (!token || !newPassword) return json({ error: "Thiếu thông tin" }, 400);
    if (newPassword.length < 6) return json({ error: "Mật khẩu ≥ 6 ký tự" }, 400);

    try {
      const { results } = await env.DB.prepare("SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?").bind(token, Math.floor(Date.now() / 1000)).all();
      if (results.length === 0) return json({ error: "Token không hợp lệ hoặc hết hạn" }, 400);

      await env.DB.prepare("UPDATE users SET password_hash = ?, reset_token = '', reset_expires = 0 WHERE reset_token = ?").bind(hashPassword(newPassword), token).run();
      return json({ success: true, message: "Đặt lại mật khẩu thành công!" });
    } catch {
      return json({ error: "Lỗi đặt lại" }, 500);
    }
  }

  // Resend verify
  if (path === "/auth/resend-verify") {
    const { email } = body;
    if (!email) return json({ error: "Thiếu email" }, 400);
    const code = String(Math.floor(100000 + Math.random() * 900000));
    try {
      // Chống spam resend: nếu mã cũ còn mới (< 60s) thì bắt đợi thêm
      const { results: recent } = await env.DB.prepare("SELECT verify_expires FROM users WHERE email = ? AND email_verified = 0").bind(email).all();
      if (recent.length > 0 && (recent[0].verify_expires || 0) - 3540 > Math.floor(Date.now() / 1000)) {
        return json({ success: false, error: "Vừa gửi mã rồi — đợi khoảng 1 phút nữa nhé." }, 429);
      }
      const r = await env.DB.prepare("UPDATE users SET verify_code = ?, verify_expires = ? WHERE email = ? AND email_verified = 0").bind(code, Math.floor(Date.now() / 1000) + 3600, email).run();
      const updated = (r.meta?.changes ?? r.changes) > 0;
      if (!updated) return json({ success: true, message: "Email không tồn tại hoặc đã xác minh." });
      const tmpl = emailTemplateVerify(code);
      const sent = await sendBrevoEmail(env, { to: email, subject: tmpl.subject, html: tmpl.html });
      console.log(`[AUTH/resend] email=${email} emailSent=${sent.ok}`);
      const resp = { success: true, emailSent: sent.ok, message: sent.ok ? "Mã xác minh mới đã được gửi đến email." : "Chưa gửi được email — kiểm tra cấu hình Brevo trên Worker." };
      if (!sent.ok) resp.devCode = code; // dev fallback khi chưa cấu hình email
      return json(resp);
    } catch (e) {
      return json({ error: "Lỗi" }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
}

// ========== USER ==========
async function handleUser(path, request, env) {
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);

  // ========== GÓI CƯỚC (đăng ký gói) — tạm thời FREE toàn bộ ==========
  const PLANS = {
    standard:     { code: "standard",     name: "Standard",     rank: 1, price: 0, priceText: "TẠM FREE", allows: "Kênh truyền hình Việt Nam" },
    recreational: { code: "recreational", name: "Recreational", rank: 2, price: 0, priceText: "TẠM FREE", allows: "Kênh Việt Nam + kênh Phim" },
    vip:          { code: "vip",          name: "VIP",          rank: 3, price: 0, priceText: "TẠM FREE", allows: "Tất cả kênh — VN + Phim + Thể thao + Quốc tế" },
  };
  if (path === "/user/plan" && request.method === "GET") {
    return json({ success: true, current: user.plan || "", plans: PLANS, free: true, support: SUPPORT_EMAIL });
  }
  if (path === "/user/plan/activate" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const code = (body.plan || "").toLowerCase();
    if (!PLANS[code]) return json({ error: "Gói không hợp lệ" }, 400);
    await env.DB.prepare("UPDATE users SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(code, user.id).run();
    return json({ success: true, plan: code, price: 0, free: true, message: `Kích hoạt gói ${PLANS[code].name} thành công — hiện tạm miễn phí. Hỗ trợ: ${SUPPORT_EMAIL}`, support: SUPPORT_EMAIL });
  }

  // Get profile + profiles + settings
  if (path === "/user/profile" && request.method === "GET") {
    const { results: settings } = await env.DB.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(user.id).all();
    const { results: profiles } = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id = ? ORDER BY id ASC").bind(user.id).all();
    return json({ success: true, user, settings: settings[0] || {}, profiles });
  }

  // Update profile
  if (path === "/user/profile" && request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const { display_name, avatar_url } = body;
    if (display_name !== undefined) await env.DB.prepare("UPDATE users SET display_name = ? WHERE id = ?").bind(display_name, user.id).run();
    if (avatar_url !== undefined) await env.DB.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").bind(avatar_url, user.id).run();
    return json({ success: true });
  }

  // Update settings
  if (path === "/user/settings" && request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const s = JSON.stringify(body);
    await env.DB.prepare("INSERT OR REPLACE INTO user_settings (user_id, settings_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)").bind(user.id, s).run();
    return json({ success: true });
  }

  // Change password
  if (path === "/user/change-password" && request.method === "POST") {
    const { oldPassword, newPassword } = await request.json().catch(() => ({}));
    if (!oldPassword || !newPassword) return json({ error: "Thiếu thông tin" }, 400);
    const { results } = await env.DB.prepare("SELECT id FROM users WHERE id = ? AND password_hash = ?").bind(user.id, hashPassword(oldPassword)).all();
    if (results.length === 0) return json({ error: "Sai mật khẩu cũ" }, 400);
    await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hashPassword(newPassword), user.id).run();
    return json({ success: true });
  }

  // Logout
  if (path === "/user/logout" && request.method === "POST") {
    const auth = request.headers.get("Authorization");
    if (auth) {
      try { await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(auth.slice(7)).run(); } catch {}
    }
    return json({ success: true });
  }

  // ========== SUB-PROFILES (Netflix-style who's watching) ==========
  if (path === "/user/profiles" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id = ? ORDER BY id ASC").bind(user.id).all();
    return json({ success: true, profiles: results });
  }

  if (path === "/user/profiles" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { name, avatar_url, is_child, pin } = body;
    if (!name) return json({ error: "Thiếu tên profile" }, 400);
    if (name.length > 20) return json({ error: "Tên profile quá dài (max 20)" }, 400);

    // Limit to 5 profiles per account
    const { results: count } = await env.DB.prepare("SELECT COUNT(*) as c FROM user_profiles WHERE user_id = ?").bind(user.id).all();
    if (count[0]?.c >= 5) return json({ error: "Tối đa 5 profile cho mỗi tài khoản" }, 400);

    try {
      const pinHash = pin ? hashPassword(pin) : "";
      const r = await env.DB.prepare("INSERT INTO user_profiles (user_id, name, avatar_url, is_child, pin_hash) VALUES (?, ?, ?, ?, ?)").bind(user.id, name, avatar_url || "", is_child ? 1 : 0, pinHash).run();
      return json({ success: true, id: r.meta?.last_row_id || r.lastInsertRowid });
    } catch (e) {
      return json({ error: "Lỗi tạo profile: " + (e.message || e) }, 500);
    }
  }

  if (path === "/user/profiles/update" && request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const { id, name, avatar_url, is_child, pin } = body;
    if (!id) return json({ error: "Thiếu id" }, 400);

    // Verify profile belongs to user
    const { results: owned } = await env.DB.prepare("SELECT id FROM user_profiles WHERE id = ? AND user_id = ?").bind(id, user.id).all();
    if (owned.length === 0) return json({ error: "Profile không tồn tại" }, 403);

    if (name !== undefined) await env.DB.prepare("UPDATE user_profiles SET name = ? WHERE id = ?").bind(name, id).run();
    if (avatar_url !== undefined) await env.DB.prepare("UPDATE user_profiles SET avatar_url = ? WHERE id = ?").bind(avatar_url, id).run();
    if (is_child !== undefined) await env.DB.prepare("UPDATE user_profiles SET is_child = ? WHERE id = ?").bind(is_child ? 1 : 0, id).run();
    if (pin !== undefined) await env.DB.prepare("UPDATE user_profiles SET pin_hash = ? WHERE id = ?").bind(pin ? hashPassword(pin) : "", id).run();

    return json({ success: true });
  }

  if (path === "/user/profiles/delete" && request.method === "DELETE") {
    const body = await request.json().catch(() => ({}));
    const { id } = body;
    if (!id) return json({ error: "Thiếu id" }, 400);
    await env.DB.prepare("DELETE FROM user_profiles WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    return json({ success: true });
  }

  // PIN verification for kid profiles
  if (path === "/user/profiles/verify-pin" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const { id, pin } = body;
    if (!id || !pin) return json({ error: "Thiếu thông tin" }, 400);
    const { results } = await env.DB.prepare("SELECT pin_hash FROM user_profiles WHERE id = ? AND user_id = ?").bind(id, user.id).all();
    if (results.length === 0) return json({ error: "Profile không tồn tại" }, 404);
    if (!results[0].pin_hash) return json({ success: true });
    if (results[0].pin_hash === hashPassword(pin)) return json({ success: true });
    return json({ error: "PIN sai" }, 401);
  }

  // ========== 2FA TOTP ==========
  if (path === "/user/2fa/status" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT totp_enabled FROM users WHERE id = ?").bind(user.id).all();
    return json({ success: true, enabled: !!(results[0]?.totp_enabled) });
  }

  if (path === "/user/2fa/setup" && request.method === "POST") {
    const secret = generateTOTPSecret();
    await env.DB.prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?").bind(secret, user.id).run();
    const otpauth = `otpauth://totp/CHRTV:${encodeURIComponent(user.username || user.email)}?secret=${secret}&issuer=CHRTV&algorithm=SHA1&digits=6&period=30`;
    return json({ success: true, secret, otpauth });
  }

  if (path === "/user/2fa/verify" && request.method === "POST") {
    const { code } = await request.json().catch(() => ({}));
    const { results } = await env.DB.prepare("SELECT totp_secret FROM users WHERE id = ?").bind(user.id).all();
    const secret = results[0]?.totp_secret || "";
    if (!secret) return json({ error: "Chưa setup 2FA" }, 400);
    if (!(await verifyTOTP(secret, code))) return json({ error: "Mã 2FA không đúng — thử lại." }, 401);
    await env.DB.prepare("UPDATE users SET totp_enabled = 1 WHERE id = ?").bind(user.id).run();
    await logAudit(env, user.id, "2fa.enable", { username: user.username });
    return json({ success: true, message: "Đã bật 2FA! Từ giờ đăng nhập cần mã Authenticator." });
  }

  if (path === "/user/2fa/disable" && request.method === "POST") {
    const { code } = await request.json().catch(() => ({}));
    const { results } = await env.DB.prepare("SELECT totp_secret, totp_enabled FROM users WHERE id = ?").bind(user.id).all();
    if (!results[0]?.totp_enabled) return json({ success: true });
    if (!(await verifyTOTP(results[0].totp_secret, code))) return json({ error: "Mã 2FA không đúng." }, 401);
    await env.DB.prepare("UPDATE users SET totp_secret = '', totp_enabled = 0 WHERE id = ?").bind(user.id).run();
    await logAudit(env, user.id, "2fa.disable", { username: user.username });
    return json({ success: true, message: "Đã tắt 2FA." });
  }

  // ========== WATCHLIST PHIM (My List) ==========
  if (path === "/user/watchlist" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT media_type, tmdb_id, title, poster_path, created_at FROM movie_watchlist WHERE user_id = ? ORDER BY id DESC LIMIT 100").bind(user.id).all();
    return json({ success: true, watchlist: results });
  }
  if (path === "/user/watchlist" && request.method === "POST") {
    const { media_type, tmdb_id, title, poster_path } = await request.json().catch(() => ({}));
    if (!tmdb_id) return json({ error: "Thiếu tmdb_id" }, 400);
    await env.DB.prepare("INSERT OR REPLACE INTO movie_watchlist (user_id, media_type, tmdb_id, title, poster_path) VALUES (?, ?, ?, ?, ?)")
      .bind(user.id, media_type === 'tv' ? 'tv' : 'movie', tmdb_id, title || "", poster_path || "").run();
    return json({ success: true });
  }
  if (path === "/user/watchlist" && request.method === "DELETE") {
    const { media_type, tmdb_id } = await request.json().catch(() => ({}));
    if (!tmdb_id) return json({ error: "Thiếu tmdb_id" }, 400);
    await env.DB.prepare("DELETE FROM movie_watchlist WHERE user_id = ? AND media_type = ? AND tmdb_id = ?")
      .bind(user.id, media_type === 'tv' ? 'tv' : 'movie', tmdb_id).run();
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}

// ========== ADMIN ==========
async function handleAdmin(path, request, env, ctx) {
  // Auth: chấp nhận JWT user có role=admin HOẶC master JWT_SECRET (bypass mạnh, ai biết secret = admin)
  if (!hasDB(env)) return dbUnavailable();
  await ensureSchema(env);
  const auth = request.headers.get("Authorization") || "";
  const isMaster = auth === `Bearer ${JWT_SECRET}`;
  let adminUser = null;
  if (!isMaster) {
    adminUser = await getUser(request, env);
    if (!adminUser || adminUser.role !== 'admin') return json({ error: "Không có quyền admin" }, 403);
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
    });
  }

  // Send notification
  if (path === "/admin/notify" && request.method === "POST") {
    const { title, body: msgBody, type, channel_id, target } = await request.json().catch(() => ({}));
    if (!title || !msgBody) return json({ error: "Thiếu tiêu đề/nội dung" }, 400);
    await env.DB.prepare("INSERT INTO notifications (title, body, type, channel_id, target, created_by) VALUES (?, ?, ?, ?, ?, ?)").bind(title, msgBody, type || "info", channel_id || "", target || "all", adminUser?.id || 0).run();
    await logAudit(env, adminUser?.id || 0, "notify.send", { title, type: type || "info" });
    // Web Push fan-out (không chặn response)
    try { if (ctx && ctx.waitUntil) ctx.waitUntil(pushNotifyAll(env)); } catch {}
    return json({ success: true });
  }

  // Get notifications
  if (path === "/admin/notifications" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50").all();
    return json({ success: true, notifications: results });
  }

  // Analytics events
  if (path === "/admin/analytics" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT event, COUNT(*) as count, DATE(created_at) as date FROM analytics WHERE created_at > datetime('now', '-30 days') GROUP BY event, date ORDER BY date DESC").all();
    return json({ success: true, analytics: results });
  }

  // Channel management
  if (path === "/admin/channels" && request.method === "POST") {
    const ch = await request.json().catch(() => ({}));
    if (!ch.channel_id || !ch.name || !ch.stream_url) return json({ error: "Thiếu thông tin kênh" }, 400);
    await env.DB.prepare("INSERT OR REPLACE INTO channels (channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(ch.channel_id, ch.name, ch.logo || "", ch.group_title || "", ch.stream_url, ch.catchup_type || "append", ch.catchup_days || 7, ch.is_active !== undefined ? ch.is_active : 1).run();
    await logAudit(env, adminUser?.id || 0, "channel.upsert", { channel_id: ch.channel_id, name: ch.name });
    return json({ success: true });
  }

  if (path === "/admin/channels" && request.method === "DELETE") {
    const { channel_id } = await request.json().catch(() => ({}));
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400);
    await env.DB.prepare("DELETE FROM channels WHERE channel_id = ?").bind(channel_id).run();
    await logAudit(env, adminUser?.id || 0, "channel.delete", { channel_id });
    return json({ success: true });
  }

  // Broadcast
  if (path === "/admin/broadcast" && request.method === "POST") {
    const { message, type, expires_in } = await request.json().catch(() => ({}));
    if (!message) return json({ error: "Thiếu nội dung" }, 400);
    const expiresAt = expires_in ? Math.floor(Date.now() / 1000) + expires_in : 0;
    await env.DB.prepare("INSERT INTO broadcasts (message, type, expires_at) VALUES (?, ?, ?)").bind(message, type || "info", expiresAt).run();
    await logAudit(env, adminUser?.id || 0, "broadcast.send", { type: type || "info", message: (message || "").slice(0, 120) });
    return json({ success: true });
  }

  if (path === "/admin/broadcasts" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM broadcasts WHERE is_active = 1 ORDER BY created_at DESC LIMIT 20").all();
    return json({ success: true, broadcasts: results });
  }

  // ========== EPG OVERRIDES (chỉnh EPG riêng từng kênh) ==========
  if (path === "/admin/epg-overrides" && request.method === "GET") {
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS epg_overrides (channel_id TEXT PRIMARY KEY, channel_name TEXT DEFAULT '', programmes TEXT NOT NULL, updated_at INTEGER DEFAULT 0)").run();
      const { results } = await env.DB.prepare("SELECT channel_id, channel_name, programmes FROM epg_overrides ORDER BY channel_id ASC").all();
      return json({ success: true, overrides: results.map(r => ({ channel_id: r.channel_id, channel_name: r.channel_name, programmes: JSON.parse(r.programmes || '[]') })) });
    } catch (e) {
      return json({ error: "Lỗi đọc override: " + (e.message || e) }, 500);
    }
  }

  if (path === "/admin/epg-overrides" && request.method === "POST") {
    const { channel_id, channel_name, programmes } = await request.json().catch(() => ({}));
    if (!channel_id || !Array.isArray(programmes)) return json({ error: "Thiếu channel_id hoặc programmes" }, 400);
    try {
      await env.DB.prepare("CREATE TABLE IF NOT EXISTS epg_overrides (channel_id TEXT PRIMARY KEY, channel_name TEXT DEFAULT '', programmes TEXT NOT NULL, updated_at INTEGER DEFAULT 0)").run();
      await env.DB.prepare("INSERT OR REPLACE INTO epg_overrides (channel_id, channel_name, programmes, updated_at) VALUES (?, ?, ?, ?)").bind(channel_id, channel_name || "", JSON.stringify(programmes), Math.floor(Date.now() / 1000)).run();
      return json({ success: true });
    } catch (e) {
      return json({ error: "Lỗi lưu override: " + (e.message || e) }, 500);
    }
  }

  if (path === "/admin/epg-overrides" && request.method === "DELETE") {
    const channelId = new URL(request.url).searchParams.get("channel_id");
    if (!channelId) return json({ error: "Thiếu channel_id" }, 400);
    try {
      await env.DB.prepare("DELETE FROM epg_overrides WHERE channel_id = ?").bind(channelId).run();
      await logAudit(env, adminUser?.id || 0, "epg_override.delete", { channel_id: channelId });
      return json({ success: true });
    } catch (e) {
      return json({ error: "Lỗi xóa override: " + (e.message || e) }, 500);
    }
  }

  // ========== USER MANAGEMENT (ban/unban/promote/reset password) ==========
  if (path === "/admin/users" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT id, username, email, role, email_verified, banned, totp_enabled, created_at FROM users ORDER BY id DESC LIMIT 200").all();
    return json({ success: true, users: results });
  }

  if (path === "/admin/users/action" && request.method === "POST") {
    const { id, action } = await request.json().catch(() => ({}));
    if (!id || !action) return json({ error: "Thiếu id/action" }, 400);
    const { results } = await env.DB.prepare("SELECT id, username, email, role, banned, totp_enabled FROM users WHERE id = ?").bind(id).all();
    const target = results[0];
    if (!target) return json({ error: "Không tìm thấy user" }, 404);
    // Không cho admin tự ban/demote chính mình (tránh tự cách chân)
    if (adminUser && target.id === adminUser.id && ["ban", "demote", "delete"].includes(action)) {
      return json({ error: "Không thể tự thực hiện hành động này trên chính mình!" }, 400);
    }
    let extra = {};
    if (action === "ban") { await env.DB.prepare("UPDATE users SET banned = 1 WHERE id = ?").bind(id).run(); await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run(); }
    else if (action === "unban") { await env.DB.prepare("UPDATE users SET banned = 0 WHERE id = ?").bind(id).run(); }
    else if (action === "promote") { await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(id).run(); }
    else if (action === "demote") { await env.DB.prepare("UPDATE users SET role = 'user' WHERE id = ?").bind(id).run(); }
    else if (action === "disable_2fa") { await env.DB.prepare("UPDATE users SET totp_secret = '', totp_enabled = 0 WHERE id = ?").bind(id).run(); }
    else if (action === "reset_password") {
      const temp = "chrtv-" + generateToken().slice(0, 8);
      await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(hashPassword(temp), id).run();
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
      return json({ error: "Action không hợp lệ" }, 400);
    }
    await logAudit(env, adminUser?.id || 0, "user." + action, { target: target.username, target_id: target.id });
    return json({ success: true, ...(extra.tempPassword ? { tempPassword: extra.tempPassword } : {}) });
  }

  // ========== AUDIT LOG ==========
  if (path === "/admin/audit" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 100").all();
    return json({ success: true, audit: results });
  }

  // ========== ANALYTICS SUMMARY (cho biểu đồ) ==========
  if (path === "/admin/analytics/summary" && request.method === "GET") {
    const [viewsByDay, loginsByDay, topChannels, byEvent] = await Promise.all([
      env.DB.prepare("SELECT DATE(created_at) as date, COUNT(*) as count FROM analytics WHERE event = 'view' AND created_at > datetime('now', '-14 days') GROUP BY date ORDER BY date ASC").all(),
      env.DB.prepare("SELECT DATE(created_at) as date, COUNT(*) as count FROM analytics WHERE event = 'login' AND created_at > datetime('now', '-14 days') GROUP BY date ORDER BY date ASC").all(),
      env.DB.prepare("SELECT channel_id, COUNT(*) as count FROM analytics WHERE event = 'view' AND channel_id != '' AND created_at > datetime('now', '-30 days') GROUP BY channel_id ORDER BY count DESC LIMIT 8").all(),
      env.DB.prepare("SELECT event, COUNT(*) as count FROM analytics GROUP BY event ORDER BY count DESC LIMIT 8").all(),
    ]);
    return json({ success: true, viewsByDay: viewsByDay.results, loginsByDay: loginsByDay.results, topChannels: topChannels.results, byEvent: byEvent.results });
  }

  return json({ error: "Not found" }, 404);
}

// ========== FAVORITES ==========
async function handleFavorites(request, env) {
  // Không có D1 => client tự lưu localStorage, trả về rỗng thay vì lỗi 500
  if (!hasDB(env)) return request.method === "GET" ? json({ success: true, favorites: [], local: true }) : json({ success: true, local: true });
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT channel_id, sort_order, group_name FROM user_favorites WHERE user_id = ? ORDER BY sort_order ASC").bind(user.id).all();
    return json({ success: true, favorites: results });
  }

  if (request.method === "POST") {
    const { channel_id, group_name } = await request.json().catch(() => ({}));
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400);
    const { results } = await env.DB.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM user_favorites WHERE user_id = ?").bind(user.id).all();
    await env.DB.prepare("INSERT OR REPLACE INTO user_favorites (user_id, channel_id, sort_order, group_name) VALUES (?, ?, ?, ?)").bind(user.id, channel_id, results[0]?.next_order || 0, group_name || "").run();
    return json({ success: true });
  }

  if (request.method === "DELETE") {
    const { channel_id } = await request.json().catch(() => ({}));
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400);
    await env.DB.prepare("DELETE FROM user_favorites WHERE user_id = ? AND channel_id = ?").bind(user.id, channel_id).run();
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

// ========== HISTORY ==========
async function handleHistory(request, env) {
  if (!hasDB(env)) return request.method === "GET" ? json({ success: true, history: [], local: true }) : json({ success: true, local: true });
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT channel_id, last_position, watch_count, updated_at FROM watch_history WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30").bind(user.id).all();
    return json({ success: true, history: results });
  }

  if (request.method === "POST") {
    const { channel_id, last_position } = await request.json().catch(() => ({}));
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400);
    await env.DB.prepare("INSERT INTO watch_history (user_id, channel_id, last_position, watch_count, updated_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_position = excluded.last_position, watch_count = watch_count + 1, updated_at = CURRENT_TIMESTAMP").bind(user.id, channel_id, last_position || 0).run();
    // Track analytics
    try { await env.DB.prepare("INSERT INTO analytics (event, user_id, channel_id, data) VALUES ('view', ?, ?, ?)").bind(user.id, channel_id, JSON.stringify({ position: last_position || 0 })).run(); } catch {}
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

// ========== RATING ==========
async function handleRating(request, env) {
  if (!hasDB(env)) return request.method === "GET" ? json({ success: true, avg: 0, count: 0, userRating: 0, local: true }) : json({ success: true, local: true });
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);

  if (request.method === "POST") {
    const { channel_id, rating } = await request.json().catch(() => ({}));
    if (!channel_id || !rating) return json({ error: "Thiếu thông tin" }, 400);
    await env.DB.prepare("INSERT OR REPLACE INTO channel_ratings (channel_id, user_id, rating) VALUES (?, ?, ?)").bind(channel_id, user.id, rating).run();
    return json({ success: true });
  }

  if (request.method === "GET") {
    const channelId = new URL(request.url).searchParams.get("channel_id");
    if (!channelId) return json({ error: "Thiếu channel_id" }, 400);
    const { results } = await env.DB.prepare("SELECT AVG(rating) as avg_rating, COUNT(*) as count FROM channel_ratings WHERE channel_id = ?").bind(channelId).all();
    const userRating = await env.DB.prepare("SELECT rating FROM channel_ratings WHERE channel_id = ? AND user_id = ?").bind(channelId, user.id).all();
    return json({ success: true, avg: results[0]?.avg_rating || 0, count: results[0]?.count || 0, userRating: userRating.results[0]?.rating || 0 });
  }

  return json({ error: "Method not allowed" }, 405);
}

// ========== NOTIFICATIONS ==========
async function handleNotifications(request, env) {
  if (!hasDB(env)) return json({ success: true, notifications: [] });
  await ensureSchema(env);
  const user = await getUser(request, env);
  const userId = user?.id || 0;

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM notifications WHERE target = 'all' OR target = ? ORDER BY created_at DESC LIMIT 20").bind(userId ? String(userId) : "all").all();
    return json({ success: true, notifications: results });
  }

  return json({ error: "Method not allowed" }, 405);
}

// ========== REMINDERS ==========
async function handleReminders(request, env) {
  if (!hasDB(env)) return request.method === "GET" ? json({ success: true, reminders: [], local: true }) : json({ success: true, local: true });
  await ensureSchema(env);
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM program_reminders WHERE user_id = ? AND remind_at > datetime('now') ORDER BY remind_at ASC").bind(user.id).all();
    return json({ success: true, reminders: results });
  }

  if (request.method === "POST") {
    const { channel_id, program_title, remind_at } = await request.json().catch(() => ({}));
    if (!channel_id || !program_title || !remind_at) return json({ error: "Thiếu thông tin" }, 400);
    await env.DB.prepare("INSERT INTO program_reminders (user_id, channel_id, program_title, remind_at) VALUES (?, ?, ?, ?)").bind(user.id, channel_id, program_title, remind_at).run();
    return json({ success: true });
  }

  if (request.method === "DELETE") {
    const { id } = await request.json().catch(() => ({}));
    if (!id) return json({ error: "Thiếu id" }, 400);
    await env.DB.prepare("DELETE FROM program_reminders WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

// ========== BROADCASTS ==========
async function handleBroadcasts(env) {
  if (!hasDB(env)) return json({ success: true, broadcasts: [] });
  await ensureSchema(env);
  const { results } = await env.DB.prepare("SELECT * FROM broadcasts WHERE is_active = 1 AND (expires_at = 0 OR expires_at > ?) ORDER BY created_at DESC LIMIT 5").bind(Math.floor(Date.now() / 1000)).all();
  return json({ success: true, broadcasts: results });
}

// ========== CHANNELS ==========
async function handleChannels(env, request) {
  const refresh = request && new URL(request.url).searchParams.get("refresh") === "1";
  if (hasDB(env)) {
    await ensureSchema(env);
    try {
      const { results } = await env.DB.prepare("SELECT id, channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days FROM channels WHERE is_active = 1 ORDER BY id ASC").all();
      if (results && results.length > 0 && !refresh) return json({ success: true, channels: results });
    } catch (e) { console.error("handleChannels D1 error:", e?.message || e); }
  }
  // Bảng rỗng hoặc yêu cầu refresh → nạp từ nguồn M3U và lưu vào D1
  const fromSource = await loadChannelsFromSource();
  if (hasDB(env) && fromSource && fromSource.length > 0) {
    await writeChannels(env, fromSource);
  }
  return json({ success: true, channels: fromSource });
}

// Ghi danh sách kênh vào D1 (thay toàn bộ, dùng batch). Trả số kênh đã ghi (0 nếu không có DB).
async function writeChannels(env, list) {
  if (!hasDB(env) || !list || list.length === 0) return 0;
  try {
    await ensureSchema(env);
    const values = list.map(ch => [ch.channel_id, ch.name, ch.logo || "", ch.group_title || "Khác", ch.stream_url, ch.catchup_type || "append", ch.catchup_days || 7]);
    let ok = false;
    // Thử INSERT có cột is_active (schema mới)
    try {
      const stmt = env.DB.prepare("INSERT OR REPLACE INTO channels (channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)");
      const rows = values.map(v => stmt.bind(...v));
      if (typeof env.DB.batch === "function") {
        await env.DB.batch([env.DB.prepare("DELETE FROM channels")]);
        for (let i = 0; i < rows.length; i += 50) await env.DB.batch(rows.slice(i, i + 50));
      } else {
        await env.DB.prepare("DELETE FROM channels").run();
        for (const row of rows) await row.run();
      }
      ok = true;
    } catch (e) {
      console.error("[channels] INSERT with is_active failed, retry without:", e?.message || e);
    }
    // DB quá cũ (thiếu cột is_active) → fallback INSERT không có cột này
    if (!ok) {
      const stmt = env.DB.prepare("INSERT OR REPLACE INTO channels (channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days) VALUES (?, ?, ?, ?, ?, ?, ?)");
      const rows = values.map(v => stmt.bind(...v));
      if (typeof env.DB.batch === "function") {
        await env.DB.batch([env.DB.prepare("DELETE FROM channels")]);
        for (let i = 0; i < rows.length; i += 50) await env.DB.batch(rows.slice(i, i + 50));
      } else {
        await env.DB.prepare("DELETE FROM channels").run();
        for (const row of rows) await row.run();
      }
    }
    console.error(`[channels] wrote ${list.length} channels to D1`);
    return list.length;
  } catch (e) { console.error("writeChannels error:", e?.message || e); return 0; }
}

// Tải danh sách kênh từ playlist M3U gốc, fallback danh sách mặc định
async function loadChannelsFromSource() {
  try {
    const resp = await fetch(SOURCE_M3U_URL, { headers: { "User-Agent": "CHRTV-OTT/2.0" }, signal: AbortSignal.timeout(8000) });
    if (resp.ok) {
      const parsed = parseM3U(await resp.text());
      if (parsed.length > 0) return parsed;
    } else {
      console.error(`[playlist] source returned ${resp.status}`);
    }
  } catch (e) { console.error("loadChannelsFromSource error:", e?.message || e); }
  return DEFAULT_CHANNELS;
}

// ========== SEARCH ==========
async function handleSearch(request, env) {
  const q = new URL(request.url).searchParams.get("q");
  if (!q) return json({ success: true, results: [] });
  if (hasDB(env)) {
    try {
      const { results } = await env.DB.prepare("SELECT channel_id, name, logo, group_title FROM channels WHERE name LIKE ? AND is_active = 1 LIMIT 20").bind(`%${q}%`).all();
      if (results && results.length > 0) return json({ success: true, results });
    } catch (e) { console.error("handleSearch D1 error:", e?.message || e); }
  }
  const needle = q.toLowerCase();
  const list = (await loadChannelsFromSource())
    .filter(ch => (ch.name || "").toLowerCase().includes(needle))
    .slice(0, 20)
    .map(ch => ({ channel_id: ch.channel_id, name: ch.name, logo: ch.logo, group_title: ch.group_title }));
  return json({ success: true, results: list });
}

// ========== ANALYTICS ==========
async function handleAnalytics(request, env) {
  if (!hasDB(env)) return json({ success: true, skipped: true });
  await ensureSchema(env);
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get("CF-Connecting-IP") || "";
  try {
    await env.DB.prepare("INSERT INTO analytics (event, user_id, channel_id, data, ip) VALUES (?, ?, ?, ?, ?)").bind(body.event || "pageview", body.user_id || 0, body.channel_id || "", JSON.stringify(body.data || {}), ip).run();
  } catch {}
  return json({ success: true });
}

// ========== WATCH PARTY (D1 + polling — khong phu thuoc gioi han cross-request WebSocket cua workerd) ==========
// Rooms + chat + reaction + trạng thái host lưu D1; client poll /api/party/feed mỗi ~2s.
async function handleParty(path, request, env) {
  if (!hasDB(env)) return json({ error: "Cần D1" }, 503);
  await ensureSchema(env);
  const body = await request.json().catch(() => ({}));

  const touchMember = async (room, name) => {
    await env.DB.prepare("INSERT OR REPLACE INTO party_members (room, name, last_seen) VALUES (?, ?, ?)").bind(room, name, Date.now()).run();
  };

  if (path === "/api/party/join" && request.method === "POST") {
    const { room, name, channelId, channelName } = body;
    if (!room || !name) return json({ error: "Thiếu room/name" }, 400);
    // Host (người đầu tiên tạo phòng) ghi kênh đang xem
    const { results: existing } = await env.DB.prepare("SELECT room FROM party_rooms WHERE room = ?").bind(room).all();
    if (existing.length === 0 && channelId) {
      await env.DB.prepare("INSERT OR REPLACE INTO party_rooms (room, channel_id, channel_name, updated_at) VALUES (?, ?, ?, ?)").bind(room, channelId, channelName || "", Date.now()).run();
    }
    await touchMember(room, name);
    await env.DB.prepare("INSERT INTO party_messages (room, from_name, kind, text) VALUES (?, ?, 'join', ?)").bind(room, name, `${name} đã vào phòng`).run();
    return json({ success: true });
  }

  if (path === "/api/party/heartbeat" && request.method === "POST") {
    const { room, name } = body;
    if (!room || !name) return json({ error: "Thiếu room/name" }, 400);
    await touchMember(room, name);
    return json({ success: true });
  }

  if (path === "/api/party/state" && request.method === "POST") {
    const { room, channelId, channelName } = body;
    if (!room) return json({ error: "Thiếu room" }, 400);
    await env.DB.prepare("INSERT OR REPLACE INTO party_rooms (room, channel_id, channel_name, updated_at) VALUES (?, ?, ?, ?)").bind(room, channelId || "", channelName || "", Date.now()).run();
    return json({ success: true });
  }

  if (path === "/api/party/say" && request.method === "POST") {
    const { room, name, text } = body;
    if (!room || !name || !text) return json({ error: "Thiếu room/name/text" }, 400);
    await env.DB.prepare("INSERT INTO party_messages (room, from_name, kind, text) VALUES (?, ?, 'chat', ?)").bind(room, name, String(text).slice(0, 300)).run();
    return json({ success: true });
  }

  if (path === "/api/party/react" && request.method === "POST") {
    const { room, name, emoji } = body;
    if (!room || !emoji) return json({ error: "Thiếu room/emoji" }, 400);
    await env.DB.prepare("INSERT INTO party_messages (room, from_name, kind, text) VALUES (?, ?, 'reaction', ?)").bind(room, name || "Khách", String(emoji).slice(0, 8)).run();
    return json({ success: true });
  }

  if (path === "/api/party/leave" && request.method === "POST") {
    const { room, name } = body;
    if (room && name) {
      await env.DB.prepare("DELETE FROM party_members WHERE room = ? AND name = ?").bind(room, name).run();
      await env.DB.prepare("INSERT INTO party_messages (room, from_name, kind, text) VALUES (?, ?, 'leave', ?)").bind(room, name, `${name} đã rời phòng`).run();
    }
    return json({ success: true });
  }

  if (path === "/api/party/feed" && request.method === "GET") {
    const url = new URL(request.url);
    const room = url.searchParams.get("room") || "";
    const after = parseInt(url.searchParams.get("after") || "0", 10);
    if (!room) return json({ error: "Thiếu room" }, 400);
    const { results: messages } = await env.DB.prepare("SELECT id, from_name, kind, text, created_at FROM party_messages WHERE room = ? AND id > ? ORDER BY id ASC LIMIT 50").bind(room, after).all();
    const { results: roomRow } = await env.DB.prepare("SELECT channel_id, channel_name, updated_at FROM party_rooms WHERE room = ?").bind(room).all();
    const { results: members } = await env.DB.prepare("SELECT name FROM party_members WHERE room = ? AND last_seen > ? ORDER BY name ASC").bind(room, Date.now() - 45000).all();
    return json({ success: true, messages, state: roomRow[0] ? { channelId: roomRow[0].channel_id, channelName: roomRow[0].channel_name, updatedAt: roomRow[0].updated_at } : null, members: members.map((m) => ({ name: m.name })) });
  }

  return json({ error: "Not found" }, 404);
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
