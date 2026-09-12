import React from 'react';
import { getAvatar } from '../contexts/ProfileContext';
import { useI18n } from '../contexts/I18nContext';

export const REWARD_IMG = 'https://i.ibb.co/C3R51nH4/reward.png';
export const MAIN_LOGO_URL = 'https://i.ibb.co/VcLxwgM2/logo.png';
export const MAIN_LOGO_SVG = '/logo.svg';

function LogoMark({ className = '' }) {
  let src = MAIN_LOGO_URL;
  try {
    const raw = localStorage.getItem('chrtv_active_theme_v1');
    if (raw) {
      const th = JSON.parse(raw);
      if (th && th.logo_url) src = th.logo_url;
    }
  } catch {}
  return (
    <img
      src={src}
      alt="CHRTV PLAY"
      className={`${className} object-contain`}
      loading="eager"
      decoding="async"
      onError={(e) => {
        if (e.currentTarget.src !== window.location.origin + MAIN_LOGO_SVG) {
          e.currentTarget.src = MAIN_LOGO_SVG;
        }
      }}
    />
  );
}

export default function Logo({ size = 'md', showSubtext = true, className = '' }) {
  const { t } = useI18n();
  const [themeLogo, setThemeLogo] = React.useState('');
  React.useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem('chrtv_active_theme_v1');
        if (raw) {
          const th = JSON.parse(raw);
          if (th && th.logo_url) { setThemeLogo(th.logo_url); return; }
        }
      } catch {}
      setThemeLogo('');
    };
    read();
    const onStorage = (e) => { if (!e || e.key === 'chrtv_active_theme_v1') read(); };
    const onCustom = () => read();
    window.addEventListener('storage', onStorage);
    window.addEventListener('chrtv-theme-change', onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('chrtv-theme-change', onCustom);
    };
  }, []);
  const logoSrc = themeLogo || MAIN_LOGO_URL;
  const sizes = {
    sm: { wrap: 'gap-2', icon: 'w-7 h-7 sm:w-8 sm:h-8', main: 'text-[13px] sm:text-[15px]', play: 'text-[7px] sm:text-[8px] px-1 sm:px-1.5 py-0.5', sub: 'text-[7px]', reward: 'h-8' },
    md: { wrap: 'gap-2.5', icon: 'w-10 h-10', main: 'text-xl', play: 'text-[9px] px-2 py-[3px]', sub: 'text-[8px]', reward: 'h-10' },
    lg: { wrap: 'gap-2.5', icon: 'w-12 h-12', main: 'text-[26px]', play: 'text-[10px] px-2 py-1', sub: 'text-[9px]', reward: 'h-12' },
    xl: { wrap: 'gap-3', icon: 'w-16 h-16', main: 'text-4xl', play: 'text-xs px-2.5 py-1', sub: 'text-[11px]', reward: 'h-16' },
  }[size] || { wrap: 'gap-2.5', icon: 'w-10 h-10', main: 'text-xl', play: 'text-[9px] px-2 py-[3px]', sub: 'text-[8px]', reward: 'h-10' };

  return (
    <div className={`flex items-center ${sizes.wrap} ${className}`}>
      <img
        src={logoSrc}
        alt="CHRTV PLAY"
        className={`${sizes.icon} shrink-0 object-contain transition-transform duration-200 hover:scale-105`}
        style={{ filter: 'drop-shadow(0 4px 14px rgba(243,111,33,.4))' }}
        loading="eager"
        decoding="async"
        onError={(e) => {
          if (!e.currentTarget.dataset.fallback) {
            e.currentTarget.dataset.fallback = '1';
            e.currentTarget.src = e.currentTarget.src === logoSrc && logoSrc !== MAIN_LOGO_URL ? MAIN_LOGO_URL : MAIN_LOGO_SVG;
          }
        }}
      />

      <div className="flex flex-col leading-none min-w-0">
        <span className="flex items-center gap-1 sm:gap-1.5">
          <span className={`${sizes.main} font-black tracking-tight text-white`}>CHRTV</span>
          <span className={`${sizes.play} font-black tracking-[0.18em] text-white rounded-md grad-brand shadow-lg shadow-[#f36f21]/30`}>PL▷Y</span>
        </span>
        {showSubtext && (
          <span className={`${sizes.sub} hidden md:block font-semibold tracking-[0.14em] text-stone-500 mt-1 uppercase truncate`}>
            {t('app.tagline')}
          </span>
        )}
      </div>

      <img
        src={REWARD_IMG}
        alt="reward"
        className={`${sizes.reward} block w-auto max-w-[3.5rem] md:max-w-[4.5rem] shrink-0 object-contain object-center ml-1`}
        loading="eager"
        decoding="async"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
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
