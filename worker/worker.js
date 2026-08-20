/**
 * CHRTV - Cloudflare Workers Backend API Engine
 * Tác giả: CHRTV OTT Full-stack Architect
 * Mô tả: Xử lý Proxy Stream HLS, Cache EPG JSON qua KV, Quản lý Kênh & D1 Database
 */

// Định cấu hình URL gốc nguồn dữ liệu & Fallback Stream
const SOURCE_M3U_URL = "https://raw.githubusercontent.com/ankbuitv/chrtv/refs/heads/main/playlists/tv.m3u";
const SOURCE_EPG_URL = "https://epg.io.vn/epgc.xml";
const FALLBACK_STREAM_URL = "http://bore.pub:30113/hls/index.m3u8";

// CORS Headers dùng chung cho toàn bộ API
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

/**
 * Danh sách kênh dự phòng mặc định khi không kết nối được M3U hoặc D1 chưa có dữ liệu
 */
const DEFAULT_CHANNELS = [
  {
    channel_id: "VTV1.vn",
    name: "VTV1 HD",
    logo: "https://vtv.sub.id/images/vtv1.png",
    group_title: "VTV",
    stream_url: "https://vtv.sub.id/vtv1/index.m3u8",
    catchup_type: "append",
    catchup_days: 7
  },
  {
    channel_id: "VTV3.vn",
    name: "VTV3 HD",
    logo: "https://vtv.sub.id/images/vtv3.png",
    group_title: "VTV",
    stream_url: "https://vtv.sub.id/vtv3/index.m3u8",
    catchup_type: "append",
    catchup_days: 7
  },
  {
    channel_id: "VTV5.vn",
    name: "VTV5 HD",
    logo: "https://vtv.sub.id/images/vtv5.png",
    group_title: "VTV",
    stream_url: "https://vtv.sub.id/vtv5/index.m3u8",
    catchup_type: "append",
    catchup_days: 7
  },
  {
    channel_id: "HTV7.vn",
    name: "HTV7 HD",
    logo: "https://vtv.sub.id/images/htv7.png",
    group_title: "HTV",
    stream_url: "https://vtv.sub.id/htv7/index.m3u8",
    catchup_type: "append",
    catchup_days: 7
  },
  {
    channel_id: "HTV9.vn",
    name: "HTV9 HD",
    logo: "https://vtv.sub.id/images/htv9.png",
    group_title: "HTV",
    stream_url: "https://vtv.sub.id/htv9/index.m3u8",
    catchup_type: "append",
    catchup_days: 7
  },
  {
    channel_id: "ON_SPORTS.vn",
    name: "ON Sports+",
    logo: "https://vtv.sub.id/images/onsports.png",
    group_title: "Thể Thao",
    stream_url: "https://vtv.sub.id/onsports/index.m3u8",
    catchup_type: "append",
    catchup_days: 7
  },
  {
    channel_id: "FALLBACK_LIVE",
    name: "CHRTV Stream Dự Phòng",
    logo: "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png",
    group_title: "Dự Phòng",
    stream_url: FALLBACK_STREAM_URL,
    catchup_type: "default",
    catchup_days: 7
  }
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Xử lý Preflight CORS Options
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // 1. Endpoint API Playlist: /api/playlist
      if (pathname === "/api/playlist") {
        return await handlePlaylist(request, env);
      }

      // 2. Endpoint API EPG: /api/epg
      if (pathname === "/api/epg") {
        return await handleEPG(request, env);
      }

      // 3. Endpoint API Proxy Stream HLS: /api/proxy
      if (pathname === "/api/proxy") {
        return await handleProxy(request, env);
      }

      // 4. Endpoint API Favorites (Yêu thích): /api/favorites
      if (pathname === "/api/favorites") {
        return await handleFavorites(request, env);
      }

      // 5. Endpoint API Watch History (Lịch sử xem): /api/history
      if (pathname === "/api/history") {
        return await handleHistory(request, env);
      }

      // Phục vụ Static Files hoặc Route không tìm thấy
      return new Response(JSON.stringify({ error: "API Endpoint not found", app: "CHRTV OTT" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
      });
    }
  }
};

