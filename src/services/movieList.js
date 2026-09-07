/**
 * My List (watchlist phim) + Tiếp tục xem (movie history) — localStorage, sync server khi đăng nhập.
 */
import { API_BASE } from './config';

const WL_KEY = 'chrtv_movie_watchlist';
const HIST_KEY = 'chrtv_movie_history';

function authHeaders() {
  try {
    const raw = localStorage.getItem('chrtv_token');
    const token = raw ? JSON.parse(raw) : '';
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  } catch { return { 'Content-Type': 'application/json' }; }
}

const mkey = (m) => `${m?.media_type === 'tv' ? 'tv' : 'movie'}-${m?.id}`;

// ---------- WATCHLIST ----------
export function getWatchlistLocal() {
  try { return JSON.parse(localStorage.getItem(WL_KEY) || '[]'); } catch { return []; }
}
export function isWatched(m) {
  return getWatchlistLocal().some((x) => mkey(x) === mkey(m));
}
export function toggleWatchlistLocal(movie) {
  let list = getWatchlistLocal();
  const k = mkey(movie);
  const has = list.some((x) => mkey(x) === k);
  if (has) list = list.filter((x) => mkey(x) !== k);
  else list.unshift({ media_type: movie.media_type === 'tv' ? 'tv' : 'movie', id: movie.id, title: movie.title || movie.name || '', poster_path: movie.poster_path || '' });
  try { localStorage.setItem(WL_KEY, JSON.stringify(list.slice(0, 100))); } catch {}
  // Sync server (fire-and-forget)
  if (!has) {
    fetch(`${API_BASE}/user/watchlist`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ media_type: movie.media_type, tmdb_id: movie.id, title: movie.title || movie.name || '', poster_path: movie.poster_path || '' }) }).catch(() => {});
  } else {
    fetch(`${API_BASE}/user/watchlist`, { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ media_type: movie.media_type, tmdb_id: movie.id }) }).catch(() => {});
  }
  return !has;
}
// Lấy watchlist: server (đăng nhập) merge với local
export async function fetchWatchlist() {
  let server = [];
  try {
    const res = await fetch(`${API_BASE}/user/watchlist`, { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      server = (data.watchlist || []).map((w) => ({ media_type: w.media_type, id: w.tmdb_id, title: w.title, poster_path: w.poster_path }));
    }
  } catch {}
  const local = getWatchlistLocal();
  const seen = new Set(server.map(mkey));
  const merged = [...server, ...local.filter((m) => !seen.has(mkey(m)))];
  try { localStorage.setItem(WL_KEY, JSON.stringify(merged.slice(0, 100))); } catch {}
  return merged;
}

// ---------- TIẾP TỤC XEM PHIM ----------
export function getMovieHistory() {
  try { return JSON.parse(localStorage.getItem(HIST_KEY) || '[]'); } catch { return []; }
}
export function recordMovieWatch(movie) {
  recordMovieProgress(movie, {});
}
// Tiếp tục xem: cộng dồn số giây đã xem + nhớ tập/mùa (TV) + server phát
// (player là iframe bên thứ 3 nên không tua đúng giây — mở lại phim + đúng tập)
export function recordMovieProgress(movie, { sec = 0, season = 0, episode = 0 } = {}) {
  if (!movie?.id || !movie.poster_path) return;
  const prev = getMovieHistory().find((m) => mkey(m) === mkey(movie)) || {};
  let hist = getMovieHistory().filter((m) => mkey(m) !== mkey(movie));
  hist.unshift({
    media_type: movie.media_type === 'tv' ? 'tv' : 'movie',
    id: movie.id,
    title: movie.title || movie.name || '',
    poster_path: movie.poster_path || '',
    vote_average: movie.vote_average || 0,
    watchSec: (prev.watchSec || 0) + Math.max(0, sec || 0),
    season: season || prev.season || 0,
    episode: episode || prev.episode || 0,
    at: Date.now(),
  });
  hist = hist.slice(0, 20);
  try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch {}
}
export function getMovieProgress(movie) {
  if (!movie?.id) return null;
  return getMovieHistory().find((m) => mkey(m) === mkey(movie)) || null;
}
export function fmtWatchSec(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}′`;
  return `${Math.floor(m / 60)}h${m % 60 ? `${m % 60}′` : ''}`;
}
export function clearMovieHistory() {
  try { localStorage.removeItem(HIST_KEY); } catch {}
}

// ---------- (#7) Resume đa thiết bị: đồng bộ progress lên server ----------
export function syncMovieProgressServer(movie, { season = 0, episode = 0, position_sec = 0, duration_sec = 0 } = {}) {
  if (!movie?.id) return Promise.resolve();
  const h = authHeaders();
  if (!h) return Promise.resolve();
  const media_type = movie.media_type === 'tv' ? 'tv' : 'movie';
  const dur = Math.max(0, Number(duration_sec) || 0);
  const pos = Math.max(0, Number(position_sec) || 0);
  return fetch(`${API_BASE}/api/movie/progress`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      media_type,
      tmdb_id: movie.id,
      season: media_type === 'tv' ? (season || 0) : 0,
      episode: media_type === 'tv' ? (episode || 0) : 0,
      position_sec: dur > 0 ? pos : 0,
      duration_sec: dur,
      percent: dur > 0 ? Math.min(100, (pos / dur) * 100) : 0,
      title: movie.title || movie.name || '',
      poster_path: movie.poster_path || '',
    }),
  }).catch(() => {});
}
// Lấy progress server (mọi thiết bị) — gộp vào history local khi đăng nhập
export async function fetchMovieProgressServer() {
  const h = authHeaders();
  if (!h) return [];
  try {
    const r = await fetch(`${API_BASE}/api/movie/progress`, { headers: h });
    const d = await r.json();
    return (d.items || []).map((x) => ({
      media_type: x.media_type, id: x.tmdb_id, title: x.title, poster_path: x.poster_path,
      season: x.season, episode: x.episode, position_sec: x.position_sec, duration_sec: x.duration_sec,
      percent: x.percent, updated_at: x.updated_at, server: true,
    }));
  } catch { return []; }
}
// Merge server progress vào history local: ưu tiên mới hơn
export function mergeServerProgress(items) {
  if (!items || !items.length) return;
  const hist = getMovieHistory();
  const byKey = new Map(hist.map((h) => [mkey(h), h]));
  for (const it of items) {
    const k = mkey(it);
    const prev = byKey.get(k);
    const itAt = it.updated_at ? it.updated_at * 1000 : Date.now();
    if (!prev || (prev.at || 0) < itAt) {
      byKey.set(k, {
        media_type: it.media_type, id: it.id, title: it.title || prev?.title || '', poster_path: it.poster_path || prev?.poster_path || '',
        season: it.season || prev?.season || 0, episode: it.episode || prev?.episode || 0,
        watchSec: prev?.watchSec || 0, at: itAt, serverPos: it.position_sec, serverDur: it.duration_sec, serverPercent: it.percent,
      });
    }
  }
  const merged = Array.from(byKey.values()).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 30);
  try { localStorage.setItem(HIST_KEY, JSON.stringify(merged)); } catch {}
}
