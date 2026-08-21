import React, { useMemo, useState } from 'react';
import { findEpgForChannel } from '../utils/epgMatch';
import { useI18n } from '../contexts/I18nContext';

const LOGO_FALLBACK = "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png";

export default function HomePage({
  channels, epgData, favorites, watchHistory,
  onSelectChannel, onToggleFavorite,
  selectedCategory, setSelectedCategory, categories,
}) {
  const { t } = useI18n();
  const [activeFilter, setActiveFilter] = useState('all');

  const getEpgNow = (ch) => {
    if (!epgData?.programmes || !ch) return null;
    return findEpgForChannel(epgData.programmes, ch).now;
  };

  const fCh = useMemo(() => {
    const isVietnamToday = (ch) => {
      const hay = ((ch.name || '') + ' ' + (ch.channel_id || '')).toLowerCase();
      return /vietnam\s*today|vtc1|vtoday/.test(hay);
    };
    const target = channels.find(isVietnamToday);
    const base = target || channels[0];
    if (!base) return null;
    return { ...base, epg: getEpgNow(base) };
  }, [channels, epgData]);

  const groupedChannels = useMemo(() => {
    const groups = {};
    channels.forEach(ch => {
      const g = ch.group_title || 'Khác';
      if (!groups[g]) groups[g] = [];
      groups[g].push(ch);
    });
    return groups;
  }, [channels]);

  const allGroups = useMemo(() => {
    return Object.fromEntries(
      Object.entries(groupedChannels).sort((a, b) => b[1].length - a[1].length)
    );
  }, [groupedChannels]);

  const filteredGroups = useMemo(() => {
    if (selectedCategory && selectedCategory !== 'all') {
      return groupedChannels[selectedCategory]
        ? { [selectedCategory]: groupedChannels[selectedCategory] }
        : {};
    }
    return allGroups;
  }, [groupedChannels, selectedCategory, allGroups]);

  const topGroups = useMemo(() => {
    return Object.fromEntries(
      Object.entries(allGroups).slice(0, 6)
    );
  }, [allGroups]);

  const recentChannels = useMemo(() => {
    const ids = watchHistory.slice(0, 8).map(h => h.channel_id);
    return channels.filter(ch => ids.includes(ch.channel_id));
  }, [channels, watchHistory]);

  const gradients = ['from-red-600 to-red-800', 'from-orange-600 to-red-700', 'from-purple-600 to-pink-700', 'from-cyan-600 to-blue-700', 'from-emerald-600 to-teal-700', 'from-amber-500 to-orange-700'];
  const icons = ['📰', '⚽', '🎬', '👶', '🌍', '🎵'];

  return (
    <div className="bg-black text-white">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-bg"></div>
        <div className="absolute inset-0">
          <div className="absolute top-20 right-10 w-[600px] h-[400px] bg-gradient-to-bl from-red-900/30 via-purple-900/20 to-transparent rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 left-10 w-[500px] h-[300px] bg-gradient-to-tr from-rose-900/30 to-transparent rounded-full blur-3xl"></div>
        </div>

        <div className="relative max-w-[1400px] mx-auto px-8 py-10 grid md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-7">
            <div className="flex items-center gap-3 mb-4">
              <span className="flex items-center gap-1.5 bg-red-600/15 backdrop-blur border border-red-600/30 text-red-400 px-3 py-1 rounded-full">
                <span className="live-dot shadow-red-400/60"></span>
                <span className="text-[10px] font-bold tracking-widest">{t('app.live_now')}</span>
              </span>
              <span className="text-[10px] text-stone-400 font-medium tracking-wider uppercase">{fCh?.group_title || ''}</span>
              {fCh?.logo && (
                <span className="flex items-center gap-2 pl-1">
                  <img src={fCh.logo} alt={fCh.name} className="w-7 h-7 object-contain rounded-md bg-white/10 p-0.5 border border-white/10" onError={e => e.target.style.display = 'none'} />
                  <span className="text-[11px] text-stone-300 font-bold">{fCh?.name}</span>
                </span>
              )}
            </div>

            <h1 className="font-display text-7xl font-black tracking-tight leading-[0.95] mb-5">
              {fCh?.name || 'CHRTV'}<br />
              <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">
                {fCh?.epg?.title || t('app.live_now')}
              </span>
            </h1>

            <div className="flex items-center gap-3 text-sm text-stone-400 mb-5">
              <span className="text-amber-400 font-bold">★★★★★ 4.8</span>
              <span>·</span>
              <span>{fCh?.group_title || ''}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                12.4K {t('app.live_now').includes('TRỰC TIẾP') ? 'đang xem' : 'watching'}
              </span>
            </div>

            <p className="text-sm text-stone-400 mb-7 max-w-md leading-snug line-clamp-2">
              {fCh?.epg?.desc || fCh?.name}
            </p>

            <div className="flex items-center gap-3">
              <button onClick={() => fCh && onSelectChannel(fCh)} className="flex items-center gap-2.5 bg-white text-black px-7 py-3 rounded-full font-bold text-sm hover:bg-stone-200 transition shadow-lg shadow-white/10">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                {t('movies.btn.play')}
              </button>
              <button onClick={() => fCh && onToggleFavorite(fCh.channel_id)} className="flex items-center gap-2.5 bg-white/10 backdrop-blur border border-white/15 text-white px-6 py-3 rounded-full font-medium text-sm hover:bg-white/20 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                {t('app.live_now').includes('TRỰC TIẾP') ? 'Yêu thích' : 'Favorite'}
              </button>
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="rounded-3xl bg-gradient-to-br from-stone-900 to-black border border-white/10 overflow-hidden shadow-2xl">
              <div className="aspect-video relative bg-gradient-to-br from-red-900/40 via-purple-900/30 to-blue-900/40 flex items-center justify-center">
                {fCh?.logo ? (
                  <div className="w-36 h-36 rounded-2xl bg-white/95 shadow-2xl shadow-red-900/30 flex items-center justify-center p-4">
                    <img src={fCh.logo} alt={fCh.name} className="w-full h-full object-contain" onError={e => { e.target.style.display = 'none'; }} />
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="w-24 h-24 mx-auto bg-white/10 backdrop-blur-xl rounded-full border border-white/20 flex items-center justify-center mb-3">
                      <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                    <p className="text-xs text-stone-400">{t('app.loading')} — {fCh?.name || 'CHRTV'}</p>
                  </div>
                )}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600 text-[10px] font-bold px-2.5 py-1 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span> {t('player.live')}
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm font-bold">{fCh?.name} · {fCh?.epg?.title || t('player.live')}</p>
                <p className="text-xs text-stone-500">{fCh?.epg ? (fCh.epg.start + ' — ' + fCh.epg.stop) : '24/7'}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STICKY TABS */}
      <div className="sticky top-[57px] z-30 bg-black/85 glass border-y border-white/5">
        <div className="max-w-[1400px] mx-auto px-8">
          <div className="flex items-center gap-7 overflow-x-auto scrollbar-none text-sm font-medium">
            {categories.slice(0, 10).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`tab-btn whitespace-nowrap py-3.5 px-1 ${selectedCategory === cat ? 'active text-white' : 'text-stone-400 hover:text-white'}`}
              >
                {cat === 'Tất Cả' ? t('movies.genre.all') : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-12 pb-32">

        {recentChannels.length > 0 && (
          <section>
            <div className="flex items-end justify-between mb-5">
              <div>
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-1">{t('app.live_now').includes('TRỰC TIẾP') ? 'Dành cho bạn' : 'Picked for you'}</p>
                <h2 className="font-display text-2xl font-black tracking-tight">{t('app.live_now').includes('TRỰC TIẾP') ? 'Picked by You' : 'Recently Watched'}</h2>
                <p className="text-xs text-stone-500 mt-1">{t('app.live_now').includes('TRỰC TIẾP') ? 'Dựa trên lịch sử xem' : 'Based on your watch history'}</p>
              </div>
            </div>
            <div className="row flex gap-4 overflow-x-auto pb-4 -mx-2 px-2">
              {recentChannels.map(ch => (
                <button key={ch.channel_id} onClick={() => onSelectChannel(ch)} className="card shrink-0 w-72 cursor-pointer text-left">
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 mb-2">
                    <img src={ch.logo} alt="" className="absolute inset-0 w-full h-full object-contain p-6" onError={e => e.target.style.display = 'none'} />
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-red-600 text-[10px] font-bold rounded-md flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white"></span> {t('player.live')}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
                  </div>
                  <p className="text-sm font-bold leading-tight truncate">{ch.name}</p>
                  <p className="text-[11px] text-stone-500 truncate mt-1">{ch.group_title}</p>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest mb-1">{t('app.live_now').includes('TRỰC TIẾP') ? 'Khám phá' : 'Explore'}</p>
              <h2 className="font-display text-2xl font-black tracking-tight">{t('app.live_now').includes('TRỰC TIẾP') ? 'Thể loại phổ biến' : 'Popular Categories'}</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.keys(topGroups).slice(0, 6).map((cat, i) => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`card relative aspect-square rounded-2xl bg-gradient-to-br ${gradients[i]} p-5 cursor-pointer overflow-hidden text-left`}>
                <div className="absolute -bottom-4 -right-4 text-7xl opacity-30">{icons[i]}</div>
                <div className="relative z-10">
                  <div className="text-3xl font-black tracking-tighter">{topGroups[cat]?.length || 0}</div>
                  <p className="text-sm font-bold leading-tight">{cat}</p>
                  <p className="text-[10px] opacity-80 mt-0.5">{topGroups[cat]?.length || 0} {t('app.live_now').includes('TRỰC TIẾP') ? 'kênh' : 'channels'}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {Object.entries(filteredGroups).map(([groupName, groupChannels]) => (
          <section key={groupName}>
            <div className="flex items-end justify-between mb-5">
              <div>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest mb-1">📺 {groupName}</p>
                <h2 className="font-display text-2xl font-black tracking-tight">{groupName}</h2>
                <p className="text-xs text-stone-500 mt-1">{groupChannels.length} {t('app.live_now').includes('TRỰC TIẾP') ? 'kênh' : 'channels'}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {groupChannels.map(ch => {
                const isFav = favorites.includes(ch.channel_id);
                return (
                  <div key={ch.channel_id} className="card rounded-2xl bg-stone-900/40 border border-stone-800 hover:border-red-500/40 overflow-hidden cursor-pointer">
                    <div className="relative aspect-[4/3] bg-gradient-to-br from-stone-700 via-stone-800 to-stone-900 flex items-center justify-center overflow-hidden">
                      <div className="absolute inset-0 opacity-30" style={{background: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,.05) 10px, rgba(255,255,255,.05) 20px)'}}></div>
                      {ch.logo ? (
                        <img src={ch.logo} alt="" className="w-16 h-16 object-contain relative z-10" onError={e => e.target.style.display = 'none'} />
                      ) : (
                        <span className="text-5xl font-black text-white/30 tracking-tighter relative z-10">{ch.name.charAt(0)}</span>
                      )}
                      <div className="absolute top-3 left-3 px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-white"></span> {t('player.live')}
                      </div>
                      <div className="absolute bottom-3 right-3 px-2 py-0.5 bg-black/70 backdrop-blur text-[10px] rounded font-medium">HD</div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-bold text-base">{ch.name}</p>
                        <span className="text-[10px] text-amber-400 font-bold">★</span>
                      </div>
                      <p className="text-[11px] text-stone-500 line-clamp-1">{getEpgNow(ch)?.title || t('player.live')}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <button onClick={() => onSelectChannel(ch)} className="flex-1 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg transition">{t('app.live_now').includes('TRỰC TIẾP') ? 'Xem' : 'Watch'}</button>
                        <button onClick={() => onToggleFavorite(ch.channel_id)} className="px-2 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition">
                          <svg className={`w-3 h-3 ${isFav ? 'fill-red-500 text-red-500' : 'text-stone-400 hover:text-white'}`} fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

      </div>
    </div>
  );
}
