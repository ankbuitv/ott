import React, { useEffect, useState } from 'react';
import { X, MapPin, Calendar, Users, Trophy, Globe, ExternalLink } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { fetchTeam, fetchTeamLast } from '../services/sports';

function fmtDT(ev) {
  const d = ev?.dateEvent || '';
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export default function TeamDetailModal({ name, onClose, onOpenMatch }) {
  const { t, lang } = useI18n();
  const [team, setTeam] = useState(null);
  const [last, setLast] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    setLoading(true);
    fetchTeam(name, lang)
      .then(async (tm) => {
        if (!on) return;
        setTeam(tm);
        if (tm?.id) {
          const evs = await fetchTeamLast(tm.id).catch(() => []);
          if (on) setLast(evs || []);
        }
      })
      .catch(() => { if (on) setTeam(null); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [name, lang]);

  return (
    <div className="fixed inset-0 z-[210] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg modal-panel overflow-hidden max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-white/10 flex items-start gap-3">
          {team?.badge ? (
            <img src={team.badge} alt="" className="w-14 h-14 object-contain shrink-0" />
          ) : (
            <span className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-xl font-black shrink-0">{(name || '?')[0]}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-black text-white leading-tight break-words">{team?.name || name}</p>
            {team?.nick ? <p className="text-[11px] text-[#ffb37a] font-bold mt-0.5 truncate">{team.nick}</p> : null}
            <p className="text-[11px] text-stone-500 mt-0.5">{[team?.country, team?.sport].filter(Boolean).join(' · ')}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 shrink-0"><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {loading && <p className="text-[12px] text-stone-500 py-6 text-center">⟳ {t('app.loading')}</p>}
          {!loading && !team && <p className="text-[12px] text-stone-600 italic text-center py-8">{t('sports.no_data')}</p>}
          {team && (
            <>
              {team.kit ? (
                <div className="flex justify-center">
                  <img src={team.kit} alt="" className="h-28 object-contain" />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {team.formed ? (
                  <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><Calendar className="w-3 h-3" />{t('team.formed')}</p>
                    <p className="text-[13px] font-bold text-white mt-0.5">{team.formed}</p>
                  </div>
                ) : null}
                {team.stadium ? (
                  <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 col-span-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{t('team.stadium')}</p>
                    <p className="text-[13px] font-bold text-white mt-0.5 break-words">{team.stadium}{team.location ? ` · ${team.location}` : ''}{team.capacity ? ` · ${Number(team.capacity).toLocaleString()} ${t('team.seats')}` : ''}</p>
                  </div>
                ) : null}
              </div>
              {team.leagues?.length ? (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1.5 flex items-center gap-1"><Trophy className="w-3 h-3" />{t('team.leagues')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {team.leagues.map((lg) => (
                      <span key={lg} className="px-2 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-bold text-stone-300">{lg}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {team.desc ? (
                <p className="text-[12px] text-stone-300 leading-relaxed whitespace-pre-wrap">{team.desc}</p>
              ) : null}
              {(team.website || team.facebook || team.youtube) && (
                <div className="flex flex-wrap gap-2">
                  {team.website ? <a href={`https://${String(team.website).replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-[#ff9a3d]"><Globe className="w-3 h-3" />{t('team.web')} <ExternalLink className="w-3 h-3" /></a> : null}
                </div>
              )}
              {last.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1.5 flex items-center gap-1"><Users className="w-3 h-3" />{t('team.last')}</p>
                  <div className="space-y-1.5">
                    {last.map((ev) => (
                      <button
                        key={ev.idEvent}
                        type="button"
                        onClick={() => onOpenMatch && onOpenMatch(ev)}
                        className="w-full text-left rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 hover:border-[#f36f21]/40"
                      >
                        <p className="text-[10px] text-stone-500 font-bold">{fmtDT(ev)} · {ev.strLeague || ''}</p>
                        <p className="text-[12px] font-bold text-white">
                          {ev.strHomeTeam} <span className="tabular-nums text-[#ffb37a]">{ev.intHomeScore ?? '-'}</span>
                          <span className="text-stone-600"> : </span>
                          <span className="tabular-nums text-[#ffb37a]">{ev.intAwayScore ?? '-'}</span> {ev.strAwayTeam}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
