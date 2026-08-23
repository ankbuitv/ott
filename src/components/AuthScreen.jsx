import React from 'react';
export default function AuthScreen() {
  return <div className="h-screen w-screen bg-black flex items-center justify-center">
    <div className="text-center"><h1 className="text-3xl font-black text-white mb-2">CHRTV</h1><p className="text-slate-500 text-sm mb-8">Đăng nhập để xem truyền hình</p>
    <input placeholder="Email" className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white mb-3"/>
    <input type="password" placeholder="Mật khẩu" className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white mb-3"/>
    <button className="w-full py-3 bg-red-600 text-white rounded-xl font-bold">Đăng nhập</button></div>
  </div>;
}