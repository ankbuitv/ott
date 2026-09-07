/**
 * Client dùng chung cho TheSportsDB (v1) + ESPN scoreboard.
 *
 * Vì sao cần file này:
 *  - Trình duyệt KHÔNG gọi thẳng thesportsdb.com được (thiếu CORS header) nên mọi
 *    thứ liên quan tới thể thao phải đi qua proxy cùng origin của Worker
 *    (`/api/sports/tsdb`). Trước đây mỗi chỗ tự gọi một kiểu, có chỗ bắn 3 request
 *    song song cho MỖI lần lấy dữ liệu → Worker quá tải (lỗi 1102) và màn Thể thao
 *    trắng trơn.
 *  - Ở đây: thử lần lượt các nguồn, NHỚ nguồn nào chạy được, cache theo TTL và gộp
 *    các request trùng nhau đang bay.
 */
import { API_BASE } from './config';

export const TSDB_DIRECT = 'https://www.thesportsdb.com/api/v1/json/3';
const ESPN_DIRECT = 'https://site.api.espn.com/apis/site/v2';

// Danh sách nguồn theo thứ tự ưu tiên:
//  0) Proxy Worker cùng origin (production + APK)
//  1) Proxy của vite dev server (`npm run dev`)
//  2) Gọi thẳng TheSportsDB (chỉ được nếu nguồn có CORS)
const TSDB_SOURCES = [
  (file, qs) => `${API_BASE}/api/sports/tsdb?file=${encodeURIComponent(file)}${qs ? `&${qs}` : ''}`,
  (file, qs) => `/tsdb/${file}${qs ? `?${qs}` : ''}`,
  (file, qs) => `${TSDB_DIRECT}/${file}${qs ? `?${qs}` : ''}`,
];

const ESPN_SOURCES = [
  (slug, qs) => `${API_BASE}/api/sports/espn?league=${encodeURIComponent(slug)}${qs ? `&${qs}` : ''}`,
  (slug, qs) => `/espn/sports/soccer/${slug}/scoreboard${qs ? `?${qs}` : ''}`,
  (slug, qs) => `${ESPN_DIRECT}/sports/soccer/${slug}/scoreboard${qs ? `?${qs}` : ''}`,
];

let tsdbSourceIdx = 0;
let espnSourceIdx = 0;

async function getJSON(url, timeoutMs = 10000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = await r.text();
    // SPA fallback của Worker trả về index.html (200) cho path lạ → phải coi là lỗi.
    if (!/^\s*[[{]/.test(txt)) throw new Error('NOT_JSON');
    return JSON.parse(txt);
  } finally {
    clearTimeout(to);
  }
}

// ---- cache + gộp request trùng ------------------------------------------------
const mem = new Map();      // key -> { at, data }
const inflight = new Map(); // key -> Promise

function fromCache(key, ttl) {
  const c = mem.get(key);
  if (c && Date.now() - c.at < ttl) return c.data;
  return null;
}

export function tsdbBust(prefix = '') {
  if (!prefix) { mem.clear(); return; }
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
}

/**
 * Gọi 1 file API của TheSportsDB. Ném lỗi nếu MỌI nguồn đều hỏng
 * (để UI phân biệt được "lỗi mạng" và "không có dữ liệu").
 */
export function tsdbGet(file, params = {}, { ttl = 10 * 60 * 1000, fresh = false, timeout = 10000 } = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString();
  const key = `tsdb:${file}?${qs}`;

  if (!fresh) {
    const hit = fromCache(key, ttl);
    if (hit) return Promise.resolve(hit);
  }
  const flying = inflight.get(key);
  if (flying) return flying;

  const run = (async () => {
    let lastErr = null;
    // Bắt đầu từ nguồn đã biết là chạy được, rồi mới thử các nguồn còn lại.
    const order = TSDB_SOURCES.map((_, i) => (tsdbSourceIdx + i) % TSDB_SOURCES.length);
    for (const i of order) {
      try {
        const data = await getJSON(TSDB_SOURCES[i](file, qs), timeout);
        if (data && typeof data === 'object' && !data.error) {
          tsdbSourceIdx = i;
          mem.set(key, { at: Date.now(), data });
          return data;
        }
        lastErr = new Error(data?.error || 'EMPTY');
      } catch (e) {
        lastErr = e;
      }
    }
    // Hết nguồn: trả cache cũ (nếu có) để UI không trống trơn.
    const stale = mem.get(key);
    if (stale) return stale.data;
    throw lastErr || new Error('TSDB_UNAVAILABLE');
  })().finally(() => inflight.delete(key));

  inflight.set(key, run);
  return run;
}

/** Như tsdbGet nhưng không bao giờ ném lỗi — trả {} khi hỏng. */
export function tsdbSafe(file, params = {}, opts = {}) {
  return tsdbGet(file, params, opts).catch(() => ({}));
}

/** ESPN scoreboard (dự phòng cho các giải TheSportsDB cập nhật chậm). */
export async function espnScoreboard(slug, dates = '') {
  const qs = dates ? `dates=${dates}` : '';
  const key = `espn:${slug}?${qs}`;
  const hit = fromCache(key, 60 * 1000);
  if (hit) return hit;
  const order = ESPN_SOURCES.map((_, i) => (espnSourceIdx + i) % ESPN_SOURCES.length);
  for (const i of order) {
    try {
      const d = await getJSON(ESPN_SOURCES[i](slug, qs), 10000);
      if (d && Array.isArray(d.events)) {
        espnSourceIdx = i;
        mem.set(key, { at: Date.now(), data: d });
        return d;
      }
    } catch { /* thử nguồn kế */ }
  }
  return null;
}
