import React, { useState, useEffect } from 'react';
import { X, Zap, Clock, Target } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { fetchPublicProfile } from '../services/social';
import ShareButtons, { buildDeepLink } from './ShareButtons';

// Hồ sơ công khai (?u=handle) + chia sẻ thành tích
export default function PublicProfileModal({ handle, onClose }) {
  const { t } = useI18n();
  const [prof, setProf] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let on = true;
    setProf(null); setErr(false);
    if (handle) fetchPublicProfile(handle).then(p => { if (on) setProf(p); }).catch(() => { if (on) setErr(true); });
    return () => { on = false; };
  }, [handle]);

  const link = buildDeepLink({ u: handle });
  const hrs = ((prof?.watch_sec || 0) / 3600).toFixed(1);

  return (
    <div className="fixed inset-0 z-[210] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm modal-panel overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white">🌟 @{handle}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4">
          {!prof && !err && <p className="text-[12px] text-stone-500 text-center py-8">⟳ {t('app.loading')}</p>}
          {err && <p className="text-[12px] text-stone-500 text-center py-8">{t('community.not_found')}</p>}
          {prof && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {prof.avatar_url ? <img src={prof.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover border-2 border-[#f36f21]" />
                  : <span className="w-16 h-16 rounded-full bg-gradient-to-br from-[#f36f21] to-fuchsia-600 flex items-center justify-center text-2xl font-black text-white">{(prof.name || prof.handle || '?').slice(0, 1).toUpperCase()}</span>}
                <div className="min-w-0">
                  <p className="text-[15px] font-black text-white truncate">{prof.name || prof.handle}</p>
                  {prof.bio && <p className="text-[11px] text-stone-400 line-clamp-2">{prof.bio}</p>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-2 text-center">
                  <Zap className="w-4 h-4 text-amber-400 mx-auto mb-0.5" />
                  <p className="text-[15px] font-black text-white tabular-nums">{prof.xp}</p>
                  <p className="text-[9px] text-stone-500 font-bold">XP</p>
                </div>
                <div className="rounded-2xl bg-sky-500/10 border border-sky-500/30 p-2 text-center">
                  <Clock className="w-4 h-4 text-sky-400 mx-auto mb-0.5" />
                  <p className="text-[15px] font-black text-white tabular-nums">{hrs}h</p>
                  <p className="text-[9px] text-stone-500 font-bold">{t('community.watched')}</p>
                </div>
                <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-2 text-center">
                  <Target className="w-4 h-4 text-emerald-400 mx-auto mb-0.5" />
                  <p className="text-[15px] font-black text-white tabular-nums">{prof.pred_points}</p>
                  <p className="text-[9px] text-stone-500 font-bold">{t('community.predict_pts')}</p>
                </div>
              </div>
              {prof.badges?.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1.5">🎖️ {t('community.badges')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {prof.badges.map(b => (
                      <span key={b.id} className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-bold text-stone-200">{b.icon} {b.name}</span>
                    ))}
                  </div>
                </div>
              )}
              <ShareButtons url={link} title={`@${prof.handle} — CHRTV PLAY`} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
