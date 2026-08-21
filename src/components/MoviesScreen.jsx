import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Star, Play, X, Info, ChevronLeft, Volume2, Calendar, Clock, Film, Tv } from 'lucide-react';
import { MovieAPI, imgPath, bgPath } from '../services/tmdb';
import MoviePlayerModal from './MoviePlayerModal';
import { useDevice } from '../contexts/DeviceContext';
import { useToast } from '../contexts/ToastContext';
import { useProfile } from '../contexts/ProfileContext';

export default function MoviesScreen() {
  const device = useDevice();
  const { addToast } = useToast();
  const { currentProfile } = useProfile();
  const [hero, setHero] = useState(null);
  const [rows, setRows] = useState({
    trending: [], nowPlaying: [], topRated: [], popularTV: []
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState(null); // movie detail modal
  const [playMovie, setPlayMovie] = useState(null); // full-screen third-party player
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);

  // Block kid profiles from movies
  useEffect(() => {
    if (currentProfile?.is_child) {
      addToast('Hồ sơ trẻ em — bị giới hạn nội dung', 'info');
    }
  }, [currentProfile]);

  // Fetch all rows
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [heroR, trR, npR, tR, tvR] = await Promise.all([
        MovieAPI.hero(),
        MovieAPI.trending(),
        MovieAPI.nowPlaying(),
        MovieAPI.topRated(),
        MovieAPI.popularTV(),
      ]);

      if (!mounted) return;

      setHero(heroR.results?.[0] || null);
      setRows({
        trending: trR.results || [],
        nowPlaying: npR.results || [],
        topRated: tR.results || [],
        popularTV: tvR.results || [],
      });
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Search
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      const r = await MovieAPI.search(search);
      setSearchResults(r.results || []);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const openDetail = useCallback(async (movie) => {
    setSelected(movie);
    setTrailer(null);
    setTrailerLoading(true);
    try {
      const t = await MovieAPI.trailer(movie.id);
      setTrailer(t);
    } catch (e) {}
    setTrailerLoading(false);
  }, []);

  // Kid mode block
  if (currentProfile?.is_child) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-6xl mb-3">🔒</div>
          <h2 className="text-2xl font-black mb-2">Nội dung bị giới hạn</h2>
          <p className="text-sm text-stone-400">Hồ sơ trẻ em không thể truy cập khu vực Phim ảnh.</p>
        </div>
      </div>
    );
  }

  const cols = device.isMobile ? 2 : device.isTablet ? 3 : device.isTV ? 6 : 5;

  return (
    <div className="flex-1 bg-black text-white overflow-y-auto">
      {/* HERO */}
      {hero && (
        <section className="relative h-[88vh] -mt-px">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bgPath(hero.backdrop_path || hero.poster_path)})` }}></div>
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/50 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>

          <div className="relative h-full flex items-end pb-16 px-8 md:px-12 max-w-3xl">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded">NỔI BẬT</span>
                {hero.media_type && <span className="text-[10px] text-stone-300 uppercase tracking-widest font-bold">{hero.media_type === 'movie' ? 'PHIM' : 'TV SHOW'}</span>}
              </div>
              <h1 className="font-black tracking-tight leading-none mb-4" style={{ fontSize: 'clamp(40px, 6vw, 80px)' }}>
                {(hero.title || hero.name || 'Untitled')}
              </h1>
              <div className="flex items-center gap-3 text-xs text-stone-300 mb-4">
                {hero.vote_average && <span className="text-amber-400 font-bold">★ {hero.vote_average.toFixed(1)}</span>}
                {hero.release_date && <span>{hero.release_date.substring(0, 4)}</span>}
                {hero.first_air_date && <span>{hero.first_air_date.substring(0, 4)}</span>}
              </div>
              <p className="text-sm md:text-base text-stone-200 mb-6 max-w-xl line-clamp-3 leading-relaxed">
                {hero.overview}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPlayMovie(hero)}
                  className="flex items-center gap-2 bg-white text-black px-6 md:px-8 py-2.5 md:py-3 rounded-md font-bold text-sm hover:bg-white/90 transition shadow-lg"
                >
                  <Play className="w-5 h-5 fill-current" />
                  Xem phim
                </button>
                <button
                  onClick={() => openDetail(hero)}
                  className="flex items-center gap-2 bg-white/20 backdrop-blur text-white px-6 md:px-8 py-2.5 md:py-3 rounded-md font-bold text-sm hover:bg-white/30 transition"
                >
                  <Info className="w-5 h-5" />
                  Thông tin
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Search bar — sticky */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-white/5 px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <h2 className="text-lg md:text-2xl font-black tracking-tight hidden md:block">Movies · TV Shows</h2>
          <div className="flex-1 max-w-md ml-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm phim, TV show, diễn viên..."
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500 focus:bg-white/10"
            />
          </div>
        </div>
      </div>

      {/* Search results */}
      {search.trim() && (
        <div className="px-8 py-6 max-w-7xl mx-auto">
          <h3 className="text-sm font-semibold text-stone-400 mb-3">Kết quả: "{search}"</h3>
          {searchResults.length === 0 ? (
            <p className="text-center py-12 text-stone-500 text-sm">Không tìm thấy kết quả</p>
          ) : (
            <div className={`grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-${cols}`}>
              {searchResults.filter(r => r.media_type === 'movie' || r.media_type === 'tv').map(m => (
                <MovieCard key={m.id} movie={m} onClick={() => openDetail(m)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rows */}
      {!search.trim() && (
        <div className="pb-20 space-y-10 pt-4">
          <MovieRow title="🔥 Xu Hướng" items={rows.trending} cols={cols} onClick={openDetail} loading={loading} />
          <MovieRow title="🎬 Đang chiếu" items={rows.nowPlaying} cols={cols} onClick={openDetail} loading={loading} />
          <MovieRow title="⭐ Đánh giá cao nhất" items={rows.topRated} cols={cols} onClick={openDetail} loading={loading} />
          <MovieRow title="📺 TV Shows Phổ Biến" items={rows.popularTV} cols={cols} onClick={openDetail} loading={loading} />
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <MovieDetailModal
          movie={selected}
          trailer={trailer}
          trailerLoading={trailerLoading}
          onClose={() => setSelected(null)}
          onPlay={() => setPlayMovie(selected)}
        />
      )}

      {/* Full-screen third-party player */}
      {playMovie && (
        <MoviePlayerModal movie={playMovie} onClose={() => setPlayMovie(null)} />
      )}
    </div>
  );
}

function MovieRow({ title, items, cols, onClick, loading }) {
  return (
    <section className="px-8">
      <h3 className="text-base md:text-xl font-bold mb-3 tracking-tight">{title}</h3>
      <div className={`grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-${cols}`}>
        {loading
          ? Array.from({ length: cols }).map((_, i) => (
              <div key={i} className="aspect-[2/3] bg-stone-800/40 rounded-md animate-pulse"></div>
            ))
          : items.filter(m => m.poster_path).slice(0, 18).map(m => (
              <MovieCard key={m.id} movie={m} onClick={onClick} />
            ))
        }
      </div>
    </section>
  );
}

function MovieCard({ movie, onClick }) {
  return (
    <button
      onClick={() => onClick(movie)}
      className="group relative aspect-[2/3] rounded-md overflow-hidden bg-stone-900 transition-transform duration-300 hover:scale-105 hover:z-10 hover:shadow-2xl hover:shadow-red-600/20"
    >
      <img
        src={imgPath(movie.poster_path, 'w342')}
        alt={movie.title || movie.name}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[11px] font-bold leading-tight line-clamp-2">{movie.title || movie.name}</p>
        <div className="flex items-center gap-1 mt-1">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="text-[10px] text-stone-400">{movie.vote_average?.toFixed(1) || 'N/A'}</span>
        </div>
      </div>
    </button>
  );
}

function MovieDetailModal({ movie, trailer, trailerLoading, onClose, onPlay }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="relative max-w-4xl mx-auto my-8 bg-stone-900 rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Hero */}
        <div className="relative aspect-video">
          {trailer ? (
            <iframe
              src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&modestbranding=1&rel=0`}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
            />
          ) : (
            <>
              <img src={bgPath(movie.backdrop_path || movie.poster_path)} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-900 to-transparent"></div>
              {trailerLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="w-12 h-12 border-3 border-red-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </>
          )}
          <button onClick={onClose} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8">
          <div className="flex items-start gap-4 mb-4">
            <img src={imgPath(movie.poster_path, 'w185')} alt="" className="w-24 rounded-md shadow-lg hidden md:block" />
            <div className="flex-1">
              <h2 className="text-3xl font-black tracking-tight mb-2">{movie.title || movie.name}</h2>
              <div className="flex items-center gap-3 text-xs text-stone-400 mb-3">
                {movie.vote_average && <span className="text-amber-400 font-bold flex items-center gap-1"><Star className="w-3 h-3 fill-current" />{movie.vote_average.toFixed(1)}</span>}
                {(movie.release_date || movie.first_air_date) && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{movie.release_date || movie.first_air_date}</span>}
                {movie.runtime > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{movie.runtime} phút</span>}
              </div>
              <p className="text-sm text-stone-300 leading-relaxed">{movie.overview}</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <button
              onClick={onPlay}
              className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition"
            >
              <Play className="w-4 h-4 fill-current" />
              ▶ Xem phim (nguồn thứ 3)
            </button>
            {!trailer && !trailerLoading && (
              <button
                onClick={onClose}
                className="w-full px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-stone-300 font-semibold rounded-xl transition"
              >
                Quay lại
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
