import { API_BASE } from './config';

// TheSportsDB key miễn phí (lịch + kết quả). BXH thử lookuptable, lỗi thì thôi.
const TSB = 'https://www.thesportsdb.com/api/v1/json/3';
const OLB = 'https://api.openligadb.de';

export const LEAGUES = [
  { id: 'epl', name: 'Ngoại hạng Anh', short: 'EPL', tsdb: '4328', flag: '🇬🇧' },
  { id: 'laliga', name: 'La Liga', short: 'LaLiga', tsdb: '4335', flag: '🇪🇸' },
  { id: 'seriea', name: 'Serie A', short: 'Serie A', tsdb: '4332', flag: '🇮🇹' },
  { id: 'bundesliga', name: 'Bundesliga', short: 'Bundesliga', tsdb: '4331', flag: '🇩🇪', olb: 'bl1' },
  { id: 'ligue1', name: 'Ligue 1', short: 'Ligue 1', tsdb: '4334', flag: '🇫🇷' },
  { id: 'ucl', name: 'Cúp C1 châu Âu', short: 'UCL', tsdb: '4480', flag: '🏆', cup: true },
  { id: 'vleague1', name: 'V.League 1', short: 'V.League 1', tsdb: '4803', flag: '🇻🇳' },
  { id: 'vleague2', name: 'V.League 2', short: 'V.League 2', tsdb: '5214', flag: '🇻🇳' },
  { id: 'nba', name: 'NBA — Bóng rổ Mỹ', short: 'NBA', tsdb: '4387', flag: '🏀' },
];

// Mùa giải hiện tại: từ tháng 7 tính mùa mới (2026-2027)
export function currentSeason() {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
export function currentSeasonShort() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

async function getJSON(url, timeoutMs = 12000) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(to);
  }
}

const memCache = new Map(); // key -> {at, data}
const TTL = 10 * 60 * 1000;
function cached(key, loader, ttlMs = TTL) {
  const c = memCache.get(key);
  if (c && Date.now() - c.at < ttlMs) return Promise.resolve(c.data);
  return loader().then(d => { memCache.set(key, { at: Date.now(), data: d }); return d; });
}

// Timestamp sự kiện (strTimestamp UTC hoặc dateEvent+strTime) -> ms; 0 nếu không đọc được
function tsOfEvent(ev) {
  try {
    if (ev.strTimestamp) { const d = new Date(/z$/i.test(ev.strTimestamp) ? ev.strTimestamp : ev.strTimestamp + 'Z'); if (!isNaN(d.getTime())) return d.getTime(); }
    if (ev.dateEvent) { const d = new Date(`${ev.dateEvent}T${ev.strTime || '00:00:00'}`); if (!isNaN(d.getTime())) return d.getTime(); }
  } catch {}
  return 0;
}

// Trạng thái sự kiện TheSportsDB: NS = chưa đá, FT/AOT = hết giờ, số/ký hiệu khác = ĐANG ĐÁ
const NOT_LIVE = new Set(['NS', 'FT', 'AOT', 'POSTPONED', 'CANCELED', 'CANCELLED', 'ABANDONED', '']);
export function eventIsLive(ev) {
  const s = String(ev?.strStatus || '').trim().toUpperCase();
  return !NOT_LIVE.has(s) && ev?.strPostponed !== 'yes';
}
export function eventIsPostponed(ev) {
  return ev?.strPostponed === 'yes' || /postpon|cancel/i.test(String(ev?.strStatus || ''));
}

// Lịch (5 tháng tới) + kết quả + BXH 1 giải.
// Opts: { fresh: true } -> BỎ cache, luôn lấy dữ liệu mới nhất từ API (tự cập nhật).
export function fetchLeague(league, { fresh = false } = {}) {
  const season = currentSeason();
  const key = `league_${league.id}_${season}`;
  if (fresh) {
    // ghi đè cache bằng dữ liệu mới rồi trả về
    return loadLeagueData(league, season).then(d => { memCache.set(key, { at: Date.now(), data: d }); return d; })
      .catch(() => {
        // API lỗi (mạng/chưa có dữ liệu mùa mới) -> dùng cache cũ nếu còn
        const c = memCache.get(key);
        if (c) return c.data;
        throw new Error('SPORTS_FETCH_FAILED');
      });
  }
  return cached(key, () => loadLeagueData(league, season));
}

