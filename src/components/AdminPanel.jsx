import React from 'react';
export default function AdminPanel({onClose}) {
  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
    <div className="bg-slate-900 rounded-2xl p-6 max-w-md w-full" onClick={e=>e.stopPropagation()}>
      <h2 className="text-white font-bold text-lg mb-4">Admin Panel</h2>
      <p className="text-slate-400 text-sm">Tính năng đang phát triển</p>
      <button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm">Đóng</button>
    </div>
  </div>;
}