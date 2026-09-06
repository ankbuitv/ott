import React, { useMemo, useState, useCallback } from 'react';
import { Play, Clock, Radio, Tv, ChevronDown, ChevronUp, Search, Heart } from 'lucide-react';
import { maskScores } from '../utils/spoiler';
import { useI18n } from '../contexts/I18nContext';
import { parseEpgDate, formatTimeHHMM } from '../utils/dateUtils';
import VideoPlayer from './VideoPlayer';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Trang TV: player shaka trên cùng, EPG kênh bên phải, list kênh bên dưới.
 */
export default function TVPage({
  channels = [],
  epgData = null,
  tvChannel,
  tvStreamUrl,
  tvLoading,
  onOpenTvChannel,
  onPlayCatchup,
  onToggleFavorite,
  favorites = [],
  onNextTv,
  onPrevTv,
  onCloseTv,
  partyRoom = null,
  userName = 'Khách',
  getEpgForChannel = null,
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const favSet = useMemo(() => new Set(favorites || []), [favorites]);

  // Programmes hôm nay của kênh đang mở
  const dayPrograms = useMemo(() => {
    if (!tvChannel) return [];
    const cid = String(tvChannel.channel_id || '');
    const pool = (epgData?.programmes || []).filter(p =>
      String(p.channel || '') === cid ||
      (cid && norm(p.channel) === norm(cid)) ||
      (p.display_name && norm(p.display_name) === norm(tvChannel.name))
    );
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return pool
      .map(p => ({ ...p, _s: parseEpgDate(p.start).getTime(), _e: parseEpgDate(p.stop).getTime() }))
      .filter(p => !isNaN(p._s) && p._s >= start.getTime() && p._s <= end.getTime())
      .sort((a, b) => a._s - b._s)
      .slice(0, 80);
  }, [tvChannel, epgData]);

  const nowTs = useMemo(() => Date.now(), [dayPrograms, tvChannel]);

  const handleProgClick = useCallback((prog) => {
    if (!tvChannel) return;
    const now = Date.now();
    if (prog._e < now) {
      if (onPlayCatchup) onPlayCatchup(tvChannel, prog);
    }
  }, [tvChannel, onPlayCatchup]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter(c => (c.name || '').toLowerCase().includes(q));
  }, [channels, query]);

  const visibleChannels = expanded ? filtered : filtered.slice(0, 24);

  return (
    <div className="text-white pb-12 px-3 md:px-5 max-w-[1400px] mx-auto">
      {/* ===== Trên: player + EPG ===== */}
      <div className="grid lg:grid-cols-[1fr_330px] gap-3 mt-3 items-start">
        {/* Player */}
        <div className="rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl shadow-black/60" style={{ aspectRatio: '16/9', maxHeight: '62vh', width: '100%' }}>
          {tvChannel && tvStreamUrl ? (
            <VideoPlayer
              key={tvChannel.channel_id}
              channel={tvChannel}
              streamUrl={tvStreamUrl}
              epgNow={getEpgForChannel ? getEpgForChannel(tvChannel.channel_id).now : null}
              epgNext={getEpgForChannel ? getEpgForChannel(tvChannel.channel_id).next : null}
              onNextChannel={onNextTv}
              onPrevChannel={onPrevTv}
              onClose={onCloseTv}
              mini={false}
              onMinimize={null}
              allChannels={channels}
              epgLookup={getEpgForChannel}
              initialPartyRoom={partyRoom}
              currentUserName={userName}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#0c0d11]">
              {tvLoading ? (
                <>
                  <div className="w-10 h-10 border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs text-stone-500 font-bold">{t('tv.loading')}</p>
                </>
              ) : (
                <>
                  <Tv className="w-12 h-12 text-stone-700" />
                  <p className="text-sm text-stone-500 font-semibold">{t('tv.pick')}</p>
                </>
              )}
            </div>
          )}
        </div>

        {/* EPG kênh đang mở */}
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.07] overflow-hidden flex flex-col" style={{ maxHeight: '62vh', minHeight: 320 }}>
          {!tvChannel ? (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-600 py-16 px-6 text-center">
              <Clock className="w-9 h-9 mb-2" />
              <p className="text-xs">{t('tv.no_epg')}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-3.5 py-3 border-b border-white/5 bg-black/30 shrink-0">
                {tvChannel.logo ? (
                  <img src={tvChannel.logo} alt="" className="w-9 h-9 object-contain rounded-lg bg-black/50 p-0.5 ring-1 ring-white/10" onError={e => { e.target.style.display = 'none'; }} />
                ) : (
                  <span className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-sm font-black text-stone-500">{(tvChannel.name || '?').slice(0, 1)}</span>
                )}
                <div className="min-w-0 flex-1">
                  <h2 className="text-[13px] font-black text-white truncate">{tvChannel.name}</h2>
                  <p className="text-[10px] text-stone-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#f36f21] animate-pulse"></span>
                    {t('tv.now_on')} · {dayPrograms.length} {t('epg.progs')}
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                {dayPrograms.length === 0 && (
                  <p className="text-center text-[11px] text-stone-600 italic py-10">{t('epg.no_data')}</p>
                )}
                {dayPrograms.map((prog, idx) => {
                  const isPast = prog._e < nowTs;
                  const isLive = prog._s <= nowTs && prog._e >= nowTs;
                  const pct = isLive && prog._e > prog._s ? Math.min(100, Math.max(0, ((nowTs - prog._s) / (prog._e - prog._s)) * 100)) : 0;
                  return (
                    <button
                      key={`${prog.start}-${idx}`}
                      onClick={() => handleProgClick(prog)}
                      className={`w-full text-left px-2.5 py-2 rounded-xl border transition-all flex gap-2.5 ${
                        isLive
                          ? 'bg-[#f36f21]/15 border-[#f36f21]/50'
                          : isPast
                          ? 'bg-white/[0.02] border-white/[0.06] hover:border-purple-500/40'
                          : 'bg-transparent border-transparent hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="shrink-0 w-[86px] pt-px">
                        <span className={`block text-[11px] font-black ${isLive ? 'text-[#ffb37a]' : 'text-stone-400'}`}>{formatTimeHHMM(prog.start)}</span>
                        <span className="block text-[9px] text-stone-600 font-semibold">– {formatTimeHHMM(prog.stop)}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={`text-[12px] font-bold leading-snug line-clamp-2 ${isLive ? 'text-white' : isPast ? 'text-slate-500' : 'text-slate-300'}`}>
                            {maskScores(prog.title)}
                          </span>
                          {isLive && <span className="px-1.5 py-px text-[8px] font-black rounded-full grad-brand text-white shrink-0">LIVE</span>}
                          {isPast && <Play className="w-3 h-3 text-purple-400 shrink-0 fill-current" />}
                        </span>
                        {isLive && (
                          <span className="block mt-1.5 h-1 rounded-full bg-black/40 overflow-hidden">
                            <span className="block h-full rounded-full bg-gradient-to-r from-[#f36f21] to-[#ff9a3d]" style={{ width: `${pct}%` }}></span>
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===== Dưới: list kênh ===== */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#f36f21]/15 border border-[#f36f21]/25 flex items-center justify-center">
              <Radio className="w-4 h-4 text-[#ff9a3d]" />
            </span>
            <div>
              <h2 className="text-[20px] font-extrabold tracking-tight leading-tight">{t('tv.all_channels')}</h2>
              <p className="text-[11px] text-stone-500">{t('home.n_channels', { n: filtered.length })}</p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('epg.search_ch')}
              className="w-full pl-9 pr-3 py-2 bg-white/[0.06] border border-white/10 rounded-full text-[13px] text-slate-200 placeholder:text-stone-500 focus:outline-none focus:border-[#f36f21]/70 focus:ring-2 focus:ring-[#f36f21]/20"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {visibleChannels.map(ch => {
            const active = tvChannel && ch.channel_id === tvChannel.channel_id;
            return (
              <button
                key={ch.channel_id}
                onClick={() => onOpenTvChannel && onOpenTvChannel(ch)}
                className={`group relative rounded-2xl overflow-hidden border text-left transition-all hover:-translate-y-0.5 ${
                  active
                    ? 'bg-[#f36f21]/10 border-[#f36f21]/60 shadow-lg shadow-[#f36f21]/15'
                    : 'bg-[#15161b] border-white/[0.06] hover:border-[#f36f21]/40'
                }`}
              >
                <span className="block relative aspect-video flex items-center justify-center bg-[#0c0d11] overflow-hidden">
                  {ch.logo ? (
                    <img src={ch.logo} alt="" loading="lazy" className="w-14 h-14 md:w-16 md:h-16 object-contain drop-shadow-lg group-hover:scale-110 transition-transform" onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    <span className="font-black italic text-white/25 text-2xl">{(ch.name || '?').slice(0, 3)}</span>
                  )}
                  {active && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg grad-brand text-[8px] font-black text-white flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span> LIVE
                    </span>
                  )}
                  {onToggleFavorite && (
                    <span
                      role="button" tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(ch.channel_id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onToggleFavorite(ch.channel_id); } }}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/60 hover:bg-black/80"
                    >
                      <Heart className={`w-3 h-3 ${favSet.has(ch.channel_id) ? 'fill-[#f36f21] text-[#f36f21]' : 'text-slate-400'}`} />
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="w-10 h-10 rounded-full bg-[#f36f21] flex items-center justify-center"><Play className="w-4 h-4 text-white fill-current ml-0.5" /></span>
                  </span>
                </span>
                <span className="block px-2.5 py-2">
                  <span className="block text-[12px] font-bold text-white truncate">{ch.name}</span>
                  <span className="block text-[10px] text-stone-500 truncate">{ch.group_title || ''}</span>
                </span>
              </button>
            );
          })}
        </div>
        {filtered.length > 24 && (
          <div className="flex justify-center mt-5">
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-[12px] font-bold text-stone-200 transition-all"
            >
              {expanded ? <>{t('home.collapse')} <ChevronUp className="w-3.5 h-3.5" /></> : <>{t('home.expand', { n: filtered.length - 24 })} <ChevronDown className="w-3.5 h-3.5" /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
