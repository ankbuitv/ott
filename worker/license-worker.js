/**
 * CHRTV LICENSE SERVER — chạy tại license.ankb.qzz.io (Cloudflare Workers).
 *
 * Làm 2 việc:
 *  1. Cấp key giải mã luồng HLS AES-128:  GET /k/<token>  -> đúng 16 byte thô.
 *     (Stateless: key = HMAC(LICENSE_SECRET, token)[0..16] — KHÔNG ghi KV mỗi
 *     lần phát. KV chỉ chịu ~1 write/key/giây nên tuyệt đối không dùng cho đường
 *     streaming.)
 *  2. Quản lý license key dài hạn (issue/validate/revoke/list/info) lưu trong KV,
 *     y như bản bro đã viết — dùng cho các key bán/cho thuê, không dùng cho phát.
 *
 * Endpoints:
 *   GET  /k/<token>       -> 16 byte key thô (player HLS gọi, cần CORS)
 *   GET  /health          -> tình trạng service
 *   POST /issue           -> tạo license key (Authorization: Bearer <ADMIN_SECRET>)
 *   GET|POST /validate    -> kiểm tra key (mỗi lần gọi tăng usageCount)
 *   POST /revoke          -> thu hồi key
 *   GET  /list            -> liệt kê key
 *   GET  /info?key=       -> xem 1 key
 *   GET  /verify?token=   -> debug: xem payload token /k/ (cần admin secret)
 *
 * Cấu hình (Dashboard hoặc wrangler secret):
 *   LICENSE_SECRET  (bắt buộc, phải GIỐNG HỆT bên worker chính)
 *   ADMIN_SECRET    (cho mấy endpoint quản lý)
 *   LICENSES        (KV namespace, tuỳ chọn — thiếu thì chỉ /k/ hoạt động)
 *   LICENSE_STRICT_IP = "1" để khoá key theo IP (mặc định tắt để tránh rớt mạng)
 *
 * Deploy: npx wrangler deploy -c wrangler.license.toml
 */

import {
  verifyLicenseToken, deriveKeyBytes, peekLicenseToken,
  KEY_ROTATE_DEFAULT, KEY_GRACE_DEFAULT,
} from "./stream-protect.js";

const KEY_ROTATE = KEY_ROTATE_DEFAULT;
const KEY_GRACE = KEY_GRACE_DEFAULT;

function json(data, status = 200, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(request, env),
    },
  });
}

function corsHeaders(request, env) {
  const origin = request && request.headers ? (request.headers.get("Origin") || "") : "";
  const allow = String((env && env.LICENSE_ALLOWED_ORIGINS) || "*").trim();
  const list = allow ? allow.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const ok = allow === "*" || (origin && list.includes(origin));
  return {
    "Access-Control-Allow-Origin": ok ? (allow === "*" ? "*" : origin) : "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

async function ipHash(request, secret) {
  const ip = (request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "").split(",")[0].trim();
  if (!ip) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("chrtv-ip|" + ip));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.slice(0, 16);
}

function randomKey(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isAdmin(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return token && token === env.ADMIN_SECRET;
}

// ---------- /k/<token> : trả 16 byte key AES-128 ----------
async function handleKey(request, env, token) {
  const secret = env.LICENSE_SECRET;
  if (!secret) return json({ error: "server_misconfigured", message: "Thiếu LICENSE_SECRET" }, 500, request, env);
  const strictIp = String(env.LICENSE_STRICT_IP || "") === "1";
  const iph = strictIp ? await ipHash(request, secret) : "";
  const v = await verifyLicenseToken(token, secret, {
    now: Math.floor(Date.now() / 1000), iph, strictIp,
  });
  if (!v.ok) {
    return new Response(JSON.stringify({ error: "forbidden", reason: v.reason }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(request, env) },
    });
  }
  const key = await deriveKeyBytes(token, secret);
  return new Response(key, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(key.byteLength),
      "Cache-Control": "no-store, private",
      "X-CHRTV-License": "v1",
      ...corsHeaders(request, env),
    },
  });
}

// ---------- quản lý license dài hạn (KV) ----------
async function kvGet(env, key) {
  if (!env.LICENSES) return null;
  return await env.LICENSES.get(key);
}
async function kvPut(env, key, value) {
  if (!env.LICENSES) return false;
  await env.LICENSES.put(key, value);
  return true;
}
async function kvList(env, prefix) {
  if (!env.LICENSES) return [];
  const res = await env.LICENSES.list({ prefix: prefix || "", limit: 200 });
  return res.keys || [];
}

async function handleIssue(request, env) {
  if (!isAdmin(request, env)) return json({ error: "unauthorized" }, 401, request, env);
  if (!env.LICENSES) return json({ error: "kv_missing", message: "Chưa gán KV namespace LICENSES" }, 500, request, env);

  const body = await request.json().catch(() => ({}));
  const {
    prefix = "LIC",
    expiresInDays = 365,
    maxUsage = 0, // 0 = không giới hạn số lần gọi
    deviceLock = false,
    note = "",
  } = body;

  const key = `${prefix}-${randomKey(16)}`;
  const now = Date.now();
  const record = {
    key,
    createdAt: now,
    expiresAt: expiresInDays > 0 ? now + expiresInDays * 86400000 : 0,
    maxUsage,
    usageCount: 0,
    deviceLock,
    deviceId: null,
    revoked: false,
    note,
  };

  await kvPut(env, key, JSON.stringify(record));
  return json({ ok: true, license: record }, 200, request, env);
}

