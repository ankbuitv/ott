import React from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { X, Moon, Sun, Shield } from 'lucide-react';

export default function SettingsPage({ onClose }) {
  const { settings, setSettings } = useSettings();

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-black text-white">Cài Đặt</h1>
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-all">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {settings.theme === 'dark' ? <Moon className="w-5 h-5 text-slate-300" /> : <Sun className="w-5 h-5 text-amber-400" />}
              <div>
                <p className="text-sm font-bold text-white">Giao Diện</p>
                <p className="text-xs text-slate-500">{settings.theme === 'dark' ? 'Tối' : 'Sáng'}</p>
              </div>
            </div>
            <button onClick={() => setSettings(prev => ({ ...prev, theme: prev.theme === 'dark' ? 'light' : 'dark' }))}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${settings.theme === 'dark' ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {settings.theme === 'dark' ? 'Tối' : 'Sáng'}
            </button>
          </div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-slate-300" />
              <div>
                <p className="text-sm font-bold text-white">Kiểm Soát Phụ Huynh</p>
                <p className="text-xs text-slate-500">Hạn chế kênh theo độ tuổi</p>
              </div>
            </div>
            <button onClick={() => setSettings(prev => ({ ...prev, parentalEnabled: !prev.parentalEnabled }))}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${settings.parentalEnabled ? 'bg-red-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
              {settings.parentalEnabled ? 'Bật' : 'Tắt'}
            </button>
          </div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700/40 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-slate-300" />
              <div>
                <p className="text-sm font-bold text-white">Phiên bản</p>
                <p className="text-xs text-slate-500">CHRTV v1.0.0</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}