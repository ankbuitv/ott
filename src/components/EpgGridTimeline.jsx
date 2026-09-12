import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { maskScores } from '../utils/spoiler';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { Calendar, Clock, Play, Search, Bell, BellRing, X, Trash2, ChevronLeft, Radio, Tv } from 'lucide-react';
import SearchEPG from './SearchEPG';
import { formatTimeHHMM, formatDateVN, parseEpgDate } from '../utils/dateUtils';
import { getReminders, addReminder, deleteReminder } from '../services/reminders';
import { hasUserToken } from '../services/session';

function fmtRemind(ts) {
  try {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch { return ''; }
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * EpgGridTimeline — Lịch phát sóng kiểu master-detail:
 * trái = danh sách kênh, bấm kênh → phải = chương trình trong ngày (dọc).
 */
export default function EpgGridTimeline({
  channels = [],
  epgData = null,
  onPlayCatchup,
  onSelectChannel,
  onRequireLogin,
}) {
  const { t } = useI18n();
  const { addToast } = useToast();

  const [selectedCategory, setSelectedCategory] = useState(t('movies.genre.all'));
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProgSearch, setShowProgSearch] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [showReminders, setShowReminders] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const reloadReminders = useCallback(async () => {
    if (!hasUserToken()) { setReminders([]); return; }
    try { setReminders(await getReminders()); } catch { setReminders([]); }
  }, []);
  useEffect(() => { reloadReminders(); }, [reloadReminders]);

  const remindedKeys = useMemo(() => {
    const s = new Set();
    for (const r of reminders || []) s.add(`${r.channel_id}||${r.program_title}`);
    return s;
  }, [reminders]);

  const toggleRemind = useCallback(async (channel, prog) => {
    if (!hasUserToken()) {
      if (onRequireLogin) onRequireLogin(t('epg.need_login'));
      return;
    }
    const key = `${channel.channel_id}||${prog.title}`;
    try {
      if (remindedKeys.has(key)) {
        const found = (reminders || []).find((r) => `${r.channel_id}||${r.program_title}` === key);
        if (found) await deleteReminder(found.id);
        addToast(t('epg.rem_cancelled'), 'info');
      } else {
        await addReminder({ channel_id: channel.channel_id, program_title: prog.title, remind_at: fmtRemind(prog._startTs || parseEpgDate(prog.start).getTime()) });
        addToast(t('epg.rem_set', { title: prog.title }), 'success');
      }
      reloadReminders();
    } catch (e) {
      if (e?.code === 'LOGIN_REQUIRED' && onRequireLogin) onRequireLogin(t('epg.need_login'));
      else addToast(t('epg.rem_fail'), 'error');
    }
  }, [remindedKeys, reminders, reloadReminders, addToast, onRequireLogin]);

  const handleDeleteReminder = useCallback(async (id) => {
    try { await deleteReminder(id); reloadReminders(); }
    catch { addToast(t('epg.rem_del_fail'), 'error'); }
  }, [reloadReminders, addToast]);

  const dateTabs = useMemo(() => {
    const tabs = [];
    const now = new Date();
    for (let offset = -6; offset <= 6; offset++) {
      const d = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
      tabs.push({
        offset,
        date: d,
        future: offset > 0,
        label: offset === 0 ? t('epg.today') : (offset === -1 ? t('epg.yesterday') : (offset === 1 ? t('epg.tomorrow') : formatDateVN(d)))
      });
    }
    return tabs;
  }, [t]);

  const categories = useMemo(() => {
    const groups = new Set([t('movies.genre.all')]);
    channels.forEach(ch => { if (ch.group_title) groups.add(ch.group_title); });
    return Array.from(groups);
  }, [channels]);

  const filteredChannels = useMemo(() => {
    return (channels || []).filter(ch => {
      const matchCat = selectedCategory === t('movies.genre.all') || ch.group_title === selectedCategory;
      const matchSearch = !searchQuery || (ch.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [channels, selectedCategory, searchQuery, t]);

  const programmeIndex = useMemo(() => {
    const exact = new Map();
    const byNormId = new Map();
    const byName = new Map();
    const programmes = epgData?.programmes || [];
    for (let i = 0; i < programmes.length; i++) {
      const p = programmes[i];
      p._startTs = parseEpgDate(p.start).getTime();
      p._stopTs = parseEpgDate(p.stop).getTime();
      const arr = exact.get(p.channel);
      if (arr) arr.push(p);
      else exact.set(p.channel, [p]);
    }
    for (const [id, arr] of exact.entries()) {
      arr.sort((a, b) => a._startTs - b._startTs);
      const n = norm(id);
      if (!n) continue;
      const cur = byNormId.get(n);
      if (cur) cur.push(...arr);
      else byNormId.set(n, arr);
    }
    const nameToId = new Map();
    if (epgData?.channels && typeof epgData.channels === 'object') {
      for (const c of Object.values(epgData.channels)) {
        if (c?.name) nameToId.set(norm(c.name), c.id);
      }
    }
    for (const p of programmes) {
      if (p.display_name) nameToId.set(norm(p.display_name), p.channel);
    }
    for (const [n, chId] of nameToId.entries()) {
      const arr = exact.get(chId);
      if (arr && !byName.has(n)) byName.set(n, arr);
    }
    return { exact, byNormId, byName };
  }, [epgData]);

  const getProgramsFor = useCallback((channel) => {
    const chId = String(channel.channel_id || '');
    let pool = programmeIndex.exact.get(chId);
    if (!pool) pool = programmeIndex.byNormId.get(norm(chId));
    if (!pool) {
      const n = norm(channel.name);
      if (n) {
        pool = programmeIndex.byName.get(n);
        if (!pool) {
          for (const [key, arr] of programmeIndex.byName.entries()) {
            if (key.includes(n) || n.includes(key)) { pool = arr; break; }
          }
        }
      }
    }
    return pool || [];
  }, [programmeIndex]);

  const dayRange = useMemo(() => {
    const targetDate = dateTabs.find(tab => tab.offset === selectedDayOffset)?.date || new Date();
    const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);
    return { startTs: startOfDay.getTime(), endTs: endOfDay.getTime() };
  }, [selectedDayOffset, dateTabs]);

  const activeChannel = useMemo(() => {
    if (!filteredChannels.length) return null;
    return filteredChannels.find(c => c.channel_id === activeId) || filteredChannels[0];
  }, [filteredChannels, activeId]);

  const dayPrograms = useMemo(() => {
    if (!activeChannel) return [];
    return getProgramsFor(activeChannel).filter(p => p._startTs >= dayRange.startTs && p._startTs <= dayRange.endTs);
  }, [activeChannel, dayRange, getProgramsFor]);

  const nowTs = useMemo(() => Date.now(), [dayPrograms]);

  const handleProgClick = useCallback((prog) => {
    if (!activeChannel) return;
    const isPast = prog._stopTs < Date.now();
    const isLiveNow = prog._startTs <= Date.now() && prog._stopTs >= Date.now();
    const isSoon = !isPast && !isLiveNow && prog._startTs <= Date.now() + 5 * 60 * 1000;
    if (isPast) {
      if (onPlayCatchup) onPlayCatchup(activeChannel, prog);
    } else if (isLiveNow || isSoon) {
      if (onSelectChannel) onSelectChannel(activeChannel);
    } else {
      toggleRemind(activeChannel, prog);
    }
  }, [activeChannel, onPlayCatchup, onSelectChannel, toggleRemind]);

  return (
    <div className="flex flex-col h-full bg-[#0b0b0e] text-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 md:px-8 pt-5 pb-3 relative overflow-hidden shrink-0">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(600px 180px at 15% 0%, rgba(243,111,33,.14), transparent 70%), radial-gradient(500px 160px at 90% 0%, rgba(124,45,18,.16), transparent 70%)' }}></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[#ff9a3d] font-black uppercase tracking-[0.2em] text-[10px] mb-1">
              <Calendar className="w-3.5 h-3.5" /> {t('epg.kicker')}
            </div>
            <h1 className="text-[26px] font-black text-white tracking-tight leading-none">{t('epg.title')}</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder={t('epg.search_ch')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white/[0.06] border border-white/10 rounded-full text-[13px] text-slate-200 placeholder:text-stone-500 focus:outline-none focus:border-[#f36f21]/70 focus:ring-2 focus:ring-[#f36f21]/20 transition-all"
              />
            </div>
            <button
              onClick={() => setShowProgSearch((v) => !v)}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition-all whitespace-nowrap ${showProgSearch ? 'grad-brand text-white border-transparent' : 'bg-white/[0.06] text-slate-300 border-white/10 hover:text-white'}`}
            >
              {t('epg.search_prog')}
            </button>
            <div className="relative">
              <button
                onClick={() => { setShowReminders((v) => !v); reloadReminders(); }}
                className={`p-2 rounded-full border transition-all ${showReminders ? 'bg-amber-500/20 text-amber-300 border-amber-500/50' : 'bg-white/[0.06] text-slate-300 border-white/10 hover:text-white'}`}
                title={t('epg.my_rem')}
              >
                <Bell className="w-4 h-4" />
                {reminders.length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-black text-[10px] font-black flex items-center justify-center">
                    {reminders.length > 9 ? '9+' : reminders.length}
                  </span>
                )}
              </button>
              {showReminders && (
                <div className="absolute right-0 top-full mt-2 w-80 max-w-[85vw] bg-[#141419] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 anim-pop-fast">
                  <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center gap-1.5"><BellRing className="w-3.5 h-3.5 text-amber-400" /> {t('epg.my_rem')}</span>
                    <button onClick={() => setShowReminders(false)} className="p-1 hover:bg-white/10 rounded-lg"><X className="w-3.5 h-3.5 text-slate-400" /></button>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {reminders.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[11px] text-slate-500">{t('epg.rem_empty')}</p>
                    ) : reminders.map((r) => (
                      <div key={r.id} className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold truncate">{r.program_title}</p>
                          <p className="text-[10px] text-slate-500">{r.channel_id} · {String(r.remind_at || '').slice(0, 16)}</p>
                        </div>
                        <button onClick={() => handleDeleteReminder(r.id)} className="p-1.5 hover:bg-[#f36f21]/20 rounded-lg" title={t('epg.rem_del')}>
                          <Trash2 className="w-3.5 h-3.5 text-slate-500 hover:text-[#ff9a3d]" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showProgSearch && (
        <div className="px-5 md:px-8 mb-2 shrink-0">
          <SearchEPG epgData={epgData} channels={channels} onPlayCatchup={onPlayCatchup} onSelectChannel={onSelectChannel} />
        </div>
      )}

      {/* Day tabs */}
      <div className="px-5 md:px-8 flex items-center gap-2 overflow-x-auto pb-2 pt-1 mb-1 scrollbar-none shrink-0">
        {dateTabs.map((tab) => (
          <button
            key={tab.offset}
            onClick={() => setSelectedDayOffset(tab.offset)}
            className={`px-4 py-2 rounded-full font-bold text-xs whitespace-nowrap flex items-center gap-1.5 transition-all active:scale-95 ${
              selectedDayOffset === tab.offset
                ? (tab.future ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30' : 'grad-brand text-white shadow-lg shadow-[#f36f21]/30')
                : tab.future
                ? 'bg-white/[0.04] border border-sky-500/25 text-sky-300/70 hover:text-sky-200 hover:border-sky-500/50'
                : 'bg-white/[0.04] border border-white/10 text-slate-400 hover:text-white hover:border-white/25'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Category tabs */}
      <div className="px-5 md:px-8 flex items-center gap-1.5 overflow-x-auto pb-3 scrollbar-none shrink-0">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 ${
              selectedCategory === cat
                ? 'bg-[#f36f21]/20 text-[#ff9a3d] border border-[#f36f21]/50'
                : 'bg-transparent text-stone-500 border border-transparent hover:text-stone-200 hover:bg-white/[0.06]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Master-detail */}
      <div className="flex-1 min-h-0 flex gap-3 px-5 md:px-8 pb-6">
        {/* LEFT: channel list */}
        <div className={`${activeId !== null ? 'hidden md:flex' : 'flex'} w-full md:w-72 md:min-w-[288px] flex-col min-h-0 bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden`}>
          <div className="px-3.5 py-2.5 border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-stone-500 shrink-0">
            {t('epg.channels')} · {filteredChannels.length}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredChannels.length === 0 && (
              <p className="text-center text-[11px] text-stone-600 py-8">{t('epg.no_channel_found')}</p>
            )}
            {filteredChannels.slice(0, 400).map((ch) => {
              const active = activeChannel && ch.channel_id === activeChannel.channel_id;
              return (
                <button
                  key={ch.channel_id}
                  onClick={() => setActiveId(ch.channel_id)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-xl border text-left transition-all active:scale-[0.98] ${
                    active
                      ? 'bg-[#f36f21]/15 border-[#f36f21]/50 shadow-lg shadow-[#f36f21]/10'
                      : 'bg-transparent border-transparent hover:bg-white/[0.05]'
                  }`}
                >
                  <img
                    src={ch.logo || 'https://i.ibb.co/VcLxwgM2/logo.png'}
                    alt=""
                    className="w-9 h-9 object-contain rounded-lg bg-black/50 p-0.5 ring-1 ring-white/10 shrink-0"
                    onError={(e) => { e.target.src = 'https://i.ibb.co/VcLxwgM2/logo.png'; }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[12px] font-bold ${active ? 'text-white' : 'text-slate-300'}`}>{ch.name}</span>
                    <span className="block truncate text-[10px] text-stone-600">{ch.group_title}</span>
                  </span>
                  {active && <span className="w-1.5 h-8 rounded-full grad-brand shrink-0"></span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: day programs */}
        <div className={`${activeId === null ? 'hidden md:flex' : 'flex'} flex-1 min-w-0 flex-col min-h-0 bg-white/[0.02] border border-white/[0.06] rounded-2xl overflow-hidden`}>
          {!activeChannel ? (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-600 py-16">
              <Tv className="w-10 h-10 mb-3" />
              <p className="text-xs">{t('epg.pick_channel')}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 shrink-0 bg-black/20">
                <button onClick={() => setActiveId(null)} className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-white/10" title={t('common.back')}>
                  <ChevronLeft className="w-5 h-5 text-slate-300" />
                </button>
                <img
                  src={activeChannel.logo || 'https://i.ibb.co/VcLxwgM2/logo.png'}
                  alt=""
                  className="w-11 h-11 object-contain rounded-xl bg-black/50 p-1 ring-1 ring-white/10"
                  onError={(e) => { e.target.src = 'https://i.ibb.co/VcLxwgM2/logo.png'; }}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-black text-white truncate">{activeChannel.name}</h2>
                  <p className="text-[10px] text-stone-500">{activeChannel.group_title} · {dayPrograms.length} {t('epg.progs')}</p>
                </div>
                <button
                  onClick={() => onSelectChannel && onSelectChannel(activeChannel)}
                  className="px-4 py-2 grad-brand text-white text-xs font-black rounded-full flex items-center gap-1.5 shadow-lg shadow-[#f36f21]/30 active:scale-95 transition-all shrink-0"
                >
                  <Play className="w-3.5 h-3.5 fill-current" /> {t('epg.watch_live')}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {dayPrograms.length === 0 && (
                  <div className="text-center py-14 text-stone-600 text-xs italic">{t('epg.no_data')}</div>
                )}
                {dayPrograms.slice(0, 120).map((prog, idx) => {
                  const isPast = prog._stopTs < nowTs;
                  const isLiveNow = prog._startTs <= nowTs && prog._stopTs >= nowTs;
                  const isSoon = !isPast && !isLiveNow && prog._startTs <= nowTs + 5 * 60 * 1000;
                  const isFuture = !isPast && !isLiveNow;
                  const reminded = remindedKeys.has(`${activeChannel.channel_id}||${prog.title}`);
                  const livePct = isLiveNow && prog._stopTs > prog._startTs
                    ? Math.min(100, Math.max(0, ((nowTs - prog._startTs) / (prog._stopTs - prog._startTs)) * 100))
                    : 0;
                  return (
                    <button
                      key={`${prog.start}-${idx}`}
                      onClick={() => handleProgClick(prog)}
                      className={`w-full text-left p-3 rounded-2xl border transition-all active:scale-[0.99] flex gap-3 ${
                        isLiveNow
                          ? 'bg-gradient-to-r from-[#f36f21]/20 to-[#7a2f0e]/15 border-[#f36f21]/60 shadow-lg shadow-[#f36f21]/10'
                          : isPast
                          ? 'bg-white/[0.03] border-white/[0.07] hover:border-purple-500/40'
                          : 'bg-black/30 border-white/[0.05] hover:border-white/20'
                      }`}
                    >
                      <span className="shrink-0 w-[104px] pt-0.5">
                        <span className={`flex items-center gap-1 text-[11px] font-black ${isLiveNow ? 'text-[#ffb37a]' : 'text-stone-400'}`}>
                          <Clock className="w-3 h-3" />{formatTimeHHMM(prog.start)}
                        </span>
                        <span className="text-[10px] text-stone-600 font-semibold">– {formatTimeHHMM(prog.stop)}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2 mb-1">
                          <span className={`font-bold text-[13px] leading-snug line-clamp-2 ${isLiveNow ? 'text-white' : isPast ? 'text-slate-400' : 'text-slate-200'}`}>
                            {maskScores(prog.title)}
                          </span>
                          {isLiveNow && (
                            <span className="px-2 py-0.5 text-[9px] font-black rounded-full grad-brand text-white flex items-center gap-1 shrink-0">
                              <Radio className="w-2 h-2 animate-pulse" /> LIVE
                            </span>
                          )}
                          {isPast && (
                            <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1 shrink-0">
                              <Play className="w-2 h-2 fill-current" /> {t('epg.back')}
                            </span>
                          )}
                          {isSoon && (
                            <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 shrink-0">{t('epg.soon')}</span>
                          )}
                          {isFuture && !isSoon && (
                            <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border flex items-center gap-1 shrink-0 ${reminded ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-white/[0.04] text-stone-500 border-white/10'}`}>
                              <Bell className="w-2 h-2" /> {reminded ? t('epg.reminded') : t('epg.remind_me')}
                            </span>
                          )}
                        </span>
                        {isLiveNow ? (
                          <span className="block mt-1.5 h-1 rounded-full bg-black/40 overflow-hidden">
                            <span className="block h-full rounded-full bg-gradient-to-r from-[#f36f21] to-[#ff9a3d]" style={{ width: `${livePct}%` }}></span>
                          </span>
                        ) : prog.desc ? (
                          <span className="block text-[11px] text-stone-600 line-clamp-1 mt-0.5">{prog.desc}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
