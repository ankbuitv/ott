import React, { useState, useEffect } from 'react';
import { Flame, Play } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { fetchTopChannels, fetchTrendingChannels } from '../services/social';
import ScrollRow from './ScrollRow';

// BXH kênh xem nhiều nhất (từ heartbeat toàn app)
export default function TopChannelsStrip({ channels = [], onSelectChannel }) {
  const { t } = useI18n();
  const [top, setTop] = useState([]);
  const [live, setLive] = useState(false); // true = bảng 15 phút gần nhất
  useEffect(() => {
    let on = true;
    const load = async () => {
      // Ưu tiên "đang hot 15 phút"; ít người xem quá thì rơi về bảng tổng.
      const hot = await fetchTrendingChannels();
      if (!on) return;
      if (hot && hot.length >= 3) { setTop(hot); setLive(true); return; }
      const all = await fetchTopChannels();
      if (on) { setTop(all || []); setLive(false); }
    };
    load();
    const iv = setInterval(load, 120000); // tự làm mới 2 phút/lần
    return () => { on = false; clearInterval(iv); };
  }, []);
  if (!top.length) return null;
  const byId = new Map((channels || []).map(c => [c.channel_id, c]));
  return (
    <section className="anim-fade-up">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="w-9 h-9 rounded-xl border flex items-center justify-center bg-[#f36f21]/15 border-[#f36f21]/25">
          <Flame className="w-4 h-4 text-[#ff9a3d]" />
        </span>
        <div>
          <h2 className="text-[20px] font-extrabold tracking-tight leading-tight flex items-center gap-2">
            {live ? 'Đang hot' : t('topch.title')}
            {live && <span className="px-1.5 py-0.5 rounded-md bg-red-600/20 border border-red-500/30 text-red-300 text-[9px] font-black tracking-wider">15 PHÚT</span>}
          </h2>
          <p className="text-[11px] text-stone-500">{live ? 'Kênh nhiều người xem nhất ngay lúc này' : t('topch.sub')}</p>
        </div>
      </div>
      <ScrollRow>
        {top.slice(0, 10).map((r, i) => {
          const ch = byId.get(r.channel_id);
          const name = ch?.name || r.name || r.channel_id;
          const logo = ch?.logo || r.logo;
          return (
            <button
              key={r.channel_id}
              onClick={() => ch && onSelectChannel && onSelectChannel(ch)}
              className="group relative shrink-0 w-[150px] snap-start rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#f36f21]/60 bg-[#15161b] text-left transition-all hover:-translate-y-1"
            >
              <span className="block relative h-[86px] flex items-center justify-center bg-[#0c0d11] overflow-hidden">
                <span className="absolute left-1 bottom-0 font-black leading-none" style={{ fontSize: 52, color: 'transparent', WebkitTextStroke: i < 3 ? '2px rgba(251,191,36,.7)' : '2px rgba(255,255,255,.22)' }}>{i + 1}</span>
                {logo ? <img src={logo} alt="" loading="lazy" className="h-12 object-contain relative z-10 group-hover:scale-110 transition-transform" onError={e => { e.target.style.display = 'none'; }} />
                  : <span className="font-black italic text-white/25 text-xl relative z-10">{name.slice(0, 3)}</span>}
                <span className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="w-9 h-9 rounded-full bg-[#f36f21] flex items-center justify-center"><Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" /></span>
                </span>
              </span>
              <span className="block px-2.5 py-2">
                <span className="block text-[12px] font-bold text-white truncate">{name}</span>
                <span className="block text-[10px] text-stone-500">🔥 {Number(r.views || 0).toLocaleString()} lượt xem</span>
              </span>
            </button>
          );
        })}
      </ScrollRow>
    </section>
  );
}
