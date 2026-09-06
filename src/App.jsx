import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { addWatch, badgeName, badgeDesc } from './services/achievements';
import { initNavigation } from '@noriginmedia/react-spatial-navigation';

import Sidebar from './components/Sidebar';
import PlansScreen from './components/PlansScreen';
import AuthModal from './components/AuthModal';

// Khách vãng lai (chưa đăng nhập): vẫn vào web + xem kênh VN bình thường (mức Standard).
// Xem chương trình đã phát (catchup), phim, hoặc kênh vượt gói => mới yêu cầu đăng nhập.
const GUEST_USER = { id: 0, username: 'khach', display_name: 'Guest', role: 'guest', plan: '', guest: true };
import { planAllows } from './services/plans';
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
  const { currentProfile } = useProfile();
  const { hasPicked, resetPicker, t, lang } = useI18n();
  const guestMode = !isAuthenticated || !user;
  const effUser = guestMode ? GUEST_USER : user;
  const effPlan = guestMode ? 'standard' : (effectivePlan || user?.plan || 'standard');
  const [showLangPicker, setShowLangPicker] = useState(!hasPicked());
  const [showAuth, setShowAuth] = useState(false);
  const [movieToOpen, setMovieToOpen] = useState(null); // phim được chọn từ TopNav search
  const [shortToOpen, setShortToOpen] = useState(null); // short được chọn từ Home
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
  const [deepPartyRoom, setDeepPartyRoom] = useState(null);
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search || (window.location.hash || '').split('?')[1] || '');
      const chId = params.get('channel');
      const party = params.get('party');
      if (party) setDeepPartyRoom(`party:${party.toUpperCase()}`);
      if (chId && channels.length > 0) {
        const ch = channels.find((c) => c.channel_id === chId);
        if (ch && (!currentChannel || currentChannel.channel_id !== chId)) {
          handleSelectChannel(ch);
        }
      }
    } catch {}
  }, [channels]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (channel && !guestMode && !planAllows(effPlan, channel.group_title)) {
      addToast(t('app.plan_needed', { name: channel.name }), 'error');
      setActiveTab('plans');
      return;
    }
    openChannel(channel);
  }, [addToast, effPlan, guestMode, promptLogin, openChannel]);

  // Mở kênh trên trang TV (player inline, không overlay)
  const handleOpenTvChannel = useCallback(async (channel) => {
    if (!channel) return;
    if (channel && guestMode && !planAllows('standard', channel.group_title)) {
      promptLogin(t('app.need_login_ch', { name: channel.name }));
      return;
    }
    if (channel && !guestMode && !planAllows(effPlan, channel.group_title)) {
      addToast(t('app.plan_needed', { name: channel.name }), 'error');
      setActiveTab('plans');
      return;
    }
    setTvLoading(true);
    try {
      const url = await requestStreamAccess(channel, {});
      if (!url) throw Object.assign(new Error('NO_URL'), { code: 'TOKEN_ERROR' });
      setTvChannel(channel);
      setTvStreamUrl(url);
    } catch (e) {
      const code = e?.code || String(e?.message || '');
      if (code === 'LOGIN_REQUIRED') promptLogin(t('app.need_login_ch', { name: channel.name }));
      else if (code === 'PLAN_REQUIRED') { addToast(t('app.plan_needed', { name: channel.name }), 'error'); setActiveTab('plans'); }
      else if (code !== 'NO_SESSION') addToast(t('app.stream_fail'), 'error');
    } finally {
      setTvLoading(false);
    }
  }, [addToast, effPlan, guestMode, promptLogin, t]);

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

  // Huy hiệu: cộng giờ xem mỗi 30s khi đang mở player
  useEffect(() => {
    if (!isPlayerOpen || !currentChannel) return undefined;
    const iv = setInterval(() => {
      try {
        const nb = addWatch(30, currentChannel.channel_id);
        nb.forEach(b => addToast(t('app.new_badge', { n: badgeName(b, lang), d: badgeDesc(b, lang) }), 'success'));
      } catch {}
    }, 30000);
    return () => clearInterval(iv);
  }, [isPlayerOpen, currentChannel, addToast]);

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
  // Language picker — show lần đầu (chưa chọn ngôn ngữ)
  if (showLangPicker) {
    return <LanguagePicker onClose={() => setShowLangPicker(false)} />;
  }

  // Khách: KHÔNG chặn cổng — vào web xem bình thường (UI như user đã đăng nhập)
  if (!guestMode && !currentProfile) {
    return <ProfileGate />;
  }

  // Movies mode
  if (activeTab === 'movies') {
    return (
      <div className="flex h-screen w-screen bg-black text-slate-100 overflow-hidden font-sans select-none flex-col">
        <TopNav
          channels={channels}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          user={effUser}
          currentProfile={currentProfile}
          setActiveTab={goTab}
          activeTab={activeTab}
          onShowAuth={() => setShowAuth(true)}
          onSelectChannel={handleSelectChannel}
          onSelectMovie={(m) => { setMovieToOpen(m); setActiveTab('movies'); }}
        />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeTab={activeTab} setActiveTab={goTab} onShowSettings={() => setShowSettings(true)} onShowAdmin={() => setShowAdmin(true)} />
          <main className="flex-1 flex flex-col h-full overflow-y-auto pb-16 md:pb-0">
            {showSettings ? <SettingsPage onClose={() => setShowSettings(false)} /> : <MoviesScreen openMovie={movieToOpen} onOpenMovieHandled={() => setMovieToOpen(null)} onRequireLogin={() => promptLogin(t('app.need_login_movie'))} />}
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-black text-slate-100 overflow-hidden font-sans select-none flex-col">
      <TopNav
        channels={channels}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        user={effUser}
        currentProfile={currentProfile}
        setActiveTab={goTab}
        activeTab={activeTab}
        onShowAuth={() => setShowAuth(true)}
        onSelectChannel={handleSelectChannel}
        onSelectMovie={(m) => { setMovieToOpen(m); setActiveTab('movies'); }}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={goTab} onShowSettings={() => setShowSettings(true)} onShowAdmin={() => setShowAdmin(true)} />

        <main className="flex-1 flex flex-col h-full overflow-y-auto pb-16 md:pb-0">
          <div className="px-5 md:px-8 pt-3 max-w-[1400px] mx-auto w-full">
            <BroadcastBanner />
          </div>
          {activeTab === 'tv' ? (
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
          ) : activeTab === 'shorts' ? (
            <ShortsScreen
              channels={channels}
              epgData={epgData}
              onSelectChannel={handleSelectChannel}
              onSelectMovie={(m) => { setMovieToOpen(m); setActiveTab('movies'); }}
              startId={shortToOpen}
              onStartHandled={() => setShortToOpen(null)}
            />
          ) : showSettings ? (
            <SettingsPage onClose={() => setShowSettings(false)} />
          ) : activeTab === 'plans' ? (
            <PlansScreen />
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
      <KeyboardShortcuts open={showKeyboardShortcuts} onClose={() => setShowKeyboardShortcuts(false)} />
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      {showAdmin && user?.role === 'admin' && <AdminPanel onClose={() => { setShowAdmin(false); try { history.replaceState(null, '', location.pathname); } catch {} }} />}
      <OnboardingTour onLogin={isAuthenticated} />
    </div>
  );
}

export default function App() {
  return (
    <DeviceProvider>
      <SettingsProvider>
        <I18nProvider>
          <ToastProvider>
            <AuthProvider>
              <ProfileProvider>
                <AppContent />
              </ProfileProvider>
            </AuthProvider>
          </ToastProvider>
        </I18nProvider>
      </SettingsProvider>
    </DeviceProvider>
  );
}