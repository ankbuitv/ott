import React from 'react';
export default function ChannelInfoModal({channel,epgNow,epgNext,isFavorite,onPlay,onToggleFavorite,onClose}) {
  if (!channel) return null;
  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-sm w-full" onClick={e=>e.stopPropagation()}>
      <h2 className="text-white font-bold text-lg">{channel.name}</h2>
      <p className="text-slate-400 text-xs mb-4">{channel.group_title}</p>
      {epgNow&&<div className="bg-slate-800/50 rounded-xl p-3 mb-3"><p className="text-xs text-slate-500">Đang phát</p><p className="text-sm font-bold text-white">{epgNow.title}</p></div>}
      <button onClick={()=>onPlay(channel)} className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl">Xem</button>
    </div>
  </div>;
}
