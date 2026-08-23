import React from 'react';
import { Tv, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function AuthScreen() {
  const { setUser } = useAuth();

  const handleDemoLogin = () => {
    const du = { id: 1, username: 'demo', email: 'demo@chrtv.app' };
    localStorage.setItem('chrtv_user', JSON.stringify(du));
    localStorage.setItem('chrtv_token', JSON.stringify('demo-token-abc'));
    setUser(du);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b0f] via-[#0d0e12] to-[#111318] flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-red-600/30">
            <Tv className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-1">CHRTV</h1>
          <p className="text-slate-400 text-sm">Đăng nhập để xem truyền hình IPTV</p>
        </div>

        <div className="space-y-3">
          <input placeholder="Email hoặc tên đăng nhập" disabled
            className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-slate-300 placeholder-slate-500" />
          <input type="password" placeholder="Mật khẩu" disabled
            className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-slate-300 placeholder-slate-500" />

          <button onClick={handleDemoLogin}
            className="w-full py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl transition-all shadow-xl shadow-red-600/20 hover:shadow-red-600/30 flex items-center justify-center gap-2">
            <User className="w-4 h-4" />
            Đăng nhập Demo
          </button>

          <p className="text-center text-[11px] text-slate-600 mt-6">
            CHRTV - Truyền hình IPTV đa nền tảng
          </p>
        </div>
      </div>
    </div>
  );
}