import { API_BASE } from "./config";
import { authHeaders } from "./session";

const BASE_WORKER_URL = API_BASE;

export const DEFAULT_FALLBACK_STREAM = "http://bore.pub:30113/hls/index.m3u8";
export const CHRTV_LOGO_URL = "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png";

/**
 * Danh sách kênh là thứ duy nhất mà nếu thiếu thì app coi như "crash" (trắng màn hình),
 * nên nó có 3 lớp phòng thủ:
 *   1. timeout 12s — Worker đang import lại M3U (lạnh D1) có thể treo hàng chục giây,
 *      trước đây fetch không huỷ ⇒ app ngồi chờ vô hạn, người dùng tưởng chết app;
 *   2. cache localStorage danh sách LẦN CUỐI THÀNH CÔNG — Worker 5xx / hết quota / mất mạng
 *      vẫn còn kênh mà xem, thay vì rớt xuống kênh dự phòng;
 *   3. kênh dự phòng công khai — chỉ khi cả hai bước trên trắng.
 */
const CHANNELS_CACHE_KEY = "chrtv_channels_v1";
const CHANNELS_CACHE_MAX_BYTES = 1_500_000; // playlist công khai không kèm stream_url nên chỉ vài trăm KB

function readChannelsCache() {
  try {
    const o = JSON.parse(localStorage.getItem(CHANNELS_CACHE_KEY) || "null");
    if (!o || !Array.isArray(o.data) || o.data.length === 0) return null;
    return o;
  } catch {
    return null;
  }
}

function writeChannelsCache(data) {
  try {
    const json = JSON.stringify({ t: Date.now(), n: data.length, data });
    if (json.length > CHANNELS_CACHE_MAX_BYTES) return;
    localStorage.setItem(CHANNELS_CACHE_KEY, json);
  } catch {
    /* hết quota localStorage — không sao, lần sau ghi tiếp */
  }
}

/** WebView Android/TV cũ chưa có AbortSignal.timeout nên tự quản. */
async function fetchWithTimeout(url, opts, ms) {
  let ctrl;
  let timer;
  try {
    ctrl = new AbortController();
    timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, ms);
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchChannels() {
  try {
    const res = await fetchWithTimeout(`${BASE_WORKER_URL}/api/playlist`, { headers: { Accept: "application/json", ...authHeaders() } }, 12000);
    if (res.ok) {
      const json = await res.json();
      // LƯU Ý: playlist công khai KHÔNG còn `stream_url` (chống rip link gốc).
      // Kênh có cờ `protected` => phát bằng /api/stream/token (xem services/streamGuard.js).
      if (json && json.data && json.data.length > 0) {
        writeChannelsCache(json.data);
        return json.data;
      }
    }
  } catch (err) {
    console.warn("Worker Playlist error:", err.message);
  }

  const cached = readChannelsCache();
  if (cached) {
    const ageMin = Math.max(0, Math.round((Date.now() - (cached.t || 0)) / 60000));
    console.warn(`fetchChannels: dùng ${cached.data.length} kênh đã cache (${ageMin} phút trước)`);
    return cached.data;
  }

  // Fallback offline: CHỈ kênh dự phòng công khai (không chứa link kênh premium).
  return [
    {
      channel_id: "FALLBACK_LIVE",
      name: "CHRTV PLAY Dự Phòng",
      logo: CHRTV_LOGO_URL,
      group_title: "Dự Phòng",
      stream_url: DEFAULT_FALLBACK_STREAM,
      catchup_type: "default",
      catchup_days: 7,
    },
  ];
}

export async function fetchEPGData() {
  try {
    const headers = { Accept: "application/json", ...authHeaders() };
    const res = await fetch(`${BASE_WORKER_URL}/api/epg`, { headers });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        if (!json.data.programmes || json.data.programmes.length === 0) {
          const direct = await fetchDirectEPG();
          if (direct) return direct;
        }
        return json.data;
      }
    }
  } catch (err) {
    console.warn("Worker EPG error:", err.message);
  }
  const direct = await fetchDirectEPG();
  if (direct) return direct;
  return null;
}

async function fetchDirectEPG() {
  const sources = [];
  try {
    const custom = JSON.parse(localStorage.getItem("chrtv_settings") || "{}")?.epgSource;
    if (custom && /^https?:\/\//i.test(custom)) sources.push(custom);
  } catch {}
  sources.push("https://epg.io.vn/epgc.xml", "https://lichphatsong.io.vn/epgc.xml");
  for (const url of sources) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = parseXMLTV(await res.text());
      if (data.programmes && data.programmes.length > 0) return data;
    } catch (e) {
      console.warn("Direct EPG fetch failed:", url, e.message);
    }
  }
  return null;
}

function parseXMLTV(xml) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML parse error");
  const channels = {};
  doc.querySelectorAll("channel").forEach(ch => {
    const dn = ch.querySelector("display-name");
    if (dn) channels[ch.getAttribute("id")] = { id: ch.getAttribute("id"), name: dn.textContent };
  });
  const programmes = [];
  doc.querySelectorAll("programme").forEach(p => {
    const t = p.querySelector("title");
    const d = p.querySelector("desc");
    programmes.push({
      start: p.getAttribute("start"),
      stop: p.getAttribute("stop"),
      channel: p.getAttribute("channel"),
      title: t ? t.textContent : "Chương trình",
      desc: d ? d.textContent : "",
    });
  });
  return { channels, programmes };
}

export async function fetchFavorites() {
  try {
    const res = await fetch(`${BASE_WORKER_URL}/api/favorites`, { headers: authHeaders() });
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.favorites) && json.favorites.length > 0) {
        const ids = json.favorites.map(f => (typeof f === "string" ? f : f.channel_id)).filter(Boolean);
        localStorage.setItem("chrtv_favorites", JSON.stringify(ids));
        return ids;
      }
    }
  } catch (e) {}
  const saved = localStorage.getItem("chrtv_favorites");
  return saved ? JSON.parse(saved) : [];
}

export async function toggleFavoriteApi(channelId, isFav) {
  const saved = localStorage.getItem("chrtv_favorites");
  let favs = saved ? JSON.parse(saved) : [];
  if (isFav) {
    if (!favs.includes(channelId)) favs.push(channelId);
  } else {
    favs = favs.filter(id => id !== channelId);
  }
  localStorage.setItem("chrtv_favorites", JSON.stringify(favs));

  try {
    await fetch(`${BASE_WORKER_URL}/api/favorites`, {
      method: isFav ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ channel_id: channelId })
    });
  } catch (e) {}
  return favs;
}

export async function recordWatchHistory(channelId, position = 0) {
  const saved = localStorage.getItem("chrtv_history");
  let history = saved ? JSON.parse(saved) : [];
  history = history.filter(item => item.channel_id !== channelId);
  history.unshift({ channel_id: channelId, position, updated_at: new Date().toISOString() });
  if (history.length > 30) history = history.slice(0, 30);
  localStorage.setItem("chrtv_history", JSON.stringify(history));

  try {
    await fetch(`${BASE_WORKER_URL}/api/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ channel_id: channelId, last_position: position })
    });
  } catch (e) {}
}
