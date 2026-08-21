import React from 'react';
import { getAvatar } from '../contexts/ProfileContext';

// Logo CHRTV - Clean, bold "CHRTV" with red accent
export default function Logo({ size = 'md', showSubtext = true, className = '' }) {
  const sizes = {
    sm: { text: 'text-sm', sub: 'text-[7px]', icon: 'w-5 h-5', ic: 'w-3 h-3' },
    md: { text: 'text-base', sub: 'text-[8px]', icon: 'w-7 h-7', ic: 'w-4 h-4' },
    lg: { text: 'text-2xl', sub: 'text-[10px]', icon: 'w-9 h-9', ic: 'w-5 h-5' },
    xl: { text: 'text-4xl', sub: 'text-xs', icon: 'w-14 h-14', ic: 'w-7 h-7' },
  }[size] || { text: 'text-base', sub: 'text-[8px]', icon: 'w-7 h-7', ic: 'w-4 h-4' };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`${sizes.icon} bg-gradient-to-br from-red-500 to-red-700 rounded-md flex items-center justify-center shadow-lg shadow-red-600/20 relative overflow-hidden shrink-0`}>
        <svg className={`${sizes.ic} text-white relative z-10`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/15 to-transparent"></div>
      </div>

      <div className="flex flex-col leading-none">
        <span className={`${sizes.text} font-black tracking-tight text-white`}>CHRTV</span>
        {showSubtext && (
          <span className={`${sizes.sub} font-bold tracking-[0.2em] text-red-400/90 mt-0.5`}>
            IPTV · LIVE
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
