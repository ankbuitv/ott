/**
 * CHRTV - EPG channel matching utilities
 * Real EPG XML sources often use channel IDs that differ slightly from the
 * M3U tvg-id (e.g. "VTV1" vs "VTV1.vn", or "vtv1.vn" vs "VTV1.vn").
 * This helper tries several strategies so EPG data shows up reliably.
 *
 * ⚡ HIỆU NĂNG (fix lag web 2026-09): trước đây mỗi lần gọi hàm này là quét
 * TOÀN BỘ mảng programmes tới 3 lần (filter) + sort + parse ngày tháng cho hàng
 * chục nghìn bản ghi — mà nó được gọi ngay trong render của App (player mở,
 * toast, hover…) nên UI đơ liên tục. Giờ: đánh chỉ mục 1 LẦN cho mỗi mảng EPG
 * (WeakMap cache) — tra cứu sau đó là O(1) theo key + quét nhỏ trong kênh đó.
 */
import { parseEpgDate } from './dateUtils';

function normalize(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\u00e0-\u00ff\u0100-\u017f]+/g, '') // strip punctuation/dots/dashes/spaces
    .trim();
}

// ---- Chỉ mục EPG: build 1 lần / mảng programmes, dùng lại cho mọi tra cứu ----
// { byExact: Map("VTV1.vn" -> progs[]), byNorm: Map("vtv1vn" -> progs[]),
//   byName: Map(normName -> progs[]), nameKeys: string[] }
// Mỗi bucket đã SORT theo start và gắn sẵn timestamp đã parse (_ts/_te).
const _idxCache = new WeakMap();

function _parsed(p) {
  // parse 1 lần, cache ngay trên object (không đổi JSON gốc ngoài thêm field)
  if (p._ts === undefined) {
    p._ts = parseEpgDate(p.start);
    p._te = parseEpgDate(p.stop);
  }
  return p;
}

function buildEpgIndex(programmes) {
  const byExact = new Map();
  const byNorm = new Map();
  const byName = new Map();
  const put = (m, k, v) => {
    const cur = m.get(k);
    if (cur) cur.push(v); else m.set(k, [v]);
  };
  for (let i = 0; i < programmes.length; i++) {
    const p = programmes[i];
    _parsed(p);
    if (p.channel) put(byExact, p.channel, p);
    const nc = normalize(p.channel);
    if (nc) put(byNorm, nc, p);
    const nn = normalize(p.display_name || p.channel);
    if (nn) put(byName, nn, p); // gom mọi chương trình cùng display-name vào 1 bucket
  }
  const sortByStart = (arr) => arr.sort((a, b) => a._ts - b._ts);
  byExact.forEach(sortByStart);
  byNorm.forEach(sortByStart);
  byName.forEach(sortByStart);
  return { byExact, byNorm, byName, nameKeys: [...byName.keys()] };
}

function epgIndexFor(programmes) {
  let idx = _idxCache.get(programmes);
  if (!idx) {
    idx = buildEpgIndex(programmes);
    _idxCache.set(programmes, idx);
  }
  return idx;
}

/**
 * Find the currently-airing (and optionally next) programme for a channel.
 * @param {Array} programmes - EPG programmes list
 * @param {Object} channel - channel object with channel_id + name
 * @param {Date} [now] - reference time (defaults to new Date())
 * @returns {{now: Object|null, next: Object|null}}
 */
export function findEpgForChannel(programmes, channel, now = new Date()) {
  if (!programmes || !Array.isArray(programmes) || !channel) return { now: null, next: null, prev: null };

  const idx = epgIndexFor(programmes);
  const chId = normalize(channel.channel_id);
  const chName = normalize(channel.name);

  // 1) exact ID match -> 2) normalized ID match (O(1) nhờ chỉ mục)
  let progs = (chId && idx.byNorm.get(chId)) || (channel.channel_id && idx.byExact.get(channel.channel_id)) || null;
  // 3) name match (EPG display-name vs channel name) — chỉ quét DANH SÁCH TÊN (vài trăm),
  //    không còn quét toàn bộ programmes như trước
  if ((!progs || !progs.length) && chName) {
    for (const nk of idx.nameKeys) {
      if (nk && (nk === chName || nk.includes(chName) || chName.includes(nk))) {
        progs = idx.byName.get(nk);
        break;
      }
    }
  }
  if (!progs || !progs.length) return { now: null, next: null, prev: null };

  let epgNow = null, epgNext = null, epgPrev = null;
  for (let i = 0; i < progs.length; i++) {
    const p = progs[i];
    if (p._ts <= now && p._te >= now) {
      epgNow = p;
      epgNext = progs[i + 1] || null;
      epgPrev = progs[i - 1] || null;
      break;
    }
    if (p._ts > now && !epgNext) epgNext = p;
  }
  // If nothing is airing right now (gap), pick closest programme
  if (!epgNow) {
    for (const p of progs) {
      if (p._te <= now) epgNow = p;
      else break;
    }
    if (!epgNow && progs.length) epgNow = progs[0];
  }
  if (!epgPrev && epgNow) {
    const i = progs.indexOf(epgNow);
    if (i > 0) epgPrev = progs[i - 1];
  }
  return { now: epgNow, next: epgNext, prev: epgPrev };
}
