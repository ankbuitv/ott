import React from 'react';
export default function ChannelInfoModal({channel,epgNow,epgNext,isFavorite,onPlay,onToggleFavorite,onClose}) {
  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
    <div className="bg-slate-900 rounded-2xl p-6 max-w-sm w-full" onClick={e=>e.stopPropagation()}>
      <h2 className="text-white font-bold text-lg mb-2">{channel?.name}</h2>
      <p className="text-slate-400 text-sm mb-4">{channel?.group_title}</p>
      {epgNow && <p className="text-xs text-slate-300">Đang phát: {epgNow.title}</p>}
      <button onClick={()=>onPlay(channel)} className="mt-4 w-full py-2 bg-red-600 text-white rounded-xl font-bold">Xem</button>
    </div>
  </div>;
}