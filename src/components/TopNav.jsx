import React, { useState, useEffect, useRef } from 'react';
import Logo from './Logo';
import { useAuth } from '../contexts/AuthContext';
import { MovieAPI, imgPath } from '../services/tmdb';

export default function TopNav({ channels, searchQuery, setSearchQuery, user, currentProfile, setActiveTab, activeTab, onSelectChannel, onSelectMovie }) {
  const { isAuthenticated, logout } = useAuth();
  const [searchFocused, setSearchFocused] = useState(false);
  const [movieResults, setMovieResults] = useState([]);
  const [searchingMovies, setSearchingMovies] = useState(false);
  const boxRef = useRef(null);

  const q = searchQuery.trim();

  // Tìm phim trên TMDB khi gõ (debounce)
  useEffect(() => {
    if (q.length < 2) { setMovieResults([]); setSearchingMovies(false); return; }
    setSearchingMovies(true);
    const t = setTimeout(async () => {
      const r = await MovieAPI.search(q).catch(() => ({ results: [] }));
      setMovieResults((r.results || []).filter(m => (m.media_type === 'movie' || m.media_type === 'tv') && m.poster_path).slice(0, 6));
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
              placeholder="Tìm kênh, phim, chương trình..."
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
                  <p className="px-2 pt-1 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-stone-500">Kênh truyền hình</p>
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
                      <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-red-600 text-white shrink-0">LIVE</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Phim */}
              {(movieResults.length > 0 || searchingMovies) && (
                <div className="p-2 border-t border-white/5">
                  <p className="px-2 pt-1 pb-1.5 text-[9px] font-bold uppercase tracking-widest text-stone-500">Phim & TV Shows</p>
                  {searchingMovies && movieResults.length === 0 ? (
                    <p className="px-2 py-2 text-[11px] text-stone-500">Đang tìm trên TMDB…</p>
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
                            {m.media_type === 'tv' ? 'TV Show' : 'Phim'}
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
        <button className="p-2 hover:bg-white/10 rounded-xl transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
        </button>

        {isAuthenticated && currentProfile ? (
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center font-bold text-white text-sm cursor-pointer">
              {currentProfile.name[0].toUpperCase()}
            </div>
            <span className="text-xs text-stone-300 hidden md:inline">{currentProfile.name}</span>
            <button onClick={logout} className="text-[10px] text-stone-500 hover:text-red-400 ml-1">Đăng xuất</button>
          </div>
        ) : (
          <button className="px-4 py-2 bg-white text-black text-sm font-bold rounded-xl hover:bg-stone-200 transition">Đăng nhập</button>
        )}
      </div>
    </nav>
  );
}
