import React, { useState, useMemo } from 'react';
import { Search, X, Clock, Radio, Play } from 'lucide-react';
import { formatTimeHHMM, parseEpgDate } from '../utils/dateUtils';

export default function SearchEPG({ epgData, channels, onPlayCatchup, onSelectChannel }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    if (!query.trim() || !epgData?.programmes) return [];
    const q = query.toLowerCase();
    return epgData.programmes
      .filter(p => p.title && p.title.toLowerCase().includes(q))
      .sort((a, b) => parseEpgDate(b.start) - parseEpgDate(a.start))
      .slice(0, 30)
      .map(p => {
        const ch = channels.find(c => c.channel_id === p.channel);
        const pStart = parseEpgDate(p.start);
        const pStop = parseEpgDate(p.stop);
        const now = new Date();
        return { ...p, channel: ch, pStart, pStop, isPast: pStop < now, isLive: pStart <= now && pStop >= now };
      });
  }, [query, epgData, channels]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/60 border border-slate-800/50 rounded-xl text-xs text-slate-400 hover:text-white hover:border-slate-700 transition-all">
        <Search className="w-3.5 h-3.5" /> Tìm chương trình
      </button>
    );
  }

  return (
    <div className="bg-[#13151c] border border-slate-800/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-slate-500 shrink-0" />
        <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nhập tên chương trình..." className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-600 focus:outline-none" />
        <button onClick={() => { setOpen(false); setQuery(''); }} className="p-1 hover:bg-slate-800 rounded"><X className="w-4 h-4 text-slate-500" /></button>
      </div>
      {query.trim() && results.length > 0 && (
        <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                if ((r.isPast || r.isLive) && r.channel) {
                  // Server xin token catchup (kèm thời điểm program) — client không build URL
                  onPlayCatchup && onPlayCatchup(r.channel, r);
                } else if (r.channel) {
                  onSelectChannel && onSelectChannel(r.channel);
                }
              }}
              className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-800/60 transition-all"
            >
              {r.channel?.logo && <img src={r.channel.logo} alt="" className="w-8 h-8 object-contain rounded bg-slate-900 p-0.5 shrink-0" onError={e => e.target.style.display = 'none'} />}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{r.title}</p>
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span>{r.channel?.name || ''}</span><span>·</span>
                  <Clock className="w-2.5 h-2.5" />
                  <span>{formatTimeHHMM(r.start)} - {formatTimeHHMM(r.stop)}</span>
                </div>
              </div>
              {r.isLive && <span className="px-1.5 py-px text-[9px] bg-[#f36f21] rounded text-white font-bold shrink-0">LIVE</span>}
              {r.isPast && <Play className="w-3 h-3 text-purple-400 shrink-0" />}
            </button>
          ))}
        </div>
      )}
      {query.trim() && results.length === 0 && <p className="text-xs text-slate-600 text-center py-3">Không tìm thấy chương trình</p>}
    </div>
  );
}
