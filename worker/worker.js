/**
 * CHRTV OTT Backend - Cloudflare Workers
 * Auth, Admin, Analytics, Notifications, WebSocket
 */

const SOURCE_M3U_URL = "https://raw.githubusercontent.com/ankbuitv/chrtv/refs/heads/main/playlists/tv.m3u";
const SOURCE_EPG_URL = "https://epg.io.vn/epgc.xml";
const SOURCE_EPG_URL2 = "https://lichphatsong.io.vn/epgc.xml";
const SOURCE_EPG_URL3 = "https://epg.pm/vi/epgc.xml";
const FALLBACK_STREAM_URL = "http://bore.pub:30113/hls/index.m3u8";
const JWT_SECRET = "chrtv_ott_secret_2026";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
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
      if (p.startsWith("/admin/")) return await handleAdmin(p, request, env);
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

async function getUser(request, env) {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const userId = verifyJWT(auth.slice(7));
  if (!userId) return null;
  try {
    const { results } = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified FROM users WHERE id = ?").bind(userId).all();
    return results[0] || null;
  } catch { return null; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ========== API ROUTER ==========
async function handleAPI(path, request, env, ctx) {
  if (path === "/api/playlist") return await handlePlaylist(env);
  if (path === "/api/epg") return await handleEPG(env);
  if (path === "/api/proxy") return await handleProxy(request, env);
  if (path === "/api/favorites") return await handleFavorites(request, env);
  if (path === "/api/history") return await handleHistory(request, env);
  if (path === "/api/rating") return await handleRating(request, env);
  if (path === "/api/notifications") return await handleNotifications(request, env);
  if (path === "/api/reminders") return await handleReminders(request, env);
  if (path === "/api/broadcasts") return await handleBroadcasts(env);
  if (path === "/api/channels") return await handleChannels(env);
  if (path === "/api/search") return await handleSearch(request, env);
  if (path === "/api/analytics") return await handleAnalytics(request, env);
  return json({ error: "Not found" }, 404);
}

// ========== PLAYLIST ==========
async function handlePlaylist(env) {
  if (env && env.DB) {
    try {
      const { results } = await env.DB.prepare("SELECT * FROM channels WHERE is_active = 1 ORDER BY id ASC").all();
      if (results && results.length > 0) return json({ success: true, source: "d1", data: results });
    } catch {}
  }
  try {
    const resp = await fetch(SOURCE_M3U_URL, { headers: { "User-Agent": "CHRTV-OTT/2.0" }, signal: AbortSignal.timeout(6000) });
    if (resp.ok) {
      const parsed = parseM3U(await resp.text());
      if (parsed.length > 0) {
        // Store in D1 if available
        if (env && env.DB) {
          try {
            await env.DB.prepare("DELETE FROM channels").run();
            for (const ch of parsed) {
              await env.DB.prepare("INSERT OR REPLACE INTO channels (channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(ch.channel_id, ch.name, ch.logo, ch.group_title, ch.stream_url, ch.catchup_type, ch.catchup_days).run();
            }
          } catch {}
        }
        return json({ success: true, source: "m3u", data: parsed });
      }
    }
  } catch {}
  return json({ success: true, source: "default", data: DEFAULT_CHANNELS });
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
];

// ========== EPG ==========
async function handleEPG(env) {
  if (env && env.DB) {
    try {
      const { results } = await env.DB.prepare("SELECT * FROM epg_cache WHERE key = 'epg_main' AND expires_at > ?").bind(Math.floor(Date.now() / 1000)).all();
      if (results.length > 0) return json({ success: true, source: "cache", data: JSON.parse(results[0].data) });
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
          return json({ success: true, source: "xml", data });
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
  return json({ success: true, source: "mock", data: generateMockEPG(channelIds) });
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
  const targetUrl = new URL(request.url).searchParams.get("url");
  if (!targetUrl) return new Response("Missing url", { status: 400, headers: CORS });
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await fetch(targetUrl, { headers: { "User-Agent": "VLC/3.0.21 LibVLC/3.0.21", "Accept": "*/*", "Referer": new URL(targetUrl).origin }, signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const h = new Headers(resp.headers); Object.entries(CORS).forEach(([k, v]) => h.set(k, v));
        return new Response(resp.body, { status: resp.status, headers: h });
      }
    } catch {}
  }
  try {
    const fb = await fetch(FALLBACK_STREAM_URL, { headers: { "User-Agent": "VLC/3.0.21 LibVLC/3.0.21" } });
    if (fb.ok) { const h = new Headers(fb.headers); Object.entries(CORS).forEach(([k, v]) => h.set(k, v)); return new Response(fb.body, { status: fb.status, headers: h }); }
  } catch {}
  return new Response("Stream unavailable", { status: 502, headers: CORS });
}

// ========== AUTH ==========
async function handleAuth(path, request, env) {
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
      // TODO: Send verification email via API (SendGrid/Mailgun/Resend)
      // For now, return code in response
      return json({ success: true, message: "Đăng ký thành công! Kiểm tra email để lấy mã xác minh.", verifyCode });
    } catch (e) {
      if (e.message?.includes("UNIQUE")) return json({ error: "Username hoặc email đã tồn tại" }, 409);
      return json({ error: "Lỗi đăng ký" }, 500);
    }
  }

  // Login
  if (path === "/auth/login") {
    const { login, password } = body;
    if (!login || !password) return json({ error: "Thiếu thông tin" }, 400);
    const hash = hashPassword(password);

    try {
      const { results } = await env.DB.prepare("SELECT id, username, email, display_name, avatar_url, role, email_verified FROM users WHERE (email = ? OR username = ?) AND password_hash = ?").bind(login, login, hash).all();
      if (results.length === 0) return json({ error: "Sai tài khoản hoặc mật khẩu" }, 401);
      const user = results[0];

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
      await env.DB.prepare("UPDATE users SET reset_token = ?, reset_expires = ? WHERE email = ?").bind(resetToken, resetExpires, email).run();
      return json({ success: true, message: "Đã gửi liên kết đặt lại mật khẩu", resetToken });
    } catch {
      return json({ error: "Email không tồn tại" }, 404);
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
      await env.DB.prepare("UPDATE users SET verify_code = ?, verify_expires = ? WHERE email = ? AND email_verified = 0").bind(code, Math.floor(Date.now() / 1000) + 3600, email).run();
      return json({ success: true, verifyCode: code });
    } catch {
      return json({ error: "Lỗi" }, 500);
    }
  }

  return json({ error: "Not found" }, 404);
}

// ========== USER ==========
async function ensureTables(env) {
  try {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS user_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, avatar_url TEXT DEFAULT '', is_child INTEGER DEFAULT 0, pin_hash TEXT DEFAULT '', active INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)").run();
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS epg_cache (key TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL)").run();
  } catch (e) {
    console.error('ensureTables error:', e.message || e);
  }
}
async function handleUser(path, request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);
  await ensureTables(env);

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

  return json({ error: "Not found" }, 404);
}

