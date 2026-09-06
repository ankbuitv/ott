import React from 'react';
import { getAvatar } from '../contexts/ProfileContext';
import { useI18n } from '../contexts/I18nContext';

export const REWARD_IMG = 'https://i.ibb.co/C3R51nH4/reward.png';

export default function Logo({ size = 'md', showSubtext = true, className = '' }) {
  const { t } = useI18n();
  const sizes = {
    sm: { main: 'text-[15px]', play: 'text-[15px]', sub: 'text-[7px]', icon: 'w-8 h-8' },
    md: { main: 'text-xl', play: 'text-xl', sub: 'text-[8px]', icon: 'w-10 h-10' },
    lg: { main: 'text-[26px]', play: 'text-[26px]', sub: 'text-[9px]', icon: 'w-12 h-12' },
    xl: { main: 'text-4xl', play: 'text-4xl', sub: 'text-[11px]', icon: 'w-16 h-16' },
  }[size] || { main: 'text-xl', play: 'text-xl', sub: 'text-[8px]', icon: 'w-10 h-10' };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img
        src={REWARD_IMG}
        alt=""
        className={`${sizes.icon} shrink-0 rounded-xl object-cover object-center ring-1 ring-white/15`}
        style={{ filter: 'drop-shadow(0 4px 14px rgba(243,111,33,.45))' }}
      />
      <div className="flex flex-col leading-none">
        <span className={`${sizes.main} font-black tracking-tight text-white`}>
          CHRTV PL<span className="text-[#f36f21]">▷</span>Y
        </span>
        {showSubtext && (
          <span className={`${sizes.sub} font-semibold tracking-[0.08em] text-stone-500 mt-1 uppercase`}>
            {t('app.tagline')}
          </span>
        )}
      </div>
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
