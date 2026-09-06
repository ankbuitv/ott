import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Star, Play, X, Info, Calendar, Clock, Tv, Film, SlidersHorizontal, TrendingUp, Heart, History, Plus, Check, Crown, Mic, Share2, CalendarClock, Users, Layers, MessageCircle, Sparkles, Clapperboard } from 'lucide-react';
import { MovieAPI, imgPath, bgPath, COUNTRY_INFO, countryInfoOf, REGION_LIST, setTMDBRegion, getUpcoming, getMovieGenres, getTMDBKey, setTMDBKey, isDefaultTMDBKey, getCredits, getPerson, getPersonCredits, getRecommendations, getCollection, getMovieDetails, getTvDetails, discoverMovies } from '../services/tmdb';
import { getMovieHistory, recordMovieWatch, recordMovieProgress, fmtWatchSec, isWatched, toggleWatchlistLocal, fetchWatchlist } from '../services/movieList';
import { listenOnce, voiceSupported } from '../services/voice';
import ShareMovieModal, { movieDeepId } from './ShareMovieModal';
import UpcomingModal from './UpcomingModal';
import CommentsBox from './CommentsBox';
import FanGroupBox from './FanGroupBox';
import AdSlot from './AdSlot';
import { resolveCountry, currentCountry, setManualCountry } from '../services/geo';
import MoviePlayerModal from './MoviePlayerModal';
import { useDevice } from '../contexts/DeviceContext';
import { useToast } from '../contexts/ToastContext';
import { useProfile } from '../contexts/ProfileContext';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';

const CATALOG_PAGE = 30;

// Skeleton poster với hiệu ứng shimmer
function MovieSkeleton() {
  return (
    <div className="aspect-[2/3] rounded-xl overflow-hidden skeleton-shimmer border border-white/5">
      <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent"></div>
    </div>
  );
}

