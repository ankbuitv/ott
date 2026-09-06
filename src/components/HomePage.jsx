import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Play, Heart, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Radio, SearchX, Info, History, ArrowDownAZ, Star, Flame, Sparkles, Clapperboard } from 'lucide-react';
import { maskScores } from '../utils/spoiler';
import { findEpgForChannel } from '../utils/epgMatch';
import { parseEpgDate, calculateProgramProgress } from '../utils/dateUtils';
import { useI18n } from '../contexts/I18nContext';
import { MovieAPI, imgPath, bgPath } from '../services/tmdb';
import { fetchEvents } from '../services/events';
import LiveStrip from './LiveStrip';

/**
 * TRANG CHỦ:
 *  1. Banner carousel (sự kiện admin + phim trending)
 *  2. Danh sách kênh (pill thể loại + tìm kiếm + lưới theo nhóm)
 *  3. Phim trending
 *  4. Kênh nổi bật
 */
const SLIDE_GRADS = [
  'linear-gradient(100deg,#160d05 0%,#3a1508 40%,#7a2f0e 78%,#c8571d 100%)',
  'linear-gradient(100deg,#061630 0%,#0b2a5e 50%,#14418f 80%,#2f6fd0 100%)',
  'linear-gradient(100deg,#2b0505 0%,#5e0b0b 45%,#8f1a10 80%,#c0392b 100%)',
  'linear-gradient(100deg,#0a1f0c 0%,#14421c 45%,#2e7d32 80%,#66bb6a 100%)',
  'linear-gradient(100deg,#1c0a2e 0%,#3d1160 45%,#6d28a8 80%,#a855f7 100%)',
];

const PAGE_SIZE = 12;

// ===== Thẻ kênh dạng lưới =====
const ChannelGridCard = React.memo(function ChannelGridCard({ ch, epg, onSelect, onPlayCatchup, onShowInfo, onToggleFavorite, isFav, liveLabel }) {
  const { t } = useI18n();
  const progress = epg?.now ? calculateProgramProgress(epg.now.start, epg.now.stop) : 0;
  return (
    <button
      onClick={() => onSelect && onSelect(ch)}
      className="group relative rounded-2xl bg-[#15161b] border border-white/[0.06] hover:border-[#f36f21]/50 overflow-hidden text-left transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#f36f21]/10"
    >
      <div className="relative aspect-video flex items-center justify-center bg-[#0c0d11] overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at 50% 120%, rgba(243,111,33,.25), transparent 60%)' }}></div>
        {ch.logo ? (
          <img src={ch.logo} alt="" loading="lazy" className="w-16 h-16 md:w-20 md:h-20 object-contain relative z-10 drop-shadow-lg transition-transform duration-200 group-hover:scale-110" onError={e => { e.target.style.display = 'none'; }} />
        ) : (
          <span className="font-black italic tracking-tighter text-white/30 relative z-10 text-4xl">{(ch.name || '?').slice(0, 3)}</span>
        )}
        <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="w-12 h-12 rounded-full bg-[#f36f21] flex items-center justify-center shadow-lg shadow-[#f36f21]/40 scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 text-white fill-current ml-0.5" />
          </span>
        </span>
        {(onPlayCatchup || onShowInfo) && (
          <span className="absolute bottom-2 left-2 right-2 z-20 hidden group-hover:flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {onPlayCatchup && epg?.prev && (
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onPlayCatchup(ch, epg.prev); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onPlayCatchup(ch, epg.prev); } }} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 backdrop-blur text-[9px] font-bold text-cyan-300 hover:bg-cyan-600 hover:text-white transition-colors" title={t('home.quick_replay')}>
                <History className="w-3 h-3" /> {t('epg.back')}
              </span>
            )}
            {onShowInfo && (
              <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onShowInfo(ch); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onShowInfo(ch); } }} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-black/70 backdrop-blur text-[9px] font-bold text-slate-300 hover:bg-slate-600 hover:text-white transition-colors" title={t('home.quick_info')}>
                <Info className="w-3 h-3" /> {t('home.quick_info_btn')}
              </span>
            )}
          </span>
        )}
        <span className="absolute top-2 left-2 z-20 bg-black/70 backdrop-blur px-2 py-1 rounded-lg text-[9px] font-black tracking-wider text-[#ff9a3d] flex items-center gap-1">
          <span className="eq" style={{ transform: 'scale(.65)', transformOrigin: 'left bottom' }}><i></i><i></i><i></i></span> {liveLabel}
        </span>
        {onToggleFavorite && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(ch.channel_id); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onToggleFavorite(ch.channel_id); } }}
            className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/60 backdrop-blur hover:bg-black/80 transition-colors"
            title={t('app.favorites')}
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-[#f36f21] text-[#f36f21]' : 'text-slate-400'}`} />
          </span>
        )}
        {epg?.now && progress > 0 && (
          <span className="absolute bottom-0 inset-x-0 z-20 h-1 bg-white/10">
            <span className="block h-full bg-gradient-to-r from-[#22d3ee] via-[#818cf8] to-[#f36f21]" style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}></span>
          </span>
        )}
      </div>
      <div className="px-3 py-2.5">
        <h4 className="text-[13px] font-bold text-white truncate group-hover:text-[#ffb37a] transition-colors">{ch.name}</h4>
        <p className="text-[11px] text-stone-400 truncate mt-0.5">
          {epg?.now ? (
            <>{fmtTime(epg.now.start)} · {maskScores(epg.now.title)}</>
          ) : (ch.group_title || '')}
        </p>
      </div>
    </button>
  );
});

