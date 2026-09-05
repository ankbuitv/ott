import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { initNavigation } from '@noriginmedia/react-spatial-navigation';

import Sidebar from './components/Sidebar';
import PlansScreen from './components/PlansScreen';
import AuthModal from './components/AuthModal';

// Khách vãng lai (chưa đăng nhập): vẫn vào web + xem kênh VN bình thường (mức Standard).
// Xem chương trình đã phát (catchup), phim, hoặc kênh vượt gói => mới yêu cầu đăng nhập.
const GUEST_USER = { id: 0, username: 'khach', display_name: 'Khách', role: 'guest', plan: '', guest: true };
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
import BroadcastBanner from './components/BroadcastBanner';
import FocusableWrapper from './components/FocusableWrapper';
import MoviesScreen from './components/MoviesScreen';
import { SkeletonGrid } from './components/SkeletonLoader';

import { DeviceProvider, useDevice } from './contexts/DeviceContext';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import { ToastProvider, useToast } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProfileProvider, useProfile } from './contexts/ProfileContext';
import { I18nProvider, useI18n } from './contexts/I18nContext';
import LanguagePicker from './components/LanguagePicker';

import { fetchChannels, fetchEPGData, fetchFavorites, toggleFavoriteApi, recordWatchHistory, DEFAULT_FALLBACK_STREAM } from './services/api';
import { getFavorites, setFavorites as saveFavs, getHistory, setHistory as saveHistory } from './hooks/useStorage';
import { findEpgForChannel } from './utils/epgMatch';

initNavigation({ debug: false, visualDebug: false });

