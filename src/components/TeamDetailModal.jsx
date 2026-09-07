import React, { useEffect, useState, useCallback } from 'react';
import { X, MapPin, Calendar, Users, Trophy, Globe, ExternalLink, RefreshCw, Shirt, CalendarClock } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { fetchTeam, fetchTeamLast, fetchTeamNext, fetchTeamPlayers, bustTeam } from '../services/sports';

function fmtDate(ev) {
  const d = ev?.dateEvent || '';
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}
function fmtDateTime(ev) {
  const d = fmtDate(ev);
  const t = String(ev?.strTime || '').slice(0, 5);
  if (!d) return '';
  if (!t) return d;
  try {
    const dt = new Date(`${ev.dateEvent}T${ev.strTime || '00:00:00'}Z`);
    if (!isNaN(dt.getTime())) {
      const p = (n) => String(n).padStart(2, '0');
      return `${p(dt.getDate())}/${p(dt.getMonth() + 1)} · ${p(dt.getHours())}:${p(dt.getMinutes())}`;
    }
  } catch {}
  return `${d} · ${t}`;
}

function Badge({ src, name, className = 'w-14 h-14' }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <span className={`${className} rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center text-xl font-black text-stone-300 shrink-0`}>
        {(name || '?').slice(0, 1).toUpperCase()}
      </span>
    );
  }
  return <img src={src} alt="" onError={() => setErr(true)} className={`${className} object-contain shrink-0`} loading="lazy" />;
}

/**
 * Chi tiết đội bóng — dữ liệu TheSportsDB.
 * @param {object} props.team { name, id } (hoặc prop `name` dạng chuỗi cho tương thích cũ)
 */