async function loadLeagueData(league, season) {
  // Lịch cả mùa → lọc 150 ngày tới (5 tháng), đã đá → kết quả
  const seasonEvts = await (async () => {
    try {
      const d = await getJSON(`${TSB}/eventsseason.php?id=${league.tsdb}&s=${season}`);
      return Array.isArray(d.events) ? d.events : [];
    } catch { return []; }
  })();
  const now = Date.now();
  const horizon = now + 150 * 24 * 3600 * 1000; // 5 tháng
  let next = [], past = [];
  if (seasonEvts.length) {
    const withTs = seasonEvts.map(ev => ({ ev, ts: tsOfEvent(ev) })).filter(x => x.ts > 0);
    next = withTs.filter(x => x.ts >= now - 3 * 3600 * 1000 && x.ts <= horizon).sort((a, b) => a.ts - b.ts).slice(0, 30).map(x => x.ev);
    past = withTs.filter(x => x.ts < now - 3 * 3600 * 1000).sort((a, b) => b.ts - a.ts).slice(0, 15).map(x => x.ev);
  } else {
    // Fallback endpoint cũ khi eventsseason lỗi
    const [n2, p2] = await Promise.all([
      getJSON(`${TSB}/eventsnextleague.php?id=${league.tsdb}`).then(d => d.events || []).catch(() => []),
      getJSON(`${TSB}/eventspastleague.php?id=${league.tsdb}`).then(d => d.events || []).catch(() => []),
    ]);
    next = n2; past = p2;
  }
  const [table] = await Promise.all([
    // BXH: thử TheSportsDB trước, lỗi thì OpenLigaDB (Bundesliga)
    (async () => {
      if (!league.cup) {
        try {
          const d = await getJSON(`${TSB}/lookuptable.php?id=${league.tsdb}&s=${season}`);
          if (d && Array.isArray(d.table) && d.table.length) {
            return d.table.map(r => ({
              name: r.strTeam, badge: r.strTeamBadge,
              played: +r.intPlayed || 0, won: +r.intWin || 0, draw: +r.intDraw || 0, lost: +r.intLoss || 0,
              gf: +r.intGoalsFor || 0, ga: +r.intGoalsAgainst || 0, gd: (+r.intGoalsFor || 0) - (+r.intGoalsAgainst || 0),
              points: +r.intPoints || 0,
            }));
          }
        } catch {}
      }
      if (league.olb) {
        try {
          const rows = await getJSON(`${OLB}/getbltable/${league.olb}/${currentSeasonShort()}`);
          if (Array.isArray(rows) && rows.length) {
            return rows.map(r => ({
              name: r.teamName, badge: r.teamIconUrl,
              played: r.matches || 0, won: r.won || 0, draw: r.draw || 0, lost: r.lost || 0,
              gf: r.goals || 0, ga: r.opponentGoals || 0, gd: r.goalDiff || 0,
              points: r.points || 0,
            }));
          }
        } catch {}
      }
      return [];
    })(),
  ]);
  return { next, past, table };
}

// TỈ SỐ MỚI NHẤT (tự cập nhật): trận ĐANG ĐÁ (strStatus = 1H/HT/72'...) + vừa kết thúc.
// Cache rất ngắn (45s) để poll mỗi phút là có dữ liệu mới thật.
export function fetchLatestResults(league) {
  const season = currentSeason();
  return cached(`latest_${league.id}_${season}`, async () => {
    let evts = [];
    try {
      const d = await getJSON(`${TSB}/eventsseason.php?id=${league.tsdb}&s=${season}`);
      if (Array.isArray(d.events)) evts = d.events;
    } catch {}
    if (!evts.length) {
      try {
        const d = await getJSON(`${TSB}/eventspastleague.php?id=${league.tsdb}`);
        return { live: [], past: (Array.isArray(d.events) ? d.events : []).slice(0, 15) };
      } catch { return { live: [], past: [] }; }
    }
    const now = Date.now();
    const withTs = evts.map(ev => ({ ev, ts: tsOfEvent(ev) })).filter(x => x.ts > 0);
    const live = withTs
      .filter(({ ev, ts }) => eventIsLive(ev) && ts >= now - 5 * 3600 * 1000)
      .sort((a, b) => b.ts - a.ts).slice(0, 15).map(x => x.ev);
    const past = withTs
      .filter(({ ev, ts }) => String(ev.strStatus || '').toUpperCase() === 'FT' && ts < now + 3600 * 1000)
      .sort((a, b) => b.ts - a.ts).slice(0, 15).map(x => x.ev);
    return { live, past };
  }, 45 * 1000);
}

