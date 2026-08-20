import React from 'react';
import { Tv, Calendar, Heart, History, Settings, Sparkles, Layers } from 'lucide-react';
import FocusableWrapper from './FocusableWrapper';

const CHRTV_LOGO_URL = "https://i.ibb.co/HDmcxzMK/Gemini-Generated-Image-v7i9yav7i9yav7i9-removebg-preview.png";

/**
 * Sidebar - Thanh điều hướng Sidebar Dark Mode (Phong cách FPT Play / Netflix)
 * Tác giả: CHRTV OTT Full-stack Architect
 */
export default function Sidebar({ activeTab, setActiveTab }) {
  const menuItems = [
    { id: 'channels', label: 'Xem Tivi', icon: Tv },
    { id: 'epg', label: 'Lịch EPG', icon: Calendar },
    { id: 'favorites', label: 'Yêu Thích', icon: Heart },
    { id: 'history', label: 'Lịch Sử Xem', icon: History },
  ];

  return (
    <>
      {/* Sidebar cho Desktop & Android TV */}
      <aside className="hidden md:flex flex-col w-64 bg-[#090a0e] border-r border-slate-800/80 p-5 select-none shrink-0 z-20">
        {/* CHRTV Logo Header */}
        <div className="flex items-center gap-3 px-2 py-3 mb-8 border-b border-slate-800/80">
          <img
            src={CHRTV_LOGO_URL}
            alt="CHRTV Logo"
            className="h-10 object-contain drop-shadow-lg"
          />
          <div>
            <h1 className="font-extrabold text-lg text-white tracking-wider">CHRTV</h1>
            <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest">
              OTT IPTV PRO
            </span>
          </div>
        </div>

        {/* Danh Sách Menu Điều Hướng */}
        <nav className="flex-1 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <FocusableWrapper
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl font-bold text-sm transition-all ${
                  isActive
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </FocusableWrapper>
            );
          })}
        </nav>

        {/* Chân Trang Sidebar */}
        <div className="pt-4 border-t border-slate-800/80">
          <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800/60 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200 mb-1">
              <Sparkles className="w-4 h-4 text-amber-400" /> CHRTV Full-stack
            </div>
            <p className="text-[11px] text-slate-400">Hệ sinh thái IPTV siêu mượt cho Web, Mobile & Android TV D-pad.</p>
          </div>
        </div>
      </aside>

      {/* Bottom Bar cho Mobile Responsive */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#090a0e]/95 backdrop-blur-lg border-t border-slate-800/80 px-4 py-2 flex items-center justify-around z-50">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                isActive ? 'text-red-500 font-bold' : 'text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
