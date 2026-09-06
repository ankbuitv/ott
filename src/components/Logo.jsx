import React from 'react';
import { getAvatar } from '../contexts/ProfileContext';
import { useI18n } from '../contexts/I18nContext';

export const REWARD_IMG = 'https://i.ibb.co/C3R51nH4/reward.png';

function LogoMark({ className = '' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="chr-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1c1d24" />
          <stop offset="1" stopColor="#0c0d12" />
        </linearGradient>
        <linearGradient id="chr-play" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb37a" />
          <stop offset="0.45" stopColor="#f36f21" />
          <stop offset="1" stopColor="#d63c0f" />
        </linearGradient>
        <linearGradient id="chr-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#chr-tile)" />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="17" fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1.5" />
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#chr-edge)" />
      <circle cx="32" cy="32" r="16.5" fill="none" stroke="url(#chr-play)" strokeWidth="4.5" />
      <path d="M28.6 24.2v15.6c0 1.15 1.25 1.86 2.22 1.26l11.4-7.05a1.5 1.5 0 0 0 0-2.52l-11.4-7.05c-.97-.6-2.22.11-2.22 1.26z" fill="url(#chr-play)" />
      <circle cx="46.5" cy="17.5" r="2.6" fill="#f36f21" />
      <circle cx="46.5" cy="17.5" r="2.6" fill="#ffffff" opacity="0.25" />
    </svg>
  );
}

export default function Logo({ size = 'md', showSubtext = true, className = '' }) {
  const { t } = useI18n();
  const sizes = {
    sm: { main: 'text-[15px]', play: 'text-[8px] px-1.5 py-0.5', sub: 'text-[7px]', icon: 'w-8 h-8', reward: 'h-8' },
    md: { main: 'text-xl', play: 'text-[9px] px-2 py-[3px]', sub: 'text-[8px]', icon: 'w-10 h-10', reward: 'h-10' },
    lg: { main: 'text-[26px]', play: 'text-[10px] px-2 py-1', sub: 'text-[9px]', icon: 'w-12 h-12', reward: 'h-12' },
    xl: { main: 'text-4xl', play: 'text-xs px-2.5 py-1', sub: 'text-[11px]', icon: 'w-16 h-16', reward: 'h-16' },
  }[size] || { main: 'text-xl', play: 'text-[9px] px-2 py-[3px]', sub: 'text-[8px]', icon: 'w-10 h-10', reward: 'h-10' };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`${sizes.icon} shrink-0 transition-transform duration-200 hover:scale-105`}
        style={{ filter: 'drop-shadow(0 4px 14px rgba(243,111,33,.4))' }}
      >
        <LogoMark className="w-full h-full" />
      </div>

      <div className="flex flex-col leading-none">
        <span className="flex items-center gap-1.5">
          <span className={`${sizes.main} font-black tracking-tight text-white`}>CHRTV</span>
          <span className={`${sizes.play} font-black tracking-[0.18em] text-white rounded-md grad-brand shadow-lg shadow-[#f36f21]/30`}>PL▷Y</span>
        </span>
        {showSubtext && (
          <span className={`${sizes.sub} font-semibold tracking-[0.14em] text-stone-500 mt-1 uppercase`}>
            {t('app.tagline')}
          </span>
        )}
      </div>

      <img
        src={REWARD_IMG}
        alt=""
        className={`${sizes.reward} w-auto max-w-[4.5rem] shrink-0 object-contain object-center`}
      />
    </div>
  );
}

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
