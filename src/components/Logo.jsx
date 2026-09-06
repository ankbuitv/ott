import React from 'react';
import { getAvatar } from '../contexts/ProfileContext';

// ===== Logo mark 3D: nút play gradient cyan→cam, chữ A bên trong =====
function LogoMark3D({ className = '' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="chr-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.42" stopColor="#38bdf8" />
          <stop offset="0.7" stopColor="#818cf8" />
          <stop offset="1" stopColor="#f36f21" />
        </linearGradient>
        <linearGradient id="chr-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.6" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="chr-tri" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cffafe" />
        </linearGradient>
      </defs>
      {/* Khối 3D phía dưới */}
      <rect x="7" y="10" width="52" height="52" rx="16" fill="#08222e" />
      <rect x="6" y="8" width="52" height="52" rx="16" fill="#0e3a4d" />
      <rect x="5" y="6" width="52" height="52" rx="16" fill="#155e75" />
      {/* Mặt nút gradient */}
      <rect x="4" y="4" width="52" height="52" rx="16" fill="url(#chr-face)" />
      <rect x="4" y="4" width="52" height="52" rx="16" fill="url(#chr-glass)" />
      {/* Nút play */}
      <path d="M24 19.5v25l20.5-12.5z" fill="url(#chr-tri)" opacity="0.96" />
      {/* Chữ A */}
      <text
        x="32.5"
        y="43"
        textAnchor="middle"
        fontSize="21"
        fontWeight="900"
        fontFamily="Inter, system-ui, sans-serif"
        fill="#0b1c2c"
        letterSpacing="0"
      >
        A
      </text>
    </svg>
  );
}

// Logo CHRTV PLAY — icon 3D + chữ gradient
export default function Logo({ size = 'md', showSubtext = true, className = '' }) {
  const sizes = {
    sm: { main: 'text-sm', play: 'text-[10px]', sub: 'text-[7px]', icon: 'w-7 h-7' },
    md: { main: 'text-lg', play: 'text-xs', sub: 'text-[8px]', icon: 'w-9 h-9' },
    lg: { main: 'text-2xl', play: 'text-sm', sub: 'text-[10px]', icon: 'w-11 h-11' },
    xl: { main: 'text-4xl', play: 'text-xl', sub: 'text-xs', icon: 'w-16 h-16' },
  }[size] || { main: 'text-lg', play: 'text-xs', sub: 'text-[8px]', icon: 'w-9 h-9' };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`${sizes.icon} shrink-0 transition-transform duration-200 hover:scale-110 hover:-rotate-3`}
        style={{ filter: 'drop-shadow(0 4px 10px rgba(34,211,238,.35)) drop-shadow(0 6px 14px rgba(243,111,33,.35))' }}
      >
        <LogoMark3D className="w-full h-full" />
      </div>

      <div className="flex flex-col leading-none">
        <span className="flex items-baseline gap-1.5">
          <span className={`${sizes.main} font-black tracking-tight text-white`}>CHRTV</span>
          <span className={`${sizes.play} font-black tracking-[0.22em] text-grad`}>PLAY</span>
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
