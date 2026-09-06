import React, { useState } from 'react';
import { ShieldCheck, FileText, Scale, Mail, Activity } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import Logo from './Logo';
import LegalModal from './LegalModal';

export default function Footer({ onGoTab }) {
  const { t } = useI18n();
  const [legal, setLegal] = useState(null); // terms | policy | dmca | contact

  const links = [
    { id: 'terms', label: t('footer.terms'), Icon: FileText },
    { id: 'policy', label: t('footer.policy'), Icon: ShieldCheck },
    { id: 'dmca', label: t('footer.dmca'), Icon: Scale },
    { id: 'contact', label: t('footer.contact'), Icon: Mail },
  ];

  return (
    <footer className="mt-14 border-t border-white/[0.07] bg-black/40">
      <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-10 grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
        {/* Brand */}
        <div>
          <Logo size="sm" showSubtext={false} />
          <p className="text-[13px] font-black text-white mt-3 tracking-wide">
            CHRTV PL<span className="text-[#f36f21]">▷</span>Y <span className="text-stone-500 font-semibold">- A Product of ANKB CO.</span>
          </p>
          <p className="text-[11px] text-stone-500 mt-2 leading-relaxed max-w-sm">{t('footer.desc')}</p>
          <p className="text-[11px] text-stone-600 mt-3 font-semibold">© 2026 ANKB CO. · {t('footer.rights')}</p>
        </div>
        {/* Khám phá */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-3">{t('footer.explore')}</p>
          <div className="space-y-2">
            {[
              { tab: 'tv', label: t('footer.l_tv') },
              { tab: 'movies', label: t('footer.l_movies') },
              { tab: 'sports', label: t('footer.l_sports') },
              { tab: 'epg', label: t('footer.l_epg') },
            ].map(l => (
              <button
                key={l.tab}
                onClick={() => onGoTab && onGoTab(l.tab)}
                className="block text-[13px] font-semibold text-stone-400 hover:text-white transition-colors"
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        {/* Pháp lý */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-3">{t('footer.legal')}</p>
          <div className="space-y-2">
            <a
              href="/status"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-[13px] font-semibold text-stone-400 hover:text-white transition-colors"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" /> Trạng thái hệ thống
            </a>
            {links.map(l => (
              <button
                key={l.id}
                onClick={() => setLegal(l.id)}
                className="flex items-center gap-2 text-[13px] font-semibold text-stone-400 hover:text-white transition-colors"
              >
                <l.Icon className="w-3.5 h-3.5 text-[#f36f21]" /> {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-white/[0.05]">
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[10px] text-stone-600 font-semibold tracking-wide">CHRTV PL▷Y - A Product of ANKB CO. © 2025</p>
          <p className="text-[10px] text-stone-700">{t('footer.note')}</p>
        </div>
      </div>
      {legal && <LegalModal tab={legal} onClose={() => setLegal(null)} onTab={setLegal} />}
    </footer>
  );
}
