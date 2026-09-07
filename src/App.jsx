import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { addWatch, badgeName, badgeDesc } from './services/achievements';
import { initNavigation } from '@noriginmedia/react-spatial-navigation';

import Sidebar from './components/Sidebar';
import PlansScreen from './components/PlansScreen';
import AuthModal from './components/AuthModal';

// Khách vãng lai (chưa đăng nhập): vẫn vào web + xem kênh VN bình thường (mức Standard).
// Xem chương trình đã phát (catchup), phim, hoặc kênh vượt gói => mới yêu cầu đăng nhập.
const GUEST_USER = { id: 0, username: 'khach', display_name: 'Guest', role: 'guest', plan: '', guest: true };
import { planAllows, rankOf } from './services/plans';
import PrerollAd from './components/PrerollAd';
import { fetchPreroll, loadPreviewState, subscribePreview, getPreviewState, fmtPreview } from './services/ads';
import { setPrerollHandler, runPreroll } from './services/prerollGate';
import Logo from './components/Logo';
import TopNav from './components/TopNav';
import VideoPlayer from './components/VideoPlayer';
import EpgGridTimeline from './components/EpgGridTimeline';
import SettingsPage from './components/SettingsPage';
import OnboardingTour from './components/OnboardingTour';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import ChannelInfoModal from './components/ChannelInfoModal';
import AuthScreen from './components/AuthScreen';
import ProfileGate from './components/ProfileGate';
import AdminPanel from './components/AdminPanel';
import HomePage from './components/HomePage';
import TVPage from './components/TVPage';
import SportsScreen from './components/SportsScreen';
import BroadcastBanner from './components/BroadcastBanner';
import FocusableWrapper from './components/FocusableWrapper';
import MoviesScreen from './components/MoviesScreen';
import ShortsScreen from './components/ShortsScreen';
import CommunityScreen from './components/CommunityScreen';
import PublicProfileModal from './components/PublicProfileModal';
import KidsShell from './components/KidsShell';
import PinPad from './components/PinPad';
import { sendBeat } from './services/social';
import { popDueReminders, fireBrowserNotification } from './services/localNotify';
import { recordProfileWatch, hasAppPin, verifyAppPin } from './services/kids';
import ChannelCard from './components/ChannelCard';
import { SkeletonGrid } from './components/SkeletonLoader';

import { DeviceProvider, useDevice } from './contexts/DeviceContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import { I18nProvider, useI18n } from './contexts/I18nContext';
import LanguagePicker from './components/LanguagePicker';

import { fetchChannels, fetchEPGData, fetchFavorites, toggleFavoriteApi, recordWatchHistory, DEFAULT_FALLBACK_STREAM } from './services/api';
import { requestStreamAccess } from './services/streamGuard';
import { parseEpgDate } from './utils/dateUtils';
import { getFavorites, setFavorites as saveFavs, getHistory, setHistory as saveHistory } from './hooks/useStorage';
import { findEpgForChannel } from './utils/epgMatch';

initNavigation({ debug: false, visualDebug: false });

