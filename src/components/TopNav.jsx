import React, { useState, useEffect, useRef } from 'react';
import Logo from './Logo';
import { Bell, Check, BellRing } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { MovieAPI, imgPath } from '../services/tmdb';
import { API_BASE } from '../services/config';
import { enablePush, disablePush, isPushEnabled } from '../services/push';

export default function TopNav({ channels, searchQuery, setSearchQuery, user, currentProfile, setActiveTab, activeTab, onSelectChannel, onSelectMovie, onShowAuth }) {
  const { isAuthenticated, logout } = useAuth();
  const { t } = useI18n();
  const [searchFocused, setSearchFocused] = useState(false);
  const [movieResults, setMovieResults] = useState([]);
  const [searchingMovies, setSearchingMovies] = useState(false);
  const boxRef = useRef(null);

  // ============ NOTIFICATION CENTER + WEB PUSH ============
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [lastRead, setLastRead] = useState(() => {
    try { return parseInt(localStorage.getItem('chrtv_notif_read') || '0', 10); } catch { return 0; }
  });
  const [pushOn, setPushOn] = useState(false);
  const notifRef = useRef(null);

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
    const h = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
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
      if (r.ok) { setPushOn(false); alert('Đã tắt thông báo đẩy.'); }
    } else {
      const r = await enablePush();
      if (r.ok) setPushOn(true);
      else alert(r.reason || 'Không bật được push.');
    }
  };

  const q = searchQuery.trim();

  // Tìm phim trên TMDB khi gõ (debounce)
  useEffect(() => {
    if (q.length < 2) { setMovieResults([]); setSearchingMovies(false); return; }
    setSearchingMovies(true);
    const t = setTimeout(async () => {
      let r = await MovieAPI.search(q).catch(() => ({ results: [] }));
      let res = (r.results || []).filter(m => (m.media_type === 'movie' || m.media_type === 'tv') && m.poster_path).slice(0, 6);
      // Fallback local nếu TMDB search không ra (key lỗi/hết quota)
      if (res.length === 0) {
        res = (await MovieAPI.searchFallback(q).catch(() => []))
          .filter(m => m.poster_path)
          .slice(0, 6);
      }
      setMovieResults(res);
      setSearchingMovies(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  // Click ngoài để đóng dropdown
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setSearchFocused(false); };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, []);

  const channelMatches = q
    ? (channels || []).filter(ch => (ch.name || '').toLowerCase().includes(q.toLowerCase())).slice(0, 5)
    : [];

  const showDropdown = searchFocused && q.length > 0 && (channelMatches.length > 0 || movieResults.length > 0 || searchingMovies);

  const pickMovie = (m) => {
    setSearchQuery('');
    setSearchFocused(false);
    if (onSelectMovie) onSelectMovie(m);
    else if (setActiveTab) setActiveTab('movies');
  };

  return (
    <nav className="glass bg-black/70 border-b border-white/5 px-6 py-3 flex items-center justify-between sticky top-0 z-40 shrink-0">
      <div className="flex items-center gap-6">
        {/* Logo */}
        <Logo size="sm" />

        {/* Search */}
        <div className="relative hidden md:block" ref={boxRef}>
          <div className={`flex items-center gap-2 bg-white/5 hover:bg-white/10 border ${searchFocused ? 'border-red-500' : 'border-white/10 hover:border-white/20'} px-3.5 py-2 rounded-xl w-80 transition-all`}>
            <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              className="bg-transparent text-sm text-white placeholder:text-stone-500 focus:outline-none flex-1"
              placeholder={t('app.search.placeholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onKeyDown={e => { if (e.key === 'Escape') setSearchFocused(false); }}
            />
            {searchingMovies ? (
              <span className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin shrink-0"></span>
            ) : (
              <kbd className="hidden lg:inline px-1.5 py-0.5 text-[10px] text-stone-500 bg-white/5 rounded border border-white/10 font-mono">⌘K</kbd>
            )}
          </div>

          {/* Dropdown results */}
          {showDropdown && (
            <div className="absolute top-full mt-2 left-0 w-[26rem] bg-[#14151a]/95 glass border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
              {/* Kênh */}
              {channelMatches.length > 0 && (
                <div className="p-2">
                  <p className="px-2 pt-1 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-stone-500">{t('nav.live')}</p>
                  {channelMatches.map(ch => (
                    <button
                      key={ch.channel_id}
                      onClick={() => { setSearchQuery(''); setSearchFocused(false); onSelectChannel && onSelectChannel(ch); }}
                      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition text-left"
                    >
                      <span className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        {ch.logo ? <img src={ch.logo} alt="" className="w-5 h-5 object-contain" onError={e => e.target.style.display = 'none'} /> : <span className="text-[10px] font-bold text-stone-400">TV</span>}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-white truncate">{ch.name}</span>
                        <span className="block text-[10px] text-stone-500">{ch.group_title}</span>
                      </span>
                        <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-red-600 text-white shrink-0">{t('player.live')}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Phim */}
              {(movieResults.length > 0 || searchingMovies) && (
                <div className="p-2 border-t border-white/5">
                  <p className="px-2 pt-1 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-stone-500">{t('movies.title')}</p>
                  {searchingMovies && movieResults.length === 0 ? (
                    <p className="px-2 py-2 text-[11px] text-stone-500">{t('app.loading')}</p>
                  ) : (
                    movieResults.map(m => (
                      <button
                        key={`${m.media_type}-${m.id}`}
                        onClick={() => pickMovie(m)}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition text-left"
                      >
                        <span className="w-8 h-11 rounded-md bg-stone-800 overflow-hidden shrink-0">
                          <img src={imgPath(m.poster_path, 'w92')} alt="" className="w-full h-full object-cover" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-white truncate">{m.title || m.name}</span>
                          <span className="block text-[10px] text-stone-500">
                            {m.media_type === 'tv' ? (t('movies.row.popular_tv').includes('TV') ? 'TV' : 'TV') : (t('movies.title').split(' ')[0] || 'Phim')}
                            {m.vote_average > 0 ? ` · ★ ${m.vote_average.toFixed(1)}` : ''}
                            {m.release_date ? ` · ${m.release_date.substring(0, 4)}` : ''}
                          </span>
                        </span>
                        <span className="text-[10px] text-red-400 font-bold shrink-0">Xem →</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen((o) => !o); if (!notifOpen) setTimeout(markAllRead, 1500); }}
            className="relative p-2 hover:bg-white/10 rounded-xl transition"
            title="Thông báo"
          >
            {unreadCount > 0 ? <BellRing className="w-5 h-5 text-amber-400" /> : <Bell className="w-5 h-5" />}
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 max-w-[92vw] bg-[#141419] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
              <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-bold">Thông báo</span>
                <button onClick={markAllRead} className="text-[10px] text-stone-400 hover:text-white flex items-center gap-1"><Check className="w-3 h-3" /> Đọc hết</button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifs.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[11px] text-stone-500">Chưa có thông báo nào</p>
                ) : notifs.map((n) => (
                  <div key={n.id} className="px-4 py-2.5 border-b border-white/5 hover:bg-white/5">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${n.type === 'warning' ? 'bg-amber-400' : n.type === 'error' ? 'bg-red-500' : 'bg-sky-400'}`}></span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold truncate">{n.title}</p>
                        <p className="text-[10px] text-stone-400 line-clamp-2">{n.body}</p>
                        <p className="text-[9px] text-stone-600 mt-0.5">{n.created_at}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={togglePush} className="w-full px-4 py-2.5 text-[11px] font-bold text-left border-t border-white/5 hover:bg-white/5 flex items-center gap-2">
                {pushOn ? <BellRing className="w-3.5 h-3.5 text-emerald-400" /> : <Bell className="w-3.5 h-3.5" />}
                {pushOn ? 'Thông báo đẩy: ĐANG BẬT — bấm để tắt' : 'Bật thông báo đẩy (nhận tin cả khi đóng tab)'}
              </button>
            </div>
          )}
        </div>

        {isAuthenticated && currentProfile ? (
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center font-bold text-white text-sm cursor-pointer">
              {currentProfile.name[0].toUpperCase()}
            </div>
            <span className="text-xs text-stone-300 hidden md:inline">{currentProfile.name}</span>
            <button onClick={logout} className="text-[10px] text-stone-500 hover:text-red-400 ml-1">{t('nav.logout')}</button>
          </div>
        ) : (
          <button onClick={() => onShowAuth?.() || (setActiveTab && setActiveTab('movies'))} className="px-4 py-2 bg-white text-black text-sm font-bold rounded-xl hover:bg-stone-200 transition">{t('nav.login')}</button>
        )}
      </div>
    </nav>
  );
}
