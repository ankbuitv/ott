import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Bell, BellRing, Radio, Volume2, VolumeX, Trophy, Sparkles } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchEventDetail, bustEventDetail, buildTimeline } from '../services/racing';
import { parseVideoUrl } from '../services/sports';
import { addLocalReminder, removeLocalReminder, hasReminder, ensureNotifyPermission } from '../services/localNotify';
import { fetchPredict, submitPredict } from '../services/social';

const KIND_ICON = { goal: '⚽', yellow: '🟨', red: '🟥', sub: '🔄', corner: '🚩' };

function matchTs(ev) {
  try {
    if (ev.strTimestamp) { const d = new Date(/z$/i.test(ev.strTimestamp) ? ev.strTimestamp : ev.strTimestamp + 'Z'); if (!isNaN(d.getTime())) return d.getTime(); }
    if (ev.dateEvent) { const d = new Date(`${ev.dateEvent}T${ev.strTime || '00:00:00'}`); if (!isNaN(d.getTime())) return d.getTime(); }
  } catch {}
  return 0;
}
function isLive(ev) {
  const s = String(ev.strStatus || '').toUpperCase();
  return s && !['NS', 'FT', 'AOT', 'POSTPONED', 'CANCELLED', 'ABANDONED'].includes(s) && ev.strPostponed !== 'yes';
}

// Radio bình luận: đọc diễn biến mới bằng giọng Việt
function speakVi(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    const vs = speechSynthesis.getVoices();
    const vi = vs.find(v => /vi[-_]/i.test(v.lang));
    if (vi) u.voice = vi;
    u.rate = 1.02;
    speechSynthesis.speak(u);
  } catch {}
}

