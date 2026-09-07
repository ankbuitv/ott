import { API_BASE } from './config';

// F1 qua Jolpica (Ergast-compatible, miễn phí, không key) + đua xe khác qua TheSportsDB.
const JOL = 'https://api.jolpi.ca/ergast/f1';
const TSB_ABS = 'https://www.thesportsdb.com/api/v1/json/3';
const TSB = TSB_ABS;

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

// Fetch qua các nguồn thử lần lượt (proxy same-origin trước cho CSP/CORS,
// direct sau cùng) — nguồn nào trả object hợp lệ thì dùng.
async function multiGet(urls, timeoutMs = 10000) {
  for (const u of urls) {
    try {
      const d = await getJSON(u, timeoutMs);
      if (d && typeof d === 'object' && !d.error) return d;
    } catch { /* thử nguồn kế */ }
  }
  return null;
}

// Jolpica/Ergast: ưu tiên proxy cùng-origin (/api/sports/ergast) vì CSP mặc định
// không có api.jolpi.ca; fallback gọi trực tiếp khi chạy bản cũ chưa có route.
// Thử trực tiếp TRƯỚC ở vite dev (direct + CSP mới đã cho phép) để không phụ
// thuộc bản worker đã deploy hay chưa.
async function ergastGet(relPath) {
  return multiGet([
    `/api/sports/ergast?path=${encodeURIComponent(relPath)}`,
    `/ergast/${relPath}`,
    `${JOL}/${relPath}`,
  ]);
}

// TheSportsDB (giống sports.tsdbGet): worker proxy -> /tsdb dev proxy -> direct.
async function tsdbGet(file, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const suffix = qs ? `?${qs}` : '';
  return multiGet([
    `/api/sports/tsdb?file=${encodeURIComponent(file)}${qs ? `&${qs}` : ''}`,
    `/tsdb/${file}${suffix}`,
    `${TSB_ABS}/${file}${suffix}`,
  ]);
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
    const d = await ergastGet(`${year}.json`);
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
      ergastGet(`${year}/driverStandings.json`),
      ergastGet(`${year}/constructorStandings.json`),
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
    const d = await ergastGet(`${year}/${round}/results.json`);
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
    const all = await tsdbGet('all_leagues.php');
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
        const d = await tsdbGet('eventsseason.php', { id: l.idLeague, s: year });
        const evs = Array.isArray(d.events) ? d.events : [];
        if (evs.length) out.push({ league: l.strLeague, badge: l.strBadge || '', events: evs.slice(0, 12) });
      } catch {}
    }
    return out;
  });
}

