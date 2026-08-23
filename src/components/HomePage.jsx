import React, { useMemo } from 'react';
import { findEpgForChannel } from '../utils/epgMatch';
import { formatTimeHHMM } from '../utils/dateUtils';
import { Heart, Play } from 'lucide-react';
export default function HomePage({ channels, epgData, favorites, watchHistory, onSelectChannel, onPlayCatchup, onToggleFavorite, selectedCategory, setSelectedCategory, categories, searchQuery, setSearchQuery, isLoading }) {
  const grouped = useMemo(() => {
    const groups = {}, order = [];
    const catOrder = ['VTV', 'HTV', 'THVL', 'TodayTV', 'EV', 'BOX', 'SPORTS'];
    channels.forEach(ch => { const g = ch.group_title || 'Khác'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(ch); });
    order.sort((a, b) => { const ia = catOrder.findIndex(c => a.includes(c)), ib = catOrder.findIndex(c => b.includes(c)); if (ia !== -1 && ib !== -1) return ia - ib; if (ia !== -1) return -1; if (ib !== -1) return 1; return a.localeCompare(b); });
    return { groups, order };
  }, [channels]);
  const filtered = useMemo(() => {
    if (selectedCategory && selectedCategory !== 'Tất Cả') return grouped.groups[selectedCategory] ? { [selectedCategory]: grouped.groups[selectedCategory] } : {};
    return Object.fromEntries(grouped.order.map(g => [g, grouped.groups[g]]));
  }, [grouped, selectedCategory]);
  if (isLoading) return <div className="max-w-[1500px] mx-auto px-8 py-8"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">{Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-[4/3] bg-slate-800/40 rounded-2xl animate-pulse" />)}</div></div>;
  return (
    <div className="max-w-[1500px] mx-auto px-3 md:px-8 py-6 space-y-10 pb-32">
      {categories.length > 0 && <div className="flex gap-2 overflow-x-auto pb-2">{[...categories].map(cat => (
        <button key={cat} onClick={() => setSelectedCategory(cat)}
          className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${selectedCategory === cat ? 'bg-red-600 text-white shadow-lg shadow-red-600/30' : 'bg-slate-800/80 border border-slate-700/50 text-slate-300'}`}>{cat}</button>
      ))}</div>}
      {Object.entries(filtered).map(([groupName, groupChannels]) => (
        <section key={groupName}>
          <div className="flex items-center gap-2 mb-4"><div className="w-1 h-6 bg-red-600 rounded-full" /><h2 className="text-xl md:text-2xl font-black text-white">{groupName}</h2><span className="text-xs text-slate-500 ml-2">{groupChannels.length} kênh</span></div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 md:gap-4">
            {groupChannels.map(ch => {
              const epg = findEpgForChannel(epgData?.programmes, ch);
              const isFav = favorites.includes(ch.channel_id);
              return (
                <div key={ch.channel_id} className="rounded-2xl bg-gradient-to-b from-slate-800/60 to-slate-900/60 border border-slate-700/40 hover:border-red-500/40 overflow-hidden cursor-pointer transition-all hover:-translate-y-0.5" onClick={() => onSelectChannel(ch)}>
                  <div className="relative aspect-[16/9] bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center overflow-hidden">
                    {ch.logo ? <img src={ch.logo} alt="" className="w-14 h-14 object-contain z-10 drop-shadow-lg" onError={e => { e.target.style.display = 'none'; }} /> : <span className="text-4xl font-black text-white/20">{ch.name?.charAt(0)}</span>}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
                    <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded-md"><span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />LIVE</div>
                    {epg?.now && <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/90 to-transparent"><p className="text-xs text-white font-medium truncate">{epg.now.title}</p><p className="text-[9px] text-slate-400">{formatTimeHHMM(epg.now.start)}</p></div>}
                  </div>
                  <div className="p-3 md:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1"><p className="font-bold text-sm text-white truncate">{ch.name}</p><p className="text-xs text-slate-500 truncate">{epg?.now?.title || 'Đang phát trực tiếp'}</p></div>
                      <button onClick={e => { e.stopPropagation(); onToggleFavorite(ch.channel_id); }}
                        className={`shrink-0 p-1.5 rounded-lg ${isFav ? 'text-red-500 bg-red-500/10' : 'text-slate-600 hover:text-slate-400'}`}>
                        <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-red-500' : ''}`} />
                      </button>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onSelectChannel(ch); }} className="mt-2.5 w-full py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg"><Play className="w-3 h-3 inline mr-1" />Xem Ngay</button>
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