export default function MatchDetailModal({ ev, leagueName = '', onClose }) {
  const { t, lang } = useI18n();
  const { addToast } = useToast();
  const { isAuthenticated } = useAuth();
  const [tab, setTab] = useState('timeline');
  const [detail, setDetail] = useState(ev);
  const [loading, setLoading] = useState(false);
  const [radio, setRadio] = useState(false);
  const [reminded, setReminded] = useState(false);
  const [pred, setPred] = useState({ ph: '', pa: '' });
  const [mine, setMine] = useState(null);
  const [board, setBoard] = useState([]);
  const seenRef = useRef(new Set());
  const radioRef = useRef(false);
  const key = `tsdb-${ev.idEvent}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchEventDetail(ev.idEvent);
      if (d) setDetail(d);
    } catch {} finally { setLoading(false); }
  }, [ev.idEvent]);

  useEffect(() => {
    setReminded(hasReminder(`match-${ev.idEvent}`));
    fetchPredict(key).then(d => { setMine(d.mine || null); setBoard(d.board || []); }).catch(() => {});
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.idEvent]);

  // Tường thuật trực tiếp: tự refresh mỗi 60s khi đang đá
  useEffect(() => {
    if (!isLive(detail)) return undefined;
    const iv = setInterval(() => { bustEventDetail(ev.idEvent); load(); }, 60000);
    return () => clearInterval(iv);
  }, [detail.strStatus, ev.idEvent, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const timeline = buildTimeline(detail);

  // Radio: đọc các diễn biến chưa đọc
  useEffect(() => {
    radioRef.current = radio;
    if (!radio) { try { speechSynthesis.cancel(); } catch {} return; }
    const fresh = timeline.filter(x => !seenRef.current.has(`${x.kind}-${x.min}-${x.player}`));
    fresh.forEach(x => seenRef.current.add(`${x.kind}-${x.min}-${x.player}`));
    if (fresh.length) {
      const team = x => (x.team === 'home' ? detail.strHomeTeam : detail.strAwayTeam);
      const lines = fresh.map(x => {
        if (x.kind === 'goal') return `Phút ${x.label}, ${x.player} ghi bàn cho ${team(x)}. Tỉ số ${detail.intHomeScore || 0} - ${detail.intAwayScore || 0}.`;
        if (x.kind === 'red') return `Phút ${x.label}, thẻ đỏ cho ${x.player}, ${team(x)}.`;
        if (x.kind === 'yellow') return `Phút ${x.label}, thẻ vàng cho ${x.player}, ${team(x)}.`;
        return `Phút ${x.label}, ${x.player}.`;
      });
      lines.forEach(speakVi);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radio, timeline.length]);

  useEffect(() => () => { try { speechSynthesis.cancel(); } catch {} }, []);

  const toggleRemind = async () => {
    const id = `match-${ev.idEvent}`;
    if (reminded) { removeLocalReminder(id); setReminded(false); return; }
    const ts = matchTs(ev);
    if (!ts || ts < Date.now()) { addToast(t('match.already'), 'info'); return; }
    await ensureNotifyPermission();
    addLocalReminder({ id, title: `⚽ ${ev.strHomeTeam} vs ${ev.strAwayTeam}`, body: `${leagueName} — ${t('match.starting')}`, at: ts - 15 * 60 * 1000 });
    setReminded(true);
    addToast(t('match.remind_ok'), 'success');
  };

  const sendPredict = async () => {
    if (!isAuthenticated) { addToast(t('match.need_login'), 'info'); return; }
    const ph = parseInt(pred.ph), pa = parseInt(pred.pa);
    if (!(ph >= 0) || !(pa >= 0)) { addToast(t('match.need_score'), 'error'); return; }
    try {
      await submitPredict({ event_key: key, league: leagueName, home: ev.strHomeTeam, away: ev.strAwayTeam, ph, pa });
      setMine({ ph, pa, points: null });
      addToast(t('match.predict_ok'), 'success');
    } catch (e) {
      addToast(e.code === 'LOGIN_REQUIRED' ? t('match.need_login') : (e.message || t('match.predict_fail')), 'error');
    }
  };

  const video = detail.strVideo ? parseVideoUrl(detail.strVideo) : null;
  const live = isLive(detail);
  const tabs = [
    { id: 'timeline', label: `📝 ${t('match.timeline')}` },
    { id: 'highlight', label: `🎬 ${t('match.highlight')}` },
    { id: 'predict', label: `🔮 ${t('match.predict')}` },
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-2xl modal-panel overflow-hidden max-h-[92vh] flex flex-col rounded-t-3xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        {/* Header tỉ số */}
        <div className="px-4 py-4 border-b border-white/10 bg-gradient-to-br from-[#f36f21]/15 via-transparent to-sky-500/10">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500">{leagueName}{detail.intRound ? ` · ${t('sports.round', { n: detail.intRound })}` : ''}</p>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 -mt-1 -mr-1"><X className="w-4 h-4 text-slate-400" /></button>
          </div>
          <div className="flex items-center justify-between gap-3 mt-2">
            <div className="flex-1 text-center">
              <p className="text-[13px] font-extrabold text-white leading-tight">{detail.strHomeTeam}</p>
            </div>
            <div className="text-center shrink-0">
              <p className="text-[28px] font-black tabular-nums leading-none">{detail.intHomeScore ?? '-'}<span className="text-stone-600 mx-1.5">:</span>{detail.intAwayScore ?? '-'}</p>
              {live
                ? <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 text-[9px] font-black rounded-full grad-brand text-white"><span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />{String(detail.strStatus || 'LIVE').toUpperCase()}</span>
                : <p className="text-[10px] text-stone-500 font-bold mt-1.5">{detail.strStatus === 'FT' || detail.intHomeScore != null ? 'FT' : (detail.dateEvent || '')}</p>}
            </div>
            <div className="flex-1 text-center">
              <p className="text-[13px] font-extrabold text-white leading-tight">{detail.strAwayTeam}</p>
            </div>
          </div>
          {/* Nhắc + Radio */}
          <div className="flex items-center gap-2 mt-3">
            <button onClick={toggleRemind} className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${reminded ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-white/[0.06] text-stone-300 border border-white/10 hover:bg-white/[0.12]'}`}>
              {reminded ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}{reminded ? t('match.reminded') : t('match.remind')}
            </button>
            <button onClick={() => setRadio(r => !r)} className={`flex-1 py-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all ${radio ? 'bg-[#f36f21] text-white shadow-lg shadow-[#f36f21]/30' : 'bg-white/[0.06] text-stone-300 border border-white/10 hover:bg-white/[0.12]'}`}>
              {radio ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}<Radio className="w-3.5 h-3.5" />{t('match.radio')}
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1.5 px-4 pt-3">
          {tabs.map(tb => (
            <button key={tb.id} onClick={() => setTab(tb.id)} className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${tab === tb.id ? 'bg-white/10 text-white' : 'text-stone-500 hover:text-stone-300'}`}>{tb.label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-[220px]">
          {tab === 'timeline' && (
            <div>
              {loading && <p className="text-[11px] text-stone-500 mb-2">⟳ {t('app.loading')}</p>}
              {timeline.length === 0 ? (
                <p className="text-[12px] text-stone-600 italic text-center py-8">{live ? t('match.no_events_yet') : t('match.no_timeline')}</p>
              ) : (
                <div className="relative pl-5 space-y-3 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-white/10">
                  {timeline.map((x, i) => (
                    <div key={i} className="relative">
                      <span className="absolute -left-5 top-0.5 text-[11px] bg-[#15161b] pr-0.5">{KIND_ICON[x.kind] || '•'}</span>
                      <p className="text-[12px] text-slate-200"><span className="font-black text-[#ffb37a] tabular-nums">{x.label}</span> <span className="font-bold">{x.player}</span></p>
                      <p className="text-[10px] text-stone-500">{x.team === 'home' ? detail.strHomeTeam : detail.strAwayTeam}</p>
                    </div>
                  ))}
                </div>
              )}
              {live && <p className="text-[10px] text-stone-600 mt-3">● {t('match.auto_update')}</p>}
            </div>
          )}
          {tab === 'highlight' && (
            <div>
              {video ? (
                <div className="rounded-2xl overflow-hidden border border-white/10 aspect-video bg-black">
                  {video.type === 'mp4'
                    ? <video src={video.src} controls playsInline className="w-full h-full" />
                    : <iframe src={video.src} title="highlight" className="w-full h-full" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />}
                </div>
              ) : (
                <p className="text-[12px] text-stone-600 italic text-center py-8">{t('match.no_highlight')}</p>
              )}
            </div>
          )}
          {tab === 'predict' && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-3">
                <p className="text-[11px] font-bold text-stone-400 mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-400" />{t('match.predict_title')}</p>
                {mine ? (
                  <p className="text-[13px] font-extrabold text-white text-center py-1">{t('match.your_predict')}: <span className="text-[#ffb37a] tabular-nums">{mine.ph} - {mine.pa}</span>{mine.points != null && <span className="ml-2 text-emerald-400">+{mine.points}đ</span>}</p>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <input value={pred.ph} onChange={e => setPred({ ...pred, ph: e.target.value.replace(/\D/g, '').slice(0, 2) })} inputMode="numeric" placeholder="0" className="w-12 h-11 rounded-xl bg-black/50 border border-white/15 text-center text-lg font-black text-white outline-none focus:border-[#f36f21]" />
                    <span className="text-stone-500 font-black">-</span>
                    <input value={pred.pa} onChange={e => setPred({ ...pred, pa: e.target.value.replace(/\D/g, '').slice(0, 2) })} inputMode="numeric" placeholder="0" className="w-12 h-11 rounded-xl bg-black/50 border border-white/15 text-center text-lg font-black text-white outline-none focus:border-[#f36f21]" />
                    <button onClick={sendPredict} className="ml-1 px-4 h-11 rounded-xl grad-brand text-white text-[12px] font-bold shadow-lg shadow-[#f36f21]/25 active:scale-95">{t('match.send')}</button>
                  </div>
                )}
                <p className="text-[10px] text-stone-600 text-center mt-2">{t('match.predict_rule')}</p>
              </div>
              {board.length > 0 && (
                <div className="rounded-2xl border border-white/[0.07] overflow-hidden">
                  <p className="px-3 py-2 text-[11px] font-black uppercase tracking-widest text-stone-500 flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-amber-400" />{t('match.board')}</p>
                  {board.slice(0, 8).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.05]">
                      <span className={`w-6 h-6 rounded-lg text-[11px] font-black flex items-center justify-center ${i === 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-stone-400'}`}>{i + 1}</span>
                      <span className="flex-1 text-[12px] font-bold text-slate-200 truncate">{r.name || '?'}</span>
                      <span className="text-[12px] font-black text-white tabular-nums">{r.pts}đ</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
