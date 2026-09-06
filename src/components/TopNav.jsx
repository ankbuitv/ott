import React, { useState, useEffect, useRef } from 'react';
import Logo from './Logo';
import { Bell, Check, BellRing, Globe, Mic, Search, X, Download, Smartphone, ChevronDown, LogOut, Settings, Users, UserPlus, Crown } from 'lucide-react';
import { listenOnce, parseVoiceCommand, findChannelByVoice } from '../services/voice';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { MovieAPI, imgPath } from '../services/tmdb';
import { API_BASE } from '../services/config';
import { enablePush, disablePush, isPushEnabled } from '../services/push';
import { planByCode } from '../services/plans';
import DownloadAppModal from './DownloadAppModal';

function TopNav({ channels, searchQuery, setSearchQuery, user, currentProfile, setActiveTab, activeTab, onSelectChannel, onSelectMovie, onShowAuth, onShowSettings, profiles = [], onSelectProfile, onManageProfiles }) {
  const { isAuthenticated, logout, effectivePlan } = useAuth();
  const { t, lang, setLang, languages } = useI18n();
  const [searchFocused, setSearchFocused] = useState(false);
  const [movieResults, setMovieResults] = useState([]);
  const [searchingMovies, setSearchingMovies] = useState(false);
  const boxRef = useRef(null);

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [lastRead, setLastRead] = useState(() => {
    try { return parseInt(localStorage.getItem('chrtv_notif_read') || '0', 10); } catch { return 0; }
  });
  const [pushOn, setPushOn] = useState(false);
  const [expandedNotifs, setExpandedNotifs] = useState(() => new Set());
  const notifRef = useRef(null);
  const [langOpen, setLangOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMsg, setVoiceMsg] = useState('');
  const [mobileSearch, setMobileSearch] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [apkOpen, setApkOpen] = useState(false);
  const apkRef = useRef(null);
  const userRef = useRef(null);
  const searchInputRef = useRef(null);
  const planMeta = planByCode(effectivePlan);
  const hasPaidPlan = isAuthenticated && effectivePlan && effectivePlan !== 'standard';

  const startVoice = async () => {
    if (listening) return;
    setListening(true);
    setVoiceMsg(t('voice.listening'));
    try {
      const text = await listenOnce('vi-VN');
      setVoiceMsg(t('voice.heard', { text }));
      const cmd = parseVoiceCommand(text);
      if (cmd.type === 'tab' && setActiveTab) {
        setActiveTab(cmd.tab);
        const tabLabel = { channels: t('nav.home'), epg: 'EPG', movies: t('nav.movies'), shorts: t('nav.shortcuts'), plans: t('nav.plans'), favorites: t('app.favorites'), history: t('voice.history') }[cmd.tab] || cmd.tab;
        setVoiceMsg(t('voice.switched', { tab: tabLabel }));
      } else if (cmd.type === 'open-channel') {
        const ch = findChannelByVoice(channels || [], cmd.query);
        if (ch && onSelectChannel) {
          setSearchQuery(''); setSearchFocused(false);
          onSelectChannel(ch);
          setVoiceMsg(t('voice.opening', { name: ch.name }));
        } else {
          setVoiceMsg(t('voice.not_found', { q: cmd.query }));
        }
      } else {
        setSearchQuery(cmd.query || '');
        setSearchFocused(true);
        if (setActiveTab) setActiveTab('channels');
      }
    } catch (e) {
      setVoiceMsg(e?.message === 'NO_MIC' ? t('voice.no_mic') : (e?.message === 'NO_SR' ? t('voice.no_sr') : t('voice.retry')));
    } finally {
      setListening(false);
      setTimeout(() => setVoiceMsg(''), 4000);
    }
  };
  const langRef = useRef(null);
  const curLang = (languages || []).find((l) => l.code === lang);

  const unreadCount = notifs.filter((n) => {
    const ts = new Date((n.created_at || '').replace(' ', 'T') + 'Z').getTime() || 0;
    return ts > lastRead;
  }).length;

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/notifications`, { headers: { Accept: 'application/json' } })
      .then((r) => r.json())
      .then((d) => { if (alive) setNotifs(d.notifications || []); })
      .catch(() => {});
    isPushEnabled().then((on) => { if (alive) setPushOn(on); }).catch(() => {});
    const iv = setInterval(() => {
      fetch(`${API_BASE}/api/notifications`, { headers: { Accept: 'application/json' } })
        .then((r) => r.json()).then((d) => { if (alive) setNotifs(d.notifications || []); }).catch(() => {});
    }, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  useEffect(() => {
    const h = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (langRef.current && !langRef.current.contains(e.target)) setLangOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
      if (apkRef.current && !apkRef.current.contains(e.target)) setApkOpen(false);
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, []);

  const markAllRead = () => {
    const now = Date.now();
    try { localStorage.setItem('chrtv_notif_read', String(now)); } catch {}
    setLastRead(now);
  };

  const togglePush = async () => {
    if (pushOn) {
      const r = await disablePush();
      if (r.ok) { setPushOn(false); alert(t('voice.push_off')); }
    } else {
      const r = await enablePush();
      if (r.ok) setPushOn(true);
      else alert(r.reason || t('voice.push_fail'));
    }
  };

  const q = searchQuery.trim();

  useEffect(() => {
    if (q.length < 2) { setMovieResults([]); setSearchingMovies(false); return; }
    setSearchingMovies(true);
    const timer = setTimeout(async () => {
      let r = await MovieAPI.search(q).catch(() => ({ results: [] }));
      let res = (r.results || []).filter(m => (m.media_type === 'movie' || m.media_type === 'tv') && m.poster_path).slice(0, 6);
      if (res.length === 0) {
        res = (await MovieAPI.searchFallback(q).catch(() => []))
          .filter(m => m.poster_path)
          .slice(0, 6);
      }
      setMovieResults(res);
      setSearchingMovies(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setSearchFocused(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchFocused(true);
        if (window.innerWidth < 768) setMobileSearch(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape') {
        setSearchFocused(false);
        setMobileSearch(false);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const channelMatches = q
    ? (channels || []).filter(ch => (ch.name || '').toLowerCase().includes(q.toLowerCase())).slice(0, 5)
    : [];

  const showDropdown = searchFocused && q.length > 0 && (channelMatches.length > 0 || movieResults.length > 0 || searchingMovies);

  const closeSearch = () => { setSearchQuery(''); setSearchFocused(false); setMobileSearch(false); };

  const pickMovie = (m) => {
    closeSearch();
    if (onSelectMovie) onSelectMovie(m);
    else if (setActiveTab) setActiveTab('movies');
  };

  const pickChannel = (ch) => {
    closeSearch();
    onSelectChannel && onSelectChannel(ch);
  };

  return (
    <nav className="topbar-mytv px-4 md:px-6 h-16 flex items-center justify-between sticky top-0 z-40 shrink-0">
      <div className="flex items-center gap-6">
        <button onClick={() => setActiveTab && setActiveTab('channels')} className="shrink-0 hover:opacity-90 active:scale-95 transition-all" title="Trang chủ">
          <Logo size="sm" />
        </button>
        <div className={`relative ${mobileSearch ? 'block absolute inset-x-3 top-2 z-50 md:static md:inset-auto' : 'hidden md:block'}`} ref={boxRef}>
          <div className={`flex items-center gap-2 bg-white/5 hover:bg-white/10 border ${searchFocused ? 'border-[#f36f21]' : 'border-white/10 hover:border-white/20'} px-3.5 py-2 rounded-xl w-full md:w-80 transition-all ${mobileSearch ? 'bg-[#14151a] border-[#f36f21]/50' : ''}`}>
            <Search className="w-4 h-4 text-stone-400 shrink-0" />
            <input ref={searchInputRef} data-chrtv-search className="bg-transparent text-sm text-white placeholder:text-stone-500 focus:outline-none flex-1 min-w-0" placeholder={t('app.search.placeholder')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onFocus={() => setSearchFocused(true)} onKeyDown={e => { if (e.key === 'Escape') { setSearchFocused(false); setMobileSearch(false); } }} />
            <button onClick={startVoice} title={t('voice.title')} className={`shrink-0 p-1.5 rounded-full transition-all ${listening ? 'bg-red-600 text-white animate-pulse' : 'text-stone-400 hover:text-white hover:bg-white/10'}`}><Mic className="w-3.5 h-3.5" /></button>
            {searchingMovies ? <span className="w-3.5 h-3.5 border-2 border-[#f36f21] border-t-transparent rounded-full animate-spin shrink-0"></span> : <kbd className="hidden lg:inline px-1.5 py-0.5 text-[10px] text-stone-500 bg-white/5 rounded border border-white/10 font-mono">⌘K</kbd>}
            {mobileSearch && (
              <button onClick={() => { setMobileSearch(false); setSearchFocused(false); setSearchQuery(''); }} className="md:hidden p-1 rounded-full text-stone-400 hover:text-white" aria-label={t('common.close')}>
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {voiceMsg && <div className="absolute top-full mt-2 left-0 right-0 bg-[#14151a]/95 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-stone-200 shadow-2xl z-50 anim-pop-fast">🎙️ {voiceMsg}</div>}
          {showDropdown && (
            <div className="absolute top-full mt-2 left-0 right-0 md:right-auto md:w-[26rem] bg-[#14151a]/95 glass border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 anim-pop-fast max-h-[70vh] overflow-y-auto">
              {channelMatches.length > 0 && (
                <div className="p-2">
                  <p className="px-2 pt-1 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-stone-500">{t('nav.live')}</p>
                  {channelMatches.map(ch => (
                    <button key={ch.channel_id} onClick={() => pickChannel(ch)} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition text-left">
                      <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">{ch.logo ? <img src={ch.logo} alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display = 'none'} /> : <span className="text-[10px] font-bold text-stone-400">TV</span>}</span>
                      <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white truncate">{ch.name}</span><span className="block text-[10px] text-stone-500">{ch.group_title}</span></span>
                      <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-[#f36f21] text-white shrink-0">{t('player.live')}</span>
                    </button>
                  ))}
                </div>
              )}
              {(movieResults.length > 0 || searchingMovies) && (
                <div className="p-2 border-t border-white/5">
                  <p className="px-2 pt-1 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-stone-500">{t('movies.title')}</p>
                  {searchingMovies && movieResults.length === 0 ? <p className="px-2 py-2 text-[11px] text-stone-500">{t('app.loading')}</p> : movieResults.map(m => (
                    <button key={`${m.media_type}-${m.id}`} onClick={() => pickMovie(m)} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition text-left">
                      <span className="w-8 h-11 rounded-md bg-stone-800 overflow-hidden shrink-0"><img src={imgPath(m.poster_path, 'w92')} alt="" className="w-full h-full object-cover" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white truncate">{m.title || m.name}</span><span className="block text-[10px] text-stone-500">{m.media_type === 'tv' ? 'TV' : 'Phim'}{m.vote_average > 0 ? ` · ★ ${m.vote_average.toFixed(1)}` : ''}{m.release_date ? ` · ${m.release_date.substring(0, 4)}` : ''}</span></span>
                      <span className="text-[10px] text-[#ff9a3d] font-bold shrink-0">{t('app.watch')} →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-2">
        <button
          onClick={() => { setMobileSearch(true); setSearchFocused(true); setTimeout(() => searchInputRef.current?.focus(), 0); }}
          className={`md:hidden p-2 hover:bg-white/10 rounded-xl transition ${mobileSearch ? 'invisible' : ''}`}
          title={t('app.search.placeholder')}
          aria-label={t('app.search.placeholder')}
        >
          <Search className="w-5 h-5" />
        </button>
        <div className="relative" ref={langRef}>
          <button onClick={() => { setLangOpen((o) => !o); setApkOpen(false); setNotifOpen(false); setUserOpen(false); }} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 transition" title={t('settings.choose_lang')} aria-label={t('settings.choose_lang')}><Globe className="w-4 h-4 text-stone-300" /><span className="text-base leading-none">{curLang?.flag || '🌐'}</span><span className="hidden lg:inline text-[11px] font-bold text-stone-300 uppercase">{lang}</span></button>
          {langOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 max-w-[80vw] bg-[#141419] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 anim-pop-fast">
              <div className="px-4 py-2.5 border-b border-white/5 text-xs font-bold">{t('settings.choose_lang')}</div>
              <div className="max-h-80 overflow-y-auto p-1.5">
                {(languages || []).map((l) => (
                  <button key={l.code} onClick={() => { setLang(l.code); setLangOpen(false); }} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition ${l.code === lang ? 'bg-[#f36f21]/15 text-white' : 'hover:bg-white/5 text-stone-300'}`}>
                    <span className="text-lg leading-none">{l.flag}</span>
                    <span className="flex-1 min-w-0"><span className="block text-xs font-bold truncate">{l.label}</span><span className="block text-[10px] text-stone-500 truncate">{l.country}</span></span>
                    {l.code === lang && <Check className="w-4 h-4 text-[#ff9a3d] shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="relative" ref={notifRef}>
          <button onClick={() => { setNotifOpen((o) => !o); setApkOpen(false); setLangOpen(false); setUserOpen(false); if (!notifOpen) setTimeout(markAllRead, 1500); }} className="relative p-2 hover:bg-white/10 rounded-xl transition" title={t('nav.notifications')}>
            {unreadCount > 0 ? <BellRing className="w-5 h-5 text-amber-400" /> : <Bell className="w-5 h-5" />}
            {unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#f36f21] text-white text-[9px] font-bold flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[92vw] bg-[#141419] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 anim-pop-fast">
              <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between"><span className="text-xs font-bold">{t('nav.notifications')}</span><button onClick={markAllRead} className="text-[10px] text-stone-400 hover:text-white flex items-center gap-1"><Check className="w-3 h-3" /> {t('nav.read_all')}</button></div>
              <div className="max-h-80 overflow-y-auto">
                {notifs.length === 0 ? <p className="px-4 py-6 text-center text-[11px] text-stone-500">{t('nav.no_notifs')}</p> : notifs.map((n) => {
                  const isExp = expandedNotifs.has(n.id);
                  const isLong = (n.body || '').length > 100;
                  return (
                    <div key={n.id} className="px-4 py-2.5 border-b border-white/5 hover:bg-white/5">
                      <div className="flex items-start gap-2">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.type === 'warning' ? 'bg-amber-400' : n.type === 'error' ? 'bg-[#f36f21]' : 'bg-sky-400'}`}></span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold truncate">{n.title}</p>
                          <p className={`text-[10px] text-stone-400 whitespace-pre-wrap break-words ${isExp ? '' : 'line-clamp-2'}`}>{n.body}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-[9px] text-stone-600">{n.created_at}</p>
                            {isLong && <button onClick={() => setExpandedNotifs(prev => { const ns = new Set(prev); if (ns.has(n.id)) ns.delete(n.id); else ns.add(n.id); return ns; })} className="text-[9px] font-bold text-[#ff9a3d] hover:text-white transition px-1.5 py-0.5 rounded bg-white/5 border border-white/10">{isExp ? 'Thu gọn' : 'Mở rộng'}</button>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={togglePush} className="w-full px-4 py-2.5 text-[11px] font-bold text-left border-t border-white/5 hover:bg-white/5 flex items-center gap-2">{pushOn ? <BellRing className="w-3.5 h-3.5 text-emerald-400" /> : <Bell className="w-3.5 h-3.5" />}{pushOn ? t('nav.push_on') : t('nav.push_off')}</button>
            </div>
          )}
        </div>
        <div className="relative" ref={apkRef}>
          <button
            type="button"
            onClick={() => { setApkOpen((o) => !o); setNotifOpen(false); setLangOpen(false); setUserOpen(false); }}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[11px] font-bold text-stone-200 transition"
            title={t('nav.download_app')}
          >
            <Smartphone className="w-4 h-4 text-[#ff9a3d]" />
            <span className="hidden lg:inline">{t('nav.download_app')}</span>
          </button>
          {apkOpen && <DownloadAppModal />}
        </div>
        <button
          onClick={() => setActiveTab && setActiveTab('plans')}
          className={`hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black transition ${hasPaidPlan ? 'bg-white/5 hover:bg-white/10 text-amber-200 border border-amber-400/30' : 'grad-brand text-white shadow-lg shadow-[#f36f21]/25'}`}
        >
          {hasPaidPlan ? <Crown className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
          {hasPaidPlan ? (planMeta?.name || String(effectivePlan).toUpperCase()) : t('nav.subscribe')}
        </button>
        {isAuthenticated && currentProfile ? (
          <div className="relative" ref={userRef}>
            <button onClick={() => { setUserOpen((o) => !o); setApkOpen(false); setNotifOpen(false); setLangOpen(false); }} className="flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-xl hover:bg-white/10 transition" title={currentProfile.name}>
              <div className={`relative w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-[#f36f21] flex items-center justify-center font-bold text-white text-sm ${effectivePlan === 'signature' ? 'ring-2 ring-amber-300' : 'ring-1 ring-white/20'}`}>
                {currentProfile.name[0].toUpperCase()}
              </div>
              <span className="text-xs text-stone-300 hidden md:inline max-w-[90px] truncate">{currentProfile.name}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-stone-500 hidden md:block transition ${userOpen ? 'rotate-180' : ''}`} />
            </button>
            {userOpen && (
              <div className="absolute right-0 top-full mt-2 w-[280px] max-w-[92vw] bg-[#141419] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50 anim-pop-fast">
                <div className="px-4 py-3 border-b border-white/8 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-500 to-[#f36f21] flex items-center justify-center font-black text-white">{currentProfile.name[0].toUpperCase()}</div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-black text-white truncate">{currentProfile.name}</p>
                    <p className="text-[10px] text-stone-500">{currentProfile.is_child ? t('nav.kids') : t('nav.adult')} · {(planMeta?.name || effectivePlan || 'STANDARD').toString().toUpperCase()}</p>
                  </div>
                </div>
                {(profiles || []).length > 0 && (
                  <div className="p-2 border-b border-white/8">
                    <p className="px-2 pb-1.5 text-[9px] font-black uppercase tracking-widest text-stone-500">{t('nav.switch_account')}</p>
                    {(profiles || []).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setUserOpen(false); onSelectProfile && onSelectProfile(p); }}
                        className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-xl text-left ${p.id === currentProfile.id ? 'bg-[#f36f21]/15' : 'hover:bg-white/5'}`}
                      >
                        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-stone-600 to-stone-800 flex items-center justify-center text-[11px] font-black text-white">{(p.name || '?')[0].toUpperCase()}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[12px] font-bold text-white truncate">{p.name}</span>
                          <span className="block text-[10px] text-stone-500">{p.is_child ? t('nav.kids') : t('nav.adult')}</span>
                        </span>
                        {p.id === currentProfile.id && <Check className="w-4 h-4 text-[#ff9a3d]" />}
                      </button>
                    ))}
                  </div>
                )}
                <div className="p-1.5">
                  <button onClick={() => { setUserOpen(false); onManageProfiles && onManageProfiles(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-[12px] font-bold text-stone-200">
                    <Users className="w-4 h-4 text-stone-400" /> {t('nav.manage_profiles')}
                  </button>
                  <button onClick={() => { setUserOpen(false); onShowSettings && onShowSettings(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-[12px] font-bold text-stone-200">
                    <Settings className="w-4 h-4 text-stone-400" /> {t('nav.account_settings')}
                  </button>
                  <button onClick={() => { setUserOpen(false); onShowAuth && onShowAuth(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-[12px] font-bold text-stone-200">
                    <UserPlus className="w-4 h-4 text-stone-400" /> {t('nav.add_account')}
                  </button>
                  <button onClick={() => { setUserOpen(false); logout(); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/5 text-[12px] font-bold text-[#ff9a3d]">
                    <LogOut className="w-4 h-4" /> {t('nav.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => { if (onShowAuth) onShowAuth(); else if (setActiveTab) setActiveTab('movies'); }} className="px-4 py-2 bg-white text-black text-sm font-bold rounded-xl hover:bg-stone-200 transition">{t('nav.login')}</button>
        )}
      </div>
      {apkOpen && <DownloadAppModal onClose={() => setApkOpen(false)} />}
    </nav>
  );
}

export default React.memo(TopNav);
