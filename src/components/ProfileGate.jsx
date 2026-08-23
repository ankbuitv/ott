import React from 'react';
import { User } from 'lucide-react';
import { useProfile } from '../contexts/ProfileContext';

export default function ProfileGate() {
  const { setCurrentProfile } = useProfile();
  const profiles = [
    { id: 1, name: 'Default', avatar: '🎬' },
    { id: 2, name: 'Gia Đình', avatar: '👨‍👩‍👧‍👦' },
    { id: 3, name: 'Thiếu Nhi', avatar: '🧒' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b0f] via-[#0d0e12] to-[#111318] flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-red-600/30">
          <User className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-black text-white mb-1">Chọn hồ sơ</h1>
        <p className="text-slate-400 text-sm mb-8">Ai đang xem?</p>

        <div className="flex gap-4 justify-center flex-wrap">
          {profiles.map(p => (
            <button key={p.id} onClick={() => setCurrentProfile(p)}
              className="group flex flex-col items-center gap-2 p-6 rounded-2xl border-2 border-slate-700/50 bg-slate-800/30 hover:border-red-500/50 hover:bg-slate-800/50 transition-all">
              <span className="text-4xl group-hover:scale-110 transition-transform">{p.avatar}</span>
              <span className="text-sm font-bold text-white">{p.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}