// ESPN summary -> event kiểu TheSportsDB (để MatchDetailModal dùng chung).
// Gộp luôn commentary (nếu có) thành các chuỗi *Details mà buildTimeline đọc được.
function espnSummaryToTsdb(base, d) {
  if (!d || !d.header) return null;
  const comp = d.header?.competitions?.[0] || {};
  const competitors = comp.competitors || [];
  const home = competitors.find(x => x.homeAway === 'home') || {};
  const away = competitors.find(x => x.homeAway === 'away') || {};
  const st = comp.status?.type || {};
  const date = String(d.header?.date || base?.strTimestamp || '');
  const out = {
    ...(base || {}),
    idEvent: base?.idEvent || `espn_${d.header.id || comp.id || ''}`,
    strHomeTeam: home.team?.displayName || base?.strHomeTeam || '',
    strAwayTeam: away.team?.displayName || base?.strAwayTeam || '',
    intHomeScore: home.score ?? base?.intHomeScore ?? '',
    intAwayScore: away.score ?? base?.intAwayScore ?? '',
    strHomeTeamBadge: home.team?.logo || base?.strHomeTeamBadge || '',
    strAwayTeamBadge: away.team?.logo || base?.strAwayTeamBadge || '',
    strVenue: comp.venue?.fullName || base?.strVenue || '',
    strTimestamp: date,
    dateEvent: date.slice(0, 10) || base?.dateEvent || '',
    strTime: date.length > 11 ? date.slice(11, 19) : (base?.strTime || ''),
    strStatus: st.completed ? 'FT' : (String(st.state || '').toLowerCase() === 'in' ? (st.shortDetail || 'LIVE') : 'NS'),
    strPostponed: /postpon/i.test(String(st.name || '')) ? 'yes' : 'no',
    strLeague: d.header?.league?.name || base?.strLeague || '',
    intRound: comp.week || base?.intRound || '',
  };
  // Highlight: nếu ESPN nhúng sẵn video YouTube
  const yt = JSON.stringify(d).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) out.strVideo = `https://www.youtube.com/watch?v=${yt[1]}`;
  // Diễn biến: ESPN commentary -> chuỗi "23': Tên cầu thủ" theo đội/loại sự kiện
  const detailStr = (c) => {
    const raw = String(c?.time?.displayValue || c?.clock?.displayValue || '').replace(/[^0-9+]/g, '');
    const who = c?.athlete?.displayName || c?.team?.displayName || '';
    if (!raw || !who) return null;
    return `${raw}': ${who}`;
  };
  const buckets = { goalH: [], goalA: [], yH: [], yA: [], rH: [], rA: [] };
  for (const c of (d.commentary || [])) {
    const s = detailStr(c);
    if (!s) continue;
    const isHome = c?.team?.id != null && home.team?.id != null && String(c.team.id) === String(home.team.id);
    const blob = `${c?.type?.text || ''} ${c?.text || c?.headline || ''}`.toLowerCase();
    if (/goal|ghi bàn|bàn thắng/.test(blob)) (isHome ? buckets.goalH : buckets.goalA).push(s);
    else if (/red card|thẻ đỏ|red-?card/.test(blob)) (isHome ? buckets.rH : buckets.rA).push(s);
    else if (/yellow|thẻ vàng|caution/.test(blob)) (isHome ? buckets.yH : buckets.yA).push(s);
  }
  if (buckets.goalH.length) out.strHomeGoalDetails = buckets.goalH.join(';');
  if (buckets.goalA.length) out.strAwayGoalDetails = buckets.goalA.join(';');
  if (buckets.yH.length) out.strHomeYellowCards = buckets.yH.join(';');
  if (buckets.yA.length) out.strAwayYellowCards = buckets.yA.join(';');
  if (buckets.rH.length) out.strHomeRedCards = buckets.rH.join(';');
  if (buckets.rA.length) out.strAwayRedCards = buckets.rA.join(';');
  return out;
}

// Chi tiết trận: TSDB lookupevent; trận ESPN (id 'espn_<id>') lấy qua ESPN summary.
// Nhận vào object event (có sẵn _league/_sport do espnEventsToTsdb gắn) hoặc id thuần.
export function fetchEventDetail(evOrId) {
  const ev = (evOrId && typeof evOrId === 'object') ? evOrId : null;
  const idEvent = ev ? ev.idEvent : evOrId;
  return cached(`evdetail_${idEvent}`, async () => {
    if (String(idEvent || '').startsWith('espn_')) {
      const espnId = String(idEvent).replace(/^espn_/, '');
      const league = ev?._league || '';
      const sport = ev?._sport || 'soccer';
      if (league) {
        const q = `summary=${encodeURIComponent(espnId)}&league=${encodeURIComponent(league)}`
          + (sport !== 'soccer' ? `&sport=${encodeURIComponent(sport)}` : '');
        const d = await multiGet([
          `/api/sports/espn?${q}`,
          `/espn/sports/${sport}/${league}/summary?event=${espnId}`,
          `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/summary?event=${espnId}`,
        ]);
        const mapped = espnSummaryToTsdb(ev, d);
        if (mapped) return mapped;
      }
      return ev || null; // không tra được thêm -> giữ dữ liệu scoreboard đã có
    }
    const d = await tsdbGet('lookupevent.php', { id: idEvent });
    return d?.events?.[0] || ev || null;
  });
}

export function bustEventDetail(idEvent) {
  const key = (idEvent && typeof idEvent === 'object') ? idEvent.idEvent : idEvent;
  mem.delete(`evdetail_${key}`);
}

function youtubeIdFrom(str) {
  const s = String(str || '').trim();
  if (!s) return '';
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|v=)([A-Za-z0-9_-]{11})/) || s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : '';
}

