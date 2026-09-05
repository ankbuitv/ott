import { API_BASE } from "./config";
import { authHeaders } from "./session";

const BASE_WORKER_URL = API_BASE;

export const DEFAULT_FALLBACK_STREAM = "http://bore.pub:30113/hls/index.m3u8";
export const CHRTV_LOGO_URL = "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png";

export async function fetchChannels() {
  try {
    const res = await fetch(`${BASE_WORKER_URL}/api/playlist`, { headers: { Accept: "application/json", ...authHeaders() } });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data && json.data.length > 0) return json.data;
    }
  } catch (err) {
    console.warn("Worker Playlist error:", err.message);
  }

  return [
    { channel_id: "VTV1.vn", name: "VTV1 HD", logo: "https://vtv.sub.id/images/vtv1.png", group_title: "VTV", stream_url: "https://vtv.sub.id/vtv1/index.m3u8", catchup_type: "append", catchup_days: 7 },
    { channel_id: "VTV3.vn", name: "VTV3 HD", logo: "https://vtv.sub.id/images/vtv3.png", group_title: "VTV", stream_url: "https://vtv.sub.id/vtv3/index.m3u8", catchup_type: "append", catchup_days: 7 },
    { channel_id: "VTV5.vn", name: "VTV5 HD", logo: "https://vtv.sub.id/images/vtv5.png", group_title: "VTV", stream_url: "https://vtv.sub.id/vtv5/index.m3u8", catchup_type: "append", catchup_days: 7 },
    { channel_id: "HTV7.vn", name: "HTV7 HD", logo: "https://vtv.sub.id/images/htv7.png", group_title: "HTV", stream_url: "https://vtv.sub.id/htv7/index.m3u8", catchup_type: "append", catchup_days: 7 },
    { channel_id: "HTV9.vn", name: "HTV9 HD", logo: "https://vtv.sub.id/images/htv9.png", group_title: "HTV", stream_url: "https://vtv.sub.id/htv9/index.m3u8", catchup_type: "append", catchup_days: 7 },
    { channel_id: "ON_SPORTS.vn", name: "ON Sports+", logo: "https://vtv.sub.id/images/onsports.png", group_title: "Thể Thao", stream_url: "https://vtv.sub.id/onsports/index.m3u8", catchup_type: "append", catchup_days: 7 },
    { channel_id: "FALLBACK_LIVE", name: "CHRTV Stream Dự Phòng", logo: CHRTV_LOGO_URL, group_title: "Dự Phòng", stream_url: DEFAULT_FALLBACK_STREAM, catchup_type: "default", catchup_days: 7 }
  ];
}

export async function fetchEPGData() {
  try {
    const headers = { Accept: "application/json", ...authHeaders() };
    const res = await fetch(`${BASE_WORKER_URL}/api/epg`, { headers });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data) {
        // Nếu worker trả dữ liệu nhưng KHÔNG có chương trình nào (mock cũ/EPG lỗi),
        // thử tải trực tiếp XMLTV từ trình duyệt để vẫn hiển thị EPG.
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
  // Worker không truy cập được — thử tải thẳng từ nguồn XMLTV công cộng
  const direct = await fetchDirectEPG();
  if (direct) return direct;
  return null;
}

// Fallback: tải EPG trực tiếp từ epg.io.vn (và các nguồn thay thế) ngay trên trình duyệt
async function fetchDirectEPG() {
  const sources = [
    "https://epg.io.vn/epgc.xml",
    "https://lichphatsong.io.vn/epgc.xml",
  ];
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

// Parse XMLTV (epg.io.vn / lichphatsong.io.vn format) client-side
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
      // Server trả về mảng object {channel_id,...} — app dùng mảng id nên phải map lại
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
