/**
 * CHRTV — danh sách nguồn phát cho mục Phim/TV show.
 *
 * LỊCH SỬ:
 * - Trước đây file này hard-code ~50 domain embed kiểu "vidsrc".
 * - Ngày 2026-09-05 (P3, xem SECURITY_FIX_RUNBOOK.md Phụ lục B) toàn bộ bị tắt,
 *   chuyển sang nguồn do admin quản lý (bảng `movie_sources` + allowlist CSP).
 * - Ngày 2026-09-07: gắn lại 6 nguồn free mặc định (VidSrc, 2Embed, VidLink,
 *   MoviesAPI, EmbedSU, VidCore — kiểm chứng 08/2026) ở CẢ server
 *   (BUILTIN_MOVIE_SOURCES trong worker/worker.js) LẪN client (BUILTIN_SOURCES
 *   dưới đây). Lý do có 2 lớp: server là nguồn chính (admin thêm nguồn riêng
 *   không cần build lại app); client là lưới an toàn — worker cũ/proxy hỏng/
 *   offline mà API trả rỗng thì app vẫn mở phim được ngay thay vì màn trống.
 *
 * Quy tắc:
 * - Server trả về nguồn nào thì dùng nguồn đó (ưu tiên nguồn admin tự thêm).
 * - Server rỗng/lỗi -> dùng nguồn free mặc định dưới đây (phải đồng bộ tay với
 *   BUILTIN_MOVIE_SOURCES ở worker khi đổi).
 * - Không có nguồn nào = card/modal tự chuyển sang chế độ TRAILER.
 */

import { API_BASE } from './config';

/**
 * Nguồn free mặc định phía client (đồng bộ với BUILTIN_MOVIE_SOURCES ở worker).
 * Mỗi nguồn có template riêng cho phim lẻ và TV để khỏi xử lý đuôi /{season}/{episode}.
 */
const BUILTIN_SOURCES = [
  {
    name: 'VidSrc',
    movie: 'https://vidsrc.to/embed/movie/{tmdb}',
    tv: 'https://vidsrc.to/embed/tv/{tmdb}/{season}/{episode}',
  },
  {
    name: '2Embed',
    movie: 'https://www.2embed.cc/embed/movie/{tmdb}',
    tv: 'https://www.2embed.cc/embed/tv/{tmdb}/{season}/{episode}',
  },
  {
    name: 'VidLink',
    movie: 'https://vidlink.pro/movie/{tmdb}',
    tv: 'https://vidlink.pro/tv/{tmdb}/{season}/{episode}',
  },
  {
    name: 'MoviesAPI',
    movie: 'https://moviesapi.to/movie/{tmdb}',
    tv: 'https://moviesapi.to/tv/{tmdb}/{season}/{episode}',
  },
  {
    name: 'EmbedSU',
    movie: 'https://www.embed.su/embed/movie/{tmdb}',
    tv: 'https://www.embed.su/embed/tv/{tmdb}/{season}/{episode}',
  },
  {
    name: 'VidCore',
    movie: 'https://vidcore.org/embed/movie/{tmdb}',
    tv: 'https://vidcore.org/embed/tv/{tmdb}/{season}/{episode}',
  },
];

function builtinSources(movie, season, episode) {
  const id = movie?.id;
  if (!id) return [];
  const isTV = movie.media_type === 'tv';
  const s = isTV ? (Number(season) || 1) : 1;
  const e = isTV ? (Number(episode) || 1) : 1;
  return BUILTIN_SOURCES.map((b, i) => ({
    id: 1000 + i,
    name: b.name,
    kind: 'embed',
    url: (isTV ? b.tv : b.movie)
      .replace(/\{tmdb\}/g, String(id))
      .replace(/\{season\}/g, String(s))
      .replace(/\{episode\}/g, String(e)),
  }));
}

/**
 * @param {Object} movie  object TMDB (id, media_type)
 * @param {number} [season]
 * @param {number} [episode]
 * @returns {Promise<Array<{id:number,name:string,kind:'embed'|'hls',url:string}>>}
 */
export async function fetchMovieSources(movie, season, episode) {
  const id = movie?.id;
  if (!id) return [];
  const type = movie.media_type === 'tv' ? 'tv' : 'movie';
  const q = new URLSearchParams({ tmdb: String(id), type });
  if (type === 'tv') {
    q.set('season', String(season || 1));
    q.set('episode', String(episode || 1));
  }
  try {
    const res = await fetch(`${API_BASE}/api/movie/sources?${q}`, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.sources) && data.sources.length > 0) return data.sources;
    }
  } catch {
    // offline / worker chưa deploy: rơi xuống nguồn mặc định bên dưới
  }
  // Server chưa có nguồn (worker cũ trả no_frame_allowlist, DB trống...) ->
  // dùng nguồn free mặc định để mở phim là xem được ngay.
  return builtinSources(movie, season, episode);
}

/**
 * Đã có nguồn phát cho phim này chưa? Dùng để đổi nút "Xem phim" thành
 * "Xem trailer" NGAY trên card/modal, khỏi bắt user bấm vào rồi gặp màn trống.
 * Cache 3 phút/film — trên remote người dùng bấm đi bấm lại rất nhiều, và
 * `/api/movie/sources` là query DB.
 *
 * @returns {Promise<boolean>}
 */
const availCache = new Map(); // 'movie-123' -> { ok, ts }
const AVAIL_TTL = 180_000;

export async function hasPlayableSources(movie, season = 1, episode = 1) {
  if (!movie?.id) return false;
  const isTV = movie.media_type === 'tv';
  const key = `${isTV ? 'tv' : 'movie'}-${movie.id}`;
  const hit = availCache.get(key);
  if (hit && Date.now() - hit.ts < AVAIL_TTL) return hit.ok;
  const list = await fetchMovieSources(movie, isTV ? season : null, isTV ? episode : null);
  const ok = Array.isArray(list) && list.length > 0;
  availCache.set(key, { ok, ts: Date.now() });
  return ok;
}

/** Admin vừa thêm/bớt nguồn, hoặc user bấm "Thử lại" -> quên cache để hỏi lại server */
export function clearMovieSourceCache() { availCache.clear(); }
