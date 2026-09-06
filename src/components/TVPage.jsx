import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import shaka from 'shaka-player';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Search, Heart, Radio, Clock, AlertTriangle, RefreshCw, Tv } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { parseEpgDate, formatTimeHHMM } from '../utils/dateUtils';
import { maskScores } from '../utils/spoiler';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function SimpleHlsPlayer({ streamUrl, channel, onError, onRetry }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const shakaRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(100);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    let cancelled = false;
    setError(null);
    setBuffering(true);

    const isMpd = /\.mpd(\?|$)/i.test(streamUrl);
    const isHls = /\.m3u8(\?|$)/i.test(streamUrl);

    const cleanup = () => {
      try { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } } catch {}
      try { if (shakaRef.current) { shakaRef.current.destroy(); shakaRef.current = null; } } catch {}
    };

    const init = async () => {
      try {
        // Try hls.js first for HLS — better CORS handling, lighter
        if (isHls && Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30,
          });
          hlsRef.current = hls;
          hls.attachMedia(video);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => {
            if (cancelled) return;
            hls.loadSource(streamUrl);
          });
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            setBuffering(false);
            video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
          });
          hls.on(Hls.Events.ERROR, (evt, data) => {
            if (cancelled) return;
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                // try recover, else fallback to shaka
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                console.error('hls fatal', data);
                // fallback to shaka for this URL
                cleanup();
                loadShaka();
              }
            }
          });
          return;
        }
        await loadShaka();
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          await loadShaka();
        }
      }
    };

    const loadShaka = async () => {
      try {
        shaka.polyfill.installAll();
        if (shaka.Player.isBrowserSupported()) {
          const player = new shaka.Player(video);
          shakaRef.current = player;
          player.configure({
            streaming: { rebufferingGoal: 2, bufferingGoal: 12, lowLatencyMode: true },
            abr: { enabled: true },
            manifest: { retryParameters: { maxAttempts: 3, baseDelay: 1000 } },
          });
          const ckId = channel?.clearKeyId || channel?.clear_key_id;
          const ckKey = channel?.clearKey || channel?.clear_key;
          if (ckId && ckKey) {
            const kid = String(ckId).replace(/[^a-f0-9]/gi, '');
            const k = String(ckKey).replace(/[^a-f0-9]/gi, '');
            if (kid.length === 32 && k.length === 32) {
              try { player.configure({ drm: { clearKeys: { [kid]: k } } }); } catch {}
            }
          }
          player.addEventListener('buffering', (e) => { if (!cancelled) setBuffering(e.buffering); });
          player.addEventListener('error', (e) => {
            if (cancelled) return;
            const msg = e.detail?.message || 'Không phát được kênh này';
            setError(msg);
            setBuffering(false);
            onError && onError(msg);
          });
          await player.load(streamUrl);
          if (!cancelled) {
            try { await video.play(); setPlaying(true); } catch { setPlaying(false); }
            setBuffering(false);
          }
        } else {
          // native
          video.src = streamUrl;
          video.addEventListener('waiting', () => !cancelled && setBuffering(true));
          video.addEventListener('playing', () => !cancelled && setBuffering(false));
          try { await video.play(); setPlaying(true); } catch { setPlaying(false); }
          setBuffering(false);
        }
      } catch (err) {
        if (!cancelled) {
          const m = String(err?.message || err || 'Lỗi tải luồng');
          setError(m);
          setBuffering(false);
          onError && onError(m);
        }
      }
    };

    init();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [streamUrl, channel]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().then(() => setPlaying(true)).catch(() => {}); }
    else { v.pause(); setPlaying(false); }
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }, []);

  const changeVol = useCallback((e) => {
    const v = videoRef.current;
    const val = Number(e.target.value);
    setVol(val);
    if (v) {
      v.volume = val / 100;
      if (val === 0) { v.muted = true; setMuted(true); }
      else if (v.muted) { v.muted = false; setMuted(false); }
    }
  }, []);

  const goFullscreen = useCallback(() => {
    const el = videoRef.current?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  }, []);

  return (
    <div className="relative w-full h-full bg-black group">
      <video ref={videoRef} className="w-full h-full object-contain" playsInline autoPlay controls={false} />

      {buffering && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
          <div className="w-10 h-10 border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
          <span className="mt-3 text-[11px] text-white/60 font-bold tracking-widest">ĐANG TẢI...</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-6 text-center">
          <div className="max-w-sm">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#f36f21]/15 border border-[#f36f21]/30 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-[#ff9a3d]" />
            </div>
            <h3 className="text-white font-black text-[15px] mb-1">Không xem được</h3>
            <p className="text-stone-400 text-xs mb-1">{channel?.name}</p>
            <p className="text-stone-500 text-[11px] mb-4 line-clamp-3">{String(error).slice(0, 160)}</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => { setError(null); onRetry && onRetry(); }} className="px-4 py-2 rounded-full bg-[#f36f21] text-white text-xs font-bold flex items-center gap-1.5 hover:brightness-110">
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại
              </button>
              <a href={streamUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-full bg-white/10 text-white text-xs font-bold hover:bg-white/15">Mở link gốc</a>
            </div>
          </div>
        </div>
      )}

      {/* Minimal bottom controls — show on hover */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
        <button onClick={togglePlay} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
        </button>
        <button onClick={toggleMute} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
          {muted || vol === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input type="range" min={0} max={100} value={muted ? 0 : vol} onChange={changeVol} className="w-20 accent-[#f36f21]" />
        <div className="ml-auto flex items-center gap-2">
          <button onClick={goFullscreen} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white">
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

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
  getEpgForChannel = null,
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('Tất Cả');
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const favSet = useMemo(() => new Set(favorites || []), [favorites]);

  const categories = useMemo(() => {
    const s = new Set(['Tất Cả']);
    channels.forEach(c => { if (c.group_title) s.add(c.group_title); });
    return Array.from(s);
  }, [channels]);

  const filtered = useMemo(() => {
    let list = channels;
    if (cat !== 'Tất Cả') list = list.filter(c => c.group_title === cat);
    if (showFavOnly) list = list.filter(c => favSet.has(c.channel_id));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(c => (c.name || '').toLowerCase().includes(q) || (c.group_title || '').toLowerCase().includes(q));
    return list;
  }, [channels, cat, showFavOnly, query, favSet]);

  const epgNowNext = useMemo(() => {
    if (!tvChannel || !getEpgForChannel) return { now: null, next: null };
    try { return getEpgForChannel(tvChannel.channel_id); } catch { return { now: null, next: null }; }
  }, [tvChannel, getEpgForChannel]);

  const dayPrograms = useMemo(() => {
    if (!tvChannel || !epgData?.programmes) return [];
    const cid = String(tvChannel.channel_id || '');
    const pool = (epgData.programmes || []).filter(p =>
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
      .slice(0, 60);
  }, [tvChannel, epgData]);

  const nowTs = Date.now();

  return (
    <div className="w-full max-w-[1600px] mx-auto px-3 md:px-5 py-4 text-white">
      {/* Header nhỏ */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-xl bg-[#f36f21]/15 border border-[#f36f21]/20 flex items-center justify-center"><Tv className="w-4 h-4 text-[#ff9a3d]" /></span>
        <div>
          <h1 className="text-[18px] font-black tracking-tight leading-none">Truyền hình</h1>
          <p className="text-[11px] text-stone-500">{channels.length} kênh • trực tiếp, không proxy</p>
        </div>
        {tvChannel && (
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onPrevTv} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold">‹ Trước</button>
            <button onClick={onNextTv} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold">Sau ›</button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 items-start">
        {/* LEFT — PLAYER */}
        <div className="flex flex-col gap-3">
          <div className="relative rounded-[20px] overflow-hidden bg-black border border-white/10 shadow-2xl shadow-black/60" style={{ aspectRatio: '16/9' }}>
            {tvChannel && tvStreamUrl && !tvLoading ? (
              <SimpleHlsPlayer key={`${tvChannel.channel_id}-${retryKey}-${tvStreamUrl}`} streamUrl={tvStreamUrl} channel={tvChannel} onRetry={() => setRetryKey(k => k + 1)} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-[#0c0d11]">
                {tvLoading ? (
                  <>
                    <div className="w-10 h-10 border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs text-stone-500 font-bold">Đang tải {tvChannel?.name || 'kênh'}...</p>
                  </>
                ) : (
                  <>
                    <Tv className="w-12 h-12 text-stone-700" />
                    <p className="text-sm text-stone-500 font-semibold">Chọn một kênh bên phải để xem</p>
                    <p className="text-[11px] text-stone-600">Phát trực tiếp, không qua proxy</p>
                  </>
                )}
              </div>
            )}

            {/* Top overlay channel info */}
            {tvChannel && tvStreamUrl && (
              <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none">
                <div className="flex items-center gap-2.5">
                  {tvChannel.logo ? <img src={tvChannel.logo} alt="" className="w-8 h-8 rounded-lg object-contain bg-black/40 p-0.5" onError={e => e.target.style.display='none'} /> : <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-[11px] font-black">{(tvChannel.name||'?')[0]}</span>}
                  <div className="min-w-0">
                    <p className="text-[13px] font-black text-white leading-tight truncate">{tvChannel.name}</p>
                    <p className="text-[10px] text-white/60 truncate">{tvChannel.group_title} • {epgNowNext?.now ? maskScores(epgNowNext.now.title) : 'LIVE'}</p>
                  </div>
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black animate-pulse">LIVE</span>
                </div>
              </div>
            )}
          </div>

          {/* Now / Next */}
          {tvChannel && (
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black tracking-widest text-[#ff9a3d] mb-1 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#f36f21] animate-pulse"></span> ĐANG PHÁT</p>
                  <h3 className="text-[15px] font-bold leading-snug truncate">{epgNowNext?.now ? maskScores(epgNowNext.now.title) : tvChannel.name}</h3>
                  <p className="text-[11px] text-stone-400 mt-1 line-clamp-2">{epgNowNext?.now?.desc || ''}</p>
                  {epgNowNext?.now && <p className="text-[10px] text-stone-500 mt-1">{formatTimeHHMM(epgNowNext.now.start)} - {formatTimeHHMM(epgNowNext.now.stop)}</p>}
                </div>
                {epgNowNext?.next && (
                  <div className="w-[160px] shrink-0 border-l border-white/10 pl-4">
                    <p className="text-[10px] font-bold text-stone-500 tracking-widest mb-1">TIẾP THEO</p>
                    <p className="text-[12px] font-semibold text-stone-200 line-clamp-2">{maskScores(epgNowNext.next.title)}</p>
                    <p className="text-[10px] text-stone-500 mt-1">{formatTimeHHMM(epgNowNext.next.start)}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Lịch hôm nay — gọn, dễ nhìn */}
          {tvChannel && dayPrograms.length > 0 && (
            <div className="rounded-2xl bg-[#0f0f12] border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                <Clock className="w-4 h-4 text-stone-500" />
                <h4 className="text-[13px] font-bold">Lịch hôm nay</h4>
                <span className="ml-auto text-[11px] text-stone-500">{dayPrograms.length} chương trình</span>
              </div>
              <div className="max-h-[280px] overflow-y-auto divide-y divide-white/[0.04]">
                {dayPrograms.map((prog, idx) => {
                  const isPast = prog._e < nowTs;
                  const isLive = prog._s <= nowTs && prog._e >= nowTs;
                  const pct = isLive && prog._e > prog._s ? Math.min(100, Math.max(0, ((nowTs - prog._s) / (prog._e - prog._s)) * 100)) : 0;
                  return (
                    <div key={`${prog.start}-${idx}`} className={`flex gap-3 px-4 py-2.5 ${isLive ? 'bg-[#f36f21]/10' : ''} ${isPast ? 'opacity-60' : ''}`}>
                      <span className={`shrink-0 w-[62px] text-[11px] font-bold ${isLive ? 'text-[#ffb37a]' : 'text-stone-400'}`}>{formatTimeHHMM(prog.start)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`text-[12px] font-semibold line-clamp-1 ${isLive ? 'text-white' : 'text-stone-300'}`}>{maskScores(prog.title)}</span>
                          {isLive && <span className="px-1.5 py-px text-[8px] font-black rounded-full bg-[#f36f21] text-white">LIVE</span>}
                        </span>
                        {isLive && <span className="block mt-1.5 h-1 rounded-full bg-black/40 overflow-hidden"><span className="block h-full bg-[#f36f21]" style={{ width: `${pct}%` }}></span></span>}
                      </span>
                      {isPast && onPlayCatchup && (
                        <button onClick={() => onPlayCatchup(tvChannel, prog)} className="shrink-0 p-1.5 rounded-full bg-white/10 hover:bg-white/15"><Play className="w-3 h-3 fill-current" /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — CHANNEL LIST */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:h-[calc(100vh-1rem)] lg:overflow-hidden">
          {/* Search + filter */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-2.5 flex flex-col gap-2.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kênh..." className="w-full pl-9 pr-3 py-2.5 bg-black/40 border border-white/10 rounded-full text-[13px] text-white placeholder:text-stone-500 focus:outline-none focus:border-[#f36f21]/50" />
              </div>
              <button onClick={() => setShowFavOnly(v => !v)} className={`px-3 py-2 rounded-full border text-xs font-bold flex items-center gap-1 ${showFavOnly ? 'bg-[#f36f21] border-[#f36f21] text-white' : 'bg-white/5 border-white/10 text-stone-400 hover:text-white'}`}>
                <Heart className={`w-3.5 h-3.5 ${showFavOnly ? 'fill-current' : ''}`} /> {showFavOnly ? 'Yêu thích' : 'Tất cả'}
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
              {categories.slice(0, 20).map(c => (
                <button key={c} onClick={() => setCat(c)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${cat === c ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-stone-400 hover:text-white hover:border-white/20'}`}>
                  {c}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-stone-500 px-1">{filtered.length} kênh {showFavOnly ? 'yêu thích' : ''} {cat !== 'Tất Cả' ? `• ${cat}` : ''}</p>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto rounded-2xl bg-[#0f0f12] border border-white/10 divide-y divide-white/[0.05]">
            {filtered.length === 0 && (
              <div className="p-10 text-center">
                <Radio className="w-8 h-8 mx-auto text-stone-700 mb-2" />
                <p className="text-sm text-stone-500">Không tìm thấy kênh</p>
              </div>
            )}
            {filtered.map(ch => {
              const active = tvChannel && ch.channel_id === tvChannel.channel_id;
              const isFav = favSet.has(ch.channel_id);
              const epg = getEpgForChannel ? (() => { try { return getEpgForChannel(ch.channel_id); } catch { return null; } })() : null;
              return (
                <button
                  key={ch.channel_id}
                  onClick={() => onOpenTvChannel && onOpenTvChannel(ch)}
                  className={`w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-white/[0.04] transition-colors ${active ? 'bg-[#f36f21]/10' : ''}`}
                >
                  <div className="relative w-11 h-11 rounded-xl bg-black border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                    {ch.logo ? <img src={ch.logo} alt="" loading="lazy" className="w-full h-full object-contain p-1" onError={e => e.target.style.display='none'} /> : <span className="text-[11px] font-black text-white/30">{(ch.name||'?').slice(0,2)}</span>}
                    {active && <span className="absolute inset-0 bg-[#f36f21]/20 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-[#f36f21] animate-pulse"></span></span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-bold truncate ${active ? 'text-[#ffb37a]' : 'text-white'}`}>{ch.name}</p>
                    <p className="text-[11px] text-stone-500 truncate flex items-center gap-1">
                      <span className="truncate">{ch.group_title}</span>
                      {epg?.now && <><span className="w-1 h-1 rounded-full bg-stone-600"></span><span className="truncate">{maskScores(epg.now.title)}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onToggleFavorite && (
                      <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onToggleFavorite(ch.channel_id); }} className={`p-1.5 rounded-full ${isFav ? 'bg-[#f36f21]/20' : 'bg-white/5 hover:bg-white/10'}`}>
                        <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-[#f36f21] text-[#f36f21]' : 'text-stone-500'}`} />
                      </span>
                    )}
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center ${active ? 'bg-[#f36f21] text-white' : 'bg-white/10 text-white/60 group-hover:bg-white/15'}`}>
                      <Play className="w-3 h-3 fill-current ml-px" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
