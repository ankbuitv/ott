import React from 'react';
import { Tv, Calendar, Heart, History, Settings, Radio, Film, LogOut, ChevronLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../contexts/ProfileContext';
import Logo, { AvatarBubble } from './Logo';

export default function Sidebar({ activeTab, setActiveTab, onShowSettings, onShowAdmin }) {
  const { user, logout } = useAuth();
  const { currentProfile, logoutProfile } = useProfile();

  const mainItems = [
    { id: 'channels', label: 'Trang Chủ', icon: Tv },
    { id: 'movies', label: 'Phim Ảnh', icon: Film },
    { id: 'epg', label: 'Lịch EPG', icon: Calendar },
    { id: 'favorites', label: 'Yêu Thích', icon: Heart },
    { id: 'history', label: 'Lịch Sử', icon: History },
  ];

  return (
    <>
      {/* Desktop Sidebar (Template E: Apple glass) */}
      <aside className="hidden md:flex flex-col w-60 bg-[#060608] border-r border-white/5 select-none shrink-0 z-20">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/5">
          <Logo size="md" />
        </div>

        {/* Current profile banner */}
        {currentProfile && (
          <button
            onClick={logoutProfile}
            className="px-5 py-3 border-b border-white/5 flex items-center gap-3 hover:bg-white/[0.03] transition-colors group"
            title="Đổi hồ sơ"
          >
            <AvatarBubble avatarId={currentProfile.avatar_url} size="sm" name={currentProfile.name} />
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-bold truncate">{currentProfile.name}</p>
              <p className="text-[10px] text-stone-500 truncate">{currentProfile.is_child ? 'Hồ sơ trẻ em' : 'Hồ sơ thường'}</p>
            </div>
            <ChevronLeft className="w-4 h-4 text-stone-600 group-hover:text-white" />
          </button>
        )}

        {/* Menu Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {mainItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-white/[0.08] text-white'
                    : 'text-stone-500 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-red-500' : ''}`} />
                <span>{item.label}</span>
                {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-red-500" />}
              </button>
            );
          })}
        </nav>

        {/* Bottom: User + Settings */}
        <div className="px-3 pb-4 space-y-1 border-t border-white/5 pt-3">
          {onShowSettings && (
            <button onClick={onShowSettings} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-stone-500 hover:text-white hover:bg-white/[0.03] transition-all">
              <Settings className="w-[18px] h-[18px]" />
              <span>Cài đặt</span>
            </button>
          )}
          {onShowAdmin && user?.role === 'admin' && (
            <button onClick={onShowAdmin} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-stone-500 hover:text-white hover:bg-white/[0.03] transition-all">
              ⚙️ <span>Admin</span>
            </button>
          )}
          <div className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-[9px] font-bold">
                {(user?.display_name || user?.username || 'U')[0].toUpperCase()}
              </div>
              <p className="text-[11px] font-semibold text-white truncate">{user?.display_name || user?.username}</p>
            </div>
            <p className="text-[9px] text-stone-500 truncate">{user?.email}</p>
            <button onClick={logout} className="mt-2 w-full text-[10px] text-stone-500 hover:text-red-400 flex items-center justify-center gap-1">
              <LogOut className="w-3 h-3" /> Đăng xuất
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-[#060608]/95 backdrop-blur-xl border-t border-white/10 px-2 py-1.5 flex items-center justify-around z-50">
        {mainItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-all ${
                isActive ? 'text-red-500' : 'text-stone-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
