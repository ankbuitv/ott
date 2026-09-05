/**
 * Geo theo vị trí người xem — dùng để đổi poster/khối phim theo quốc gia.
 *
 * Thứ tự ưu tiên:
 *   1. Override tay (người dùng chọn quốc gia trong app)  → localStorage `chrtv_region_override`
 *   2. Cache kết quả Cloudflare (TTL 12h)                 → localStorage `chrtv_geo_country`
 *   3. Gọi /api/geo — Worker trả request.cf.country (geo theo IP của Cloudflare)
 *   4. Fallback cuối: đoán từ timezone/ngôn ngữ trình duyệt (detectCountry)
 */
import { API_BASE } from './config';
import { detectCountry } from '../i18n/translations';

const GEO_CACHE_KEY = 'chrtv_geo_country';   // { cc, ts }
const OVERRIDE_KEY = 'chrtv_region_override';
const GEO_TTL = 12 * 3600 * 1000; // 12h

const CC_RE = /^[A-Z]{2}$/;

export function getManualCountry() {
  try {
    const v = (localStorage.getItem(OVERRIDE_KEY) || '').toUpperCase();
    return CC_RE.test(v) ? v : '';
  } catch { return ''; }
}

export function setManualCountry(cc) {
  try {
    if (cc && CC_RE.test(cc)) localStorage.setItem(OVERRIDE_KEY, cc);
    else localStorage.removeItem(OVERRIDE_KEY);
  } catch {}
}

function readCache() {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return '';
    const { cc, ts } = JSON.parse(raw);
    if (CC_RE.test(cc || '') && Date.now() - (ts || 0) < GEO_TTL) return cc;
    localStorage.removeItem(GEO_CACHE_KEY);
  } catch {}
  return '';
}

function writeCache(cc) {
  try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ cc, ts: Date.now() })); } catch {}
}

// Lấy quốc gia tức thời (đồng bộ) — cache/override/timenone-heuristic, KHÔNG gọi mạng.
// Dùng cho lần render đầu để UI không nhấp nháy.
export function currentCountry() {
  return getManualCountry() || readCache() || detectCountry();
}

// Lấy quốc gia đầy đủ: override → cache → /api/geo (server, geo theo IP) → timezone
export async function resolveCountry() {
  const manual = getManualCountry();
  if (manual) return manual;

  const cached = readCache();
  if (cached) return cached;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`${API_BASE}/api/geo`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const cc = (data?.country || '').toUpperCase();
      if (CC_RE.test(cc)) {
        writeCache(cc);
        return cc;
      }
    }
  } catch {}

  // Fallback: đoán từ timezone — KHÔNG cache để khi deploy worker có /api/geo
  // thì lần truy cập sau đã dùng geo IP thật.
  return detectCountry();
}
