import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import shaka from 'shaka-player';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Search, Heart, Radio, Clock, AlertTriangle, RefreshCw, Tv, ChevronDown, ChevronUp, LayoutGrid, List, MonitorPlay, Film, Trophy, Boxes, Globe, Star, Filter, X, Zap } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { parseEpgDate, formatTimeHHMM } from '../utils/dateUtils';
import { maskScores } from '../utils/spoiler';
import { isHlsUrl, isProxiedStreamUrl, getRotateAtMs, refreshStreamToken, makeStreamRequestFilter, applyStreamClientHeaders } from '../services/streamGuard';

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
    const proxied = isProxiedStreamUrl(streamUrl);
    const isHls = isHlsUrl(streamUrl) || proxied;
    let rotateTimer = null;
    const cleanup = () => {
      if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
      try { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } } catch {}
      try { if (shakaRef.current) { shakaRef.current.destroy(); shakaRef.current = null; } } catch {}
    };
    // Xoay token phát trước khi hết hạn (URL proxy TTL ngắn)
    const scheduleRotate = () => {
      if (!proxied || !channel) return;
      const at = getRotateAtMs(channel.channel_id);
      if (!at) return;
      if (rotateTimer) clearTimeout(rotateTimer);
      rotateTimer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const fresh = await refreshStreamToken(channel, 0);
          if (cancelled || !fresh) return;
          if (hlsRef.current) hlsRef.current.loadSource(fresh);
          else if (shakaRef.current) await shakaRef.current.load(fresh);
          scheduleRotate();
        } catch { if (!cancelled) rotateTimer = setTimeout(scheduleRotate, 20000); }
      }, Math.max(15000, at - Date.now()));
    };
    const loadShaka = async () => {
      try {
        shaka.polyfill.installAll();
        if (shaka.Player.isBrowserSupported()) {
          const player = new shaka.Player(video);
          shakaRef.current = player;
          try {
            const filter = makeStreamRequestFilter(channel);
            if (filter) player.getNetworkingEngine()?.registerRequestFilter(filter);
          } catch {}
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
            setError(msg); setBuffering(false); onError && onError(msg);
          });
          await player.load(streamUrl);
          if (!cancelled) {
            scheduleRotate();
            try { await video.play(); setPlaying(true); } catch { setPlaying(false); }
            setBuffering(false);
          }
        } else {
          video.src = streamUrl;
          video.addEventListener('waiting', () => !cancelled && setBuffering(true));
          video.addEventListener('playing', () => !cancelled && setBuffering(false));
          try { await video.play(); setPlaying(true); } catch { setPlaying(false); }
          setBuffering(false);
        }
      } catch (err) {
        if (!cancelled) {
          const m = String(err?.message || err || 'Lỗi tải luồng');
          setError(m); setBuffering(false); onError && onError(m);
        }
      }
    };
    const init = async () => {
      try {
        if (isHls && Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30,
            xhrSetup: (xhr, url) => {
              if (!isProxiedStreamUrl(url)) return;
              const h = applyStreamClientHeaders({}, channel);
              Object.entries(h).forEach(([k, v]) => { try { xhr.setRequestHeader(k, v); } catch {} });
            },
          });
          hlsRef.current = hls;
          hls.attachMedia(video);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => { if (!cancelled) hls.loadSource(streamUrl); });
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            setBuffering(false);
            scheduleRotate();
            video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
          });
          hls.on(Hls.Events.ERROR, (evt, data) => {
            if (cancelled) return;
            const st = data?.response?.code || 0;
            if (proxied && (st === 401 || st === 403)) {
              refreshStreamToken(channel, 0)
                .then((fresh) => { if (!cancelled && fresh) { hls.loadSource(fresh); scheduleRotate(); } })
                .catch(() => {});
              return;
            }
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
              else { cleanup(); loadShaka(); }
            }
          });
          return;
        }
        await loadShaka();
      } catch { await loadShaka(); }
    };
    init();
    return () => { cancelled = true; cleanup(); };
  }, [streamUrl, channel]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) { v.play().then(() => setPlaying(true)).catch(() => {}); }
    else { v.pause(); setPlaying(false); }
  }, []);
  const toggleMute = useCallback(() => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
  }, []);
  const changeVol = useCallback((e) => {
    const v = videoRef.current; const val = Number(e.target.value);
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
    <div className="relative w-full h-full bg-black group/video">
      <video ref={videoRef} className="w-full h-full object-contain" playsInline autoPlay controls={false} />
      {buffering && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
          <div className="w-12 h-12 border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
          <span className="mt-3 text-[11px] text-white/60 font-bold tracking-widest">ĐANG TẢI...</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/85 p-6 text-center">
          <div className="max-w-sm">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#f36f21]/15 border border-[#f36f21]/30 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-[#ff9a3d]" />
            </div>
            <h3 className="text-white font-black text-[15px] mb-1">Không xem được</h3>
            <p className="text-stone-400 text-xs mb-1">{channel?.name}</p>
            <p className="text-stone-500 text-[11px] mb-4 line-clamp-3">{String(error).slice(0, 160)}</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => { setError(null); onRetry && onRetry(); }} className="px-4 py-2 rounded-full bg-[#f36f21] text-white text-xs font-bold flex items-center gap-1.5 hover:brightness-110"><RefreshCw className="w-3.5 h-3.5" /> Thử lại</button>
              <a href={streamUrl} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-full bg-white/10 text-white text-xs font-bold hover:bg-white/15">Mở link gốc</a>
            </div>
          </div>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover/video:opacity-100 transition-opacity flex items-center gap-2">
        <button onClick={togglePlay} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur">{playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}</button>
        <button onClick={toggleMute} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur">{muted || vol === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button>
        <input type="range" min={0} max={100} value={muted ? 0 : vol} onChange={changeVol} className="w-24 accent-[#f36f21]" />
        <div className="ml-auto flex items-center gap-2">
          <button onClick={goFullscreen} className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur"><Maximize className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

// Icon theo nhóm
function GroupIcon({ name, size = 14 }) {
  const n = String(name || '').toLowerCase();
  if (n.includes('vtv') || n.includes('truyền hình việt') || n.includes('th -')) return <Tv className="shrink-0" style={{ width: size, height: size }} />;
  if (n.includes('box') || n.includes('giải trí')) return <Boxes className="shrink-0" style={{ width: size, height: size }} />;
  if (n.includes('sport') || n.includes('thể thao') || n.includes('bóng')) return <Trophy className="shrink-0" style={{ width: size, height: size }} />;
  if (n.includes('phim') || n.includes('movie') || n.includes('film') || n.includes('cinema') || n.includes('hbo') || n.includes('axn')) return <Film className="shrink-0" style={{ width: size, height: size }} />;
  if (n.includes('thiếu nhi') || n.includes('cartoon') || n.includes('kids')) return <Star className="shrink-0" style={{ width: size, height: size }} />;
  if (n.includes('quốc tế') || n.includes('international')) return <Globe className="shrink-0" style={{ width: size, height: size }} />;
  return <MonitorPlay className="shrink-0" style={{ width: size, height: size }} />;
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
  const [selectedGroup, setSelectedGroup] = useState('Tất Cả');
  const [showFavOnly, setShowFavOnly] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [theater, setTheater] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [viewMode, setViewMode] = useState('list'); // list | grid
  const groupRefs = useRef({});
  const favSet = useMemo(() => new Set(favorites || []), [favorites]);

  // Nhóm theo group_title (tvg)
  const groups = useMemo(() => {
    const map = new Map();
    channels.forEach(c => {
      const g = (c.group_title || 'Khác').trim() || 'Khác';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(c);
    });
    // Sắp xếp nhóm theo thứ tự ưu tiên + số lượng
    const order = ['VTV', 'TH -', 'BOX', 'SPORT', 'Phim', 'Giải trí', 'Thiếu nhi', 'Quốc tế'];
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      const ai = order.findIndex(o => a[0].toLowerCase().includes(o.toLowerCase()));
      const bi = order.findIndex(o => b[0].toLowerCase().includes(o.toLowerCase()));
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return b[1].length - a[1].length || a[0].localeCompare(b[0]);
    });
    return entries; // [ [groupName, channels[]], ... ]
  }, [channels]);

  const allGroupNames = useMemo(() => ['Tất Cả', ...groups.map(([g]) => g)], [groups]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.map(([gName, list]) => {
      let l = list;
      if (showFavOnly) l = l.filter(c => favSet.has(c.channel_id));
      if (q) l = l.filter(c => (c.name || '').toLowerCase().includes(q) || (c.group_title || '').toLowerCase().includes(q));
      if (selectedGroup !== 'Tất Cả' && gName !== selectedGroup) l = [];
      return [gName, l];
    }).filter(([, l]) => l.length > 0);
  }, [groups, query, showFavOnly, favSet, selectedGroup]);

  const totalFiltered = useMemo(() => filteredGroups.reduce((s, [, l]) => s + l.length, 0), [filteredGroups]);

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
      .slice(0, 80);
  }, [tvChannel, epgData]);

  const nowTs = Date.now();

  const toggleCollapse = (g) => {
    setCollapsed(prev => {
      const ns = new Set(prev);
      if (ns.has(g)) ns.delete(g); else ns.add(g);
      return ns;
    });
  };

  const scrollToGroup = (g) => {
    setSelectedGroup(g);
    if (g === 'Tất Cả') return;
    setTimeout(() => {
      const el = groupRefs.current[g];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  return (
    <div className={`w-full mx-auto text-white ${theater ? 'max-w-[1920px] px-2 md:px-4' : 'max-w-[1760px] px-3 md:px-6'} py-4`}>
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#f36f21] to-[#ff9a3d] flex items-center justify-center shadow-lg shadow-[#f36f21]/20"><Tv className="w-5 h-5 text-white" /></span>
        <div className="min-w-0">
          <h1 className="text-[20px] md:text-[26px] font-black tracking-tight leading-none flex items-center gap-2">
            Truyền hình
            <span className="px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-[11px] font-bold tracking-widest text-stone-300">{channels.length} KÊNH • {groups.length} NHÓM</span>
          </h1>
          <p className="text-[11px] md:text-xs text-stone-500 mt-1 flex items-center gap-1.5"><Zap className="w-3 h-3 text-[#ff9a3d]" /> Trực tiếp • Không proxy • Chia nhóm theo TVG • Player to hơn</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {tvChannel && (
            <>
              <button onClick={onPrevTv} className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold border border-white/10">‹ Trước</button>
              <button onClick={onNextTv} className="px-3.5 py-2 rounded-full bg-white/10 hover:bg-white/15 text-xs font-bold border border-white/10">Sau ›</button>
            </>
          )}
          <button onClick={() => setTheater(v => !v)} className={`px-3.5 py-2 rounded-full text-xs font-bold border flex items-center gap-1.5 ${theater ? 'bg-[#f36f21] border-[#f36f21] text-white' : 'bg-white/10 border-white/10 text-stone-300 hover:text-white'}`}>
            <MonitorPlay className="w-4 h-4" /> {theater ? 'Thu gọn' : 'Rạp hát'}
          </button>
        </div>
      </div>

      <div className={`grid gap-4 items-start ${theater ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-[1.55fr_460px]'}`}>
        {/* LEFT — PLAYER BIGGER */}
        <div className="flex flex-col gap-4 min-w-0">
          <div className={`relative rounded-[24px] overflow-hidden bg-black border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,.7)] ${theater ? 'aspect-video md:aspect-[21/9]' : 'aspect-video'}`}>
            {tvChannel && tvStreamUrl && !tvLoading ? (
              <SimpleHlsPlayer key={`${tvChannel.channel_id}-${retryKey}-${tvStreamUrl}`} streamUrl={tvStreamUrl} channel={tvChannel} onRetry={() => setRetryKey(k => k + 1)} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-[#0f0f12] to-black">
                {tvLoading ? (
                  <>
                    <div className="w-12 h-12 border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-sm text-stone-400 font-bold">Đang tải {tvChannel?.name || 'kênh'}...</p>
                  </>
                ) : (
                  <>
                    <div className="w-20 h-20 rounded-[20px] bg-white/[0.04] border border-white/10 flex items-center justify-center"><Tv className="w-10 h-10 text-stone-600" /></div>
                    <div className="text-center">
                      <p className="text-base font-black text-white">Chọn một kênh để xem</p>
                      <p className="text-xs text-stone-500 mt-1">Player to, nét, hỗ trợ HLS + DRM ClearKey</p>
                      <div className="mt-3 flex flex-wrap gap-1.5 justify-center max-w-md">
                        {groups.slice(0, 6).map(([g]) => (
                          <span key={g} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold text-stone-400 flex items-center gap-1"><GroupIcon name={g} size={10} />{g}</span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {tvChannel && tvStreamUrl && (
              <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none">
                <div className="flex items-center gap-3">
                  {tvChannel.logo ? <img src={tvChannel.logo} alt="" className="w-11 h-11 rounded-xl object-contain bg-black/60 p-1 border border-white/10" onError={e => e.target.style.display='none'} /> : <span className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center text-sm font-black">{(tvChannel.name||'?')[0]}</span>}
                  <div className="min-w-0">
                    <p className="text-[15px] md:text-[17px] font-black text-white leading-tight truncate flex items-center gap-2">{tvChannel.name} {favSet.has(tvChannel.channel_id) && <Heart className="w-4 h-4 fill-[#f36f21] text-[#f36f21]" />}</p>
                    <p className="text-[11px] text-white/70 truncate flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-[9px] font-bold">{tvChannel.group_title}</span> • {epgNowNext?.now ? maskScores(epgNowNext.now.title) : 'LIVE'}</p>
                  </div>
                  <span className="ml-auto px-2.5 py-1 rounded-full bg-red-600 text-white text-[10px] font-black tracking-widest animate-pulse shadow-lg shadow-red-600/20">LIVE</span>
                </div>
              </div>
            )}
          </div>

          {tvChannel && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4 backdrop-blur">
                <p className="text-[10px] font-black tracking-widest text-[#ff9a3d] mb-1 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#f36f21] animate-pulse"></span> ĐANG PHÁT</p>
                <h3 className="text-[16px] font-bold leading-snug line-clamp-2">{epgNowNext?.now ? maskScores(epgNowNext.now.title) : tvChannel.name}</h3>
                <p className="text-[12px] text-stone-400 mt-1.5 line-clamp-3 leading-relaxed">{epgNowNext?.now?.desc || 'Đang phát trực tiếp'}</p>
                {epgNowNext?.now && <p className="text-[11px] text-stone-500 mt-2 flex items-center gap-1"><Clock className="w-3 h-3" />{formatTimeHHMM(epgNowNext.now.start)} - {formatTimeHHMM(epgNowNext.now.stop)}</p>}
              </div>
              <div className="rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4 backdrop-blur">
                {epgNowNext?.next ? (
                  <>
                    <p className="text-[10px] font-black tracking-widest text-stone-500 mb-1">TIẾP THEO</p>
                    <h3 className="text-[15px] font-bold text-stone-200 line-clamp-2">{maskScores(epgNowNext.next.title)}</h3>
                    <p className="text-[11px] text-stone-500 mt-2">{formatTimeHHMM(epgNowNext.next.start)} - {formatTimeHHMM(epgNowNext.next.stop)}</p>
                    <p className="text-[11px] text-stone-500 mt-1 line-clamp-2">{epgNowNext.next.desc || ''}</p>
                  </>
                ) : (
                  <div className="h-full flex flex-col justify-center">
                    <p className="text-[11px] font-bold text-stone-500">KÊNH</p>
                    <p className="text-sm font-bold mt-1">{tvChannel.name}</p>
                    <p className="text-xs text-stone-500 mt-1">{tvChannel.group_title} • {channels.filter(c => c.group_title === tvChannel.group_title).length} kênh cùng nhóm</p>
                    <div className="mt-3 flex gap-2">
                      {onToggleFavorite && <button onClick={() => onToggleFavorite(tvChannel.channel_id)} className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 border ${favSet.has(tvChannel.channel_id) ? 'bg-[#f36f21]/20 border-[#f36f21]/30 text-[#ffb37a]' : 'bg-white/5 border-white/10 text-stone-300'}`}><Heart className={`w-3.5 h-3.5 ${favSet.has(tvChannel.channel_id) ? 'fill-current' : ''}`} />{favSet.has(tvChannel.channel_id) ? 'Đã thích' : 'Yêu thích'}</button>}
                      {onCloseTv && <button onClick={onCloseTv} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-stone-400 hover:text-white"><X className="w-3.5 h-3.5 inline mr-1" />Đóng</button>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tvChannel && dayPrograms.length > 0 && (
            <div className="rounded-2xl bg-[#0f0f12] border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2 sticky top-0 bg-[#0f0f12] z-10">
                <Clock className="w-4 h-4 text-stone-500" />
                <h4 className="text-[13px] font-bold">Lịch hôm nay — {tvChannel.name}</h4>
                <span className="ml-auto text-[11px] text-stone-500">{dayPrograms.length} chương trình</span>
              </div>
              <div className="max-h-[380px] overflow-y-auto divide-y divide-white/[0.04]">
                {dayPrograms.map((prog, idx) => {
                  const isPast = prog._e < nowTs;
                  const isLive = prog._s <= nowTs && prog._e >= nowTs;
                  const pct = isLive && prog._e > prog._s ? Math.min(100, Math.max(0, ((nowTs - prog._s) / (prog._e - prog._s)) * 100)) : 0;
                  return (
                    <div key={`${prog.start}-${idx}`} className={`flex gap-3 px-4 py-3 ${isLive ? 'bg-[#f36f21]/10' : ''} ${isPast ? 'opacity-70' : ''}`}>
                      <span className={`shrink-0 w-[64px] text-[12px] font-bold ${isLive ? 'text-[#ffb37a]' : 'text-stone-400'}`}>{formatTimeHHMM(prog.start)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={`text-[13px] font-semibold line-clamp-1 ${isLive ? 'text-white' : 'text-stone-300'}`}>{maskScores(prog.title)}</span>
                          {isLive && <span className="px-1.5 py-0.5 text-[8px] font-black rounded-full bg-[#f36f21] text-white">LIVE</span>}
                        </span>
                        {isLive && <span className="block mt-2 h-1 rounded-full bg-black/50 overflow-hidden"><span className="block h-full bg-[#f36f21]" style={{ width: `${pct}%` }}></span></span>}
                        {prog.desc && <span className="block text-[11px] text-stone-500 line-clamp-1 mt-1">{prog.desc}</span>}
                      </span>
                      {isPast && onPlayCatchup && (
                        <button onClick={() => onPlayCatchup(tvChannel, prog)} className="shrink-0 p-2 rounded-full bg-white/10 hover:bg-white/15"><Play className="w-3.5 h-3.5 fill-current" /></button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — GROUPED CHANNEL LIST */}
        <div className={`flex flex-col gap-3 ${theater ? 'xl:grid xl:grid-cols-2 xl:gap-4' : 'lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)] lg:overflow-hidden'}`}>
          <div className="rounded-[20px] bg-white/[0.04] border border-white/10 p-3 flex flex-col gap-3 backdrop-blur">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm kênh, nhóm..." className="w-full pl-10 pr-9 py-3 bg-black/50 border border-white/10 rounded-full text-[13px] text-white placeholder:text-stone-500 focus:outline-none focus:border-[#f36f21]/50" />
                {query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/10 hover:bg-white/15"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <button onClick={() => setShowFavOnly(v => !v)} className={`px-4 py-3 rounded-full border text-xs font-bold flex items-center gap-1.5 transition ${showFavOnly ? 'bg-[#f36f21] border-[#f36f21] text-white shadow-lg shadow-[#f36f21]/20' : 'bg-white/5 border-white/10 text-stone-400 hover:text-white hover:bg-white/10'}`}>
                <Heart className={`w-4 h-4 ${showFavOnly ? 'fill-current' : ''}`} /> {showFavOnly ? 'Yêu thích' : 'Tất cả'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none flex-1 pb-1">
                {allGroupNames.slice(0, 30).map(g => (
                  <button key={g} onClick={() => scrollToGroup(g)} className={`shrink-0 px-3.5 py-2 rounded-full text-[11px] font-bold border transition-all flex items-center gap-1.5 ${selectedGroup === g ? 'bg-white text-black border-white shadow' : 'bg-white/5 border-white/10 text-stone-400 hover:text-white hover:border-white/20'}`}>
                    {g !== 'Tất Cả' && <GroupIcon name={g} size={12} />}{g}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 ml-1 shrink-0">
                <button onClick={() => setViewMode('list')} className={`p-2 rounded-full border ${viewMode === 'list' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-stone-500'}`}><List className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('grid')} className={`p-2 rounded-full border ${viewMode === 'grid' ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 text-stone-500'}`}><LayoutGrid className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex items-center justify-between px-1">
              <p className="text-[11px] text-stone-500 flex items-center gap-1.5"><Filter className="w-3 h-3" />{totalFiltered} kênh {showFavOnly ? 'yêu thích' : ''} {selectedGroup !== 'Tất Cả' ? `• ${selectedGroup}` : `• ${filteredGroups.length} nhóm`}</p>
              {(query || selectedGroup !== 'Tất Cả' || showFavOnly) && (
                <button onClick={() => { setQuery(''); setSelectedGroup('Tất Cả'); setShowFavOnly(false); }} className="text-[11px] font-bold text-[#ff9a3d] hover:text-white">Xóa lọc</button>
              )}
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto rounded-[20px] bg-[#0f0f12] border border-white/10 ${theater ? 'max-h-[70vh]' : ''}`}>
            {filteredGroups.length === 0 && (
              <div className="p-12 text-center">
                <Radio className="w-10 h-10 mx-auto text-stone-700 mb-3" />
                <p className="text-sm text-stone-500 font-bold">Không tìm thấy kênh</p>
                <p className="text-xs text-stone-600 mt-1">Thử đổi từ khóa hoặc nhóm</p>
              </div>
            )}
            {filteredGroups.map(([gName, list]) => {
              const isCollapsed = collapsed.has(gName);
              const isActiveGroup = tvChannel && list.some(c => c.channel_id === tvChannel.channel_id);
              return (
                <div key={gName} ref={el => groupRefs.current[gName] = el} className="border-b border-white/[0.06] last:border-0">
                  <button onClick={() => toggleCollapse(gName)} className={`w-full flex items-center gap-2.5 px-4 py-3 text-left sticky top-0 z-10 backdrop-blur bg-[#0f0f12]/90 hover:bg-white/[0.03] transition ${isActiveGroup ? 'bg-[#f36f21]/10' : ''}`}>
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center border ${isActiveGroup ? 'bg-[#f36f21]/20 border-[#f36f21]/30 text-[#ffb37a]' : 'bg-white/5 border-white/10 text-stone-400'}`}><GroupIcon name={gName} size={14} /></span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[13px] font-black truncate flex items-center gap-2 ${isActiveGroup ? 'text-[#ffb37a]' : 'text-white'}`}>{gName} <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-[10px] font-bold text-stone-400">{list.length}</span>{isActiveGroup && <span className="w-1.5 h-1.5 rounded-full bg-[#f36f21] animate-pulse"></span>}</p>
                      <p className="text-[10px] text-stone-500 truncate">{list.slice(0,3).map(c=>c.name).join(' • ')}</p>
                    </div>
                    <span className="p-1.5 rounded-full bg-white/5 border border-white/10">{isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}</span>
                  </button>
                  {!isCollapsed && (
                    <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-2 p-3' : 'divide-y divide-white/[0.04]'}>
                      {list.map(ch => {
                        const active = tvChannel && ch.channel_id === tvChannel.channel_id;
                        const isFav = favSet.has(ch.channel_id);
                        const epg = getEpgForChannel ? (() => { try { return getEpgForChannel(ch.channel_id); } catch { return null; } })() : null;
                        if (viewMode === 'grid') {
                          return (
                            <button key={ch.channel_id} onClick={() => onOpenTvChannel && onOpenTvChannel(ch)} className={`group relative flex flex-col gap-2 p-3 rounded-2xl border text-left transition-all hover:scale-[1.01] ${active ? 'bg-[#f36f21]/15 border-[#f36f21]/30 shadow-lg shadow-[#f36f21]/10' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-white/15'}`}>
                              <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-xl bg-black border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                  {ch.logo ? <img src={ch.logo} alt="" loading="lazy" className="w-full h-full object-contain p-1" onError={e => e.target.style.display='none'} /> : <span className="text-[10px] font-black text-white/30">{(ch.name||'?').slice(0,2)}</span>}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-[12px] font-bold truncate ${active ? 'text-[#ffb37a]' : 'text-white'}`}>{ch.name}</p>
                                  <p className="text-[10px] text-stone-500 truncate">{epg?.now ? maskScores(epg.now.title) : ch.group_title}</p>
                                </div>
                                {active && <span className="w-2 h-2 rounded-full bg-[#f36f21] animate-pulse shrink-0"></span>}
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-black/40 border border-white/10 text-stone-400">{ch.group_title.slice(0,14)}</span>
                                <span className={`w-6 h-6 rounded-full flex items-center justify-center ${active ? 'bg-[#f36f21] text-white' : 'bg-white/10 text-white/50 group-hover:bg-white/15'}`}><Play className="w-3 h-3 fill-current ml-px" /></span>
                              </div>
                            </button>
                          );
                        }
                        return (
                          <button key={ch.channel_id} onClick={() => onOpenTvChannel && onOpenTvChannel(ch)} className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] transition-colors ${active ? 'bg-[#f36f21]/10' : ''}`}>
                            <div className="relative w-11 h-11 rounded-xl bg-black border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                              {ch.logo ? <img src={ch.logo} alt="" loading="lazy" className="w-full h-full object-contain p-1" onError={e => e.target.style.display='none'} /> : <span className="text-[11px] font-black text-white/30">{(ch.name||'?').slice(0,2)}</span>}
                              {active && <span className="absolute inset-0 bg-[#f36f21]/20 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-[#f36f21] animate-pulse"></span></span>}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-[13px] font-bold truncate flex items-center gap-1.5 ${active ? 'text-[#ffb37a]' : 'text-white'}`}>{ch.name} {isFav && <Heart className="w-3 h-3 fill-[#f36f21] text-[#f36f21] shrink-0" />}</p>
                              <p className="text-[11px] text-stone-500 truncate flex items-center gap-1">
                                <span className="truncate max-w-[90px]">{ch.group_title}</span>
                                {epg?.now && <><span className="w-1 h-1 rounded-full bg-stone-600 shrink-0"></span><span className="truncate">{maskScores(epg.now.title)}</span></>}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {onToggleFavorite && (
                                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onToggleFavorite(ch.channel_id); }} className={`p-2 rounded-full transition ${isFav ? 'bg-[#f36f21]/20 hover:bg-[#f36f21]/30' : 'bg-white/5 hover:bg-white/10'}`}>
                                  <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-[#f36f21] text-[#f36f21]' : 'text-stone-500'}`} />
                                </span>
                              )}
                              <span className={`w-8 h-8 rounded-full flex items-center justify-center transition ${active ? 'bg-[#f36f21] text-white shadow' : 'bg-white/10 text-white/60 group-hover:bg-white/15'}`}><Play className="w-3.5 h-3.5 fill-current ml-px" /></span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