async function handleValidate(request, env) {
  let key, deviceId;
  if (request.method === "GET") {
    const url = new URL(request.url);
    key = url.searchParams.get("key");
    deviceId = url.searchParams.get("deviceId");
  } else {
    const body = await request.json().catch(() => ({}));
    key = body.key;
    deviceId = body.deviceId;
  }
  if (!key) return json({ valid: false, reason: "missing_key" }, 400, request, env);
  if (!env.LICENSES) return json({ valid: false, reason: "kv_missing" }, 500, request, env);

  const raw = await kvGet(env, key);
  if (!raw) return json({ valid: false, reason: "not_found" }, 404, request, env);

  const record = JSON.parse(raw);
  if (record.revoked) return json({ valid: false, reason: "revoked" }, 200, request, env);
  if (record.expiresAt && Date.now() > record.expiresAt) return json({ valid: false, reason: "expired" }, 200, request, env);
  if (record.maxUsage > 0 && record.usageCount >= record.maxUsage) return json({ valid: false, reason: "usage_limit_reached" }, 200, request, env);
  if (record.deviceLock) {
    if (!record.deviceId) record.deviceId = deviceId || null;
    else if (deviceId && record.deviceId !== deviceId) return json({ valid: false, reason: "device_mismatch" }, 200, request, env);
  }

  record.usageCount += 1;
  record.lastValidatedAt = Date.now();
  await kvPut(env, key, JSON.stringify(record));

  return json({
    valid: true,
    expiresAt: record.expiresAt,
    usageCount: record.usageCount,
    maxUsage: record.maxUsage,
  }, 200, request, env);
}

async function handleRevoke(request, env) {
  if (!isAdmin(request, env)) return json({ error: "unauthorized" }, 401, request, env);
  const body = await request.json().catch(() => ({}));
  const { key } = body;
  if (!key) return json({ error: "missing_key" }, 400, request, env);
  const raw = await kvGet(env, key);
  if (!raw) return json({ error: "not_found" }, 404, request, env);
  const record = JSON.parse(raw);
  record.revoked = true;
  await kvPut(env, key, JSON.stringify(record));
  return json({ ok: true }, 200, request, env);
}

async function handleList(request, env) {
  if (!isAdmin(request, env)) return json({ error: "unauthorized" }, 401, request, env);
  const url = new URL(request.url);
  const prefix = url.searchParams.get("prefix") || "";
  const keys = await kvList(env, prefix);
  const items = await Promise.all(keys.map(async (k) => {
    const raw = await kvGet(env, k.name);
    return raw ? JSON.parse(raw) : null;
  }));
  return json({ ok: true, items: items.filter(Boolean) }, 200, request, env);
}

async function handleInfo(request, env) {
  if (!isAdmin(request, env)) return json({ error: "unauthorized" }, 401, request, env);
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key) return json({ error: "missing_key" }, 400, request, env);
  const raw = await kvGet(env, key);
  if (!raw) return json({ error: "not_found" }, 404, request, env);
  return json(JSON.parse(raw), 200, request, env);
}

async function handleVerify(request, env) {
  if (!isAdmin(request, env)) return json({ error: "unauthorized" }, 401, request, env);
  const token = new URL(request.url).searchParams.get("token") || "";
  const v = await verifyLicenseToken(token, env.LICENSE_SECRET, { now: Math.floor(Date.now() / 1000) });
  return json({ ok: v.ok, reason: v.reason || "", payload: peekLicenseToken(token) }, 200, request, env);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    try {
      if (pathname === "/health") {
        return json({
          ok: true,
          service: "chrtv-license",
          has_secret: !!env.LICENSE_SECRET,
          has_kv: !!env.LICENSES,
          key_rotate_sec: KEY_ROTATE,
          key_grace_sec: KEY_GRACE,
        }, 200, request, env);
      }
      // Key giải mã luồng — endpoint "nóng", phải nhẹ nhất có thể
      if (pathname.startsWith("/k/")) {
        const token = decodeURIComponent(pathname.slice(3).split("?")[0] || "");
        if (!token) return json({ error: "missing_token" }, 400, request, env);
        return await handleKey(request, env, token);
      }
      if (pathname === "/issue" && request.method === "POST") return await handleIssue(request, env);
      if (pathname === "/validate" && (request.method === "POST" || request.method === "GET")) return await handleValidate(request, env);
      if (pathname === "/revoke" && request.method === "POST") return await handleRevoke(request, env);
      if (pathname === "/list" && request.method === "GET") return await handleList(request, env);
      if (pathname === "/info" && request.method === "GET") return await handleInfo(request, env);
      if (pathname === "/verify" && request.method === "GET") return await handleVerify(request, env);
      return json({ error: "not_found" }, 404, request, env);
    } catch (err) {
      return json({ error: "internal_error", message: err.message }, 500, request, env);
    }
  },
};
