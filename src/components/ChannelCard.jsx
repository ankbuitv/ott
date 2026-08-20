import React from 'react';
import { Heart, Radio, Play } from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';

/**
 * ChannelCard - Thẻ hiển thị thông tin Kênh Truyền Hình
 * Tác giả: CHRTV OTT Full-stack Architect
 */
export default function ChannelCard({
  channel,
  isSelected = false,
  isFavorite = false,
  onSelect,
  onToggleFavorite,
  epgNow = null,
}) {
  return (
    <FocusableWrapper
      onClick={() => onSelect(channel)}
      className={`group relative rounded-2xl bg-slate-900/80 border p-4 flex flex-col justify-between overflow-hidden shadow-xl transition-all duration-300 ${
        isSelected
          ? 'border-red-600 bg-red-950/20 shadow-red-600/30 ring-2 ring-red-600'
          : 'border-slate-800/80 hover:border-slate-700'
      }`}
    >
      {/* Nút Yêu Thích (Heart) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite(channel.channel_id);
        }}
        className="absolute top-3 right-3 p-2 rounded-full bg-black/40 hover:bg-black/80 text-slate-400 hover:text-red-500 transition-colors z-20"
      >
        <Heart className={`w-4 h-4 ${isFavorite ? 'fill-red-600 text-red-600' : ''}`} />
      </button>

      {/* Logo & Tên Kênh */}
      <div className="flex items-center gap-3.5 mb-3">
        <div className="relative w-14 h-14 rounded-xl bg-slate-950 p-2 border border-slate-800 shrink-0 flex items-center justify-center overflow-hidden">
          <img
            src={channel.logo || 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png'}
            alt={channel.name}
            className="w-full h-full object-contain transition-transform group-hover:scale-110"
            onError={(e) => { e.target.src = 'https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png'; }}
          />
        </div>

        <div className="overflow-hidden">
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest block mb-0.5">
            {channel.group_title || 'TỔNG HỢP'}
          </span>
          <h3 className="font-bold text-white text-base truncate group-hover:text-red-400 transition-colors">
            {channel.name}
          </h3>
        </div>
      </div>

      {/* EPG Program Preview ngắn */}
      <div className="bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60 mt-auto">
        <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-1">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <Radio className="w-3 h-3 animate-pulse" /> Trực Tiếp
          </span>
          <Play className="w-3 h-3 text-slate-500 group-hover:text-red-500 transition-colors" />
        </div>
        <p className="text-xs font-semibold text-slate-200 truncate">
          {epgNow ? epgNow.title : 'Chương trình phát sóng CHRTV'}
        </p>
      </div>
    </FocusableWrapper>
  );
}
