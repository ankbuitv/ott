const TMDB_KEY = import.meta.env.VITE_TMDB_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
async function tmdbFetch(path) {
  if (!TMDB_KEY) return null;
  try { const res = await fetch(`${TMDB_BASE}${path}`,{headers:{Authorization:`Bearer ${TMDB_KEY}`}}); return res.ok ? await res.json() : null; } catch { return null; }
}
export async function searchMovie(query,page=1) { const d=await tmdbFetch(`/search/movie?query=${encodeURIComponent(query)}&language=vi&page=${page}`); return d?.results||[]; }
export async function getPopularMovies(page=1) { const d=await tmdbFetch(`/movie/popular?language=vi&page=${page}`); return d?.results||[]; }
export async function getTrendingMovies() { const d=await tmdbFetch(`/trending/movie/week?language=vi`); return d?.results||[]; }
export function getImageUrl(path,size='w500') { return path ? `https://image.tmdb.org/t/p/${size}${path}` : null; }
