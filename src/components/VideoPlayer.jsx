import React, { useEffect, useRef, useState, useCallback } from 'react';
import shaka from 'shaka-player';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  AlertTriangle, Radio, Clock, ArrowLeft,
  ChevronUp, ChevronDown, RefreshCw, Signal, Info, X, List,
  Settings, Monitor, Gauge, Wifi, Activity, Hash, Timer,
  Camera, PictureInPicture2 as PiP, Volume1, Captions, AudioLines
} from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';
import { formatTimeHHMM, calculateProgramProgress } from '../utils/dateUtils';
import SleepTimer from './SleepTimer';
import { useDevice } from '../contexts/DeviceContext';
import { useToast } from '../contexts/ToastContext';

const FALLBACK_STREAM_URL_HTTP = "http://bore.pub:30113/hls/index.m3u8";
const FALLBACK_STREAM_URL = (typeof window !== 'undefined' && window.location?.protocol === 'https:')
  ? `/api/proxy?url=${encodeURIComponent("http://bore.pub:30113/hls/index.m3u8")}`
  : FALLBACK_STREAM_URL_HTTP;
const VLC_USER_AGENT = "VLC/3.0.21 LibVLC/3.0.21";

export function generateCatchupUrl(baseUrl, timestamp, catchupType = 'append') {
  if (!baseUrl) return '';
  if (!timestamp) return baseUrl;
  let utcSec = Math.floor(Date.now() / 1000);
  let dateObj = new Date();
  if (typeof timestamp === 'number') {
    utcSec = timestamp > 10000000000 ? Math.floor(timestamp / 1000) : timestamp;
    dateObj = new Date(utcSec * 1000);
  } else if (timestamp instanceof Date) {
    dateObj = timestamp; utcSec = Math.floor(timestamp.getTime() / 1000);
  } else if (typeof timestamp === 'string') {
    if (/^\d{14}$/.test(timestamp)) {
      const y = parseInt(timestamp.substring(0, 4), 10);
      const m = parseInt(timestamp.substring(4, 6), 10) - 1;
      const d = parseInt(timestamp.substring(6, 8), 10);
      const h = parseInt(timestamp.substring(8, 10), 10);
      const mi = parseInt(timestamp.substring(10, 12), 10);
      const s = parseInt(timestamp.substring(12, 14), 10);
      dateObj = new Date(Date.UTC(y, m, d, h - 7, mi, s));
      utcSec = Math.floor(dateObj.getTime() / 1000);
    } else if (!isNaN(Number(timestamp))) {
      utcSec = parseInt(timestamp, 10);
      dateObj = new Date(utcSec * 1000);
    } else {
      dateObj = new Date(timestamp); utcSec = Math.floor(dateObj.getTime() / 1000);
    }
  }
  const pad = (n) => String(n).padStart(2, '0');
  const Y = dateObj.getFullYear(), Mo = pad(dateObj.getMonth()+1), D = pad(dateObj.getDate());
  const h = pad(dateObj.getHours()), mi = pad(dateObj.getMinutes()), s = pad(dateObj.getSeconds());
  const formatted = `${Y}${Mo}${D}${h}${mi}${s}`;
  const sep = baseUrl.includes('?') ? '&' : '?';
  if (catchupType === 'flussonic' || baseUrl.includes('timeshift'))
    return baseUrl.replace(/\/index\.m3u8$/i, '') + `/timeshift_abs-${utcSec}.m3u8`;
  if (catchupType === 'shift') return `${baseUrl}${sep}shift=${utcSec}`;
  return `${baseUrl}${sep}utc=${utcSec}&lutc=${Math.floor(Date.now()/1000)}&catchup_start=${formatted}`;
}

function formatBytes(b) { if (!b) return '0 B'; const k=1024, s=['B','KB','MB','GB']; const i=Math.floor(Math.log(b)/Math.log(k)); return (b/Math.pow(k,i)).toFixed(1)+' '+s[i]; }
function formatBitrate(bps) { if (!bps) return 'N/A'; if (bps>=1e6) return (bps/1e6).toFixed(1)+' Mbps'; if (bps>=1e3) return (bps/1e3).toFixed(0)+' Kbps'; return bps+' bps'; }

