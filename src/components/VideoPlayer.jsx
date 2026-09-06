import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import shaka from 'shaka-player';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  AlertTriangle, Radio, Clock, ArrowLeft,
  ChevronUp, ChevronDown, RefreshCw, Signal, Info, X, List,
  Settings, Monitor, Gauge, Wifi, Activity, Hash, Timer,
  Camera, PictureInPicture2 as PiP, Volume1, Captions, AudioLines,
  Share2, Cast, Airplay, Users, Send, Smile, PartyPopper, Tv, Smartphone, Headphones, Moon, Lock, Flag, BarChart3, Minimize2, Maximize2
} from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';
import { formatTimeHHMM, calculateProgramProgress } from '../utils/dateUtils';
import SleepTimer from './SleepTimer';
import { useDevice } from '../contexts/DeviceContext';
import { useToast } from '../contexts/ToastContext';
import { useSettings } from '../contexts/SettingsContext';
import { useI18n } from '../contexts/I18nContext';
import {
  joinRoom, leaveRoom, sendPartyChat, sendPartyReaction, sendPartyState, onPartyMessage, PARTY_EMOJIS,
} from '../services/watchParty';
import { isProxiedStreamUrl, refreshStreamToken, applyStreamClientHeaders, makeStreamRequestFilter } from '../services/streamGuard';
import { UA_PRESETS, effectiveUA, getGlobalUA, setChannelUA, setGlobalUA, shortUA } from '../services/userAgent';
import { sendFeedback } from '../services/feedback';
import { maskScores } from '../utils/spoiler';
import { parseEpgDate } from '../utils/dateUtils';

const FALLBACK_STREAM_URL_HTTP = "http://bore.pub:30113/hls/index.m3u8";
const FALLBACK_STREAM_URL = (typeof window !== 'undefined' && window.location?.protocol === 'https:')
  ? `/api/proxy?url=${encodeURIComponent("http://bore.pub:30113/hls/index.m3u8")}`
  : FALLBACK_STREAM_URL_HTTP;
const VLC_USER_AGENT = "VLC/3.0.21 LibVLC/3.0.21";


function HoldToUnlock({ onUnlock }) {
  const t = React.useRef(null);
  const [hot, setHot] = React.useState(false);
  const start = () => { setHot(true); t.current = setTimeout(() => { setHot(false); onUnlock && onUnlock(); }, 1000); };
  const cancel = () => { setHot(false); if (t.current) clearTimeout(t.current); };
  React.useEffect(() => () => { if (t.current) clearTimeout(t.current); }, []);
  return <button onPointerDown={start} onPointerUp={cancel} onPointerLeave={cancel} className={`px-6 py-3 rounded-2xl font-bold text-sm transition-all ${hot ? 'bg-emerald-500 text-white scale-95' : 'bg-white/10 text-white border border-white/20'}`}>Nhấn giữ để mở khoá</button>;
}

function formatBytes(b) { if (!b) return '0 B'; const k=1024, s=['B','KB','MB','GB']; const i=Math.floor(Math.log(b)/Math.log(k)); return (b/Math.pow(k,i)).toFixed(1)+' '+s[i]; }
function formatBitrate(bps) { if (!bps) return 'N/A'; if (bps>=1e6) return (bps/1e6).toFixed(1)+' Mbps'; if (bps>=1e3) return (bps/1e3).toFixed(0)+' Kbps'; return bps+' bps'; }

