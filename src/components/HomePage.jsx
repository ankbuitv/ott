import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Play, Heart, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Radio, SearchX, Info, History, ArrowDownAZ } from 'lucide-react';
import { maskScores } from '../utils/spoiler';
import { findEpgForChannel } from '../utils/epgMatch';
import { parseEpgDate, calculateProgramProgress } from '../utils/dateUtils';
import { useI18n } from '../contexts/I18nContext';
import LiveStrip from './LiveStrip';

/**
 * TRANG CHỦ CHRTV PLAY:
 *  - Dải đang trực tiếp + Hero carousel tự xoay
 *  - Lọc thể loại dạng pill
 *  - Danh sách kênh dạng LƯỚI (grid) theo nhóm, có Xem thêm/Thu gọn
 *  - Tìm kiếm lọc ngay trên trang chủ
 */
const SLIDE_GRADS = [
  'linear-gradient(100deg,#160d05 0%,#3a1508 40%,#7a2f0e 78%,#c8571d 100%)',
  'linear-gradient(100deg,#061630 0%,#0b2a5e 50%,#14418f 80%,#2f6fd0 100%)',
  'linear-gradient(100deg,#2b0505 0%,#5e0b0b 45%,#8f1a10 80%,#c0392b 100%)',
  'linear-gradient(100deg,#0a1f0c 0%,#14421c 45%,#2e7d32 80%,#66bb6a 100%)',
];

const PAGE_SIZE = 12;

