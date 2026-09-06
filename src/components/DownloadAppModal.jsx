import React, { useEffect, useState } from 'react';
import { Download, Smartphone, X, Check } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

export const APK_URL = 'https://ankb.qzz.io/apk';

export default function DownloadAppModal({ onClose }) {
  const { t } = useI18n();
  const [pct, setPct] = useState(0);
  const done = pct >= 100;

  useEffect(() => {
    const start = performance.now();
    const dur = 1700;
    let raf = 0;
    const tick = (now) => {
      const p = Math.min(100, Math.round(((now - start) / dur) * 100));
      setPct(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop z-[160]" onClick={onClose}>
      <div
        className="modal-panel w-full max-w-[420px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-xl bg-black/40 hover:bg-black/60 text-stone-300 hover:text-white"
          aria-label={t('common.close')}
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative h-[240px] overflow-hidden bg-[#07080c]">
          <div className="absolute -left-10 -top-16 w-56 h-56 rounded-full bg-[#f36f21]/25 blur-3xl" />
          <div className="absolute -right-8 -bottom-10 w-52 h-52 rounded-full bg-cyan-400/20 blur-3xl" />
          <img
            src="/app-phone.png"
            alt="CHRTV PLAY"
            className="apk-phone relative z-[1] mx-auto h-[260px] w-auto object-contain drop-shadow-[0_24px_40px_rgba(0,0,0,.7)]"
          />
          <div className="apk-icon absolute left-5 top-5 z-[2] w-14 h-14 rounded-2xl bg-[#14151c] border border-white/15 shadow-xl shadow-[#f36f21]/30 p-2">
            <img src="/logo.svg" alt="" className="w-full h-full" />
          </div>
        </div>

        <div className="px-6 pt-5 pb-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff9a3d] mb-1">{t('apk.kicker')}</p>
          <h2 className="text-[22px] font-black text-white tracking-tight">{t('apk.title')}</h2>
          <p className="text-[12px] text-stone-400 mt-1.5 leading-relaxed">{t('apk.sub')}</p>

          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
              <span className="text-stone-300 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-[#ff9a3d]" />
                {done ? t('apk.ready') : t('apk.preparing')}
              </span>
              <span className={done ? 'text-emerald-400' : 'text-[#ff9a3d]'}>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full grad-brand apk-bar"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {done ? (
            <a
              href={APK_URL}
              className="mt-5 flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl grad-brand text-white text-[14px] font-black anim-glow active:scale-[0.98]"
            >
              <Download className="w-4 h-4" /> {t('apk.download')}
            </a>
          ) : (
            <div className="mt-5 w-full py-3.5 rounded-2xl bg-white/5 border border-white/8 text-center text-[13px] font-bold text-stone-500">
              {t('apk.wait')}
            </div>
          )}

          <p className="mt-3 text-center text-[11px] text-stone-500 font-semibold flex items-center justify-center gap-1.5">
            {done && <Check className="w-3.5 h-3.5 text-emerald-400" />}
            ankb.qzz.io/apk
          </p>
        </div>
      </div>
    </div>
  );
}
