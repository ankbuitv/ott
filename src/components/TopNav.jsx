import React, { useState } from 'react';
import Logo from './Logo';
import { useAuth } from '../contexts/AuthContext';

export default function TopNav({ channels, searchQuery, setSearchQuery, user, currentProfile, setActiveTab, activeTab }) {
  const { isAuthenticated, logout } = useAuth();
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <nav className="glass bg-black/70 border-b border-white/5 px-6 py-3 flex items-center justify-between sticky top-0 z-40 shrink-0">
      <div className="flex items-center gap-6">
        {/* Logo */}
        <Logo size="sm" />

        {/* Search */}
        <div className={`hidden md:flex items-center gap-2 bg-white/5 hover:bg-white/10 border ${searchFocused ? 'border-red-500' : 'border-white/10 hover:border-white/20'} px-3.5 py-2 rounded-xl w-80 transition-all`}>
          <svg className="w-4 h-4 text-stone-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            className="bg-transparent text-sm text-white placeholder:text-stone-500 focus:outline-none flex-1"
            placeholder="Tìm kênh, chương trình, thể loại..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <kbd className="hidden lg:inline px-1.5 py-0.5 text-[10px] text-stone-500 bg-white/5 rounded border border-white/10 font-mono">⌘K</kbd>
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