// ===== Thẻ kênh dạng lưới =====
const ChannelGridCard = React.memo(function ChannelGridCard({ ch, epg, onSelect, onPlayCatchup, onShowInfo, onToggleFavorite, isFav, liveLabel }) {
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
        {/* Nút play hiện khi hover */}
        <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="w-12 h-12 rounded-full bg-[#f36f21] flex items-center justify-center shadow-lg shadow-[#f36f21]/40 scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-5 h-5 text-white fill-current ml-0.5" />
          </span>
        </span>
        {/* Quick actions khi hover: xem lại + chi tiết */}
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
        {/* Tiến độ chương trình đang phát */}
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
}) {
  const { t } = useI18n();
  const [heroIdx, setHeroIdx] = useState(0);
  const [expanded, setExpanded] = useState({});
  const searching = !!(searchQuery && searchQuery.trim());

  const getEpgNow = useCallback((ch) => {
    if (!epgData?.programmes || !ch) return null;
    return findEpgForChannel(epgData.programmes, ch);
  }, [epgData]);

  // ===== HERO: top kênh đang phát (ưu tiên VN có EPG) =====
  const heroChannels = useMemo(() => {
    if (!channels?.length) return [];
    const list = channels
      .map(ch => {
        const epg = getEpgNow(ch);
        const vn = /vietnam\s*today|vtc1|vtoday|vtv|htv/i.test((ch.channel_id || '') + ' ' + (ch.name || ''));
        return { ch, epg, score: (epg?.now ? 2 : 0) + (vn ? 1 : 0) };
      })
      .sort((a, b) => b.score - a.score)
      .filter(x => x.epg?.now)
      .slice(0, 4)
      .map(x => x.ch);
    return list.length ? list : channels.slice(0, 4);
  }, [channels, getEpgNow]);

  useEffect(() => {
    if (heroChannels.length < 2) return;
    const iv = setInterval(() => setHeroIdx(i => (i + 1) % heroChannels.length), 6000);
    return () => clearInterval(iv);
  }, [heroChannels.length]);

  const heroCh = heroChannels[heroIdx % Math.max(1, heroChannels.length)];
  const heroEpg = heroCh ? getEpgNow(heroCh) : null;

  // ===== Nhóm kênh =====
  const groupedChannels = useMemo(() => {
    const groups = {};
    channels?.forEach(ch => {
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

  // Tìm kiếm: lọc phẳng theo tên trên toàn bộ kênh (kết hợp thể loại đang chọn)
  const searchResults = useMemo(() => {
    if (!searching) return [];
    const q = searchQuery.trim().toLowerCase();
    return sortChans((channels || [])
      .filter(ch => (ch.name || '').toLowerCase().includes(q))
      .filter(ch => isAllCategory(selectedCategory) || ch.group_title === selectedCategory))
      .slice(0, 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, searchQuery, selectedCategory]);

  const recentChannels = useMemo(() => {
    if (!watchHistory?.length) return [];
    const ids = watchHistory.slice(0, 12).map(h => h.channel_id);
    return (channels || []).filter(ch => ids.includes(ch.channel_id));
  }, [channels, watchHistory]);

  const favSet = useMemo(() => new Set(favorites || []), [favorites]);

  // Sắp xếp kênh (nhớ lựa chọn)
  const [sortMode, setSortMode] = useState(() => { try { return localStorage.getItem('chrtv_sort') || 'default'; } catch { return 'default'; } });
  const changeSort = (m) => { setSortMode(m); try { localStorage.setItem('chrtv_sort', m); } catch {} };
  const sortChans = useCallback((list) => {
    if (sortMode === 'az') return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
    if (sortMode === 'live') return [...list].sort((a, b) => (getEpgNow(b)?.now ? 1 : 0) - (getEpgNow(a)?.now ? 1 : 0));
    return list;
  }, [sortMode, getEpgNow]);

  // Gợi ý "Có thể bạn thích": cùng nhóm với kênh hay xem, chưa xem gần đây
  const recoChannels = useMemo(() => {
    if (!watchHistory?.length || !channels?.length) return [];
    const recentIds = new Set(watchHistory.slice(0, 12).map(h => h.channel_id));
    const topGroups = {};
    watchHistory.slice(0, 20).forEach(h => {
      const ch = channels.find(c => c.channel_id === h.channel_id);
      if (ch?.group_title) topGroups[ch.group_title] = (topGroups[ch.group_title] || 0) + 1;
    });
    const ranked = Object.entries(topGroups).sort((a, b) => b[1] - a[1]).map(([g]) => g);
    if (!ranked.length) return [];
    const out = [];
    for (const g of ranked) {
      for (const ch of channels) {
        if (out.length >= 12) break;
        if (ch.group_title === g && !recentIds.has(ch.channel_id) && !favSet.has(ch.channel_id) && !out.includes(ch)) out.push(ch);
      }
      if (out.length >= 12) break;
    }
    return out;
  }, [channels, watchHistory, favSet]);

  const toggleExpand = (g) => setExpanded(prev => ({ ...prev, [g]: !prev[g] }));

  return (
    <div className="text-white pb-12">
      {/* ===== DẢI ĐANG TRỰC TIẾP ===== */}
      <LiveStrip channels={channels} epgData={epgData} onSelect={onSelectChannel} />

      {/* ===== HERO CAROUSEL ===== */}
      {!searching && heroCh && (
        <section className="relative mx-3 md:mx-5 mt-3 rounded-3xl overflow-hidden anim-fade-up border border-white/[0.06]" style={{ height: 'min(52vh, 430px)', minHeight: 320 }}>
          <div
            key={heroIdx}
            className="absolute inset-0 anim-fade-up"
            style={{ background: SLIDE_GRADS[heroIdx % SLIDE_GRADS.length] }}
          ></div>
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(90deg, rgba(0,0,0,.92) 0%, rgba(0,0,0,.68) 36%, rgba(0,0,0,.22) 62%, rgba(0,0,0,.1) 100%), linear-gradient(0deg, rgba(11,11,13,.85) 0%, transparent 30%)',
          }}></div>

          {/* Logo kênh lớn */}
          {heroCh.logo && (
            <div className="absolute right-[6%] top-1/2 -translate-y-1/2 anim-floaty hidden sm:block">
              <div className="w-40 h-40 md:w-52 md:h-52 rounded-[2rem] bg-white/[.97] shadow-2xl flex items-center justify-center p-6 ring-1 ring-white/40">
                <img src={heroCh.logo} alt={heroCh.name} className="w-full h-full object-contain" onError={e => { e.target.style.display = 'none'; }} />
              </div>
            </div>
          )}

          <div className="absolute inset-y-0 left-0 z-10 flex flex-col justify-center px-6 md:px-12" style={{ width: 'min(580px, 80%)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex items-center gap-1.5 text-[11px] font-black tracking-widest text-white grad-brand px-2.5 py-1 rounded-full shadow-lg shadow-[#f36f21]/40">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                {t('app.live_now')}
              </span>
              {heroCh.group_title && (
                <span className="text-[11px] font-bold text-white/70 border border-white/25 px-2.5 py-1 rounded-full">{heroCh.group_title}</span>
              )}
            </div>
            <h1 className="text-[clamp(28px,4.2vw,48px)] font-black leading-[1.05] mb-3 drop-shadow-xl">{heroCh.name}</h1>
            {heroEpg?.now && (
              <>
                <div className="self-start max-w-full bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-2.5 mb-5">
                  <p className="text-[13px] md:text-[15px] font-bold text-white truncate">{maskScores(heroEpg.now.title)}</p>
                  <p className="text-[11px] text-white/60 mt-0.5">{fmtTime(heroEpg.now.start)} - {fmtTime(heroEpg.now.stop)}</p>
                </div>
              </>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => onSelectChannel && onSelectChannel(heroCh)}
                className="btn-orange flex items-center gap-2 text-white font-extrabold text-[15px] px-7 py-3 rounded-2xl shadow-xl shadow-[#f36f21]/30 hover:brightness-110 active:scale-95 transition-all"
              >
                <Play className="w-4 h-4 fill-current" /> {t('app.watch_now')}
              </button>
              <button
                onClick={() => onToggleFavorite && onToggleFavorite(heroCh.channel_id)}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 backdrop-blur text-white font-bold text-[14px] px-6 py-3 rounded-2xl border border-white/15 transition-all active:scale-95"
              >
                <Heart className={`w-4 h-4 ${favSet.has(heroCh.channel_id) ? 'fill-[#f36f21] text-[#f36f21]' : ''}`} />
                {favSet.has(heroCh.channel_id) ? t('home.liked') : t('app.favorites')}
              </button>
            </div>
          </div>

          {/* Mũi tên chuyển slide */}
          {heroChannels.length > 1 && (
            <>
              <button onClick={() => setHeroIdx((heroIdx - 1 + heroChannels.length) % heroChannels.length)} className="absolute left-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white transition-all" aria-label={t('home.prev')}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button onClick={() => setHeroIdx((heroIdx + 1) % heroChannels.length)} className="absolute right-3 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/40 hover:bg-black/70 text-white transition-all" aria-label={t('home.next')}>
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute right-5 bottom-4 z-20 flex items-center gap-2">
                <span className="text-[10px] font-bold text-white/60 mr-1">{heroIdx + 1}/{heroChannels.length}</span>
                {heroChannels.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setHeroIdx(i)}
                    aria-label={`slide ${i + 1}`}
                    className="h-[7px] rounded-full transition-all duration-300"
                    style={{ width: i === heroIdx ? 24 : 7, background: i === heroIdx ? '#f36f21' : 'rgba(255,255,255,.35)' }}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ===== LỌC THỂ LOẠI (pill) ===== */}
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
        {/* ===== KẾT QUẢ TÌM KIẾM ===== */}
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

        {/* ===== DÀNH CHO BẠN (xem gần đây) ===== */}
        {!searching && recentChannels.length > 0 && (
          <section className="anim-fade-up">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[10px] text-[#ff9a3d] font-black uppercase tracking-widest mb-1">{t('home.continue')}</p>
                <h2 className="text-[20px] font-extrabold tracking-tight">{t('home.picked_for_you')}</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
              {recentChannels.map(ch => (
                <ChannelGridCard key={ch.channel_id} ch={ch} epg={getEpgNow(ch)} onSelect={onSelectChannel} onPlayCatchup={onPlayCatchup} onShowInfo={onShowInfo} onToggleFavorite={onToggleFavorite} isFav={favSet.has(ch.channel_id)} liveLabel={t('player.live')} />
              ))}
            </div>
          </section>
        )}

        {/* ===== CÓ THỂ BẠN THÍCH (gợi ý theo thói quen) ===== */}
        {!searching && recoChannels.length > 0 && (
          <section className="anim-fade-up">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[10px] text-[#ff9a3d] font-black uppercase tracking-widest mb-1">✨ {t('home.reco_for_you')}</p>
                <h2 className="text-[20px] font-extrabold tracking-tight">{t('home.reco_title')}</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5">
              {recoChannels.map(ch => (
                <ChannelGridCard key={ch.channel_id} ch={ch} epg={getEpgNow(ch)} onSelect={onSelectChannel} onPlayCatchup={onPlayCatchup} onShowInfo={onShowInfo} onToggleFavorite={onToggleFavorite} isFav={favSet.has(ch.channel_id)} liveLabel={t('player.live')} />
              ))}
            </div>
          </section>
        )}

        {/* ===== NHÓM KÊNH (lưới) ===== */}
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

        {/* Rỗng */}
        {!searching && !isLoading && Object.keys(filteredGroups).length === 0 && (
          <div className="text-center py-16 bg-white/[0.02] rounded-3xl border border-white/[0.05]">
            <Radio className="w-10 h-10 text-stone-600 mx-auto mb-3" />
            <p className="text-sm text-stone-400">{t('home.empty_cat')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
