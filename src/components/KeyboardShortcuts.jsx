import React from 'react';
export default function KeyboardShortcuts({open,onClose}) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
    <div className="bg-slate-900 rounded-2xl p-6 max-w-sm w-full" onClick={e=>e.stopPropagation()}>
      <h2 className="text-white font-bold text-lg mb-4">Phím tắt</h2>
      <div className="space-y-2 text-xs text-slate-300">
        <p><kbd className="bg-slate-800 px-2 py-0.5 rounded">↑↓</kbd> Chuyển kênh</p>
        <p><kbd className="bg-slate-800 px-2 py-0.5 rounded">ESC</kbd> Đóng player</p>
        <p><kbd className="bg-slate-800 px-2 py-0.5 rounded">?</kbd> Phím tắt</p>
      </div>
    </div>
  </div>;
}