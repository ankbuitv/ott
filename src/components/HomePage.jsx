import React, { useMemo, useState } from 'react';
import { Play, Star, Clock, Radio, Heart, ChevronRight, TrendingUp, Zap } from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';
import { useDevice } from '../contexts/DeviceContext';
import { useAuth } from '../contexts/AuthContext';
import { formatTimeHHMM } from '../utils/dateUtils';
import SearchEPG from './SearchEPG';

const LOGO_FALLBACK = "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png";

export default function HomePage({
  channels, epgData, favorites, watchHistory,
  onSelectChannel, onPlayCatchup, onToggleFavorite,
  selectedCategory, setSelectedCategory, categories,
  searchQuery, setSearchQuery, isLoading
}) {
  const device = useDevice();
  const { isAuthenticated } = useAuth();
  const [activeFilter, setActiveFilter] = useState('all');

  // EPG now for each channel
  const getEpgNow = (chId) => {
    if (!epgData?.programmes) return null;
    const now = new Date();
    return epgData.programmes.find(p => p.channel === chId && new Date(p.start) <= now && new Date(p.stop) >= now);
  };

  // Featured channels (first 3 with EPG)
  const featured = useMemo(() => {
    return channels.slice(0, 3).map(ch => ({
      ...ch,
      epg: getEpgNow(ch.channel_id),
    }));
  }, [channels, epgData]);

  // Recent channels
  const recentChannels = useMemo(() => {
    const recentIds = watchHistory.slice(0, 8).map(h => h.channel_id);
    return channels.filter(ch => recentIds.includes(ch.channel_id));
  }, [channels, watchHistory]);

  // Group channels
  const groupedChannels = useMemo(() => {
    const groups = {};
    channels.forEach(ch => {
      const g = ch.group_title || 'Khác';
      if (!groups[g]) groups[g] = [];
      groups[g].push(ch);
    });
    return groups;
  }, [channels]);

  // Active group to show
  const displayGroups = useMemo(() => {
    if (activeFilter !== 'all') {
      return { [activeFilter]: groupedChannels[activeFilter] || [] };
    }
    // Show top 6 groups
    const sorted = Object.entries(groupedChannels)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 6);
    return Object.fromEntries(sorted);
  }, [groupedChannels, activeFilter]);

  // Filter tabs
  const filterTabs = useMemo(() => {
    return ['all', ...Object.keys(groupedChannels).sort()];
  }, [groupedChannels]);

  return (
    <div className="space-y-5">
      {/* Hero Banner - Featured Channel */}
      {featured[0] && (
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-r from-[#1a0a0a] to-[#0a0a1a] border border-white/5">
          <div className="flex flex-col md:flex-row">
            <div className="flex-1 p-5 md:p-7 space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-red-600 text-[9px] font-bold rounded-md text-white flex items-center gap-1">
                  <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
                </span>
                <span className="text-[10px] text-slate-500">{featured[0].group_title}</span>
              </div>
              <h2 className="text-xl md:text-2xl font-extrabold text-white leading-tight">{featured[0].name}</h2>
              {featured[0].epg && (
                <p className="text-xs text-slate-400">{featured[0].epg.title}</p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <FocusableWrapper
                  onClick={() => onSelectChannel(featured[0])}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-sm font-bold text-white shadow-lg shadow-red-600/20 transition-all"
                >
                  <Play className="w-4 h-4 fill-current" /> Xem ngay
                </FocusableWrapper>
                <button
                  onClick={() => onToggleFavorite(featured[0].channel_id)}
                  className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] transition-all"
                >
                  <Heart className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
            <div className="w-full md:w-48 h-32 md:h-auto bg-slate-900/50 flex items-center justify-center shrink-0">
              <img src={featured[0].logo || LOGO_FALLBACK} alt="" className="w-20 h-20 object-contain" onError={e => e.target.src = LOGO_FALLBACK} />
            </div>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8" strokeWidth="2"/><path strokeLinecap="round" strokeWidth="2" d="m21 21-4.35-4.35"/></svg>
          <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Tìm kênh truyền hình..." className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/40 transition-colors" />
        </div>
        <SearchEPG epgData={epgData} channels={channels} onPlayCatchup={onPlayCatchup} onSelectChannel={onSelectChannel} />
      </div>

      {/* Recently Watched */}
      {recentChannels.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Clock className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-white">Xem gần đây</h3>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {recentChannels.map(ch => (
              <FocusableWrapper key={ch.channel_id} onClick={() => onSelectChannel(ch)} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.08] shrink-0 transition-all min-w-[170px]">
                <img src={ch.logo || LOGO_FALLBACK} alt="" className="w-9 h-9 object-contain rounded-lg bg-black/30 shrink-0" onError={e => e.target.style.display = 'none'} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{ch.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{ch.group_title}</p>
                </div>
              </FocusableWrapper>
            ))}
          </div>
        </section>
      )}

      {/* Channel Groups */}
      {Object.entries(displayGroups).map(([groupName, groupChannels]) => (
        <section key={groupName}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-white">{groupName}</h3>
              <span className="text-[10px] text-slate-600">{groupChannels.length} kênh</span>
            </div>
          </div>
          <div className={`grid gap-3 ${device.isMobile ? 'grid-cols-1' : device.isTablet ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
            {groupChannels.slice(0, device.isMobile ? 6 : 12).map(ch => {
              const epgNow = getEpgNow(ch.channel_id);
              const isFav = favorites.includes(ch.channel_id);
              return (
                <FocusableWrapper
                  key={ch.channel_id}
                  onClick={() => onSelectChannel(ch)}
                  className="group relative rounded-xl bg-white/[0.03] border border-white/[0.05] p-3 hover:bg-white/[0.06] hover:border-white/[0.08] transition-all"
                >
                  <div className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); onToggleFavorite(ch.channel_id); }} className="p-1 rounded-full bg-black/40 hover:bg-black/60">
                      <Heart className={`w-3 h-3 ${isFav ? 'fill-red-500 text-red-500' : 'text-slate-500 hover:text-red-400'}`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2.5 mb-2">
                    <img src={ch.logo || LOGO_FALLBACK} alt="" className="w-10 h-10 object-contain rounded-lg bg-black/20 p-1 shrink-0" onError={e => e.target.src = LOGO_FALLBACK} />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-[13px] font-bold text-white truncate group-hover:text-red-400 transition-colors">{ch.name}</h4>
                      <span className="text-[9px] text-slate-500 font-medium">{ch.group_title}</span>
                    </div>
                  </div>
                  <div className="bg-black/20 rounded-lg p-2 border border-white/[0.03]">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9px] text-emerald-500/80 font-semibold flex items-center gap-0.5"><Radio className="w-2 h-2 animate-pulse" /> LIVE</span>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate font-medium">{epgNow?.title || 'Đang phát'}</p>
                  </div>
                </FocusableWrapper>
              );
            })}
          </div>
        </section>
      ))}

      {/* Show all / Load more */}
      {activeFilter === 'all' && Object.keys(groupedChannels).length > 6 && (
        <div className="text-center">
          <button onClick={() => setActiveFilter('all')} className="px-4 py-2 bg-white/[0.04] border border-white/[0.06] rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all">
            Xem tất cả kênh
          </button>
        </div>
      )}
    </div>
  );
}