function AppContent() {
  const device = useDevice();
  const { settings } = useSettings();
  const { addToast } = useToast();
  const { user, isAuthenticated, token, effectivePlan } = useAuth();
  const { currentProfile, logoutProfile, profiles, fetchProfiles, selectProfile } = useProfile();
  const { hasPicked, resetPicker, t, lang } = useI18n();
  const guestMode = !isAuthenticated || !user;
  const effUser = guestMode ? GUEST_USER : user;
  const effPlan = guestMode ? 'standard' : (effectivePlan || user?.plan || 'standard');
  // (34) Quảng cáo pre-roll + (xem thử 5 phút của gói Standard)
  const [preroll, setPreroll] = useState(null);
  const [preview, setPreview] = useState(getPreviewState());
  useEffect(() => subscribePreview(setPreview), []);
  useEffect(() => { if (!guestMode) loadPreviewState(); }, [guestMode, effPlan]);
  useEffect(() => {
    setPrerollHandler(async (kind, ref) => {
      const d = await fetchPreroll({ kind, ref });
      if (!d || !d.ad) return;
      await new Promise((resolve) => setPreroll({ ad: d.ad, skipAfter: d.skip_after ?? 30, refId: ref, resolve }));
    });
    return () => setPrerollHandler(null);
  }, []);
  // Gói Standard còn quota -> vẫn cho bấm vào kênh ngoài gói, server sẽ cấp 5 phút xem thử
  const canOpenChannel = useCallback((plan, groupTitle) => {
    if (planAllows(plan, groupTitle)) return true;
    return !guestMode && rankOf(plan) <= 1 && preview.enabled && preview.remaining > 0;
  }, [guestMode, preview.enabled, preview.remaining]);
  const [splash, setSplash] = useState(() => {
    try { return sessionStorage.getItem('chrtv_splash') !== '1'; } catch { return true; }
  });
  useEffect(() => {
    if (!splash) return;
    const tmr = setTimeout(() => {
      setSplash(false);
      try { sessionStorage.setItem('chrtv_splash', '1'); } catch {}
    }, 1700);
    return () => clearTimeout(tmr);
  }, [splash]);
  useEffect(() => { if (token) fetchProfiles(token); }, [token, fetchProfiles]);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [movieToOpen, setMovieToOpen] = useState(null); // phim được chọn từ TopNav search
  const [shortToOpen, setShortToOpen] = useState(null); // short được chọn từ Home
  const [publicHandle, setPublicHandle] = useState(null); // hồ sơ công khai (?u=)
  const [appUnlocked, setAppUnlocked] = useState(() => { try { return sessionStorage.getItem('chrtv_unlocked') === '1'; } catch { return true; } });
  const [pinErr, setPinErr] = useState('');
  const promptLogin = useCallback((msg) => {
    if (msg) addToast(msg, 'info');
    setShowAuth(true);
  }, [addToast]);

  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('chrtv_tab') || 'channels';
  });
  const [channels, setChannels] = useState([]);
  const [epgData, setEpgData] = useState(null);
  const [favorites, setFavoritesState] = useState([]);
  const [watchHistory, setWatchHistory] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState('Tất Cả');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [currentChannel, setCurrentChannel] = useState(null);
  const [activeStreamUrl, setActiveStreamUrl] = useState(null);
  const [isCatchupMode, setIsCatchupMode] = useState(false);
  const [catchupProgram, setCatchupProgram] = useState(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  // Trang TV xem kênh riêng (player inline + EPG)
  const [tvChannel, setTvChannel] = useState(null);
  const [tvStreamUrl, setTvStreamUrl] = useState(null);
  const [tvLoading, setTvLoading] = useState(false);
  const tvAutoTried = useRef(false);
  const [miniPlayer, setMiniPlayer] = useState(false);
  const [miniPos, setMiniPos] = useState({ x: 0, y: 0 });
  const miniDrag = useRef(null);
  // Kéo thả mini-player (giữ thanh tiêu đề)
  const onMiniPointerDown = (e) => {
    if (!miniPlayer) return;
    if (e.target.closest('button') || !e.target.closest('[data-mini-drag]')) return;
    e.preventDefault();
    miniDrag.current = { sx: e.clientX, sy: e.clientY, ox: miniPos.x, oy: miniPos.y };
    const move = (ev) => {
      const d = miniDrag.current; if (!d) return;
      const nx = Math.max(-(window.innerWidth - 360), Math.min(0, d.ox + ev.clientX - d.sx));
      const ny = Math.max(-(window.innerHeight - 280), Math.min(0, d.oy + ev.clientY - d.sy));
      setMiniPos({ x: nx, y: ny });
    };
    const up = () => { miniDrag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const [showSettings, setShowSettings] = useState(false);
  // Chuyển tab luôn thoát Settings + cuộn lên đầu (fix Home/kênh bị kẹt)
  const goTab = useCallback((tab) => {
    setShowSettings(false);
    setShowAdmin(false);
    setActiveTab(tab);
    try { document.querySelector('main')?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 }); } catch {}
  }, []);
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [channelInfoModal, setChannelInfoModal] = useState(null);

  useEffect(() => { localStorage.setItem('chrtv_tab', activeTab); }, [activeTab]);

  // ============ DEEP LINK: ?channel=ID&party=CODE (share từ player) ============
  // + ?movie=tv-123 (chia sẻ phim) + ?u=handle (hồ sơ công khai)
  // + ?gift=CODE (bạn bè tặng gói quà kênh — mở trang Gói cước, điền sẵn mã)
  const [deepPartyRoom, setDeepPartyRoom] = useState(null);
  const [deepGiftCode, setDeepGiftCode] = useState('');
  const deepMovieDone = useRef(false);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || (window.location.hash || '').split('?')[1] || '');
      const chId = params.get('channel');
      const party = params.get('party');
      const giftCd = params.get('gift');
      if (giftCd) {
        setDeepGiftCode(giftCd.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32));
        setActiveTab('plans');
        addToast('🎁 ' + t('gift.received_link'), 'info');
      }
      if (party) setDeepPartyRoom(`party:${party.toUpperCase()}`);
      const uh = params.get('u');
      if (uh && !publicHandle) setPublicHandle(uh);
      const mv = params.get('movie');
      if (mv && !deepMovieDone.current) {
        deepMovieDone.current = true;
        const m = String(mv).match(/^(movie|tv)-(\d+)$/);
        if (m) {
          setMovieToOpen({ id: Number(m[2]), media_type: m[1] });
          setActiveTab('movies');
        }
      }
      if (chId && channels.length > 0) {
        const ch = channels.find((c) => c.channel_id === chId);
        if (ch && (!currentChannel || currentChannel.channel_id !== chId)) {
          handleSelectChannel(ch);
        }
      }
    } catch {}
  }, [channels]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nhắc lịch (trận đấu/phim): kiểm tra mỗi 60s
  useEffect(() => {
    const check = () => {
      try {
        const due = popDueReminders();
        due.forEach((r) => {
          addToast(`⏰ ${r.title}`, 'info');
          fireBrowserNotification(r.title, r.body);
        });
      } catch {}
    };
    check();
    const iv = setInterval(check, 60000);
    return () => clearInterval(iv);
  }, [addToast]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'light') {
      root.classList.remove('dark');
      document.body.style.backgroundColor = '#f1f5f9';
      document.body.style.color = '#0f172a';
    } else {
      root.classList.add('dark');
      document.body.style.backgroundColor = '#000';
      document.body.style.color = '#f1f5f9';
    }
    document.body.dataset.theme = settings.colorTheme || 'sunset';
    root.classList.toggle('tvmode', !!settings.tvMode);
  }, [settings.theme, settings.colorTheme, settings.tvMode]);

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const [chanData, epgRes, favData] = await Promise.all([
          fetchChannels(), fetchEPGData(), fetchFavorites()
        ]);
        setChannels(chanData);
        setEpgData(epgRes);
        setFavoritesState(favData);
        setWatchHistory(getHistory());
      } catch (e) {
        console.error(e);
      }
      setIsLoading(false);
    }
    init();
  }, []);

  const categories = useMemo(() => {
    const groups = new Set(['Tất Cả']);
    channels.forEach(ch => { if (ch.group_title) groups.add(ch.group_title); });
    return Array.from(groups);
  }, [channels]);

  const filteredChannels = useMemo(() => {
    let list = channels.filter(ch => {
      const matchCat = selectedCategory === 'Tất Cả' || ch.group_title === selectedCategory;
      const matchSearch = !searchQuery || ch.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchParental = !settings.parentalEnabled || !settings.hiddenGroups?.includes(ch.group_title);
      return matchCat && matchSearch && matchParental;
    });
    // Tab Yêu thích / Lịch sử: lọc đúng theo dữ liệu user (fix bug hiện toàn bộ kênh)
    if (activeTab === 'favorites') {
      const favSet = new Set(favorites || []);
      list = list.filter(ch => favSet.has(ch.channel_id));
    } else if (activeTab === 'history') {
      const order = new Map((watchHistory || []).map((h, i) => [h.channel_id, i]));
      list = list.filter(ch => order.has(ch.channel_id))
        .sort((a, b) => (order.get(a.channel_id) ?? 999) - (order.get(b.channel_id) ?? 999));
    }
    return list;
  }, [channels, selectedCategory, searchQuery, settings, activeTab, favorites, watchHistory]);

  // P0-B: URL phát được xin TỪ SERVER (kèm JWT + kiểm tra gói phía server) —
  // client không còn giữ stream_url gốc, không tự build URL stream nữa.
  // Giờ ngủ của bé: chặn mở kênh
  const inBedtime = () => {
    try {
      if (!settings.kidBedtimeEnabled) return false;
      const now = new Date();
      const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const s = settings.kidBedtimeStart || '21:00', e = settings.kidBedtimeEnd || '06:00';
      return s <= e ? (cur >= s && cur < e) : (cur >= s || cur < e);
    } catch { return false; }
  };

  const openChannel = useCallback(async (channel, { catchup = null, at = 0 } = {}) => {
    if (!channel) return;
    if (inBedtime()) { addToast(t('app.bedtime_block'), 'error'); return; }
    setMiniPlayer(false);
    await runPreroll('channel', channel.channel_id);
    try {
      const url = await requestStreamAccess(channel, { at });
      if (!url) throw Object.assign(new Error('NO_URL'), { code: 'TOKEN_ERROR' });
      setCurrentChannel(channel);
      setActiveStreamUrl(url);
      setIsCatchupMode(!!catchup);
      setCatchupProgram(catchup || null);
      setIsPlayerOpen(true);
      recordWatchHistory(channel.channel_id);
      try {
        const nb = addWatch(0, channel.channel_id);
        nb.forEach(b => addToast(t('app.new_badge', { n: badgeName(b, lang), d: badgeDesc(b, lang) }), 'success'));
      } catch {}
      setWatchHistory(prev => {
        const updated = prev.filter(h => h.channel_id !== channel.channel_id);
        updated.unshift({ channel_id: channel.channel_id, position: 0, updated_at: new Date().toISOString() });
        if (updated.length > 30) updated.length = 30;
        saveHistory(updated);
        return updated;
      });
      addToast(`${t('app.watching')} ${channel.name}`, 'channel');
    } catch (e) {
      const code = e?.code || String(e?.message || '');
      if (code === 'LOGIN_REQUIRED') {
        promptLogin(catchup
          ? t('app.need_login_catchup')
          : t('app.need_login_ch', { name: channel.name }));
      } else if (code === 'PREVIEW_EXPIRED') {
        addToast(e?.message || 'Hết 5 phút xem thử — nâng gói để xem tiếp nhé!', 'error');
        setActiveTab('plans');
      } else if (code === 'PLAN_REQUIRED') {
        addToast(t('app.plan_needed', { name: channel.name }), 'error');
        setActiveTab('plans');
      } else if (code !== 'NO_SESSION') {
        addToast(t('app.stream_fail'), 'error');
      }
    }
  }, [addToast, promptLogin, t, settings.kidBedtimeEnabled, settings.kidBedtimeStart, settings.kidBedtimeEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectChannel = useCallback((channel) => {
    // GATING phía client (UX nhanh) — SERVER vẫn là nơi xác nhận cuối cùng (entitlement)
    if (channel && guestMode && !planAllows('standard', channel.group_title)) {
      promptLogin(t('app.need_login_ch', { name: channel.name }));
      return;
    }
    if (channel && !guestMode && !canOpenChannel(effPlan, channel.group_title)) {
      addToast(t('app.plan_needed', { name: channel.name }), 'error');
      setActiveTab('plans');
      return;
    }
    openChannel(channel);
  }, [addToast, effPlan, guestMode, promptLogin, openChannel, canOpenChannel]);

  // Mở kênh trên trang TV (player inline, không overlay)
  const handleOpenTvChannel = useCallback(async (channel) => {
    if (!channel) return;
    if (channel && guestMode && !planAllows('standard', channel.group_title)) {
      promptLogin(t('app.need_login_ch', { name: channel.name }));
      return;
    }
    if (channel && !guestMode && !canOpenChannel(effPlan, channel.group_title)) {
      addToast(t('app.plan_needed', { name: channel.name }), 'error');
      setActiveTab('plans');
      return;
    }
    setTvLoading(true);
    await runPreroll('channel', channel.channel_id);
    try {
      const url = await requestStreamAccess(channel, {});
      if (!url) throw Object.assign(new Error('NO_URL'), { code: 'TOKEN_ERROR' });
      setTvChannel(channel);
      setTvStreamUrl(url);
    } catch (e) {
      const code = e?.code || String(e?.message || '');
      if (code === 'LOGIN_REQUIRED') promptLogin(t('app.need_login_ch', { name: channel.name }));
      else if (code === 'PREVIEW_EXPIRED') { addToast(e?.message || 'Hết 5 phút xem thử — nâng gói để xem tiếp nhé!', 'error'); setActiveTab('plans'); }
      else if (code === 'PLAN_REQUIRED') { addToast(t('app.plan_needed', { name: channel.name }), 'error'); setActiveTab('plans'); }
      else if (code !== 'NO_SESSION') addToast(t('app.stream_fail'), 'error');
    } finally {
      setTvLoading(false);
    }
  }, [addToast, effPlan, guestMode, promptLogin, t, canOpenChannel]);

  const handleNextTv = useCallback(() => {
    if (!tvChannel || channels.length === 0) return;
    const idx = channels.findIndex(c => c.channel_id === tvChannel.channel_id);
    handleOpenTvChannel(channels[(idx + 1) % channels.length]);
  }, [tvChannel, channels, handleOpenTvChannel]);

  const handlePrevTv = useCallback(() => {
    if (!tvChannel || channels.length === 0) return;
    const idx = channels.findIndex(c => c.channel_id === tvChannel.channel_id);
    handleOpenTvChannel(channels[(idx - 1 + channels.length) % channels.length]);
  }, [tvChannel, channels, handleOpenTvChannel]);

  // Vào trang TV lần đầu → tự mở Vietnam Today
  useEffect(() => {
    if (activeTab !== 'tv') { tvAutoTried.current = false; return; }
    if (tvAutoTried.current || tvChannel || tvStreamUrl || tvLoading || channels.length === 0) return;
    tvAutoTried.current = true;
    const def = channels.find(c => /vietnam\s*today/i.test(`${c.channel_id || ''} ${c.name || ''}`))
      || channels.find(c => /today/i.test(`${c.channel_id || ''} ${c.name || ''}`))
      || channels[0];
    if (def) handleOpenTvChannel(def);
  }, [activeTab, channels, tvChannel, tvStreamUrl, tvLoading, handleOpenTvChannel]);

  const handlePlayCatchup = useCallback((channel, program) => {
    // Xem CHƯƠNG TRÌNH đã phát (catchup) => bắt buộc đăng nhập
    if (guestMode) {
      promptLogin(t('app.need_login_catchup'));
      return;
    }
    // Catchup cũng phải đúng gói của kênh đó
    if (!planAllows(effPlan, channel?.group_title)) {
      addToast(t('app.plan_needed', { name: channel.name }), 'error');
      setActiveTab('plans');
      return;
    }
    let at = 0;
    try { at = Math.floor(parseEpgDate(program?.start).getTime() / 1000); } catch {}
    openChannel(channel, { catchup: program, at });
  }, [addToast, effPlan, guestMode, promptLogin, openChannel]);

  const handleToggleFavorite = useCallback(async (channelId) => {
    const isFav = favorites.includes(channelId);
    const updatedFavs = await toggleFavoriteApi(channelId, !isFav);
    setFavoritesState(updatedFavs);
    saveFavs(updatedFavs);
    addToast(isFav ? t('app.unfav') : t('app.faved'), 'success');
  }, [favorites, addToast]);

  const handleNextChannel = useCallback(() => {
    if (!currentChannel || channels.length === 0) return;
    const idx = channels.findIndex(c => c.channel_id === currentChannel.channel_id);
    handleSelectChannel(channels[(idx + 1) % channels.length]);
  }, [currentChannel, channels, handleSelectChannel]);

  const handlePrevChannel = useCallback(() => {
    if (!currentChannel || channels.length === 0) return;
    const idx = channels.findIndex(c => c.channel_id === currentChannel.channel_id);
    handleSelectChannel(channels[(idx - 1 + channels.length) % channels.length]);
  }, [currentChannel, channels, handleSelectChannel]);

  const getEpgForChannel = useCallback((channelId) => {
    if (!epgData?.programmes || !channelId) return { now: null, next: null };
    const ch = channels.find(c => c.channel_id === channelId);
    if (!ch) return { now: null, next: null };
    return findEpgForChannel(epgData.programmes, ch);
  }, [epgData, channels]);

  // Huy hiệu: cộng giờ xem mỗi 30s khi đang mở player + heartbeat + thống kê hồ sơ
  useEffect(() => {
    if (!isPlayerOpen || !currentChannel) return undefined;
    try {
      sendBeat({ kind: 'channel', ref_id: currentChannel.channel_id, ref_name: currentChannel.name || '', seconds: 0, viewed: true, name: currentProfile?.name || effUser?.display_name || effUser?.username || '' });
    } catch {}
    const iv = setInterval(() => {
      try {
        const nb = addWatch(30, currentChannel.channel_id);
        nb.forEach(b => addToast(t('app.new_badge', { n: badgeName(b, lang), d: badgeDesc(b, lang) }), 'success'));
        sendBeat({ kind: 'channel', ref_id: currentChannel.channel_id, ref_name: currentChannel.name || '', seconds: 30, name: currentProfile?.name || effUser?.display_name || effUser?.username || '' });
        recordProfileWatch(currentProfile?.id || 'guest', 30, currentChannel.name || currentChannel.channel_id);
      } catch {}
    }, 30000);
    return () => clearInterval(iv);
  }, [isPlayerOpen, currentChannel, addToast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mở modal chi tiết kênh (từ nút hover ở trang chủ)
  const handleShowInfo = useCallback((ch) => {
    if (!ch) return;
    const epg = getEpgForChannel(ch.channel_id);
    setChannelInfoModal({ channel: ch, epgNow: epg.now, epgNext: epg.next, isFav: favorites.includes(ch.channel_id) });
  }, [getEpgForChannel, favorites]);

  // Trang admin riêng: mở qua #admin (chỉ tài khoản admin)
  useEffect(() => {
    const check = () => {
      try {
        if (window.location.hash === '#admin' && user?.role === 'admin') setShowAdmin(true);
      } catch {}
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [user]);

  useEffect(() => {
    window.__chrtv_select_channel = (ch) => handleSelectChannel(ch);
    return () => { delete window.__chrtv_select_channel; };
  }, [handleSelectChannel]);

  useEffect(() => {
    const h = (e) => {
      if (e.key === '?' && e.shiftKey && !isPlayerOpen) setShowKeyboardShortcuts(prev => !prev);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isPlayerOpen]);

  // GATING
  // Khoá PIN mở app
  if (!appUnlocked && hasAppPin()) {
    return (
      <PinPad
        title={t('pin.app_title')}
        error={pinErr}
        onSubmit={async (pin) => {
          if (await verifyAppPin(pin)) {
            try { sessionStorage.setItem('chrtv_unlocked', '1'); } catch {}
            setAppUnlocked(true);
          } else setPinErr(t('pin.wrong'));
        }}
      />
    );
  }

  // Khách: KHÔNG chặn cổng — vào web xem bình thường (UI như user đã đăng nhập)
  if (!guestMode && !currentProfile) {
    return <ProfileGate />;
  }

  // Chế độ bé: giao diện riêng
  if (!guestMode && currentProfile?.is_child) {
    return (
      <div className="h-screen w-screen bg-black text-slate-100 overflow-y-auto font-sans select-none">
        <KidsShell
          channels={channels}
          onSelectChannel={handleSelectChannel}
          onSelectMovie={(m) => { setMovieToOpen(m); }}
          onExitKids={() => logoutProfile()}
        />
        {movieToOpen && (
          <div className="fixed inset-0 z-[100] bg-black overflow-y-auto">
            <button onClick={() => setMovieToOpen(null)} className="fixed top-3 left-3 z-[110] px-4 py-2 rounded-full bg-black/70 border border-white/20 text-[12px] font-bold text-white">← {t('common.back')}</button>
            <MoviesScreen openMovie={movieToOpen} onOpenMovieHandled={() => setMovieToOpen(null)} onRequireLogin={() => promptLogin(t('app.need_login_movie'))} onGoTab={goTab} onOpenChannel={handleOpenTvChannel} />
          </div>
        )}
        {isPlayerOpen && currentChannel && (
          <div className="fixed inset-0 z-[120] bg-black">
            <VideoPlayer
              channel={currentChannel}
              streamUrl={activeStreamUrl}
              epgNow={getEpgForChannel(currentChannel.channel_id).now}
              epgNext={getEpgForChannel(currentChannel.channel_id).next}
              onNextChannel={handleNextChannel}
              onPrevChannel={handlePrevChannel}
              onClose={() => { setIsPlayerOpen(false); setMiniPlayer(false); }}
              allChannels={channels}
              epgLookup={getEpgForChannel}
              currentUserName={currentProfile?.name || ''}
            />
          </div>
        )}
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-black text-slate-100 overflow-hidden font-sans select-none flex-col">
      {splash && (
        <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-[#07080c]">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(520px 280px at 50% 42%, rgba(243,111,33,.22), transparent 70%)' }} />
          <div className="splash-logo relative">
            <Logo size="xl" showSubtext={false} />
          </div>
          <p className="mt-6 text-[11px] font-black tracking-[0.35em] text-stone-500 uppercase">VIP PLAY</p>
          <div className="mt-5 w-44 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="splash-bar h-full rounded-full grad-brand" />
          </div>
        </div>
      )}
      <TopNav
        channels={channels}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        user={effUser}
        currentProfile={currentProfile}
        setActiveTab={goTab}
        activeTab={activeTab}
        onShowAuth={() => setShowAuth(true)}
        onShowSettings={() => setShowSettings(true)}
        profiles={profiles}
        onSelectProfile={selectProfile}
        onManageProfiles={() => logoutProfile()}
        onSelectChannel={handleSelectChannel}
        onSelectMovie={(m) => { setMovieToOpen(m); setActiveTab('movies'); }}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={goTab} onShowSettings={() => setShowSettings(true)} onShowAdmin={() => setShowAdmin(true)} />

        <main className="flex-1 flex flex-col h-full overflow-y-auto overflow-x-hidden min-w-0 pb-16 md:pb-0">
          {activeTab !== 'movies' && (
            <div className="px-5 md:px-8 pt-3 max-w-[1400px] mx-auto w-full">
              <BroadcastBanner />
            </div>
          )}
          {showAdmin && user?.role === 'admin' ? (
            <AdminPanel asPage onClose={() => { setShowAdmin(false); try { history.replaceState(null, '', location.pathname); } catch {} }} />
          ) : showSettings ? (
            <SettingsPage onClose={() => setShowSettings(false)} />
          ) : activeTab === 'movies' ? (
            <MoviesScreen openMovie={movieToOpen} onOpenMovieHandled={() => setMovieToOpen(null)} onRequireLogin={() => promptLogin(t('app.need_login_movie'))} onGoTab={goTab} onOpenChannel={handleOpenTvChannel} />
          ) : activeTab === 'tv' ? (
            <TVPage
              channels={channels}
              epgData={epgData}
              tvChannel={tvChannel}
              tvStreamUrl={tvStreamUrl}
              tvLoading={tvLoading}
              onOpenTvChannel={handleOpenTvChannel}
              onPlayCatchup={handlePlayCatchup}
              onToggleFavorite={handleToggleFavorite}
              favorites={favorites}
              onNextTv={handleNextTv}
              onPrevTv={handlePrevTv}
              onCloseTv={() => { setTvChannel(null); setTvStreamUrl(null); }}
              partyRoom={deepPartyRoom}
              userName={currentProfile?.name || effUser?.display_name || effUser?.username || t('app.guest')}
              getEpgForChannel={getEpgForChannel}
            />
          ) : activeTab === 'sports' ? (
            <SportsScreen channels={channels} onSelectChannel={handleSelectChannel} />
          ) : activeTab === 'epg' ? (
            <EpgGridTimeline channels={channels} epgData={epgData} onPlayCatchup={handlePlayCatchup} onSelectChannel={handleSelectChannel} onRequireLogin={promptLogin} />
          ) : activeTab === 'community' ? (
            <CommunityScreen onRequireLogin={promptLogin} />
          ) : activeTab === 'shorts' ? (
            <ShortsScreen
              channels={channels}
              epgData={epgData}
              onSelectChannel={handleSelectChannel}
              onSelectMovie={(m) => { setMovieToOpen(m); setActiveTab('movies'); }}
              startId={shortToOpen}
              onStartHandled={() => setShortToOpen(null)}
            />
          ) : activeTab === 'plans' ? (
            <PlansScreen initialCode={deepGiftCode} />
          ) : (
            <>
              {/* Home (mặc định) — đã bỏ tab Yêu thích/Lịch sử */}
                <HomePage
                  channels={channels}
                  epgData={epgData}
                  favorites={favorites}
                  watchHistory={watchHistory}
                  onSelectChannel={handleSelectChannel}
                  onPlayCatchup={handlePlayCatchup}
                  onShowInfo={handleShowInfo}
                  onToggleFavorite={handleToggleFavorite}
                  selectedCategory={selectedCategory}
                  setSelectedCategory={setSelectedCategory}
                  categories={categories}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  isLoading={isLoading}
                  onSelectMovie={(m) => { setMovieToOpen(m); goTab('movies'); }}
                  onOpenShort={(id) => { setShortToOpen(id); goTab('shorts'); }}
                  onGoTab={goTab}
                />
            </>
          )}
        </main>
      </div>

      {isPlayerOpen && currentChannel && (
        <div
          className={miniPlayer ? 'fixed z-50 bg-black rounded-xl overflow-hidden shadow-2xl border border-slate-700/60' : 'fixed inset-0 z-50 bg-black'}
          style={miniPlayer ? { width: 340, height: 240, right: 16, bottom: 16, transform: `translate(${miniPos.x}px, ${miniPos.y}px)` } : undefined}
          onPointerDown={onMiniPointerDown}
        >
          <VideoPlayer
            channel={currentChannel}
            streamUrl={activeStreamUrl}
            epgNow={getEpgForChannel(currentChannel.channel_id).now}
            epgNext={getEpgForChannel(currentChannel.channel_id).next}
            isCatchupMode={isCatchupMode}
            catchupProgram={catchupProgram}
            onNextChannel={handleNextChannel}
            onPrevChannel={handlePrevChannel}
            onClose={() => { setIsPlayerOpen(false); setMiniPlayer(false); }}
            mini={miniPlayer}
            onMinimize={() => setMiniPlayer(true)}
            onExpand={() => setMiniPlayer(false)}
            allChannels={channels}
            epgLookup={getEpgForChannel}
            initialPartyRoom={deepPartyRoom}
            currentUserName={currentProfile?.name || effUser?.display_name || effUser?.username || t('app.guest')}
          />
        </div>
      )}

      {channelInfoModal && (
        <ChannelInfoModal channel={channelInfoModal.channel} epgNow={channelInfoModal.epgNow} epgNext={channelInfoModal.epgNext} isFavorite={favorites.includes(channelInfoModal.channel.channel_id)} onPlay={handleSelectChannel} onToggleFavorite={handleToggleFavorite} onClose={() => setChannelInfoModal(null)} onRequireLogin={promptLogin} />
      )}
      {publicHandle && <PublicProfileModal handle={publicHandle} onClose={() => { setPublicHandle(null); try { history.replaceState(null, '', location.pathname); } catch {} }} />}
      <KeyboardShortcuts open={showKeyboardShortcuts} onClose={() => setShowKeyboardShortcuts(false)} />

      {/* (34) Quảng cáo pre-roll — hiện trước khi vào kênh/phim */}
      {preroll && (
        <PrerollAd
          ad={preroll.ad}
          skipAfter={preroll.skipAfter}
          refId={preroll.refId}
          onDone={() => { preroll.resolve?.(); setPreroll(null); }}
          onUpgrade={() => { setActiveTab('plans'); }}
        />
      )}

      {/* Đồng hồ 5 phút xem thử của gói Standard */}
      {preview.enabled && preview.remaining < preview.total && (isPlayerOpen || tvChannel) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-black/80 border border-[#f36f21]/40 backdrop-blur flex items-center gap-2 pointer-events-auto">
          <span className="text-[11px] font-black tracking-wider text-[#ff9a3d]">XEM THỬ</span>
          <span className="text-[12px] font-bold text-white">còn {fmtPreview(preview.remaining)}</span>
          <button onClick={() => setActiveTab('plans')} className="ml-1 px-2.5 py-1 rounded-full bg-[#f36f21] text-white text-[11px] font-black">Nâng gói</button>
        </div>
      )}
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      {showLangPicker && <LanguagePicker onClose={() => setShowLangPicker(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <DeviceProvider>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <ProfileProvider>
              <SettingsProvider>
                <AppContent />
              </SettingsProvider>
            </ProfileProvider>
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </DeviceProvider>
  );
}