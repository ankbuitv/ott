import React, { useEffect, useState, useMemo } from 'react';
import { initNavigation } from '@noriginmedia/react-spatial-navigation';
import {
  Tv, Search, Heart, History, Radio, RefreshCw, AlertCircle,
  Filter, Play, Sparkles
} from 'lucide-react';

import Sidebar from './components/Sidebar';
import VideoPlayer, { generateCatchupUrl } from './components/VideoPlayer';
import EpgGridTimeline from './components/EpgGridTimeline';
import ChannelCard from './components/ChannelCard';
import FocusableWrapper from './components/FocusableWrapper';

import {
  fetchChannels, fetchEPGData, fetchFavorites,
  toggleFavoriteApi, recordWatchHistory, DEFAULT_FALLBACK_STREAM
} from './services/api';

// Khởi tạo Spatial Navigation cho TV Remote
initNavigation({ debug: false, visualDebug: false });

export default function App() {
  const [activeTab, setActiveTab] = useState('channels'); // 'channels' | 'epg' | 'favorites' | 'history'
  const [channels, setChannels] = useState([]);
  const [epgData, setEpgData] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [watchHistory, setWatchHistory] = useState([]);

  const [selectedCategory, setSelectedCategory] = useState('Tất Cả');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Trạng thái phát Video
  const [currentChannel, setCurrentChannel] = useState(null);
  const [activeStreamUrl, setActiveStreamUrl] = useState(null);
  const [isCatchupMode, setIsCatchupMode] = useState(false);
  const [catchupProgram, setCatchupProgram] = useState(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  // Tải dữ liệu ban đầu
  useEffect(() => {
    async function initData() {
      setIsLoading(true);
      const [chanData, epgRes, favData] = await Promise.all([
        fetchChannels(),
        fetchEPGData(),
        fetchFavorites()
      ]);

      setChannels(chanData);
      setEpgData(epgRes);
      setFavorites(favData);

      // Tải Lịch sử xem từ LocalStorage
      const historySaved = localStorage.getItem('chrtv_history');
      if (historySaved) {
        try {
          setWatchHistory(JSON.parse(historySaved));
        } catch (e) {}
      }

      setIsLoading(false);
    }

    initData();
  }, []);

  // Danh mục Kênh
  const categories = useMemo(() => {
    const groups = new Set(['Tất Cả']);
    channels.forEach(ch => {
      if (ch.group_title) groups.add(ch.group_title);
    });
    return Array.from(groups);
  }, [channels]);

  // Lọc Kênh theo Thể Loại & Tìm Kiếm
  const filteredChannels = useMemo(() => {
    if (activeTab === 'favorites') {
      return channels.filter(ch => favorites.includes(ch.channel_id));
    }
    if (activeTab === 'history') {
      const historyIds = watchHistory.map(h => h.channel_id);
      return channels.filter(ch => historyIds.includes(ch.channel_id));
    }

    return channels.filter(ch => {
      const matchCat = selectedCategory === 'Tất Cả' || ch.group_title === selectedCategory;
      const matchSearch = !searchQuery || ch.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [channels, activeTab, favorites, watchHistory, selectedCategory, searchQuery]);

  // Chọn kênh phát Trực Tiếp
  const handleSelectChannel = (channel) => {
    setCurrentChannel(channel);
    setActiveStreamUrl(channel.stream_url || DEFAULT_FALLBACK_STREAM);
    setIsCatchupMode(false);
    setCatchupProgram(null);
    setIsPlayerOpen(true);

    // Ghi Lịch Sử Xem
    recordWatchHistory(channel.channel_id);
  };

  // Chọn phát lại chương trình EPG (Catchup)
  const handlePlayCatchup = (channel, program, catchupUrl) => {
    setCurrentChannel(channel);
    setActiveStreamUrl(catchupUrl);
    setIsCatchupMode(true);
    setCatchupProgram(program);
    setIsPlayerOpen(true);

    recordWatchHistory(channel.channel_id);
  };

  // Toggle Kênh Yêu Thích
  const handleToggleFavorite = async (channelId) => {
    const isFav = favorites.includes(channelId);
    const updatedFavs = await toggleFavoriteApi(channelId, !isFav);
    setFavorites(updatedFavs);
  };

  // Chuyển kênh Tiếp theo / Kênh trước đó
  const handleNextChannel = () => {
    if (!currentChannel || channels.length === 0) return;
    const idx = channels.findIndex(c => c.channel_id === currentChannel.channel_id);
    const nextIdx = (idx + 1) % channels.length;
    handleSelectChannel(channels[nextIdx]);
  };

  const handlePrevChannel = () => {
    if (!currentChannel || channels.length === 0) return;
    const idx = channels.findIndex(c => c.channel_id === currentChannel.channel_id);
    const prevIdx = (idx - 1 + channels.length) % channels.length;
    handleSelectChannel(channels[prevIdx]);
  };

  // Trích xuất thông tin EPG Now/Next cho Kênh
  const getEpgForChannel = (channelId) => {
    if (!epgData || !epgData.programmes) return { now: null, next: null };
    const now = new Date();
    const progs = epgData.programmes.filter(p => p.channel === channelId);

    let epgNow = null;
    let epgNext = null;

    for (let i = 0; i < progs.length; i++) {
      const p = progs[i];
      const start = new Date(p.start);
      const stop = new Date(p.stop);

      if (start <= now && stop >= now) {
        epgNow = p;
        if (i + 1 < progs.length) epgNext = progs[i + 1];
        break;
      }
    }

    return { now: epgNow, next: epgNext };
  };

  return (
    <div className="flex h-screen w-screen bg-[#0d0e12] text-slate-100 overflow-hidden font-sans select-none">
      {/* Sidebar Dark Mode */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content View */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto pb-16 md:pb-0">
        {activeTab === 'epg' ? (
          <EpgGridTimeline
            channels={channels}
            epgData={epgData}
            onPlayCatchup={handlePlayCatchup}
            onSelectChannel={handleSelectChannel}
          />
        ) : (
          <div className="p-6 md:p-8 space-y-6">
            {/* Header Main Page */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-red-500 font-bold uppercase tracking-wider text-xs mb-1">
                  <Radio className="w-4 h-4 animate-pulse" /> Truyền Hình IPTV Đa Nền Tảng
                </div>
                <h1 className="text-2xl md:text-3xl font-extrabold text-white">
                  {activeTab === 'favorites' ? 'Danh Sách Kênh Yêu Thích' : activeTab === 'history' ? 'Lịch Sử Kênh Đã Xem' : 'Danh Sách Kênh Trực Tiếp'}
                </h1>
              </div>

              {/* Ô Tìm Kiếm Kênh */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm kiếm kênh truyền hình..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-sm text-slate-200 focus:outline-none focus:border-red-600 transition-colors shadow-lg"
                />
              </div>
            </div>

            {/* Thanh Phân Loại Thể Loại (Categories) */}
            {activeTab === 'channels' && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {categories.map((cat) => (
                  <FocusableWrapper
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      selectedCategory === cat
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                        : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {cat}
                  </FocusableWrapper>
                ))}
              </div>
            )}

            {/* Spinner Loading */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <RefreshCw className="w-10 h-10 text-red-600 animate-spin mb-3" />
                <span className="text-slate-400 font-medium">Đang tải danh sách kênh CHRTV...</span>
              </div>
            ) : filteredChannels.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/40 rounded-3xl border border-slate-800/60">
                <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-slate-300">Không tìm thấy kênh phù hợp</h3>
                <p className="text-slate-500 text-sm mt-1">Vui lòng thử từ khóa hoặc danh mục khác.</p>
              </div>
            ) : (
              /* Lưới Thẻ Kênh (Channels Grid) */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredChannels.map((channel) => {
                  const { now } = getEpgForChannel(channel.channel_id);
                  const isFav = favorites.includes(channel.channel_id);

                  return (
                    <ChannelCard
                      key={channel.channel_id}
                      channel={channel}
                      isSelected={currentChannel?.channel_id === channel.channel_id}
                      isFavorite={isFav}
                      onSelect={handleSelectChannel}
                      onToggleFavorite={handleToggleFavorite}
                      epgNow={now}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Video Player Toàn Màn Hình */}
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
          />
        </div>
      )}
    </div>
  );
}