// TỈ SỐ MỚI NHẤT GHÉP TẤT CẢ GIẢI (EPL, La Liga, Serie A, Bundesliga, Ligue 1,
// UCL, V.League 1/2, NBA...) — trận đang đá đứng đầu, sau đó là FT mới nhất.
// Cache ngắn 45s: poll mỗi phút là có dữ liệu mới thật từ API.
export function fetchLatestScoresAll(limit = 8) {
  const season = currentSeason();
  return cached(`latest_all_${season}`, async () => {
    const parts = await Promise.all(LEAGUES.map(l =>
      fetchLatestResults(l).catch(() => ({ live: [], past: [] }))
    ));
    const all = [];
    for (let i = 0; i < LEAGUES.length; i++) {
      const lg = LEAGUES[i];
      for (const ev of (parts[i].live || [])) all.push({ ev, ts: tsOfEvent(ev), live: true, league: lg });
      for (const ev of (parts[i].past || [])) all.push({ ev, ts: tsOfEvent(ev), live: eventIsLive(ev), league: lg });
    }
    // đang đá trước (mới nhất trước), rồi FT mới nhất
    all.sort((a, b) => (Number(b.live) - Number(a.live)) || (b.ts - a.ts));
    return all.slice(0, limit);
  }, 45 * 1000);
}

// Icon theo môn thể thao (explorer "Môn khác")
export const SPORT_ICONS = {
  Soccer: '⚽', Basketball: '🏀', Baseball: '⚾', 'American Football': '🏈', 'Ice Hockey': '🏒',
  Tennis: '🎾', Golf: '⛳', Motorsport: '🏎️', Fighting: '🥊', Boxing: '🥊', MMA: '🥋',
  Volleyball: '🏐', Rugby: '🏉', Cricket: '🏏', 'Field Hockey': '🏑', Badminton: '🏸',
  'Table Tennis': '🏓', Swimming: '🏊', Athletics: '🏃', Cycling: '🚴', Olympics: '🏅',
  Esports: '🎮', eSports: '🎮', ESports: '🎮', Darts: '🎯', Snooker: '🎱', Chess: '♟️',
  Surfing: '🏄', Sailing: '⛵', Skiing: '⛷️', Skating: '⛸️', Gymnastics: '🤸',
  Handball: '🤾', 'Water Polo': '🤽', Rowing: '🚣', Climbing: '🧗', Karate: '🥋',
};

// Danh mục toàn bộ môn + giải từ TheSportsDB (cache 24h) — Esports, cầu lông,
// bóng chày, bóng rổ, bơi, Olympic... có gì hiện nấy, chọn là xem lịch/KQ/BXH ngay
let _sportsIndex = null;
export async function fetchSportsIndex() {
  if (_sportsIndex) return _sportsIndex;
  try {
    const raw = localStorage.getItem('chrtv_sports_index');
    if (raw) {
      const j = JSON.parse(raw);
      if (j?.at && Date.now() - j.at < 24 * 3600 * 1000 && Array.isArray(j.sports)) {
        _sportsIndex = j; return j;
      }
    }
  } catch {}
  const out = { at: Date.now(), sports: [] };
  try {
    const d = await getJSON(`${TSB}/all_leagues.php`, 15000);
    const leagues = Array.isArray(d?.leagues) ? d.leagues : [];
    const bySport = {};
    for (const l of leagues) {
      const sport = String(l.strSport || 'Other').trim() || 'Other';
      const id = String(l.idLeague || '').trim();
      if (!id) continue;
      (bySport[sport] = bySport[sport] || []).push({
        tsdb: id,
        name: String(l.strLeague || '').trim() || ('League ' + id),
        country: String(l.strCountry || '').trim(),
        badge: String(l.strBadge || ''),
      });
    }
    const names = Object.keys(bySport).sort((a, b) =>
      (a === 'Soccer' ? -1 : b === 'Soccer' ? 1 : bySport[b].length - bySport[a].length));
    out.sports = names.map((name) => ({
      name,
      icon: SPORT_ICONS[name] || '🏟️',
      count: bySport[name].length,
      leagues: bySport[name]
        .sort((a, b) => (b.badge ? 1 : 0) - (a.badge ? 1 : 0))
        .slice(0, 60),
    }));
    _sportsIndex = out;
    try { localStorage.setItem('chrtv_sports_index', JSON.stringify(out)); } catch {}
  } catch {}
  return out;
}

// Video xem lại do admin đăng
export async function fetchSportsVideos() {
  try {
    const r = await fetch(`${API_BASE}/api/sports-videos`);
    const d = await r.json();
    return d.videos || [];
  } catch { return []; }
}

// Chuẩn hoá link video → {type: 'youtube'|'mp4'|'embed', src}
export function parseVideoUrl(url) {
  const u = String(url || '').trim();
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return { type: 'youtube', src: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` };
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u)) return { type: u.includes('.m3u8') ? 'embed' : 'mp4', src: u };
  return { type: 'embed', src: u };
}
