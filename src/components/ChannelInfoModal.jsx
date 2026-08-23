import React from 'react';

export default function ChannelInfoModal({ channel, epgNow, epgNext, isFavorite, onPlay, onToggleFavorite, onClose }) {
  if (!channel) return null;
  
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-4 mb-4">
          {channel.logo && (
            <img src={channel.logo} alt="" className="w-14 h-14 object-contain rounded-xl bg-slate-800 p-2" onError={e => { e.target.style.display = 'none'; }} />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-bold text-lg">{channel.name}</h2>
            <p className="text-slate-400 text-xs">{channel.group_title}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {epgNow && (
          <div className="bg-slate-800/50 rounded-xl p-3 mb-4">
            <p className="text-xs text-slate-500 mb-1">Đang phát</p>
            <p className="text-sm font-bold text-white">{epgNow.title}</p>
          </div>
        )}
        {epgNext && (
          <div className="bg-slate-800/30 rounded-xl p-3 mb-4">
            <p className="text-xs text-slate-500 mb-1">Tiếp theo</p>
            <p className="text-sm font-bold text-white">{epgNext.title}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={() => onPlay(channel)} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-red-600/20">Xem</button>
          <button onClick={() => onToggleFavorite(channel.channel_id)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border ${isFavorite ? 'border-red-500 text-red-500 bg-red-500/10' : 'border-slate-600 text-slate-400 hover:text-white hover:border-slate-500'}`}>
            {isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}
          </button>
        </div>
      </div>
    </div>
  );
}