/**
 * Xử lý Endpoint Playlist (/api/playlist)
 * Đọc M3U từ URL gốc hoặc Cloudflare D1 Database, parse sang JSON
 */
async function handlePlaylist(request, env) {
  // Thử đọc từ Cloudflare D1 DB nếu có sẵn binding DB
  if (env && env.DB) {
    try {
      const { results } = await env.DB.prepare("SELECT * FROM channels ORDER BY id ASC").all();
      if (results && results.length > 0) {
        return new Response(JSON.stringify({ success: true, source: "d1", data: results }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
        });
      }
    } catch (e) {
      console.warn("D1 query failed, falling back to remote M3U / defaults:", e.message);
    }
  }

  // Nếu chưa lấy được từ D1, tải file M3U từ SOURCE_M3U_URL
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch(SOURCE_M3U_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "CHRTV-OTT/1.0" }
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const m3uContent = await resp.text();
      const parsedChannels = parseM3UContent(m3uContent);
      if (parsedChannels.length > 0) {
        return new Response(JSON.stringify({ success: true, source: "m3u_remote", data: parsedChannels }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }
  } catch (err) {
    console.warn("Failed to fetch M3U playlist:", err.message);
  }

  // Trả về danh sách mặc định nếu tất cả nguồn thất bại
  return new Response(JSON.stringify({ success: true, source: "default_fallback", data: DEFAULT_CHANNELS }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
  });
}

/**
 * Hàm phân tích cú pháp M3U (M3U Parser)
 */
function parseM3UContent(content) {
  const lines = content.split(/\r?\n/);
  const channels = [];
  let currentChannel = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith("#EXTINF:")) {
      currentChannel = {};

      // Parse tvg-id
      const idMatch = line.match(/tvg-id="([^"]+)"/i);
      currentChannel.channel_id = idMatch ? idMatch[1] : `channel_${channels.length + 1}`;

      // Parse tvg-name / name
      const nameMatch = line.match(/tvg-name="([^"]+)"/i);
      const commaIdx = line.lastIndexOf(",");
      const displayName = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : "";
      currentChannel.name = nameMatch ? nameMatch[1] : (displayName || `Kênh ${channels.length + 1}`);

      // Parse tvg-logo
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      currentChannel.logo = logoMatch ? logoMatch[1] : "";

      // Parse group-title
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      currentChannel.group_title = groupMatch ? groupMatch[1] : "Tổng Hợp";

      // Parse catchup-type & catchup-days
      const typeMatch = line.match(/catchup-type="([^"]+)"/i);
      currentChannel.catchup_type = typeMatch ? typeMatch[1] : "append";

      const daysMatch = line.match(/catchup-days="([^"]+)"/i);
      currentChannel.catchup_days = daysMatch ? parseInt(daysMatch[1], 10) : 7;
    } else if (line && !line.startsWith("#") && currentChannel) {
      currentChannel.stream_url = line;
      channels.push(currentChannel);
      currentChannel = null;
    }
  }

  return channels;
}

/**
 * Xử lý Endpoint EPG (/api/epg)
 * Đọc EPG XML, cache kết quả JSON trong Cloudflare KV Storage với TTL 3600s
 */
