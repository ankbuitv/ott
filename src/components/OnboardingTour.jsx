import React, { useState, useEffect } from 'react';
import { Tv, Film, Trophy, Crown, ArrowRight, X } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

/**
 * Welcome popup (kiểu mytv dd-auth) — hiện:
 *  1. Lần đầu vào web (localStorage `chrtv_welcomed` chưa set)
 *  2. Sau khi đăng nhập lần đầu trong session (sessionStorage `chrtv_welcomed_session`)
 */
export default function OnboardingTour({ forceShow = false, onLogin = false }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (forceShow) { setVisible(true); return; }
    let show = false;
    try {
      const firstEver = !localStorage.getItem('chrtv_welcomed');
      const afterLogin = onLogin && !sessionStorage.getItem('chrtv_welcomed_session');
      if (firstEver || afterLogin) {
        show = true;
        if (afterLogin) sessionStorage.setItem('chrtv_welcomed_session', '1');
      }
    } catch { show = false; }
    if (show) {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
  }, [forceShow, onLogin]);

  const close = () => {
    try {
      localStorage.setItem('chrtv_welcomed', '1');
      sessionStorage.setItem('chrtv_welcomed_session', '1');
    } catch {}
    setVisible(false);
  };

  if (!visible) return null;

  const feats = [
    { icon: Tv, text: t('welcome.f1'), color: 'bg-sky-500/15 text-sky-400' },
    { icon: Film, text: t('welcome.f2'), color: 'bg-purple-500/15 text-purple-400' },
    { icon: Trophy, text: t('welcome.f3'), color: 'bg-emerald-500/15 text-emerald-400' },
    { icon: Crown, text: t('welcome.f4'), color: 'bg-[#f36f21]/15 text-[#ff9a3d]' },
  ];

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 anim-fade-in flex items-center justify-center p-4" onClick={close}>
      <div
        className="bg-[#17171b] border border-[#2a2a30] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden anim-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header mytv: gradient cam + logo */}
        <div className="relative h-24 bg-gradient-to-br from-[#3a1508] via-[#7a2f0e] to-[#c8571d] flex items-center justify-center">
          <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(80% 120% at 70% 20%, rgba(255,154,61,.5), transparent 60%)' }}></div>
          <div className="relative text-4xl font-black italic tracking-tight text-white drop-shadow-lg">
            CHR<span className="text-[#ffd9a8]">TV</span>
          </div>
          <button onClick={close} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          <h3 className="text-lg font-black text-white mb-1">{t('welcome.title')} 👋</h3>
          <p className="text-xs text-[#9b9ba3] mb-5">{t('welcome.sub')}</p>

          <div className="space-y-2.5 mb-6">
            {feats.map(({ icon: Ic, text, color }, i) => (
              <div key={i} className="flex items-center gap-3 anim-fade-up" style={{ animationDelay: `${i * 70 + 100}ms` }}>
                <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                  <Ic className="" style={{ width: 18, height: 18 }} />
                </span>
                <span className="text-[13px] text-[#d6d6dc] leading-snug">{text}</span>
              </div>
            ))}
          </div>

          <button onClick={close} className="w-full btn-orange text-white font-extrabold text-sm py-3.5 rounded-xl flex items-center justify-center gap-2">
            {t('welcome.cta')} <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={close} className="w-full mt-2 py-2.5 text-[12px] font-semibold text-[#9b9ba3] hover:text-white transition">
            {t('welcome.later')}
          </button>
        </div>
      </div>
    </div>
  );
}
