import React, { useState } from 'react';
import { Search, Tv, Film, Calendar, Heart, History, User, Menu, X } from 'lucide-react';

export default function TopNav({ channels, searchQuery, setSearchQuery, user, currentProfile, setActiveTab, activeTab, onShowAuth, onSelectChannel, onSelectMovie }) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const tabs = [
    { id: 'channels', label: 'Kênh', icon: Tv },
    { id: 'epg', label: 'EPG', icon: Calendar },
    { id: 'movies', label: 'Phim', icon: Film },
    { id: 'favorites', label: 'Yêu Thích', icon: Heart },
    { id: 'history', label: 'Đã Xem', icon: History },
  ];

  return (
    <header className="h-16 bg-[#0a0b0f]/95 backdrop-blur-xl border-b border-slate-800/60 flex items-center px-4 md:px-6 gap-4 z-40 sticky top-0 shadow-lg shadow-black/20">
      <div className="flex items-center gap-2.5 mr-2 md:mr-6">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-lg shadow-red-600/20">
          <Tv className="w-4 h-4 text-white" />
        </div>
        <span className="font-extrabold text-white text-lg tracking-tight hidden sm:block">CHRTV</span>
      </div>

      <nav className="hidden md:flex items-center gap-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { setActiveTab(id); if (id === 'movies' && onSelectMovie) onSelectMovie(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === id ? 'bg-red-600/20 text-red-500 shadow-sm shadow-red-600/10' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
            <Icon className="w-4 h-4" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="relative w-48 md:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Tìm kênh, phim..."
          className="w-full pl-10 pr-3 py-2 bg-slate-900/80 border border-slate-700/60 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20 transition-all" />
      </div>

      {user && (
        <div className="hidden md:flex items-center gap-2.5 pl-3 border-l border-slate-700/50 ml-3">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-semibold text-slate-300">{user.username}</span>
        </div>
      )}

      <button onClick={() => setMobileMenu(!mobileMenu)} className="md:hidden p-2 text-slate-400 hover:text-white">
        {mobileMenu ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileMenu && (
        <div className="absolute top-full left-0 right-0 bg-[#0a0b0f]/98 backdrop-blur-xl border-b border-slate-800/60 p-4 md:hidden z-50">
          <div className="grid grid-cols-2 gap-2">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => { setActiveTab(id); setMobileMenu(false); }}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all ${activeTab === id ? 'bg-red-600/20 text-red-500' : 'text-slate-400 hover:bg-slate-800/50'}`}>
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}