// Highlight đua xe: TheSportsDB strVideo + video admin gắn nhãn F1/Moto
export function fetchRacingVideos(year = f1Season()) {
  return cached(`race_vids_${year}`, async () => {
    const out = [];
    const seen = new Set();
    const push = (item) => {
      if (!item?.video_url || seen.has(item.video_url)) return;
      seen.add(item.video_url);
      out.push(item);
    };
    try {
      const moto = await fetchMotorsport(year);
      for (const pack of moto || []) {
        for (const ev of pack.events || []) {
          const yt = youtubeIdFrom(ev.strVideo);
          if (!yt) continue;
          push({
            id: ev.idEvent || yt,
            title: ev.strEvent || ev.strHomeTeam || pack.league,
            league: pack.league,
            thumb_url: ev.strThumb || `https://img.youtube.com/vi/${yt}/mqdefault.jpg`,
            video_url: `https://www.youtube.com/watch?v=${yt}`,
          });
        }
      }
    } catch {}
    try {
      const r = await fetch(`${API_BASE}/api/sports-videos`);
      const d = await r.json();
      for (const v of d.videos || []) {
        if (!/f1|formula|moto|rally|nascar|indycar|wrc|dtm|endurance|đua|dua xe|racing/i.test(`${v.league || ''} ${v.title || ''}`)) continue;
        push(v);
      }
    } catch {}
    return out.slice(0, 16);
  });
}

// Parse "23':Haaland;45+2':Foden" -> [{ min: 23, label, player }]
function parseDetails(str) {
  if (!str || typeof str !== 'string') return [];
  return str.split(';').map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(/(\d{1,3}(?:\+\d{1,2})?)'?\s*:\s*(.+)/) || s.match(/(\d{1,3}(?:\+\d{1,2})?)'?\s+(.+)/);
    if (!m) return null; // field tĩnh kiểu "6" (số lượng) hoặc tên cầu thủ trần -> bỏ
    const min = parseInt(m[1]) + (m[1].includes('+') ? parseInt(m[1].split('+')[1]) / 100 : 0);
    if (min > 200) return null; // ngoài khoảng phút hợp lệ của 1 trận đấu
    return { min, label: m[1] + "'", player: m[2].trim() };
  }).filter(Boolean);
}

// Diễn biến trận: TSDB dùng nhiều kiểu tên field khác nhau cho cùng một dữ liệu:
//   strHomeGoalDetails (bàn thắng), strHomeYellowCards/strHomeYellowCardDetails
//   (thẻ vàng — field "*Cards" KHÔNG đuôi "Details" nên bản cũ bỏ sót),
//   strHomeRedCards, strHomeLineupSubstitutes / strHomeSubDetails (thay người),
//   strHomeCornerKicks ... Quét tất cả, khớp theo từ khoá trong tên field.
export function buildTimeline(ev) {
  if (!ev) return [];
  const items = [];
  const push = (arr, kind, team) => arr.forEach(a => items.push({ ...a, kind, team }));
  for (const [key, val] of Object.entries(ev)) {
    if (typeof val !== 'string' || !val.trim()) continue;
    const low = key.toLowerCase();
    // Chỉ xét field CHỨA chuỗi diễn biến: *Details / *Card(s) / *Corner* / *Sub*.
    if (!/detail|cards?|corner|sub/i.test(low)) continue;
    // Loại field tĩnh trùng từ khoá: đội hình (strHomeLineupSubstitutes là danh
    // sách cầu thủ dự bị, KHÔNG phải "phút 60 thay người"), sơ đồ, HLV...
    if (/lineup|formation|coach/i.test(low)) continue;
    let kind = null;
    if (/goal/.test(low)) kind = 'goal';
    else if (/red|secondyellow/.test(low)) kind = 'red';
    else if (/yellow/.test(low)) kind = 'yellow';
    else if (/corner/.test(low)) kind = 'corner';
    else if (/subst|sub/i.test(low)) kind = 'sub';
    if (!kind) continue;
    const team = /away/.test(low) ? 'away' : 'home';
    push(parseDetails(val), kind, team);
  }
  // Khử trùng (cùng phút + cùng loại + cùng cầu thủ có thể lọt qua 2 field)
  const seen = new Set();
  const uniq = items.filter((x) => {
    const k = `${x.min}-${x.kind}-${x.player}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return uniq.sort((a, b) => a.min - b.min);
}