// ========== ADMIN ==========
async function handleAdmin(path, request, env) {
  const user = await getUser(request, env);
  if (!user || user.role !== 'admin') return json({ error: "Không có quyền admin" }, 403);

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
    await env.DB.prepare("INSERT INTO notifications (title, body, type, channel_id, target, created_by) VALUES (?, ?, ?, ?, ?, ?)").bind(title, msgBody, type || "info", channel_id || "", target || "all", user.id).run();
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
    return json({ success: true });
  }

  if (path === "/admin/channels" && request.method === "DELETE") {
    const { channel_id } = await request.json().catch(() => ({}));
    if (!channel_id) return json({ error: "Thiếu channel_id" }, 400);
    await env.DB.prepare("DELETE FROM channels WHERE channel_id = ?").bind(channel_id).run();
    return json({ success: true });
  }

  // Broadcast
  if (path === "/admin/broadcast" && request.method === "POST") {
    const { message, type, expires_in } = await request.json().catch(() => ({}));
    if (!message) return json({ error: "Thiếu nội dung" }, 400);
    const expiresAt = expires_in ? Math.floor(Date.now() / 1000) + expires_in : 0;
    await env.DB.prepare("INSERT INTO broadcasts (message, type, expires_at) VALUES (?, ?, ?)").bind(message, type || "info", expiresAt).run();
    return json({ success: true });
  }

  if (path === "/admin/broadcasts" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM broadcasts WHERE is_active = 1 ORDER BY created_at DESC LIMIT 20").all();
    return json({ success: true, broadcasts: results });
  }

  return json({ error: "Not found" }, 404);
}

// ========== FAVORITES ==========
async function handleFavorites(request, env) {
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
  const { results } = await env.DB.prepare("SELECT * FROM broadcasts WHERE is_active = 1 AND (expires_at = 0 OR expires_at > ?) ORDER BY created_at DESC LIMIT 5").bind(Math.floor(Date.now() / 1000)).all();
  return json({ success: true, broadcasts: results });
}

// ========== CHANNELS ==========
async function handleChannels(env) {
  const { results } = await env.DB.prepare("SELECT id, channel_id, name, logo, group_title, stream_url, catchup_type, catchup_days FROM channels WHERE is_active = 1 ORDER BY id ASC").all();
  return json({ success: true, channels: results });
}

// ========== SEARCH ==========
async function handleSearch(request, env) {
  const q = new URL(request.url).searchParams.get("q");
  if (!q) return json({ success: true, results: [] });
  const { results } = await env.DB.prepare("SELECT channel_id, name, logo, group_title FROM channels WHERE name LIKE ? AND is_active = 1 LIMIT 20").bind(`%${q}%`).all();
  return json({ success: true, results });
}

// ========== ANALYTICS ==========
async function handleAnalytics(request, env) {
  const body = await request.json().catch(() => ({}));
  const ip = request.headers.get("CF-Connecting-IP") || "";
  try {
    await env.DB.prepare("INSERT INTO analytics (event, user_id, channel_id, data, ip) VALUES (?, ?, ?, ?, ?)").bind(body.event || "pageview", body.user_id || 0, body.channel_id || "", JSON.stringify(body.data || {}), ip).run();
  } catch {}
  return json({ success: true });
}

// ========== WEBSOCKET ==========
const wsClients = new Map();

function handleWebSocket(request, env, ctx) {
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);

  server.accept();
  const id = crypto.randomUUID();
  wsClients.set(id, server);

  server.send(JSON.stringify({ type: "welcome", message: "CHRTV Connected" }));

  // Broadcast pending notifications
  env.DB?.prepare("SELECT * FROM notifications WHERE target = 'all' AND created_at > datetime('now', '-1 hour') ORDER BY created_at DESC LIMIT 5").all()
    .then(({ results }) => { if (results.length) server.send(JSON.stringify({ type: "notifications", data: results })); })
    .catch(() => {});

  server.addEventListener("message", async (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "ping") server.send(JSON.stringify({ type: "pong", ts: Date.now() }));
      if (msg.type === "subscribe") {
        // Subscribe to channel updates
        server.send(JSON.stringify({ type: "subscribed", channel: msg.channel }));
      }
    } catch {}
  });

  server.addEventListener("close", () => { wsClients.delete(id); });

  return new Response(null, { status: 101, webSocket: client });
}
