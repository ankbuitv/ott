import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { findEpgForChannel } from '../utils/epgMatch';
import { parseEpgDate } from '../utils/dateUtils';
import { useI18n } from '../contexts/I18nContext';

/**
 * TRANG CHỦ (kiểu mytv 2026-09):
 *  - Hero carousel tự xoay (kênh đang phát, dots, nút cam)
 *  - Thanh thể loại chbar (gạch cam, nền solid — không blur)
 *  - Hàng kênh dạng hrow ngang (card 16:9, pill LIVE, hover scale)
 */
const SLIDE_GRADS = [
  'linear-gradient(100deg,#160d05 0%,#3a1508 40%,#7a2f0e 78%,#c8571d 100%)',
  'linear-gradient(100deg,#061630 0%,#0b2a5e 50%,#14418f 80%,#2f6fd0 100%)',
  'linear-gradient(100deg,#2b0505 0%,#5e0b0b 45%,#8f1a10 80%,#c0392b 100%)',
  'linear-gradient(100deg,#0a1f0c 0%,#14421c 45%,#2e7d32 80%,#66bb6a 100%)',
];

// ===== Card kênh (mytv hcard) — component riêng để không remount khi hero xoay =====
const ChannelArt = React.memo(function ChannelArt({ ch, onSelect, epgNowTitle, isFav, liveLabel }) {
  return (
    <button
      onClick={() => onSelect && onSelect(ch)}
      className="mytv-card shrink-0 rounded-xl border border-[#1f1f24] bg-[#17171a] overflow-hidden cursor-pointer text-left"
      style={{ width: 224, scrollSnapAlign: 'start' }}
    >
      <div className="relative aspect-video flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,.05) 10px, rgba(255,255,255,.05) 20px)' }}></div>
        {ch.logo ? (
          <img src={ch.logo} alt="" loading="lazy" className="w-16 h-16 object-contain relative z-10" onError={e => { e.target.style.display = 'none'; }} />
        ) : (
          <span className="font-black italic tracking-tighter text-white/40 relative z-10 text-3xl">{(ch.name || '?').slice(0, 3)}</span>
        )}
        <span className="absolute bottom-2 left-2 bg-black/65 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1.5">
          <span className="eq" style={{ transform: 'scale(.7)', transformOrigin: 'left bottom' }}><i></i><i></i><i></i></span> {liveLabel}
        </span>
        {isFav && <span className="absolute top-2 right-2 text-[#f36f21] text-xs font-black">♥</span>}
      </div>
      <div className="px-2.5 py-2">
        <h4 className="text-[12.5px] font-bold text-[#eee] truncate">{ch.name}</h4>
        <p className="text-[11px] text-[#9b9ba3] truncate">{epgNowTitle || ch.group_title}</p>
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
  onSelectChannel, onPlayCatchup, onToggleFavorite,
  selectedCategory, setSelectedCategory, categories,
  searchQuery, setSearchQuery, isLoading,
}) {
  const { t } = useI18n();
  const [heroIdx, setHeroIdx] = useState(0);

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

  const filteredGroups = useMemo(() => {
    if (selectedCategory && selectedCategory !== 'all') {
      return groupedChannels[selectedCategory] ? { [selectedCategory]: groupedChannels[selectedCategory] } : {};
    }
    return allGroups;
  }, [groupedChannels, selectedCategory, allGroups]);

  const recentChannels = useMemo(() => {
    if (!watchHistory?.length) return [];
    const ids = watchHistory.slice(0, 8).map(h => h.channel_id);
    return (channels || []).filter(ch => ids.includes(ch.channel_id));
  }, [channels, watchHistory]);

  const favSet = useMemo(() => new Set(favorites || []), [favorites]);

  return (
    <div className="bg-[#0b0b0d] text-white pb-10">
      {/* ===== HERO CAROUSEL (mytv) ===== */}
      {heroCh && (
        <section className="relative mx-3 md:mx-5 mt-3 rounded-2xl overflow-hidden anim-fade-up" style={{ height: 'min(56vh, 460px)', minHeight: 340 }}>
          <div
            className="absolute inset-0 transition-opacity duration-700"
            style={{ background: SLIDE_GRADS[heroIdx % SLIDE_GRADS.length] }}
          ></div>
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(90deg, rgba(0,0,0,.94) 0%, rgba(0,0,0,.72) 34%, rgba(0,0,0,.25) 62%, rgba(0,0,0,.12) 100%), linear-gradient(0deg, rgba(11,11,13,.9) 0%, transparent 32%)',
          }}></div>

          {/* Logo kênh lớn — float nhẹ */}
          {heroCh.logo && (
            <div className="absolute right-[6%] top-1/2 -translate-y-1/2 anim-floaty hidden sm:block">
              <div className="w-40 h-40 md:w-52 md:h-52 rounded-3xl bg-white/95 shadow-2xl flex items-center justify-center p-6">
                <img src={heroCh.logo} alt={heroCh.name} className="w-full h-full object-contain" onError={e => { e.target.style.display = 'none'; }} />
              </div>
            </div>
          )}

          <div className="absolute inset-y-0 left-0 z-10 flex flex-col justify-center px-6 md:px-12" style={{ width: 'min(560px, 78%)' }}>
            <div className="text-[clamp(22px,3vw,34px)] font-black italic text-white/85 mb-3 drop-shadow-lg">
              {fmtTime(heroEpg?.now?.start) || 'LIVE'}
            </div>
            <div className="flex items-center gap-2.5 mb-4">
              <span className="flex items-center gap-1.5 text-[12px] text-[#cfcfd6]">
                <span className="eq"><i></i><i></i><i></i></span>
                {t('app.live_now')}
              </span>
              {heroEpg?.now && (
                <span className="border border-white/60 rounded px-1.5 py-0.5 text-[10px] font-black text-white/80">{(heroCh.group_title || 'TV').slice(0, 1)}</span>
              )}
            </div>
            <h1 className="title-art text-[clamp(30px,4.4vw,52px)] font-black leading-[1.02] mb-4">{heroCh.name}</h1>
            {heroEpg?.now && (
              <>
                <span className="self-start bg-gradient-to-r from-[#ff9a3d] to-[#f36f21] text-white font-black italic text-[13px] md:text-[15px] px-3.5 py-1.5 rounded-lg mb-4">
                  {heroEpg.now.title}
                </span>
                <p className="text-[13px] md:text-[14px] text-[#e4e4e8] leading-relaxed max-w-[440px] mb-6 line-clamp-2">
                  {heroEpg.now.desc || heroCh.group_title}
                </p>
              </>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSelectChannel && onSelectChannel(heroCh)}
                className="btn-orange flex items-center gap-2.5 text-white font-extrabold text-[15px] px-7 py-3 rounded-xl"
              >
                ▶ {t('app.watch_now')}
              </button>
              <button
                onClick={() => onToggleFavorite && onToggleFavorite(heroCh.channel_id)}
                className="flex items-center gap-2 bg-[#2c2c30]/88 hover:bg-[#3c3c42]/90 text-white font-bold text-[14px] px-6 py-3 rounded-xl border border-white/10 transition"
              >
                {favSet.has(heroCh.channel_id) ? '♥' : '＋'} {t('app.favorites')}
              </button>
            </div>
          </div>

          {/* Dots */}
          {heroChannels.length > 1 && (
            <div className="absolute right-5 bottom-4 z-20 flex gap-2">
              {heroChannels.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setHeroIdx(i)}
                  aria-label={`slide ${i + 1}`}
                  className="h-[7px] rounded-md transition-all duration-300"
                  style={{ width: i === heroIdx ? 22 : 7, background: i === heroIdx ? '#f36f21' : 'rgba(255,255,255,.35)' }}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ===== THANH THỂ LOẠI (chbar, nền solid — không blur) ===== */}
      <div className="sticky top-0 z-30 topbar-mytv">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8">
          <div className="flex items-center gap-6 overflow-x-auto scrollbar-none">
            {categories.slice(0, 12).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`chbar-btn text-[13.5px] ${selectedCategory === cat ? 'on' : ''}`}
              >
                {cat === 'Tất Cả' || cat === 'All' ? t('movies.genre.all') : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-4 space-y-10">
        {/* ===== DÀNH CHO BẠN (lịch sử xem) ===== */}
        {recentChannels.length > 0 && (
          <section className="anim-fade-up">
            <h2 className="text-[21px] font-extrabold tracking-tight mb-4">{t('home.picked_for_you')}</h2>
            <div className="flex gap-3.5 overflow-x-auto scrollbar-none pb-2" style={{ scrollSnapType: 'x proximity' }}>
              {recentChannels.map(ch => (
                <ChannelArt key={ch.channel_id} ch={ch} onSelect={onSelectChannel} epgNowTitle={getEpgNow(ch)?.now?.title} isFav={favSet.has(ch.channel_id)} liveLabel={t('player.live')} />
              ))}
            </div>
          </section>
        )}

        {/* ===== NHÓM KÊNH (hrow) ===== */}
        {Object.entries(filteredGroups).map(([groupName, groupChannels], gi) => (
          <section key={groupName} className="anim-fade-up" style={{ animationDelay: `${Math.min(gi, 4) * 60}ms` }}>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[10px] text-[#ff9a3d] font-black uppercase tracking-widest mb-0.5">📺</p>
                <h2 className="text-[21px] font-extrabold tracking-tight">{groupName}</h2>
              </div>
              <span className="text-[11px] text-[#9b9ba3]">{groupChannels.length} {t('home.channels')}</span>
            </div>
            <div className="flex gap-3.5 overflow-x-auto scrollbar-none pb-2" style={{ scrollSnapType: 'x proximity' }}>
              {groupChannels.map(ch => (
                <ChannelArt key={ch.channel_id} ch={ch} onSelect={onSelectChannel} epgNowTitle={getEpgNow(ch)?.now?.title} isFav={favSet.has(ch.channel_id)} liveLabel={t('player.live')} />
              ))}
            </div>
          </section>
        ))}

        {/* Rỗng */}
        {!isLoading && Object.keys(filteredGroups).length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📺</p>
            <p className="text-sm text-[#9b9ba3]">{t('app.loading')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
