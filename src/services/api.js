const BASE_WORKER_URL = window.location.origin;

export const DEFAULT_FALLBACK_STREAM = "http://bore.pub:30113/hls/index.m3u8";
export const CHRTV_LOGO_URL = "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png";

export async function fetchChannels() {
  try {
    const res = await fetch(`${BASE_WORKER_URL}/api/playlist`, { headers: { Accept: "application/json" } });
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
    const res = await fetch(`${BASE_WORKER_URL}/api/epg`, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data) return json.data;
    }
  } catch (err) {
    console.warn("Worker EPG error:", err.message);
  }
  return null;
}

export function getProxyStreamUrl(streamUrl) {
  if (!streamUrl) return DEFAULT_FALLBACK_STREAM;
  if (streamUrl === DEFAULT_FALLBACK_STREAM) return DEFAULT_FALLBACK_STREAM;
  return `${BASE_WORKER_URL}/api/proxy?url=${encodeURIComponent(streamUrl)}`;
}

export async function fetchFavorites() {
  try {
    const res = await fetch(`${BASE_WORKER_URL}/api/favorites`);
    if (res.ok) {
      const json = await res.json();
      if (json && json.favorites) return json.favorites;
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
      headers: { "Content-Type": "application/json" },
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: channelId, last_position: position })
    });
  } catch (e) {}
}
