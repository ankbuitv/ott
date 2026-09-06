import React, { useMemo, useState } from 'react';
import { X, Bell, BellRing, CalendarDays } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { imgPath } from '../services/tmdb';
import { addLocalReminder, removeLocalReminder, hasReminder, ensureNotifyPermission, fmtRemindTime } from '../services/localNotify';

// Lịch phim sắp chiếu + nút nhắc
export default function UpcomingModal({ items = [], onClose, onSelect }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [tick, setTick] = useState(0);

  const groups = useMemo(() => {
    const sorted = [...items].filter(m => m.release_date).sort((a, b) => a.release_date.localeCompare(b.release_date));
    const map = new Map();
    sorted.forEach(m => {
      const k = m.release_date;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(m);
    });
    return [...map.entries()];
  }, [items]);

  const toggle = async (m) => {
    const id = `movie-${m.id}`;
    if (hasReminder(id)) { removeLocalReminder(id); setTick(x => x + 1); return; }
    const ts = new Date(`${m.release_date}T09:00:00`).getTime();
    if (!ts || ts < Date.now()) { addToast(t('upcoming.released'), 'info'); return; }
    await ensureNotifyPermission();
    addLocalReminder({ id, title: `🎬 ${m.title || m.name}`, body: t('upcoming.remind_body'), at: ts });
    setTick(x => x + 1);
    addToast(t('match.remind_ok'), 'success');
  };

  return (
    <div className="fixed inset-0 z-[210] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-2xl modal-panel overflow-hidden max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><CalendarDays className="w-4 h-4 text-sky-400" />{t('upcoming.title')}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {groups.length === 0 && <p className="text-[12px] text-stone-600 italic text-center py-8">{t('sports.no_data')}</p>}
          {groups.map(([date, ms]) => (
            <div key={date}>
              <p className="text-[11px] font-black uppercase tracking-widest text-sky-300 mb-2">📅 {fmtRemindTime(new Date(`${date}T09:00:00`).getTime())}</p>
              <div className="space-y-2">
                {ms.map(m => {
                  const on = hasReminder(`movie-${m.id}`);
                  return (
                    <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2">
                      <button onClick={() => { onSelect && onSelect(m); }} className="shrink-0">
                        <img src={imgPath(m.poster_path, 'w185')} alt="" className="w-11 h-16 object-cover rounded-lg border border-white/10" loading="lazy" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-white truncate">{m.title || m.name}</p>
                        <p className="text-[10px] text-stone-500 line-clamp-2">{m.overview}</p>
                      </div>
                      <button onClick={() => toggle(m)} className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${on ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-white/[0.06] text-stone-400 border border-white/10 hover:bg-white/[0.12]'}`}>
                        {on ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
