import React from 'react';
import { useProfile } from '../contexts/ProfileContext';

const navItems = [
  { id: 'channels', label: 'TRANG CHỦ', icon: HomeIcon },
  { id: 'epg', label: 'LỊCH EPG', icon: CalendarIcon },
  { id: 'movies', label: 'PHIM ẢNH', icon: FilmIcon },
  { id: 'favorites', label: 'YÊU THÍCH', icon: HeartIcon },
  { id: 'history', label: 'LỊCH SỬ', icon: ClockIcon },
];

function HomeIcon() { return <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="m9 9 5 12 1.774-5.226L21 14 9 3l-2 5.226z"/></svg>; }
function CalendarIcon() { return <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>; }
function FilmIcon() { return <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/></svg>; }
function HeartIcon() { return <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>; }
function ClockIcon() { return <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>; }
function SettingsIcon() { return <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>; }

export default function Sidebar({ activeTab, setActiveTab, onShowSettings, onShowAdmin }) {
  const { currentProfile } = useProfile();

  return (
    <>
      {/* Desktop Sidebar — narrow icon dock */}
      <aside className="hidden md:flex flex-col w-20 bg-[#060608] border-r border-white/5 h-full shrink-0 z-10 items-center py-6 gap-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`nav-btn w-14 h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 transition-all ${
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-stone-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon />
              <span className="text-[8px] font-bold tracking-tight">{item.label}</span>
            </button>
          );
        })}

        {onShowSettings && (
          <button
            onClick={onShowSettings}
            className="nav-btn w-10 h-10 mt-auto hover:bg-white/5 rounded-full flex items-center justify-center text-stone-500 hover:text-white transition-all"
          >
            <SettingsIcon />
          </button>
        )}
        {onShowAdmin && (
          <button
            onClick={onShowAdmin}
            className="nav-btn w-10 h-10 hover:bg-white/5 rounded-full flex items-center justify-center text-stone-500 hover:text-white transition-all"
          >
            <span className="text-[10px]">⚙️</span>
          </button>
        )}
        {currentProfile && (
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center font-bold text-white text-xs mt-1 cursor-pointer">
            {currentProfile.name[0].toUpperCase()}
          </div>
        )}
      </aside>

      {/* Mobile Bottom Bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-black/95 backdrop-blur-xl border-t border-white/10 px-6 py-3">
        <div className="flex items-center justify-around">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center ${
                  isActive ? 'text-white' : 'text-stone-500'
                }`}
              >
                <Icon />
                <span className="text-[9px] mt-0.5">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}