export default function MoviesScreen({ openMovie = null, onOpenMovieHandled, onRequireLogin } = {}) {
  const device = useDevice();
  const { addToast } = useToast();
  const { currentProfile } = useProfile();
  const { isAuthenticated, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Xem PHIM => bắt buộc đăng nhập (khách chỉ xem kênh truyền hình)
  const ensureAuthed = useCallback(() => {
    if (isAuthenticated) return true;
    onRequireLogin?.();
    return false;
  }, [isAuthenticated, onRequireLogin]);
  const { t, lang } = useI18n();

  // Quốc gia người xem → poster/khối phim đổi theo vùng.
  // Lần đầu: đoán từ timezone; ngay sau đó /api/geo (Cloudflare geo theo IP) chốt lại.
  const [country, setCountry] = useState(() => currentCountry());
  const countryInfo = countryInfoOf(country);
  const [regionOpen, setRegionOpen] = useState(false);
  const [tvLocal, setTvLocal] = useState(false); // hàng TV có đang hiện show bản địa không

  const applyRegion = useCallback((cc) => {
    setRegionOpen(false);
    if (!cc || cc === 'auto') {
      setManualCountry('');
      resolveCountry().then(resolved => {
        if (!resolved) return;
        setTMDBRegion(resolved);
        setCountry(resolved);
      });
      return;
    }
    setManualCountry(cc);
    setTMDBRegion(cc);
    setCountry(cc);
  }, []);

  const [hero, setHero] = useState(null);
  const [rows, setRows] = useState({ trending: [], nowPlaying: [], topRated: [], popularTV: [], upcoming: [] });
  const [topMonth, setTopMonth] = useState([]);
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
  // Tiếp tục xem phim + Danh sách của tôi (My List)
  const [movieHistory, setMovieHistory] = useState(() => getMovieHistory());
  const [myList, setMyList] = useState([]);
  const [heroTrailer, setHeroTrailer] = useState(null);
  const [shareMovie, setShareMovie] = useState(null);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [forYou, setForYou] = useState({ base: null, items: [] });
  const [cartoons, setCartoons] = useState([]);
  const [listening, setListening] = useState(false);

  useEffect(() => { fetchWatchlist().then((l) => setMyList(l)).catch(() => {}); }, []);

  // Refresh 2 hàng trên khi đóng modal phát/chi tiết
  const refreshMovieLists = useCallback(() => {
    setMovieHistory(getMovieHistory());
    fetchWatchlist().then((l) => setMyList(l)).catch(() => {});
  }, []);

  // Block kid profiles
  useEffect(() => {
    if (currentProfile?.is_child) addToast(t('toast.kid_blocked'), 'info');
  }, [currentProfile]);

  // Mở phim được chọn từ thanh tìm kiếm trên TopNav / deep link (?movie=tv-123)
  useEffect(() => {
    if (openMovie) {
      openDetail(openMovie);
      if (onOpenMovieHandled) onOpenMovieHandled();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMovie]);

  // Vì bạn đã xem... (gợi ý theo phim xem gần nhất) + Hoạt hình
  useEffect(() => {
    const base = movieHistory[0];
    if (base?.id) {
      getRecommendations(base.id, base.media_type === 'tv' ? 'tv' : 'movie')
        .then((r) => setForYou({ base, items: (r.results || []).filter((m) => m.poster_path).slice(0, 12) }))
        .catch(() => {});
    } else setForYou({ base: null, items: [] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieHistory.length]);
  useEffect(() => {
    discoverMovies({ with_genres: '16', sort_by: 'popularity.desc' }).then((r) => setCartoons((r.results || []).filter((m) => m.poster_path).slice(0, 18))).catch(() => {});
  }, [country]);

  // Chốt quốc gia theo IP thật qua /api/geo (Cloudflare gắn request.cf.country)
  // → khác với phỏng đoán timezone thì fetch lại toàn bộ khối phim theo region mới
  useEffect(() => {
    let on = true;
    resolveCountry().then(cc => {
      if (!on || !cc) return;
      setTMDBRegion(cc);
      setCountry(prev => (prev === cc ? prev : cc));
    });
    return () => { on = false; };
  }, []);

  // Fetch rows + genres + full catalog
  useEffect(() => {
    let mounted = true;
    setTMDBRegion(country); // ngôn ngữ + region TMDB theo quốc gia đang chọn
    (async () => {
      setLoading(true);
      const [heroR, npR, tR, tvR, upR, gR, tmR] = await Promise.all([
        MovieAPI.hero(country),
        MovieAPI.nowPlaying(country),
        MovieAPI.topRated(country),
        MovieAPI.popularTV(country),
        getUpcoming(country).catch(() => ({ results: [] })),
        getMovieGenres().catch(() => ({ genres: [] })),
        MovieAPI.topMonth(country).catch(() => ({ results: [] })),
      ]);
      if (!mounted) return;
      setTvLocal(!!(tvR && tvR.__local));
      const firstHero = heroR.results?.[0] || null;
      setHero(firstHero);
      // Trailer autoplay (muted) cho hero — Netflix style
      setHeroTrailer(null);
      if (firstHero) {
        MovieAPI.trailer(firstHero).then((v) => { if (mounted && v?.key) setHeroTrailer(v.key); }).catch(() => {});
      }
      setRows({ trending: [], nowPlaying: npR.results || [], topRated: tR.results || [], popularTV: tvR.results || [], upcoming: upR.results || [] });
      setTopMonth((tmR.results || []).slice(0, 10));
      setGenres(gR.genres || []);
      setLoading(false);
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // Load full catalog (background, không chặn UI) — trộn thêm phim theo region
  useEffect(() => {
    let mounted = true;
    setTMDBRegion(country);
    (async () => {
      setCatalogLoading(true);
      const r = await MovieAPI.catalog(country).catch(() => ({ results: [] }));
      if (!mounted) return;
      setCatalog(r.results || []);
      setCatalogLoading(false);
    })();
    return () => { mounted = false; };
  }, [country]);

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
  const voiceSearch = async () => {
    if (!voiceSupported()) { addToast(t('voice.unsupported'), 'error'); return; }
    setListening(true);
    try {
      const txt = await listenOnce({ lang: 'vi-VN', timeout: 9000 });
      if (txt) { setSearch(txt); addToast(`🎙️ ${txt}`, 'info'); }
    } finally { setListening(false); }
  };

  const saveTMDBKey = async () => {
    const k = keyInput.trim();
    if (!k) { setKeyMsg({ ok: false, text: t('mv.key_empty') }); return; }
    setKeyChecking(true);
    setKeyMsg(null);
    const v = await MovieAPI.verifyKey(k).catch(() => ({ ok: false, error: t('mv.net_err') }));
    setKeyChecking(false);
    if (v.ok) {
      setTMDBKey(k);
      setKeyInput('');
      setShowKeyBox(false);
      setKeyMsg({ ok: true, text: t('mv.key_ok') });
      setSearchNonce(n => n + 1); // ép tìm lại với key mới
      addToast(t('toast.tmdb_ok'), 'success');
    } else {
      setKeyMsg({ ok: false, text: t('mv.key_invalid', { s: v.status || '?', m: v.status_message || v.error || t('mv.key_try_other') }) });
    }
  };

  const openDetail = useCallback(async (movie) => {
    if (!movie || !movie.id) return;
    const type = movie.media_type === 'tv' ? 'tv' : 'movie';
    setSelected(movie);
    setTrailer(null);
    setTrailerLoading(true);
    // Deep link / gợi ý chỉ có id -> nạp đầy đủ chi tiết
    if (!movie.overview) {
      try {
        const full = type === 'tv' ? await getTvDetails(movie.id) : await getMovieDetails(movie.id);
        if (full?.id) {
          const merged = { ...full, id: full.id, media_type: type, title: full.title || full.name, name: full.name || full.title, genre_ids: (full.genres || []).map((g) => g.id) };
          setSelected(merged);
          movie = merged;
        }
      } catch (e) {}
    }
    try {
      const t = await MovieAPI.trailer(movie);
      setTrailer(t);
    } catch (e) {}
    setTrailerLoading(false);
  }, []);

  const isKid = !!currentProfile?.is_child;
  const kidSafe = useMemo(() => {
    if (!isKid) return catalog;
    // Bé: chỉ hoạt hình/gia đình, loại kinh dị/tội phạm
    return catalog.filter((m) => {
      const g = m.genre_ids || [];
      if (g.includes(27) || g.includes(80) || g.includes(53)) return false;
      return g.includes(16) || g.includes(10751) || g.includes(10762) || g.includes(12);
    });
  }, [catalog, isKid]);

  const filteredCatalog = useMemo(() => {
    const base = isKid ? kidSafe : catalog;
    if (selectedGenre === 'all') return base;
    const gid = Number(selectedGenre);
    return base.filter(m => (m.genre_ids || []).includes(gid));
  }, [catalog, kidSafe, isKid, selectedGenre]);

  const visibleCatalog = filteredCatalog.slice(0, visibleCount);

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
          {heroTrailer && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <iframe
                key={heroTrailer}
                src={`https://www.youtube.com/embed/${heroTrailer}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&loop=1&playlist=${heroTrailer}&playsinline=1&start=8`}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[177.78vh] min-h-[56.25vw] w-full h-full"
                style={{ filter: 'saturate(1.05)' }}
                allow="autoplay; encrypted-media"
                tabIndex={-1}
                title="trailer"
              />
            </div>
          )}
          <div className={`absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent ${heroTrailer ? 'via-black/70' : ''}`}></div>
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>

          <div className="relative h-full flex items-end pb-14 px-8 md:px-12 max-w-4xl">
            <div>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="px-2 py-0.5 bg-[#f36f21] text-[10px] font-bold rounded flex items-center gap-1">
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
                  onClick={() => { if (!ensureAuthed()) return; recordMovieWatch(hero); setPlayMovie(hero); }}
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

      {/* TOP 10 THÁNG NÀY — số viền trắng kiểu Netflix */}
      {!search.trim() && topMonth.length > 0 && (
        <section className="relative z-20 px-6 md:px-8 mt-5 mb-2">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-xl grad-brand flex items-center justify-center shadow-lg shadow-[#f36f21]/30">
                <Crown className="w-4 h-4 text-white" />
              </span>
              <div>
                <h3 className="text-lg md:text-2xl font-black tracking-tight leading-none">{t('mv.top10_title')}</h3>
                <p className="text-[10px] text-stone-500 font-semibold mt-0.5">{t('mv.top10_sub', { m: new Date().getMonth() + 1 })}</p>
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto scrollbar-none pb-3 pt-1 snap-x">
              {topMonth.map((m, i) => (
                <button
                  key={`${m.media_type}-${m.id}`}
                  onClick={() => openDetail(m)}
                  className="group relative shrink-0 flex items-end snap-start active:scale-[0.98] transition-transform"
                  title={m.title || m.name}
                >
                  <span
                    aria-hidden
                    className="font-black leading-[0.8] select-none -mr-4 md:-mr-5 mb-[-6px] z-0 transition-all group-hover:[-webkit-text-stroke-color:#f36f21]"
                    style={{
                      fontSize: 'clamp(96px, 12vw, 170px)',
                      color: 'transparent',
                      WebkitTextStroke: '3px rgba(255,255,255,.85)',
                      letterSpacing: '-0.05em',
                    }}
                  >{i + 1}</span>
                  <span className="relative z-10 block w-[112px] md:w-[148px] aspect-[2/3] rounded-xl overflow-hidden bg-stone-900 border border-white/10 shadow-2xl shadow-black/60 group-hover:border-[#f36f21]/60 transition-all">
                    <img
                      src={imgPath(m.poster_path, 'w342')}
                      alt={m.title || m.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-1.5 pt-6">
                      <span className="block text-[10px] md:text-[11px] font-bold leading-tight line-clamp-2 text-left">{m.title || m.name}</span>
                    </span>
                    {(m.vote_average || 0) > 0 && (
                      <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-bold text-amber-400">
                        <Star className="w-2 h-2 fill-current" /> {m.vote_average.toFixed(1)}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* QC */}
      {!search.trim() && (
        <div className="px-6 md:px-8 mt-4"><div className="max-w-7xl mx-auto"><AdSlot slot="movies" /></div></div>
      )}

      {/* Search bar — sticky */}
      <div className="sticky top-0 z-30 topbar-mytv px-6 md:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center gap-3">
          <h2 className="text-lg md:text-xl font-black tracking-tight hidden md:block shrink-0">{t('movies.title')}</h2>
          <div className="flex-1 md:max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={t('movies.search.placeholder')}
              className="w-full pl-10 pr-11 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-[#f36f21] focus:bg-white/10 transition"
            />
            <button
              onClick={voiceSearch}
              title={t('voice.search')}
              className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-stone-400 hover:text-white hover:bg-white/10'}`}
            >
              <Mic className="w-4 h-4" />
            </button>
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-stone-500 shrink-0 relative">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{catalog.length > 0 ? t('mv.n_titles', { n: catalog.length.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') }) : t('mv.loading_lib')}</span>
            {/* Chọn khu vực phim — mặc định tự theo vị trí địa lý của người xem */}
            <button
              onClick={() => setRegionOpen(s => !s)}
              className="px-2.5 py-1 rounded-lg border border-white/10 text-stone-300 hover:bg-white/10 text-[11px] font-bold transition-all whitespace-nowrap"
              title={t('movies.region.label')}
            >
              {countryInfo.flag} <span className="hidden md:inline">{countryInfo.name}</span> ▾
            </button>
            {regionOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setRegionOpen(false)}></div>
                <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-[#141419] border border-white/10 rounded-xl shadow-2xl p-3">
                  <p className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-2">{t('movies.region.label')}</p>
                  <button
                    onClick={() => applyRegion('auto')}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-[11px] font-bold mb-2 text-stone-300 hover:bg-white/10 transition-colors"
                  >
                    🌐 {t('movies.region.auto')}
                  </button>
                  <div className="grid grid-cols-4 gap-1">
                    {REGION_LIST.map(cc => {
                      const info = COUNTRY_INFO[cc];
                      const active = cc === country;
                      return (
                        <button
                          key={cc}
                          onClick={() => applyRegion(cc)}
                          className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${active ? 'bg-[#f36f21] text-white' : 'text-stone-400 hover:bg-white/10 hover:text-white'}`}
                          title={info.name}
                        >
                          <span className="text-base leading-none">{info.flag}</span>
                          {cc}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            {isAdmin && (
            <button
              onClick={() => setShowKeyBox(s => !s)}
              className={`ml-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all ${isDefaultTMDBKey() ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10' : 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10'}`}
              title={t('mv.key_title')}
            >
              🔑 {isDefaultTMDBKey() ? t('mv.key_setup') : t('mv.key_done')}
            </button>
            )}
          </div>
        </div>

        {/* Hộp nhập TMDB API key */}
        {isAdmin && showKeyBox && (
          <div className="max-w-7xl mx-auto mt-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-amber-500/5 border border-amber-500/25 rounded-xl p-3">
              <div className="flex-1">
                <div className="text-[11px] font-bold text-amber-400 mb-1">
                  {isDefaultTMDBKey() ? t('mv.key_warn') : t('mv.key_change')}
                </div>
                <input
                  type="text" value={keyInput}
                  onChange={e => { setKeyInput(e.target.value); setKeyMsg(null); }}
                  onKeyDown={e => { if (e.key === 'Enter') saveTMDBKey(); }}
                  placeholder={t('mv.key_ph')} 
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                onClick={saveTMDBKey}
                disabled={keyChecking}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black disabled:opacity-50 whitespace-nowrap"
              >
                {keyChecking ? t('mv.key_checking') : t('mv.key_save')}
              </button>
            </div>
            {keyMsg && (
              <p className={`text-[11px] mt-1.5 ${keyMsg.ok ? 'text-emerald-400' : 'text-[#ff9a3d]'}`}>{keyMsg.text}</p>
            )}
            <p className="text-[10px] text-stone-600 mt-1">{t('mv.key_free_at')} <span className="text-stone-500">themoviedb.org/settings/api</span> {t('mv.key_free_at2')}</p>
          </div>
        )}

        {/* Genre chips */}
        {!search.trim() && genres.length > 0 && (
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto scrollbar-none mt-2.5 pb-0.5">
            <button
              onClick={() => setSelectedGenre('all')}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                selectedGenre === 'all' ? 'bg-[#f36f21] text-white shadow-lg shadow-[#f36f21]/25' : 'bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10'
              }`}
            >
              {t('movies.genre.all')}
            </button>
            {genres.slice(0, 14).map(g => (
              <button
                key={g.id}
                onClick={() => { setSelectedGenre(String(g.id)); setVisibleCount(CATALOG_PAGE); }}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
                  selectedGenre === String(g.id) ? 'bg-[#f36f21] text-white shadow-lg shadow-[#f36f21]/25' : 'bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10'
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
              <p className="text-stone-500 text-sm">{t('mv.no_result')}</p>
              {isAdmin && isDefaultTMDBKey() && !showKeyBox && (
                <button
                  onClick={() => setShowKeyBox(true)}
                  className="mt-4 px-4 py-2 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-400 text-xs font-bold hover:bg-amber-500/25 transition"
                >
                  🔑 {t('mv.key_cta')}
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
          {/* Tiếp tục xem phim (giờ xem + tập đang dở) */}
          {movieHistory.length > 0 && (
            <MovieRow title={`⏪ ${t('mv.continue')}`} items={movieHistory} gridCls={gridCls} onClick={openDetail} loading={false} showProgress />
          )}
          {/* Vì bạn đã xem... */}
          {forYou.items.length > 0 && (
            <MovieRow title={`✨ ${t('mv.for_you', { name: forYou.base?.title || '' })}`} items={forYou.items} gridCls={gridCls} onClick={openDetail} loading={false} />
          )}
          {/* Danh sách của tôi (My List) */}
          {myList.length > 0 && (
            <MovieRow title={`❤️ ${t('mv.my_list')}`} items={myList} gridCls={gridCls} onClick={openDetail} loading={false} />
          )}
          {/* Rows — nội dung đổi theo quốc gia người xem */}
          <MovieRow title={t('movies.row.now_playing_in', { country: `${countryInfo.flag} ${countryInfo.name}` })} items={rows.nowPlaying} gridCls={gridCls} onClick={openDetail} loading={loading} />
          <MovieRow title={t('movies.row.top_rated')} items={rows.topRated} gridCls={gridCls} onClick={openDetail} loading={loading} />
          <MovieRow title={t('movies.row.upcoming')} items={rows.upcoming} gridCls={gridCls} onClick={openDetail} loading={loading} />
          <MovieRow
            title={tvLocal ? t('movies.row.local_tv', { country: `${countryInfo.flag} ${countryInfo.name}` }) : t('movies.row.popular_tv')}
            items={rows.popularTV} gridCls={gridCls} onClick={openDetail} loading={loading}
          />
          {/* Hoạt hình */}
          {cartoons.length > 0 && (
            <MovieRow title={`🎨 ${t('mv.cartoons')}`} items={cartoons} gridCls={gridCls} onClick={openDetail} loading={false} />
          )}
          {/* Lịch chiếu sắp tới */}
          {rows.upcoming.length > 0 && (
            <section className="px-6 md:px-8">
              <button onClick={() => setUpcomingOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[13px] font-bold hover:bg-sky-500/20 transition-all active:scale-[0.99]">
                <CalendarClock className="w-4 h-4" />{t('upcoming.open')} ({rows.upcoming.length})
              </button>
            </section>
          )}

          {/* Full catalog */}
          <section className="px-6 md:px-8">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[10px] text-[#ff9a3d] font-bold uppercase tracking-widest mb-1">{t('mv.library')}</p>
                <h3 className="text-xl md:text-2xl font-black tracking-tight">
                  {selectedGenre === 'all' ? t('mv.all_titles') : genres.find(g => String(g.id) === selectedGenre)?.name || t('nav.movies')}
                </h3>
                <p className="text-xs text-stone-500 mt-1">{t('mv.n_titles2', { n: filteredCatalog.length.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') })}</p>
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
          genres={genres}
          onClose={() => setSelected(null)}
          onPlay={() => { if (!ensureAuthed()) return; recordMovieWatch(selected); setPlayMovie(selected); }}
          onMovieChange={(m) => { openDetail(m); }}
          onListChanged={refreshMovieLists}
          onShare={(m) => setShareMovie(m)}
        />
      )}
      {shareMovie && <ShareMovieModal movie={shareMovie} onClose={() => setShareMovie(null)} />}
      {upcomingOpen && <UpcomingModal items={rows.upcoming} onClose={() => setUpcomingOpen(false)} onSelect={(m) => { setUpcomingOpen(false); openDetail(m); }} />}

      {/* Full-screen third-party player */}
      {playMovie && <MoviePlayerModal movie={playMovie} onClose={() => { setPlayMovie(null); refreshMovieLists(); }} />}
    </div>
  );
}

function MovieRow({ title, items, gridCls = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6', onClick, loading, showProgress }) {
  return (
    <section className="px-6 md:px-8">
      <h3 className="text-base md:text-xl font-bold mb-3 tracking-tight">{title}</h3>
      <div className={`grid gap-2.5 ${gridCls}`}>
        {loading
          ? Array.from({ length: 12 }).map((_, i) => <MovieSkeleton key={i} />)
          : items.filter(m => m.poster_path).slice(0, 12).map(m => (
              <MovieCard key={`${m.media_type}-${m.id}`} movie={m} onClick={onClick} showProgress={showProgress} />
            ))}
      </div>
    </section>
  );
}

function MovieCard({ movie, onClick, showProgress }) {
  const { t } = useI18n();
  const rating = movie.vote_average || 0;
  // Trailer tự phát khi rê chuột (desktop): đợi 900ms rồi tải
  const [hoverKey, setHoverKey] = React.useState(null);
  const hoverTimer = React.useRef(null);
  const onEnter = () => {
    if (window.matchMedia?.('(hover: none)').matches) return;
    hoverTimer.current = setTimeout(() => {
      MovieAPI.trailer(movie).then((v) => { if (v?.key) setHoverKey(v.key); }).catch(() => {});
    }, 900);
  };
  const onLeave = () => { clearTimeout(hoverTimer.current); setHoverKey(null); };
  React.useEffect(() => () => clearTimeout(hoverTimer.current), []);
  return (
    <button
      onClick={() => onClick(movie)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-stone-900 border border-white/5 transition-all duration-300 hover:scale-[1.04] hover:z-10 hover:border-[#f36f21]/40 hover:shadow-2xl hover:shadow-[#f36f21]/20"
    >
      <img
        src={imgPath(movie.poster_path, 'w342')}
        alt={movie.title || movie.name}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={e => { e.target.style.display = 'none'; }}
      />
      {hoverKey && (
        <span className="absolute inset-0 pointer-events-none">
          <iframe
            src={`https://www.youtube.com/embed/${hoverKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1`}
            className="w-full h-full"
            allow="autoplay; encrypted-media"
            title="preview"
          />
        </span>
      )}
      {showProgress && (movie.watchSec || 0) > 0 && (
        <span className="absolute bottom-0 inset-x-0 px-2 py-1 bg-gradient-to-t from-black to-transparent text-left">
          <span className="text-[9px] font-bold text-emerald-300">⏪ {t('mv.watched_for', { d: fmtWatchSec(movie.watchSec) })}{movie.episode ? ` · T${movie.episode}` : ''}</span>
          <span className="block h-1 mt-0.5 rounded-full bg-white/20 overflow-hidden">
            <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.round((movie.watchSec / 5400) * 100))}%` }} />
          </span>
        </span>
      )}
      {/* Rating badge */}
      {rating > 0 && (
        <span className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur text-[10px] font-bold text-amber-400">
          <Star className="w-2.5 h-2.5 fill-current" /> {rating.toFixed(1)}
        </span>
      )}
      {/* Type badge */}
      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-[#f36f21]/90 text-[9px] font-bold uppercase tracking-wide">
        {movie.media_type === 'tv' ? 'TV' : 'Phim'}
      </span>

      {/* Hover overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-2.5 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[11px] font-bold leading-tight line-clamp-2">{movie.title || movie.name}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#f36f21] text-[9px] font-bold">
              <Play className="w-2.5 h-2.5 fill-current" /> {t('movies.btn.play')}
          </span>
          <span className="text-[9px] text-stone-400">{(movie.release_date || movie.first_air_date || '').substring(0, 4)}</span>
        </div>
      </div>
    </button>
  );
}

// ===== CHI TIẾT PHIM — UI kiểu Netflix: hero trailer/backdrop tràn viền + poster nổi + pills =====
function MovieDetailModal({ movie, trailer, trailerLoading, genres = [], onClose, onPlay, onMovieChange, onListChanged, onShare }) {
  const { t } = useI18n();
  const [inList, setInList] = useState(() => isWatched(movie));
  const [cast, setCast] = useState([]);
  const [recs, setRecs] = useState([]);
  const [collection, setCollection] = useState(null);
  const [person, setPerson] = useState(null); // PersonModal data

  // Tải cast + recommendations + collection khi mở/đổi phim
  useEffect(() => {
    setCast([]); setRecs([]); setCollection(null); setInList(isWatched(movie));
    const type = movie.media_type === 'tv' ? 'tv' : 'movie';
    getCredits(movie.id, type).then((r) => setCast((r.cast || []).slice(0, 14))).catch(() => {});
    getRecommendations(movie.id, type).then((r) => setRecs((r.results || []).filter((m) => m.poster_path).slice(0, 14))).catch(() => {});
    if (type === 'movie' && movie.belongs_to_collection?.id) {
      getCollection(movie.belongs_to_collection.id).then((r) => setCollection(r?.parts ? r : null)).catch(() => {});
    }
  }, [movie.id, movie.media_type]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleList = () => {
    const now = toggleWatchlistLocal(movie);
    setInList(now);
    onListChanged?.();
  };

  const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const gnames = (movie.genre_ids || []).map((gid) => genres.find((x) => x.id === gid)?.name).filter(Boolean);

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm overflow-y-auto anim-zoom-fade" onClick={onClose}>
      <div className="relative max-w-5xl mx-auto my-4 md:my-8 bg-[#0f1015] rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,.7)] border border-white/[0.07]" onClick={e => e.stopPropagation()}>
        {/* ===== HERO: trailer/backdrop tràn viền ===== */}
        <div className="relative h-[300px] md:h-[440px] bg-black">
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
              {trailerLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3">
                  <div className="w-12 h-12 border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[11px] text-stone-500 font-bold">{t('app.loading')}</span>
                </div>
              )}
            </>
          )}
          {/* phủ gradient về nền modal */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(15,16,21,.55) 0%, transparent 30%, transparent 55%, #0f1015 100%)' }} />
          {/* top bar */}
          <div className="absolute top-0 inset-x-0 flex items-center justify-between p-3.5">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur border border-white/15 text-[10px] font-black tracking-widest text-white">
              {movie.media_type === 'tv' ? <Tv className="w-3.5 h-3.5 text-[#ff9a3d]" /> : <Film className="w-3.5 h-3.5 text-[#ff9a3d]" />}
              {movie.media_type === 'tv' ? 'TV SHOW' : 'MOVIE'}
            </span>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 hover:bg-black/85 flex items-center justify-center text-white transition active:scale-90">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ===== INFO nổi trên hero ===== */}
        <div className="relative px-5 md:px-8 -mt-28 md:-mt-36">
          <div className="flex gap-4 md:gap-6 items-end">
            <img src={imgPath(movie.poster_path, 'w342')} alt="" className="w-28 md:w-44 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,.6)] ring-1 ring-white/20 shrink-0" />
            <div className="flex-1 min-w-0 pb-1">
              <h2 className="text-2xl md:text-4xl font-black tracking-tight text-white leading-tight drop-shadow-lg">{movie.title || movie.name}</h2>
              {(movie.original_title || movie.original_name) && (movie.original_title || movie.original_name) !== (movie.title || movie.name) && (
                <p className="text-[12px] text-stone-400 font-medium mt-0.5 truncate">{movie.original_title || movie.original_name}</p>
              )}
              {/* meta pills */}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                {movie.vote_average > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-black">
                    <Star className="w-3 h-3 fill-current" />{movie.vote_average.toFixed(1)}
                  </span>
                )}
                {year && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-stone-200 text-[11px] font-bold">
                    <Calendar className="w-3 h-3" />{year}
                  </span>
                )}
                {movie.runtime > 0 && (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-stone-200 text-[11px] font-bold">
                    <Clock className="w-3 h-3" />{t('mv.n_min', { n: movie.runtime })}
                  </span>
                )}
                {gnames.slice(0, 3).map((g) => (
                  <span key={g} className="px-2.5 py-1 rounded-full bg-[#f36f21]/12 border border-[#f36f21]/30 text-[#ffb37a] text-[11px] font-bold">#{g}</span>
                ))}
              </div>
            </div>
          </div>

          {/* actions */}
          <div className="flex gap-2 mt-5">
            <button onClick={onPlay} className="flex-1 px-6 py-3.5 grad-brand text-white font-black rounded-2xl flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-[#f36f21]/30 text-[15px]">
              <Play className="w-5 h-5 fill-current" />{t('movies.btn.play')}
            </button>
            <button
              onClick={toggleList}
              title={inList ? t('mv.remove_list') : t('mv.add_list')}
              className={`px-4 py-3.5 font-bold rounded-2xl flex items-center gap-2 border transition active:scale-95 ${inList ? 'bg-[#f36f21]/15 text-[#ff9a3d] border-[#f36f21]/40' : 'bg-white/[0.06] text-stone-200 border-white/10 hover:bg-white/[0.12]'}`}
            >
              {inList ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              <span className="hidden sm:inline text-[13px]">{inList ? t('mv.following') : 'My List'}</span>
            </button>
            <button
              onClick={() => onShare && onShare(movie)}
              title={t('share.share')}
              className="px-4 py-3.5 font-bold rounded-2xl flex items-center border bg-white/[0.06] text-stone-200 border-white/10 hover:bg-white/[0.12] transition active:scale-95"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>

          {/* overview */}
          {movie.overview && (
            <p className="text-[13px] md:text-sm text-stone-300 leading-relaxed mt-4">{movie.overview}</p>
          )}
        </div>

        <div className="px-5 md:px-8 pb-7">
          {/* Cast — avatar tròn */}
          {cast.length > 0 && (
            <div className="mt-6">
              <h4 className="flex items-center gap-2 text-[13px] font-black text-white mb-3">
                <span className="w-7 h-7 rounded-lg bg-[#f36f21]/15 border border-[#f36f21]/30 flex items-center justify-center"><Users className="w-3.5 h-3.5 text-[#ff9a3d]" /></span>
                {t('mv.cast')}
              </h4>
              <div className="flex gap-3.5 overflow-x-auto pb-2 scrollbar-none">
                {cast.map((c) => (
                  <button key={`${c.id}-${c.credit_id}`} onClick={() => { c.id && getPerson(c.id).then((p) => setPerson(p)).catch(() => {}); }} className="w-[72px] shrink-0 text-center group">
                    <img
                      src={c.profile_path ? imgPath(c.profile_path, 'w185') : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="72" height="72"%3E%3Crect fill="%23272727" width="72" height="72"/%3E%3C/svg%3E'}
                      alt={c.name}
                      className="w-[72px] h-[72px] object-cover rounded-full border-2 border-white/10 group-hover:border-[#f36f21] group-hover:scale-105 transition shadow-lg"
                      loading="lazy"
                    />
                    <p className="text-[10px] font-bold mt-1.5 truncate text-stone-200">{c.name}</p>
                    <p className="text-[9px] text-stone-500 truncate">{c.character}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Collection (franchise) */}
          {collection && (
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <h4 className="flex items-center gap-2 text-[13px] font-black text-white mb-3">
                <span className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center"><Layers className="w-3.5 h-3.5 text-violet-300" /></span>
                <span className="truncate">{t('mv.part_of', { name: movie.belongs_to_collection?.name })}</span>
              </h4>
              <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                {collection.parts.filter((m) => m.poster_path).sort((a, b) => (a.release_date || '').localeCompare(b.release_date || '')).map((m) => (
                  <button key={m.id} onClick={() => onMovieChange?.({ ...m, media_type: 'movie', overview: m.overview || '' })} className="w-24 shrink-0 group text-left">
                    <img src={imgPath(m.poster_path, 'w185')} alt={m.title} className="w-24 h-36 object-cover rounded-xl border border-white/10 group-hover:border-[#f36f21]/60 group-hover:scale-[1.03] transition shadow" loading="lazy" />
                    <p className="text-[10px] font-semibold mt-1 truncate text-stone-300">{m.title}</p>
                    <p className="text-[9px] text-stone-600">{(m.release_date || '').slice(0, 4)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Nhóm fan + Bình luận */}
          <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <h4 className="flex items-center gap-2 text-[13px] font-black text-white mb-3">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><MessageCircle className="w-3.5 h-3.5 text-emerald-300" /></span>
              {t('mv.community')}
            </h4>
            <FanGroupBox target={movieDeepId(movie)} name={movie.title || movie.name} />
            <div className="mt-3">
              <CommentsBox target={movieDeepId(movie)} />
            </div>
          </div>

          {/* Recommendations */}
          {recs.length > 0 && (
            <div className="mt-6">
              <h4 className="flex items-center gap-2 text-[13px] font-black text-white mb-3">
                <span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Sparkles className="w-3.5 h-3.5 text-amber-300" /></span>
                {t('mv.similar')}
              </h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                {recs.map((m) => (
                  <button key={`${m.media_type || 'movie'}-${m.id}`} onClick={() => onMovieChange?.({ ...m, media_type: m.media_type || (m.title ? 'movie' : 'tv'), overview: m.overview || '' })} className="group text-left">
                    <div className="relative">
                      <img src={imgPath(m.poster_path, 'w185')} alt={m.title || m.name} className="w-full aspect-[2/3] object-cover rounded-xl border border-white/10 group-hover:border-[#f36f21]/60 group-hover:scale-[1.03] transition shadow" loading="lazy" />
                      {(m.vote_average || 0) > 0 && (
                        <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 text-amber-300 text-[9px] font-black">
                          <Star className="w-2.5 h-2.5 fill-current" />{m.vote_average.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] font-semibold mt-1 truncate text-stone-300">{m.title || m.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Person modal */}
      {person && (
        <PersonModal person={person} onClose={() => setPerson(null)} onMovieChange={(m) => { setPerson(null); onMovieChange?.(m); }} />
      )}
    </div>
  );
}

// ===== CHI TIẾT DIỄN VIÊN — hero gradient + avatar lớn (fix crash: thiếu useI18n) =====
function PersonModal({ person, onClose, onMovieChange }) {
  const { t } = useI18n();
  const [credits, setCredits] = useState([]);
  useEffect(() => {
    getPersonCredits(person.id).then((r) => {
      const list = (r.cast || [])
        .filter((m) => m.poster_path)
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, 18);
      setCredits(list);
    }).catch(() => {});
  }, [person.id]);

  const dept = person.known_for_department === 'Acting' ? t('mv.actor') : (person.known_for_department || t('mv.artist'));

  return (
    <div className="fixed inset-0 z-[220] bg-black/90 backdrop-blur-sm overflow-y-auto anim-zoom-fade" onClick={onClose}>
      <div className="relative max-w-3xl mx-auto my-6 md:my-10 bg-[#0f1015] rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,.7)] border border-white/[0.07]" onClick={(e) => e.stopPropagation()}>
        {/* hero gradient */}
        <div className="relative h-[150px] md:h-[180px] overflow-hidden" style={{ background: 'linear-gradient(120deg,#2b1410,#101828 60%,#1a1030)' }}>
          {person.profile_path && (
            <img src={imgPath(person.profile_path, 'w185')} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 blur-2xl scale-125" />
          )}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 20%, #0f1015 100%)' }} />
          <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 hover:bg-black/85 flex items-center justify-center text-white transition active:scale-90">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* info */}
        <div className="relative px-5 md:px-7 -mt-16 md:-mt-20 pb-6">
          <div className="flex gap-4 items-end">
            <img
              src={person.profile_path ? imgPath(person.profile_path, 'w342') : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="240"%3E%3Crect fill="%231c1d24" width="160" height="240"/%3E%3C/svg%3E'}
              alt={person.name}
              className="w-32 md:w-40 aspect-[2/3] object-cover rounded-2xl ring-2 ring-white/20 shadow-[0_16px_40px_rgba(0,0,0,.6)] shrink-0 bg-[#1c1d24]"
            />
            <div className="flex-1 min-w-0 pb-1">
              <span className="inline-block px-2.5 py-1 rounded-full bg-[#f36f21]/15 border border-[#f36f21]/40 text-[#ffb37a] text-[10px] font-black tracking-widest mb-2">{dept.toUpperCase()}</span>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white leading-tight">{person.name}</h2>
              {(person.birthday || person.place_of_birth) && (
                <p className="text-[12px] text-stone-400 mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {person.birthday && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{t('mv.born', { d: person.birthday })}</span>}
                  {person.place_of_birth && <span className="truncate">📍 {person.place_of_birth}</span>}
                </p>
              )}
            </div>
          </div>
          {person.biography ? (
            <p className="text-[13px] text-stone-300 leading-relaxed mt-4 max-h-[130px] overflow-y-auto pr-1">{person.biography}</p>
          ) : (
            <p className="text-[12px] text-stone-500 mt-4 italic">{t('mv.no_bio')}</p>
          )}
          {/* filmography */}
          <h4 className="flex items-center gap-2 text-[13px] font-black text-white mt-5 mb-3">
            <span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Clapperboard className="w-3.5 h-3.5 text-amber-300" /></span>
            {t('mv.filmography')}
          </h4>
          {credits.length === 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] rounded-xl bg-white/[0.05] animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {credits.map((m) => (
                <button key={`${m.id}-${m.credit_id}`} onClick={() => onMovieChange({ ...m, media_type: m.media_type || (m.title ? 'movie' : 'tv'), overview: m.overview || '' })} className="group text-left">
                  <div className="relative">
                    <img src={imgPath(m.poster_path, 'w185')} alt={m.title || m.name} className="w-full aspect-[2/3] object-cover rounded-xl border border-white/10 group-hover:border-[#f36f21]/60 group-hover:scale-[1.03] transition shadow" loading="lazy" />
                    {(m.vote_average || 0) > 0 && (
                      <span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 text-amber-300 text-[9px] font-black">
                        <Star className="w-2.5 h-2.5 fill-current" />{m.vote_average.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-semibold mt-1 truncate text-stone-300">{m.title || m.name}</p>
                  <p className="text-[9px] text-stone-600 truncate">{m.character || ''}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
