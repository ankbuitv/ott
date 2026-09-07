import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Trophy, CalendarDays, ListOrdered, Clapperboard, Play, Radio, X, ChevronRight, RefreshCw, Zap } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { LEAGUES, fetchLeague, fetchLatestScoresAll, fetchSportsIndex, fetchSportsVideos, parseVideoUrl } from '../services/sports';
import ScrollRow from './ScrollRow';
import RacingSection from './RacingSection';
import MatchDetailModal from './MatchDetailModal';
import TeamDetailModal from './TeamDetailModal';

const SPORT_RE = /sport|thể thao|the thao|espn|bein|k\+|onsport|fpt.*sport|bóng đá|bong da|star sport|golf|tennis|bóng rổ|bong ro|basket|baseball|bóng chày|cầu lông|cau long|badminton|bơi|swim|olympic|esport|e-sport|đua xe|dua xe|racing|boxing|wwe|wimbledon|roland|nba|f1\b/i;

function fmtDT(ts, dateEvent, strTime) {
  try {
    let d = null;
    if (ts) d = new Date(/z$/i.test(ts) ? ts : ts + 'Z');
    if ((!d || isNaN(d.getTime())) && dateEvent) d = new Date(`${dateEvent}T${strTime || '00:00:00'}`);
    if (!d || isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
}

function isLive(ev) {
  const s = String(ev.strStatus || '').toUpperCase();
  return s && !['NS', 'FT', 'AOT', 'POSTPONED', 'CANCELLED', 'ABANDONED'].includes(s) && ev.strPostponed !== 'yes';
}
function isPostponed(ev) {
  return ev.strPostponed === 'yes' || /postpon|cancel/i.test(String(ev.strStatus || ''));
}
function fmtHM(ts) {
  try {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch { return ''; }
}

function TeamBadge({ src, name, size = 'w-8 h-8' }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <span className={`${size} rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-[10px] font-black text-stone-300 shrink-0`}>
        {(name || '?').slice(0, 1)}
      </span>
    );
  }
  return <img src={src} alt="" onError={() => setErr(true)} className={`${size} object-contain shrink-0`} loading="lazy" />;
}

function MatchCard({ ev, showScore, onClick, onTeam }) {
  const { t } = useI18n();
  const live = isLive(ev);
  const pp = isPostponed(ev);
  return (
    <div onClick={onClick} className={`rounded-2xl border p-3 transition-all cursor-pointer hover:border-[#f36f21]/50 hover:-translate-y-0.5 ${live ? 'bg-[#f36f21]/10 border-[#f36f21]/50 shadow-lg shadow-[#f36f21]/10' : 'bg-white/[0.03] border-white/[0.07]'}`}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-bold text-stone-500">
          {ev.intRound ? `${t('sports.round', { n: ev.intRound })} · ` : ''}{fmtDT(ev.strTimestamp, ev.dateEvent, ev.strTime)}
        </span>
        {live ? (
          <span className="px-2 py-0.5 text-[9px] font-black rounded-full grad-brand text-white flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>{String(ev.strStatus || 'LIVE').toUpperCase()}
          </span>
        ) : pp ? (
          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-white/10 text-stone-400">{t('sports.pp')}</span>
        ) : showScore ? (
          <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-white/10 text-stone-300">FT</span>
        ) : (
          <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">{ev.strVenue || t('sports.vs')}</span>
        )}
      </div>
      <div className="space-y-2">
        {[
          { name: ev.strHomeTeam, id: ev.idHomeTeam, badge: ev.strHomeTeamBadge, score: ev.intHomeScore },
          { name: ev.strAwayTeam, id: ev.idAwayTeam, badge: ev.strAwayTeamBadge, score: ev.intAwayScore },
        ].map((tm, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <TeamBadge src={tm.badge} name={tm.name} />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTeam && onTeam({ name: tm.name, id: tm.id }); }}
              className="flex-1 min-w-0 text-left text-[13px] font-bold text-slate-200 truncate hover:text-[#ffb37a]"
            >{tm.name}</button>
            {showScore && (
              <span className={`text-[15px] font-black tabular-nums ${live ? 'text-[#ffb37a]' : 'text-white'}`}>
                {tm.score ?? '-'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SportsScreen({ channels = [], onSelectChannel }) {
  const { t } = useI18n();
  const [leagueId, setLeagueId] = useState('u20wc');
  const [data, setData] = useState({ next: [], past: [], table: [] });
  const [loading, setLoading] = useState(true);
  const [videos, setVideos] = useState([]);
  const [playing, setPlaying] = useState(null);
  const [sportTab, setSportTab] = useState('football'); // football | racing
  const [selMatch, setSelMatch] = useState(null);
  const [selTeam, setSelTeam] = useState(null); // { name, id } — đội đang xem chi tiết
  // Explorer "Môn khác": Esports, cầu lông, bóng chày, bơi, Olympic... (TSDB có gì hiện nấy)
  const [custom, setCustom] = useState(null); // league object tự chọn từ explorer
  const [showExplorer, setShowExplorer] = useState(false);
  const [sportsIdx, setSportsIdx] = useState(null);
  const [explorerSport, setExplorerSport] = useState('');
  // TỈ SỐ MỚI NHẤT MỌI GIẢI (đang đá + FT) — dải đầu trang, tự cập nhật 60s/lần
  const [latest, setLatest] = useState([]);
  // Tự cập nhật kết quả + BXH: thời điểm dữ liệu mới nhất & nút làm mới tay
  const [updatedAt, setUpdatedAt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const refreshRef = useRef(null);

  const league = (custom && custom.id === leagueId) ? custom : (LEAGUES.find(l => l.id === leagueId) || LEAGUES[0]);

  useEffect(() => {
    let on = true;
    setLoading(true);
    const load = (fresh) => {
      if (fresh) setRefreshing(true);
      fetchLeague(league, { fresh })
        .then(d => { if (on) { setData(d); setLoading(false); setUpdatedAt(Date.now()); } })
        .catch(() => { if (on) setLoading(false); })
        .finally(() => { if (on) setRefreshing(false); });
    };
    refreshRef.current = () => load(true);
    load(false);
    // TỰ CẬP NHẬT: mỗi 60s (khi tab đang mở) lấy kết quả + BXH MỚI NHẤT từ API
    // (fresh = bỏ cache), quay lại tab sau >30s cũng tự làm mới luôn.
    const iv = setInterval(() => {
      if (on && document.visibilityState === 'visible') load(true);
    }, 60000);
    const onVis = () => {
      if (on && document.visibilityState === 'visible' && Date.now() - updatedAt > 30000) load(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => { on = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  useEffect(() => {
    if (!showExplorer || sportsIdx) return;
    let on = true;
    fetchSportsIndex().then(idx => {
      if (!on) return;
      setSportsIdx(idx);
      if (!explorerSport && idx?.sports?.length) {
        const prefer = idx.sports.find(sp => sp.name !== 'Soccer') || idx.sports[0];
        setExplorerSport(prefer.name);
      }
    }).catch(() => {});
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showExplorer]);

  const pickExplorerLeague = (l) => {
    const obj = { id: `x_${l.tsdb}`, name: l.name, short: l.name, tsdb: l.tsdb, flag: l.badge || '🏟️', customBadge: l.badge || '' };
    setCustom(obj);
    setLeagueId(obj.id);
    setShowExplorer(false);
    try { document.querySelector('main')?.scrollTo({ top: 0 }); } catch {}
  };

  useEffect(() => {
    let on = true;
    fetchSportsVideos().then(v => { if (on) setVideos(v || []); }).catch(() => {});
    return () => { on = false; };
  }, []);

  // Dải tỉ số mọi giải: tự cập nhật mỗi 60s khi tab đang mở
  useEffect(() => {
    let on = true;
    const load = () => fetchLatestScoresAll(14).then(l => { if (on) setLatest(l || []); }).catch(() => {});
    load();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { on = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const sportChannels = useMemo(() => {
    return (channels || []).filter(ch => SPORT_RE.test(`${ch.channel_id || ''} ${ch.name || ''} ${ch.group_title || ''}`));
  }, [channels]);

  return (
    <div className="text-white pb-12">
      {/* Header */}
      <div className="px-5 md:px-8 pt-5 pb-3 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(600px 180px at 15% 0%, rgba(34,211,238,.12), transparent 70%), radial-gradient(500px 160px at 90% 0%, rgba(243,111,33,.14), transparent 70%)' }}></div>
        <div className="relative flex items-center gap-2.5">
          <span className="w-10 h-10 rounded-2xl grad-brand flex items-center justify-center shadow-lg shadow-[#f36f21]/30">
            <Trophy className="w-5 h-5 text-white" />
          </span>
          <div>
            <h1 className="text-[24px] font-black tracking-tight leading-none">{t('sports.title')}</h1>
            <p className="text-[11px] text-stone-500 mt-1">{t('sports.sub')}</p>
          </div>
          {/* Trạng thái tự cập nhật + nút làm mới tay */}
          <div className="ml-auto flex items-center gap-2">
            {sportTab === 'football' && (
              <>
                <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-stone-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  {t('sports.auto')}{updatedAt ? ` · ${fmtHM(updatedAt)}` : ''}
                </span>
                <button
                  onClick={() => refreshRef.current && refreshRef.current()}
                  disabled={refreshing}
                  title={t('sports.refresh')}
                  className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 flex items-center justify-center disabled:opacity-50 active:scale-95"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-stone-300 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </>
            )}
          </div>
        </div>
        {/* Tab môn thể thao: Bóng đá | Đua xe */}
        <div className="relative flex gap-1.5 mt-4">
          {[{ id: 'football', label: `⚽ ${t('sports.football')}` }, { id: 'racing', label: `🏎️ ${t('sports.racing')}` }].map(tb => (
            <button
              key={tb.id}
              onClick={() => setSportTab(tb.id)}
              className={`px-4 py-2 rounded-full text-[12px] font-black transition-all active:scale-95 ${
                sportTab === tb.id ? 'grad-brand text-white shadow-lg shadow-[#f36f21]/30' : 'bg-white/[0.06] text-stone-300 hover:bg-white/[0.12]'
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>
        {/* League chips */}
        {sportTab === 'football' && (
        <div className="relative flex gap-1.5 overflow-x-auto scrollbar-none mt-3 pb-1">
          {custom && (
            <button
              key={custom.id}
              onClick={() => setLeagueId(custom.id)}
              className={`shrink-0 pl-2 pr-1.5 py-1.5 rounded-full text-[12px] font-bold transition-all active:scale-95 flex items-center gap-1.5 ${
                leagueId === custom.id
                  ? 'grad-brand text-white shadow-lg shadow-[#f36f21]/30'
                  : 'bg-white/[0.06] text-stone-300 hover:bg-white/[0.12] hover:text-white'
              }`}
            >
              {custom.customBadge ? <img src={custom.customBadge} alt="" className="w-5 h-5 object-contain" onError={e => { e.target.style.display = 'none'; }} /> : <span>{custom.flag}</span>}
              <span className="max-w-[140px] truncate">{custom.short}</span>
              <span
                role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); setCustom(null); setLeagueId('epl'); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setCustom(null); setLeagueId('epl'); } }}
                className="w-5 h-5 rounded-full bg-black/30 hover:bg-black/60 flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          )}
          {LEAGUES.map(l => (
            <button
              key={l.id}
              onClick={() => setLeagueId(l.id)}
              className={`shrink-0 pl-2 pr-3.5 py-1.5 rounded-full text-[12px] font-bold transition-all active:scale-95 flex items-center gap-2 ${
                leagueId === l.id
                  ? 'grad-brand text-white shadow-lg shadow-[#f36f21]/30'
                  : 'bg-white/[0.06] text-stone-300 hover:bg-white/[0.12] hover:text-white'
              }`}
            >
              {l.logo ? (
                <img src={l.logo} alt="" className="w-6 h-6 object-contain rounded-md bg-white/90 p-0.5" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <span>{l.flag}</span>
              )}
              {l.short}
            </button>
          ))}
          <button
            onClick={() => setShowExplorer(v => !v)}
            className={`shrink-0 px-3.5 py-2 rounded-full text-[12px] font-black transition-all active:scale-95 flex items-center gap-1.5 border border-dashed ${
              showExplorer ? 'border-[#f36f21] text-[#ff9a3d] bg-[#f36f21]/10' : 'border-white/20 text-stone-300 hover:border-white/40 hover:text-white'
            }`}
          >
            🌍 {t('sports.more')}
          </button>
        </div>
        )}
        {/* Explorer: chọn môn -> chọn giải */}
        {sportTab === 'football' && showExplorer && (
          <div className="relative mt-3 rounded-2xl border border-white/10 bg-black/30 p-3.5">
            <p className="text-[11px] text-stone-400 mb-2.5">🌍 <b className="text-stone-200">{t('sports.more_title')}</b> · {t('sports.more_hint')}</p>
            {!sportsIdx ? (
              <div className="flex items-center gap-2 text-[12px] text-stone-500 py-3">
                <span className="w-4 h-4 border-2 border-[#f36f21] border-t-transparent rounded-full animate-spin" /> {t('app.loading')}
              </div>
            ) : (
              <>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-2">
                  {(sportsIdx.sports || []).map(sp => (
                    <button
                      key={sp.name}
                      onClick={() => setExplorerSport(sp.name)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all active:scale-95 ${
                        explorerSport === sp.name ? 'grad-brand text-white shadow' : 'bg-white/[0.06] text-stone-300 hover:bg-white/[0.12]'
                      }`}
                    >
                      {sp.icon} {sp.name} <span className="opacity-60 text-[10px]">{sp.count}</span>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto pr-1">
                  {((sportsIdx.sports || []).find(sp => sp.name === explorerSport)?.leagues || []).map(l => (
                    <button
                      key={l.tsdb}
                      onClick={() => pickExplorerLeague(l)}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left text-[12px] font-bold transition-all active:scale-[0.98] ${
                        custom?.tsdb === l.tsdb ? 'bg-[#f36f21]/15 border border-[#f36f21]/40 text-white' : 'bg-white/[0.04] border border-transparent text-stone-300 hover:bg-white/[0.09] hover:text-white'
                      }`}
                    >
                      {l.badge ? (
                        <img src={l.badge} alt="" loading="lazy" className="w-7 h-7 object-contain shrink-0" onError={e => { e.target.style.display = 'none'; }} />
                      ) : (
                        <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-sm shrink-0">🏟️</span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate">{l.name}</span>
                        {l.country ? <span className="block text-[10px] font-medium text-stone-500 truncate">{l.country}</span> : null}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {sportTab === 'racing' ? (
        <div className="max-w-[1400px] mx-auto px-5 md:px-8 pb-4">
          <RacingSection />
        </div>
      ) : (
      <div className="max-w-[1400px] mx-auto px-5 md:px-8 space-y-9">
        {/* 0. TỈ SỐ MỚI NHẤT — MỌI GIẢI, tự cập nhật 60s/lần */}
        {latest.length > 0 && (
          <section>
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <Zap className="w-4 h-4 text-emerald-400" />
              </span>
              <h2 className="text-[19px] font-extrabold tracking-tight">{t('home.scores')}</h2>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>{t('sports.auto')}
              </span>
            </div>
            <ScrollRow>
              {latest.map(s => (
                <button
                  key={`${s.league?.id}-${s.ev?.idEvent}`}
                  onClick={() => setSelMatch(s.ev)}
                  className={`group shrink-0 w-[210px] snap-start rounded-2xl border p-2.5 text-left transition-all hover:-translate-y-0.5 ${s.live ? 'bg-[#f36f21]/10 border-[#f36f21]/50' : 'bg-white/[0.03] border-white/[0.07] hover:border-[#f36f21]/50'}`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-black text-stone-400 flex items-center gap-1">
                      {s.league?.logo ? <img src={s.league.logo} alt="" className="w-3.5 h-3.5 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : s.league?.flag} {s.league?.short}
                    </span>
                    {s.live ? (
                      <span className="px-1.5 py-0.5 text-[8px] font-black rounded-full grad-brand text-white flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-white animate-pulse"></span>{String(s.ev?.strStatus || 'LIVE').toUpperCase()}
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[8px] font-black rounded-full bg-white/10 text-stone-400">FT</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {[
                      { name: s.ev?.strHomeTeam, badge: s.ev?.strHomeTeamBadge, score: s.ev?.intHomeScore },
                      { name: s.ev?.strAwayTeam, badge: s.ev?.strAwayTeamBadge, score: s.ev?.intAwayScore },
                    ].map((tm, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <TeamBadge src={tm.badge} name={tm.name} size="w-6 h-6" />
                        <span className="flex-1 min-w-0 text-[11.5px] font-bold text-slate-200 truncate">{tm.name}</span>
                        <span className={`text-[13px] font-black tabular-nums ${s.live ? 'text-[#ffb37a]' : 'text-white'}`}>{tm.score ?? '-'}</span>
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </ScrollRow>
          </section>
        )}
        {/* 1. Kênh thể thao */}
        {sportChannels.length > 0 && (
          <section>
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="w-9 h-9 rounded-xl bg-[#f36f21]/15 border border-[#f36f21]/25 flex items-center justify-center">
                <Radio className="w-4 h-4 text-[#ff9a3d]" />
              </span>
              <h2 className="text-[19px] font-extrabold tracking-tight">{t('sports.channels')}</h2>
              <span className="text-[11px] text-stone-500 font-bold">{sportChannels.length}</span>
            </div>
            <ScrollRow>
              {sportChannels.map(ch => (
                <button
                  key={ch.channel_id}
                  onClick={() => onSelectChannel && onSelectChannel(ch)}
                  className="group shrink-0 w-[150px] snap-start rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#f36f21]/60 bg-[#15161b] text-left transition-all hover:-translate-y-0.5"
                >
                  <span className="block h-[86px] flex items-center justify-center bg-[#0c0d11] relative overflow-hidden">
                    {ch.logo ? (
                      <img src={ch.logo} alt="" loading="lazy" className="h-12 object-contain drop-shadow-lg group-hover:scale-110 transition-transform" onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <span className="font-black italic text-white/25 text-xl">{(ch.name || '?').slice(0, 3)}</span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="w-9 h-9 rounded-full bg-[#f36f21] flex items-center justify-center"><Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" /></span>
                    </span>
                  </span>
                  <span className="block px-2.5 py-2">
                    <span className="block text-[12px] font-bold text-white truncate">{ch.name}</span>
                    <span className="block text-[10px] text-stone-500 truncate">{ch.group_title || ''}</span>
                  </span>
                </button>
              ))}
            </ScrollRow>
          </section>
        )}

        {/* 2–3. Cúp đã đá xong: kết quả lên trước. Có lịch thì lịch trước. */}
        {(() => {
          const showPastFirst = !loading && data.next.length === 0 && data.past.length > 0;
          const fixtures = (
            <section key="fx">
              <div className="flex items-center gap-2.5 mb-3.5">
                <span className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
                  <CalendarDays className="w-4 h-4 text-sky-400" />
                </span>
                <h2 className="text-[19px] font-extrabold tracking-tight">{t('sports.fixtures')}</h2>
                <span className="text-[11px] text-stone-500 font-bold flex items-center gap-1.5 min-w-0">
                  {league.logo ? <img src={league.logo} alt="" className="w-4 h-4 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : league.flag}
                  <span className="truncate">{league.name}</span>
                  <span className="hidden sm:inline text-stone-600">· {t('sports.window')}</span>
                </span>
              </div>
              {loading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[132px] rounded-2xl bg-white/[0.04] animate-pulse" />)}
                </div>
              ) : data.next.length === 0 ? (
                <p className="text-[12px] text-stone-600 italic bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-6 text-center">{t('sports.no_data')}</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.next.slice(0, 12).map(ev => <MatchCard key={ev.idEvent} ev={ev} showScore={false} onClick={() => setSelMatch(ev)} onTeam={setSelTeam} />)}
                </div>
              )}
            </section>
          );
          const results = (
            <section key="rs">
              <div className="flex items-center gap-2.5 mb-3.5">
                <span className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-emerald-400" />
                </span>
                <h2 className="text-[19px] font-extrabold tracking-tight">{t('sports.results')}</h2>
                <span className="text-[11px] text-stone-600 font-bold">{t('sports.window')}</span>
              </div>
              {loading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[132px] rounded-2xl bg-white/[0.04] animate-pulse" />)}
                </div>
              ) : data.past.length === 0 ? (
                <p className="text-[12px] text-stone-600 italic bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-6 text-center">{t('sports.no_data')}</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.past.slice(0, 12).map(ev => <MatchCard key={ev.idEvent} ev={ev} showScore={true} onClick={() => setSelMatch(ev)} onTeam={setSelTeam} />)}
                </div>
              )}
            </section>
          );
          return showPastFirst ? <>{results}{fixtures}</> : <>{fixtures}{results}</>;
        })()}

        {/* 4. Bảng xếp hạng */}
        {data.table.length > 0 && (
          <section>
            <div className="flex items-center gap-2.5 mb-3.5">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                <ListOrdered className="w-4 h-4 text-amber-400" />
              </span>
              <h2 className="text-[19px] font-extrabold tracking-tight">{t('sports.table')}</h2>
            </div>
            <div className="rounded-2xl border border-white/[0.07] overflow-hidden bg-white/[0.02]">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] min-w-[520px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-widest text-stone-500 border-b border-white/[0.06]">
                      <th className="text-left font-black px-4 py-2.5 w-10">#</th>
                      <th className="text-left font-black px-2 py-2.5">{t('sports.th_team')}</th>
                      <th className="font-black px-2 py-2.5 w-10">{t('sports.th_p')}</th>
                      <th className="font-black px-2 py-2.5 w-10 hidden sm:table-cell">{t('sports.th_w')}</th>
                      <th className="font-black px-2 py-2.5 w-10 hidden sm:table-cell">{t('sports.th_d')}</th>
                      <th className="font-black px-2 py-2.5 w-10 hidden sm:table-cell">{t('sports.th_l')}</th>
                      <th className="font-black px-2 py-2.5 w-12">+/-</th>
                      <th className="font-black px-4 py-2.5 w-12 text-right">{t('sports.th_pts')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.table.map((row, i) => (
                      <tr key={i} className={`border-b border-white/[0.04] last:border-0 ${i < 4 ? 'bg-emerald-500/[0.04]' : ''}`}>
                        <td className="px-4 py-2.5 font-black text-stone-500 tabular-nums">
                          <span className={`inline-flex w-6 h-6 items-center justify-center rounded-lg ${i === 0 ? 'bg-amber-500/20 text-amber-300' : i < 4 ? 'bg-emerald-500/15 text-emerald-300' : 'text-stone-500'}`}>{i + 1}</span>
                        </td>
                        <td className="px-2 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelTeam({ name: row.name, id: row.id })}
                            className="flex items-center gap-2 min-w-0 w-full text-left hover:text-[#ffb37a]"
                          >
                            <TeamBadge src={row.badge} name={row.name} size="w-6 h-6" />
                            <span className="font-bold text-slate-200 truncate">{row.name}</span>
                          </button>
                        </td>
                        <td className="px-2 py-2.5 text-center text-stone-400 tabular-nums">{row.played}</td>
                        <td className="px-2 py-2.5 text-center text-stone-400 tabular-nums hidden sm:table-cell">{row.won}</td>
                        <td className="px-2 py-2.5 text-center text-stone-400 tabular-nums hidden sm:table-cell">{row.draw}</td>
                        <td className="px-2 py-2.5 text-center text-stone-400 tabular-nums hidden sm:table-cell">{row.lost}</td>
                        <td className="px-2 py-2.5 text-center text-stone-400 tabular-nums">{row.gd > 0 ? `+${row.gd}` : row.gd}</td>
                        <td className="px-4 py-2.5 text-right font-black text-white tabular-nums">{row.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* 5. Video xem lại */}
        <section>
          <div className="flex items-center gap-2.5 mb-3.5">
            <span className="w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center">
              <Clapperboard className="w-4 h-4 text-fuchsia-400" />
            </span>
            <h2 className="text-[19px] font-extrabold tracking-tight">{t('sports.videos')}</h2>
            {videos.length > 0 && <span className="text-[11px] text-stone-500 font-bold">{videos.length}</span>}
          </div>
          {videos.length === 0 ? (
            <p className="text-[12px] text-stone-600 italic bg-white/[0.02] border border-white/[0.05] rounded-2xl px-4 py-6 text-center">{t('sports.no_videos')}</p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {videos.map(v => (
                <button
                  key={v.id}
                  onClick={() => setPlaying(v)}
                  className="group rounded-2xl overflow-hidden border border-white/[0.08] hover:border-fuchsia-500/50 bg-[#15161b] text-left transition-all hover:-translate-y-0.5"
                >
                  <span className="block relative aspect-video bg-[#0c0d11] overflow-hidden">
                    {v.thumb_url ? (
                      <img src={v.thumb_url} alt="" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-3xl">⚽</span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/10 transition-colors">
                      <span className="w-11 h-11 rounded-full bg-black/70 border border-white/25 flex items-center justify-center group-hover:bg-[#f36f21] group-hover:border-transparent transition-all">
                        <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                      </span>
                    </span>
                    {v.duration && <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/80 text-[9px] font-bold text-white">{v.duration}</span>}
                    {v.league && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/70 text-[9px] font-bold text-fuchsia-300">{v.league}</span>}
                  </span>
                  <span className="block px-2.5 py-2">
                    <span className="flex items-start justify-between gap-1">
                      <span className="text-[12px] font-bold text-white leading-snug line-clamp-2">{v.title}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-stone-600 shrink-0 mt-0.5" />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      )}

      {/* Modal phát video */}
      {playing && (
        <VideoModal video={playing} onClose={() => setPlaying(null)} />
      )}
      {/* Chi tiết trận: diễn biến + highlight + dự đoán + nhắc + radio */}
      {selMatch && (
        <MatchDetailModal ev={selMatch} leagueName={sportTab === 'football' ? league.name : ''} onClose={() => setSelMatch(null)} onTeam={setSelTeam} />
      )}
      {selTeam && (
        <TeamDetailModal
          team={selTeam}
          onClose={() => setSelTeam(null)}
          onOpenMatch={(ev) => { setSelTeam(null); setSelMatch(ev); }}
        />
      )}
    </div>
  );
}

function VideoModal({ video, onClose }) {
  const { t } = useI18n();
  const parsed = parseVideoUrl(video.video_url);
  return (
    <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl modal-panel overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-bold text-white truncate">{video.title}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 shrink-0"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="aspect-video bg-black">
          {parsed.type === 'mp4' ? (
            <video src={parsed.src} controls autoPlay playsInline className="w-full h-full" />
          ) : (
            <iframe src={parsed.src} title={video.title} className="w-full h-full" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
          )}
        </div>
        {video.league && <p className="px-4 py-2.5 text-[11px] text-stone-500 font-bold">{video.league}</p>}
      </div>
    </div>
  );
}
