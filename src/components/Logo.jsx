import React from 'react';
import { getAvatar } from '../contexts/ProfileContext';
import { useI18n } from '../contexts/I18nContext';

export const REWARD_IMG = 'https://i.ibb.co/C3R51nH4/reward.png';
export const MAIN_LOGO_URL = 'https://i.ibb.co/VcLxwgM2/logo.png';
export const MAIN_LOGO_SVG = '/logo.svg';

function LogoMark({ className = '' }) {
  return (
    <img
      src={MAIN_LOGO_URL}
      alt="CHRTV PLAY"
      className={`${className} object-contain`}
      loading="eager"
      decoding="async"
      onError={(e) => {
        // fallback to local svg if external fails
        if (e.currentTarget.src !== window.location.origin + MAIN_LOGO_SVG) {
          e.currentTarget.src = MAIN_LOGO_SVG;
        }
      }}
    />
  );
}

export default function Logo({ size = 'md', showSubtext = true, className = '' }) {
  const { t } = useI18n();
  const sizes = {
    sm: { wrap: 'gap-2', logo: 'h-8', sub: 'text-[7px]', reward: 'h-8' },
    md: { wrap: 'gap-2.5', logo: 'h-10', sub: 'text-[8px]', reward: 'h-10' },
    lg: { wrap: 'gap-2.5', logo: 'h-12', sub: 'text-[9px]', reward: 'h-12' },
    xl: { wrap: 'gap-3', logo: 'h-16', sub: 'text-[11px]', reward: 'h-16' },
  }[size] || { wrap: 'gap-2.5', logo: 'h-10', sub: 'text-[8px]', reward: 'h-10' };

  return (
    <div className={`flex items-center ${sizes.wrap} ${className}`}>
      <img
        src={MAIN_LOGO_URL}
        alt="CHRTV PLAY"
        className={`${sizes.logo} w-auto object-contain object-left shrink-0 transition-transform duration-200 hover:scale-[1.03]`}
        style={{ filter: 'drop-shadow(0 4px 14px rgba(243,111,33,.35))' }}
        loading="eager"
        decoding="async"
        onError={(e) => {
          // fallback to local svg
          if (!e.currentTarget.dataset.fallback) {
            e.currentTarget.dataset.fallback = '1';
            e.currentTarget.src = MAIN_LOGO_SVG;
          }
        }}
      />

      {showSubtext && (
        <span className={`${sizes.sub} hidden md:block font-semibold tracking-[0.14em] text-stone-500 ml-1 uppercase truncate`}>
          {t('app.tagline')}
        </span>
      )}

      <img
        src={REWARD_IMG}
        alt=""
        className={`${sizes.reward} hidden md:block w-auto max-w-[4.5rem] shrink-0 object-contain object-center ml-1`}
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
