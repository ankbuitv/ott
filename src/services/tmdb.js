const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';

async function tmdbFetch(path) {
  if (!TMDB_KEY) return null;
  try {
    const res = await fetch(`${TMDB_BASE}${path}`, {
      headers: { Authorization: `Bearer ${TMDB_KEY}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export async function searchMovie(query, page = 1) {
  const data = await tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&language=vi&page=${page}`);
  return data?.results || [];
}

export async function getPopularMovies(page = 1) {
  const data = await tmdbFetch(`/movie/popular?language=vi&page=${page}`);
  return data?.results || [];
}

export async function getTrendingMovies() {
  const data = await tmdbFetch(`/trending/movie/week?language=vi`);
  return data?.results || [];
}

export async function getMovieDetails(id) {
  const data = await tmdbFetch(`/movie/${id}?language=vi&append_to_response=credits,videos,similar`);
  return data || null;
}

export function getImageUrl(path, size = 'w500') {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}