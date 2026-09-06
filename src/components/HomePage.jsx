import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Play, ChevronLeft, ChevronRight, Flame, Sparkles, Clapperboard, Star, Trophy, Eye, ChevronRight as ArrowIcon, PartyPopper } from 'lucide-react';
import { maskScores } from '../utils/spoiler';
import { findEpgForChannel } from '../utils/epgMatch';
import { parseEpgDate } from '../utils/dateUtils';
import { useI18n } from '../contexts/I18nContext';
import { MovieAPI, imgPath, bgPath } from '../services/tmdb';
import { fetchEvents } from '../services/events';
import { fetchLeague, LEAGUES } from '../services/sports';
import { API_BASE } from '../services/config';
import Footer from './Footer';
import TopChannelsStrip from './TopChannelsStrip';
import AdSlot from './AdSlot';

/**
 * TRANG CHỦ:
 *  1. Banner (sự kiện + phim)
 *  2. Kênh trending
 *  3. Phim trending
 *  4. Shorts
 *  5. Tỉ số thể thao + Sự kiện
 *  6. Footer
 */
const SLIDE_GRADS = [
  'linear-gradient(100deg,#160d05 0%,#3a1508 40%,#7a2f0e 78%,#c8571d 100%)',
  'linear-gradient(100deg,#061630 0%,#0b2a5e 50%,#14418f 80%,#2f6fd0 100%)',
  'linear-gradient(100deg,#2b0505 0%,#5e0b0b 45%,#8f1a10 80%,#c0392b 100%)',
  'linear-gradient(100deg,#0a1f0c 0%,#14421c 45%,#2e7d32 80%,#66bb6a 100%)',
  'linear-gradient(100deg,#1c0a2e 0%,#3d1160 45%,#6d28a8 80%,#a855f7 100%)',
];

