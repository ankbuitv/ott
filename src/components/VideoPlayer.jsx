import React, { useEffect, useRef, useState, useCallback } from 'react';
import shaka from 'shaka-player';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, AlertTriangle, Radio, Clock, ArrowLeft, ChevronUp, ChevronDown, RefreshCw, List, X, Settings, Flag, Signal, ZoomIn, Monitor, Languages, Captions, Hd } from 'lucide-react';
import { formatTimeHHMM, calculateProgramProgress } from '../utils/dateUtils';
import { maskScores } from '../utils/spoiler';
import { useToast } from '../contexts/ToastContext';
import { useI18n } from '../contexts/I18nContext';
import { isHlsUrl, isProxiedStreamUrl, getRotateAtMs, getCatchupAt, refreshStreamToken, makeStreamRequestFilter, applyStreamClientHeaders, fallbackToDirectUrl, isDashChannel } from '../services/streamGuard';
import { logPlayerError, isCriticalShakaError } from '../services/telemetry';
import StreamWatermark from './StreamWatermark';
import useNetworkQuality, { heightCapFor } from '../hooks/useNetworkQuality';
import { useSettings } from '../contexts/SettingsContext';
import useVideoZoom from '../hooks/useVideoZoom';
import ReportChannelModal from './ReportChannelModal';

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
  const zoom = useVideoZoom();

  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(100);
  const [fullscreen, setFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [buffering, setBuffering] = useState(true);
  const [error, setError] = useState(null);
  const [loadKey, setLoadKey] = useState(0);
  const [showList, setShowList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('quality'); // quality | audio | subtitle | size
  const [showReport, setShowReport] = useState(false);
  const overlayTimer = useRef(null);

  // Quality / Audio / Subtitle states
  const [tracks, setTracks] = useState([]); // shaka variant tracks (quality)
  const [selectedTrack, setSelectedTrack] = useState(-1);
  const [hlsLevels, setHlsLevels] = useState([]); // hls.js levels
  const [hlsLevel, setHlsLevel] = useState(-1); // -1 = auto
  const [audioTracks, setAudioTracks] = useState([]); // unified: {id, label, lang, name, active}
  const [selectedAudio, setSelectedAudio] = useState(-1);
  const [textTracks, setTextTracks] = useState([]); // {id, label, lang, kind, active}
  const [selectedText, setSelectedText] = useState(-1); // -1 = off

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
      setShowSettings(false);
    }, 5000);
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;
    let cancelled = false;
    setError(null);
    setBuffering(true);

    const proxied = isProxiedStreamUrl(streamUrl);
    const isHls = isHlsUrl(streamUrl) || proxied;
    const dash = isDashChannel(channel, streamUrl);
    let rotateTimer = null;
    let directTried = false;
    const tryDirectFallback = async (hlsOrNull) => {
      if (directTried || !proxied || !channel) return false;
      directTried = true;
      const atForFallback = isCatchupMode ? (getCatchupAt(channel.channel_id) || 0) : 0;
      const fresh = await fallbackToDirectUrl(channel, atForFallback).catch(() => "");
      if (cancelled || !fresh) return false;
      if (hlsOrNull) hlsOrNull.loadSource(fresh);
      else { video.src = fresh; video.play().catch(() => {}); }
      return true;
    };

    const cleanup = () => {
      if (rotateTimer) { clearTimeout(rotateTimer); rotateTimer = null; }
      try { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } } catch {}
      try { if (shakaRef.current) { shakaRef.current.destroy(); shakaRef.current = null; } } catch {}
    };

    const scheduleRotate = () => {
      if (!channel) return;
      const rotateAt = getRotateAtMs(channel.channel_id);
      if (!rotateAt) return;
      const delay = Math.max(15000, rotateAt - Date.now());
      if (rotateTimer) clearTimeout(rotateTimer);
      rotateTimer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const atForRotate = isCatchupMode ? (getCatchupAt(channel.channel_id) || 0) : 0;
          const fresh = await refreshStreamToken(channel, atForRotate);
          if (cancelled || !fresh) return;
          if (hlsRef.current) hlsRef.current.loadSource(fresh);
          else if (shakaRef.current) await shakaRef.current.load(fresh);
          scheduleRotate();
        } catch (e) {
          if (e?.code === "PREVIEW_EXPIRED") {
            if (!cancelled) { setError(e.message || "Hết thời gian xem thử — nâng gói để xem tiếp."); setBuffering(false); }
            return;
          }
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
            streaming: {
              rebufferingGoal: 6,
              bufferingGoal: 30,
              bufferBehind: 60,
              lowLatencyMode: false,
              retryParameters: { maxAttempts: 6, baseDelay: 800, timeout: 15000 },
            },
            abr: { enabled: true, defaultBandwidthEstimate: 2000000 },
          });
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
            const d = e.detail || {};
            const critical = isCriticalShakaError(d);
            console.error('shaka error', e.detail);
            if (dash) console.warn('[CHRTV] kênh .mpd — không gửi báo cáo lỗi shaka:', d.code, d.message || '');
            else logPlayerError({ channel, engine: 'shaka', code: `shaka_${d.code || 'err'}`, detail: d.message || '', fatal: critical });
            if (!dash || critical) {
              setError(d.message || 'Không phát được');
              setBuffering(false);
            }
          });
          await player.load(streamUrl);
          if (!cancelled) {
            scheduleRotate();
            try {
              const all = player.getVariantTracks();
              setTracks(all || []);
              const active = all.find(t => t.active);
              if (active) setSelectedTrack(active.id);

              // Audio tracks (shaka)
              const audios = [];
              const seenLang = new Set();
              (all || []).forEach((tr, idx) => {
                const lang = tr.language || tr.audioId || '';
                const key = `${lang}||${tr.audioRoles || ''}`;
                if (!seenLang.has(key)) {
                  seenLang.add(key);
                  audios.push({
                    id: idx,
                    lang: lang || 'und',
                    label: lang ? `${lang.toUpperCase()}${tr.audioRoles ? ` (${tr.audioRoles})` : ''}` : `Audio ${idx + 1}`,
                    name: tr.label || '',
                    active: !!tr.active,
                  });
                }
              });
              // Dùng getAudioLanguages nếu có
              try {
                const langs = player.getAudioLanguages();
                if (langs && langs.length) {
                  setAudioTracks(langs.map((l, i) => ({
                    id: i,
                    lang: l,
                    label: l.toUpperCase(),
                    name: '',
                    active: all.some(t => t.active && t.language === l),
                  })));
                } else {
                  setAudioTracks(audios);
                }
              } catch {
                setAudioTracks(audios);
              }

              // Text tracks (subtitle)
              const txt = player.getTextTracks() || [];
              setTextTracks(txt.map((tr, i) => ({
                id: tr.id ?? i,
                rawId: tr,
                lang: tr.language || 'und',
                label: tr.label || tr.language || `Sub ${i + 1}`,
                kind: tr.kind || 'subtitle',
                active: !!tr.active,
              })));
              const activeTxt = txt.find(t => t.active);
              setSelectedText(activeTxt ? (activeTxt.id ?? -1) : -1);
            } catch {}
            video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
            setBuffering(false);
          }
        } else {
          video.src = streamUrl;
          video.addEventListener('waiting', () => !cancelled && setBuffering(true));
          video.addEventListener('playing', () => !cancelled && setBuffering(false));
          video.addEventListener('error', () => {
            if (cancelled || !proxied) return;
            tryDirectFallback(null);
          });
          await video.play().catch(() => setPlaying(false));
          setBuffering(false);
        }
      } catch (e) {
        if (!cancelled) {
          if (!dash) logPlayerError({ channel, engine: 'shaka', code: 'load_failed', detail: String(e?.message || e), fatal: true });
          setError(String(e?.message || e || 'Lỗi tải kênh'));
          setBuffering(false);
        }
      }
    };

    const load = async () => {
      try {
        if (isHls && Hls.isSupported()) {
          const cap = capRef.current;
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 60,
            maxBufferLength: 30,
            maxMaxBufferLength: 120,
            maxBufferSize: 60 * 1000 * 1000,
            liveSyncDurationCount: 3,
            abrEwmaDefaultEstimate: 800000,
            fragLoadingMaxRetry: 6,
            levelLoadingMaxRetry: 4,
            manifestLoadingMaxRetry: 4,
            fragLoadingMaxRetryTimeout: 8000,
            ...(cap ? { maxStarvationDelay: 6 } : {}),
            xhrSetup: (xhr, url) => {
              if (!isProxiedStreamUrl(url)) return;
              const h = applyStreamClientHeaders({}, channel);
              Object.entries(h).forEach(([k, v]) => { try { xhr.setRequestHeader(k, v); } catch {} });
            },
          });
          hlsRef.current = hls;
          hls.attachMedia(video);
          hls.on(Hls.Events.MEDIA_ATTACHED, () => { if (!cancelled) hls.loadSource(streamUrl); });
          hls.on(Hls.Events.MANIFEST_PARSED, (evt, data) => {
            if (cancelled) return;
            if (cap) {
              try {
                const idx = hls.levels.map((l, i) => [l.height || 0, i]).filter(([h]) => h && h <= cap).map(([, i]) => i);
                if (idx.length) hls.autoLevelCapping = idx[idx.length - 1];
              } catch {}
            }
            // Quality levels
            const lvls = (hls.levels || []).map((l, i) => ({
              id: i,
              height: l.height || 0,
              width: l.width || 0,
              bitrate: l.bitrate || 0,
              label: l.height ? `${l.height}p` : (l.bitrate ? `${Math.round(l.bitrate / 1000)}k` : `Level ${i}`),
            })).sort((a, b) => b.height - a.height);
            setHlsLevels(lvls);
            setHlsLevel(hls.currentLevel ?? -1);

            // Audio tracks
            try {
              const aTracks = (hls.audioTracks || []).map((at, i) => ({
                id: at.id ?? i,
                lang: at.lang || at.name || 'und',
                label: at.name || at.lang || `Audio ${i + 1}`,
                name: at.name || '',
                active: i === hls.audioTrack,
              }));
              setAudioTracks(aTracks);
              setSelectedAudio(hls.audioTrack ?? -1);
            } catch {}

            // Subtitle tracks
            try {
              const sTracks = (hls.subtitleTracks || []).map((st, i) => ({
                id: st.id ?? i,
                lang: st.lang || st.name || 'und',
                label: st.name || st.lang || `Sub ${i + 1}`,
                kind: 'subtitle',
                active: i === hls.subtitleTrack,
              }));
              setTextTracks(sTracks);
              setSelectedText(hls.subtitleTrack ?? -1);
            } catch {}

            setBuffering(false);
            scheduleRotate();
            video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
          });

          // Level switched -> update UI
          hls.on(Hls.Events.LEVEL_SWITCHED, (evt, data) => {
            if (cancelled) return;
            setHlsLevel(data.level ?? hls.currentLevel ?? -1);
          });
          hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (evt, data) => {
            if (cancelled) return;
            setSelectedAudio(data.id ?? hls.audioTrack ?? -1);
            // Update active flag
            setAudioTracks(prev => prev.map((at, idx) => ({ ...at, active: idx === (data.id ?? hls.audioTrack) })));
          });
          hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (evt, data) => {
            if (cancelled) return;
            setSelectedText(data.id ?? hls.subtitleTrack ?? -1);
            setTextTracks(prev => prev.map((st, idx) => ({ ...st, active: idx === (data.id ?? hls.subtitleTrack) })));
          });

          hls.on(Hls.Events.ERROR, (evt, data) => {
            if (cancelled) return;
            const st = data?.response?.code || 0;
            if (proxied && (st === 502 || st === 504)) {
              tryDirectFallback(hls).then((ok) => { if (!ok && !cancelled) hls.startLoad(); });
              return;
            }
            if (proxied && (st === 401 || st === 403)) {
              const atForRetry = isCatchupMode ? (getCatchupAt(channel.channel_id) || 0) : 0;
              refreshStreamToken(channel, atForRetry)
                .then((fresh) => { if (!cancelled && fresh) { hls.loadSource(fresh); scheduleRotate(); } })
                .catch(() => {});
              return;
            }
            if (!dash) logPlayerError({
              channel,
              engine: 'hls',
              code: data?.details || data?.type || 'hls_error',
              detail: `${data?.type || ''} ${data?.reason || data?.response?.code || ''}`.trim(),
              fatal: !!data.fatal,
            });
            if (data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                tryDirectFallback(hls).then((ok) => { if (!ok && !cancelled) hls.startLoad(); });
              }
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
  }, [streamUrl, loadKey, channel, isCatchupMode]);

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

  // Quality selection
  const selectQuality = useCallback((id) => {
    // HLS.js
    if (hlsRef.current) {
      try {
        const hls = hlsRef.current;
        if (id === -1) {
          hls.currentLevel = -1; // auto
        } else {
          hls.currentLevel = id;
        }
        setHlsLevel(id);
      } catch {}
    }
    // Shaka
    if (shakaRef.current) {
      try {
        const player = shakaRef.current;
        if (id === -1) {
          player.configure({ abr: { enabled: true } });
          setSelectedTrack(-1);
        } else {
          const tr = tracks.find(t => t.id === id);
          if (tr) {
            player.configure({ abr: { enabled: false } });
            player.selectVariantTrack(tr, true);
            setSelectedTrack(id);
          }
        }
      } catch {}
    }
    setShowSettings(false);
    resetOverlay();
  }, [tracks, resetOverlay]);

  const selectAudioTrack = useCallback((id) => {
    if (hlsRef.current) {
      try {
        hlsRef.current.audioTrack = id;
        setSelectedAudio(id);
      } catch {}
    }
    if (shakaRef.current) {
      try {
        const player = shakaRef.current;
        const all = player.getVariantTracks() || [];
        // Tìm track có language tương ứng
        const target = audioTracks.find(a => a.id === id);
        if (target && target.lang) {
          player.selectAudioLanguage(target.lang);
          setSelectedAudio(id);
          // Update variant active for UI
          const act = player.getVariantTracks().find(t => t.active);
          if (act) setSelectedTrack(act.id);
        }
      } catch {}
    }
    setShowSettings(false);
    resetOverlay();
  }, [audioTracks, resetOverlay]);

  const selectSubtitle = useCallback((id) => {
    if (hlsRef.current) {
      try {
        hlsRef.current.subtitleTrack = id;
        setSelectedText(id);
      } catch {}
    }
    if (shakaRef.current) {
      try {
        const player = shakaRef.current;
        if (id === -1) {
          player.setTextTrackVisibility(false);
          setSelectedText(-1);
        } else {
          const all = player.getTextTracks() || [];
          const tr = all.find(t => (t.id ?? -1) === id) || all[id];
          if (tr) {
            player.selectTextTrack(tr);
            player.setTextTrackVisibility(true);
            setSelectedText(id);
          }
        }
      } catch {}
    }
    setShowSettings(false);
    resetOverlay();
  }, [resetOverlay]);

  const selectZoom = useCallback((id) => {
    try { zoom.setMode(id); } catch {}
    setShowSettings(false);
    resetOverlay();
  }, [zoom, resetOverlay]);

  const progress = epgNow ? calculateProgramProgress(epgNow.start, epgNow.stop) : 0;

  const hasQuality = (hlsLevels && hlsLevels.length > 0) || (tracks && tracks.length > 0);
  const hasAudio = audioTracks && audioTracks.length > 1;
  const hasSubs = textTracks && textTracks.length > 0;

  return (
    <div ref={containerRef} className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden select-none">
      {mini && onExpand && (
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 px-3 py-2 bg-slate-900/95 border-b border-white/10">
          <span className="text-xs">📌 {channelName}</span>
          <button onClick={onExpand} className="ml-auto px-2.5 py-1 bg-[#f36f21] text-white text-[11px] font-bold rounded-lg">Mở lại</button>
        </div>
      )}

      <video ref={videoRef} className={`w-full h-full ${zoom.cls}`} playsInline autoPlay controlsList="nodownload noplaybackrate noremoteplayback" disablePictureInPicture disableRemotePlayback onContextMenu={(e) => e.preventDefault()} />

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
          <span className="mt-2 text-[11px] text-white/60 font-bold tracking-widest\">ĐANG TẢI</span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 p-6 text-center">
          <div className="max-w-sm w-full">
            <div className="w-14 h-14 mx-auto rounded-full bg-[#f36f21]/15 border border-[#f36f21]/30 flex items-center justify-center mb-3\">
              <AlertTriangle className="w-7 h-7 text-[#ff9a3d]" />
            </div>
            <h3 className="text-white font-black text-[15px] mb-1\">{channelName}</h3>
            <p className="text-stone-400 text-xs mb-4 line-clamp-3\">{String(error).slice(0, 180)}</p>
            <div className="flex gap-2 justify-center">
              <button onClick={() => { setError(null); setLoadKey(k => k + 1); }} className="px-4 py-2 rounded-full bg-[#f36f21] text-white text-xs font-bold flex items-center gap-1.5\">
                <RefreshCw className="w-3.5 h-3.5" /> Thử lại
              </button>
              <button onClick={() => setShowReport(true)} className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5\">
                <Flag className="w-3.5 h-3.5" /> Báo kênh lỗi
              </button>
              {onClose && <button onClick={onClose} className="px-4 py-2 rounded-full bg-white/10 text-white text-xs font-bold\">Đóng</button>}
            </div>
          </div>
        </div>
      )}

      {/* Overlay */}
      <div className={`absolute inset-0 z-20 transition-opacity duration-300 pointer-events-none ${showOverlay ? 'opacity-100' : 'opacity-0'}`}>
        {/* Top */}
        <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent flex items-center gap-2 pointer-events-auto">
          {onClose && <button onClick={onClose} className="p-2 rounded-full bg-black/50 hover:bg-white/15 text-white\"><ArrowLeft className="w-5 h-5" /></button>}
          {channel?.logo && <img src={channel.logo} alt="" className="w-8 h-8 rounded-lg object-contain bg-black/40 p-0.5" onError={e => e.target.style.display='none'} />}
          <div className="min-w-0">
            <h2 className="text-[13px] font-bold text-white leading-tight truncate\">{channelName}</h2>
            <div className="flex items-center gap-1.5 mt-0.5\">
              {isCatchupMode ? (
                <span className="px-1.5 py-0.5 rounded bg-purple-600 text-white text-[9px] font-black flex items-center gap-1\"><Clock className="w-3 h-3" />XEM LẠI</span>
              ) : (
                <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[9px] font-black flex items-center gap-1\"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse\"></span>LIVE</span>
              )}
              {channel?.group_title && <span className="text-[10px] text-white/60 truncate\">{channel.group_title}</span>}
              {hlsLevel !== -1 && hlsLevels.length > 0 && (
                <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-bold text-white/70\">{hlsLevels.find(l => l.id === hlsLevel)?.label || `${hlsLevel}`}</span>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5\">
            {(net.cellular || net.slow) && (
              <span className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold\">
                <Signal className="w-3 h-3" />{net.cellular ? 'Đang dùng 4G' : 'Mạng yếu'}
              </span>
            )}
            <button onClick={() => { setShowReport(true); resetOverlay(); }} title="Báo kênh lỗi" className="p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-white/15\"><Flag className="w-4 h-4" /></button>
            <button onClick={() => { setShowSettings(v => !v); setSettingsTab('quality'); resetOverlay(); }} className={`p-2 rounded-full ${showSettings ? 'bg-[#f36f21] text-white' : 'bg-black/50 text-white/70 hover:text-white'}`}><Settings className="w-4 h-4" /></button>
            <button onClick={() => { setShowList(v => !v); resetOverlay(); }} className={`p-2 rounded-full ${showList ? 'bg-[#f36f21] text-white' : 'bg-black/50 text-white/70 hover:text-white'}`}><List className="w-4 h-4" /></button>
            {onMinimize && !mini && <button onClick={onMinimize} className="p-2 rounded-full bg-black/50 text-white/70 hover:text-white text-[10px] font-bold\">Thu nhỏ</button>}
          </div>
        </div>

        {/* Channel list side */}
        {showList && (
          <div className="absolute top-14 right-3 bottom-20 w-[300px] bg-black/90 backdrop-blur-md rounded-2xl border border-white/10 flex flex-col overflow-hidden pointer-events-auto">
            <div className="p-3 border-b border-white/10 flex items-center justify-between\">
              <span className="text-xs font-bold text-white/70\">Danh sách kênh</span>
              <button onClick={() => setShowList(false)} className="p-1 rounded-full hover:bg-white/10\"><X className="w-4 h-4 text-white/60" /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {allChannels.slice(0, 120).map(ch => (
                <button key={ch.channel_id} onClick={() => { window.__chrtv_select_channel && window.__chrtv_select_channel(ch); setShowList(false); }} className={`w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 text-left ${channel?.channel_id === ch.channel_id ? 'bg-[#f36f21]/15' : ''}`}>
                  <img src={ch.logo || ''} alt="" className="w-8 h-8 rounded-lg object-contain bg-black/40 p-0.5" onError={e => e.target.style.display='none'} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-white truncate\">{ch.name}</p>
                    <p className="text-[10px] text-white/40 truncate\">{ch.group_title}</p>
                  </div>
                  {channel?.channel_id === ch.channel_id && <Radio className="w-3 h-3 text-[#f36f21] animate-pulse" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Settings panel — Quality / Audio / Subtitle / Size */}
        {showSettings && (
          <div className="absolute top-14 right-3 w-[320px] max-w-[90vw] bg-[#0f0f12]/95 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden pointer-events-auto shadow-2xl">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10\">
              <span className="text-[12px] font-black text-white flex items-center gap-1.5\"><Settings className="w-3.5 h-3.5 text-[#ff9a3d]" /> Cài đặt phát</span>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded-full hover:bg-white/10\"><X className="w-4 h-4 text-white/60" /></button>
            </div>
            <div className="flex gap-1 px-2 py-2 bg-black/30\">
              {[
                { id: 'quality', label: 'Chất lượng', icon: Hd, show: hasQuality },
                { id: 'audio', label: 'Âm thanh', icon: Languages, show: hasAudio },
                { id: 'subtitle', label: 'Phụ đề', icon: Captions, show: true },
                { id: 'size', label: 'Khung hình', icon: Monitor, show: true },
              ].filter(t => t.show).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={`flex-1 flex flex-col items-center gap-1 px-2 py-2 rounded-xl text-[10px] font-bold transition ${settingsTab === tab.id ? 'bg-[#f36f21] text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'}`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2\">
              {settingsTab === 'quality' && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-white/40 px-2 py-1 uppercase tracking-widest\">Độ phân giải</p>
                  {/* Auto */}
                  <button onClick={() => selectQuality(-1)} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between ${ (hlsLevel === -1 && selectedTrack === -1) ? 'bg-[#f36f21] text-white font-bold' : 'text-white/70 hover:bg-white/10'}`}>
                    <span className="flex items-center gap-2\"><Hd className="w-3.5 h-3.5" /> Tự động (ABR)</span>
                    {(hlsLevel === -1 && selectedTrack === -1) && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                  </button>
                  {/* HLS levels */}
                  {hlsLevels.map(lv => (
                    <button key={`hls-${lv.id}`} onClick={() => selectQuality(lv.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between ${hlsLevel === lv.id ? 'bg-[#f36f21] text-white font-bold' : 'text-white/70 hover:bg-white/10'}`}>
                      <span>{lv.label} {lv.width ? `• ${lv.width}x${lv.height}` : ''}</span>
                      <span className="text-[10px] opacity-60\">{lv.bitrate ? `${Math.round(lv.bitrate/1000)}k` : ''}</span>
                    </button>
                  ))}
                  {/* Shaka tracks (fallback when no hls) */}
                  {hlsLevels.length === 0 && tracks.map(tr => (
                    <button key={tr.id} onClick={() => selectQuality(tr.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between ${selectedTrack === tr.id ? 'bg-[#f36f21] text-white font-bold' : 'text-white/70 hover:bg-white/10'}`}>
                      <span>{tr.height ? `${tr.height}p` : `Track ${tr.id}`} {tr.width ? `• ${tr.width}x${tr.height}` : ''}</span>
                      <span className="text-[10px] opacity-60\">{Math.round((tr.bandwidth||0)/1000)}k</span>
                    </button>
                  ))}
                  {!hasQuality && <p className="text-[11px] text-stone-500 px-3 py-4 text-center\">Kênh này chỉ có 1 chất lượng</p>}
                </div>
              )}
              {settingsTab === 'audio' && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-white/40 px-2 py-1 uppercase tracking-widest\">Ngôn ngữ / Audio</p>
                  {audioTracks.length === 0 && <p className="text-[11px] text-stone-500 px-3 py-4 text-center\">Không có lựa chọn audio khác</p>}
                  {audioTracks.map((at, idx) => (
                    <button key={`audio-${at.id}-${idx}`} onClick={() => selectAudioTrack(at.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between ${ (selectedAudio === at.id || at.active) ? 'bg-[#f36f21] text-white font-bold' : 'text-white/70 hover:bg-white/10'}`}>
                      <span className="flex items-center gap-2\"><Languages className="w-3.5 h-3.5" /> {at.label} {at.name ? `— ${at.name}` : ''}</span>
                      <span className="text-[10px] opacity-60\">{at.lang}</span>
                    </button>
                  ))}
                </div>
              )}
              {settingsTab === 'subtitle' && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-white/40 px-2 py-1 uppercase tracking-widest\">Phụ đề</p>
                  <button onClick={() => selectSubtitle(-1)} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center gap-2 ${selectedText === -1 ? 'bg-[#f36f21] text-white font-bold' : 'text-white/70 hover:bg-white/10'}`}>
                    <X className="w-3.5 h-3.5" /> Tắt phụ đề
                  </button>
                  {textTracks.map((st, idx) => (
                    <button key={`sub-${st.id}-${idx}`} onClick={() => selectSubtitle(st.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between ${ (selectedText === st.id || st.active) ? 'bg-[#f36f21] text-white font-bold' : 'text-white/70 hover:bg-white/10'}`}>
                      <span className="flex items-center gap-2\"><Captions className="w-3.5 h-3.5" /> {st.label}</span>
                      <span className="text-[10px] opacity-60\">{st.lang}</span>
                    </button>
                  ))}
                  {textTracks.length === 0 && <p className="text-[11px] text-stone-500 px-3 py-4 text-center\">Kênh này không có phụ đề</p>}
                </div>
              )}
              {settingsTab === 'size' && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-white/40 px-2 py-1 uppercase tracking-widest\">Kích thước khung hình</p>
                  {zoom.modes.map(m => (
                    <button key={m.id} onClick={() => selectZoom(m.id)} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between ${zoom.mode === m.id ? 'bg-[#f36f21] text-white font-bold' : 'text-white/70 hover:bg-white/10'}`}>
                      <span className="flex items-center gap-2\"><ZoomIn className="w-3.5 h-3.5" /> {m.label}</span>
                      <span className="text-[10px] opacity-60\">{m.id === 'fit' ? 'Giữ tỉ lệ' : m.id === 'fill' ? 'Lấp khung, cắt mép' : 'Kéo giãn'}</span>
                    </button>
                  ))}
                  <div className="mt-3 p-2.5 rounded-xl bg-white/[0.04] border border-white/5\">
                    <p className="text-[10px] text-stone-500\">Mẹo: bấm nút <ZoomIn className="w-3 h-3 inline" /> ở thanh điều khiển để đổi nhanh giữa 3 chế độ. Lựa chọn được lưu theo máy.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-auto">
          <div className="mb-3 bg-black/60 backdrop-blur-sm rounded-xl p-3 border border-white/10\">
            <div className="flex gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black tracking-widest text-[#ff9a3d] flex items-center gap-1\"><Clock className="w-3 h-3" /> {isCatchupMode ? 'XEM LẠI' : 'ĐANG PHÁT'}</p>
                <p className="text-[13px] font-bold text-white truncate mt-1\">{isCatchupMode && catchupProgram ? maskScores(catchupProgram.title) : (epgNow ? maskScores(epgNow.title) : channelName)}</p>
                <p className="text-[11px] text-white/50 truncate\">{epgNow ? `${formatTimeHHMM(epgNow.start)} - ${formatTimeHHMM(epgNow.stop)}` : ''}</p>
                {progress > 0 && <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden\"><div className="h-full bg-[#f36f21]" style={{ width: `${progress}%` }}></div></div>}
              </div>
              {epgNext && !isCatchupMode && (
                <div className="w-[160px] border-l border-white/10 pl-3\">
                  <p className="text-[10px] text-white/40 font-bold tracking-widest\">TIẾP THEO</p>
                  <p className="text-xs font-semibold text-white/80 line-clamp-2 mt-1\">{maskScores(epgNext.title)}</p>
                  <p className="text-[10px] text-white/40 mt-1\">{formatTimeHHMM(epgNext.start)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2\">
            <button onClick={togglePlay} className="p-2.5 rounded-full bg-[#f36f21] text-white hover:brightness-110\">
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>
            <button onClick={toggleMute} className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white\">
              {muted || vol === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input type="range" min={0} max={100} value={muted ? 0 : vol} onChange={onVolChange} className="w-24 accent-[#f36f21]" />
            <div className="flex items-center gap-1 ml-2\">
              {onPrevChannel && <button onClick={onPrevChannel} className="p-2 rounded-full bg-white/10 hover:bg-white/15 text-white\"><ChevronUp className="w-4 h-4" /></button>}
              {onNextChannel && <button onClick={onNextChannel} className="p-2 rounded-full bg-white/10 hover:bg-white/15 text-white\"><ChevronDown className="w-4 h-4" /></button>}
            </div>
            <button onClick={() => { zoom.cycle(); resetOverlay(); }} title={`Khung hình: ${zoom.label}`} className="hidden sm:flex items-center gap-1.5 px-3 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white\">
              <ZoomIn className="w-4 h-4" />
              <span className="text-[10px] font-bold\">{zoom.label}</span>
            </button>
            <div className="ml-auto flex items-center gap-1.5\">
              {(hasAudio || hasSubs) && (
                <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 border border-white/10 text-[10px] text-white/60\">
                  {hasAudio && <span className="flex items-center gap-1\"><Languages className="w-3 h-3" />{audioTracks.length}</span>}
                  {hasSubs && <span className="flex items-center gap-1\"><Captions className="w-3 h-3" />{textTracks.length}</span>}
                </div>
              )}
              <button onClick={toggleFullscreen} className="p-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white\">
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
