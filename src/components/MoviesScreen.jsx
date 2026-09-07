import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Search, Star, Play, X, Info, Calendar, Clock, Tv, Film, SlidersHorizontal, TrendingUp, Heart, History, Plus, Check, Crown, Mic, Share2, CalendarClock, Users, Layers, MessageCircle, Sparkles, Clapperboard, ChevronLeft, ChevronRight, Ticket, Radio, BadgeCheck } from 'lucide-react';
import { MovieAPI, imgPath, bgPath, COUNTRY_INFO, countryInfoOf, REGION_LIST, setTMDBRegion, getUpcoming, getMovieGenres, getCredits, getPerson, getPersonCredits, getRecommendations, getCollection, getMovieDetails, getTvDetails, discoverMovies } from '../services/tmdb';
import { getMovieHistory, recordMovieWatch, recordMovieProgress, fmtWatchSec, isWatched, toggleWatchlistLocal, fetchWatchlist } from '../services/movieList';
import { listenOnce, voiceSupported } from '../services/voice';
import ShareMovieModal, { movieDeepId } from './ShareMovieModal';
import { CodesModal, ResumeModal } from './Pack48Ui';
import { WatchStatusBar, FollowSeriesBtn, useSeriesFollows, watchPlanOf, RouletteModal, WrappedModal, AdvancedFilters, AffiliateChips, HotCountryRow, AgeBadge } from './MoviesPack';
import UpcomingModal from './UpcomingModal';
import CommentsBox from './CommentsBox';
import FanGroupBox from './FanGroupBox';
import AdSlot from './AdSlot';
import { resolveCountry, currentCountry, setManualCountry } from '../services/geo';
import { getHomePrefs } from '../services/prefs';
import MoviePlayerModal from './MoviePlayerModal';
import { hasPlayableSources } from '../services/embeds';
import { releaseState } from '../utils/release';
import { API_BASE } from '../services/config';
import { authHeaders } from '../services/session';
import { runPreroll } from '../services/prerollGate';
import { useDevice } from '../contexts/DeviceContext';
import { useToast } from '../contexts/ToastContext';
import { useProfile } from '../contexts/ProfileContext';
import { useI18n } from '../contexts/I18nContext';
import { useAuth } from '../contexts/AuthContext';

const CATALOG_PAGE = 30;

function MovieSkeleton() {
  return (
    <div className="aspect-[2/3] rounded-xl overflow-hidden skeleton-shimmer border border-white/5">
      <div className="absolute bottom-0 inset-x-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent"></div>
    </div>
  );
}

