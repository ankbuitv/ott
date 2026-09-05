import React from 'react';
import { X, Radio, Globe, Clock, Heart, Play, Tv } from 'lucide-react';
import { formatTimeHHMM } from '../utils/dateUtils';

export default function ChannelInfoModal({ channel, epgNow, epgNext, isFavorite, onPlay, onToggleFavorite, onClose }) {
  if (!channel) return null;
  return (
    <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#13151c] border border-slate-800/60 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="relative p-5 text-center">
          <button onClick={onClose} className="absolute top-3 right-3 p-1 hover:bg-slate-800 rounded-lg">
            <X className="w-4 h-4 text-slate-400" />
          </button>

          <img
            src={channel.logo || 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png'}
            alt={channel.name}
            className="w-20 h-20 object-contain mx-auto rounded-2xl bg-slate-900 p-2 border border-slate-800/50 mb-3"
            onError={e => { e.target.style.display = 'none'; }}
          />

          <h2 className="text-lg font-extrabold text-white mb-1">{channel.name}</h2>
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#f36f21]/80 text-white">{channel.group_title || 'Tổng hợp'}</span>
            {epgNow && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-600/80 text-white flex items-center gap-0.5">
                <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
              </span>
            )}
          </div>
        </div>

        <div className="px-5 pb-3 space-y-2.5">
          {epgNow && (
            <div className="bg-slate-900/60 rounded-lg p-2.5 border border-slate-800/30">
              <div className="text-[10px] text-[#ff9a3d] font-semibold uppercase mb-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Đang phát
              </div>
              <p className="text-xs font-bold text-white truncate">{epgNow.title}</p>
              <p className="text-[10px] text-slate-500">{formatTimeHHMM(epgNow.start)} - {formatTimeHHMM(epgNow.stop)}</p>
            </div>
          )}
          {epgNext && (
            <div className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-800/20">
              <div className="text-[10px] text-slate-500 font-semibold uppercase mb-0.5">Tiếp theo</div>
              <p className="text-xs font-medium text-slate-300 truncate">{epgNext.title}</p>
              <p className="text-[10px] text-slate-600">{formatTimeHHMM(epgNext.start)}</p>
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1"><Globe className="w-3 h-3" /> ID</span>
              <span className="text-slate-300 font-mono text-[10px]">{channel.channel_id}</span>
            </div>
            {channel.catchup_type && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Catchup</span>
                <span className="text-slate-300 text-[10px]">{channel.catchup_type} ({channel.catchup_days || 7} ngày)</span>
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-4 flex gap-2">
          <button
            onClick={() => { onToggleFavorite(channel.channel_id); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
              isFavorite ? 'bg-[#f36f21]/20 text-[#ff9a3d] border border-[#f36f21]/40' : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-[#f36f21]' : ''}`} />
            {isFavorite ? 'Bỏ thích' : 'Yêu thích'}
          </button>
          <button
            onClick={() => { onPlay(channel); onClose(); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-[#f36f21] text-white hover:bg-[#f36f21] transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Xem ngay
          </button>
        </div>
      </div>
    </div>
  );
}