export default function TeamDetailModal({ team: teamRef, name, onClose, onOpenMatch }) {
  const { t, lang } = useI18n();
  const ref = typeof teamRef === 'object' && teamRef ? teamRef : { name: name || teamRef || '', id: '' };
  const refName = String(ref.name || '');
  const refId = String(ref.id || '');

  const [team, setTeam] = useState(null);
  const [last, setLast] = useState([]);
  const [next, setNext] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('info');

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError('');
    if (fresh) bustTeam(refId || refName, lang);
    try {
      const tm = await fetchTeam({ id: refId, name: refName }, lang);
      setTeam(tm);
      if (!tm) { setLoading(false); return; }
      setLoading(false);
      const id = tm.id;
      fetchTeamLast(id).then((v) => setLast(v || [])).catch(() => setLast([]));
      fetchTeamNext(id).then((v) => setNext(v || [])).catch(() => setNext([]));
      fetchTeamPlayers(id).then((v) => setPlayers(v || [])).catch(() => setPlayers([]));
    } catch (e) {
      setTeam(null);
      setError(t('team.err'));
      setLoading(false);
    }
  }, [refId, refName, lang, t]);

  useEffect(() => {
    setTeam(null); setLast([]); setNext([]); setPlayers([]); setTab('info');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refId, refName, lang]);

  const MatchRow = ({ ev, score }) => (
    <button
      type="button"
      onClick={() => onOpenMatch && onOpenMatch(ev)}
      className="w-full text-left rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2 hover:border-[#f36f21]/40 active:scale-[0.99] transition-all"
    >
      <p className="text-[10px] text-stone-500 font-bold truncate">{score ? fmtDate(ev) : fmtDateTime(ev)}{ev.strLeague ? ` · ${ev.strLeague}` : ''}</p>
      <p className="text-[12px] font-bold text-white">
        {ev.strHomeTeam}
        {score ? (
          <>
            {' '}<span className="tabular-nums text-[#ffb37a]">{ev.intHomeScore ?? '-'}</span>
            <span className="text-stone-600"> : </span>
            <span className="tabular-nums text-[#ffb37a]">{ev.intAwayScore ?? '-'}</span>{' '}
          </>
        ) : <span className="text-stone-600"> vs </span>}
        {ev.strAwayTeam}
      </p>
    </button>
  );

  const tabs = [
    { id: 'info', label: `ℹ️ ${t('team.tab_info')}` },
    { id: 'matches', label: `📅 ${t('team.tab_matches')}`, n: last.length + next.length },
    { id: 'squad', label: `👕 ${t('team.tab_squad')}`, n: players.length },
  ];

  return (
    <div className="fixed inset-0 z-[210] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-lg modal-panel overflow-hidden max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="relative">
          {team?.banner ? (
            <div className="absolute inset-0 opacity-25" style={{ backgroundImage: `url(${team.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
          ) : null}
          <div className="relative px-4 py-3 border-b border-white/10 flex items-start gap-3 bg-gradient-to-br from-[#f36f21]/10 via-transparent to-sky-500/10">
            <Badge src={team?.badge} name={team?.name || refName} />
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-black text-white leading-tight break-words">{team?.name || refName}</p>
              {team?.nick ? <p className="text-[11px] text-[#ffb37a] font-bold mt-0.5 truncate">{team.nick}</p> : null}
              <p className="text-[11px] text-stone-500 mt-0.5">{[team?.country, team?.sport, team?.leagues?.[0]].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => load(true)} title={t('sports.refresh')} className="p-1.5 rounded-full hover:bg-white/10">
                <RefreshCw className={`w-4 h-4 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        {team && (
          <div className="flex gap-1.5 px-4 pt-3">
            {tabs.map((tb) => (
              <button key={tb.id} onClick={() => setTab(tb.id)}
                className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${tab === tb.id ? 'bg-white/10 text-white' : 'text-stone-500 hover:text-stone-300'}`}>
                {tb.label}{tb.n ? <span className="opacity-60"> {tb.n}</span> : null}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />)}
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-8 space-y-3">
              <p className="text-[12px] text-stone-400">{error}</p>
              <button onClick={() => load(true)} className="px-4 py-2 rounded-xl grad-brand text-white text-[12px] font-black active:scale-95">{t('team.retry')}</button>
            </div>
          )}

          {!loading && !error && !team && (
            <div className="text-center py-8 space-y-3">
              <p className="text-[12px] text-stone-600 italic">{t('team.not_found', { name: refName })}</p>
              <button onClick={() => load(true)} className="px-4 py-2 rounded-xl bg-white/[0.08] border border-white/10 text-stone-200 text-[12px] font-bold active:scale-95">{t('team.retry')}</button>
            </div>
          )}

          {!loading && team && tab === 'info' && (
            <>
              {team.kit ? (
                <div className="flex justify-center">
                  <img src={team.kit} alt="" className="h-28 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {team.formed ? (
                  <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><Calendar className="w-3 h-3" />{t('team.formed')}</p>
                    <p className="text-[13px] font-bold text-white mt-0.5">{team.formed}</p>
                  </div>
                ) : null}
                {team.short || team.aliases?.length ? (
                  <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1"><Shirt className="w-3 h-3" />{t('team.alias')}</p>
                    <p className="text-[13px] font-bold text-white mt-0.5 truncate">{team.short || team.aliases[0]}</p>
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
              ) : (
                <p className="text-[11px] text-stone-600 italic">{t('team.no_desc')}</p>
              )}
              {(team.website || team.facebook || team.youtube || team.instagram) && (
                <div className="flex flex-wrap gap-3 pt-1">
                  {[['web', team.website], ['Facebook', team.facebook], ['Instagram', team.instagram], ['YouTube', team.youtube]]
                    .filter(([, v]) => v)
                    .map(([label, v]) => (
                      <a key={label} href={`https://${String(v).replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#ff9a3d] hover:underline">
                        <Globe className="w-3 h-3" />{label === 'web' ? t('team.web') : label} <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                </div>
              )}
            </>
          )}

          {!loading && team && tab === 'matches' && (
            <>
              {next.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1.5 flex items-center gap-1"><CalendarClock className="w-3 h-3" />{t('team.next')}</p>
                  <div className="space-y-1.5">
                    {next.map((ev) => <MatchRow key={ev.idEvent} ev={ev} score={false} />)}
                  </div>
                </div>
              )}
              {last.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-stone-500 mb-1.5 mt-2 flex items-center gap-1"><Users className="w-3 h-3" />{t('team.last')}</p>
                  <div className="space-y-1.5">
                    {last.map((ev) => <MatchRow key={ev.idEvent} ev={ev} score />)}
                  </div>
                </div>
              )}
              {next.length === 0 && last.length === 0 && (
                <p className="text-[12px] text-stone-600 italic text-center py-8">{t('sports.no_data')}</p>
              )}
            </>
          )}

          {!loading && team && tab === 'squad' && (
            players.length === 0 ? (
              <p className="text-[12px] text-stone-600 italic text-center py-8">{t('team.no_squad')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-2 py-1.5">
                    <Badge src={p.thumb} name={p.name} className="w-8 h-8 rounded-full" />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-bold text-white truncate">{p.name}</span>
                      <span className="block text-[9px] text-stone-500 truncate">{[p.number && `#${p.number}`, p.pos].filter(Boolean).join(' · ')}</span>
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
