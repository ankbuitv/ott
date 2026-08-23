import React from 'react';
export default function ProfileGate() {
  return <div className="h-screen w-screen bg-black flex items-center justify-center">
    <div className="text-center"><h1 className="text-2xl font-bold text-white mb-4">Chọn hồ sơ</h1>
    <button className="w-24 h-24 rounded-full bg-slate-800 flex items-center justify-center text-3xl mx-auto">👤</button></div>
  </div>;
}