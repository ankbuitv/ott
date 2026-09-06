import { API_BASE } from './config';

const CACHE_KEY = 'chrtv_events';
const CACHE_TTL = 5 * 60 * 1000; // 5 phút

// Sự kiện/banner do admin quản lý → hiển thị trên trang chủ
export async function fetchEvents() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c.at && Date.now() - c.at < CACHE_TTL && Array.isArray(c.events)) return c.events;
    }
  } catch {}
  try {
    const r = await fetch(`${API_BASE}/api/events`);
    const d = await r.json();
    const events = d.events || [];
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), events })); } catch {}
    return events;
  } catch {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw).events || [];
    } catch {}
    return [];
  }
}