export default function VideoPlayer({
  channel, streamUrl, epgNow, epgNext,
  isCatchupMode = false, catchupProgram = null,
  onNextChannel, onPrevChannel, onClose,
  allChannels = [], onOpenSettings,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const shakaPlayerRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isFallbackActive, setIsFallbackActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [activeUrl, setActiveUrl] = useState(streamUrl || FALLBACK_STREAM_URL);

  const [showInfo, setShowInfo] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showChannelList, setShowChannelList] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const [videoStats, setVideoStats] = useState({ resolution: 'N/A', fps: 0, bitrate: 0, bufferLength: 0, codec: 'N/A', width: 0, height: 0, droppedFrames: 0, decodedFrames: 0 });
  const [availableTracks, setAvailableTracks] = useState([]);
  const [selectedTrackId, setSelectedTrackId] = useState(-1);
  const [channelListSearch, setChannelListSearch] = useState('');

  // Audio & Subtitle tracks
  const [audioTracks, setAudioTracks] = useState([]);
  const [textTracks, setTextTracks] = useState([]);
  const [selectedAudioId, setSelectedAudioId] = useState(-1);
  const [selectedTextId, setSelectedTextId] = useState(-1);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);

  // Multi-view
  const [multiView, setMultiView] = useState(0); // 0=single, 2=2-up, 4=4-up
  const [multiChannels, setMultiChannels] = useState([]);

  // Channel quick-switch OSD
  const [quickSwitch, setQuickSwitch] = useState(null);
  const quickSwitchTimer = useRef(null);

  const overlayTimerRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const volumeTimerRef = useRef(null);
  const sleepTimerRef = useRef(null);

  const device = useDevice();
  const { addToast } = useToast();

  // Touch gesture state
  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const touchGestureRef = useRef(null);

  // Overlay auto-hide 5s
  const resetOverlayTimer = useCallback(() => {
    setShowOverlay(true);
    if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    overlayTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
      setShowInfo(false);
      setShowQualityMenu(false);
      setShowVolumeSlider(false);
      setShowSleepTimer(false);
    }, 5000);
  }, []);

  useEffect(() => {
    resetOverlayTimer();
    const h = () => resetOverlayTimer();
    window.addEventListener('mousemove', h);
    window.addEventListener('click', h);
    return () => {
      window.removeEventListener('mousemove', h);
      window.removeEventListener('click', h);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
    };
  }, [resetOverlayTimer]);

  // Parse ClearKey t? stream URL (MPD key) — query params + hash fragment JSON
  const parseClearKey = useCallback((url) => {
    if (!url) return null;
    try {
      const u = new URL(url);
      let keyId = '', key = '';
      // ?key-id=...&key=... ho?c ?kid=...&k=...
      keyId = u.searchParams.get('key-id') || u.searchParams.get('kid') || '';
      key = u.searchParams.get('key') || u.searchParams.get('k') || '';
      // #{"key-id":"...","key":"..."} ho?c #{"kid":"...","k":"..."}
      if (!keyId && !key && u.hash && u.hash.length > 1) {
        try {
          const h = JSON.parse(decodeURIComponent(u.hash.substring(1)));
          keyId = h['key-id'] || h.kid || h.keyId || '';
          key = h.key || h.k || '';
        } catch {}
      }
      if (keyId && key) {
        const kid = keyId.replace(/[^a-fA-F0-9]/g, '');
        const k = key.replace(/[^a-fA-F0-9]/g, '');
        if (kid.length === 32 && k.length === 32)
          return { keyId: hexToUint8(kid), key: hexToUint8(k) };
      }
      // N?u ch? có keyId mà không có key, ?? l?i Shaka ??c t? MPD manifest
    } catch {}
    return null;
  }, []);

  // Ki?m tra URL có ph?i MPD không
  const isMpdUrl = useCallback((url) => {
    if (!url) return false;
    try {
      const u = new URL(url);
      return u.pathname.endsWith('.mpd') || u.searchParams.has('mpd') || url.includes('.mpd');
    } catch {
      return url.includes('.mpd');
    }
  }, []);
  function hexToUint8(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    return arr;
  }
  function ab2hex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  useEffect(() => { shaka.polyfill.installAll(); }, []);

  // Initialize Shaka Player with VLC UA + MPD/ClearKey
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    let player = shakaPlayerRef.current;
    if (!player) {
      player = new shaka.Player(videoEl);
      shakaPlayerRef.current = player;
      const net = player.getNetworkingEngine();
      if (net) net.registerRequestFilter((type, req) => { req.headers['User-Agent'] = VLC_USER_AGENT; });
      player.configure({
        streaming: { rebufferingGoal: 2, bufferingGoal: 10, bufferBehind: 15, lowLatencyMode: true },
        abr: { enabled: true, defaultBandwidthEstimate: 2000000 },
        manifest: { retryParameters: { maxAttempts: 3, baseDelay: 1000, backoffFactor: 2 }, dash: { disableXlinkProcessing: true, xlinkFailGracefully: true, ignoreMinBufferTime: true } },
        drm: { clearKeys: {}, retryParameters: { maxAttempts: 3, baseDelay: 500, backoffFactor: 2 } },
      });
    }

    const targetUrl = streamUrl || FALLBACK_STREAM_URL;
    setActiveUrl(targetUrl);
    setIsFallbackActive(false);
    setErrorMessage(null);
    setIsBuffering(true);

    const loadStream = async (url, isFallback = false) => {
      try {
        // Cấu hình ClearKey nếu stream URL có kèm key (MPD) ho?c t? channel
        let clearKey = parseClearKey(url);
        // N?u URL không có key, th? l?y t? channel (t? #KODIPROP trong M3U)
        if (!clearKey && channel?.clearKeyId && channel?.clearKey) {
          clearKey = {
            keyId: hexToUint8(channel.clearKeyId),
            key: hexToUint8(channel.clearKey),
          };
        }
        if (clearKey) {
          try {
            player.configure({ drm: { clearKeys: { [ab2hex(clearKey.keyId)]: ab2hex(clearKey.key) } } });
          } catch (e) {}
        } else {
          try { player.configure({ drm: { clearKeys: {} } }); } catch (e) {}
        }
        // N?u là MPD, c?u hình manifest thích h?p
        if (isMpdUrl(url) || channel?.manifest_type === 'mpd') {
          try { player.configure({ manifest: { dash: { disableXlinkProcessing: true, xlinkFailGracefully: true } } }); } catch (e) {}
        }
        await player.load(url);
        videoEl.play().catch(() => setIsPlaying(false));
        setIsBuffering(false);
        try {
          const tracks = player.getVariantTracks();
          setAvailableTracks(tracks);
          const active = tracks.find(t => t.active);
          if (active) setSelectedTrackId(active.id);
          // Audio tracks
          const audios = player.getAudioLanguages ? player.getAudioLanguages() : [];
          setAudioTracks(audios.map((lang, i) => ({ id: i, label: lang || `Track ${i + 1}` })));
          // Text tracks (subtitles)
          const texts = player.getTextLanguages ? player.getTextLanguages() : [];
          setTextTracks(texts.map((lang, i) => ({ id: i, label: lang || `CC ${i + 1}` })));
        } catch {}
      } catch (err) {
        // N?u l?i DRM (6010 = REQUESTED_KEY_SYSTEM_CONFIG), th? l?i v?i ignoreDrmInfo=true
        if (err && err.code === 6010) {
          try {
            player.configure({ manifest: { ignoreDrmInfo: true } });
            await player.load(url);
            videoEl.play().catch(() => setIsPlaying(false));
            setIsBuffering(false);
          } catch (e) {
            if (isMpdUrl(url) && !url.startsWith('http://bore.pub')) {
              await tryMpdWithProxy(url, player, videoEl);
            } else if (!isFallback) {
              await doFallback(player, videoEl);
            } else {
              setErrorMessage("Không thể kết nối."); setIsBuffering(false);
            }
          } finally {
            try { player.configure({ manifest: { ignoreDrmInfo: false } }); } catch (e) {}
          }
        } else if (isMpdUrl(url) && !url.startsWith('http://bore.pub') && !url.includes('/api/proxy')) {
          try { await tryMpdWithProxy(url, player, videoEl); }
          catch { if (!isFallback) await doFallback(player, videoEl); else { setErrorMessage("Lỗi kết nối."); setIsBuffering(false); } }
        } else if (!isFallback) {
          await doFallback(player, videoEl);
        } else {
          setErrorMessage("Lỗi kết nối."); setIsBuffering(false);
        }
      }
    };

    async function tryMpdWithProxy(url, player, videoEl) {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
      setErrorMessage("Đang thử proxy MPD...");
      await player.load(proxyUrl);
      videoEl.play().catch(() => setIsPlaying(false));
      setIsBuffering(false);
    }

    async function doFallback(player, videoEl) {
      setIsFallbackActive(true);
      setErrorMessage("Luồng chính gián đoạn, chuyển dự phòng...");
      try { await player.load(FALLBACK_STREAM_URL); videoEl.play().catch(() => {}); setIsBuffering(false); }
      catch { setErrorMessage("Không thể kết nối."); setIsBuffering(false); }
    }

    loadStream(targetUrl);

    // N?u channel có user-agent riêng (t? #EXTVLCOPT), c?p nh?t filter
    const ua = channel?.user_agent;
    if (ua) {
      try {
        const ne = player.getNetworkingEngine();
        if (ne) { ne.clearRequestFilters(); ne.registerRequestFilter((type, req) => { req.headers['User-Agent'] = ua; }); }
      } catch (e) {}
    }

    const onErr = (e) => { if (!isFallbackActive) { setIsFallbackActive(true); loadStream(FALLBACK_STREAM_URL, true); } };
    const onBuf = (e) => setIsBuffering(e.buffering);
    const onTracks = () => { try { const t = player.getVariantTracks(); setAvailableTracks(t); const a = t.find(x=>x.active); if(a) setSelectedTrackId(a.id); } catch {} };

    player.addEventListener('error', onErr);
    player.addEventListener('buffering', onBuf);
    player.addEventListener('trackschanged', onTracks);

    return () => {
      player.removeEventListener('error', onErr);
      player.removeEventListener('buffering', onBuf);
      player.removeEventListener('trackschanged', onTracks);
    };
  }, [streamUrl, parseClearKey, channel?.clearKeyId, channel?.clearKey]);

  // Real-time stats
  useEffect(() => {
    const update = () => {
      const v = videoRef.current;
      const p = shakaPlayerRef.current;
      if (!v) return;
      setVideoStats({
        resolution: v.videoWidth && v.videoHeight ? `${v.videoWidth}x${v.videoHeight}` : 'N/A',
        fps: v.requestVideoFrameRate ? Math.round(v.requestVideoFrameRate()) : 0,
        bitrate: p && p.getStats ? (p.getStats().streamBandwidth || 0) : 0,
        bufferLength: p && p.getStats ? (p.getStats().buffering || 0) : 0,
        codec: v.videoWidth ? `${v.videoWidth}x${v.videoHeight}` : 'N/A',
        width: v.videoWidth || 0, height: v.videoHeight || 0,
        droppedFrames: v.webkitDroppedVideoFrames || v.droppedVideoFrames || 0,
        decodedFrames: v.webkitDecodedVideoFrames || 0,
      });
    };
    statsIntervalRef.current = setInterval(update, 1000);
    return () => { if (statsIntervalRef.current) clearInterval(statsIntervalRef.current); };
  }, []);

  // Controls
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setIsPlaying(true); } else { videoRef.current.pause(); setIsPlaying(false); }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const setVolumeLevel = (val) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val / 100;
    setVolume(val);
    if (val > 0 && v.muted) { v.muted = false; setIsMuted(false); }
    if (val === 0) { v.muted = true; setIsMuted(true); }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else { document.exitFullscreen().catch(() => {}); setIsFullscreen(false); }
  };

  const selectTrack = (trackId) => {
    const p = shakaPlayerRef.current;
    if (!p) return;
    p.selectVariantTrack(trackId);
    setSelectedTrackId(trackId);
    setShowQualityMenu(false);
    resetOverlayTimer();
  };

  const selectAudio = (idx) => {
    const p = shakaPlayerRef.current;
    if (!p || audioTracks.length === 0) return;
    try {
      const lang = audioTracks[idx]?.label;
      if (p.selectAudioLanguage) p.selectAudioLanguage(lang);
      setSelectedAudioId(idx);
    } catch (e) {}
    setShowAudioMenu(false);
    resetOverlayTimer();
  };

  const selectSubtitle = (idx) => {
    const p = shakaPlayerRef.current;
    if (!p || textTracks.length === 0) return;
    try {
      const lang = textTracks[idx]?.label;
      if (p.setTextTrackVisibility) p.setTextTrackVisibility(true);
      if (p.selectTextLanguage) p.selectTextLanguage(lang);
      setSelectedTextId(idx);
    } catch (e) {}
    setShowSubtitleMenu(false);
    resetOverlayTimer();
  };

  const toggleSubtitles = () => {
    const p = shakaPlayerRef.current;
    if (!p) return;
    try {
      const v = videoRef.current;
      if (v && v.textTracks && v.textTracks.length > 0) {
        const newState = !v.textTracks[0].mode || v.textTracks[0].mode === 'hidden';
        for (let i = 0; i < v.textTracks.length; i++) {
          v.textTracks[i].mode = newState ? 'showing' : 'hidden';
        }
        addToast && addToast(newState ? 'Đã bật phụ đề' : 'Đã tắt phụ đề', 'info');
      } else if (p.setTextTrackVisibility) {
        // No text tracks available
        addToast && addToast('Stream không có phụ đề', 'info');
      }
    } catch (e) { addToast && addToast('Stream không hỗ trợ phụ đề', 'info'); }
  };

  // Screenshot
  const takeScreenshot = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 1920;
      canvas.height = v.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `chrtv_${channel?.name || 'screenshot'}_${Date.now()}.png`;
        a.click(); URL.revokeObjectURL(url);
        addToast && addToast('Đã chụp màn hình', 'success');
      }, 'image/png');
    } catch (e) { addToast && addToast('Lỗi chụp màn hình', 'error'); }
  }, [channel, addToast]);

  // PiP
  const togglePiP = useCallback(async () => {
    try {
      const v = videoRef.current;
      if (!v) return;
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        addToast && addToast('Đã tắt PiP', 'info');
      } else if (v.requestPictureInPicture) {
        await v.requestPictureInPicture();
        addToast && addToast('Đã bật Picture-in-Picture', 'info');
      }
    } catch (e) { addToast && addToast('PiP không hỗ trợ', 'error'); }
  }, [addToast]);

  // External player (Android)
  const openExternalPlayer = useCallback(() => {
    const url = activeUrl || streamUrl;
    if (device.os === 'android') {
      window.location.href = `intent://${url}#Intent;package=com.mxtech.videoplayer.ad;type=video;S.end;end`;
      addToast && addToast('Đang mở bằng MX Player', 'info');
    } else {
      addToast && addToast('Chỉ hỗ trợ trên Android', 'info');
    }
  }, [activeUrl, streamUrl, device, addToast]);

  // Sleep timer expired
  const onSleepExpired = useCallback(() => {
    if (videoRef.current) { videoRef.current.pause(); setIsPlaying(false); }
    addToast && addToast('Tự tắt sau sleep timer', 'info');
  }, [addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      resetOverlayTimer();
      const key = e.key;
      switch (key) {
        case 'MediaPlayPause': case ' ': e.preventDefault(); togglePlay(); break;
        case 'ArrowUp': if (onPrevChannel) onPrevChannel(); break;
        case 'ArrowDown': if (onNextChannel) onNextChannel(); break;
        case 'Enter': setShowChannelList(prev => !prev); break;
        case 'i': case 'I': setShowInfo(prev => !prev); break;
        case 'm': case 'M': toggleMute(); addToast && addToast(isMuted ? 'Bật âm thanh' : 'Tắt âm thanh', 'volume'); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'p': case 'P': togglePiP(); break;
        case 's': case 'S': takeScreenshot(); break;
        case '?': case '/': if (e.shiftKey) { /* open shortcuts */ } break;
        case 'Escape': case 'BackSpace':
          if (showChannelList) setShowChannelList(false);
          else if (showInfo) setShowInfo(false);
          else if (showQualityMenu) setShowQualityMenu(false);
          else if (showSleepTimer) setShowSleepTimer(false);
          else if (showVolumeSlider) setShowVolumeSlider(false);
          else if (onClose) onClose();
          break;
        default:
          // Channel quick-switch (number keys)
          if (/^[0-9]$/.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (allChannels.length > 0) {
              const num = parseInt(key, 10);
              if (num >= 0 && num <= 9 && num < allChannels.length) {
                setQuickSwitch(allChannels[num]);
                if (quickSwitchTimer.current) clearTimeout(quickSwitchTimer.current);
                quickSwitchTimer.current = setTimeout(() => setQuickSwitch(null), 3000);
                if (onNextChannel && num < allChannels.length) {
                  // Try to select channel by index
                  const ch = allChannels[num];
                  if (ch) {
                    // Use the channel directly from list
                    window.__chrtv_select_channel && window.__chrtv_select_channel(ch);
                  }
                }
              }
            }
          }
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetOverlayTimer, onPrevChannel, onNextChannel, onClose, showChannelList, showInfo, showQualityMenu, showSleepTimer, showVolumeSlider, isMuted, addToast, togglePiP, takeScreenshot, allChannels]);

  // Touch gestures (mobile)
  useEffect(() => {
    if (!device.isMobile || !device.isTouch) return;
    const el = containerRef.current;
    if (!el) return;

    let gestureTimeout = null;
    let doubleTapTimeout = null;
    let lastTap = 0;

    const onTouchStart = (e) => {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
      resetOverlayTimer();
    };

    const onTouchEnd = (e) => {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartRef.current.x;
      const dy = t.clientY - touchStartRef.current.y;
      const dt = Date.now() - touchStartRef.current.time;
      const absDx = Math.abs(dx), absDy = Math.abs(dy);

      // Double tap = play/pause
      const now = Date.now();
      if (absDx < 20 && absDy < 20 && dt < 300) {
        if (now - lastTap < 350) {
          togglePlay();
          if (doubleTapTimeout) clearTimeout(doubleTapTimeout);
          lastTap = 0;
          return;
        }
        lastTap = now;
      }

      // Swipe gesture
      if (dt < 500 && (absDx > 50 || absDy > 50)) {
        if (absDx > absDy) {
          // Horizontal swipe - could be seek (for catchup)
          if (dx > 50) addToast && addToast('Phát lại tiếp', 'info');
          else if (dx < -50) addToast && addToast('Phát lại lùi', 'info');
        } else {
          // Vertical swipe
          if (dy < -50) setVolumeLevel(Math.min(100, volume + 10));
          else if (dy > 50) setVolumeLevel(Math.max(0, volume - 10));
          setShowVolumeSlider(true);
          if (volumeTimerRef.current) clearTimeout(volumeTimerRef.current);
          volumeTimerRef.current = setTimeout(() => setShowVolumeSlider(false), 2000);
        }
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      if (gestureTimeout) clearTimeout(gestureTimeout);
      if (doubleTapTimeout) clearTimeout(doubleTapTimeout);
    };
  }, [device, volume, addToast, resetOverlayTimer]);

  const nowProgress = epgNow ? calculateProgramProgress(epgNow.start, epgNow.stop) : 0;
  const filteredChannelList = allChannels.filter(ch => !channelListSearch || ch.name.toLowerCase().includes(channelListSearch.toLowerCase()));

  const qualityLabel = (t) => { if (!t) return 'Auto'; if (t.height) return `${t.height}p`; return `Track ${t.id}`; };

  // Volume icon
  const VolumeIcon = volume === 0 || isMuted ? VolumeX : volume < 50 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden select-none"
      style={{ cursor: showOverlay ? 'default' : 'none' }}
    >
      {/* Main Video */}
      <video ref={videoRef} className="w-full h-full object-contain" playsInline autoPlay />

      {/* Multi-view (if enabled) */}
      {multiView > 1 && multiChannels.length >= multiView && (
        <div className={`absolute inset-0 z-5 grid ${multiView === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2'}`}>
          <div className="relative">
            {/* Main channel already in video */}
          </div>
          {Array.from({ length: multiView - 1 }).map((_, i) => (
            <div key={i} className="relative bg-black border border-slate-800">
              <div className="absolute top-1 left-1 z-10 text-[10px] text-white bg-black/60 px-1.5 py-0.5 rounded font-medium">
                {multiChannels[i + 1]?.name || `Kênh ${i + 2}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Buffering */}
      {isBuffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-20">
          <div className="w-12 h-12 border-[3px] border-red-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="mt-2 text-xs text-slate-400 font-medium">Đang tải...</span>
        </div>
      )}

      {/* Fallback notice */}
      {isFallbackActive && (
        <div className="absolute top-14 right-3 z-30 bg-amber-600/90 text-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-300" />
          <span className="text-[10px] font-medium">Luồng dự phòng</span>
        </div>
      )}

      {errorMessage && (
        <div className="absolute top-14 left-3 z-30 bg-red-600/90 text-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg max-w-[280px]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px] font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Channel Quick-Switch OSD */}
      {quickSwitch && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-black/80 backdrop-blur-sm rounded-2xl px-6 py-4 flex items-center gap-4 shadow-2xl border border-slate-700/40">
          {quickSwitch.logo && <img src={quickSwitch.logo} alt="" className="w-14 h-14 object-contain rounded-xl" onError={e => e.target.style.display='none'} />}
          <div>
            <div className="text-sm font-bold text-white">{quickSwitch.name}</div>
            <div className="text-[10px] text-slate-400">{quickSwitch.group_title}</div>
          </div>
        </div>
      )}

      {/* Overlay UI */}
      <div className={`absolute inset-0 z-10 transition-opacity duration-300 pointer-events-none ${showOverlay ? 'opacity-100' : 'opacity-0'}`}>

        {/* Top Header */}
        <div className="absolute top-0 left-0 right-0 px-3 py-2.5 overlay-gradient-top flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2.5">
            {onClose && (
              <button onClick={onClose} className="p-2 rounded-full bg-black/50 hover:bg-red-600/80 text-white transition-all">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            {channel?.logo && <img src={channel.logo} alt={channel.name} className="w-9 h-9 object-contain rounded-lg bg-black/50 p-1" onError={e => e.target.style.display='none'} />}
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">{channel?.name || 'Truyền hình'}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                {channel?.group_title && <span className="px-1 py-px text-[9px] font-semibold rounded bg-slate-700/80 text-slate-300">{channel.group_title}</span>}
                {isCatchupMode ? (
                  <span className="px-1 py-px text-[9px] font-semibold rounded bg-purple-600/80 text-white flex items-center gap-0.5"><Clock className="w-2 h-2" /> Xem lại</span>
                ) : (
                  <span className="px-1 py-px text-[9px] font-semibold rounded bg-red-600 text-white flex items-center gap-0.5"><Radio className="w-2 h-2 animate-pulse" /> LIVE</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Multi-view toggle */}
            <button onClick={() => { setMultiView(multiView === 0 ? 2 : multiView === 2 ? 4 : 0); if (multiView === 4) setMultiView(0); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${multiView > 0 ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title="Multi-view">
              <span className="text-[10px] font-bold">{multiView > 0 ? `${multiView}×` : '⊞'}</span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowAudioMenu(prev=>!prev); setShowQualityMenu(false); setShowSubtitleMenu(false); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showAudioMenu ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title="Audio">
              <AudioLines className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); toggleSubtitles(); resetOverlayTimer(); }} className="p-1.5 rounded-full bg-black/50 text-slate-300 hover:bg-black/70" title="Phụ đề">
              <Captions className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowQualityMenu(prev=>!prev); setShowAudioMenu(false); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showQualityMenu ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`}>
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowInfo(prev=>!prev); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showInfo ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`}>
              <Info className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowChannelList(prev=>!prev); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showChannelList ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`}>
              <List className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowSleepTimer(prev=>!prev); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showSleepTimer ? 'bg-amber-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title="Sleep Timer">
              <Timer className="w-3.5 h-3.5" />
            </button>
            {activeUrl && (
              <div className="hidden md:flex items-center gap-1 bg-black/50 px-2 py-1 rounded-full">
                <Signal className="w-3 h-3 text-emerald-400" />
                <span className="text-[9px] text-slate-300 font-medium">{videoStats.width && videoStats.height ? `${videoStats.width}×${videoStats.height}` : 'HLS'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Info Panel */}
        {showInfo && (
          <div className="absolute top-12 left-3 z-20 w-64 bg-black/85 backdrop-blur-md rounded-xl border border-slate-700/40 p-3 pointer-events-auto shadow-2xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                <Monitor className="w-3 h-3" /> Thông số
              </div>
              <button onClick={() => setShowInfo(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="space-y-2">
              {[
                { icon: Monitor, label: 'Độ phân giải', value: videoStats.resolution },
                { icon: Gauge, label: 'Bitrate', value: formatBitrate(videoStats.bitrate) },
                { icon: Activity, label: 'FPS', value: videoStats.fps || 'N/A' },
                { icon: Wifi, label: 'Buffer', value: `${videoStats.bufferLength}s` },
                { icon: Hash, label: 'Frame rớt', value: videoStats.droppedFrames, color: videoStats.droppedFrames > 0 ? 'text-red-400' : 'text-emerald-400' },
              ].map(({ icon: Ic, label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1"><Ic className="w-3 h-3" /> {label}</span>
                  <span className={`font-semibold ${color || 'text-white'}`}>{value}</span>
                </div>
              ))}
              <div className="border-t border-slate-700/40 pt-2 mt-1">
                <div className="text-[9px] text-slate-600 mb-0.5">User-Agent</div>
                <div className="text-[9px] text-slate-400 font-mono break-all bg-black/30 rounded p-1">{VLC_USER_AGENT}</div>
              </div>
              {activeUrl && (
                <div>
                  <div className="text-[9px] text-slate-600 mb-0.5">Stream</div>
                  <div className="text-[9px] text-slate-500 font-mono break-all bg-black/30 rounded p-1 max-h-10 overflow-y-auto">{activeUrl}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quality Menu */}
        {showQualityMenu && (
          <div className="absolute top-12 right-3 z-20 w-56 bg-black/85 backdrop-blur-md rounded-xl border border-slate-700/40 p-2 pointer-events-auto shadow-2xl">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider"><Settings className="w-3 h-3" /> Chất lượng</div>
              <button onClick={() => setShowQualityMenu(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              <button onClick={() => { shakaPlayerRef.current?.switchVariant(); setSelectedTrackId(-1); setShowQualityMenu(false); resetOverlayTimer(); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${selectedTrackId === -1 ? 'bg-red-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>
                <div className="font-medium">Tự động</div>
                <div className="text-[9px] opacity-70">ADB chọn phù hợp</div>
              </button>
              {availableTracks.map(t => (
                <button key={t.id} onClick={() => selectTrack(t)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${selectedTrackId === t.id ? 'bg-red-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>
                  <div className="font-medium">{qualityLabel(t)}</div>
                  <div className="text-[9px] opacity-70">{formatBitrate(t.bandwidth)} {t.codecs && `· ${t.codecs}`}</div>
                </button>
              ))}
              {availableTracks.length === 0 && <div className="text-[10px] text-slate-500 text-center py-2">Luồng đơn chất lượng</div>}
            </div>
          </div>
        )}

        {/* Audio Menu */}
        {showAudioMenu && (
          <div className="absolute top-12 right-3 z-20 w-48 bg-black/85 backdrop-blur-md rounded-xl border border-slate-700/40 p-2 pointer-events-auto shadow-2xl">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider"><AudioLines className="w-3 h-3" /> Ngôn ngữ</div>
              <button onClick={() => setShowAudioMenu(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {audioTracks.length === 0 && <div className="text-[10px] text-slate-500 text-center py-2">Chỉ 1 ngôn ngữ</div>}
              {audioTracks.map((t) => (
                <button key={t.id} onClick={() => selectAudio(t.id)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${selectedAudioId === t.id ? 'bg-red-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Sleep Timer */}
        {showSleepTimer && (
          <div className="absolute top-12 right-3 z-20 pointer-events-auto">
            <SleepTimer onExpired={onSleepExpired} onClose={() => setShowSleepTimer(false)} />
          </div>
        )}

        {/* Volume Slider (overlay) */}
        {showVolumeSlider && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 bg-black/80 backdrop-blur-md rounded-xl border border-slate-700/40 px-4 py-2.5 flex items-center gap-3 pointer-events-auto shadow-2xl">
            <VolumeIcon className="w-4 h-4 text-slate-300 shrink-0" />
            <input
              type="range" min={0} max={100} value={isMuted ? 0 : volume}
              onChange={e => setVolumeLevel(parseInt(e.target.value))}
              className="w-40 accent-red-600 h-1"
            />
            <span className="text-[10px] text-slate-400 font-mono w-8 text-right">{isMuted ? 0 : volume}%</span>
          </div>
        )}

        {/* Channel List Panel */}
        {showChannelList && (
          <div className="absolute top-12 right-3 bottom-16 z-20 w-72 bg-black/90 backdrop-blur-md rounded-xl border border-slate-700/40 flex flex-col pointer-events-auto shadow-2xl">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/40">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider"><List className="w-3 h-3" /> DS kênh</div>
              <button onClick={() => setShowChannelList(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="px-2.5 py-1.5">
              <input type="text" placeholder="Tìm kênh..." value={channelListSearch} onChange={e => setChannelListSearch(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-800/50 border border-slate-700/40 rounded-lg text-[11px] text-slate-200 focus:outline-none focus:border-red-600/40" />
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 pb-1.5 space-y-0.5">
              {filteredChannelList.map((ch) => (
                <button key={ch.channel_id} onClick={() => { window.__chrtv_select_channel && window.__chrtv_select_channel(ch); setShowChannelList(false); resetOverlayTimer(); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all ${channel?.channel_id === ch.channel_id ? 'bg-red-600/15 border border-red-600/40 text-white' : 'hover:bg-slate-800/50 text-slate-300 border border-transparent'}`}>
                  <img src={ch.logo || ''} alt="" className="w-7 h-7 object-contain rounded bg-slate-900/60 p-0.5 shrink-0" onError={e => e.target.style.display = 'none'} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold truncate">{ch.name}</div>
                    <div className="text-[9px] text-slate-600 truncate">{ch.group_title}</div>
                  </div>
                  {channel?.channel_id === ch.channel_id && <Radio className="w-3 h-3 text-red-500 shrink-0 animate-pulse" />}
                </button>
              ))}
              {filteredChannelList.length === 0 && <div className="text-[10px] text-slate-500 text-center py-3">Không tìm thấy</div>}
            </div>
            <div className="px-3 py-1.5 border-t border-slate-700/40 text-[9px] text-slate-600 text-center">Enter mở/đóng · ↑↓ chuyển kênh</div>
          </div>
        )}

        {/* Bottom Control Bar */}
        <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5 overlay-gradient-bottom pointer-events-auto">
          {/* EPG Info */}
          <div className="mb-2 bg-black/50 backdrop-blur-sm rounded-xl p-2.5 border border-slate-700/25">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-[9px] font-semibold text-red-400 uppercase tracking-wider mb-0.5">
                  <Clock className="w-2.5 h-2.5" /> Đang phát
                </div>
                <h3 className="text-[13px] font-bold text-white truncate">{isCatchupMode && catchupProgram ? catchupProgram.title : (epgNow?.title || 'Chương trình')}</h3>
                <p className="text-[10px] text-slate-500 truncate">
                  {epgNow ? `${formatTimeHHMM(epgNow.start)} - ${formatTimeHHMM(epgNow.stop)}` : ''}
                  {epgNow?.desc && ` · ${epgNow.desc}`}
                </p>
                {epgNow && (
                  <div className="w-full bg-slate-800/80 h-1 rounded-full mt-1 overflow-hidden">
                    <div className="bg-red-600 h-full rounded-full transition-all duration-500" style={{ width: `${nowProgress}%` }} />
                  </div>
                )}
              </div>
              {epgNext && !isCatchupMode && (
                <div className="md:w-48 border-t md:border-t-0 md:border-l border-slate-700/30 pt-1.5 md:pt-0 md:pl-2.5">
                  <div className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider">Tiếp theo</div>
                  <h4 className="text-[11px] font-semibold text-slate-300 truncate">{epgNext.title}</h4>
                  <p className="text-[9px] text-slate-600">{formatTimeHHMM(epgNext.start)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button onClick={togglePlay} className="p-2 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/25">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              </button>
              <button onClick={toggleMute} className="p-2 rounded-full bg-black/50 text-slate-200 hover:bg-black/70">
                <VolumeIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setShowVolumeSlider(prev => !prev); resetOverlayTimer(); }} className="p-2 rounded-full bg-black/50 text-slate-200 hover:bg-black/70" title="Âm lượng">
                <Volume2 className="w-3.5 h-3.5" />
              </button>
              {onPrevChannel && <button onClick={onPrevChannel} className="p-2 rounded-full bg-black/50 text-slate-200 hover:bg-black/70" title="Trước (↑)"><ChevronUp className="w-3.5 h-3.5" /></button>}
              {onNextChannel && <button onClick={onNextChannel} className="p-2 rounded-full bg-black/50 text-slate-200 hover:bg-black/70" title="Sau (↓)"><ChevronDown className="w-3.5 h-3.5" /></button>}
            </div>
            <div className="flex items-center gap-1.5">
              {device.os === 'android' && (
                <button onClick={openExternalPlayer} className="p-2 rounded-full bg-black/50 text-slate-200 hover:bg-black/70" title="Mở ngoài">
                  <span className="text-[10px] font-bold">EXT</span>
                </button>
              )}
              <button onClick={takeScreenshot} className="p-2 rounded-full bg-black/50 text-slate-200 hover:bg-black/70" title="Chụp màn (S)">
                <Camera className="w-3.5 h-3.5" />
              </button>
              <button onClick={togglePiP} className="p-2 rounded-full bg-black/50 text-slate-200 hover:bg-black/70" title="PiP (P)">
                <PiP className="w-3.5 h-3.5" />
              </button>
              <div className="hidden md:flex items-center gap-0.5 text-[9px] text-slate-600 mr-1">
                <kbd className="px-0.5 py-0.5 bg-slate-800 rounded text-[8px]">Enter</kbd><span>DS</span>
                <kbd className="px-0.5 py-0.5 bg-slate-800 rounded text-[8px] ml-0.5">I</kbd><span>TS</span>
              </div>
              <button onClick={toggleFullscreen} className="p-2 rounded-full bg-black/50 text-slate-200 hover:bg-black/70">
                {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}