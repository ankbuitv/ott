import React from 'react';
import { Tv, Calendar, Heart, History, Settings, Radio } from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';
import { useAuth } from '../contexts/AuthContext';

const LOGO_URL = "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png";

export default function Sidebar({ activeTab, setActiveTab, onShowSettings, onShowAdmin }) {
  const { user, isAuthenticated } = useAuth();

  const menuItems = [
    { id: 'channels', label: 'Trang chủ', icon: Tv },
    { id: 'epg', label: 'Lịch phát sóng', icon: Calendar },
    { id: 'favorites', label: 'Yêu thích', icon: Heart },
    { id: 'history', label: 'Lịch sử', icon: History },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-52 bg-[#0a0b0f] border-r border-white/5 select-none shrink-0 z-20">
        {/* Logo */}
        <div className="px-4 py-4 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center shadow-lg shadow-red-600/20">
              <Radio className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-base text-white tracking-tight leading-tight">CHRTV</h1>
              <span className="text-[8px] text-red-400/80 font-bold uppercase tracking-[0.15em]">IPTV PLAYER</span>
            </div>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 px-2.5 space-y-0.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <FocusableWrapper
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isActive
                    ? 'bg-white/[0.08] text-white font-semibold'
                    : 'text-slate-500 hover:text-white hover:bg-white/[0.03]'
                }`}
              >
                <Icon className={`w-[18px] h-[18px] ${isActive ? 'text-red-400' : ''}`} />
                <span>{item.label}</span>
                {isActive && <div className="ml-auto w-1 h-1 rounded-full bg-red-500" />}
              </FocusableWrapper>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-2.5 pb-3 space-y-1">
          {onShowSettings && (
            <button onClick={onShowSettings} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:text-white hover:bg-white/[0.03] w-full transition-all">
              <Settings className="w-[18px] h-[18px]" />
              <span>Cài đặt</span>
            </button>
          )}
          {onShowAdmin && (
            <button onClick={onShowAdmin} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:text-white hover:bg-white/[0.03] w-full transition-all">
              <span className="text-[14px]">⚙️</span>
              <span>Admin</span>
            </button>
          )}
          {/* User info */}
          <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/5">
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
                  {(user?.display_name || user?.username || 'U')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate">{user?.display_name || user?.username}</p>
                  <p className="text-[9px] text-slate-500 truncate">{user?.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-600">Đăng nhập để đồng bộ</p>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0a0b0f]/95 backdrop-blur-xl border-t border-white/5 px-3 py-1.5 flex items-center justify-around z-50 safe-area-bottom">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-all ${
                isActive ? 'text-red-400' : 'text-slate-600'
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
