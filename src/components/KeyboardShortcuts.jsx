import React from 'react';

export default function KeyboardShortcuts({ open, onClose }) {
  if (!open) return null;

  const shortcuts = [
    { key: '↑ / ↓', desc: 'Chuyển kênh' },
    { key: 'ESC', desc: 'Đóng trình phát / Modal' },
    { key: '← / →', desc: 'Tua nhanh / Chương trình EPG' },
    { key: 'F', desc: 'Toàn màn hình' },
    { key: 'M', desc: 'Tắt / Bật âm thanh' },
    { key: 'Space', desc: 'Phát / Tạm dừng' },
    { key: '?', desc: 'Mở / Đóng phím tắt' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Phím Tắt</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="space-y-3">
          {shortcuts.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
              <span className="text-sm text-slate-300">{s.desc}</span>
              <kbd className="px-3 py-1 bg-slate-800 text-slate-200 text-xs font-mono rounded-lg border border-slate-700">{s.key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}