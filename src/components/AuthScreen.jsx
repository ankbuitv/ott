import React from 'react';
import { Tv, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
export default function AuthScreen() {
  const { setUser } = useAuth();
  const handleDemoLogin = () => {
    const du = { id:1, username:'demo', email:'demo@chrtv.app' };
    localStorage.setItem('chrtv_user',JSON.stringify(du));
    localStorage.setItem('chrtv_token','demo-token-abc');
    setUser(du);
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0b0f] via-[#0d0e12] to-[#111318] flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center mx-auto mb-5 shadow-2xl"><Tv className="w-8 h-8 text-white" /></div>
        <h1 className="text-3xl font-black text-white mb-1">CHRTV</h1>
        <p className="text-slate-400 text-sm mb-8">Đăng nhập để xem truyền hình IPTV</p>
        <div className="space-y-3">
          <input placeholder="Email" disabled className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-slate-300" />
          <input type="password" placeholder="Mật khẩu" disabled className="w-full px-4 py-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-sm text-slate-300" />
          <button onClick={handleDemoLogin} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"><User className="w-4 h-4" />Đăng nhập Demo</button>
        </div>
      </div>
    </div>
  );
}