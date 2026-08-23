import React from 'react';
import { Shield } from 'lucide-react';
export default function AdminPanel({ onClose }) {
  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between mb-6"><h2 className="text-xl font-bold text-white flex items-center gap-2"><Shield className="w-5 h-5 text-red-500" />Admin Panel</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
      </div>
      <p className="text-sm text-slate-400">Quản trị hệ thống</p>
    </div>
  </div>;
}