function HScroll({ children, className = '' }) {
  const ref = useRef(null);
  const scroll = (dir) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(300, el.clientWidth * 0.75), behavior: 'smooth' });
  };
  return (
    <div className={`relative group/hscroll ${className}`}>
      <button onClick={() => scroll(-1)} className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/70 border border-white/15 text-white items-center justify-center hover:bg-black/90 backdrop-blur transition-all opacity-0 group-hover/hscroll:opacity-100 active:scale-90 -ml-2">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <div ref={ref} className="flex gap-1 overflow-x-auto scrollbar-none pb-3 pt-1 snap-x scroll-smooth">
        {children}
      </div>
      <button onClick={() => scroll(1)} className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/70 border border-white/15 text-white items-center justify-center hover:bg-black/90 backdrop-blur transition-all opacity-0 group-hover/hscroll:opacity-100 active:scale-90 -mr-2">
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

export default function MoviesScreen({ openMovie = null, onOpenMovieHandled, onRequireLogin, onGoTab = null, onOpenChannel = null } = {}) {
  const device = useDevice();
  const { addToast } = useToast();
  const { currentProfile } = useProfile();
  const { isAuthenticated } = useAuth();
  const ensureAuthed = useCallback(() => {
    if (isAuthenticated) return true;
    onRequireLogin?.();
    return false;
  }, [isAuthenticated, onRequireLogin]);
  const { t, lang } = useI18n();

  const [country, setCountry] = useState(() => currentCountry());
  const countryInfo = countryInfoOf(country);
  const [regionOpen, setRegionOpen] = useState(false);
  const [tvLocal, setTvLocal] = useState(false);

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
  const [catalog, setCatalog] = useState([]);
  const [genres, setGenres] = useState([]);
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE);
  const [selectedGenre, setSelectedGenre] = useState('all');

  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState(null);
  const [playMovie, setPlayMovie] = useState(null);
  // phim đang mở có nguồn phát thật chưa (null = chưa kiểm tra xong) -> đổi nhãn
  // nút CTA + quyết định có chạy pre-roll hay không
  const [hasSource, setHasSource] = useState(null);
  const [trailer, setTrailer] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [movieHistory, setMovieHistory] = useState(() => getMovieHistory());
  const [myList, setMyList] = useState([]);
  const [heroTrailer, setHeroTrailer] = useState(null);
  const [shareMovie, setShareMovie] = useState(null);
  const [codesOpen, setCodesOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [rouletteOpen, setRouletteOpen] = useState(false);
  const [wrappedOpen, setWrappedOpen] = useState(false);
  const [filtOpen, setFiltOpen] = useState(false);
  const [advFilter, setAdvFilter] = useState(null);
  const [homePrefs, setHomePrefs] = useState(() => getHomePrefs());
  const advOn = !!(advFilter && (advFilter.year || advFilter.rating || advFilter.sort));
  const [forYou, setForYou] = useState({ base: null, items: [] });
  const [cartoons, setCartoons] = useState([]);
  const [listening, setListening] = useState(false);

  useEffect(() => { fetchWatchlist().then((l) => setMyList(l)).catch(() => {}); }, []);

  // (#8) Theo dõi series: cảnh báo "TẬP MỚI" 1 lần/session khi TMDB có tập mới
  const rootSf = useSeriesFollows();
  useEffect(() => {
    const ids = Object.keys(rootSf.fresh);
    if (!ids.length) return;
    try {
      const seen = JSON.parse(localStorage.getItem('chrtv_fresh_toast') || '[]');
      let changed = false;
      ids.forEach((id) => {
        if (!seen.includes(id)) {
          const f = rootSf.fresh[id];
          addToast(`🔔 Series #${id} có TẬP MỚI — S${f.season}E${f.episode}!`, 'info');
          seen.push(id); changed = true;
        }
      });
      if (changed) localStorage.setItem('chrtv_fresh_toast', JSON.stringify(seen));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootSf.fresh]);

  const refreshMovieLists = useCallback(() => {
    setMovieHistory(getMovieHistory());
    fetchWatchlist().then((l) => setMyList(l)).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentProfile?.is_child) addToast(t('toast.kid_blocked'), 'info');
  }, [currentProfile]);

  useEffect(() => {
    if (openMovie) {
      openDetail(openMovie);
      if (onOpenMovieHandled) onOpenMovieHandled();
    }
  }, [openMovie]);

  useEffect(() => {
    const base = movieHistory[0];
    if (base?.id) {
      getRecommendations(base.id, base.media_type === 'tv' ? 'tv' : 'movie')
        .then((r) => setForYou({ base, items: (r.results || []).filter((m) => m.poster_path).slice(0, 20) }))
        .catch(() => {});
    } else setForYou({ base: null, items: [] });
  }, [movieHistory.length]);

  useEffect(() => {
    discoverMovies({ with_genres: '16', sort_by: 'popularity.desc' }).then((r) => setCartoons((r.results || []).filter((m) => m.poster_path).slice(0, 24))).catch(() => {});
  }, [country]);

  useEffect(() => {
    let on = true;
    resolveCountry().then(cc => {
      if (!on || !cc) return;
      setTMDBRegion(cc);
      setCountry(prev => (prev === cc ? prev : cc));
    });
    return () => { on = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    setTMDBRegion(country);
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
  }, [country]);

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

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); setSearching(false); return; }
    setSearching(true);
    const q = search.trim();
    const ql = q.toLowerCase();
    const t = setTimeout(async () => {
      const local = catalog.filter(m => (m.title || m.name || '').toLowerCase().includes(ql)).slice(0, 40);
      const r = await MovieAPI.search(q).catch(() => ({ results: [] }));
      const seen = new Set(local.map(m => `${m.media_type}-${m.id}`));
      const remote = (r.results || []).filter(m => {
        const k = `${m.media_type}-${m.id}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return m.media_type === 'movie' || m.media_type === 'tv';
      });
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
  }, [search, catalog]);

  // (#64) Xu hướng tìm kiếm + (#62) kết quả kênh/creator/shorts trộn chung
  const [trending, setTrending] = useState([]);
  const [combined, setCombined] = useState({ ch: [], cr: [], sh: [] });
  const loggedQ = useRef('');
  const combinedTick = useRef(0);
  useEffect(() => {
    fetch(`${API_BASE}/api/stats/trending-search?limit=12`, { headers: { Accept: 'application/json' } })
      .then(r => r.json()).then(d => setTrending(d.trending || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || q === loggedQ.current) return;
    loggedQ.current = q;
    fetch(`${API_BASE}/api/stats/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q }) }).catch(() => {});
  }, [search]);

  // (#62) Kết quả kênh/creator/shorts theo cùng cụm tìm — phục vụ khi có kết quả phim
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setCombined({ ch: [], cr: [], sh: [] }); return; }
    const ql = q.toLowerCase();
    const timer = setTimeout(() => {
      const tick = ++combinedTick.current;
      (async () => {
        let ch = [], cr = [], sh = [];
        try {
          const r = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } }).then(x => x.json());
          ch = (r.results || []).slice(0, 8);
        } catch {}
        try {
          const r = await fetch(`${API_BASE}/api/shorts/creators`, { headers: { Accept: 'application/json' } }).then(x => x.json());
          cr = (r.creators || []).filter(c => ((c.handle || '') + ' ' + (c.display_name || '') + ' ' + (c.bio || '')).toLowerCase().includes(ql)).slice(0, 6);
        } catch {}
        try {
          const r = await fetch(`${API_BASE}/api/shorts?limit=60`, { headers: { Accept: 'application/json' } }).then(x => x.json());
          sh = (r.shorts || []).filter(s => ((s.title || '') + ' ' + (s.caption || '')).toLowerCase().includes(ql)).slice(0, 4);
        } catch {}
        if (tick === combinedTick.current) setCombined({ ch, cr, sh });
      })();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const voiceSearch = async () => {
    if (!voiceSupported()) { addToast(t('voice.unsupported'), 'error'); return; }
    setListening(true);
    try {
      const txt = await listenOnce({ lang: 'vi-VN', timeout: 9000 });
      if (txt) { setSearch(txt); addToast(`🎙️ ${txt}`, 'info'); }
    } finally { setListening(false); }
  };

  const openDetail = useCallback(async (movie) => {
    if (!movie || !movie.id) return;
    const type = movie.media_type === 'tv' ? 'tv' : 'movie';
    setSelected(movie);
    setTrailer(null);
    setTrailerLoading(true);
    setHasSource(null);
    hasPlayableSources(movie).then(setHasSource).catch(() => setHasSource(false));
    if (!movie.overview) {
      try {
        const full = type === 'tv' ? await getTvDetails(movie.id) : await getMovieDetails(movie.id);
        if (full?.id) {
          const merged = { ...full, id: full.id, media_type: type, title: full.title || full.name, name: full.name || full.title, genre_ids: (full.genres || []).map((g) => g.id) };
          setSelected(merged);
          movie = merged;
        }
      } catch {}
    }
    try {
      const t = await MovieAPI.trailer(movie);
      setTrailer(t);
    } catch {}
    setTrailerLoading(false);
  }, []);

  /**
   * Bấm "Xem phim" (hero hoặc modal thông tin). Ba nhánh, theo đúng thực tế:
   *   1. Chưa khởi chiếu  -> không mở player, chỉ toast ngày chiếu (modal đã có trailer).
   *   2. Có rồi, chưa có nguồn -> mở player nhưng nó tự chiếu TRAILER; KHÔNG chạy
   *      pre-roll và KHÔNG tính giờ xem (đừng bắt người ta xem quảng cáo 30s cho
   *      thứ không xem được).
   *   3. Có nguồn -> pre-roll theo gói rồi phát.
   */
  const playMovieClick = useCallback(async (m) => {
    if (!m) return;
    const rs = releaseState(m);
    if (!rs.released) {
      addToast(t('movies.toast.upcoming', { date: rs.dateLabel || '—' }), 'info');
      openDetail(m);
      return;
    }
    if (!ensureAuthed()) return;
    let ok = hasSource;
    if (ok === null || ok === undefined) { ok = await hasPlayableSources(m).catch(() => false); setHasSource(ok); }
    if (!ok) {
      addToast(t('movies.toast.no_source'), 'info');
      setPlayMovie(m);
      return;
    }
    recordMovieWatch(m);
    await runPreroll('movie', String(m?.id || ''));
    setPlayMovie(m);
  }, [addToast, t, ensureAuthed, openDetail, hasSource]);

  /** Nhập mã chia sẻ (#A) — mở thẳng đúng phim/tập từ mã 6 ký tự. */
  const openMovieFromCode = useCallback(async (it) => {
    if (!it || !it.tmdb_id) return;
    if (!ensureAuthed()) return;
    setCodesOpen(false);
    setSelected(null);
    const isTv = it.media_type === 'tv';
    setPlayMovie({
      id: Number(it.tmdb_id),
      media_type: isTv ? 'tv' : 'movie',
      title: it.title || '',
      season: isTv ? (Number(it.season) || 1) : 1,
      episode: isTv ? (Number(it.episode) || 1) : 1,
    });
  }, [ensureAuthed]);

  /** Resume đa thiết bị (#7): TV mở đúng tập/phim đang dở. */
  const resumeFromCode = useCallback(async (item) => {
    if (!item || !item.tmdb_id) return;
    if (!ensureAuthed()) return;
    setResumeOpen(false);
    const isTv = item.media_type === 'tv';
    setSelected(null);
    setPlayMovie({
      id: Number(item.tmdb_id),
      media_type: isTv ? 'tv' : 'movie',
      title: item.title || '',
      season: isTv ? (Number(item.season) || 1) : 1,
      episode: isTv ? (Number(item.episode) || 1) : 1,
    });
  }, [ensureAuthed]);

  const isKid = !!currentProfile?.is_child;
  const kidSafe = useMemo(() => {
    if (!isKid) return catalog;
    return catalog.filter((m) => {
      const g = m.genre_ids || [];
      if (g.includes(27) || g.includes(80) || g.includes(53)) return false;
      return g.includes(16) || g.includes(10751) || g.includes(10762) || g.includes(12);
    });
  }, [catalog, isKid]);

  const filteredCatalog = useMemo(() => {
    let base = isKid ? kidSafe : catalog;
    if (selectedGenre !== 'all') {
      const gid = Number(selectedGenre);
      base = base.filter(m => (m.genre_ids || []).includes(gid));
    }
    // (#28) Lọc nâng cao: năm + điểm tối thiểu
    if (advOn) {
      if (advFilter.year) base = base.filter(m => String((m.release_date || m.first_air_date || '')).slice(0, 4) === advFilter.year);
      if (advFilter.rating) base = base.filter(m => (m.vote_average || 0) >= advFilter.rating);
    }
    // (#61) Cá nhân hoá: ưu tiên phim thuộc thể loại người dùng chọn trong quiz
    const fav = homePrefs.favGenres || [];
    if (fav.length > 1 && !isKid) {
      const score = (m) => (m.genre_ids || []).reduce((s, g) => s + (fav.includes(g) ? 1 : 0), 0);
      base = [...base].sort((a, b) => score(b) - score(a) || ((b.vote_average || 0) - (a.vote_average || 0)));
    } else if (advFilter?.sort === 'rating') {
      base = [...base].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    } else if (advFilter?.sort === 'year') {
      base = [...base].sort((a, b) => String(b.release_date || b.first_air_date || '').localeCompare(String(a.release_date || a.first_air_date || '')));
    }
    return base;
  }, [catalog, kidSafe, isKid, selectedGenre, advFilter, advOn, homePrefs]);

  const visibleCatalog = filteredCatalog.slice(0, visibleCount);
  const gridCls = device.isMobile ? 'grid-cols-2' : device.isTablet ? 'grid-cols-3' : 'lg:grid-cols-6 grid-cols-3';

  return (
    <div className="flex-1 bg-black text-white overflow-y-auto">
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
                <button onClick={() => playMovieClick(hero)} className="flex items-center gap-2 bg-white text-black px-7 py-3 rounded-xl font-bold text-sm hover:bg-stone-200 transition shadow-xl shadow-white/10">
                  {releaseState(hero).released ? <Play className="w-5 h-5 fill-current" /> : <Clapperboard className="w-5 h-5" />} {releaseState(hero).released ? t('movies.btn.play') : t('movies.btn.trailer')}
                </button>
                <button onClick={() => openDetail(hero)} className="flex items-center gap-2 bg-white/15 backdrop-blur text-white px-6 py-3 rounded-xl font-bold text-sm hover:bg-white/25 transition border border-white/10">
                  <Info className="w-5 h-5" /> {t('movies.btn.info')}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* (#64) Xu hướng tìm kiếm — bấm chip để tìm luôn */}
      {!search.trim() && trending.length > 0 && (
        <section className="px-6 md:px-8 mt-4">
          <div className="max-w-7xl mx-auto flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1">🔥 {t('p48.trending')}</span>
            {trending.map((x) => (
              <button key={x.query} onClick={() => setSearch(x.query)} className="shrink-0 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/10 text-[11px] font-bold text-stone-300 hover:border-[#ff9a3d]/50 hover:text-white active:scale-95 transition">
                {x.query} <span className="text-[9px] text-stone-600">({x.cnt})</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* TOP 10 với mũi tên */}
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
            <HScroll>
              {topMonth.map((m, i) => (
                <button key={`${m.media_type}-${m.id}`} onClick={() => openDetail(m)} className="group relative shrink-0 flex items-end snap-start active:scale-[0.98] transition-transform">
                  <span aria-hidden className="font-black leading-[0.8] select-none -mr-4 md:-mr-5 mb-[-6px] z-0 transition-all group-hover:[-webkit-text-stroke-color:#f36f21]" style={{ fontSize: 'clamp(96px, 12vw, 170px)', color: 'transparent', WebkitTextStroke: '3px rgba(255,255,255,.85)', letterSpacing: '-0.05em' }}>{i + 1}</span>
                  <span className="relative z-10 block w-[112px] md:w-[148px] aspect-[2/3] rounded-xl overflow-hidden bg-stone-900 border border-white/10 shadow-2xl shadow-black/60 group-hover:border-[#f36f21]/60 transition-all">
                    <img src={imgPath(m.poster_path, 'w342')} alt={m.title || m.name} className="w-full h-full object-cover" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />
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
            </HScroll>
          </div>
        </section>
      )}

      {!search.trim() && (<div className="px-6 md:px-8 mt-4"><div className="max-w-7xl mx-auto"><AdSlot slot="movies" /></div></div>)}

      <div className="sticky top-0 z-30 topbar-mytv px-6 md:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center gap-3">
          <h2 className="text-lg md:text-xl font-black tracking-tight hidden md:block shrink-0">{t('movies.title')}</h2>
          <div className="flex-1 md:max-w-xl relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('movies.search.placeholder')} className="w-full pl-10 pr-11 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-[#f36f21] focus:bg-white/10 transition" />
            <button onClick={voiceSearch} title={t('voice.search')} className={`absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all ${listening ? 'bg-red-500 text-white animate-pulse' : 'bg-white/5 text-stone-400 hover:text-white hover:bg-white/10'}`}>
              <Mic className="w-4 h-4" />
            </button>
            {searching && (<div className="absolute right-12 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>)}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-stone-500 shrink-0 relative">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{catalog.length > 0 ? t('mv.n_titles', { n: catalog.length.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') }) : t('mv.loading_lib')}</span>
            <button onClick={() => setRegionOpen(s => !s)} className="px-2.5 py-1 rounded-lg border border-white/10 text-stone-300 hover:bg-white/10 text-[11px] font-bold transition-all whitespace-nowrap" title={t('movies.region.label')}>
              {countryInfo.flag} <span className="hidden md:inline">{countryInfo.name}</span> ▾
            </button>
            {regionOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setRegionOpen(false)}></div>
                <div className="absolute right-0 top-full mt-2 z-50 w-64 bg-[#141419] border border-white/10 rounded-xl shadow-2xl p-3">
                  <p className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-2">{t('movies.region.label')}</p>
                  <button onClick={() => applyRegion('auto')} className="w-full text-left px-2.5 py-2 rounded-lg text-[11px] font-bold mb-2 text-stone-300 hover:bg-white/10 transition-colors">🌐 {t('movies.region.auto')}</button>
                  <div className="grid grid-cols-4 gap-1">
                    {REGION_LIST.map(cc => {
                      const info = COUNTRY_INFO[cc];
                      const active = cc === country;
                      return (
                        <button key={cc} onClick={() => applyRegion(cc)} className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-lg text-[10px] font-bold transition-colors ${active ? 'bg-[#f36f21] text-white' : 'text-stone-400 hover:bg-white/10 hover:text-white'}`} title={info.name}>
                          <span className="text-base leading-none">{info.flag}</span>{cc}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {!search.trim() && genres.length > 0 && (
          <div className="max-w-7xl mx-auto mt-2.5">
            <HScroll className="pb-1">
              <button onClick={() => setSelectedGenre('all')} className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all snap-start ${selectedGenre === 'all' ? 'bg-[#f36f21] text-white shadow-lg shadow-[#f36f21]/25' : 'bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10'}`}>{t('movies.genre.all')}</button>
              {genres.slice(0, 20).map(g => (
                <button key={g.id} onClick={() => { setSelectedGenre(String(g.id)); setVisibleCount(CATALOG_PAGE); }} className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all snap-start ${selectedGenre === String(g.id) ? 'bg-[#f36f21] text-white shadow-lg shadow-[#f36f21]/25' : 'bg-white/5 hover:bg-white/10 text-stone-400 hover:text-white border border-white/10'}`}>{g.name}</button>
              ))}
            </HScroll>
          </div>
        )}
      </div>

      {/* (#5) Đang hot tại 🇻🇳 — top kênh theo quốc gia của người xem */}
      {!search.trim() && <HotCountryRow onOpenChannel={() => { addToast('Mở kênh này ở tab Truyền hình nhé 📺', 'info'); }} />}
      {search.trim() ? (
        <div className="px-6 md:px-8 py-6 max-w-7xl mx-auto">
          <h3 className="text-sm font-semibold text-stone-400 mb-4">{t('movies.results')}: "{search}" ({searchResults.length})</h3>
          {(combined.ch.length > 0 || combined.cr.length > 0 || combined.sh.length > 0) && (
            <div className="mb-5 space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
              {combined.ch.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1.5">📺 {t('nav.live')} · {t('p48.tv_kw')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {combined.ch.map(c => (
                      <button key={c.channel_id} onClick={() => { onOpenChannel && onOpenChannel(c); if (onGoTab) onGoTab('tv'); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-bold text-stone-200 hover:border-[#f36f21]/60 hover:text-white active:scale-95">
                        {c.logo ? <img src={c.logo} alt="" className="w-4 h-4 rounded object-contain" onError={e => e.target.style.display = 'none'} /> : <Radio className="w-3.5 h-3.5 text-[#ff9a3d]" />}
                        {c.name} <span className="text-[9px] text-stone-600">{c.group_title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {combined.cr.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1.5">⭐ Creator trên Shorts</p>
                  <div className="flex flex-wrap gap-1.5">
                    {combined.cr.map(c => (
                      <button key={c.id} onClick={() => { addToast(`Mở tab Shorts → tìm @${c.handle} nhé`, 'info'); if (onGoTab) onGoTab('shorts'); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-bold text-stone-200 hover:border-[#ff9a3d]/60 active:scale-95">
                        {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" onError={e => e.target.style.display = 'none'} /> : <BadgeCheck className="w-3.5 h-3.5 text-sky-300" />}
                        @{c.handle || c.display_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {combined.sh.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1.5">🎬 Shorts trùng từ khoá</p>
                  <div className="flex flex-wrap gap-1.5">
                    {combined.sh.map(sh => (
                      <button key={sh.id} onClick={() => { if (onGoTab) onGoTab('shorts'); addToast(`Short #${sh.id}: ${String(sh.title || '').slice(0, 40)}`, 'info'); }}
                        className="px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-bold text-stone-300 hover:border-[#ff9a3d]/60 active:scale-95">
                        ▶ {(sh.title || sh.caption || '').slice(0, 40)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {searchResults.length === 0 ? (
            <div className="text-center py-16"><Film className="w-12 h-12 text-stone-700 mx-auto mb-3" /><p className="text-stone-500 text-sm">{t('mv.no_result')}</p></div>
          ) : (<div className={`grid gap-2.5 ${gridCls}`}>{searchResults.map(m => <MovieCard key={`${m.media_type}-${m.id}`} movie={m} onClick={() => openDetail(m)} />)}</div>)}
        </div>
      ) : (
        <div className="pb-20 space-y-10 pt-6">
          {movieHistory.length > 0 && (<MovieRow title={`⏪ ${t('mv.continue')}`} items={movieHistory} onClick={openDetail} loading={false} showProgress />)}
          {forYou.items.length > 0 && (<MovieRow title={`✨ ${t('mv.for_you', { name: forYou.base?.title || '' })}`} items={forYou.items} onClick={openDetail} loading={false} />)}
          {myList.length > 0 && (<MovieRow title={`❤️ ${t('mv.my_list')}`} items={myList} onClick={openDetail} loading={false} />)}
          <MovieRow title={t('movies.row.now_playing_in', { country: `${countryInfo.flag} ${countryInfo.name}` })} items={rows.nowPlaying} onClick={openDetail} loading={loading} />
          <MovieRow title={t('movies.row.top_rated')} items={rows.topRated} onClick={openDetail} loading={loading} />
          <MovieRow title={t('movies.row.upcoming')} items={rows.upcoming} onClick={openDetail} loading={loading} />
          <MovieRow title={tvLocal ? t('movies.row.local_tv', { country: `${countryInfo.flag} ${countryInfo.name}` }) : t('movies.row.popular_tv')} items={rows.popularTV} onClick={openDetail} loading={loading} />
          {cartoons.length > 0 && (<MovieRow title={`🎨 ${t('mv.cartoons')}`} items={cartoons} onClick={openDetail} loading={false} />)}
          {rows.upcoming.length > 0 && (
            <section className="px-6 md:px-8"><button onClick={() => setUpcomingOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[13px] font-bold hover:bg-sky-500/20 transition-all active:scale-[0.99]"><CalendarClock className="w-4 h-4" />{t('upcoming.open')} ({rows.upcoming.length})</button></section>
          )}
          <section className="px-6 md:px-8">
            <div className="flex items-end justify-between mb-4">
              <div><p className="text-[10px] text-[#ff9a3d] font-bold uppercase tracking-widest mb-1">{t('mv.library')}</p><h3 className="text-xl md:text-2xl font-black tracking-tight">{selectedGenre === 'all' ? t('mv.all_titles') : genres.find(g => String(g.id) === selectedGenre)?.name || t('nav.movies')}</h3><p className="text-xs text-stone-500 mt-1">{t('mv.n_titles2', { n: filteredCatalog.length.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') })}</p></div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <button onClick={() => setFiltOpen(true)} className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-[11px] font-black transition active:scale-95 ${advOn ? 'bg-sky-500/20 border-sky-500/40 text-sky-300' : 'bg-white/[0.05] border-white/10 text-stone-400 hover:text-white'}`} title="Lọc năm/điểm"><SlidersHorizontal className="w-3.5 h-3.5" />Lọc{advOn ? ' ✓' : ''}</button>
              <button onClick={() => setRouletteOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/[0.05] border border-white/10 text-stone-300 hover:border-[#ff9a3d]/50 hover:text-white text-[11px] font-black transition active:scale-95" title="Quay số chọn phim theo tâm trạng">🎲 Quay số</button>
              {isAuthenticated && <button onClick={() => setWrappedOpen(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-gradient-to-r from-amber-500/20 to-[#f36f21]/20 border border-amber-500/30 text-amber-300 text-[11px] font-black transition active:scale-95" title="Tổng kết năm xem phim">✨ {t('p48.wrapped_btn')}</button>}
            </div>
            </div>
            {catalogLoading && filteredCatalog.length === 0 ? (<div className={`grid gap-2.5 ${gridCls}`}>{Array.from({ length: 18 }).map((_, i) => <MovieSkeleton key={i} />)}</div>) : filteredCatalog.length === 0 ? (<div className="text-center py-16"><Tv className="w-12 h-12 text-stone-700 mx-auto mb-3" /><p className="text-stone-500 text-sm">{t('movies.no_results')}</p></div>) : (
              <><div className={`grid gap-2.5 ${gridCls}`}>{visibleCatalog.map(m => <MovieCard key={`${m.media_type}-${m.id}`} movie={m} onClick={() => openDetail(m)} />)}</div>{visibleCount < filteredCatalog.length && (<div className="flex justify-center mt-8"><button onClick={() => setVisibleCount(c => c + CATALOG_PAGE)} className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-bold rounded-xl transition flex items-center gap-2"><Play className="w-4 h-4 rotate-90" /> {t('movies.load_more')} ({filteredCatalog.length - visibleCount})</button></div>)}</>
            )}
          </section>
        </div>
      )}

      {selected && (<MovieDetailModal movie={selected} trailer={trailer} trailerLoading={trailerLoading} genres={genres} hasSource={hasSource} onClose={() => setSelected(null)} onPlay={() => playMovieClick(selected)} onMovieChange={(m) => { openDetail(m); }} onListChanged={refreshMovieLists} onShare={(m) => setShareMovie(m)} />)}
      {shareMovie && <ShareMovieModal movie={shareMovie} onClose={() => setShareMovie(null)} />}
      {upcomingOpen && <UpcomingModal items={rows.upcoming} onClose={() => setUpcomingOpen(false)} onSelect={(m) => { setUpcomingOpen(false); openDetail(m); }} />}
      {playMovie && <MoviePlayerModal movie={playMovie} onClose={() => { setPlayMovie(null); refreshMovieLists(); }} />}

      {/* (A) Nhập mã chia sẻ + (#7) Đồng bộ TV — vào nhanh từ tab Phim */}
      <div className="fixed bottom-24 right-3 md:right-5 z-[130] flex flex-col gap-2 items-end pointer-events-none">
        <button onClick={() => setResumeOpen(true)} className="pointer-events-auto flex items-center gap-2 pl-3.5 pr-4 py-2.5 rounded-full bg-black/70 border border-white/15 backdrop-blur text-white text-[11px] font-black hover:border-[#f36f21]/60 transition active:scale-95 shadow-xl shadow-black/40" title={t('p48.resume_code_title')}>
          <Tv className="w-4 h-4 text-[#ff9a3d]" /> {t('p48.resume_code_title')}
        </button>
        <button onClick={() => setCodesOpen(true)} className="pointer-events-auto flex items-center gap-2 pl-3.5 pr-4 py-2.5 rounded-full grad-brand text-white text-[11px] font-black hover:brightness-110 transition active:scale-95 shadow-xl shadow-black/40" title={t('p48.enter_code')}>
          <Ticket className="w-4 h-4" /> {t('p48.enter_code')}
        </button>
      </div>
      {codesOpen && (
        <CodesModal
          open
          mode="redeem"
          onClose={() => setCodesOpen(false)}
          onOpenMovie={openMovieFromCode}
          onPartyCode={() => addToast('Vào tab Truyền hình → bấm "👥 Xem chung" → dán mã phòng', 'info')}
          onOpenPlaylist={() => addToast('Playlist bạn bè sẽ mở tại đây — đang hoàn thiện', 'info')}
        />
      )}
      {resumeOpen && <ResumeModal open onClose={() => setResumeOpen(false)} onResumeMovie={resumeFromCode} />}

      {/* (#66) Quay số theo tâm trạng + (#84) Wrapped + (#28) lọc nâng cao */}
      {rouletteOpen && <RouletteModal open pool={isKid ? kidSafe : catalog} onClose={() => setRouletteOpen(false)} onPick={(m) => { setRouletteOpen(false); openDetail(m); }} />}
      {wrappedOpen && <WrappedModal open onClose={() => setWrappedOpen(false)} />}
      {filtOpen && <AdvancedFilters open current={advFilter} onClose={() => setFiltOpen(false)} onApply={(f) => setAdvFilter(f)} onClear={() => setAdvFilter(null)} />}
    </div>
  );
}

function MovieRow({ title, items, onClick, loading, showProgress }) {
  const ref = useRef(null);
  const scroll = (dir) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * 400, behavior: 'smooth' });
  };
  return (
    <section className="px-6 md:px-8 relative group/row">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base md:text-xl font-bold tracking-tight">{title}</h3>
        <div className="hidden md:flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition">
          <button onClick={() => scroll(-1)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border border-white/10"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => scroll(1)} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border border-white/10"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="relative">
        <div ref={ref} className="flex gap-2.5 overflow-x-auto scrollbar-none pb-2 scroll-smooth snap-x">
          {loading ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="w-[132px] md:w-[168px] shrink-0 snap-start"><MovieSkeleton /></div>) : items.filter(m => m.poster_path).slice(0, 24).map(m => (<div key={`${m.media_type}-${m.id}`} className="w-[132px] md:w-[168px] shrink-0 snap-start"><MovieCard movie={m} onClick={onClick} showProgress={showProgress} /></div>))}
        </div>
      </div>
    </section>
  );
}

function MovieCard({ movie, onClick, showProgress }) {
  const { t } = useI18n();
  const rs = releaseState(movie);
  const rating = movie.vote_average || 0;
  const [hoverKey, setHoverKey] = React.useState(null);
  const hoverTimer = React.useRef(null);
  const onEnter = () => {
    if (window.matchMedia?.('(hover: none)').matches) return;
    hoverTimer.current = setTimeout(() => { MovieAPI.trailer(movie).then((v) => { if (v?.key) setHoverKey(v.key); }).catch(() => {}); }, 900);
  };
  const onLeave = () => { clearTimeout(hoverTimer.current); setHoverKey(null); };
  React.useEffect(() => () => clearTimeout(hoverTimer.current), []);
  return (
    <button onClick={() => onClick(movie)} onMouseEnter={onEnter} onMouseLeave={onLeave} className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-stone-900 border border-white/5 transition-all duration-300 hover:scale-[1.04] hover:z-10 hover:border-[#f36f21]/40 hover:shadow-2xl hover:shadow-[#f36f21]/20 w-full">
      <img src={imgPath(movie.poster_path, 'w342')} alt={movie.title || movie.name} className="w-full h-full object-cover" loading="lazy" onError={e => { e.target.style.display = 'none'; }} />
      {hoverKey && (<span className="absolute inset-0 pointer-events-none"><iframe src={`https://www.youtube.com/embed/${hoverKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1`} className="w-full h-full" allow="autoplay; encrypted-media" title="preview" /></span>)}
      {showProgress && (movie.watchSec || 0) > 0 && (<span className="absolute bottom-0 inset-x-0 px-2 py-1 bg-gradient-to-t from-black to-transparent text-left"><span className="text-[9px] font-bold text-emerald-300">⏪ {t('mv.watched_for', { d: fmtWatchSec(movie.watchSec) })}{movie.episode ? ` · T${movie.episode}` : ''}</span><span className="block h-1 mt-0.5 rounded-full bg-white/20 overflow-hidden"><span className="block h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.round((movie.watchSec / 5400) * 100))}%` }} /></span></span>)}
      {rating > 0 && (<span className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur text-[10px] font-bold text-amber-400"><Star className="w-2.5 h-2.5 fill-current" /> {rating.toFixed(1)}</span>)}
      {/* Chưa khởi chiếu -> ghi thẳng ngày chiếu lên card, user khỏi phải bấm thử */}
      <span className="absolute top-2 left-2 flex flex-col items-start gap-1">
        <span className="px-1.5 py-0.5 rounded-md bg-[#f36f21]/90 text-[9px] font-bold uppercase tracking-wide">{movie.media_type === 'tv' ? 'TV' : 'Phim'}</span>
        {!rs.released && (
          <span className="px-1.5 py-0.5 rounded-md bg-black/80 border border-sky-400/40 text-[9px] font-bold text-sky-300">
            {rs.dateLabel ? `${t('movies.badge.soon')} · ${rs.dateLabel}` : t('movies.badge.soon')}
          </span>
        )}
      </span>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-2.5 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-[11px] font-bold leading-tight line-clamp-2">{movie.title || movie.name}</p>
        <div className="flex items-center gap-2 mt-1.5"><span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#f36f21] text-[9px] font-bold">{rs.released ? <Play className="w-2.5 h-2.5 fill-current" /> : <Clapperboard className="w-2.5 h-2.5" />} {rs.released ? t('movies.btn.play') : t('movies.btn.trailer')}</span><span className="text-[9px] text-stone-400">{(movie.release_date || movie.first_air_date || '').substring(0, 4)}</span></div>
      </div>
    </button>
  );
}

function MovieDetailModal({ movie, trailer, trailerLoading, genres = [], hasSource, onClose, onPlay, onMovieChange, onListChanged, onShare }) {
  const { t } = useI18n();
  const sf = useSeriesFollows(); // (#8) follow series → fresh map "TẬP MỚI"
  const [watchSt, setWatchSt] = useState(() => watchPlanOf(movie)?.s || null);
  const rs = releaseState(movie);
  // Nhãn CTA nói đúng cái user sẽ nhận được, không phải lời hứa "Xem phim" chung chung
  const ctaLabel = !rs.released || hasSource === false ? t('movies.btn.trailer') : t('movies.btn.play');
  const statusChip = !rs.released
    ? (rs.dateLabel ? t('movies.status.premiere', { date: rs.dateLabel }) : t('movies.badge.soon'))
    : hasSource === false ? t('movies.status.no_source') : '';
  const [inList, setInList] = useState(() => isWatched(movie));
  const [cast, setCast] = useState([]);
  const [recs, setRecs] = useState([]);
  const [collection, setCollection] = useState(null);
  const [person, setPerson] = useState(null);
  useEffect(() => {
    setCast([]); setRecs([]); setCollection(null); setInList(isWatched(movie));
    const type = movie.media_type === 'tv' ? 'tv' : 'movie';
    getCredits(movie.id, type).then((r) => setCast((r.cast || []).slice(0, 20))).catch(() => {});
    getRecommendations(movie.id, type).then((r) => setRecs((r.results || []).filter((m) => m.poster_path).slice(0, 20))).catch(() => {});
    if (type === 'movie' && movie.belongs_to_collection?.id) { getCollection(movie.belongs_to_collection.id).then((r) => setCollection(r?.parts ? r : null)).catch(() => {}); }
  }, [movie.id, movie.media_type]);
  const toggleList = () => { const now = toggleWatchlistLocal(movie); setInList(now); onListChanged?.(); };
  const year = (movie.release_date || movie.first_air_date || '').slice(0, 4);
  const gnames = (movie.genre_ids || []).map((gid) => genres.find((x) => x.id === gid)?.name).filter(Boolean);
  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm overflow-y-auto anim-zoom-fade" onClick={onClose}>
      <div className="relative max-w-5xl mx-auto my-4 md:my-8 bg-[#0f1015] rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,.7)] border border-white/[0.07]" onClick={e => e.stopPropagation()}>
        <div className="relative h-[300px] md:h-[440px] bg-black">
          {trailer ? (<iframe src={`https://www.youtube.com/embed/${trailer.key}?autoplay=1&modestbranding=1&rel=0`} className="w-full h-full" allow="autoplay; encrypted-media" allowFullScreen />) : (<><img src={bgPath(movie.backdrop_path || movie.poster_path)} alt="" className="w-full h-full object-cover" />{trailerLoading && (<div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3"><div className="w-12 h-12 border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div><span className="text-[11px] text-stone-500 font-bold">{t('app.loading')}</span></div>)}</>)}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(15,16,21,.55) 0%, transparent 30%, transparent 55%, #0f1015 100%)' }} />
          <div className="absolute top-0 inset-x-0 flex items-center justify-between p-3.5">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur border border-white/15 text-[10px] font-black tracking-widest text-white">{movie.media_type === 'tv' ? <Tv className="w-3.5 h-3.5 text-[#ff9a3d]" /> : <Film className="w-3.5 h-3.5 text-[#ff9a3d]" />}{movie.media_type === 'tv' ? 'TV SHOW' : 'MOVIE'}</span>
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 hover:bg-black/85 flex items-center justify-center text-white transition active:scale-90"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="relative px-5 md:px-8 -mt-28 md:-mt-36">
          <div className="flex gap-4 md:gap-6 items-end">
            <img src={imgPath(movie.poster_path, 'w342')} alt="" className="w-28 md:w-44 rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,.6)] ring-1 ring-white/20 shrink-0" />
            <div className="flex-1 min-w-0 pb-1">
              <h2 className="text-2xl md:text-4xl font-black tracking-tight text-white leading-tight drop-shadow-lg">{movie.title || movie.name}</h2>
              {(movie.original_title || movie.original_name) && (movie.original_title || movie.original_name) !== (movie.title || movie.name) && (<p className="text-[12px] text-stone-400 font-medium mt-0.5 truncate">{movie.original_title || movie.original_name}</p>)}
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                {movie.vote_average > 0 && (<span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-[11px] font-black"><Star className="w-3 h-3 fill-current" />{movie.vote_average.toFixed(1)}</span>)}
                {year && (<span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-stone-200 text-[11px] font-bold"><Calendar className="w-3 h-3" />{year}</span>)}
                <AgeBadge movie={movie} />
                {movie.runtime > 0 && (<span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.07] border border-white/10 text-stone-200 text-[11px] font-bold"><Clock className="w-3 h-3" />{t('mv.n_min', { n: movie.runtime })}</span>)}
                {gnames.slice(0, 3).map((g) => (<span key={g} className="px-2.5 py-1 rounded-full bg-[#f36f21]/12 border border-[#f36f21]/30 text-[#ffb37a] text-[11px] font-bold">#{g}</span>))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={onPlay} className="flex-1 px-6 py-3.5 grad-brand text-white font-black rounded-2xl flex items-center justify-center gap-2 transition active:scale-[0.98] shadow-lg shadow-[#f36f21]/30 text-[15px]">{(!rs.released || hasSource === false) ? <Clapperboard className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}{ctaLabel}</button>
            <button onClick={toggleList} title={inList ? t('mv.remove_list') : t('mv.add_list')} className={`px-4 py-3.5 font-bold rounded-2xl flex items-center gap-2 border transition active:scale-95 ${inList ? 'bg-[#f36f21]/15 text-[#ff9a3d] border-[#f36f21]/40' : 'bg-white/[0.06] text-stone-200 border-white/10 hover:bg-white/[0.12]'}`}>{inList ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}<span className="hidden sm:inline text-[13px]">{inList ? t('mv.following') : 'My List'}</span></button>
            <button onClick={() => onShare && onShare(movie)} title={t('share.share')} className="px-4 py-3.5 font-bold rounded-2xl flex items-center border bg-white/[0.06] text-stone-200 border-white/10 hover:bg-white/[0.12] transition active:scale-95"><Share2 className="w-5 h-5" /></button>
          </div>
          {statusChip && (
            <p className={`mt-2.5 flex items-center gap-1.5 text-[11px] font-bold ${!rs.released ? 'text-sky-300' : 'text-amber-300/90'}`}>
              <Info className="w-3.5 h-3.5 shrink-0" />{statusChip}
            </p>
          )}
          {/* (#27) Kế hoạch xem + (#8) Follow series + (#85) affiliate */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <WatchStatusBar movie={movie} onChange={setWatchSt} />
            {movie.media_type === 'tv' && (
              <FollowSeriesBtn movie={movie} follows={sf.follows} fresh={sf.fresh} onToggle={sf.toggle} />
            )}
            <div className="ml-auto"><AffiliateChips movie={movie} /></div>
          </div>
          {movie.overview && (<p className="text-[13px] md:text-sm text-stone-300 leading-relaxed mt-4">{movie.overview}</p>)}
          {watchSt && (
            <p className="mt-1 text-[10px] text-stone-500 font-bold">{watchSt === 'want' ? '🎬 Trong "Muốn xem" của bạn' : watchSt === 'watching' ? '▶️ Bạn đang xem bộ này' : '✅ Bạn đã xem xong bộ này'}</p>
          )}
        </div>
        <div className="px-5 md:px-8 pb-7">
          {cast.length > 0 && (
            <div className="mt-6">
              <h4 className="flex items-center gap-2 text-[13px] font-black text-white mb-3"><span className="w-7 h-7 rounded-lg bg-[#f36f21]/15 border border-[#f36f21]/30 flex items-center justify-center"><Users className="w-3.5 h-3.5 text-[#ff9a3d]" /></span>{t('mv.cast')}</h4>
              <HScroll>{cast.map((c) => (<button key={`${c.id}-${c.credit_id}`} onClick={() => { c.id && getPerson(c.id).then((p) => setPerson(p)).catch(() => {}); }} className="w-[72px] shrink-0 text-center group snap-start"><img src={c.profile_path ? imgPath(c.profile_path, 'w185') : 'data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"72\" height=\"72\"%3E%3Crect fill=\"%23272727\" width=\"72\" height=\"72\"/%3E%3C/svg%3E'} alt={c.name} className="w-[72px] h-[72px] object-cover rounded-full border-2 border-white/10 group-hover:border-[#f36f21] group-hover:scale-105 transition shadow-lg" loading="lazy" /><p className="text-[10px] font-bold mt-1.5 truncate text-stone-200">{c.name}</p><p className="text-[9px] text-stone-500 truncate">{c.character}</p></button>))}</HScroll>
            </div>
          )}
          {collection && (
            <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <h4 className="flex items-center gap-2 text-[13px] font-black text-white mb-3"><span className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center"><Layers className="w-3.5 h-3.5 text-violet-300" /></span><span className="truncate">{t('mv.part_of', { name: movie.belongs_to_collection?.name })}</span></h4>
              <HScroll>{collection.parts.filter((m) => m.poster_path).sort((a, b) => (a.release_date || '').localeCompare(b.release_date || '')).map((m) => (<button key={m.id} onClick={() => onMovieChange?.({ ...m, media_type: 'movie', overview: m.overview || '' })} className="w-24 shrink-0 group text-left snap-start"><img src={imgPath(m.poster_path, 'w185')} alt={m.title} className="w-24 h-36 object-cover rounded-xl border border-white/10 group-hover:border-[#f36f21]/60 group-hover:scale-[1.03] transition shadow" loading="lazy" /><p className="text-[10px] font-semibold mt-1 truncate text-stone-300">{m.title}</p><p className="text-[9px] text-stone-600">{(m.release_date || '').slice(0, 4)}</p></button>))}</HScroll>
            </div>
          )}
          <div className="mt-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <h4 className="flex items-center gap-2 text-[13px] font-black text-white mb-3"><span className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center"><MessageCircle className="w-3.5 h-3.5 text-emerald-300" /></span>{t('mv.community')}</h4>
            <FanGroupBox target={movieDeepId(movie)} name={movie.title || movie.name} />
            <div className="mt-3"><CommentsBox target={movieDeepId(movie)} /></div>
          </div>
          {recs.length > 0 && (
            <div className="mt-6">
              <h4 className="flex items-center gap-2 text-[13px] font-black text-white mb-3"><span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Sparkles className="w-3.5 h-3.5 text-amber-300" /></span>{t('mv.similar')}</h4>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2.5">{recs.map((m) => (<button key={`${m.media_type || 'movie'}-${m.id}`} onClick={() => onMovieChange?.({ ...m, media_type: m.media_type || (m.title ? 'movie' : 'tv'), overview: m.overview || '' })} className="group text-left"><div className="relative"><img src={imgPath(m.poster_path, 'w185')} alt={m.title || m.name} className="w-full aspect-[2/3] object-cover rounded-xl border border-white/10 group-hover:border-[#f36f21]/60 group-hover:scale-[1.03] transition shadow" loading="lazy" />{(m.vote_average || 0) > 0 && (<span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 text-amber-300 text-[9px] font-black"><Star className="w-2.5 h-2.5 fill-current" />{m.vote_average.toFixed(1)}</span>)}</div><p className="text-[10px] font-semibold mt-1 truncate text-stone-300">{m.title || m.name}</p></button>))}</div>
            </div>
          )}
        </div>
      </div>
      {person && (<PersonModal person={person} onClose={() => setPerson(null)} onMovieChange={(m) => { setPerson(null); onMovieChange?.(m); }} />)}
    </div>
  );
}

function PersonModal({ person, onClose, onMovieChange }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();
  const [credits, setCredits] = useState([]);
  // (#65) Follow diễn viên — đồng bộ qua /api/actors/follow
  const [followed, setFollowed] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getPersonCredits(person.id).then((r) => {
      const list = (r.cast || []).filter((m) => m.poster_path).sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 18);
      setCredits(list);
    }).catch(() => {});
  }, [person.id]);
  useEffect(() => {
    if (!isAuthenticated) { setFollowed(false); return; }
    let on = true;
    fetch(`${API_BASE}/api/actors/follow`, { headers: { Accept: 'application/json', ...authHeaders() } })
      .then(r => r.json()).then((d) => { if (on) setFollowed((d.follows || []).some(x => Number(x.person_id) === Number(person.id))); })
      .catch(() => {});
    return () => { on = false; };
  }, [isAuthenticated, person.id]);
  const toggleActorFollow = async () => {
    if (!isAuthenticated) { addToast(t('p48.actor_need_login'), 'info'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/actors/follow`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ person_id: person.id, name: person.name, follow: !followed }) });
      const d = await r.json();
      if (d.success || d.following !== undefined) {
        setFollowed(d.following === true);
        addToast(d.following ? t('p48.actor_followed', { name: person.name }) : t('p48.actor_unfollowed'), 'success');
      } else addToast(d.error || 'Lỗi', 'error');
    } catch { addToast(t('mv.net_err'), 'error'); }
    setBusy(false);
  };
  const dept = person.known_for_department === 'Acting' ? t('mv.actor') : (person.known_for_department || t('mv.artist'));
  return (
    <div className="fixed inset-0 z-[220] bg-black/90 backdrop-blur-sm overflow-y-auto anim-zoom-fade" onClick={onClose}>
      <div className="relative max-w-3xl mx-auto my-6 md:my-10 bg-[#0f1015] rounded-3xl overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,.7)] border border-white/[0.07]" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-[150px] md:h-[180px] overflow-hidden" style={{ background: 'linear-gradient(120deg,#2b1410,#101828 60%,#1a1030)' }}>
          {person.profile_path && (<img src={imgPath(person.profile_path, 'w185')} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 blur-2xl scale-125" />)}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 20%, #0f1015 100%)' }} />
          <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur border border-white/15 hover:bg-black/85 flex items-center justify-center text-white transition active:scale-90"><X className="w-5 h-5" /></button>
        </div>
        <div className="relative px-5 md:px-7 -mt-16 md:-mt-20 pb-6">
          <div className="flex gap-4 items-end">
            <img src={person.profile_path ? imgPath(person.profile_path, 'w342') : 'data:image/svg+xml,%3Csvg xmlns=\"http://www.w3.org/2000/svg\" width=\"160\" height=\"240\"%3E%3Crect fill=\"%231c1d24\" width=\"160\" height=\"240\"/%3E%3C/svg%3E'} alt={person.name} className="w-32 md:w-40 aspect-[2/3] object-cover rounded-2xl ring-2 ring-white/20 shadow-[0_16px_40px_rgba(0,0,0,.6)] shrink-0 bg-[#1c1d24]" />
            <div className="flex-1 min-w-0 pb-1">
              <span className="inline-block px-2.5 py-1 rounded-full bg-[#f36f21]/15 border border-[#f36f21]/40 text-[#ffb37a] text-[10px] font-black tracking-widest mb-2">{dept.toUpperCase()}</span>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white leading-tight">{person.name}</h2>
              {(person.birthday || person.place_of_birth) && (<p className="text-[12px] text-stone-400 mt-1.5 flex items-center gap-1.5 flex-wrap">{person.birthday && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{t('mv.born', { d: person.birthday })}</span>}{person.place_of_birth && <span className="truncate">📍 {person.place_of_birth}</span>}</p>)}
              {/* (#65) follow diễn viên: nút bên phải header, đồng bộ server */}
              <button onClick={toggleActorFollow} disabled={busy}
                className={`mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black border transition-all active:scale-95 disabled:opacity-60 ${followed ? 'bg-[#f36f21]/15 text-[#ff9a3d] border-[#f36f21]/45' : 'bg-white/[0.06] text-stone-200 border-white/12 hover:bg-white/[0.14]'}`}>
                {followed ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                {followed ? t('mv.following') : t('p48.follow_actor')}
              </button>
            </div>
          </div>
          {person.biography ? (<p className="text-[13px] text-stone-300 leading-relaxed mt-4 max-h-[130px] overflow-y-auto pr-1">{person.biography}</p>) : (<p className="text-[12px] text-stone-500 mt-4 italic">{t('mv.no_bio')}</p>)}
          <h4 className="flex items-center gap-2 text-[13px] font-black text-white mt-5 mb-3"><span className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><Clapperboard className="w-3.5 h-3.5 text-amber-300" /></span>{t('mv.filmography')}</h4>
          {credits.length === 0 ? (<div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">{Array.from({ length: 6 }).map((_, i) => (<div key={i} className="aspect-[2/3] rounded-xl bg-white/[0.05] animate-pulse" />))}</div>) : (<div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">{credits.map((m) => (<button key={`${m.id}-${m.credit_id}`} onClick={() => onMovieChange({ ...m, media_type: m.media_type || (m.title ? 'movie' : 'tv'), overview: m.overview || '' })} className="group text-left"><div className="relative"><img src={imgPath(m.poster_path, 'w185')} alt={m.title || m.name} className="w-full aspect-[2/3] object-cover rounded-xl border border-white/10 group-hover:border-[#f36f21]/60 group-hover:scale-[1.03] transition shadow" loading="lazy" />{(m.vote_average || 0) > 0 && (<span className="absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 text-amber-300 text-[9px] font-black"><Star className="w-2.5 h-2.5 fill-current" />{m.vote_average.toFixed(1)}</span>)}</div><p className="text-[10px] font-semibold mt-1 truncate text-stone-300">{m.title || m.name}</p><p className="text-[9px] text-stone-600 truncate">{m.character || ''}</p></button>))}</div>)}
        </div>
      </div>
    </div>
  );
}
