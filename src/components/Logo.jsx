import React from 'react';
import { getAvatar } from '../contexts/ProfileContext';

// Logo CHRTV PLAY — nút play gradient cam/đỏ trên nền kính mờ + chữ trắng/cam
export default function Logo({ size = 'md', showSubtext = true, className = '' }) {
  const sizes = {
    sm: { main: 'text-sm', play: 'text-[10px]', sub: 'text-[7px]', icon: 'w-6 h-6', ic: 'w-3 h-3', badge: 'text-[8px] px-1 py-px' },
    md: { main: 'text-lg', play: 'text-xs', sub: 'text-[8px]', icon: 'w-8 h-8', ic: 'w-4 h-4', badge: 'text-[9px] px-1.5 py-px' },
    lg: { main: 'text-2xl', play: 'text-sm', sub: 'text-[10px]', icon: 'w-10 h-10', ic: 'w-5 h-5', badge: 'text-[10px] px-2 py-0.5' },
    xl: { main: 'text-4xl', play: 'text-xl', sub: 'text-xs', icon: 'w-14 h-14', ic: 'w-7 h-7', badge: 'text-xs px-2.5 py-0.5' },
  }[size] || { main: 'text-lg', play: 'text-xs', sub: 'text-[8px]', icon: 'w-8 h-8', ic: 'w-4 h-4', badge: 'text-[9px] px-1.5 py-px' };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`${sizes.icon} rounded-xl bg-gradient-to-br from-[#ff8a2a] via-[#f36f21] to-[#c81d4e] flex items-center justify-center shadow-lg shadow-[#f36f21]/30 relative overflow-hidden shrink-0 ring-1 ring-white/20`}>
        <svg className={`${sizes.ic} text-white relative z-10 ml-px`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent"></div>
        <div className="absolute -bottom-1 -right-1 w-1/2 h-1/2 bg-white/10 rounded-full blur-[2px]"></div>
      </div>

      <div className="flex flex-col leading-none">
        <span className="flex items-center gap-1.5">
          <span className={`${sizes.main} font-black tracking-tight text-white`}>CHRTV</span>
          <span className={`${sizes.badge} font-black tracking-widest text-white bg-gradient-to-r from-[#ff8a2a] to-[#c81d4e] rounded-md shadow shadow-[#f36f21]/40`}>PLAY</span>
        </span>
        {showSubtext && (
          <span className={`${sizes.sub} font-bold tracking-[0.18em] text-stone-400 mt-1`}>
            TRUYỀN HÌNH · PHIM · THỂ THAO
          </span>
        )}
      </div>
    </div>
  );
}

// Avatar bubble for profile (uses ProfileContext directly)
export function AvatarBubble({ avatarId, size = 'lg', name = '', ring = false }) {
  const a = getAvatar(avatarId);
  const sizeCls = {
    sm: 'w-8 h-8 text-base rounded-md',
    md: 'w-12 h-12 text-xl rounded-md',
    lg: 'w-24 h-24 md:w-32 md:h-32 text-3xl md:text-4xl rounded-lg',
    xl: 'w-40 h-40 text-5xl rounded-xl'
  }[size];

  const initial = (name || '?')[0].toUpperCase();

  return (
    <div className={`${sizeCls} aspect-square bg-gradient-to-br ${a.color} flex items-center justify-center text-white relative overflow-hidden ${ring ? 'ring-4 ring-white shadow-2xl' : ''}`}>
      <span className="relative z-10 font-bold">{a.emoji || initial}</span>
      <div className="absolute inset-0 bg-gradient-to-tr from-black/30 via-transparent to-white/15"></div>
    </div>
  );
}
