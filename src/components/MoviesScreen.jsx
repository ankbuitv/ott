import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Star, Play, X, Info, Calendar, Clock, Tv, Film, SlidersHorizontal, TrendingUp } from 'lucide-react';
import { MovieAPI, imgPath, bgPath, COUNTRY_INFO, getUpcoming, getMovieGenres, getTMDBKey, setTMDBKey, isDefaultTMDBKey } from '../services/tmdb';
import MoviePlayerModal from './MoviePlayerModal';
import { useDevice } from '../contexts/DeviceContext';
import { useToast } from '../contexts/ToastContext';
import { useProfile } from '../contexts/ProfileContext';
import { useI18n } from '../contexts/I18nContext';
import { detectCountry } from '../i18n/translations';

const CATALOG_PAGE = 30;

// Skeleton poster với hiệu ứng shimmer
function MovieSkeleton() {
  return (
    <div className="aspect-[2/3] rounded-xl overflow-hidden skeleton-shimmer border border-white/5">
      <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent"></div>
    </div>
  );
}

export default function MoviesScreen({ openMovie = null, onOpenMovieHandled } = {}) {
  const device = useDevice();
  const { addToast } = useToast();
  const { currentProfile } = useProfile();
  const { t } = useI18n();

  // Tự phát hiện quốc gia (timezone/browser) → banner phim theo nước đó
  const country = useMemo(() => detectCountry(), []);
  const countryInfo = COUNTRY_INFO[country] || COUNTRY_INFO.US;

  const [hero, setHero] = useState(null);
  const [rows, setRows] = useState({ trending: [], nowPlaying: [], topRated: [], popularTV: [], upcoming: [] });
  const [catalog, setCatalog] = useState([]);          // toàn bộ phim
  const [genres, setGenres] = useState([]);            // danh sách thể loại
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE);
  const [selectedGenre, setSelectedGenre] = useState('all');

  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchNonce, setSearchNonce] = useState(0); // để ép tìm lại sau khi lưu key
  const [keyInput, setKeyInput] = useState('');
  const [showKeyBox, setShowKeyBox] = useState(false);
  const [keyChecking, setKeyChecking] = useState(false);
  const [keyMsg, setKeyMsg] = useState(null); // { ok, text }

  const [selected, setSelected] = useState(null);
  const [playMovie, setPlayMovie] = useState(null);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);

  // Block kid profiles
  useEffect(() => {
    if (currentProfile?.is_child) addToast(t('toast.kid_blocked'), 'info');
  }, [currentProfile]);

  // Mở phim được chọn từ thanh tìm kiếm trên TopNav
  useEffect(() => {
    if (openMovie) {
      openDetail(openMovie);
      if (onOpenMovieHandled) onOpenMovieHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMovie]);

  // Fetch rows + genres + full catalog
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const [heroR, trR, npR, tR, tvR, upR, gR] = await Promise.all([
        MovieAPI.hero(country),
        MovieAPI.trending(),
        MovieAPI.nowPlaying(country),
        MovieAPI.topRated(),
        MovieAPI.popularTV(),
        getUpcoming().catch(() => ({ results: [] })),
        getMovieGenres().catch(() => ({ genres: [] })),
      ]);
      if (!mounted) return;
      setHero(heroR.results?.[0] || null);
      setRows({ trending: trR.results || [], nowPlaying: npR.results || [], topRated: tR.results || [], popularTV: tvR.results || [], upcoming: upR.results || [] });
      setGenres(gR.genres || []);
      setLoading(false);
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // Load full catalog (background, không chặn UI)
  useEffect(() => {
    let mounted = true;
    (async () => {
      setCatalogLoading(true);
      const r = await MovieAPI.catalog().catch(() => ({ results: [] }));
      if (!mounted) return;
      setCatalog(r.results || []);
      setCatalogLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // Search: TMDB API + tìm trong catalog đã nạp
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const q = search.trim();
    const ql = q.toLowerCase();
    const t = setTimeout(async () => {
      // 1) tìm local trong catalog
      const local = catalog.filter(m => (m.title || m.name || '').toLowerCase().includes(ql)).slice(0, 40);
      // 2) gọi TMDB search để lấy thêm (phim chưa nạp) - luôn gọi, không phụ thuộc catalog
      const r = await MovieAPI.search(q).catch(() => ({ results: [] }));
      const seen = new Set(local.map(m => `${m.media_type}-${m.id}`));
      const remote = (r.results || []).filter(m => {
        const k = `${m.media_type}-${m.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return m.media_type === 'movie' || m.media_type === 'tv';
      });
      // Nếu TMDB search fail (key không hợp lệ) mà local cũng rỗng -> thử search trong fallback
      let final = [...local, ...remote];
      if (final.length === 0) {
        const fb = await MovieAPI.searchFallback(q).catch(() => []);
        const seen2 = new Set();
        fb.forEach(m => {
          const k = `${m.media_type}-${m.id}`;
          if (!seen2.has(k)) { seen2.add(k); final.push(m); }
        });
      }
      setSearchResults(final.slice(0, 60));
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [search, catalog, searchNonce]);

  // Lưu TMDB API key người dùng dán vào (lưu localStorage, dùng ngay)
  const saveTMDBKey = async () => {
    const k = keyInput.trim();
    if (!k) { setKeyMsg({ ok: false, text: 'Chưa nhập key.' }); return; }
    setKeyChecking(true);
    setKeyMsg(null);
    const v = await MovieAPI.verifyKey(k).catch(() => ({ ok: false, error: 'Lỗi mạng' }));
    setKeyChecking(false);
    if (v.ok) {
      setTMDBKey(k);
      setKeyInput('');
      setShowKeyBox(false);
      setKeyMsg({ ok: true, text: '✅ Key hợp lệ! Đã lưu — tìm kiếm toàn bộ TMDB ngay bây giờ.' });
      setSearchNonce(n => n + 1); // ép tìm lại với key mới
      addToast(t('toast.tmdb_ok'), 'success');
    } else {
      setKeyMsg({ ok: false, text: `❌ Key không hợp lệ (HTTP ${v.status || '?'}): ${v.status_message || v.error || 'thử key khác'}` });
    }
  };

  const openDetail = useCallback(async (movie) => {
    if (!movie || !movie.id) return;
    setSelected(movie);
    setTrailer(null);
    setTrailerLoading(true);
    try {
      const t = await MovieAPI.trailer(movie.id);
      setTrailer(t);
    } catch (e) {}
    setTrailerLoading(false);
  }, []);

  const filteredCatalog = useMemo(() => {
    if (selectedGenre === 'all') return catalog;
    const gid = Number(selectedGenre);
    return catalog.filter(m => (m.genre_ids || []).includes(gid));
  }, [catalog, selectedGenre]);

  const visibleCatalog = filteredCatalog.slice(0, visibleCount);

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

  // Lưới cố định: mobile 2 cột, tablet 3, desktop/TV 6 cột (1 hàng 6 phim)
  const gridCls = device.isMobile
    ? 'grid-cols-2'
    : device.isTablet
      ? 'grid-cols-3'
      : 'lg:grid-cols-6 grid-cols-3';

  return (
    <div className="flex-1 bg-black text-white overflow-y-auto">
      {/* HERO */}
      {hero && (
        <section className="relative h-[82vh] -mt-px">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${bgPath(hero.backdrop_path || hero.poster_path)})` }}></div>
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>

          <div className="relative h-full flex items-end pb-14 px-8 md:px-12 max-w-4xl">
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> {t('movies.hero.featured')}
                </span>
                <span className="px-2 py-0.5 bg-white/10 border border-white/15 backdrop-blur text-[10px] font-bold rounded flex items-center gap-1">
                  {countryInfo.flag} {countryInfo.name}
                </span>
                {hero.media_type && <span className="text-[10px] text-stone-300 uppercase tracking-widest font-bold">{hero.media_type === 'movie' ? 'PHIM' : 'TV SHOW'}</span>}
              </div>
              <h1 className="font-black tracking-tight leading-none mb-4" style={{ fontSize: 'clamp(38px, 5.5vw, 76px)' }}>
                {hero.title || hero.name || 'Untitled'}
              </h1>
              <div className="flex items-center gap-3 text-xs text-stone-300 mb-4">
                {hero.vote_average > 0 && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-400/10 border border-amber-400/30 rounded-md text-amber-400 font-bold">
                    <Star className="w-3 h-3 fill-current" /> {hero.vote_average.toFixed(1)}
                  </span>
                )}
                {hero.release_date && <span>{hero.release_date.substring(0, 4)}</span>}
                {hero.first_air_date && <span>{hero.first_air_date.substring(0, 4)}</span>}
                {hero.overview && <span className="hidden md:inline text-stone-500">·</span>}
                <span className="hidden md:inline text-stone-400 line-clamp-1 max-w-md">{hero.overview}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setPlayMovie(hero)}
                  className="flex items-center gap-2 bg-white text-black px-7 py-3 rounded-xl font-bold text-sm hover:bg-stone-200 transition shadow-xl shadow-white/10"
                >
                  <Play className="w-5 h-5 fill-current" /> {t('movies.btn.play')}
                </button>
                <button
                  onClick={() => openDetail(hero)}
                  className="flex items-center gap-2 bg-white/15 backdrop-blur text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-white/25 transition border border-white/10"
                >
                  <Info className="w-5 h-5" /> {t('movies.btn.info')}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Search bar — sticky */}
      <div className="sticky top-0 z-30 bg-black/85 glass border-b border-white/5 px-6 md:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center gap-3">
          <h2 className="text-lg md:text-xl font-black tracking-tight hidden md:block shrink-0">{t('movies.title')}</h2>
          <div className="flex-1 md:max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('movies.search.placeholder')}
              className="w-full pl-10 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500 focus:bg-white/10 transition"
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-stone-500 shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{catalog.length > 0 ? `${catalog.length.toLocaleString('vi-VN')} phim & TV show` : 'Đang nạp kho phim…'}</span>
            <button
              onClick={() => setShowKeyBox(s => !s)}
              className={`ml-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${isDefaultTMDBKey() ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10' : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'}`}
              title="Dán TMDB API key của bạn để tìm toàn bộ phim trên TMDB"
            >
              🔑 {isDefaultTMDBKey() ? 'Cài TMDB key' : 'Key TMDB ✓'}
            </button>
          </div>
        </div>

        {/* Hộp nhập TMDB API key */}
        {showKeyBox && (
          <div className="max-w-7xl mx-auto mt-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-amber-500/5 border border-amber-500/25 rounded-xl p-3">
              <div className="flex-1">
                <div className="text-[11px] font-bold text-amber-400 mb-1">
                  {isDefaultTMDBKey() ? '⚠️ Bạn đang dùng key mặc định — chỉ tìm được trong 68 phim có sẵn. Dán key TMDB thật để tìm TOÀN BỘ phim:' : 'Thay đổi TMDB API key (lưu trên trình duyệt này):'}
                </div>
                <input
                  type="text" value={keyInput}
                  onChange={e => { setKeyInput(e.target.value); setKeyMsg(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') saveTMDBKey(); }}
                  placeholder="Dán key TMDB vào đây (vd: 1a2b3c4d...)" 
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                onClick={saveTMDBKey}
                disabled={keyChecking}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black disabled:opacity-50 whitespace-nowrap"
              >
                {keyChecking ? 'Đang kiểm tra…' : 'Lưu key & tìm lại'}
              </button>
            </div>
            {keyMsg && (
              <p className={`text-[11px] mt-1.5 ${keyMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{keyMsg.text}</p>
            )}
            <p className="text-[10px] text-stone-600 mt-1">Key miễn phí tại <span className="text-stone-500">themoviedb.org/settings/api</span> — dán vào đây, app lưu ngay trên trình duyệt bạn.</p>
          </div>
        )}

        {/* Genre chips */}
        {!search.trim() && genres.length > 0 && (
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto scrollbar-none mt-2.5 pb-0.5">
            <button
              onClick={() => setSelectedGenre('all')}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                selectedGenre === 'all' ? 'bg-red-600 text-white shadow-lg shadow-red-600/25' : 'bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10'
              }`}
            >
              {t('movies.genre.all')}
            </button>
            {genres.slice(0, 14).map(g => (
              <button
                key={g.id}
                onClick={() => { setSelectedGenre(String(g.id)); setVisibleCount(CATALOG_PAGE); }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                  selectedGenre === String(g.id) ? 'bg-red-600 text-white shadow-lg shadow-red-600/25' : 'bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search results */}
      {search.trim() ? (
        <div className="px-6 md:px-8 py-6 max-w-7xl mx-auto">
          <h3 className="text-sm font-semibold text-stone-400 mb-4">{t('movies.results')}: "{search}" ({searchResults.length})</h3>
          {searchResults.length === 0 ? (
            <div className="text-center py-16">
              <Film className="w-12 h-12 text-stone-700 mx-auto mb-3" />
              <p className="text-stone-500 text-sm">Không tìm thấy phim nào. Thử từ khóa khác.</p>
              {isDefaultTMDBKey() && !showKeyBox && (
                <button
                  onClick={() => setShowKeyBox(true)}
                  className="mt-4 px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400 text-xs font-bold hover:bg-amber-500/25 transition"
                >
                  🔑 Dán TMDB API key để tìm toàn bộ phim trên TMDB
                </button>
              )}
            </div>
          ) : (
            <div className={`grid gap-2.5 ${gridCls}`}>
              {searchResults.map(m => <MovieCard key={`${m.media_type}-${m.id}`} movie={m} onClick={() => openDetail(m)} />)}
            </div>
          )}
        </div>
      ) : (
        <div className="pb-20 space-y-10 pt-6">
          {/* Rows */}
          <MovieRow title={t('movies.row.trending')} items={rows.trending} gridCls={gridCls} onClick={openDetail} loading={loading} />
          <MovieRow title={t('movies.row.now_playing')} items={rows.nowPlaying} gridCls={gridCls} onClick={openDetail} loading={loading} />
          <MovieRow title={t('movies.row.top_rated')} items={rows.topRated} gridCls={gridCls} onClick={openDetail} loading={loading} />
          <MovieRow title={t('movies.row.upcoming')} items={rows.upcoming} gridCls={gridCls} onClick={openDetail} loading={loading} />
          <MovieRow title={t('movies.row.popular_tv')} items={rows.popularTV} gridCls={gridCls} onClick={openDetail} loading={loading} />

          {/* Full catalog */}
          <section className="px-6 md:px-8">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">Thư viện</p>
                <h3 className="text-xl md:text-2xl font-black tracking-tight">
                  {selectedGenre === 'all' ? 'Tất Cả Phim & TV Shows' : genres.find(g => String(g.id) === selectedGenre)?.name || 'Phim'}
                </h3>
                <p className="text-xs text-stone-500 mt-1">{filteredCatalog.length.toLocaleString('vi-VN')} tựa đề</p>
              </div>
            </div>

            {catalogLoading && filteredCatalog.length === 0 ? (
              <div className={`grid gap-2.5 ${gridCls}`}>
                {Array.from({ length: 18 }).map((_, i) => <MovieSkeleton key={i} />)}
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="text-center py-16">
                <Tv className="w-12 h-12 text-stone-700 mx-auto mb-3" />
                <p className="text-stone-500 text-sm">{t('movies.no_results')}</p>
              </div>
            ) : (
              <>
                <div className={`grid gap-2.5 ${gridCls}`}>
                  {visibleCatalog.map(m => <MovieCard key={`${m.media_type}-${m.id}`} movie={m} onClick={() => openDetail(m)} />)}
                </div>
                {visibleCount < filteredCatalog.length && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={() => setVisibleCount(c => c + CATALOG_PAGE)}
                      className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-bold rounded-xl transition flex items-center gap-2"
                    >
                      <Play className="w-4 h-4 rotate-90" /> {t('movies.load_more')} ({filteredCatalog.length - visibleCount})
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
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
      {playMovie && <MoviePlayerModal movie={playMovie} onClose={() => setPlayMovie(null)} />}
    </div>
  );
}

function MovieRow({ title, items, gridCls = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6', onClick, loading }) {
  return (
    <section className="px-6 md:px-8">
      <h3 className="text-base md:text-xl font-bold mb-3 tracking-tight">{title}</h3>
      <div className={`grid gap-2.5 ${gridCls}`}>
        {loading
          ? Array.from({ length: 12 }).map((_, i) => <MovieSkeleton key={i} />)
          : items.filter(m => m.poster_path).slice(0, 12).map(m => (
              <MovieCard key={`${m.media_type}-${m.id}`} movie={m} onClick={onClick} />
            ))}
      </div>
    </section>
  );
}

function MovieCard({ movie, onClick }) {
  const { t } = useI18n();
  const rating = movie.vote_average || 0;
  return (
    <button
      onClick={() => onClick(movie)}
      className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-stone-900 border border-white/5 transition-all duration-300 hover:scale-[1.04] hover:z-10 hover:border-red-500/40 hover:shadow-2xl hover:shadow-red-600/20"
    >
      <img
        src={imgPath(movie.poster_path, 'w342')}
        alt={movie.title || movie.name}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={e => { e.target.style.display = 'none'; }}
      />
      {/* Rating badge */}
      {rating > 0 && (
        <span className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur text-[10px] font-bold text-amber-400">
          <Star className="w-2.5 h-2.5 fill-current" /> {rating.toFixed(1)}
        </span>
      )}
      {/* Type badge */}
      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-red-600/90 text-[9px] font-bold uppercase tracking-wide">
        {movie.media_type === 'tv' ? 'TV' : 'Phim'}
      </span>

      {/* Hover overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-2.5 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[11px] font-bold leading-tight line-clamp-2">{movie.title || movie.name}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-600 text-[9px] font-bold">
              <Play className="w-2.5 h-2.5 fill-current" /> {t('movies.btn.play')}
          </span>
          <span className="text-[9px] text-stone-400">{(movie.release_date || movie.first_air_date || '').substring(0, 4)}</span>
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
              <div className="flex items-center gap-3 text-xs text-stone-400 mb-3 flex-wrap">
                {movie.vote_average > 0 && <span className="text-amber-400 font-bold flex items-center gap-1"><Star className="w-3 h-3 fill-current" />{movie.vote_average.toFixed(1)}</span>}
                {(movie.release_date || movie.first_air_date) && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{movie.release_date || movie.first_air_date}</span>}
                {movie.runtime > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{movie.runtime} phút</span>}
                {movie.media_type === 'tv' && <span className="flex items-center gap-1"><Tv className="w-3 h-3" /> TV Show</span>}
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
              ▶ {t('movies.btn.play')}
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