async function handleEPG(request, env) {
  const KV_KEY = "epg_parsed_data";

  // 1. Kiểm tra Cache từ Cloudflare KV Storage (nếu có binding EPG_KV)
  if (env && env.EPG_KV) {
    try {
      const cachedEPG = await env.EPG_KV.get(KV_KEY, { type: "json" });
      if (cachedEPG) {
        return new Response(JSON.stringify({ success: true, source: "kv_cache", data: cachedEPG }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
        });
      }
    } catch (e) {
      console.warn("KV Cache lookup failed:", e.message);
    }
  }

  // 2. Fetch EPG XML từ nguồn gốc
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(SOURCE_EPG_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "CHRTV-OTT/1.0" }
    });
    clearTimeout(timeoutId);

    if (resp.ok) {
      const xmlText = await resp.text();
      const parsedData = parseEPGXmlString(xmlText);

      // Lưu kết quả vào KV Storage với TTL 3600 giây (1 giờ)
      if (env && env.EPG_KV && parsedData) {
        try {
          await env.EPG_KV.put(KV_KEY, JSON.stringify(parsedData), { expirationTtl: 3600 });
        } catch (kvErr) {
          console.warn("KV Put error:", kvErr.message);
        }
      }

      return new Response(JSON.stringify({ success: true, source: "xml_parsed", data: parsedData }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
      });
    }
  } catch (err) {
    console.warn("Failed to fetch EPG XML:", err.message);
  }

  // Trả về EPG Mock nếu fetch EPG thất bại
  const mockEPG = generateMockEPG();
  return new Response(JSON.stringify({ success: true, source: "mock_fallback", data: mockEPG }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" }
  });
}

/**
 * Parse XML EPG String đơn giản, hiệu quả cho Cloudflare Workers
 */
function parseEPGXmlString(xmlText) {
  const channels = {};
  const programmes = [];

  // Parse <channel id="...">
  const channelRegex = /<channel\s+id="([^"]+)">[\s\S]*?<display-name[^>]*>([^<]+)<\/display-name>/g;
  let chMatch;
  while ((chMatch = channelRegex.exec(xmlText)) !== null) {
    channels[chMatch[1]] = { id: chMatch[1], name: chMatch[2] };
  }

  // Parse <programme start="..." stop="..." channel="...">
  const progRegex = /<programme\s+start="([^"]+)"\s+stop="([^"]+)"\s+channel="([^"]+)">[\s\S]*?<title[^>]*>([^<]+)<\/title>(?:[\s\S]*?<desc[^>]*>([^<]+)<\/desc>)?/g;
  let pMatch;
  while ((pMatch = progRegex.exec(xmlText)) !== null) {
    programmes.push({
      start: pMatch[1],
      stop: pMatch[2],
      channel: pMatch[3],
      title: pMatch[4],
      desc: pMatch[5] || "Không có mô tả chi tiết."
    });
  }

  return { channels, programmes };
}

/**
 * Tạo Mock EPG dữ liệu chuẩn 7 ngày cho các kênh cơ bản
 */
function generateMockEPG() {
  const channelIds = ["VTV1.vn", "VTV3.vn", "VTV5.vn", "HTV7.vn", "HTV9.vn", "ON_SPORTS.vn", "FALLBACK_LIVE"];
  const programmes = [];
  const now = new Date();
  
  // Tạo chương trình cho 7 ngày qua + hôm nay
  for (let dayOffset = -6; dayOffset <= 1; dayOffset++) {
    const baseDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    
    channelIds.forEach((chId) => {
      // 12 slot phát sóng mỗi ngày (mỗi slot 2 giờ)
      for (let hour = 0; hour < 24; hour += 2) {
        const startTime = new Date(baseDate);
        startTime.setHours(hour, 0, 0, 0);

        const endTime = new Date(baseDate);
        endTime.setHours(hour + 2, 0, 0, 0);

        const startStr = formatEPGTimestamp(startTime);
        const stopStr = formatEPGTimestamp(endTime);

        let title = `Thời Sự & Tin Tức ${hour}:00`;
        let desc = "Bản tin cập nhật tin tức thời sự hot nhất trong ngày trên CHRTV.";

        if (chId.includes("VTV3")) {
          title = hour % 4 === 0 ? `Game Show Giải Trí Hot` : `Phim Truyền Hình CHRTV`;
        } else if (chId.includes("SPORTS")) {
          title = `Trực Tiếp Bóng Đá / Thể Thao Đỉnh Cao (${hour}:00)`;
        }

        programmes.push({
          channel: chId,
          start: startStr,
          stop: stopStr,
          title: title,
          desc: desc
        });
      }
    });
  }

  return {
    channels: channelIds.reduce((acc, id) => {
      acc[id] = { id, name: id };
      return acc;
    }, {}),
    programmes
  };
}

function formatEPGTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const YYYY = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${YYYY}${MM}${DD}${hh}${mm}${ss} +0700`;
}

/**
 * Xử lý Endpoint Proxy Stream (/api/proxy)
 * Chặn CORS, ẩn URL thực, Tự động Retry & Fallback khi stream chính bị lỗi (4xx/5xx/Network Error)
 */
async function handleProxy(request, env) {
  const urlParams = new URL(request.url).searchParams;
  const targetUrl = urlParams.get("url");

  if (!targetUrl) {
    return new Response("Missing 'url' parameter", { status: 400, headers: CORS_HEADERS });
  }

  // Thử fetch URL mục tiêu tối đa 3 lần (Retry logic)
  let fetchErr = null;
  let targetResp = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      targetResp = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 CHRTV-OTT/1.0",
          "Accept": "*/*",
          "Referer": new URL(targetUrl).origin
        }
      });
      clearTimeout(timeoutId);

      if (targetResp && targetResp.ok) {
        break; // Tải luồng thành công!
      }
    } catch (e) {
      fetchErr = e;
      console.warn(`Attempt ${attempt} failed for ${targetUrl}:`, e.message);
    }
  }

  // Nếu luồng mục tiêu thất bại hoặc trả về HTTP Status lỗi (4xx/5xx) -> Tự động Chuyển sang Fallback Stream
  if (!targetResp || !targetResp.ok) {
    console.warn("Main stream failed. Redirecting/Proxying Fallback Stream:", FALLBACK_STREAM_URL);
    try {
      const fallbackResp = await fetch(FALLBACK_STREAM_URL, {
        headers: { "User-Agent": "CHRTV-OTT/1.0" }
      });
      if (fallbackResp.ok) {
        const responseHeaders = new Headers(fallbackResp.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));
        return new Response(fallbackResp.body, {
          status: fallbackResp.status,
          headers: responseHeaders
        });
      }
    } catch (fbErr) {
      console.error("Fallback stream fetch error:", fbErr.message);
    }
  }

  // Nếu luồng chính thành công, trả về stream cùng CORS Headers
  const responseHeaders = new Headers(targetResp.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v));
  return new Response(targetResp.body, {
    status: targetResp.status,
    headers: responseHeaders
  });
}

/**
 * Xử lý Endpoint Favorites (/api/favorites)
 */
async function handleFavorites(request, env) {
  if (!env || !env.DB) {
    return new Response(JSON.stringify({ success: true, favorites: [] }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT channel_id FROM user_favorites WHERE user_id = 'default_user'").all();
    const favorites = results ? results.map(r => r.channel_id) : [];
    return new Response(JSON.stringify({ success: true, favorites }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const { channel_id } = body;
    if (channel_id) {
      await env.DB.prepare("INSERT OR IGNORE INTO user_favorites (user_id, channel_id) VALUES ('default_user', ?)").bind(channel_id).run();
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  if (request.method === "DELETE") {
    const body = await request.json();
    const { channel_id } = body;
    if (channel_id) {
      await env.DB.prepare("DELETE FROM user_favorites WHERE user_id = 'default_user' AND channel_id = ?").bind(channel_id).run();
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
}

/**
 * Xử lý Endpoint Watch History (/api/history)
 */
async function handleHistory(request, env) {
  if (!env || !env.DB) {
    return new Response(JSON.stringify({ success: true, history: [] }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  if (request.method === "GET") {
    const { results } = await env.DB.prepare("SELECT channel_id, last_position, updated_at FROM watch_history WHERE user_id = 'default_user' ORDER BY updated_at DESC LIMIT 20").all();
    return new Response(JSON.stringify({ success: true, history: results || [] }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  if (request.method === "POST") {
    const body = await request.json();
    const { channel_id, last_position } = body;
    if (channel_id) {
      await env.DB.prepare(
        "INSERT INTO watch_history (user_id, channel_id, last_position, updated_at) VALUES ('default_user', ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id, channel_id) DO UPDATE SET last_position = excluded.last_position, updated_at = CURRENT_TIMESTAMP"
      ).bind(channel_id, last_position || 0).run();
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
}
