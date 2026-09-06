import { API_BASE } from './config';

// F1 qua Jolpica (Ergast-compatible, miễn phí, không key) + đua xe khác qua TheSportsDB.
const JOL = 'https://api.jolpi.ca/ergast/f1';
const TSB = 'https://www.thesportsdb.com/api/v1/json/3';

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

const mem = new Map();
const TTL = 30 * 60 * 1000;
function cached(key, loader) {
  const c = mem.get(key);
  if (c && Date.now() - c.at < TTL) return Promise.resolve(c.data);
  return loader().then(d => { mem.set(key, { at: Date.now(), data: d }); return d; });
}

export function f1Season() {
  return new Date().getFullYear();
}

// Lịch đua F1 cả mùa: [{ round, name, circuit, locality, country, date, time, ts }]
export function fetchF1Schedule(year = f1Season()) {
  return cached(`f1_sched_${year}`, async () => {
    const d = await getJSON(`${JOL}/${year}.json`);
    const races = d?.MRData?.RaceTable?.Races || [];
    return races.map(r => {
      let ts = 0;
      try { ts = new Date(`${r.date}T${r.time || '00:00:00Z'}`).getTime() || 0; } catch {}
      return {
        round: r.round, name: r.raceName,
        circuit: r?.Circuit?.circuitName || '', locality: r?.Circuit?.Location?.locality || '',
        country: r?.Circuit?.Location?.country || '',
        date: r.date, time: (r.time || '').slice(0, 5), ts, url: r.url || '',
      };
    });
  });
}

// BXH tay đua + đội đua
export function fetchF1Standings(year = f1Season()) {
  return cached(`f1_stand_${year}`, async () => {
    const [drv, con] = await Promise.all([
      getJSON(`${JOL}/${year}/driverStandings.json`).catch(() => null),
      getJSON(`${JOL}/${year}/constructorStandings.json`).catch(() => null),
    ]);
    const drivers = (drv?.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings || []).map(s => ({
      pos: s.position, pts: s.points, wins: s.wins,
      code: s?.Driver?.code || '', name: `${s?.Driver?.givenName || ''} ${s?.Driver?.familyName || ''}`.trim(),
      team: s?.Constructors?.[0]?.name || '',
    }));
    const teams = (con?.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings || []).map(s => ({
      pos: s.position, pts: s.points, wins: s.wins, name: s?.Constructor?.name || '',
    }));
    return { drivers, teams };
  });
}

// Kết quả 1 chặng (top 3 để hiện người thắng)
export function fetchF1Results(year, round) {
  return cached(`f1_res_${year}_${round}`, async () => {
    const d = await getJSON(`${JOL}/${year}/${round}/results.json`);
    const res = d?.MRData?.RaceTable?.Races?.[0]?.Results || [];
    return res.slice(0, 3).map(r => ({
      pos: r.position, pts: r.points,
      driver: `${r?.Driver?.givenName || ''} ${r?.Driver?.familyName || ''}`.trim(),
      code: r?.Driver?.code || '', team: r?.Constructor?.name || '',
    }));
  });
}

// Các giải đua xe khác (MotoGP, WRC, NASCAR...) qua TheSportsDB: [{ league, events }]
export function fetchMotorsport(year = f1Season()) {
  return cached(`moto_${year}`, async () => {
    const all = await getJSON(`${TSB}/all_leagues.php`).catch(() => null);
    const leagues = (all?.leagues || []).filter(l => /motorsport/i.test(l.strSport || ''));
    if (!leagues.length) return [];
    const prefer = /formula\s*1|motogp|moto\s*[23]|world\s*rally|\bwrc\b|nascar|indycar|formula\s*e|supercars|dtm|endurance|f2\b|f3\b/i;
    const picked = [
      ...leagues.filter(l => prefer.test(l.strLeague || '')),
      ...leagues.filter(l => !prefer.test(l.strLeague || '')),
    ].slice(0, 6);
    const out = [];
    for (const l of picked) {
      try {
        const d = await getJSON(`${TSB}/eventsseason.php?id=${l.idLeague}&s=${year}`);
        const evs = Array.isArray(d.events) ? d.events : [];
        if (evs.length) out.push({ league: l.strLeague, badge: l.strBadge || '', events: evs.slice(0, 12) });
      } catch {}
    }
    return out;
  });
}

// Chi tiết trận (TheSportsDB lookupevent): bàn thắng/thẻ/highlight
export function fetchEventDetail(idEvent) {
  return cached(`evdetail_${idEvent}`, async () => {
    const d = await getJSON(`${TSB}/lookupevent.php?id=${idEvent}`);
    return d?.events?.[0] || null;
  });
}

export function bustEventDetail(idEvent) {
  mem.delete(`evdetail_${idEvent}`);
}

// Parse "23':Haaland;45+2':Foden" -> [{ min: 23, label, player }]
function parseDetails(str) {
  if (!str || typeof str !== 'string') return [];
  return str.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/(\d+(?:\+\d+)?)'?\s*:\s*(.+)/) || s.match(/(\d+(?:\+\d+)?)'?\s+(.+)/);
    if (!m) return { min: 999, label: '', player: s };
    const min = parseInt(m[1]) + (m[1].includes('+') ? parseInt(m[1].split('+')[1]) / 100 : 0);
    return { min, label: m[1] + "'", player: m[2].trim() };
  });
}

// Diễn biến trận từ mọi field *Details (bàn thắng/thẻ/thay người nếu có)
export function buildTimeline(ev) {
  if (!ev) return [];
  const items = [];
  const push = (arr, kind, team) => arr.forEach(a => items.push({ ...a, kind, team }));
  push(parseDetails(ev.strHomeGoalDetails), 'goal', 'home');
  push(parseDetails(ev.strAwayGoalDetails), 'goal', 'away');
  for (const [key, kind] of Object.entries(ev)) {
    if (!/details$/i.test(key) || /goal/i.test(key)) continue;
    const low = key.toLowerCase();
    let k = null;
    if (/red/.test(low)) k = 'red';
    else if (/yellow|second/.test(low)) k = 'yellow';
    else if (/subst|lineup_change/.test(low)) k = 'sub';
    else if (/corner/.test(low)) k = 'corner';
    if (!k) continue;
    const team = /away/.test(low) ? 'away' : 'home';
    push(parseDetails(ev[key]), k, team);
  }
  return items.sort((a, b) => a.min - b.min);
}
