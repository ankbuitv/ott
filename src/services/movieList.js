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
  if (!movie?.id || !movie.poster_path) return;
  let hist = getMovieHistory().filter((m) => mkey(m) !== mkey(movie));
  hist.unshift({
    media_type: movie.media_type === 'tv' ? 'tv' : 'movie',
    id: movie.id,
    title: movie.title || movie.name || '',
    poster_path: movie.poster_path || '',
    vote_average: movie.vote_average || 0,
    at: Date.now(),
  });
  hist = hist.slice(0, 20);
  try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch {}
}
export function clearMovieHistory() {
  try { localStorage.removeItem(HIST_KEY); } catch {}
}
