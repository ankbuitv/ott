import React, { useEffect, useState } from 'react';
import { getPopularMovies, getTrendingMovies, getImageUrl, searchMovie } from '../services/tmdb';
import { Film, Search, Star, TrendingUp, Play } from 'lucide-react';

export default function MoviesScreen({ openMovie, onOpenMovieHandled }) {
  const [movies, setMovies] = useState([]);
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMovie, setSelectedMovie] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [popular, trend] = await Promise.all([getPopularMovies(1), getTrendingMovies()]);
      setMovies(popular);
      setTrending(trend);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (openMovie) {
      setSelectedMovie(openMovie);
      if (onOpenMovieHandled) onOpenMovieHandled();
    }
  }, [openMovie]);

  const handleSearch = async (q) => {
    setSearchQuery(q);
    if (q.trim()) {
      setLoading(true);
      const results = await searchMovie(q);
      setMovies(results);
      setLoading(false);
    } else {
      setLoading(true);
      const popular = await getPopularMovies(1);
      setMovies(popular);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-slate-800/40 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase tracking-wider mb-1">
            <Film className="w-4 h-4" />
            Phim
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-white">Kho Phim HD</h1>
        </div>
        <div className="relative w-48 md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Tìm phim..."
            className="w-full pl-10 pr-3 py-2 bg-slate-800/80 border border-slate-700/60 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500/50" />
        </div>
      </div>

      {trending.length > 0 && !searchQuery && !selectedMovie && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-red-500" />
            <h2 className="text-lg md:text-xl font-bold text-white">Thịnh Hành</h2>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
            {trending.slice(0, 10).map(movie => (
              <div key={movie.id} className="shrink-0 w-36 md:w-44 cursor-pointer group" onClick={() => setSelectedMovie(movie)}>
                <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-slate-800 border border-slate-700/50 group-hover:border-red-500/50 transition-all">
                  {movie.poster_path ? (
                    <img src={getImageUrl(movie.poster_path, 'w342')} alt={movie.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Film className="w-8 h-8 text-slate-600" /></div>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-300 mt-2 truncate">{movie.title}</p>
                <p className="text-[10px] text-slate-500">{movie.release_date?.split('-')[0] || ''}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedMovie && (
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-3xl overflow-hidden">
          <div className="relative h-48 md:h-72 bg-gradient-to-br from-slate-700 to-slate-900">
            {selectedMovie.backdrop_path && (
              <img src={getImageUrl(selectedMovie.backdrop_path, 'w1280')} alt="" className="w-full h-full object-cover opacity-60" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent" />
            <button onClick={() => setSelectedMovie(null)} className="absolute top-4 right-4 px-3 py-1.5 bg-black/50 rounded-lg text-xs text-slate-300 hover:text-white">✕ Đóng</button>
          </div>
          <div className="p-6 -mt-16 relative z-10">
            <h2 className="text-2xl font-black text-white mb-2">{selectedMovie.title}</h2>
            <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
              {selectedMovie.release_date && (
                <span>{selectedMovie.release_date}</span>
              )}
              {selectedMovie.vote_average > 0 && (
                <span className="flex items-center gap-1 text-yellow-500"><Star className="w-3 h-3 fill-yellow-500" />{selectedMovie.vote_average.toFixed(1)}</span>
              )}
            </div>
            {selectedMovie.overview && <p className="text-sm text-slate-300 leading-relaxed mb-4">{selectedMovie.overview}</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
        {movies.map(movie => (
          <div key={movie.id} className="group cursor-pointer rounded-2xl overflow-hidden bg-slate-800/40 border border-slate-700/40 hover:border-red-500/40 transition-all hover:-translate-y-1"
            onClick={() => setSelectedMovie(movie)}>
            <div className="aspect-[2/3] bg-slate-800 relative overflow-hidden">
              {movie.poster_path ? (
                <img src={getImageUrl(movie.poster_path, 'w342')} alt={movie.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><Film className="w-8 h-8 text-slate-600" /></div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-red-600/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all transform scale-75 group-hover:scale-100">
                  <Play className="w-6 h-6 text-white ml-0.5" />
                </div>
              </div>
            </div>
            <div className="p-3">
              <p className="text-sm font-bold text-white truncate">{movie.title}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-slate-500">{movie.release_date?.split('-')[0] || ''}</span>
                {movie.vote_average > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-yellow-500">
                    <Star className="w-2.5 h-2.5 fill-yellow-500" />{movie.vote_average.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}