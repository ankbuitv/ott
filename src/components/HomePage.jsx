import React, { useMemo } from 'react';
import { findEpgForChannel } from '../utils/epgMatch';
import { formatTimeHHMM } from '../utils/dateUtils';
import { Heart, Play, Clock, ChevronRight } from 'lucide-react';

export default function HomePage({ channels, epgData, favorites, watchHistory, onSelectChannel, onPlayCatchup, onToggleFavorite, selectedCategory, setSelectedCategory, categories, searchQuery, setSearchQuery, isLoading }) {
  const groupedChannels = useMemo(() => {
    const groups = {};
    const order = [];
    const categoryOrder = ['VTV', 'HTV', 'THVL', 'TodayTV', 'EV', 'BOX', 'SPORTS'];
    channels.forEach(ch => {
      const g = ch.group_title || 'Khác';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(ch);
    });
    order.sort((a, b) => {
      const ia = categoryOrder.findIndex(c => a.includes(c));
      const ib = categoryOrder.findIndex(c => b.includes(c));
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return { groups, order };
  }, [channels]);

  const filteredGroups = useMemo(() => {
    if (selectedCategory && selectedCategory !== 'Tất Cả') {
      return groupedChannels.groups[selectedCategory] ? { [selectedCategory]: groupedChannels.groups[selectedCategory] } : {};
    }
    return Object.fromEntries(groupedChannels.order.map(g => [g, groupedChannels.groups[g]]));
  }, [groupedChannels, selectedCategory]);

  if (isLoading) {
    return (
      <div className="max-w-[1500px] mx-auto px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] bg-slate-800/40 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto px-3 md:px-8 py-6 space-y-10 pb-32">
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-none">
          {categories.map(cat => (
            <button key={cat} onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-slate-800/80 border border-slate-700/50 text-slate-300 hover:bg-slate-700'}`}>
              {cat}
            </button>
          ))}
        </div>
      )}

      {Object.entries(filteredGroups).map(([groupName, groupChannels]) => (
        <section key={groupName}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 bg-red-600 rounded-full" />
              <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">{groupName}</h2>
              <span className="text-xs text-slate-500 font-medium ml-2">{groupChannels.length} kênh</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            {groupChannels.map(ch => {
              const epg = findEpgForChannel(epgData?.programmes, ch);
              const isFav = favorites.includes(ch.channel_id);
              return (
                <div key={ch.channel_id}
                  className="group/card rounded-2xl bg-gradient-to-b from-slate-800/60 to-slate-900/60 border border-slate-700/40 hover:border-red-500/40 overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-red-900/10 hover:-translate-y-0.5"
                  onClick={() => onSelectChannel(ch)}>
                  <div className="relative aspect-[16/9] bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center overflow-hidden">
                    {ch.logo ? (
                      <img src={ch.logo} alt="" className="w-14 h-14 md:w-16 md:h-16 object-contain z-10 drop-shadow-lg transition-transform duration-300 group-hover/card:scale-110"
                        onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <span className="text-4xl font-black text-white/20">{ch.name?.charAt(0)}</span>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent" />
                    <div className="absolute top-2 left-2 md:top-3 md:left-3 flex items-center gap-1.5 px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded-md shadow-lg">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      LIVE
                    </div>
                    {epg?.now && (
                      <div className="absolute bottom-0 left-0 right-0 px-2 md:px-3 py-1.5 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
                        <p className="text-[10px] md:text-xs text-white font-medium truncate">{epg.now.title}</p>
                        <p className="text-[9px] text-slate-400">{formatTimeHHMM(epg.now.start)}</p>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/30 transition-all duration-300 flex items-center justify-center">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-red-600/90 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-300 transform scale-75 group-hover/card:scale-100 shadow-xl">
                        <Play className="w-5 h-5 md:w-6 md:h-6 text-white ml-0.5" />
                      </div>
                    </div>
                  </div>
                  <div className="p-3 md:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm md:text-base text-white truncate">{ch.name}</p>
                        <p className="text-[10px] md:text-xs text-slate-500 mt-0.5 truncate">{epg?.now?.title || 'Đang phát trực tiếp'}</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); onToggleFavorite(ch.channel_id); }}
                        className={`shrink-0 p-1.5 rounded-lg transition-all ${isFav ? 'text-red-500 bg-red-500/10' : 'text-slate-600 hover:text-slate-400 hover:bg-slate-700/50'}`}>
                        <Heart className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isFav ? 'fill-red-500' : ''}`} />
                      </button>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onSelectChannel(ch); }}
                      className="mt-2.5 w-full py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-[11px] font-bold rounded-lg transition-all shadow-lg shadow-red-600/20">
                      <Play className="w-3 h-3 inline mr-1 -mt-0.5" />
                      Xem Ngay
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}