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
function cached(key, loader) {
  const c = memCache.get(key);
  if (c && Date.now() - c.at < TTL) return Promise.resolve(c.data);
  return loader().then(d => { memCache.set(key, { at: Date.now(), data: d }); return d; });
}

// Lịch (5 tháng tới) + kết quả + BXH 1 giải
export function fetchLeague(league) {
  const season = currentSeason();
  return cached(`league_${league.id}_${season}`, async () => {
    // Lịch cả mùa → lọc 150 ngày tới (5 tháng), đã đá → kết quả
    const seasonEvts = await (async () => {
      try {
        const d = await getJSON(`${TSB}/eventsseason.php?id=${league.tsdb}&s=${season}`);
        return Array.isArray(d.events) ? d.events : [];
      } catch { return []; }
    })();
    const tsOf = (ev) => {
      try {
        if (ev.strTimestamp) { const d = new Date(/z$/i.test(ev.strTimestamp) ? ev.strTimestamp : ev.strTimestamp + 'Z'); if (!isNaN(d.getTime())) return d.getTime(); }
        if (ev.dateEvent) { const d = new Date(`${ev.dateEvent}T${ev.strTime || '00:00:00'}`); if (!isNaN(d.getTime())) return d.getTime(); }
      } catch {}
      return 0;
    };
    const now = Date.now();
    const horizon = now + 150 * 24 * 3600 * 1000; // 5 tháng
    let next = [], past = [];
    if (seasonEvts.length) {
      const withTs = seasonEvts.map(ev => ({ ev, ts: tsOf(ev) })).filter(x => x.ts > 0);
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
  });
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
