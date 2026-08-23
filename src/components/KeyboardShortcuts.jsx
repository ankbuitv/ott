import React from 'react';
export default function KeyboardShortcuts({open,onClose}) {
  if (!open) return null;
  const shortcuts = [{key:'↑/↓',desc:'Chuyển kênh'},{key:'ESC',desc:'Đóng'},{key:'F',desc:'Toàn màn hình'},{key:'M',desc:'Tắt âm thanh'},{key:'Space',desc:'Phát/Dừng'},{key:'?',desc:'Phím tắt'}];
  return <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 max-w-md w-full" onClick={e=>e.stopPropagation()}>
      <h2 className="text-xl font-bold text-white mb-6">Phím Tắt</h2>
      <div className="space-y-3">{shortcuts.map((s,i)=><div key={i} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0"><span className="text-sm text-slate-300">{s.desc}</span><kbd className="px-3 py-1 bg-slate-800 text-slate-200 text-xs font-mono rounded-lg">{s.key}</kbd></div>)}</div>
    </div>
  </div>;
}
