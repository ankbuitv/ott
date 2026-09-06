import React, { useState, useEffect } from 'react';
import { Flag, CalendarDays, ListOrdered, Trophy, ChevronDown, Play, Clapperboard, X } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { fetchF1Schedule, fetchF1Standings, fetchF1Results, fetchMotorsport, f1Season, fetchRacingVideos } from '../services/racing';
import { parseVideoUrl } from '../services/sports';

function fmtDT(ts) {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
}

function RaceCard({ race, winner }) {
  const { t } = useI18n();
  const upcoming = race.ts > Date.now();
  return (
    <div className={`rounded-2xl border p-3.5 transition-all hover:-translate-y-0.5 ${upcoming ? 'bg-gradient-to-br from-white/[0.06] to-white/[0.02] border-white/[0.1]' : 'bg-white/[0.02] border-white/[0.06]'}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-300 text-[10px] font-black uppercase tracking-widest">R{race.round}</span>
        <span className={`text-[10px] font-bold ${upcoming ? 'text-sky-300' : 'text-stone-500'}`}>{fmtDT(race.ts)}</span>
      </div>
      <p className="text-[13px] font-extrabold text-white leading-tight">{race.name}</p>
      <p className="text-[11px] text-stone-500 mt-0.5 truncate">{race.circuit}{race.locality ? ` · ${race.locality}` : ''}{race.country ? `, ${race.country}` : ''}</p>
      {!upcoming && winner && (
        <p className="text-[11px] font-bold text-amber-300 mt-1.5 truncate">🏆 {winner.driver} <span className="text-stone-500 font-medium">({winner.team})</span></p>
      )}
    </div>
  );
}

export default function RacingSection() {
  const { t } = useI18n();
  const [sched, setSched] = useState([]);
  const [stand, setStand] = useState({ drivers: [], teams: [] });
  const [moto, setMoto] = useState([]);
  const [winners, setWinners] = useState({});
  const [loading, setLoading] = useState(true);
  const [standTab, setStandTab] = useState('drivers');
  const [showAll, setShowAll] = useState(false);
  const [videos, setVideos] = useState([]);
  const [playing, setPlaying] = useState(null);
  const year = f1Season();

  useEffect(() => {
    let on = true;
    setLoading(true);
    Promise.all([
      fetchF1Schedule(year).catch(() => []),
      fetchF1Standings(year).catch(() => ({ drivers: [], teams: [] })),
      fetchMotorsport(year).catch(() => []),
      fetchRacingVideos(year).catch(() => []),
    ]).then(([s, st, m, vids]) => {
      if (!on) return;
      setSched(s || []); setStand(st || { drivers: [], teams: [] }); setMoto(m || []); setVideos(vids || []);
      setLoading(false);
      // Lấy người thắng các chặng vừa qua (tối đa 6)
      const past = (s || []).filter(r => r.ts && r.ts <= Date.now()).slice(-6);
      past.forEach(r => {
        fetchF1Results(year, r.round).then(res => {
          if (on && res && res[0]) setWinners(w => ({ ...w, [r.round]: res[0] }));
        }).catch(() => {});
      });
    }).catch(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [year]);

  const upcoming = sched.filter(r => r.ts > Date.now());
  const past = sched.filter(r => r.ts && r.ts <= Date.now()).reverse();

  return (
    <div className="space-y-9">
      {videos.length > 0 && (
        <section>
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <Clapperboard className="w-4 h-4 text-red-400" />
            </span>
            <h2 className="text-[19px] font-extrabold tracking-tight">Video đua xe</h2>
            <span className="text-[11px] text-stone-500 font-bold">{videos.length}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {videos.map((v) => (
              <button key={v.id} onClick={() => setPlaying(v)} className="group rounded-2xl overflow-hidden border border-white/[0.08] hover:border-red-500/50 bg-[#15161b] text-left transition-all hover:-translate-y-0.5">
                <span className="block relative aspect-video bg-[#0c0d11] overflow-hidden">
                  {v.thumb_url ? (
                    <img src={v.thumb_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center text-3xl">🏎️</span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10">
                    <span className="w-11 h-11 rounded-full bg-black/70 border border-white/25 flex items-center justify-center group-hover:bg-[#f36f21] group-hover:border-transparent">
                      <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                    </span>
                  </span>
                  {v.league && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-bold text-red-300">{v.league}</span>}
                </span>
                <span className="block px-2.5 py-2 text-[12px] font-bold text-white leading-snug line-clamp-2">{v.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {/* 1. Lịch F1 */}
      <section>
        <div className="flex items-center gap-2.5 mb-3.5">
          <span className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
            <Flag className="w-4 h-4 text-red-400" />
          </span>
          <h2 className="text-[19px] font-extrabold tracking-tight">🏎️ {t('race.f1_sched', { y: year })}</h2>
        </div>
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[110px] rounded-2xl bg-white/[0.04] animate-pulse" />)}
          </div>
        ) : sched.length === 0 ? (
          <p className="text-[12px] text-stone-600 italic bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-6 text-center">{t('sports.no_data')}</p>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <p className="text-[11px] font-black uppercase tracking-widest text-sky-400 mb-2 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />{t('race.next')}</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                  {upcoming.slice(0, showAll ? 30 : 3).map(r => <RaceCard key={r.round} race={r} />)}
                </div>
              </>
            )}
            {past.length > 0 && (
              <>
                <p className="text-[11px] font-black uppercase tracking-widest text-stone-500 mb-2 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" />{t('race.done')}</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(showAll ? past : past.slice(0, 3)).map(r => <RaceCard key={r.round} race={r} winner={winners[r.round]} />)}
                </div>
              </>
            )}
            {(upcoming.length > 3 || past.length > 3) && (
              <button onClick={() => setShowAll(v => !v)} className="mt-3 mx-auto flex items-center gap-1 text-[12px] font-bold text-stone-400 hover:text-white">
                {showAll ? t('race.less') : t('race.more')}<ChevronDown className={`w-4 h-4 transition-transform ${showAll ? 'rotate-180' : ''}`} />
              </button>
            )}
          </>
        )}
      </section>

      {/* 2. BXH F1 */}
      {(stand.drivers.length > 0 || stand.teams.length > 0) && (
        <section>
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <ListOrdered className="w-4 h-4 text-amber-400" />
            </span>
            <h2 className="text-[19px] font-extrabold tracking-tight">{t('race.standings')}</h2>
            <div className="flex gap-1 ml-2 bg-white/[0.05] rounded-full p-1">
              {[{ id: 'drivers', label: '🏁 ' + t('race.drivers') }, { id: 'teams', label: '🏭 ' + t('race.teams') }].map(tb => (
                <button key={tb.id} onClick={() => setStandTab(tb.id)} className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${standTab === tb.id ? 'bg-[#f36f21] text-white' : 'text-stone-400 hover:text-white'}`}>{tb.label}</button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-white/[0.02]">
            {(standTab === 'drivers' ? stand.drivers : stand.teams).map((r, i) => (
              <div key={i} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.04] last:border-0">
                <span className={`w-7 h-7 rounded-lg text-[12px] font-black flex items-center justify-center shrink-0 ${i === 0 ? 'bg-amber-500/20 text-amber-300' : i < 3 ? 'bg-white/10 text-white' : 'text-stone-500'}`}>{r.pos}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate">{standTab === 'drivers' ? r.name : r.name}{standTab === 'drivers' && r.code ? <span className="ml-1.5 text-[10px] font-black text-stone-500">{r.code}</span> : null}</p>
                  {standTab === 'drivers' && <p className="text-[10px] text-stone-500 truncate">{r.team}</p>}
                </div>
                <span className="text-[10px] text-stone-500 font-bold hidden sm:block">🏆 {r.wins}</span>
                <span className="text-[14px] font-black text-white tabular-nums w-14 text-right">{r.pts}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Giải đua khác (MotoGP, WRC...) */}
      {moto.length > 0 && (
        <section>
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className="w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center">
              <Flag className="w-4 h-4 text-fuchsia-400" />
            </span>
            <h2 className="text-[19px] font-extrabold tracking-tight">{t('race.other')}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {moto.map((m, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                <p className="text-[12px] font-black text-white mb-2 truncate">🏍️ {m.league}</p>
                <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                  {m.events.slice(0, 8).map((ev, j) => (
                    <div key={j} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-300 truncate">{ev.strEvent || ev.strHomeTeam}</span>
                      <span className="text-stone-500 shrink-0 tabular-nums">{ev.dateEvent ? ev.dateEvent.slice(5) : ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
