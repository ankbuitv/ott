import React, { useEffect, useRef, useState, useCallback } from 'react';
import shaka from 'shaka-player';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, AlertTriangle, Radio, Clock, ArrowLeft, ChevronUp, ChevronDown, RefreshCw, List, X, Settings, Flag, Signal } from 'lucide-react';
import { formatTimeHHMM, calculateProgramProgress } from '../utils/dateUtils';
import { maskScores } from '../utils/spoiler';
import { useToast } from '../contexts/ToastContext';
import { useI18n } from '../contexts/I18nContext';
import { isHlsUrl, isProxiedStreamUrl, getRotateAtMs, refreshStreamToken, makeStreamRequestFilter, applyStreamClientHeaders } from '../services/streamGuard';
import { logPlayerError } from '../services/telemetry';
import StreamWatermark from './StreamWatermark';
import useNetworkQuality, { heightCapFor } from '../hooks/useNetworkQuality';
import { useSettings } from '../contexts/SettingsContext';
import ReportChannelModal from './ReportChannelModal';

function hexToUint8(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return arr;
}

export default function VideoPlayer({
  channel,
  streamUrl,
  epgNow,
  epgNext,
  isCatchupMode = false,
  catchupProgram = null,
  onNextChannel,
  onPrevChannel,
  onClose,
  allChannels = [],
  mini = false,
  onMinimize = null,
  onExpand = null,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const shakaRef = useRef(null);
  const { addToast } = useToast();
  const { t } = useI18n();
  const { settings } = useSettings();

  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(null);
  const [loadKey, setLoadKey] = useState(0);
  const [showList, setShowList] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [tracks, setTracks] = useState([]);
  const [selectedTrack, setSelectedTrack] = useState(-1);
  const [showReport, setShowReport] = useState(false);
  const overlayTimer = useRef(null);

  // (13) Mạng yếu / chuyển sang 4G -> cảnh báo + tự hạ bitrate
  const net = useNetworkQuality((info) => {
    addToast(`Bạn vừa chuyển sang mạng di động (${(info.effectiveType || '4g').toUpperCase()}) — app đã tự hạ chất lượng để tiết kiệm data`, 'info');
  });
  const netRef = useRef(net);
  netRef.current = net;
  const capRef = useRef(0);
  capRef.current = heightCapFor(net, settings || {});

  const channelName = channel?.name || 'TV';

  const resetOverlay = useCallback(() => {
    setShowOverlay(true);
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    overlayTimer.current = setTimeout(() => {
      setShowOverlay(false);
      setShowList(false);
      setShowQuality(false);
    }, 4000);
  }, []);

  useEffect(() => {
    resetOverlay();
    const h = () => resetOverlay();
    window.addEventListener('mousemove', h);
    window.addEventListener('touchstart', h);
    return () => {
      window.removeEventListener('mousemove', h);
      window.removeEventListener('touchstart', h);
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
    };
  }, [resetOverlay]);

  const hlsRef = useRef(null);

  // Phát qua proxy có token (streamGuard) — URL proxy không có đuôi .m3u8 nên
  // phải nhận diện riêng, và phải XOAY TOKEN trước khi hết hạn để không đứng hình.
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

    // Xoay token phát: xin URL mới rồi nạp lại nguồn (live tiếp tục ở mép sóng).
    const scheduleRotate = () => {
      // URL trực tiếp (direct) thường không cần xoay (rotate_at = 0, thoát ngay);
      // chỉ phiên XEM THỬ và URL proxy mới có rotate_at > 0.
      if (!channel) return;
      const at = getRotateAtMs(channel.channel_id);
      if (!at) return;
      const delay = Math.max(15000, at - Date.now());
      if (rotateTimer) clearTimeout(rotateTimer);
      rotateTimer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const fresh = await refreshStreamToken(channel, 0);
          if (cancelled || !fresh) return;
          if (hlsRef.current) hlsRef.current.loadSource(fresh);
          else if (shakaRef.current) await shakaRef.current.load(fresh);
          scheduleRotate();
        } catch (e) {
          // Hết 5 phút xem thử -> dừng hẳn, không thử lại
          if (e?.code === "PREVIEW_EXPIRED") {
            if (!cancelled) { setError(e.message || "Hết thời gian xem thử — nâng gói để xem tiếp."); setBuffering(false); }
            return;
          }
          // hết hạn mà xin lại lỗi -> thử lại sau 20s (mạng chập chờn)
          if (!cancelled) rotateTimer = setTimeout(scheduleRotate, 20000);
        }
      }, delay);
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
            // Buffer đậm hơn + TẮT low-latency: nguồn IPTV VN vốn dao động mạnh,
            // buffer mỏng 12s + lowLatencyMode trước đây làm đứng hình liên tục
            // ("xem lag"). Cứ lấy trước 30s, chấp nhận trễ vài giây cho mượt.
            streaming: {
              rebufferingGoal: 6,   // đã cạn buffer -> nạp đủ 6s mới phát tiếp
              bufferingGoal: 30,    // đệm trước tới 30s
              bufferBehind: 60,     // giữ lại 60s sau lượt xem (tua lại nhanh)
              lowLatencyMode: false, // LL-HLS chỉ hợp nguồn hỗ trợ, nguồn thường = rebuffer
              retryParameters: { maxAttempts: 6, baseDelay: 800, timeout: 15000 },
            },
            abr: { enabled: true, defaultBandwidthEstimate: 2000000 },
          });
          // (13) Mạng yếu / 4G / bật tiết kiệm dữ liệu -> chặn trần độ phân giải
          if (capRef.current) {
            try { player.configure({ restrictions: { maxHeight: capRef.current } }); } catch {}
          }
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
            console.error('shaka error', e.detail);
            logPlayerError({ channel, engine: 'shaka', code: `shaka_${e.detail?.code || 'err'}`, detail: e.detail?.message || '', fatal: true });
            setError(e.detail?.message || 'Không phát được');
            setBuffering(false);
          });
          await player.load(streamUrl);
          if (!cancelled) {
            scheduleRotate();
            try {
              const all = player.getVariantTracks();
              setTracks(all || []);
              const active = all.find(t => t.active);
              if (active) setSelectedTrack(active.id);
            } catch {}
            video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
            setBuffering(false);
          }
        } else {
          video.src = streamUrl;
          video.addEventListener('waiting', () => !cancelled && setBuffering(true));
          video.addEventListener('playing', () => !cancelled && setBuffering(false));
          await video.play().catch(() => setPlaying(false));
          setBuffering(false);
        }
      } catch (e) {
        if (!cancelled) {
          logPlayerError({ channel, engine: 'shaka', code: 'load_failed', detail: String(e?.message || e), fatal: true });
          setError(String(e?.message || e || 'Lỗi tải kênh'));
          setBuffering(false);
        }
      }
    };

    const load = async () => {
      try {
        if (isHls && Hls.isSupported()) {
          const cap = capRef.current; // trần chiều cao (px), 0 = không giới hạn
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false, // nguồn thường (non-LL-HLS): LL mode gây đứng hình
            backBufferLength: 60,
            // Đệm đậm hơn mặc định (18s) — nguồn VN dao động mạnh, buffer dày = mượt
            maxBufferLength: 30,
            maxMaxBufferLength: 120,
            maxBufferSize: 60 * 1000 * 1000, // trần 60MB/tầng
            liveSyncDurationCount: 3, // lệch live ~3 segment (~9-18s) cho ổn định
            abrEwmaDefaultEstimate: 800000, // khởi động mức vừa -> lên hình nhanh
            // Mạng chập chờn: thử lại nhiều hơn trước khi báo lỗi
            fragLoadingMaxRetry: 6,
            levelLoadingMaxRetry: 4,
            manifestLoadingMaxRetry: 4,
            fragLoadingMaxRetryTimeout: 8000,
            // (13) Mạng yếu/4G: chặn trần bitrate + khởi động ở mức thấp cho lên hình nhanh
            ...(cap ? { maxStarvationDelay: 6 } : {}),
            // Gắn header định danh client cho request tới proxy CHRTV
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
            if (cap) {
              try {
                const idx = hls.levels.map((l, i) => [l.height || 0, i]).filter(([h]) => h && h <= cap).map(([, i]) => i);
                if (idx.length) hls.autoLevelCapping = idx[idx.length - 1];
              } catch {}
            }
            setBuffering(false);
            scheduleRotate();
            video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
          });
          hls.on(Hls.Events.ERROR, (evt, data) => {
            if (cancelled) return;
            // Token phát hết hạn (403/401 từ proxy) -> xin token mới ngay thay vì báo lỗi
            const st = data?.response?.code || 0;
            if (proxied && (st === 401 || st === 403)) {
              refreshStreamToken(channel, 0)
                .then((fresh) => { if (!cancelled && fresh) { hls.loadSource(fresh); scheduleRotate(); } })
                .catch(() => {});
              return;
            }
            logPlayerError({
              channel,
              engine: 'hls',
              code: data?.details || data?.type || 'hls_error',
              detail: `${data?.type || ''} ${data?.reason || data?.response?.code || ''}`.trim(),
              fatal: !!data.fatal,
            });
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
              else {
                cleanup();
                loadShaka();
              }
            }
          });
          return;
        }
        await loadShaka();
      } catch {
        await loadShaka();
      }
    };

    load();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [streamUrl, loadKey, channel]);

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

  const onVolChange = useCallback((e) => {
    const v = videoRef.current;
    const val = Number(e.target.value);
    setVol(val);
    if (v) {
      v.volume = val / 100;
      if (val === 0) { v.muted = true; setMuted(true); }
      else if (v.muted) { v.muted = false; setMuted(false); }
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) { el.requestFullscreen().catch(() => {}); setFullscreen(true); }
    else { document.exitFullscreen().catch(() => {}); setFullscreen(false); }
  }, []);

  const selectTrack = useCallback((id) => {
    const p = shakaRef.current;
    if (!p) return;
    try {
      if (id === -1) p.configure({ abr: { enabled: true } });
      else {
        const tr = tracks.find(t => t.id === id);
        if (tr) p.selectVariantTrack(tr);
      }
      setSelectedTrack(id);
    } catch {}
    setShowQuality(false);
    resetOverlay();
  }, [tracks, resetOverlay]);

  const progress = epgNow ? calculateProgramProgress(epgNow.start, epgNow.stop) : 0;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden select-none">
      {mini && onExpand && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 px-3 py-2 bg-slate-900/95 border-b border-white/10">
          <span className="text-xs">📌 {channelName}</span>
          <button onClick={onExpand} className="ml-auto px-2.5 py-1 bg-[#f36f21] text-white text-[11px] font-bold rounded-lg">Mở lại</button>
        </div>
      )}

      <video ref={videoRef} className="w-full h-full object-contain" playsInline autoPlay controlsList="nodownload noplaybackrate noremoteplayback" disablePictureInPicture disableRemotePlayback onContextMenu={(e) => e.preventDefault()} />

      {/* Logo watermark của web đắp lên khung hình — cấu hình ở Admin → "Logo khi phát" */}
      <StreamWatermark
        channel={channel}
        page={mini ? 'mini' : 'player'}
        containerRef={containerRef}
        buffering={buffering}
        vod={isCatchupMode}
        catchup={isCatchupMode}
      />

      {buffering && !error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60">
          <div className="w-10 h-10 border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
          <span className="mt-2 text-[11px] text-white/60 font-bold tracking-widest">ĐANG TẢI</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-6 text-center">
          <div className="max-w-sm w-full">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#f36f21]/15 border border-[#f36f21]/30 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-[#ff9a3d]" />
            </div>
            <h3 className="text-white font-black text-[15px] mb-1">{channelName}</h3>
            <p className="text-stone-400 text-xs mb-4 line-clamp-3">{String(error).slice(0, 180)}</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => { setError(null); setLoadKey(k => k + 1); }} className="px-4 py-2 rounded-full bg-[#f36f21] text-white text-xs font-bold flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại
              </button>
              <button onClick={() => setShowReport(true)} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5">
                <Flag className="w-3.5 h-3.5" /> Báo kênh lỗi
              </button>
              {onClose && <button onClick={onClose} className="px-4 py-2 rounded-full bg-white/10 text-white text-xs font-bold">Đóng</button>}
            </div>
          </div>
        </div>
      )}

      {/* Overlay */}
      <div className={`absolute inset-0 z-20 transition-opacity duration-300 pointer-events-none ${showOverlay ? 'opacity-100' : 'opacity-0'}`}>
        {/* Top */}
        <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex items-center gap-2 pointer-events-auto">
          {onClose && <button onClick={onClose} className="p-2 rounded-full bg-black/50 hover:bg-white/15 text-white"><ArrowLeft className="w-5 h-5" /></button>}
          {channel?.logo && <img src={channel.logo} alt="" className="w-8 h-8 rounded-lg object-contain bg-black/40 p-0.5" onError={e => e.target.style.display='none'} />}
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold text-white leading-tight truncate">{channelName}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>LIVE</span>
              {channel?.group_title && <span className="text-[10px] text-white/60 truncate">{channel.group_title}</span>}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {(net.cellular || net.slow) && (
              <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                <Signal className="w-3 h-3" />{net.cellular ? 'Đang dùng 4G' : 'Mạng yếu'}
              </span>
            )}
            <button onClick={() => { setShowReport(true); resetOverlay(); }} title="Báo kênh lỗi" className="p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-white/15"><Flag className="w-4 h-4" /></button>
            <button onClick={() => { setShowQuality(v => !v); resetOverlay(); }} className={`p-2 rounded-full ${showQuality ? 'bg-[#f36f21] text-white' : 'bg-black/50 text-white/70 hover:text-white'}`}><Settings className="w-4 h-4" /></button>
            <button onClick={() => { setShowList(v => !v); resetOverlay(); }} className={`p-2 rounded-full ${showList ? 'bg-[#f36f21] text-white' : 'bg-black/50 text-white/70 hover:text-white'}`}><List className="w-4 h-4" /></button>
            {onMinimize && !mini && <button onClick={onMinimize} className="p-2 rounded-full bg-black/50 text-white/70 hover:text-white text-[10px] font-bold">Thu nhỏ</button>}
          </div>
        </div>

        {/* Channel list side */}
        {showList && (
          <div className="absolute top-14 right-3 bottom-20 w-[300px] bg-black/90 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col overflow-hidden pointer-events-auto">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-xs font-bold text-white/70">Danh sách kênh</span>
              <button onClick={() => setShowList(false)} className="p-1 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-white/60" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allChannels.slice(0, 120).map(ch => (
                <button key={ch.channel_id} onClick={() => { window.__chrtv_select_channel && window.__chrtv_select_channel(ch); setShowList(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 text-left ${channel?.channel_id === ch.channel_id ? 'bg-[#f36f21]/15' : ''}`}>
                  <img src={ch.logo || ''} alt="" className="w-8 h-8 rounded-lg object-contain bg-black/40 p-0.5" onError={e => e.target.style.display='none'} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-white truncate">{ch.name}</p>
                    <p className="text-[10px] text-white/40 truncate">{ch.group_title}</p>
                  </div>
                  {channel?.channel_id === ch.channel_id && <Radio className="w-3 h-3 text-[#f36f21] animate-pulse" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quality */}
        {showQuality && (
          <div className="absolute top-14 right-3 w-[220px] bg-black/90 backdrop-blur-md rounded-2xl border border-white/10 p-2 pointer-events-auto">
            <p className="text-[11px] font-bold text-white/60 px-2 py-1">Chất lượng</p>
            <button onClick={() => selectTrack(-1)} className={`w-full text-left px-3 py-2 rounded-xl text-xs ${selectedTrack === -1 ? 'bg-[#f36f21] text-white font-bold' : 'text-white/70 hover:bg-white/10'}`}>Tự động</button>
            {tracks.map(tr => (
              <button key={tr.id} onClick={() => selectTrack(tr.id)} className={`w-full text-left px-3 py-2 rounded-xl text-xs ${selectedTrack === tr.id ? 'bg-[#f36f21] text-white font-bold' : 'text-white/70 hover:bg-white/10'}`}>
                {tr.height ? `${tr.height}p` : `Track ${tr.id}`} • {Math.round((tr.bandwidth||0)/1000)}k
              </button>
            ))}
          </div>
        )}

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-auto">
          {/* EPG */}
          <div className="mb-3 bg-black/60 backdrop-blur-sm rounded-xl p-3 border border-white/10">
            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black tracking-widest text-[#ff9a3d] flex items-center gap-1"><Clock className="w-3 h-3" /> {isCatchupMode ? 'XEM LẠI' : 'ĐANG PHÁT'}</p>
                <p className="text-[13px] font-bold text-white truncate mt-1">{isCatchupMode && catchupProgram ? maskScores(catchupProgram.title) : (epgNow ? maskScores(epgNow.title) : channelName)}</p>
                <p className="text-[11px] text-white/50 truncate">{epgNow ? `${formatTimeHHMM(epgNow.start)} - ${formatTimeHHMM(epgNow.stop)}` : ''}</p>
                {progress > 0 && <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-[#f36f21]" style={{ width: `${progress}%` }}></div></div>}
              </div>
              {epgNext && !isCatchupMode && (
                <div className="w-[160px] border-l border-white/10 pl-3">
                  <p className="text-[10px] text-white/40 font-bold tracking-widest">TIẾP THEO</p>
                  <p className="text-xs font-semibold text-white/80 line-clamp-2 mt-1">{maskScores(epgNext.title)}</p>
                  <p className="text-[10px] text-white/40 mt-1">{formatTimeHHMM(epgNext.start)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="p-2.5 rounded-full bg-[#f36f21] text-white hover:brightness-110">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>
            <button onClick={toggleMute} className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white">
              {muted || vol === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input type="range" min={0} max={100} value={muted ? 0 : vol} onChange={onVolChange} className="w-24 accent-[#f36f21]" />
            <div className="flex items-center gap-1 ml-2">
              {onPrevChannel && <button onClick={onPrevChannel} className="p-2 rounded-full bg-white/10 hover:bg-white/15 text-white"><ChevronUp className="w-4 h-4" /></button>}
              {onNextChannel && <button onClick={onNextChannel} className="p-2 rounded-full bg-white/10 hover:bg-white/15 text-white"><ChevronDown className="w-4 h-4" /></button>}
            </div>
            <div className="ml-auto">
              <button onClick={toggleFullscreen} className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white">
                {fullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showReport && (
        <ReportChannelModal
          channel={channel}
          defaultCode={error ? 'no_play' : 'buffering'}
          onClose={() => setShowReport(false)}
          addToast={addToast}
        />
      )}
    </div>
  );
}