function AppContent() {
  const device = useDevice();
  const { settings } = useSettings();
  const { addToast } = useToast();
  const { user, isAuthenticated, token } = useAuth();
  const { currentProfile } = useProfile();
  const { hasPicked, resetPicker } = useI18n();
  const guestMode = !isAuthenticated || !user;
  const effUser = guestMode ? GUEST_USER : user;
  const promptLogin = useCallback((msg) => {
    if (msg) addToast(msg, 'info');
    setShowAuth(true);
  }, [addToast]);
  const [showLangPicker, setShowLangPicker] = useState(!hasPicked());
  const [showAuth, setShowAuth] = useState(false);
  const [movieToOpen, setMovieToOpen] = useState(null); // phim được chọn từ TopNav search

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

  const [showSettings, setShowSettings] = useState(false);
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
  }, [settings.theme]);

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
    return channels.filter(ch => {
      const matchCat = selectedCategory === 'Tất Cả' || ch.group_title === selectedCategory;
      const matchSearch = !searchQuery || ch.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchParental = !settings.parentalEnabled || !settings.hiddenGroups?.includes(ch.group_title);
      return matchCat && matchSearch && matchParental;
    });
  }, [channels, selectedCategory, searchQuery, settings]);

  const handleSelectChannel = useCallback((channel) => {
    // GATING: khách = Standard (chỉ kênh VN); user = theo gói đã kích hoạt
    if (channel && guestMode && !planAllows('standard', channel.group_title)) {
      promptLogin(`"${channel.name}" cần đăng nhập để xem — đăng ký miễn phí nhé!`);
      return;
    }
    if (channel && !guestMode && !planAllows(user?.plan, channel.group_title)) {
      addToast(`"${channel.name}" thuộc gói cao hơn — vào Mua Gói kích hoạt (tạm miễn phí)`, 'error');
      setActiveTab('plans');
      return;
    }
    setCurrentChannel(channel);
    setActiveStreamUrl(channel.stream_url || DEFAULT_FALLBACK_STREAM);
    setIsCatchupMode(false);
    setCatchupProgram(null);
    setIsPlayerOpen(true);
    recordWatchHistory(channel.channel_id);
    setWatchHistory(prev => {
      const updated = prev.filter(h => h.channel_id !== channel.channel_id);
      updated.unshift({ channel_id: channel.channel_id, position: 0, updated_at: new Date().toISOString() });
      if (updated.length > 30) updated.length = 30;
      saveHistory(updated);
      return updated;
    });
    addToast(`Đang xem: ${channel.name}`, 'channel');
  }, [addToast, user?.plan, guestMode, promptLogin]);

  const handlePlayCatchup = useCallback((channel, program, catchupUrl) => {
    // Xem CHƯƠNG TRÌNH đã phát (catchup) => bắt buộc đăng nhập
    if (guestMode) {
      promptLogin('Xem chương trình đã phát cần đăng nhập — miễn phí nhé!');
      return;
    }
    setCurrentChannel(channel);
    setActiveStreamUrl(catchupUrl);
    // Catchup cũng phải đúng gói của kênh đó
    if (!planAllows(user?.plan, channel?.group_title)) {
      addToast(`"${channel.name}" thuộc gói cao hơn — vào Mua Gói kích hoạt (tạm miễn phí)`, 'error');
      setActiveTab('plans');
      return;
    }
    setIsCatchupMode(true);
    setCatchupProgram(program);
    setIsPlayerOpen(true);
    recordWatchHistory(channel.channel_id);
  }, [addToast, user?.plan, guestMode, promptLogin]);

  const handleToggleFavorite = useCallback(async (channelId) => {
    const isFav = favorites.includes(channelId);
    const updatedFavs = await toggleFavoriteApi(channelId, !isFav);
    setFavoritesState(updatedFavs);
    saveFavs(updatedFavs);
    addToast(isFav ? 'Đã bỏ yêu thích' : 'Đã thêm yêu thích', 'success');
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
          setActiveTab={setActiveTab}
          activeTab={activeTab}
          onShowAuth={() => setShowAuth(true)}
          onSelectChannel={handleSelectChannel}
          onSelectMovie={(m) => { setMovieToOpen(m); setActiveTab('movies'); }}
        />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onShowSettings={() => setShowSettings(true)} onShowAdmin={() => setShowAdmin(true)} />
          <main className="flex-1 flex flex-col h-full overflow-y-auto pb-16 md:pb-0">
            {showSettings ? <SettingsPage onClose={() => setShowSettings(false)} /> : <MoviesScreen openMovie={movieToOpen} onOpenMovieHandled={() => setMovieToOpen(null)} onRequireLogin={() => promptLogin('Đăng nhập để xem phim nhé — miễn phí!')} />}
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
        setActiveTab={setActiveTab}
        activeTab={activeTab}
        onShowAuth={() => setShowAuth(true)}
        onSelectChannel={handleSelectChannel}
        onSelectMovie={(m) => { setMovieToOpen(m); setActiveTab('movies'); }}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onShowSettings={() => setShowSettings(true)} onShowAdmin={() => setShowAdmin(true)} />

        <main className="flex-1 flex flex-col h-full overflow-y-auto pb-16 md:pb-0">
          {activeTab === 'epg' ? (
            <EpgGridTimeline channels={channels} epgData={epgData} onPlayCatchup={handlePlayCatchup} onSelectChannel={handleSelectChannel} />
          ) : showSettings ? (
            <SettingsPage onClose={() => setShowSettings(false)} />
          ) : activeTab === 'plans' ? (
            <PlansScreen />
          ) : (
            <>
              {activeTab === 'channels' ? (
                <HomePage
                  channels={channels}
                  epgData={epgData}
                  favorites={favorites}
                  watchHistory={watchHistory}
                  onSelectChannel={handleSelectChannel}
                  onPlayCatchup={handlePlayCatchup}
                  onToggleFavorite={handleToggleFavorite}
                  selectedCategory={selectedCategory}
                  setSelectedCategory={setSelectedCategory}
                  categories={categories}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  isLoading={isLoading}
                />
              ) : (
                <div className="max-w-[1400px] mx-auto px-8 py-8">
                  <h1 className="text-2xl font-black mb-6">
                    {activeTab === 'favorites' ? 'Kênh yêu thích' : 'Lịch sử xem'}
                  </h1>
                  {isLoading ? <SkeletonGrid count={6} /> : filteredChannels.length === 0 ? (
                    <div className="text-center py-12 bg-white/[0.02] rounded-2xl border border-white/[0.04]">
                      <p className="text-sm text-slate-400">{activeTab === 'favorites' ? 'Chưa có kênh yêu thích' : 'Chưa có lịch sử xem'}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {filteredChannels.map(ch => (
                        <FocusableWrapper key={ch.channel_id} onClick={() => handleSelectChannel(ch)} className="card rounded-2xl bg-stone-900/40 border border-stone-800 hover:border-red-500/40 overflow-hidden cursor-pointer">
                          <div className="relative aspect-[4/3] bg-gradient-to-br from-stone-700 to-stone-900 flex items-center justify-center">
                            <img src={ch.logo} alt="" className="w-16 h-16 object-contain" onError={e => { e.target.style.display = 'none'; }} />
                            <div className="absolute top-3 left-3 px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded">LIVE</div>
                          </div>
                          <div className="p-4">
                            <p className="font-bold text-base">{ch.name}</p>
                            <p className="text-[11px] text-stone-500">{ch.group_title}</p>
                            <button className="mt-3 w-full py-1.5 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg transition">Xem</button>
                          </div>
                        </FocusableWrapper>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {isPlayerOpen && currentChannel && (
        <div className="fixed inset-0 z-50 bg-black">
          <VideoPlayer
            channel={currentChannel}
            streamUrl={activeStreamUrl}
            epgNow={getEpgForChannel(currentChannel.channel_id).now}
            epgNext={getEpgForChannel(currentChannel.channel_id).next}
            isCatchupMode={isCatchupMode}
            catchupProgram={catchupProgram}
            onNextChannel={handleNextChannel}
            onPrevChannel={handlePrevChannel}
            onClose={() => setIsPlayerOpen(false)}
            allChannels={channels}
            epgLookup={getEpgForChannel}
            initialPartyRoom={deepPartyRoom}
            currentUserName={currentProfile?.name || effUser?.display_name || effUser?.username || 'Khách'}
          />
        </div>
      )}

      {channelInfoModal && (
        <ChannelInfoModal channel={channelInfoModal.channel} epgNow={channelInfoModal.epgNow} epgNext={channelInfoModal.epgNext} isFavorite={channelInfoModal.isFav} onPlay={handleSelectChannel} onToggleFavorite={handleToggleFavorite} onClose={() => setChannelInfoModal(null)} />
      )}
      <KeyboardShortcuts open={showKeyboardShortcuts} onClose={() => setShowKeyboardShortcuts(false)} />
      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      <OnboardingTour />
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