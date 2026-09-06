import React, { useMemo } from 'react';
import { Radio } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { findEpgForChannel } from '../utils/epgMatch';

// Dải kênh đang trực tiếp (dữ liệu thật từ EPG) — bấm để xem ngay
export default function LiveStrip({ channels = [], epgData = null, onSelect }) {
  const { t } = useI18n();
  const liveNow = useMemo(() => {
    if (!channels?.length || !epgData?.programmes) return [];
    const out = [];
    for (const ch of channels) {
      try {
        const epg = findEpgForChannel(epgData.programmes, ch);
        if (epg?.now) out.push({ ch, prog: epg.now });
      } catch {}
      if (out.length >= 20) break;
    }
    return out;
  }, [channels, epgData]);

  if (liveNow.length === 0) return null;

  return (
    <div className="mx-3 md:mx-5 mt-3 rounded-xl bg-gradient-to-r from-[#7a2f0e]/40 via-[#131316] to-[#131316] border border-[#f36f21]/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className="live-dot"></span>
        <span className="text-[10px] font-black tracking-widest text-[#ff9a3d]">{t('app.live_now')}</span>
        <span className="text-[10px] text-stone-500">· {liveNow.length} kênh</span>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none px-3 py-2.5">
        {liveNow.map(({ ch, prog }) => (
          <button
            key={ch.channel_id}
            onClick={() => onSelect && onSelect(ch)}
            className="shrink-0 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/5 hover:bg-[#f36f21]/15 border border-white/10 hover:border-[#f36f21]/40 transition-all text-left"
            title={`${ch.name} — ${prog.title}`}
          >
            {ch.logo ? (
              <img src={ch.logo} alt="" className="w-7 h-7 object-contain rounded-full bg-black/40 p-0.5" onError={(e) => { e.target.style.display = 'none'; }} />
            ) : (
              <span className="w-7 h-7 rounded-full bg-[#f36f21]/20 flex items-center justify-center"><Radio className="w-3 h-3 text-[#ff9a3d]" /></span>
            )}
            <span className="min-w-0 max-w-[180px]">
              <span className="block text-[11px] font-bold text-white truncate">{ch.name}</span>
              <span className="block text-[9px] text-stone-400 truncate">{prog.title}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