export default function VideoPlayer({
  channel, streamUrl, epgNow, epgNext,
  isCatchupMode = false, catchupProgram = null,
  onNextChannel, onPrevChannel, onClose,
  allChannels = [], onOpenSettings,
  epgLookup = null,           // (channelId) => {now, next} - strip "kenh khac dang chieu gi"
  initialPartyRoom = null,    // vao thang phong party tu deep link ?party=
  currentUserName = 'Khach',
  mini = false,               // mini-player thu nhỏ
  onMinimize = null, onExpand = null,
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
  const streamFilterRef = useRef(null);  // filter xoay token manifest theo kênh/điểm bắt đầu hiện tại
  const tokenRetryRef = useRef(false);   // chỉ tự xoay token lại 1 lần mỗi lần load
  const activeUrlRef = useRef(activeUrl);
  activeUrlRef.current = activeUrl;

  const [showInfo, setShowInfo] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showChannelList, setShowChannelList] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showUAMenu, setShowUAMenu] = useState(false);
  const [uaTick, setUaTick] = useState(0); // ép re-render khi đổi UA
  const [customUA, setCustomUA] = useState('');
  const [radioMode, setRadioMode] = useState(false);
  const [nightMode, setNightMode] = useState(false);
  const [kidLocked, setKidLocked] = useState(false);
  const [playRate, setPlayRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportMsg, setReportMsg] = useState('');
  const [reportType, setReportType] = useState('Kênh không phát được');
  const [netInfo, setNetInfo] = useState({ downlink: 0, rtt: 0, type: '' });
  const [partyTab, setPartyTab] = useState('party'); // 'party' | 'channel'
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollDraft, setPollDraft] = useState({ q: '', opts: ['', ''] });
  const lastPosSave = useRef(0);
  const uaOverrideRef = useRef('');
  // UA hiệu lực: override user > '' (server tự dùng UA kênh/VLC)
  const channelRequiredUA = channel?.user_agent || '';
  const currentUAOverride = (() => { try { return effectiveUA(channel); } catch { return ''; } })();
  const displayUA = currentUAOverride || channelRequiredUA || 'VLC/3.0.21 LibVLC/3.0.21';

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

  // Data saver (ep <=480p) — bat trong Settings/quality menu
  const { settings, updateSetting } = useSettings();
  const dataSaver = !!settings.dataSaver;
  const dataSaverCap = Number(settings.dataSaverCap || 480);

  // Watch party + reactions
  const [showParty, setShowParty] = useState(!!initialPartyRoom);
  const [partyRoom, setPartyRoom] = useState(initialPartyRoom || '');
  const [isHost, setIsHost] = useState(!initialPartyRoom); // nguoi mo phong = host
  const [partyChat, setPartyChat] = useState([]);
  const [partyText, setPartyText] = useState('');
  const [partyMembers, setPartyMembers] = useState([]);
  const [reactions, setReactions] = useState([]); // emoji bay
  const [showEpgStrip, setShowEpgStrip] = useState(false);
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const chatEndRef = useRef(null);

  const overlayTimerRef = useRef(null);
  const statsIntervalRef = useRef(null);
  const volumeTimerRef = useRef(null);
  const sleepTimerRef = useRef(null);

  const device = useDevice();
  const { addToast } = useToast();
  const { t } = useI18n();

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
      setShowUAMenu(false);
      setShowAudioMenu(false);
      setShowSubtitleMenu(false);
      setShowSpeedMenu(false);
      setShowReport(false);
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

  // ============ DATA SAVER: gioi han do phan qua lai <=480p ============
  useEffect(() => {
    const p = shakaPlayerRef.current;
    if (!p) return;
    try {
      p.configure({ abr: { maxHeight: dataSaver ? dataSaverCap : undefined } });
      // Neu dang phat qua cao -> ha xuong ban ghi phu hop
      const tracks = p.getVariantTracks?.() || [];
      if (dataSaver) {
        const active = tracks.find(t => t.active);
        if (active && active.height && active.height > dataSaverCap) {
          const best = tracks.filter(t => t.height && t.height <= dataSaverCap).sort((a, b) => b.height - a.height)[0];
          if (best) { p.selectVariantTrack(best); addToast(`Tiết kiệm data: hạ về ${best.height}p`, 'info'); }
        }
      }
    } catch {}
  }, [dataSaver, dataSaverCap, addToast]);

  // ============ WATCH PARTY + CHAT KÊNH (D1 + polling) ============
  const channelRoom = channel?.channel_id ? `live:${channel.channel_id}` : '';
  const activeRoomRef = useRef('');
  // Host: gui trang thai moi khi doi kenh; Guest: nhan state -> tu doi kenh theo host
  useEffect(() => {
    const room = partyTab === 'channel' ? channelRoom : partyRoom;
    activeRoomRef.current = room;
    if (!room) return undefined;
    setPartyChat([]); setPartyMembers([]);
    joinRoom(room, currentUserName, partyTab === 'party' && isHost);
    const off = onPartyMessage((msg) => {
      if (msg.room && activeRoomRef.current && msg.room !== activeRoomRef.current) return;
      if (msg.type === 'presence') {
        setPartyMembers(msg.members || []);
      } else if (msg.type === 'chat') {
        setPartyChat((prev) => [...prev.slice(-80), { from: msg.from || '?', text: msg.text, sys: !!msg.sys }]);
      } else if (msg.type === 'reaction') {
        const id = Date.now() + Math.random();
        setReactions((prev) => [...prev.slice(-14), { id, emoji: msg.emoji, from: msg.from }]);
        setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 3500);
      } else if (msg.type === 'state' && !isHost && msg.state) {
        // Guest tu dong theo kenh host dang xem (kem luc vao phong giua chang)
        const st = msg.state;
        if (st.channelId && st.channelId !== channel?.channel_id) {
          const ch = (allChannels || []).find((c) => c.channel_id === st.channelId);
          if (ch && window.__chrtv_select_channel) window.__chrtv_select_channel(ch);
        }
      }
    });
    return () => { off(); leaveRoom(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyRoom, partyTab, channel?.channel_id]);

  // Host phat tin hieu khi doi kenh
  useEffect(() => {
    if (isHost && partyRoom && partyTab === 'party' && channel) {
      sendPartyState({ channelId: channel.channel_id, channelName: channel.name });
    }
  }, [isHost, partyRoom, partyTab, channel?.channel_id]);

  const createParty = () => {
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    setPartyRoom(`party:${code}`);
    setIsHost(true);
    setShowParty(true);
    setPartyTab('party');
    setPartyChat([]);
    // Effect [partyRoom] sẽ gọi joinRoom(room, name, isHost=true)
    addToast(`Đã tạo phòng ${code} — chia sẻ link cho bạn bè!`, 'success');
  };

  const joinParty = (code) => {
    const room = code.startsWith('party:') ? code : `party:${code.trim().toUpperCase()}`;
    setPartyRoom(room);
    setIsHost(false);
    setShowParty(true);
    setPartyTab('party');
    setPartyChat([]);
    addToast(`Đã vào phòng ${room.replace('party:', '')}`, 'success');
  };

  const leaveParty = () => {
    leaveRoom();
    setPartyRoom('');
    setPartyMembers([]);
    setPartyChat([]);
    setShowParty(false);
  };

  // Vote nhanh trong party: mã hoá qua chat (không cần API mới)
  const POLL_PREFIX = '◈POLL:';
  const VOTE_PREFIX = '◈VOTE:';
  const polls = useMemo(() => {
    const map = new Map();
    for (const c of partyChat) {
      if (c.sys || !c.text) continue;
      if (c.text.startsWith(POLL_PREFIX)) {
        try { const q = JSON.parse(c.text.slice(POLL_PREFIX.length)); if (q && q.id && Array.isArray(q.opts)) map.set(q.id, { ...q, from: c.from, votes: {} }); } catch {}
      } else if (c.text.startsWith(VOTE_PREFIX)) {
        const m = c.text.slice(VOTE_PREFIX.length).split(':');
        const poll = map.get(m[0]);
        if (poll) poll.votes[c.from] = Number(m[1]) || 0;
      }
    }
    return [...map.values()].slice(-2);
  }, [partyChat]);
  const myVotes = useMemo(() => {
    const v = {};
    for (const c of partyChat) {
      if (c.text && c.text.startsWith(VOTE_PREFIX) && c.from === currentUserName) {
        const m = c.text.slice(VOTE_PREFIX.length).split(':');
        v[m[0]] = Number(m[1]) || 0;
      }
    }
    return v;
  }, [partyChat, currentUserName]);
  const sendPoll = useCallback(() => {
    const q = pollDraft.q.trim();
    const opts = pollDraft.opts.map(o => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) { addToast('Nhập câu hỏi + ít nhất 2 lựa chọn', 'error'); return; }
    sendPartyChat(POLL_PREFIX + JSON.stringify({ id: Date.now().toString(36), q: q.slice(0, 80), opts: opts.slice(0, 4).map(o => o.slice(0, 30)) }));
    setPollDraft({ q: '', opts: ['', ''] });
    setShowPollForm(false);
    resetOverlayTimer();
  }, [pollDraft, addToast, resetOverlayTimer]);
  const votePoll = useCallback((id, idx) => {
    sendPartyChat(`${VOTE_PREFIX}${id}:${idx}`);
    resetOverlayTimer();
  }, [resetOverlayTimer]);

  const react = (emoji) => {
    sendPartyReaction(emoji);
    const id = Date.now() + Math.random();
    setReactions((prev) => [...prev.slice(-14), { id, emoji, from: currentUserName }]);
    setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== id)), 3500);
    resetOverlayTimer();
  };

  const submitReport = useCallback(async () => {
    try {
      await sendFeedback({ channel_id: channel?.channel_id, message: `[${reportType}] ${channel?.name || ''}${reportMsg ? ' — ' + reportMsg : ''}`.slice(0, 500), upstreamUA: displayUA, program: epgNow?.title || '' });
      addToast('Đã gửi báo lỗi — cảm ơn bạn!', 'success');
      setShowReport(false); setReportMsg('');
    } catch { addToast('Gửi báo lỗi thất bại — thử lại nhé', 'error'); }
    resetOverlayTimer();
  }, [channel, reportType, reportMsg, displayUA, epgNow, addToast, resetOverlayTimer]);

  // ============ SHARE DEEP LINK ============
  const shareChannel = useCallback(async () => {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({ channel: channel?.channel_id || '' });
    if (partyRoom) params.set('party', partyRoom.replace('party:', ''));
    const url = `${base}?${params.toString()}`;
    try {
      if (navigator.share) await navigator.share({ title: channel?.name || 'CHRTV PLAY', url });
      else {
        await navigator.clipboard.writeText(url);
        addToast(t('player.copy_link'), 'success');
      }
    } catch {}
    resetOverlayTimer();
  }, [channel, partyRoom, addToast, resetOverlayTimer]);

  // ============ CHROMECAST / AIRPLAY ============
  const loadCastSdk = () => new Promise((resolve) => {
    if (window.cast?.framework) return resolve(true);
    if (document.getElementById('chrtv-cast-sdk')) return resolve(false);
    const s = document.createElement('script');
    s.id = 'chrtv-cast-sdk';
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });

  const toggleCast = useCallback(async () => {
    addToast('Đang tìm thiết bị Cast…', 'info');
    const ok = await loadCastSdk();
    if (!ok || !window.cast?.framework) { addToast('Chromecast không khả dụng (cần Chrome)', 'error'); return; }
    try {
      const context = window.cast.framework.CastContext.getInstance();
      context.setOptions({
        receiverApplicationId: (window.chrome?.cast?.media && window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID) || 'CC1AD845',
        autoJoinPolicy: 'any',
      });
      await context.requestSession();
      const session = context.getCurrentSession();
      if (session) {
        const mimeType = isMpdUrl(activeUrl) ? 'application/dash+xml' : 'application/x-mpegurl';
        const mediaInfo = new window.chrome.cast.media.MediaInfo(activeUrl, mimeType);
        mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
        mediaInfo.metadata.title = channel?.name || 'CHRTV PLAY';
        const req = new window.chrome.cast.media.LoadRequest(mediaInfo);
        await session.loadMedia(req);
        addToast(`Đang chiếu ${channel?.name || ''} lên TV 📺`, 'success');
      }
    } catch (e) { addToast('Không kết nối được Cast', 'error'); }
    resetOverlayTimer();
  }, [activeUrl, channel, addToast, resetOverlayTimer, isMpdUrl]);

  const toggleAirPlay = useCallback(() => {
    const v = videoRef.current;
    if (v && v.webkitShowPlaybackTargetPicker) {
      v.webkitShowPlaybackTargetPicker();
    } else {
      addToast('AirPlay chỉ hỗ trợ trên Safari (iPhone/iPad/Mac)', 'info');
    }
    resetOverlayTimer();
  }, [addToast, resetOverlayTimer]);

  const hasAirPlay = typeof window !== 'undefined' && !!(HTMLVideoElement.prototype && HTMLVideoElement.prototype.webkitShowPlaybackTargetPicker);


  // Initialize Shaka Player + load stream
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    
    // === 1. Create player if first time ===
    let player = shakaPlayerRef.current;
    if (!player) {
      player = new shaka.Player(videoEl);
      shakaPlayerRef.current = player;
      player.configure({
        streaming: { rebufferingGoal: 2, bufferingGoal: 10, bufferBehind: 15, lowLatencyMode: true },
        abr: { enabled: true, defaultBandwidthEstimate: 2000000 },
        manifest: { retryParameters: { maxAttempts: 3, baseDelay: 1000, backoffFactor: 2 }, dash: { disableXlinkProcessing: true, xlinkFailGracefully: true, ignoreMinBufferTime: true } },
        drm: { clearKeys: {}, retryParameters: { maxAttempts: 3, baseDelay: 500, backoffFactor: 2 } },
      });
      // Định danh client CHRTV-OTT/0.0.1 cho mọi request + filter TỰ ĐỘNG XOAY
      // token manifest (P0-A): token còn < 25s thì xin token MỚI từ server và
      // rewrite t= trước khi fetch — phát liên tục không gián đoạn.
      const net = player.getNetworkingEngine();
      if (net) {
        net.registerRequestFilter((type, req) => {
          applyStreamClientHeaders(req.headers);
          const f = streamFilterRef.current;
          if (f) { try { return f(type, req); } catch (e) { return true; } }
          return true;
        });
      }
    }

    const targetUrl = streamUrl || FALLBACK_STREAM_URL;
    setActiveUrl(targetUrl);
    setIsFallbackActive(false);
    setErrorMessage(null);
    setIsBuffering(true);

    // === 2. Đặt filter xoay token + header upstream UA cho lần load này ===
    // Ưu tiên override của user (chọn trong player, lưu localStorage) — fix kênh cần Dalvik
    let userUaOverride = '';
    try { userUaOverride = effectiveUA(channel); } catch {}
    uaOverrideRef.current = userUaOverride;
    const channelUa = userUaOverride || channel?.user_agent;
    let catchupAt = 0;
    if (isCatchupMode && catchupProgram?.start) {
      try { catchupAt = Math.floor(parseEpgDate(catchupProgram.start).getTime() / 1000); } catch (e) {}
    }
    streamFilterRef.current = makeStreamRequestFilter(channel, catchupAt);
    tokenRetryRef.current = false;
    try {
      const ne = player.getNetworkingEngine();
      if (ne) {
        ne.clearRequestFilters();
        ne.registerRequestFilter((type, req) => {
          applyStreamClientHeaders(req.headers);
          const liveUa = uaOverrideRef.current || channel?.user_agent || '';
          if (liveUa) { try { req.headers['X-CHRTV-Upstream-UA'] = liveUa; } catch (e) {} }
          const f = streamFilterRef.current; // delegate xoay token (đọc ref — luôn đúng phiên load)
          if (f) { try { return f(type, req); } catch (e) { return true; } }
          return true;
        });
      }
    } catch (e) {}

    // === 3. Load stream with appropriate config ===
    const startLoad = async () => {
      try {
        // URL phát do App xin từ /api/stream/token (proxy_url chứa playback token
        // HMAC, TTL 60s, server rewrite playlist con mỗi lần phát) — client
        // KHÔNG tự build URL stream, KHÔNG còn stream_url gốc.
        const url = targetUrl;
        
        // ClearKey t? URL ho?c t? channel (M3U #KODIPROP)
        let clearKey = parseClearKey(url);
        const ckId = channel?.clearKeyId || channel?.clear_key_id;
        const ckKey = channel?.clearKey || channel?.clear_key;
        if (!clearKey && ckId && ckKey) {
          try {
            clearKey = { keyId: hexToUint8(String(ckId)), key: hexToUint8(String(ckKey)) };
          } catch {}
        }
        if (clearKey) {
          try { player.configure({ drm: { clearKeys: { [ab2hex(clearKey.keyId)]: ab2hex(clearKey.key) } } }); } catch (e) {}
        } else {
          try { player.configure({ drm: { clearKeys: {} } }); } catch (e) {}
        }

        // C?u hình manifest MPD n?u c?n
        if (isMpdUrl(url) || channel?.manifest_type === 'mpd') {
          try { player.configure({ manifest: { dash: { disableXlinkProcessing: true, xlinkFailGracefully: true } } }); } catch (e) {}
        }

        await player.load(url);
        // Xem tiếp: khôi phục vị trí xem dở (catchup)
        try {
          const pk = (isCatchupMode && catchupProgram && channel) ? `${channel.channel_id}|${catchupProgram.start}` : '';
          const saved = pk ? JSON.parse(localStorage.getItem('chrtv_pos') || '{}') : null;
          if (saved && saved.key === pk && saved.t > 15) {
            const applySeek = () => { try { if (videoEl.duration && saved.t < videoEl.duration - 20) { videoEl.currentTime = saved.t; addToast(`Xem tiếp từ ${new Date(saved.t * 1000).toISOString().slice(11, 19)}`, 'info'); } } catch {} };
            if (videoEl.readyState >= 1) applySeek();
            else videoEl.addEventListener('loadedmetadata', applySeek, { once: true });
          }
        } catch {}
        videoEl.play().catch(() => setIsPlaying(false));
        setIsBuffering(false);
        try {
          const tracks = player.getVariantTracks();
          setAvailableTracks(tracks);
          const active = tracks.find(t => t.active);
          if (active) setSelectedTrackId(active.id);
          const audios = player.getAudioLanguages ? player.getAudioLanguages() : [];
          setAudioTracks(audios.map((lang, i) => ({ id: i, label: lang || `Track ${i + 1}` })));
          const texts = player.getTextLanguages ? player.getTextLanguages() : [];
          setTextTracks(texts.map((lang, i) => ({ id: i, label: lang || `CC ${i + 1}` })));
        } catch {}
      } catch (err) {
        const errText = String(err?.message || err?.code || err || '');
        // Bị chặn theo gói/đăng nhập — hiện thông báo, KHÔNG tự fallback (tránh lách)
        if (/LOGIN_REQUIRED/.test(errText)) {
          setIsBuffering(false);
          setErrorMessage('🔒 Kênh này cần đăng nhập để xem — đóng trình phát rồi đăng nhập/đăng ký (miễn phí).');
          return;
        }
        if (/PLAN_REQUIRED/.test(errText)) {
          setIsBuffering(false);
          setErrorMessage('💎 Kênh thuộc gói cao hơn — vào mục Mua Gói kích hoạt (tạm miễn phí).');
          return;
        }
        // Token hết hạn/bị từ chối → xin token MỚI từ server, load lại đúng 1 lần
        if (isProxiedStreamUrl(targetUrl) && /TOKEN_|401|403|token/i.test(errText) && !tokenRetryRef.current) {
          try {
            let at = 0;
            if (isCatchupMode && catchupProgram?.start) {
              try { at = Math.floor(parseEpgDate(catchupProgram.start).getTime() / 1000); } catch (e2) {}
            }
            tokenRetryRef.current = true;
            const retryUrl = await refreshStreamToken(channel, at);
            if (retryUrl && !player.destroyed()) {
              setActiveUrl(retryUrl);
              await player.load(retryUrl);
              videoEl.play().catch(() => {});
              setIsBuffering(false); setIsFallbackActive(false); setErrorMessage(null);
              return;
            }
          } catch (e) {
            if (e?.code === 'LOGIN_REQUIRED') setErrorMessage('Cần đăng nhập để xem kênh này');
            else if (e?.code === 'PLAN_REQUIRED') setErrorMessage('Kênh này thuộc gói cao hơn — vào Mua Gói để xem');
          }
          /* rơi xuống fallback bên dưới */
        }
        // MPD fails → try fallback HLS (không proxy, proxy không handle MPD segments)
        const isMpd = isMpdUrl(targetUrl) || channel?.manifest_type === 'mpd';
        if (isMpd && !targetUrl.includes('bore.pub')) {
          setIsFallbackActive(true);
          setErrorMessage("MPD không phát được. Đã chuyển sang HLS dự phòng.");
          try { await player.load(FALLBACK_STREAM_URL); videoEl.play().catch(() => {}); setIsBuffering(false); }
          catch { setErrorMessage("Không thể kết nối MPD và cả HLS dự phòng."); setIsBuffering(false); }
        } else {
          setIsFallbackActive(true);
          setErrorMessage("Luồng chính gián đoạn, chuyển dự phòng...");
          try { await player.load(FALLBACK_STREAM_URL); videoEl.play().catch(() => {}); setIsBuffering(false); }
          catch { setErrorMessage("Không thể kết nối."); setIsBuffering(false); }
        }
      }
    };

    startLoad();
    
    // === 4. Event listeners ===
    const onBuf = (e) => setIsBuffering(e.buffering);
    const onTracks = () => {
      try {
        const t = player.getVariantTracks();
        setAvailableTracks(t);
        const a = t.find(x => x.active);
        if (a) setSelectedTrackId(a.id);
      } catch {}
    };
    player.addEventListener('buffering', onBuf);
    player.addEventListener('trackschanged', onTracks);

    // P0-A: manifest token hết hạn giữa chừng (TOKEN_EXPIRED) → xin token MỚI,
    // load lại MỘT LẦN (không lặp vô hạn).
    const onFatalError = async (e) => {
      const detail = (e && e.detail) || {};
      const code = detail.code || '';
      const httpStatus = detail.status || (e && e.status) || 0;
      const isTokenIssue =
        /TOKEN_(INVALID|EXPIRED|SID_MISMATCH|USER_MISMATCH|SCOPE)|PLAN_REQUIRED|LOGIN_REQUIRED/.test(code) ||
        [401, 403].includes(httpStatus);
      if (!isTokenIssue || tokenRetryRef.current) return;
      const u = activeUrlRef.current;
      if (!isProxiedStreamUrl(u)) return;
      tokenRetryRef.current = true;
      try {
        let at = 0;
        if (isCatchupMode && catchupProgram?.start) {
          try { at = Math.floor(parseEpgDate(catchupProgram.start).getTime() / 1000); } catch (e2) {}
        }
        const fresh = await refreshStreamToken(channel, at);
        if (fresh && shakaPlayerRef.current && !player.destroyed()) {
          setActiveUrl(fresh);
          try { await player.load(fresh); } catch (e3) {}
        }
      } catch (e2) {
        if (e2 && e2.code === 'LOGIN_REQUIRED') {
          setErrorMessage('Cần đăng nhập để xem kênh này');
        } else if (e2 && e2.code === 'PLAN_REQUIRED') {
          setErrorMessage('Kênh này thuộc gói cao hơn — vào Mua Gói để xem');
        }
      }
    };
    player.addEventListener('error', onFatalError);

    return () => {
      if (player) {
        player.removeEventListener('buffering', onBuf);
        player.removeEventListener('trackschanged', onTracks);
        player.removeEventListener('error', onFatalError);
      }
    };
  }, [streamUrl, parseClearKey, channel?.clearKeyId, channel?.clearKey, channel?.clear_key_id, channel?.clear_key, channel?.user_agent, channel?.manifest_type]);

  // Mạng realtime (Network Information API)
  useEffect(() => {
    const read = () => { try { const c = navigator.connection; if (c) setNetInfo({ downlink: c.downlink || 0, rtt: c.rtt || 0, type: c.effectiveType || '' }); } catch {} };
    read();
    try { navigator.connection?.addEventListener('change', read); } catch {}
  }, []);

  // Lưu vị trí xem dở (catchup) mỗi 5s
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const onTime = () => {
      if (!isCatchupMode || !catchupProgram || !channel) return;
      const now = Date.now();
      if (now - lastPosSave.current < 5000) return;
      lastPosSave.current = now;
      try { localStorage.setItem('chrtv_pos', JSON.stringify({ key: `${channel.channel_id}|${catchupProgram.start}`, t: Math.floor(v.currentTime || 0) })); } catch {}
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [isCatchupMode, catchupProgram, channel]);

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
  const seekBy = useCallback((sec) => {
    const v = videoRef.current;
    if (!v) return;
    if (!isCatchupMode) { addToast && addToast('Tua nhanh/chậm chỉ dùng cho xem lại', 'info'); return; }
    try { v.currentTime = Math.max(0, Math.min((v.duration || 1e9) - 1, v.currentTime + sec)); } catch {}
    resetOverlayTimer();
  }, [isCatchupMode, addToast, resetOverlayTimer]);

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
    addToast && addToast(t('player.sleep_done'), 'info');
  }, [addToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Dang go trong input/textarea (chat party, tim kiem) -> khong bat phim tat player
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        if (e.key === 'Escape' && e.target.blur) e.target.blur();
        return;
      }
      if (kidLocked) { e.preventDefault(); return; }
      resetOverlayTimer();
      const key = e.key;
      switch (key) {
        case 'MediaPlayPause': case ' ': e.preventDefault(); togglePlay(); break;
        case 'ArrowUp': if (onPrevChannel) onPrevChannel(); break;
        case 'ArrowDown': if (onNextChannel) onNextChannel(); break;
        case 'Enter': setShowChannelList(prev => !prev); break;
        case 'i': case 'I': setShowInfo(prev => !prev); break;
        case 'm': case 'M': toggleMute(); addToast && addToast(isMuted ? t('player.unmute') : t('player.mute'), 'volume'); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'p': case 'P': togglePiP(); break;
        case 's': case 'S': takeScreenshot(); break;
        case 'j': case 'J': seekBy(-10); break;
        case 'l': case 'L': seekBy(10); break;
        case '?': case '/': if (e.shiftKey) { /* open shortcuts */ } break;
        case 'Escape': case 'BackSpace':
          if (showChannelList) setShowChannelList(false);
          else if (showInfo) setShowInfo(false);
          else if (showQualityMenu) setShowQualityMenu(false);
          else if (showUAMenu) setShowUAMenu(false);
          else if (showSleepTimer) setShowSleepTimer(false);
          else if (showVolumeSlider) setShowVolumeSlider(false);
          else if (showSpeedMenu) setShowSpeedMenu(false);
          else if (showReport) setShowReport(false);
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
  }, [resetOverlayTimer, onPrevChannel, onNextChannel, onClose, showChannelList, showInfo, showQualityMenu, showUAMenu, showSleepTimer, showVolumeSlider, isMuted, addToast, togglePiP, takeScreenshot, allChannels, seekBy, kidLocked]);

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
          if (dx > 50) addToast && addToast(t('player.ff'), 'info');
          else if (dx < -50) addToast && addToast(t('player.rw'), 'info');
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

  // ============ UA UPSTREAM (Dalvik fix) ============
  // Đổi UA rồi tải lại luồng với token mới — không cần thoát player
  const reloadWithUA = useCallback(async (ua) => {
    const clean = String(ua || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 300);
    try { setChannelUA(channel?.channel_id, clean); } catch {}
    try { uaOverrideRef.current = clean || effectiveUA(channel); } catch { uaOverrideRef.current = clean; }
    setUaTick((x) => x + 1);
    setShowUAMenu(false);
    resetOverlayTimer();
    const p = shakaPlayerRef.current;
    if (!p || p.destroyed()) return;
    setIsBuffering(true);
    setErrorMessage(null);
    try {
      let at = 0;
      if (isCatchupMode && catchupProgram?.start) {
        try { at = Math.floor(parseEpgDate(catchupProgram.start).getTime() / 1000); } catch {}
      }
      tokenRetryRef.current = false;
      const fresh = await refreshStreamToken(channel, at);
      const url = fresh || activeUrlRef.current;
      if (url) {
        setActiveUrl(url);
        await p.load(url);
        videoRef.current?.play().catch(() => {});
        addToast(clean ? `Đã đổi UA → ${clean.slice(0, 40)}` : 'Đã về chế độ Tự động (theo kênh)', 'success');
      }
    } catch (e) {
      setErrorMessage('Đổi UA xong nhưng tải lại thất bại — thử UA khác.');
    } finally {
      setIsBuffering(false);
    }
  }, [channel, isCatchupMode, catchupProgram, addToast, resetOverlayTimer]);

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
      {mini && onMaximize && (
        <div data-mini-drag className="absolute top-0 left-0 right-0 z-50 flex items-center gap-2 px-3 py-2 bg-slate-900/95 border-b border-slate-700/40 cursor-move">
          <span className="text-sm">📌</span>
          <span className="text-xs text-slate-200 font-semibold truncate flex-1">Mini: {channelName}</span>
          <button onClick={onMaximize} className="px-2.5 py-1 bg-[#f36f21] hover:bg-[#ff9a3d] text-white text-[11px] font-bold rounded-lg flex items-center gap-1"><Maximize2 className="w-3 h-3" /> Mở lại</button>
        </div>
      )}
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

      {/* Radio / night layers */}
      {radioMode && (
        <div className="absolute inset-0 z-10 bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-900 flex flex-col items-center justify-center pointer-events-none">
          <HoldToUnlock onUnlock={() => setRadioMode(false)} icon={Headphones} label="giữ 2s để bật hình lại" buttonLabel="Bật hình lại" hint="Chế độ radio: chỉ nghe tiếng, tiết kiệm pin" />
          <div className="mt-4 flex items-center gap-1.5 justify-center">
            {[0, 1, 2, 3, 4, 5, 6].map(i => <div key={i} className="w-1.5 bg-cyan-400/70 rounded-full anim-eq" style={{ height: 16 + (i % 3) * 10, animationDelay: `${i * 0.12}s` }}></div>)}
          </div>
          <p className="text-cyan-200/80 text-sm font-semibold mt-3">{channelName}</p>
        </div>
      )}
      {nightMode && <div className="absolute inset-0 z-10 bg-indigo-950/45 pointer-events-none mix-blend-multiply"></div>}

      {/* Buffering */}
      {isBuffering && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-20">
          <div className="w-12 h-12 border-[3px] border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
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
        <div className="absolute top-14 left-3 z-30 bg-[#f36f21]/90 text-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg max-w-[280px]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="text-[10px] font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Channel Quick-Switch OSD */}
      {quickSwitch && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 bg-black/80 backdrop-blur-sm rounded-2xl px-6 py-4 flex items-center gap-4 shadow-2xl anim-pop-fast border border-slate-700/40">
          {quickSwitch.logo && <img src={quickSwitch.logo} alt="" className="w-14 h-14 object-contain rounded-xl" onError={e => e.target.style.display='none'} />}
          <div>
            <div className="text-sm font-bold text-white">{quickSwitch.name}</div>
            <div className="text-[10px] text-slate-400">{quickSwitch.group_title}</div>
          </div>
        </div>
      )}

      {/* Kid lock */}
      {kidLocked && (
        <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-[1px] flex items-center justify-center" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <div className="text-center px-6">
            <div className="text-5xl mb-3">🔒</div>
            <p className="text-white font-bold mb-1">Màn hình đã khoá</p>
            <p className="text-slate-400 text-xs mb-4">Chống bé bấm nhầm · Giữ nút 2 giây để mở</p>
            <HoldToUnlock onUnlock={() => setKidLocked(false)} icon={Lock} label="giữ 2s để mở khoá" buttonLabel="Mở khoá" />
          </div>
        </div>
      )}

      {/* Overlay UI */}
      <div className={`absolute inset-0 z-10 transition-opacity duration-300 pointer-events-none ${showOverlay && !kidLocked ? 'opacity-100' : 'opacity-0'}`}>

        {/* Top Header */}
        <div className="absolute top-0 left-0 right-0 px-3 py-2.5 overlay-gradient-top flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-2.5">
            {onClose && (
              <button onClick={onClose} className="p-2 rounded-full bg-black/50 hover:bg-[#f36f21]/80 text-white transition-all">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            {channel?.logo && <img src={channel.logo} alt={channel.name} className="w-9 h-9 object-contain rounded-lg bg-black/50 p-1" onError={e => e.target.style.display='none'} />}
            <div>
              <h2 className="text-sm font-bold text-white leading-tight">{channel?.name || 'Truyền hình'}</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                {channel?.group_title && <span className="px-1 py-px text-[9px] font-semibold rounded bg-slate-700/80 text-slate-300">{channel.group_title}</span>}
                {isCatchupMode ? (
                  <span className="px-1 py-px text-[9px] font-semibold rounded bg-purple-600/80 text-white flex items-center gap-0.5"><Clock className="w-2 h-2" /> {t('player.replay')}</span>
                ) : (
                  <span className="px-1 py-px text-[9px] font-semibold rounded bg-[#f36f21] text-white flex items-center gap-0.5"><Radio className="w-2 h-2 animate-pulse" /> LIVE</span>
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
            <button onClick={shareChannel} className="p-1.5 rounded-full bg-black/50 text-slate-300 hover:bg-black/70 transition-all" title="Chia sẻ kênh (deep link)">
              <Share2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={toggleCast} className="p-1.5 rounded-full bg-black/50 text-slate-300 hover:bg-black/70 transition-all hidden md:block" title="Chiếu lên Chromecast">
              <Cast className="w-3.5 h-3.5" />
            </button>
            {hasAirPlay && (
              <button onClick={toggleAirPlay} className="p-1.5 rounded-full bg-black/50 text-slate-300 hover:bg-black/70 transition-all" title="AirPlay">
                <Airplay className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={() => { setShowParty(prev => !prev); setShowEpgStrip(false); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showParty ? 'bg-purple-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title={t('player.watching_together')}>
              <Users className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => { setShowEpgStrip(prev => !prev); setShowParty(false); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showEpgStrip ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title="Kênh khác đang chiếu gì">
              <Tv className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setRadioMode(v => !v); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${radioMode ? 'bg-cyan-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title="Chế độ nghe radio (tắt hình, chỉ tiếng)">
              <Headphones className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setNightMode(v => !v); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${nightMode ? 'bg-indigo-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title="Chế độ xem đêm (dịu mắt)">
              <Moon className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setKidLocked(true); resetOverlayTimer(); }} className="p-1.5 rounded-full bg-black/50 text-slate-300 hover:bg-black/70 transition-all" title="Khoá trẻ em (chống bấm nhầm)">
              <Lock className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowReport(v => !v); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showReport ? 'bg-amber-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title="Báo lỗi kênh">
              <Flag className="w-3.5 h-3.5" />
            </button>
            {onMinimize && !mini && (
              <button onClick={(e) => { e.stopPropagation(); onMinimize(); }} className="p-1.5 rounded-full bg-black/50 text-slate-300 hover:bg-black/70 transition-all" title="Thu nhỏ (vừa xem vừa lướt)">
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); if (textTracks.length > 1) { setShowSubtitleMenu(prev => !prev); setShowAudioMenu(false); setShowQualityMenu(false); } else { toggleSubtitles(); } resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showSubtitleMenu ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title={t('player.subtitles')}>
              <Captions className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowQualityMenu(prev=>!prev); setShowAudioMenu(false); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showQualityMenu ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`}>
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowUAMenu(prev=>!prev); setShowQualityMenu(false); setShowAudioMenu(false); setShowSubtitleMenu(false); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all flex items-center gap-1 ${showUAMenu || currentUAOverride ? 'bg-emerald-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title={`User-Agent upstream: ${displayUA} (bấm để đổi — nhiều kênh cần Dalvik)`}>
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[8px] font-bold hidden lg:inline max-w-[64px] truncate">{shortUA(displayUA)}</span>
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowInfo(prev=>!prev); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showInfo ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`}>
              <Info className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowChannelList(prev=>!prev); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showChannelList ? 'bg-blue-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`}>
              <List className="w-3.5 h-3.5" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowSleepTimer(prev=>!prev); resetOverlayTimer(); }} className={`p-1.5 rounded-full transition-all ${showSleepTimer ? 'bg-amber-600 text-white' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`} title={t('player.sleep')}>
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
          <div className="absolute top-12 left-3 z-20 w-64 bg-black/85 backdrop-blur-md rounded-xl border border-slate-700/40 p-3 pointer-events-auto shadow-2xl anim-pop-fast">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                <Monitor className="w-3 h-3" /> {t('player.stats')}
              </div>
              <button onClick={() => setShowInfo(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="space-y-2">
              {[
                { icon: Monitor, label: t('player.resolution'), value: videoStats.resolution },
                { icon: Gauge, label: 'Bitrate', value: formatBitrate(videoStats.bitrate) },
                { icon: Activity, label: 'FPS', value: videoStats.fps || 'N/A' },
                { icon: Wifi, label: 'Buffer', value: `${videoStats.bufferLength}s` },
                { icon: Hash, label: t('player.dropped'), value: videoStats.droppedFrames, color: videoStats.droppedFrames > 0 ? 'text-[#ff9a3d]' : 'text-emerald-400' },
                { icon: Wifi, label: 'Mạng', value: netInfo.downlink ? `${netInfo.downlink} Mb/s${netInfo.type ? ` (${netInfo.type})` : ''}` : 'N/A' },
                { icon: Activity, label: 'RTT', value: netInfo.rtt ? `${netInfo.rtt} ms` : 'N/A' },
              ].map(({ icon: Ic, label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1"><Ic className="w-3 h-3" /> {label}</span>
                  <span className={`font-semibold ${color || 'text-white'}`}>{value}</span>
                </div>
              ))}
              <div className="border-t border-slate-700/40 pt-2 mt-1">
                <div className="text-[9px] text-slate-600 mb-0.5">Server</div>
                <div className="text-[9px] text-slate-400 font-mono">CHRTV PLAY · {channel?.group_title || ''}</div>
                <div className="text-[9px] text-slate-600 mt-1 mb-0.5">User-Agent upstream</div>
                <div className="text-[9px] text-emerald-300 font-mono break-all" title={displayUA}>{displayUA.length > 42 ? displayUA.slice(0, 42) + '…' : displayUA}</div>
              </div>
            </div>
          </div>
        )}

        {/* Quality Menu */}
        {showQualityMenu && (
          <div className="absolute top-12 right-3 z-20 w-56 bg-black/85 backdrop-blur-md rounded-xl border border-slate-700/40 p-2 pointer-events-auto shadow-2xl anim-pop-fast">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider"><Settings className="w-3 h-3" /> {t('player.quality')}</div>
              <button onClick={() => setShowQualityMenu(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              <button onClick={() => { shakaPlayerRef.current?.switchVariant(); setSelectedTrackId(-1); setShowQualityMenu(false); resetOverlayTimer(); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${selectedTrackId === -1 ? 'bg-[#f36f21] text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>
                <div className="font-medium">{t('player.auto_quality')}</div>
                <div className="text-[9px] opacity-70">ADB chọn phù hợp</div>
              </button>
              {/* Tốc độ phát (xem lại) */}
              <div className="px-2.5 py-1.5">
                <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tốc độ phát</div>
                <div className="flex items-center gap-1">
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map(r => (
                    <button key={r} onClick={() => { if (!isCatchupMode) { addToast('Tốc độ phát chỉ dùng cho xem lại', 'info'); } else { try { videoRef.current.playbackRate = r; } catch {} setPlayRate(r); } resetOverlayTimer(); }} className={`flex-1 py-1 rounded-md text-[10px] font-bold transition-all ${playRate === r ? 'bg-[#f36f21] text-white' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>{r}x</button>
                  ))}
                </div>
              </div>
              {/* Data saver */}
              <button onClick={() => { updateSetting('dataSaver', !dataSaver); resetOverlayTimer(); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all flex items-center justify-between ${dataSaver ? 'bg-emerald-600/20 text-emerald-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                <div>
                  <div className="font-medium">🌱 Tiết kiệm data</div>
                  <div className="text-[9px] opacity-70">{dataSaver ? `Đang giới hạn ≤ ${dataSaverCap}p` : `Giới hạn độ phân giải ≤ ${dataSaverCap}p`}</div>
                </div>
                <span className={`w-7 h-4 rounded-full relative transition-all shrink-0 ${dataSaver ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                  <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${dataSaver ? 'left-3.5' : 'left-0.5'}`}></span>
                </span>
              </button>
              {availableTracks.map(t => (
                <button key={t.id} onClick={() => selectTrack(t)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${selectedTrackId === t.id ? 'bg-[#f36f21] text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>
                  <div className="font-medium">{qualityLabel(t)}</div>
                  <div className="text-[9px] opacity-70">{formatBitrate(t.bandwidth)} {t.codecs && `· ${t.codecs}`}</div>
                </button>
              ))}
              {availableTracks.length === 0 && <div className="text-[10px] text-slate-500 text-center py-2">Luồng đơn chất lượng</div>}
            </div>
          </div>
        )}

        {/* UA Menu (chọn User-Agent upstream — fix kênh cần Dalvik) */}
        {showUAMenu && (
          <div className="absolute top-12 right-3 z-20 w-72 bg-black/85 backdrop-blur-md rounded-xl border border-slate-700/40 p-2 pointer-events-auto shadow-2xl anim-pop-fast">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wider"><Smartphone className="w-3 h-3" /> User-Agent luồng</div>
              <button onClick={() => setShowUAMenu(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="px-2 pb-1.5 text-[9px] text-slate-500 leading-snug">
              Kênh lỗi 403 / không tải được? Thử <b className="text-slate-300">Dalvik/2.1.0</b>. Đổi xong tự tải lại luồng.
              {channelRequiredUA && (<div className="mt-1 text-slate-400">Kênh yêu cầu: <span className="font-mono text-emerald-300">{channelRequiredUA.slice(0, 48)}{channelRequiredUA.length > 48 ? '…' : ''}</span></div>)}
            </div>
            <div className="space-y-0.5 max-h-60 overflow-y-auto">
              {UA_PRESETS.map((preset) => {
                const active = (currentUAOverride || '') === preset.ua;
                return (
                  <button key={preset.id} onClick={() => reloadWithUA(preset.ua)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${active ? 'bg-emerald-600 text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <div className="font-medium flex items-center justify-between">{preset.label}{active && <span className="text-[9px]">● đang dùng</span>}</div>
                    <div className="text-[9px] opacity-70">{preset.hint}</div>
                  </button>
                );
              })}
              <div className="pt-1.5 mt-1 border-t border-slate-700/40">
                <div className="text-[9px] text-slate-500 px-2.5 mb-1">Hoặc nhập UA tùy chỉnh cho kênh này:</div>
                <div className="flex items-center gap-1.5 px-2.5 pb-1">
                  <input
                    value={customUA}
                    onChange={(e) => setCustomUA(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && customUA.trim()) { reloadWithUA(customUA.trim()); setCustomUA(''); } }}
                    placeholder="VD: Dalvik/2.1.0 (Linux; U; Android 12; ...)"
                    className="flex-1 px-2 py-1.5 bg-slate-800/60 border border-slate-700/40 rounded-lg text-[10px] text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/60"
                  />
                  <button onClick={() => { if (customUA.trim()) { reloadWithUA(customUA.trim()); setCustomUA(''); } }} className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg">Dùng</button>
                </div>
                {(() => { let g = ''; try { g = getGlobalUA(); } catch {} return g ? (<button onClick={() => { try { setGlobalUA(''); } catch {} setUaTick((x) => x + 1); addToast('Đã xoá UA toàn cục', 'info'); }} className="w-full text-center text-[9px] text-slate-500 hover:text-slate-300 py-1">UA toàn cục đang dùng: {g.slice(0, 32)}… (bấm để xoá)</button>) : null; })()}
              </div>
            </div>
          </div>
        )}

        {/* Audio Menu */}
        {showAudioMenu && (
          <div className="absolute top-12 right-3 z-20 w-48 bg-black/85 backdrop-blur-md rounded-xl border border-slate-700/40 p-2 pointer-events-auto shadow-2xl anim-pop-fast">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider"><AudioLines className="w-3 h-3" /> {t('player.language')}</div>
              <button onClick={() => setShowAudioMenu(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {audioTracks.length === 0 && <div className="text-[10px] text-slate-500 text-center py-2">Chỉ 1 ngôn ngữ</div>}
              {audioTracks.map((t) => (
                <button key={t.id} onClick={() => selectAudio(t.id)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${selectedAudioId === t.id ? 'bg-[#f36f21] text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subtitle Language Menu */}
        {showSubtitleMenu && (
          <div className="absolute top-12 right-3 z-20 w-48 bg-black/85 backdrop-blur-md rounded-xl border border-slate-700/40 p-2 pointer-events-auto shadow-2xl anim-pop-fast">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider"><Captions className="w-3 h-3" /> {t('player.subtitles')}</div>
              <button onClick={() => setShowSubtitleMenu(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              <button onClick={() => { const p = shakaPlayerRef.current; try { p?.setTextTrackVisibility(false); } catch {} setSelectedTextId(-2); setShowSubtitleMenu(false); resetOverlayTimer(); }} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${selectedTextId === -2 ? 'bg-[#f36f21] text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>
                Tắt phụ đề
              </button>
              {textTracks.map((t) => (
                <button key={t.id} onClick={() => selectSubtitle(t.id)} className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] transition-all ${selectedTextId === t.id ? 'bg-[#f36f21] text-white font-semibold' : 'text-slate-300 hover:bg-slate-800'}`}>
                  {t.label}
                </button>
              ))}
              {textTracks.length === 0 && <div className="text-[10px] text-slate-500 text-center py-2">Stream không có phụ đề</div>}
            </div>
          </div>
        )}

        {/* EPG strip: kênh khác đang chiếu gì */}
        {showEpgStrip && (
          <div className="absolute top-12 left-3 z-20 w-80 max-h-[70%] bg-black/90 backdrop-blur-md rounded-xl border border-slate-700/40 flex flex-col pointer-events-auto shadow-2xl anim-pop-fast">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/40">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider"><Tv className="w-3 h-3" /> Đang chiếu lúc này</div>
              <button onClick={() => setShowEpgStrip(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 py-1.5 space-y-0.5">
              {allChannels.filter(ch => ch.channel_id !== channel?.channel_id).slice(0, 40).map((ch) => {
                const epg = epgLookup ? epgLookup(ch.channel_id) : { now: null };
                return (
                  <button key={ch.channel_id} onClick={() => { window.__chrtv_select_channel && window.__chrtv_select_channel(ch); setShowEpgStrip(false); resetOverlayTimer(); }} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/60 text-left transition-all">
                    <img src={ch.logo || ''} alt="" className="w-7 h-7 object-contain rounded bg-slate-900/60 p-0.5 shrink-0" onError={e => { e.target.style.display = 'none'; }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-slate-200 truncate">{ch.name}</div>
                      <div className="text-[9px] text-slate-500 truncate">{epg?.now ? `${formatTimeHHMM(epg.now.start)} · ${maskScores(epg.now.title)}` : 'Chưa có EPG'}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Watch Party panel */}
        {showParty && (
          <div className="absolute top-12 right-3 bottom-24 z-20 w-80 bg-black/90 backdrop-blur-md rounded-xl border border-purple-700/40 flex flex-col pointer-events-auto shadow-2xl anim-pop-fast">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/40">
              <div className="flex items-center gap-1">
                <button onClick={() => setPartyTab('party')} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 ${partyTab === 'party' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}><PartyPopper className="w-3 h-3" /> Xem chung{partyRoom ? ` ${partyRoom.replace('party:', '')}` : ''}</button>
                <button onClick={() => setPartyTab('channel')} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${partyTab === 'channel' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'}`}>💬 Chat kênh</button>
              </div>
              <button onClick={() => setShowParty(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>

            {partyTab === 'party' && !partyRoom ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
                <Users className="w-10 h-10 text-purple-400/60" />
                <p className="text-[11px] text-slate-400">Tạo phòng để xem cùng bạn bè — cùng kênh, chat realtime, thả reaction.</p>
                <button onClick={createParty} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-xl">🎉 Tạo phòng mới</button>
                <div className="flex items-center gap-1.5 w-full">
                  <input id="chrtv-join-code" placeholder="Nhập mã phòng (VD: K3X9Q)" maxLength={10} className="flex-1 px-2.5 py-2 bg-slate-800/60 border border-slate-700/40 rounded-lg text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/60" />
                  <button onClick={() => { const el = document.getElementById('chrtv-join-code'); if (el?.value.trim()) joinParty(el.value); }} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold rounded-lg">Vào</button>
                </div>
              </div>
            ) : (
              <>
                <div className="px-3 py-1.5 border-b border-slate-700/40 flex items-center justify-between">
                  <div className="text-[10px] text-slate-400 truncate">{partyMembers.length} người: {partyMembers.map(m => m.name).join(', ') || '…'}</div>
                  <button onClick={shareChannel} className="text-[10px] text-purple-300 hover:text-purple-200 shrink-0 font-bold">Copy link</button>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1">
                  {partyChat.map((c, i) => (
                    <div key={i} className={`text-[11px] rounded-lg px-2 py-1 ${c.sys ? 'text-slate-500 italic text-center' : 'bg-slate-800/60'}`}>
                      {!c.sys && <span className="text-purple-300 font-bold">{c.from}: </span>}
                      <span className="text-slate-200">{c.text}</span>
                    </div>
                  ))}
                  <div ref={(el) => { if (el) el.scrollIntoView({ block: 'end' }); }}></div>
                </div>
                {/* Vote nhanh */}
                {polls.length > 0 && (
                  <div className="px-2 py-1.5 border-t border-slate-700/40 space-y-1.5">
                    {polls.map(poll => {
                      const votes = Object.values(poll.votes || {});
                      const total = votes.length;
                      return (
                        <div key={poll.id} className="bg-slate-800/60 rounded-lg p-2">
                          <div className="text-[11px] font-bold text-white">📊 {poll.q}</div>
                          <div className="text-[9px] text-slate-500 mb-0.5">{poll.from} · {total} vote</div>
                          {poll.opts.map((o, i) => {
                            const c = votes.filter(v => v === i).length;
                            const pct = total ? Math.round(c / total * 100) : 0;
                            const mine = myVotes[poll.id] === i;
                            return (
                              <button key={i} onClick={() => votePoll(poll.id, i)} className={`w-full text-left mt-1 rounded-lg overflow-hidden border transition-all ${mine ? 'border-emerald-500/60' : 'border-slate-700/50 hover:border-purple-500/50'}`}>
                                <div className="relative px-2 py-1">
                                  <div className="absolute inset-0 bg-purple-600/30" style={{ width: `${pct}%` }}></div>
                                  <span className="relative text-[10px] text-slate-200">{o} — {pct}% ({c}){mine ? ' ✓' : ''}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Reaction bar */}
                <div className="px-2 py-1 border-t border-slate-700/40 flex items-center gap-1 justify-center">
                  {isHost && partyTab === 'party' && partyRoom && (
                    <button onClick={() => { setShowPollForm(v => !v); resetOverlayTimer(); }} className={`p-1 rounded-lg text-sm transition-all ${showPollForm ? 'bg-purple-600' : 'hover:bg-slate-700/60'}`} title="Tạo vote">📊</button>
                  )}
                  {PARTY_EMOJIS.map((em) => (
                    <button key={em} onClick={() => react(em)} className="text-base hover:scale-125 transition-transform p-0.5" title={`Thả ${em}`}>{em}</button>
                  ))}
                </div>
                {showPollForm && (
                  <div className="px-2 py-2 border-t border-slate-700/40 space-y-1.5 bg-slate-900/40">
                    <input value={pollDraft.q} onChange={e => setPollDraft(d => ({ ...d, q: e.target.value }))} placeholder="Câu hỏi vote... (VD: Xem kênh nào tiếp?)" className="w-full px-2.5 py-1.5 bg-slate-800/60 border border-slate-700/40 rounded-lg text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/60" />
                    {pollDraft.opts.map((o, i) => (
                      <input key={i} value={o} onChange={e => setPollDraft(d => { const opts = [...d.opts]; opts[i] = e.target.value; return { ...d, opts }; })} placeholder={`Lựa chọn ${i + 1}`} className="w-full px-2.5 py-1.5 bg-slate-800/60 border border-slate-700/40 rounded-lg text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/60" />
                    ))}
                    <div className="flex items-center gap-1.5">
                      {pollDraft.opts.length < 4 && <button onClick={() => setPollDraft(d => ({ ...d, opts: [...d.opts, ''] }))} className="px-2.5 py-1.5 bg-slate-700 text-white text-[10px] font-bold rounded-lg">+ Thêm</button>}
                      <button onClick={sendPoll} className="flex-1 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold rounded-lg">Tạo vote</button>
                    </div>
                  </div>
                )}
                <div className="px-2 py-2 border-t border-slate-700/40 flex items-center gap-1.5">
                  <input
                    value={partyText}
                    onChange={(e) => setPartyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && partyText.trim()) { sendPartyChat(partyText.trim()); setPartyText(''); } }}
                    placeholder="Nhắn tin cho phòng…"
                    className="flex-1 px-2.5 py-1.5 bg-slate-800/60 border border-slate-700/40 rounded-lg text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/60"
                  />
                  <button onClick={() => { if (partyText.trim()) { sendPartyChat(partyText.trim()); setPartyText(''); } }} className="p-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white"><Send className="w-3.5 h-3.5" /></button>
                  <button onClick={leaveParty} className="text-[10px] text-slate-500 hover:text-[#ff9a3d] font-bold shrink-0">Rời</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Reactions bay (floating) */}
        {reactions.length > 0 && (
          <div className="absolute inset-x-0 bottom-24 z-30 pointer-events-none overflow-hidden h-64">
            <style>{`@keyframes chrtv-floatup { 0% { transform: translateY(0) scale(0.7); opacity: 0; } 10% { opacity: 1; } 100% { transform: translateY(-220px) scale(1.35); opacity: 0; } }`}</style>
            {reactions.map((r) => (
              <span key={r.id} className="absolute text-3xl" style={{ left: `${15 + Math.random() * 65}%`, bottom: 0, animation: 'chrtv-floatup 3.2s ease-out forwards', textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}>
                {r.emoji}
              </span>
            ))}
          </div>
        )}

        {/* Báo lỗi kênh */}
        {showReport && (
          <div className="absolute top-12 right-3 z-20 w-72 bg-black/85 backdrop-blur-md rounded-xl border border-slate-700/40 p-3 pointer-events-auto shadow-2xl anim-pop-fast">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wider"><Flag className="w-3 h-3" /> Báo lỗi kênh</div>
              <button onClick={() => setShowReport(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <select value={reportType} onChange={e => setReportType(e.target.value)} className="w-full px-2.5 py-2 bg-slate-800/60 border border-slate-700/40 rounded-lg text-[11px] text-white focus:outline-none focus:border-amber-500/60 mb-2">
              {['Kênh không phát được', 'Đứng hình / giật liên tục', 'Sai lịch phát sóng', 'Chất lượng quá kém', 'Sai User-Agent', 'Khác'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <textarea value={reportMsg} onChange={e => setReportMsg(e.target.value)} placeholder="Mô tả thêm (không bắt buộc)..." rows={2} className="w-full px-2.5 py-2 bg-slate-800/60 border border-slate-700/40 rounded-lg text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/60 mb-2 resize-none" />
            <button onClick={submitReport} className="w-full py-2 btn-orange text-white text-xs font-bold rounded-xl">Gửi báo lỗi</button>
            <p className="text-[9px] text-slate-600 text-center mt-1.5">Kèm thông tin kỹ thuật để admin xử lý nhanh</p>
          </div>
        )}

        {/* Sleep Timer */}
        {showSleepTimer && (
          <div className="absolute top-12 right-3 z-20 pointer-events-auto">
            <SleepTimer onExpired={onSleepExpired} onClose={() => setShowSleepTimer(false)} programEnd={(() => { try { const s = isCatchupMode ? (catchupProgram?.stop || catchupProgram?.end) : epgNow?.stop; if (!s) return 0; const ms = new Date(typeof s === 'string' ? s.replace(' ', 'T') : s).getTime(); return ms > Date.now() ? ms : 0; } catch { return 0; } })()} />
          </div>
        )}

        {/* Volume Slider (overlay) */}
        {showVolumeSlider && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 bg-black/80 backdrop-blur-md rounded-xl border border-slate-700/40 px-4 py-2.5 flex items-center gap-3 pointer-events-auto shadow-2xl anim-pop-fast">
            <VolumeIcon className="w-4 h-4 text-slate-300 shrink-0" />
            <input
              type="range" min={0} max={100} value={isMuted ? 0 : volume}
              onChange={e => setVolumeLevel(parseInt(e.target.value))}
              className="w-40 accent-[#f36f21] h-1"
            />
            <span className="text-[10px] text-slate-400 font-mono w-8 text-right">{isMuted ? 0 : volume}%</span>
          </div>
        )}

        {/* Channel List Panel */}
        {showChannelList && (
          <div className="absolute top-12 right-3 bottom-16 z-20 w-72 bg-black/90 backdrop-blur-md rounded-xl border border-slate-700/40 flex flex-col pointer-events-auto shadow-2xl anim-pop-fast">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/40">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-wider"><List className="w-3 h-3" /> DS kênh</div>
              <button onClick={() => setShowChannelList(false)} className="p-0.5 rounded hover:bg-slate-700/50"><X className="w-3 h-3 text-slate-400" /></button>
            </div>
            <div className="px-2.5 py-1.5">
              <input type="text" placeholder={t('player.search_channel')} value={channelListSearch} onChange={e => setChannelListSearch(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-800/50 border border-slate-700/40 rounded-lg text-[11px] text-slate-200 focus:outline-none focus:border-[#f36f21]/40" />
            </div>
            <div className="flex-1 overflow-y-auto px-1.5 pb-1.5 space-y-0.5">
              {filteredChannelList.map((ch) => (
                <button key={ch.channel_id} onClick={() => { window.__chrtv_select_channel && window.__chrtv_select_channel(ch); setShowChannelList(false); resetOverlayTimer(); }} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all ${channel?.channel_id === ch.channel_id ? 'bg-[#f36f21]/15 border border-[#f36f21]/40 text-white' : 'hover:bg-slate-800/50 text-slate-300 border border-transparent'}`}>
                  <img src={ch.logo || ''} alt="" className="w-7 h-7 object-contain rounded bg-slate-900/60 p-0.5 shrink-0" onError={e => e.target.style.display = 'none'} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold truncate">{ch.name}</div>
                    <div className="text-[9px] text-slate-600 truncate">{ch.group_title}</div>
                  </div>
                  {channel?.channel_id === ch.channel_id && <Radio className="w-3 h-3 text-[#f36f21] shrink-0 animate-pulse" />}
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
                <div className="flex items-center gap-1 text-[9px] font-semibold text-[#ff9a3d] uppercase tracking-wider mb-0.5">
                  <Clock className="w-2.5 h-2.5" /> Đang phát
                </div>
                <h3 className="text-[13px] font-bold text-white truncate">{isCatchupMode && catchupProgram ? maskScores(catchupProgram.title) : maskScores(epgNow?.title) || 'Chương trình'}</h3>
                <p className="text-[10px] text-slate-500 truncate">
                  {epgNow ? `${formatTimeHHMM(epgNow.start)} - ${formatTimeHHMM(epgNow.stop)}` : ''}
                  {epgNow?.desc && ` · ${epgNow.desc}`}
                </p>
                {epgNow && (
                  <div className="w-full bg-slate-800/80 h-1 rounded-full mt-1 overflow-hidden">
                    <div className="bg-gradient-to-r from-[#22d3ee] to-[#f36f21] h-full rounded-full transition-all duration-500" style={{ width: `${nowProgress}%` }} />
                  </div>
                )}
              </div>
              {epgNext && !isCatchupMode && (
                <div className="md:w-48 border-t md:border-t-0 md:border-l border-slate-700/30 pt-1.5 md:pt-0 md:pl-2.5">
                  <div className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider">{t('player.up_next')}</div>
                  <h4 className="text-[11px] font-semibold text-slate-300 truncate">{maskScores(epgNext.title)}</h4>
                  <p className="text-[9px] text-slate-600">{formatTimeHHMM(epgNext.start)}</p>
                </div>
              )}
            </div>
          </div>

          {/* Emoji bar (reaction nhanh) */}
          {showEmojiBar && (
            <div className="mb-2 flex items-center gap-1.5 justify-center bg-black/60 backdrop-blur-md rounded-xl border border-purple-700/30 px-3 py-1.5 w-fit mx-auto">
              {PARTY_EMOJIS.map((em) => (
                <button key={em} onClick={() => react(em)} className="text-xl hover:scale-125 transition-transform" title={`Thả ${em}`}>{em}</button>
              ))}
              {partyRoom && <span className="text-[9px] text-slate-500 ml-2">phòng {partyRoom.replace('party:', '')}</span>}
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button onClick={togglePlay} className="p-2 rounded-full grad-brand text-white hover:brightness-110 shadow-lg shadow-[#f36f21]/25">
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
              <button onClick={() => { setShowEmojiBar(prev => !prev); if (!partyRoom) { setShowParty(true); createParty(); } resetOverlayTimer(); }} className={`p-2 rounded-full transition-all ${showEmojiBar ? 'bg-purple-600 text-white' : 'bg-black/50 text-slate-200 hover:bg-black/70'}`} title="Thả reaction">
                <Smile className="w-3.5 h-3.5" />
              </button>
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