function fmtTime(s) {
  try {
    const d = parseEpgDate(s);
    if (isNaN(d.getTime())) return '';
    return d.toTimeString().slice(0, 5);
  } catch { return ''; }
}

export default function HomePage({
  channels, epgData, favorites, watchHistory,
  onSelectChannel, onPlayCatchup, onToggleFavorite, onShowInfo,
  selectedCategory, setSelectedCategory, categories,
  searchQuery, setSearchQuery, isLoading,
  onSelectMovie, onGoTab,
}) {
  const { t } = useI18n();
  const [heroIdx, setHeroIdx] = useState(0);
  const [expanded, setExpanded] = useState({});
  const [trending, setTrending] = useState([]);
  const [events, setEvents] = useState([]);
  const searching = !!(searchQuery && searchQuery.trim());

  useEffect(() => {
    let on = true;
    MovieAPI.trending().then(r => { if (on) setTrending((r.results || []).slice(0, 12)); }).catch(() => {});
    fetchEvents().then(ev => { if (on) setEvents(ev || []); }).catch(() => {});
    return () => { on = false; };
  }, []);

  const getEpgNow = useCallback((ch) => {
    if (!epgData?.programmes || !ch) return null;
    try { return findEpgForChannel(epgData.programmes, ch); } catch { return null; }
  }, [epgData]);

  // ===== BANNER: sự kiện trước, sau đó phim trending =====
  const slides = useMemo(() => {
    const out = [];
    for (const ev of events.slice(0, 6)) {
      out.push({ kind: 'event', id: `ev-${ev.id}`, title: ev.title, sub: ev.subtitle, img: ev.image_url, data: ev });
    }
    for (const m of trending.slice(0, 6)) {
      out.push({ kind: 'movie', id: `mv-${m.media_type}-${m.id}`, title: m.title || m.name, sub: m.overview, img: m.backdrop_path ? bgPath(m.backdrop_path) : '', data: m });
    }
    return out;
  }, [events, trending]);

  useEffect(() => {
    if (slides.length < 2) return undefined;
    setHeroIdx(0);
    const iv = setInterval(() => setHeroIdx(i => (i + 1) % slides.length), 6000);
    return () => clearInterval(iv);
  }, [slides.length]);

  const hero = slides.length ? slides[heroIdx % slides.length] : null;

  const onHeroClick = useCallback(() => {
    if (!hero) return;
    if (hero.kind === 'movie') {
      if (onSelectMovie) onSelectMovie(hero.data);
      return;
    }
    const ev = hero.data || {};
    const lt = ev.link_type || 'none';
    const lv = ev.link_value || '';
    if (lt === 'tab' && lv && onGoTab) onGoTab(lv);
    else if (lt === 'channel' && lv && onSelectChannel) {
      const ch = (channels || []).find(c => String(c.channel_id) === String(lv) || (c.name || '').toLowerCase() === String(lv).toLowerCase());
      if (ch) onSelectChannel(ch);
    } else if (lt === 'url' && lv) {
      try { window.open(lv, '_blank', 'noopener'); } catch {}
    }
  }, [hero, onSelectMovie, onGoTab, onSelectChannel, channels]);

  // ===== Nhóm kênh =====
  const groupedChannels = useMemo(() => {
    const groups = {};
    (channels || []).forEach(ch => {
      const g = ch.group_title || 'Khác';
      (groups[g] = groups[g] || []).push(ch);
    });
    return groups;
  }, [channels]);

  const allGroups = useMemo(
    () => Object.fromEntries(Object.entries(groupedChannels).sort((a, b) => b[1].length - a[1].length)),
    [groupedChannels]
  );

  const isAllCategory = (cat) => !cat || cat === 'all' || cat === 'Tất Cả' || cat === 'All' || cat === t('movies.genre.all');

  const filteredGroups = useMemo(() => {
    if (isAllCategory(selectedCategory)) return allGroups;
    return groupedChannels[selectedCategory] ? { [selectedCategory]: groupedChannels[selectedCategory] } : {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedChannels, selectedCategory, allGroups, t]);

  const [sortMode, setSortMode] = useState(() => { try { return localStorage.getItem('chrtv_sort') || 'default'; } catch { return 'default'; } });
  const changeSort = (m) => { setSortMode(m); try { localStorage.setItem('chrtv_sort', m); } catch {} };
  const sortChans = useCallback((list) => {
    if (sortMode === 'az') return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    if (sortMode === 'live') return [...list].sort((a, b) => (getEpgNow(b)?.now ? 1 : 0) - (getEpgNow(a)?.now ? 1 : 0));
    return list;
  }, [sortMode, getEpgNow]);

  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = searchQuery.trim().toLowerCase();
    return sortChans((channels || [])
      .filter(ch => (ch.name || '').toLowerCase().includes(q))
      .filter(ch => isAllCategory(selectedCategory) || ch.group_title === selectedCategory))
      .slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, searchQuery, selectedCategory]);

  const favSet = useMemo(() => new Set(favorites || []), [favorites]);

  // ===== Kênh nổi bật: đang phát + VN + yêu thích =====
  const featured = useMemo(() => {
    if (!channels?.length) return [];
    return channels
      .map(ch => {
        const epg = getEpgNow(ch);
        const vn = /vietnam|vtv|htv|thvl|today/i.test(`${ch.channel_id || ''} ${ch.name || ''} ${ch.group_title || ''}`);
        return { ch, score: (epg?.now ? 3 : 0) + (vn ? 2 : 0) + (favSet.has(ch.channel_id) ? 1 : 0) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map(x => x.ch);
  }, [channels, getEpgNow, favSet]);

  const toggleExpand = (g) => setExpanded(prev => ({ ...prev, [g]: !prev[g] }));
  const safeIdx = slides.length ? heroIdx % slides.length : 0;

  return (
    <div className="text-white pb-12">
      {/* ===== 1. BANNER: sự kiện + phim ===== */}
      {!searching && hero && (
        <section className="relative mx-3 md:mx-5 mt-3 rounded-3xl overflow-hidden anim-fade-up border border-white/[0.06]" style={{ height: 'min(56vh, 460px)', minHeight: 330 }}>
          {hero.img ? (
            <div key={hero.id} className="absolute inset-0 bg-cover bg-center anim-fade-up" style={{ backgroundImage: `url(${hero.img})` }}></div>
          ) : (
            <div key={hero.id} className="absolute inset-0 anim-fade-up" style={{ background: SLIDE_GRADS[safeIdx % SLIDE_GRADS.length] }}></div>
          )}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(90deg, rgba(0,0,0,.93) 0%, rgba(0,0,0,.66) 38%, rgba(0,0,0,.2) 62%, rgba(0,0,0,.08) 100%), linear-gradient(0deg, rgba(11,11,13,.88) 0%, transparent 32%)',
          }}></div>
          {/* quầng sáng trang trí */}
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full blur-3xl opacity-25 pointer-events-none" style={{ background: 'radial-gradient(circle,#f36f21,transparent 70%)' }}></div>

          <div className="absolute inset-y-0 left-0 z-10 flex flex-col justify-center px-6 md:px-12" style={{ width: 'min(620px, 85%)' }}>
            <div className="flex items-center gap-2 mb-3">
              {hero.kind === 'event' ? (
                <span className="flex items-center gap-1.5 text-[11px] font-black tracking-widest text-white bg-fuchsia-600 px-2.5 py-1 rounded-full shadow-lg shadow-fuchsia-600/40">
                  <Sparkles className="w-3 h-3" /> {t('home.banner_event')}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-black tracking-widest text-white grad-brand px-2.5 py-1 rounded-full shadow-lg shadow-[#f36f21]/40">
                  <Flame className="w-3 h-3" /> {t('home.banner_trending')}
                </span>
              )}
            </div>
            <h1 className="text-[clamp(28px,4.4vw,52px)] font-black leading-[1.05] mb-3 drop-shadow-xl line-clamp-2">{hero.title}</h1>
            {hero.sub && (
              <p className="text-[13px] md:text-sm text-white/70 leading-relaxed line-clamp-2 mb-5 max-w-lg">{hero.sub}</p>
            )}
            {hero.kind === 'movie' && (hero.data.vote_average || 0) > 0 && (
              <div className="flex items-center gap-2 mb-5">
                <span className="flex items-center gap-1 px-2 py-1 bg-amber-400/15 border border-amber-400/40 rounded-lg text-amber-300 text-xs font-black">
                  <Star className="w-3.5 h-3.5 fill-current" /> {hero.data.vote_average.toFixed(1)}
                </span>
                {(hero.data.release_date || hero.data.first_air_date) && (
                  <span className="text-xs text-white/60 font-bold">{(hero.data.release_date || hero.data.first_air_date).substring(0, 4)}</span>
                )}
                <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">{hero.data.media_type === 'tv' ? 'TV Show' : t('home.banner_movie')}</span>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={onHeroClick}
                className="btn-orange flex items-center gap-2 text-white font-extrabold text-[15px] px-7 py-3 rounded-2xl shadow-xl shadow-[#f36f21]/30 hover:brightness-110 active:scale-95 transition-all"
              >
                {hero.kind === 'movie' ? <Clapperboard className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                {hero.kind === 'movie' ? t('home.banner_detail') : t('home.banner_open')}
              </button>
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button onClick={() => setHeroIdx((safeIdx - 1 + slides.length) % slides.length)} className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white transition-all" aria-label={t('home.prev')}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setHeroIdx((safeIdx + 1) % slides.length)} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white transition-all" aria-label={t('home.next')}>
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute right-5 bottom-4 z-20 flex items-center gap-2">
                <span className="text-[10px] font-bold text-white/60 mr-1">{safeIdx + 1}/{slides.length}</span>
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setHeroIdx(i)}
                    aria-label={`slide ${i + 1}`}
                    className="h-[7px] rounded-full transition-all duration-300"
                    style={{ width: i === safeIdx ? 24 : 7, background: i === safeIdx ? '#f36f21' : 'rgba(255,255,255,.35)' }}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* dải đang trực tiếp */}
      {!searching && <LiveStrip channels={channels} epgData={epgData} onSelect={onSelectChannel} />}

      {/* ===== pill thể loại ===== */}
      <div className="sticky top-0 z-30 bg-[#0b0b0d]/90 backdrop-blur-md border-b border-white/[0.06] mt-4">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-3 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <span className="shrink-0 flex items-center gap-1 pl-1 pr-2 text-stone-500" title={t('home.sort')}>
            <ArrowDownAZ className="w-4 h-4" />
            <select value={sortMode} onChange={e => changeSort(e.target.value)} className="bg-white/[0.06] hover:bg-white/[0.12] text-stone-200 text-[12px] font-bold px-2.5 py-2 rounded-full border-none outline-none cursor-pointer">
              <option value="default">{t('home.sort_default')}</option>
              <option value="az">A → Z</option>
              <option value="live">{t('home.sort_live')}</option>
            </select>
          </span>
          {(categories || []).map(cat => {
            const active = selectedCategory === cat;
            const label = (cat === 'Tất Cả' || cat === 'All') ? t('movies.genre.all') : cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-bold transition-all active:scale-95 ${
                  active
                    ? 'grad-brand text-white shadow-lg shadow-[#f36f21]/30'
                    : 'bg-white/[0.06] text-stone-300 hover:bg-white/[0.12] hover:text-white'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-6 space-y-10">
        {/* ===== tìm kiếm ===== */}
        {searching && (
          <section className="anim-fade-up">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[10px] text-[#ff9a3d] font-black uppercase tracking-widest mb-1">{t('home.searching')}</p>
                <h2 className="text-[20px] font-extrabold tracking-tight">"{searchQuery.trim()}" — {t('home.n_channels', { n: searchResults.length })}</h2>
              </div>
            </div>
            {searchResults.length === 0 ? (
              <div className="text-center py-14 bg-white/[0.02] rounded-3xl border border-white/[0.05]">
                <SearchX className="w-10 h-10 text-stone-600 mx-auto mb-3" />
                <p className="text-sm text-stone-400">{t('home.no_match')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
                {searchResults.map(ch => (
                  <ChannelGridCard key={ch.channel_id} ch={ch} epg={getEpgNow(ch)} onSelect={onSelectChannel} onPlayCatchup={onPlayCatchup} onShowInfo={onShowInfo} onToggleFavorite={onToggleFavorite} isFav={favSet.has(ch.channel_id)} liveLabel={t('player.live')} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* ===== 2. LIST KÊNH ===== */}
        {!searching && Object.entries(filteredGroups).map(([groupName, groupChannels], gi) => {
          const isOpen = !!expanded[groupName];
          const sortedGroup = sortChans(groupChannels);
          const visible = isOpen ? sortedGroup : sortedGroup.slice(0, PAGE_SIZE);
          return (
            <section key={groupName} className="anim-fade-up" style={{ animationDelay: `${Math.min(gi, 4) * 60}ms` }}>
              <div className="flex items-end justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-[#f36f21]/15 border border-[#f36f21]/25 flex items-center justify-center">
                    <Radio className="w-4 h-4 text-[#ff9a3d]" />
                  </span>
                  <div>
                    <h2 className="text-[20px] font-extrabold tracking-tight leading-tight">{groupName}</h2>
                    <p className="text-[11px] text-stone-500">{t('home.n_channels', { n: groupChannels.length })}</p>
                  </div>
                </div>
                {groupChannels.length > PAGE_SIZE && (
                  <button
                    onClick={() => toggleExpand(groupName)}
                    className="flex items-center gap-1 px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[12px] font-bold text-stone-200 transition-all active:scale-95"
                  >
                    {isOpen ? <>{t('home.collapse')} <ChevronUp className="w-3.5 h-3.5" /></> : <>{t('home.expand', { n: groupChannels.length - PAGE_SIZE })} <ChevronDown className="w-3.5 h-3.5" /></>}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
                {visible.map(ch => (
                  <ChannelGridCard key={ch.channel_id} ch={ch} epg={getEpgNow(ch)} onSelect={onSelectChannel} onPlayCatchup={onPlayCatchup} onShowInfo={onShowInfo} onToggleFavorite={onToggleFavorite} isFav={favSet.has(ch.channel_id)} liveLabel={t('player.live')} />
                ))}
              </div>
            </section>
          );
        })}

        {!searching && !isLoading && Object.keys(filteredGroups).length === 0 && (
          <div className="text-center py-16 bg-white/[0.02] rounded-3xl border border-white/[0.05]">
            <Radio className="w-10 h-10 text-stone-600 mx-auto mb-3" />
            <p className="text-sm text-stone-400">{t('home.empty_cat')}</p>
          </div>
        )}

        {/* ===== 3. PHIM TRENDING ===== */}
        {!searching && trending.length > 0 && (
          <section className="anim-fade-up">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <Flame className="w-4 h-4 text-amber-400" />
              </span>
              <div>
                <h2 className="text-[20px] font-extrabold tracking-tight leading-tight">{t('home.trending_movies')}</h2>
                <p className="text-[11px] text-stone-500">{t('home.trending_sub')}</p>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 snap-x">
              {trending.map(m => (
                <button
                  key={`${m.media_type}-${m.id}`}
                  onClick={() => onSelectMovie && onSelectMovie(m)}
                  className="group relative shrink-0 w-[130px] md:w-[160px] snap-start text-left active:scale-[0.98] transition-transform"
                >
                  <span className="block aspect-[2/3] rounded-2xl overflow-hidden bg-stone-900 border border-white/10 shadow-xl shadow-black/50 group-hover:border-[#f36f21]/60 transition-all">
                    {m.poster_path ? (
                      <img src={imgPath(m.poster_path, 'w342')} alt={m.title || m.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-3xl">🎬</span>
                    )}
                    {(m.vote_average || 0) > 0 && (
                      <span className="absolute top-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[10px] font-bold text-amber-400">
                        <Star className="w-2.5 h-2.5 fill-current" /> {m.vote_average.toFixed(1)}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-2 pt-7">
                      <span className="block text-[11px] font-bold leading-tight line-clamp-2">{m.title || m.name}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===== 4. KÊNH NỔI BẬT ===== */}
        {!searching && featured.length > 0 && (
          <section className="anim-fade-up">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-fuchsia-400" />
              </span>
              <div>
                <h2 className="text-[20px] font-extrabold tracking-tight leading-tight">{t('home.featured')}</h2>
                <p className="text-[11px] text-stone-500">{t('home.featured_sub')}</p>
              </div>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 snap-x">
              {featured.map((ch, i) => {
                const epg = getEpgNow(ch);
                return (
                  <button
                    key={ch.channel_id}
                    onClick={() => onSelectChannel && onSelectChannel(ch)}
                    className="group relative shrink-0 w-[210px] md:w-[250px] snap-start rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#f36f21]/60 bg-[#15161b] text-left transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#f36f21]/10"
                  >
                    <span className="block relative h-[110px] md:h-[130px] flex items-center justify-center bg-[#0c0d11] overflow-hidden">
                      <span className="absolute inset-0 opacity-40" style={{ background: `radial-gradient(circle at 20% 120%, ${i % 2 ? 'rgba(168,85,247,.3)' : 'rgba(243,111,33,.3)'}, transparent 65%)` }}></span>
                      {ch.logo ? (
                        <img src={ch.logo} alt="" loading="lazy" className="h-16 md:h-20 object-contain relative z-10 drop-shadow-xl group-hover:scale-110 transition-transform" onError={e => { e.target.style.display = 'none'; }} />
                      ) : (
                        <span className="font-black italic text-white/25 text-3xl relative z-10">{(ch.name || '?').slice(0, 8)}</span>
                      )}
                      <span className="absolute top-2 left-2 z-20 bg-black/70 px-2 py-0.5 rounded-lg text-[9px] font-black text-[#ff9a3d]">#{i + 1}</span>
                      <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="w-11 h-11 rounded-full bg-[#f36f21] flex items-center justify-center shadow-lg"><Play className="w-4 h-4 text-white fill-current ml-0.5" /></span>
                      </span>
                    </span>
                    <span className="block px-3 py-2.5">
                      <span className="block text-[13px] font-bold text-white truncate">{ch.name}</span>
                      <span className="block text-[11px] text-stone-500 truncate mt-0.5">{epg?.now ? maskScores(epg.now.title) : (ch.group_title || '')}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
