const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
// Default fallback key — get free one at https://www.themoviedb.org/settings/api
const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || '1b3b8c6a4c1f2a0f5b8e6e2a7c8d4e1f';

// Warn if no real key configured so the Movies section uses fallback data
if (!import.meta.env.VITE_TMDB_KEY) {
  console.warn('[TMDB] Chua cau hinh VITE_TMDB_KEY - Movies se dung du lieu du phong. Xem TMDB.md de lay key mien phi.');
}

const cache = new Map();
const cacheTMDB = (key, data, ttl = 600) => cache.set(key, { data, ts: Date.now(), ttl });
const fromCache = (k) => {
  const v = cache.get(k);
  if (!v) return null;
  if (Date.now() - v.ts < v.ttl * 1000) return v.data;
  cache.delete(k);
  return null;
};

async function tmdbFetch(path, query = {}) {
  const q = { api_key: TMDB_KEY, language: 'vi-VN', ...query };
  const qs = new URLSearchParams(q).toString();
  const key = `${path}?${qs}`;
  const cached = fromCache(key);
  if (cached) return cached;
  try {
    const res = await fetch(`${TMDB_BASE}${path}?${qs}`);
    const data = await res.json();
    if (data.results || data.id) cacheTMDB(key, data);
    return data;
  } catch (e) {
    return { results: [], error: e.message };
  }
}

export const imgPath = (path, size = 'w500') => path ? `${TMDB_IMG}/${size}${path}` : null;
export const bgPath = (path) => imgPath(path, 'original');

export async function getTrending(time = 'day') {
  return tmdbFetch(`/trending/all/${time}`);
}
export async function getPopularMovies() {
  return tmdbFetch('/movie/popular');
}
export async function getTopRated() {
  return tmdbFetch('/movie/top_rated');
}
export async function getNowPlaying() {
  return tmdbFetch('/movie/now_playing');
}
export async function getPopularTV() {
  return tmdbFetch('/tv/popular');
}
export async function getMovieDetails(id) {
  return tmdbFetch(`/movie/${id}`);
}
export async function getMovieTrailer(id, mediaType = 'movie') {
  const kind = mediaType === 'tv' ? 'tv' : 'movie';
  const d = await tmdbFetch(`/${kind}/${id}/videos`);
  return d?.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')) || null;
}
export async function searchMovies(query) {
  return tmdbFetch('/search/movie', { query });
}
export async function searchMulti(query) {
  return tmdbFetch('/search/multi', { query });
}
export async function getGenres() {
  return tmdbFetch('/genre/movie/list');
}

// --- Fallback khi TMDB fail / hết quota ---
const FALLBACK_FEATURED = [
  { id: 76600, title: 'Avatar: The Way of Water', backdrop_path: '/s16H6tpK2utvwDrcZ9piKnxbSuN.jpg', poster_path: '/94ldQ7GsB2FKfcGqkqVYxC2CqYW.jpg', overview: 'Jake Sully sống cùng gia đình mới trên hành tinh Pandora...', vote_average: 7.7, release_date: '2022-12-14', media_type: 'movie' },
  { id: 872585, title: 'Oppenheimer', backdrop_path: '/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg', poster_path: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', overview: 'Câu chuyện về người đàn ông đã tạo ra bom nguyên tử...', vote_average: 8.3, release_date: '2023-07-19', media_type: 'movie' },
  { id: 693134, title: 'Dune: Part Two', backdrop_path: '/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg', poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg', overview: 'Paul Atreides hợp nhất với Chani và người Fremen...', vote_average: 8.0, release_date: '2024-03-01', media_type: 'movie' },
  { id: 414906, title: 'The Batman', backdrop_path: '/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg', poster_path: '/74xTEgt7R36Fpooo50r9T25onhq.jpg', overview: 'Bruce Wayne truy tìm Riddler...', vote_average: 7.7, release_date: '2022-03-01', media_type: 'movie' },
  { id: 361743, title: 'Top Gun: Maverick', backdrop_path: '/odJ4hxZW82FBvijdhSw7Sy2cJA1.jpg', poster_path: '/62HCnUTziyWcpDaBO2i1DX17ljH.jpg', overview: 'Sau 30 năm, Maverick vẫn bay...', vote_average: 8.2, release_date: '2022-05-24', media_type: 'movie' },
  { id: 603692, title: 'John Wick: Chapter 4', backdrop_path: '/h8gHn0OzBoTZf95u6j8ZHFULV2W.jpg', poster_path: '/vZloFAK7NmvMGKE7QCr2LFjLN55.jpg', overview: 'John Wick đối đầu High Table...', vote_average: 7.7, release_date: '2023-03-22', media_type: 'movie' },
  { id: 569094, title: 'Spider-Man: Across the Spider-Verse', backdrop_path: '/4HodYYKEIsGOdinkGi2Ucqwl9y.jpg', poster_path: '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', overview: 'Miles Morales phiêu lưu qua đa vũ trụ...', vote_average: 8.3, release_date: '2023-05-31', media_type: 'movie' },
  { id: 346698, title: 'Barbie', backdrop_path: '/nHf61UzkfDmno4dJmpwsgm5qfGE.jpg', poster_path: '/iuFNMS8U5cb6xfzi51DbkovjYv4.jpg', overview: 'Barbie và Ken có cuộc phiêu lưu...', vote_average: 6.8, release_date: '2023-07-19', media_type: 'movie' },
];

const FALLBACK_TRENDING = [FALLBACK_FEATURED[1], FALLBACK_FEATURED[2], FALLBACK_FEATURED[6], FALLBACK_FEATURED[3], FALLBACK_FEATURED[4]];
const FALLBACK_NOW_PLAYING = [FALLBACK_FEATURED[5], FALLBACK_FEATURED[6], FALLBACK_FEATURED[7], FALLBACK_FEATURED[1], FALLBACK_FEATURED[2]];
const FALLBACK_TOP_RATED = [FALLBACK_FEATURED[2], FALLBACK_FEATURED[6], FALLBACK_FEATURED[1], FALLBACK_FEATURED[4], FALLBACK_FEATURED[3]];

async function safe(name, fn, fb) {
  try {
    const r = await fn();
    if (r?.results?.length > 0) return r;
  } catch {}
  return { results: fb };
}

export const MovieAPI = {
  hero: () => safe('hero', () => getTrending('week'), FALLBACK_FEATURED.slice(0, 1)),
  trending: () => safe('tr', () => getTrending('week'), FALLBACK_TRENDING),
  nowPlaying: () => safe('np', () => getNowPlaying(), FALLBACK_NOW_PLAYING),
  topRated: () => safe('tr2', () => getTopRated(), FALLBACK_TOP_RATED),
  popularTV: () => safe('tv', () => getPopularTV(), FALLBACK_TRENDING),
  search: (q) => tmdbFetch('/search/multi', { query: q, include_adult: false }),
  details: getMovieDetails,
  trailer: (m) => getMovieTrailer(m.id, m.media_type),
};
