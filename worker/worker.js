/**
 * CHRTV OTT Backend - Cloudflare Workers
 * Auth, Admin, Analytics, Notifications, WebSocket
 */

const SOURCE_M3U_URL = "https://raw.githubusercontent.com/ankbuitv/chrtv/refs/heads/main/playlists/tv.m3u";
const SOURCE_EPG_URL = "https://epg.io.vn/epgc.xml";
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
      // v1 API
      if (p.startsWith("/api/v1/") || p === "/api/playlist" || p === "/api/epg" || p === "/api/proxy") {
        return await handleAPI(p.replace("/api/v1", "/api"), request, env, ctx);
      }
      // Auth API
      if (p.startsWith("/auth/")) return await handleAuth(p, request, env);
      // User API
      if (p.startsWith("/user/")) return await handleUser(p, request, env);
      // Admin API
      if (p.startsWith("/admin/")) return await handleAdmin(p, request, env);
      // Analytics
      if (p === "/api/analytics") return await handleAnalytics(request, env);
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
function hashPassword(password) {
  // Simple hash for Workers - use SHA-256
  return Array.from(new Uint8Array(
    crypto.subtle.digestSync("SHA-256", new TextEncoder().encode(password + JWT_SECRET))
  )).map(b => b.toString(16).padStart(2, '0')).join('');
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
  try {
    const resp = await fetch(SOURCE_EPG_URL, { headers: { "User-Agent": "CHRTV-OTT/2.0" }, signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const data = parseEPGXml(await resp.text());
      if (env && env.DB) {
        try {
          await env.DB.prepare("INSERT OR REPLACE INTO epg_cache (key, data, expires_at) VALUES ('epg_main', ?, ?)").bind(JSON.stringify(data), Math.floor(Date.now() / 1000) + 3600).run();
        } catch {}
      }
      return json({ success: true, source: "xml", data });
    }
  } catch {}
  return json({ success: true, source: "mock", data: generateMockEPG() });
}

function parseEPGXml(xml) {
  const channels = {}, programmes = [];
  const chR = /<channel\s+id="([^"]+)">[\s\S]*?<display-name[^>]*>([^<]+)<\/display-name>/g;
  let m;
  while ((m = chR.exec(xml))) channels[m[1]] = { id: m[1], name: m[2] };
  const pR = /<programme\s+start="([^"]+)"\s+stop="([^"]+)"\s+channel="([^"]+)">[\s\S]*?<title[^>]*>([^<]+)<\/title>(?:[\s\S]*?<desc[^>]*>([^<]*)<\/desc>)?/g;
  while ((m = pR.exec(xml))) {
    programmes.push({ start: m[1], stop: m[2], channel: m[3], title: m[4], desc: m[5] || "" });
  }
  return { channels, programmes };
}

function generateMockEPG() {
  const ids = ["VTV1.vn", "VTV3.vn"];
  const progs = []; const now = new Date();
  for (let d = -6; d <= 1; d++) {
    const bd = new Date(now.getTime() + d * 86400000);
    ids.forEach(id => {
      for (let h = 0; h < 24; h += 2) {
        const s = new Date(bd); s.setHours(h, 0, 0, 0);
        const e = new Date(bd); e.setHours(h + 2, 0, 0, 0);
        const fmt = (dt) => `${dt.getFullYear()}${String(dt.getMonth()+1).padStart(2,'0')}${String(dt.getDate()).padStart(2,'0')}${String(dt.getHours()).padStart(2,'0')}${String(dt.getMinutes()).padStart(2,'0')}${String(dt.getSeconds()).padStart(2,'0')} +0700`;
        progs.push({ channel: id, start: fmt(s), stop: fmt(e), title: `Chương trình ${h}:00`, desc: "Mô tả chương trình" });
      }
    });
  }
  return { channels: ids.reduce((a, id) => { a[id] = { id, name: id }; return a; }, {}), programmes: progs };
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
async function handleUser(path, request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ error: "Chưa đăng nhập" }, 401);

  // Get profile
  if (path === "/user/profile" && request.method === "GET") {
    const { results: settings } = await env.DB.prepare("SELECT * FROM user_settings WHERE user_id = ?").bind(user.id).all();
    const { results: profiles } = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id = ?").bind(user.id).all();
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

  // Create sub-profile
  if (path === "/user/profiles" && request.method === "POST") {
    const { name, avatar_url, is_child } = await request.json().catch(() => ({}));
    if (!name) return json({ error: "Thiếu tên" }, 400);
    await env.DB.prepare("INSERT INTO user_profiles (user_id, name, avatar_url, is_child) VALUES (?, ?, ?, ?)").bind(user.id, name, avatar_url || "", is_child ? 1 : 0).run();
    return json({ success: true });
  }

  // Get sub-profiles
  if (path === "/user/profiles" && request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM user_profiles WHERE user_id = ?").bind(user.id).all();
    return json({ success: true, profiles: results });
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
