import { API_BASE } from './config';

const TSB_ABS = 'https://www.thesportsdb.com/api/v1/json/3';
const OLB = 'https://api.openligadb.de';

export const LEAGUES = [
  { id: 'u20wc', name: 'FIFA U-20 World Cup', short: 'U20 TG', tsdb: '5642', flag: '🌎', cup: true, latestSeason: true, logo: 'https://r2.thesportsdb.com/images/media/league/badge/o9zi0a1751440425.png' },
  { id: 'u20afc', name: 'U-20 châu Á 2027', short: 'U20 Á', tsdb: '', espnSlugs: ['afc.u20', 'afc.u20.championship', 'afc.u20asiancup'], espnDaysBack: 14, flag: '🌏', cup: true, latestSeason: true, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/847.png' },
  { id: 'aff', name: 'ASEAN Championship', short: 'ASEAN', tsdb: '5889', espnSlugs: ['aff.championship'], espnDaysBack: 50, flag: '🌏', cup: true, latestSeason: true, logo: 'https://r2.thesportsdb.com/images/media/league/badge/z9dvdf1780551855.png' },
  { id: 'epl', name: 'Ngoại hạng Anh', short: 'EPL', tsdb: '4328', flag: '🇬🇧', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/23.png' },
  { id: 'laliga', name: 'La Liga', short: 'LaLiga', tsdb: '4335', flag: '🇪🇸', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/15.png' },
  { id: 'seriea', name: 'Serie A', short: 'Serie A', tsdb: '4332', flag: '🇮🇹', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/12.png' },
  { id: 'bundesliga', name: 'Bundesliga', short: 'Bundesliga', tsdb: '4331', flag: '🇩🇪', olb: 'bl1', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/10.png' },
  { id: 'ligue1', name: 'Ligue 1', short: 'Ligue 1', tsdb: '4334', flag: '🇫🇷', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/9.png' },
  { id: 'ucl', name: 'Cúp C1 châu Âu', short: 'UCL', tsdb: '4480', flag: '🏆', cup: true, logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2.png' },
  { id: 'vleague1', name: 'V.League 1', short: 'V.League 1', tsdb: '4803', flag: '🇻🇳', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2341.png' },
  { id: 'vleague2', name: 'V.League 2', short: 'V.League 2', tsdb: '5214', flag: '🇻🇳', logo: 'https://a.espncdn.com/i/leaguelogos/soccer/500/2341.png' },
  { id: 'nba', name: 'NBA — Bóng rổ Mỹ', short: 'NBA', tsdb: '4387', flag: '🏀', logo: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png' },
];

export function currentSeason() {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
export function currentSeasonShort() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function seasonRank(s) {
  const m = String(s || '').match(/(\d{4})/g);
  return m ? Number(m[m.length - 1]) : 0;
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

async function tsdbGet(file, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const tries = [
    `/api/sports/tsdb?file=${encodeURIComponent(file)}${qs ? `&${qs}` : ''}`,
    `/tsdb/${file}${qs ? `?${qs}` : ''}`,
    `${TSB_ABS}/${file}${qs ? `?${qs}` : ''}`,
  ];
  const settled = await Promise.all(tries.map((u) => getJSON(u, 8000).catch(() => null)));
  const ok = settled.filter((d) => d && typeof d === 'object' && !d.error);
  ok.sort((a, b) => payloadScore(b) - payloadScore(a));
  return ok[0] || {};
}

function payloadScore(d) {
  return (d.events?.length || 0) + (d.seasons?.length || 0) + (d.table?.length || 0)
    + (d.leagues?.length || 0) + (d.teams?.length || 0) + (d.results?.length || 0);
}

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function espnScoreboard(slug, dates) {
  const q = dates ? `dates=${dates}` : '';
  const tries = [
    `/espn/sports/soccer/${slug}/scoreboard${q ? `?${q}` : ''}`,
    `/api/sports/espn?league=${encodeURIComponent(slug)}${dates ? `&dates=${dates}` : ''}`,
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard${q ? `?${q}` : ''}`,
  ];
  for (const u of tries) {
    try {
      const d = await getJSON(u);
      if (d && Array.isArray(d.events)) return d;
    } catch { /* thử nguồn kế */ }
  }
  return null;
}

function espnEventsToTsdb(board) {
  if (!board || !Array.isArray(board.events)) return [];
  return board.events.map((ev) => {
    const c = (ev.competitions && ev.competitions[0]) || {};
    const home = (c.competitors || []).find((x) => x.homeAway === 'home') || {};
    const away = (c.competitors || []).find((x) => x.homeAway === 'away') || {};
    const st = (c.status && c.status.type) || {};
    const completed = !!st.completed;
    const inPlay = String(st.state || '').toLowerCase() === 'in';
    const date = String(ev.date || '');
    return {
      idEvent: `espn_${ev.id}`,
      strHomeTeam: home.team?.displayName || home.team?.shortDisplayName || '',
      strAwayTeam: away.team?.displayName || away.team?.shortDisplayName || '',
      intHomeScore: home.score ?? '',
      intAwayScore: away.score ?? '',
      strTimestamp: date,
      dateEvent: date.slice(0, 10),
      strTime: date.length > 11 ? date.slice(11, 19) : '',
      strStatus: completed ? 'FT' : (inPlay ? (st.shortDetail || 'LIVE') : 'NS'),
      strPostponed: /postpon/i.test(String(st.name || '')) ? 'yes' : 'no',
      strHomeTeamBadge: home.team?.logo || '',
      strAwayTeamBadge: away.team?.logo || '',
      strVenue: c.venue?.fullName || '',
      intRound: '',
    };
  }).filter((e) => e.strHomeTeam && e.strAwayTeam);
}

async function fetchEspnLeague(league) {
  const slugs = league?.espnSlugs || (league?.espnSlug ? [league.espnSlug] : []);
  if (!slugs.length) return [];
  const back = league.espnDaysBack || 14;
  const a = new Date(); a.setDate(a.getDate() - back);
  const b = new Date(); b.setDate(b.getDate() + 7);
  const range = `${ymd(a)}-${ymd(b)}`;
  const out = [];
  for (const slug of slugs) {
    const [cur, ranged] = await Promise.all([
      espnScoreboard(slug, ''),
      espnScoreboard(slug, range),
    ]);
    out.push(...espnEventsToTsdb(cur), ...espnEventsToTsdb(ranged));
    if (out.length) break;
  }
  return out;
}

async function seasonFor(league) {
  if (league?.season) return league.season;
  if (league?.tsdb && (league?.cup || league?.latestSeason)) {
    try {
      const d = await tsdbGet('search_all_seasons.php', { id: league.tsdb });
      const seasons = (d.seasons || []).map((x) => x.strSeason).filter(Boolean);
      if (seasons.length) {
        seasons.sort((a, b) => seasonRank(b) - seasonRank(a) || String(b).localeCompare(String(a)));
        return seasons[0];
      }
    } catch {}
    const y = new Date().getFullYear();
    return `${y - 1}-${y}`;
  }
  return currentSeason();
}

const memCache = new Map();
const TTL = 10 * 60 * 1000;
function cached(key, loader, ttlMs = TTL) {
  const c = memCache.get(key);
  if (c && Date.now() - c.at < ttlMs) return Promise.resolve(c.data);
  return loader().then(d => { memCache.set(key, { at: Date.now(), data: d }); return d; });
}

function tsOfEvent(ev) {
  try {
    if (ev.strTimestamp) { const d = new Date(/z$/i.test(ev.strTimestamp) ? ev.strTimestamp : ev.strTimestamp + 'Z'); if (!isNaN(d.getTime())) return d.getTime(); }
    if (ev.dateEvent) { const d = new Date(`${ev.dateEvent}T${ev.strTime || '00:00:00'}`); if (!isNaN(d.getTime())) return d.getTime(); }
  } catch {}
  return 0;
}

const NOT_LIVE = new Set(['NS', 'FT', 'AOT', 'POSTPONED', 'CANCELED', 'CANCELLED', 'ABANDONED', '']);
export function eventIsLive(ev) {
  const s = String(ev?.strStatus || '').trim().toUpperCase();
  return !NOT_LIVE.has(s) && ev?.strPostponed !== 'yes';
}
export function eventIsPostponed(ev) {
  return ev?.strPostponed === 'yes' || /postpon|cancel/i.test(String(ev?.strStatus || ''));
}

export function fetchLeague(league, { fresh = false } = {}) {
  const run = async () => {
    const season = await seasonFor(league);
    const key = `league_${league.id}_${season}`;
    if (fresh) {
      try {
        const d = await loadLeagueData(league, season);
        memCache.set(key, { at: Date.now(), data: d });
        return d;
      } catch {
        const c = memCache.get(key);
        if (c) return c.data;
        throw new Error('SPORTS_FETCH_FAILED');
      }
    }
    return cached(key, () => loadLeagueData(league, season));
  };
  return run();
}

function mergeEvents(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const ev of list || []) {
      const k = ev.idEvent || `${ev.dateEvent}|${ev.strHomeTeam}|${ev.strAwayTeam}`;
      if (!map.has(k)) map.set(k, ev);
    }
  }
  return [...map.values()];
}

const TWO_MONTHS = 62 * 24 * 3600 * 1000;

function splitNextPast(events, { pastLimit = 40 } = {}) {
  const now = Date.now();
  const withTs = events.map(ev => ({ ev, ts: tsOfEvent(ev) })).filter(x => x.ts > 0);
  const next = withTs
    .filter(x => x.ts >= now - 3 * 3600 * 1000 && x.ts <= now + TWO_MONTHS)
    .sort((a, b) => a.ts - b.ts).slice(0, 40).map(x => x.ev);
  const past = withTs
    .filter(x => x.ts < now - 3 * 3600 * 1000 && x.ts >= now - TWO_MONTHS)
    .sort((a, b) => b.ts - a.ts).slice(0, pastLimit).map(x => x.ev);
  return { next, past };
}

async function tsdbSeasonEvents(league, season) {
  if (!league?.tsdb) return [];
  const seasons = [season];
  if (league.cup || league.latestSeason) {
    const y = new Date().getFullYear();
    for (const s of [`${y - 1}-${y}`, `${y}-${y + 1}`, String(y), String(y - 1)]) {
      if (!seasons.includes(s)) seasons.push(s);
    }
  }
  for (const s of seasons) {
    try {
      const d = await tsdbGet('eventsseason.php', { id: league.tsdb, s });
      if (Array.isArray(d.events) && d.events.length) return d.events;
    } catch {}
  }
  return [];
}

async function loadLeagueData(league, season) {
  const [seasonEvts, pastLeague, nextLeague, espnEvts] = await Promise.all([
    tsdbSeasonEvents(league, season),
    league?.tsdb ? tsdbGet('eventspastleague.php', { id: league.tsdb }).then(d => d.events || []).catch(() => []) : Promise.resolve([]),
    league?.tsdb ? tsdbGet('eventsnextleague.php', { id: league.tsdb }).then(d => d.events || []).catch(() => []) : Promise.resolve([]),
    fetchEspnLeague(league).catch(() => []),
  ]);
  const merged = mergeEvents([seasonEvts, pastLeague, nextLeague, espnEvts]);
  const { next, past } = splitNextPast(merged, { pastLimit: 40 });

  const table = await (async () => {
    if (!league.cup && league.tsdb) {
      try {
        const d = await tsdbGet('lookuptable.php', { id: league.tsdb, s: season });
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
  })();
  return { next, past, table };
}

export function fetchLatestResults(league) {
  return (async () => {
    const season = await seasonFor(league);
    return cached(`latest_${league.id}_${season}`, async () => {
      let evts = [];
      if (league.tsdb) {
        try {
          const d = await tsdbGet('eventsseason.php', { id: league.tsdb, s: season });
          if (Array.isArray(d.events)) evts = d.events;
        } catch {}
        if (!evts.length) {
          try {
            const d = await tsdbGet('eventspastleague.php', { id: league.tsdb });
            evts = Array.isArray(d.events) ? d.events : [];
          } catch {}
        }
      }
      if (!evts.length) {
        try { evts = await fetchEspnLeague(league); } catch { evts = []; }
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
  })();
}

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
    all.sort((a, b) => (Number(b.live) - Number(a.live)) || (b.ts - a.ts));
    return all.slice(0, limit);
  }, 45 * 1000);
}

export const SPORT_ICONS = {
  Soccer: '⚽', Basketball: '🏀', Baseball: '⚾', 'American Football': '🏈', 'Ice Hockey': '🏒',
  Tennis: '🎾', Golf: '⛳', Motorsport: '🏎️', Fighting: '🥊', Boxing: '🥊', MMA: '🥋',
  Volleyball: '🏐', Rugby: '🏉', Cricket: '🏏', 'Field Hockey': '🏑', Badminton: '🏸',
  'Table Tennis': '🏓', Swimming: '🏊', Athletics: '🏃', Cycling: '🚴', Olympics: '🏅',
  Esports: '🎮', eSports: '🎮', ESports: '🎮', Darts: '🎯', Snooker: '🎱', Chess: '♟️',
  Surfing: '🏄', Sailing: '⛵', Skiing: '⛷️', Skating: '⛸️', Gymnastics: '🤸',
  Handball: '🤾', 'Water Polo': '🤽', Rowing: '🚣', Climbing: '🧗', Karate: '🥋',
};

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
    const d = await tsdbGet('all_leagues.php');
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

export async function fetchSportsVideos() {
  try {
    const r = await fetch(`${API_BASE}/api/sports-videos`);
    const d = await r.json();
    return d.videos || [];
  } catch { return []; }
}

function descForLang(tm, lang) {
  const map = {
    vi: tm.strDescriptionEN, en: tm.strDescriptionEN, de: tm.strDescriptionDE,
    fr: tm.strDescriptionFR, it: tm.strDescriptionIT, cn: tm.strDescriptionCN,
    zh: tm.strDescriptionCN, jp: tm.strDescriptionJP, ru: tm.strDescriptionRU,
    es: tm.strDescriptionES, pt: tm.strDescriptionPT,
  };
  const raw = map[lang] || tm.strDescriptionEN || tm.strDescriptionIT || '';
  return String(raw || '').replace(/\r\n/g, '\n').trim();
}

export function pickBestTeam(teams, query) {
  const q = String(query || '').trim().toLowerCase();
  const scored = (teams || []).map((tm) => {
    let s = 0;
    const name = String(tm.strTeam || '').toLowerCase();
    const alt = String(tm.strTeamAlternate || '').toLowerCase();
    const country = String(tm.strCountry || '').toLowerCase();
    if (name === q) s += 100;
    else if (name.startsWith(q)) s += 70;
    else if (name.includes(q) || alt.includes(q)) s += 40;
    if (country === q) s += 20;
    if (tm.strSport === 'Soccer') s += 25;
    if (tm.strBadge) s += 12;
    if (tm.strStadium) s += 4;
    if (tm.strDescriptionEN) s += 6;
    if (tm.strLocked === 'unlocked') s += 2;
    return { tm, s };
  }).filter((x) => x.s > 0);
  scored.sort((a, b) => b.s - a.s);
  return (scored[0] || (teams || [])[0]) || null;
}

export function slimTeam(tm, lang = 'vi') {
  if (!tm) return null;
  const leagues = [tm.strLeague, tm.strLeague2, tm.strLeague3, tm.strLeague4, tm.strLeague5]
    .map((x) => String(x || '').trim()).filter(Boolean);
  const aliases = String(tm.strTeamAlternate || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4);
  const desc = descForLang(tm, lang);
  return {
    id: tm.idTeam,
    name: tm.strTeam,
    aliases,
    formed: tm.intFormedYear || '',
    sport: tm.strSport || '',
    country: tm.strCountry || '',
    stadium: tm.strStadium || '',
    location: tm.strLocation || '',
    capacity: tm.intStadiumCapacity || '',
    nick: tm.strKeywords || '',
    badge: tm.strBadge || '',
    logo: tm.strLogo || '',
    kit: tm.strEquipment || '',
    website: tm.strWebsite || '',
    facebook: tm.strFacebook || '',
    youtube: tm.strYoutube || '',
    leagues,
    desc: desc.length > 900 ? desc.slice(0, 900).trim() + '…' : desc,
  };
}

export async function fetchTeam(query, lang = 'vi') {
  const q = String(query || '').trim();
  if (!q) return null;
  return cached(`team_${q.toLowerCase()}_${lang}`, async () => {
    const d = await tsdbGet('searchteams.php', { t: q });
    const tm = pickBestTeam(d.teams || [], q);
    return slimTeam(tm, lang);
  }, 30 * 60 * 1000);
}

export async function fetchTeamLast(idTeam) {
  if (!idTeam) return [];
  return cached(`team_last_${idTeam}`, async () => {
    const d = await tsdbGet('eventslast.php', { id: idTeam });
    const list = d.results || d.events || [];
    return Array.isArray(list) ? list.slice(0, 8) : [];
  }, 10 * 60 * 1000);
}

export function parseVideoUrl(url) {
  const u = String(url || '').trim();
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return { type: 'youtube', src: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` };
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u)) return { type: u.includes('.m3u8') ? 'embed' : 'mp4', src: u };
  return { type: 'embed', src: u };
}
