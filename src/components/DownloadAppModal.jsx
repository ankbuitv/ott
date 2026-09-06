import React, { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

const APK_URL = 'https://ankb.qzz.io/apk';

export default function DownloadAppModal() {
  const { t } = useI18n();
  const [pct, setPct] = useState(0);
  const done = pct >= 100;

  useEffect(() => {
    const start = performance.now();
    const dur = 1600;
    let raf = 0;
    const tick = (now) => {
      const p = Math.min(100, Math.round(((now - start) / dur) * 100));
      setPct(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="absolute right-0 top-full mt-2 w-80 max-w-[92vw] bg-[#141419] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 anim-pop-fast">
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
        <span className="text-xs font-bold">{t('nav.download_app')}</span>
        <span className="text-[10px] text-stone-500 font-bold">{done ? t('apk.ready') : `${pct}%`}</span>
      </div>

      <div className="relative h-[148px] overflow-hidden bg-[#0b0b10]">
        <img
          src="/app-phone.png"
          alt=""
          className="apk-phone absolute inset-0 w-full h-full object-cover object-[center_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#141419] via-transparent to-black/20" />
        <div className="apk-icon absolute left-3 bottom-3 w-10 h-10 rounded-xl bg-[#14151c]/90 border border-white/15 p-1.5 shadow-lg">
          <img src="/logo.svg" alt="" className="w-full h-full" />
        </div>
      </div>

      <div className="px-4 pt-3 pb-2">
        <p className="text-[11px] font-bold text-white">{t('apk.title')}</p>
        <p className="text-[10px] text-stone-400 mt-0.5 leading-snug">{t('apk.sub')}</p>
        <div className="mt-2.5 h-1.5 rounded-full bg-white/8 overflow-hidden">
          <div className="h-full rounded-full grad-brand apk-bar" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[10px] font-bold text-stone-500 flex items-center gap-1.5">
          <Smartphone className="w-3 h-3 text-[#ff9a3d]" />
          {done ? t('apk.ready') : t('apk.preparing')}
        </p>
      </div>

      {done ? (
        <a
          href={APK_URL}
          className="w-full px-4 py-2.5 text-[11px] font-bold text-left border-t border-white/5 hover:bg-white/5 flex items-center gap-2 text-white"
        >
          <Download className="w-3.5 h-3.5 text-[#ff9a3d]" />
          {t('apk.download')}
        </a>
      ) : (
        <div className="w-full px-4 py-2.5 text-[11px] font-bold border-t border-white/5 text-stone-500">
          {t('apk.wait')}
        </div>
      )}
    </div>
  );
}