function fmtCount(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function fmtDate(d) {
  try {
    const m = String(d || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}` : '';
  } catch { return ''; }
}

export default function HomePage({
  channels, epgData, favorites, watchHistory,
  onSelectChannel, onSelectMovie, onGoTab, onOpenShort,
}) {
  const { t } = useI18n();
  const [heroIdx, setHeroIdx] = useState(0);
  const [trending, setTrending] = useState([]);
  const [events, setEvents] = useState([]);
  const [shorts, setShorts] = useState([]);
  const [scores, setScores] = useState([]);

  useEffect(() => {
    let on = true;
    MovieAPI.trending().then(r => { if (on) setTrending((r.results || []).slice(0, 12)); }).catch(() => {});
    fetchEvents().then(ev => { if (on) setEvents(ev || []); }).catch(() => {});
    fetch(`${API_BASE}/api/shorts?limit=12`).then(r => r.json()).then(d => { if (on) setShorts(d.shorts || []); }).catch(() => {});
    const epl = LEAGUES.find(l => l.id === 'epl');
    if (epl) fetchLeague(epl).then(d => { if (on) setScores((d.past || []).slice(0, 6)); }).catch(() => {});
    return () => { on = false; };
  }, []);

  const getEpgNow = useCallback((ch) => {
    if (!epgData?.programmes || !ch) return null;
    try { return findEpgForChannel(epgData.programmes, ch); } catch { return null; }
  }, [epgData]);

  const favSet = useMemo(() => new Set(favorites || []), [favorites]);
  const recentSet = useMemo(() => new Set((watchHistory || []).slice(0, 15).map(h => h.channel_id)), [watchHistory]);

  // ===== BANNER =====
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
  const safeIdx = slides.length ? heroIdx % slides.length : 0;

  const openEventLink = useCallback((ev) => {
    const lt = ev.link_type || 'none';
    const lv = ev.link_value || '';
    if (lt === 'tab' && lv && onGoTab) onGoTab(lv);
    else if (lt === 'channel' && lv && onSelectChannel) {
      const ch = (channels || []).find(c => String(c.channel_id) === String(lv) || (c.name || '').toLowerCase() === String(lv).toLowerCase());
      if (ch) onSelectChannel(ch);
    } else if (lt === 'url' && lv) {
      try { window.open(lv, '_blank', 'noopener'); } catch {}
    }
  }, [onGoTab, onSelectChannel, channels]);

  const onHeroClick = useCallback(() => {
    if (!hero) return;
    if (hero.kind === 'movie') {
      if (onSelectMovie) onSelectMovie(hero.data);
      return;
    }
    openEventLink(hero.data || {});
  }, [hero, onSelectMovie, openEventLink]);

  // ===== Kênh trending: đang phát + yêu thích + xem gần đây =====
  const trendingCh = useMemo(() => {
    if (!channels?.length) return [];
    return channels
      .map(ch => {
        const epg = getEpgNow(ch);
        return { ch, epg, score: (epg?.now ? 3 : 0) + (favSet.has(ch.channel_id) ? 2 : 0) + (recentSet.has(ch.channel_id) ? 2 : 0) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [channels, getEpgNow, favSet, recentSet]);

  return (
    <div className="text-white">
      {/* ===== 1. BANNER ===== */}
      {hero && (
        <section className="relative mx-3 md:mx-5 mt-3 rounded-3xl overflow-hidden anim-fade-up border border-white/[0.06]" style={{ height: 'min(56vh, 460px)', minHeight: 330 }}>
          {hero.img ? (
            <div key={hero.id} className="absolute inset-0 bg-cover bg-center anim-fade-up" style={{ backgroundImage: `url(${hero.img})` }}></div>
          ) : (
            <div key={hero.id} className="absolute inset-0 anim-fade-up" style={{ background: SLIDE_GRADS[safeIdx % SLIDE_GRADS.length] }}></div>
          )}
          <div className="absolute inset-0" style={{
            background: 'linear-gradient(90deg, rgba(0,0,0,.93) 0%, rgba(0,0,0,.66) 38%, rgba(0,0,0,.2) 62%, rgba(0,0,0,.08) 100%), linear-gradient(0deg, rgba(11,11,13,.88) 0%, transparent 32%)',
          }}></div>
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

      <div className="max-w-[1400px] mx-auto px-5 md:px-8 pt-8 space-y-10">
        <TopChannelsStrip channels={channels} onSelectChannel={onSelectChannel} />
        <AdSlot slot="home" />
        {/* ===== 2. KÊNH TRENDING ===== */}
        {trendingCh.length > 0 && (
          <section className="anim-fade-up">
            <SectionHead icon={<Flame className="w-4 h-4 text-[#ff9a3d]" />} wrap="bg-[#f36f21]/15 border-[#f36f21]/25" title={t('home.trending_ch')} sub={t('home.trending_ch_sub')} action={onGoTab ? { label: t('home.view_all'), onClick: () => onGoTab('tv') } : null} />
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 snap-x">
              {trendingCh.map(({ ch, epg }, i) => (
                <button
                  key={ch.channel_id}
                  onClick={() => onSelectChannel && onSelectChannel(ch)}
                  className="group relative shrink-0 w-[190px] md:w-[220px] snap-start rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#f36f21]/60 bg-[#15161b] text-left transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[#f36f21]/10"
                >
                  <span className="block relative h-[104px] md:h-[120px] flex items-center justify-center bg-[#0c0d11] overflow-hidden">
                    <span className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at 20% 120%, rgba(243,111,33,.3), transparent 65%)' }}></span>
                    <span className="absolute left-1.5 bottom-0 font-black leading-none select-none" style={{ fontSize: 64, color: 'transparent', WebkitTextStroke: '2px rgba(255,255,255,.22)' }}>{i + 1}</span>
                    {ch.logo ? (
                      <img src={ch.logo} alt="" loading="lazy" className="h-14 md:h-16 object-contain relative z-10 drop-shadow-xl group-hover:scale-110 transition-transform" onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <span className="font-black italic text-white/25 text-2xl relative z-10">{(ch.name || '?').slice(0, 8)}</span>
                    )}
                    <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="w-10 h-10 rounded-full bg-[#f36f21] flex items-center justify-center shadow-lg"><Play className="w-4 h-4 text-white fill-current ml-0.5" /></span>
                    </span>
                  </span>
                  <span className="block px-3 py-2.5">
                    <span className="block text-[13px] font-bold text-white truncate">{ch.name}</span>
                    <span className="block text-[11px] text-stone-500 truncate mt-0.5">{epg?.now ? maskScores(epg.now.title) : (ch.group_title || '')}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===== 3. PHIM TRENDING ===== */}
        {trending.length > 0 && (
          <section className="anim-fade-up">
            <SectionHead icon={<Clapperboard className="w-4 h-4 text-amber-400" />} wrap="bg-amber-500/15 border-amber-500/30" title={t('home.trending_movies')} sub={t('home.trending_sub')} action={onGoTab ? { label: t('home.view_all'), onClick: () => onGoTab('movies') } : null} />
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

        {/* ===== 4. SHORTS ===== */}
        {shorts.length > 0 && (
          <section className="anim-fade-up">
            <SectionHead icon={<Play className="w-4 h-4 text-cyan-300" />} wrap="bg-cyan-500/15 border-cyan-500/30" title={t('home.shorts')} sub={t('home.shorts_sub')} action={onGoTab ? { label: t('home.view_all'), onClick: () => onGoTab('shorts') } : null} />
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-2 snap-x">
              {shorts.map(s => (
                <button
                  key={s.id}
                  onClick={() => onOpenShort && onOpenShort(s.id)}
                  className="group relative shrink-0 w-[120px] md:w-[140px] snap-start text-left active:scale-[0.98] transition-transform"
                >
                  <span className="block aspect-[9/16] rounded-2xl overflow-hidden bg-stone-900 border border-white/10 group-hover:border-cyan-400/60 transition-all relative">
                    {s.thumb_url ? (
                      <img src={s.thumb_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-3xl bg-gradient-to-b from-[#1a1c24] to-[#0c0d11]">▶️</span>
                    )}
                    <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/30"></span>
                    <span className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-bold text-white">
                      <Eye className="w-2.5 h-2.5" /> {fmtCount(s.views)}
                    </span>
                    <span className="absolute inset-x-0 bottom-0 p-2">
                      <span className="block text-[11px] font-bold leading-tight line-clamp-2 text-left">{s.title || s.caption || ''}</span>
                      <span className="flex items-center gap-1 mt-1 text-[9px] text-stone-400 font-semibold">❤ {fmtCount(s.likes)}</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center"><Play className="w-4 h-4 text-black fill-current ml-0.5" /></span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===== 5. TỈ SỐ + SỰ KIỆN ===== */}
        <section className="anim-fade-up grid lg:grid-cols-2 gap-6">
          {/* Tỉ số mới nhất */}
          <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4 md:p-5">
            <div className="flex items-center justify-between mb-3.5">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-emerald-400" />
                </span>
                <h2 className="text-[17px] font-extrabold tracking-tight">{t('home.scores')}</h2>
              </div>
              {onGoTab && (
                <button onClick={() => onGoTab('sports')} className="flex items-center gap-0.5 text-[11px] font-bold text-[#ff9a3d] hover:text-white transition-colors">
                  {t('home.view_all')} <ArrowIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="space-y-2">
              {scores.length === 0 && (
                <p className="text-[12px] text-stone-600 italic text-center py-6">{t('sports.no_data')}</p>
              )}
              {scores.map(ev => (
                <div key={ev.idEvent} className="flex items-center gap-2 rounded-2xl bg-black/30 border border-white/[0.05] px-3 py-2.5">
                  <span className="text-[10px] font-bold text-stone-500 w-10 shrink-0">{fmtDate(ev.dateEvent)}</span>
                  <span className="flex-1 min-w-0 flex items-center justify-end gap-1.5">
                    <span className="text-[12px] font-bold text-slate-200 truncate text-right">{ev.strHomeTeam}</span>
                    {ev.strHomeTeamBadge && <img src={ev.strHomeTeamBadge} alt="" loading="lazy" className="w-6 h-6 object-contain shrink-0" onError={e => { e.target.style.display = 'none'; }} />}
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-white/[0.07] text-[13px] font-black text-white tabular-nums shrink-0">
                    {ev.intHomeScore ?? '-'} - {ev.intAwayScore ?? '-'}
                  </span>
                  <span className="flex-1 min-w-0 flex items-center gap-1.5">
                    {ev.strAwayTeamBadge && <img src={ev.strAwayTeamBadge} alt="" loading="lazy" className="w-6 h-6 object-contain shrink-0" onError={e => { e.target.style.display = 'none'; }} />}
                    <span className="text-[12px] font-bold text-slate-200 truncate">{ev.strAwayTeam}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          {/* Sự kiện */}
          <div className="rounded-3xl border border-white/[0.07] bg-white/[0.02] p-4 md:p-5">
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center">
                <PartyPopper className="w-4 h-4 text-fuchsia-400" />
              </span>
              <h2 className="text-[17px] font-extrabold tracking-tight">{t('home.events_title')}</h2>
            </div>
            <div className="space-y-2">
              {events.length === 0 && (
                <p className="text-[12px] text-stone-600 italic text-center py-6">{t('home.no_events')}</p>
              )}
              {events.slice(0, 5).map(ev => (
                <button
                  key={ev.id}
                  onClick={() => openEventLink(ev)}
                  className="w-full flex items-center gap-3 rounded-2xl bg-black/30 border border-white/[0.05] hover:border-fuchsia-500/40 p-2.5 text-left transition-all active:scale-[0.99] group"
                >
                  {ev.image_url ? (
                    <img src={ev.image_url} alt="" loading="lazy" className="w-20 h-12 object-cover rounded-xl shrink-0" onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    <span className="w-20 h-12 rounded-xl grad-brand flex items-center justify-center text-xl shrink-0">🎉</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-white truncate group-hover:text-fuchsia-200">{ev.title}</span>
                    {ev.subtitle && <span className="block text-[11px] text-stone-500 truncate mt-0.5">{ev.subtitle}</span>}
                  </span>
                  <ArrowIcon className="w-4 h-4 text-stone-600 group-hover:text-white shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ===== 6. FOOTER ===== */}
      <Footer onGoTab={onGoTab} />
    </div>
  );
}

function SectionHead({ icon, wrap, title, sub, action }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <span className={`w-9 h-9 rounded-xl border flex items-center justify-center ${wrap}`}>{icon}</span>
        <div>
          <h2 className="text-[20px] font-extrabold tracking-tight leading-tight">{title}</h2>
          {sub && <p className="text-[11px] text-stone-500">{sub}</p>}
        </div>
      </div>
      {action && (
        <button onClick={action.onClick} className="flex items-center gap-1 px-3.5 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[12px] font-bold text-stone-200 transition-all active:scale-95">
          {action.label} <ArrowIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
