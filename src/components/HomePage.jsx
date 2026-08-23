import React from 'react';
export default function HomePage({channels,epgData,favorites,watchHistory,onSelectChannel,onPlayCatchup,onToggleFavorite,selectedCategory,setSelectedCategory,categories,searchQuery,setSearchQuery,isLoading}) {
  if (isLoading) return <div className="flex items-center justify-center py-20"><span className="text-slate-400">Đang tải...</span></div>;
  return <div className="max-w-[1400px] mx-auto px-8 py-8 space-y-8 pb-32">
    <div className="flex gap-2 overflow-x-auto pb-2">
      {categories.map(cat => (
        <button key={cat} onClick={()=>setSelectedCategory(cat)}
          className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap ${selectedCategory===cat?'bg-red-600 text-white':'bg-slate-900 text-slate-300'}`}>{cat}</button>
      ))}
    </div>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {channels.filter(ch => selectedCategory==='Tất Cả'||ch.group_title===selectedCategory).map(ch => (
        <div key={ch.channel_id} onClick={()=>onSelectChannel(ch)} className="rounded-2xl bg-stone-900/40 border border-stone-800 hover:border-red-500/40 overflow-hidden cursor-pointer">
          <div className="aspect-[4/3] bg-gradient-to-br from-stone-700 to-stone-900 flex items-center justify-center">
            {ch.logo ? <img src={ch.logo} alt="" className="w-16 h-16 object-contain" onError={e=>e.target.style.display='none'}/> : <span className="text-4xl text-white/30">{ch.name?.charAt(0)}</span>}
            <div className="absolute top-3 left-3 px-2 py-0.5 bg-red-600 text-[10px] font-bold rounded">LIVE</div>
          </div>
          <div className="p-4"><p className="font-bold text-base text-white">{ch.name}</p><p className="text-[11px] text-stone-500">{ch.group_title}</p></div>
        </div>
      ))}
    </div>
  </div>;
}