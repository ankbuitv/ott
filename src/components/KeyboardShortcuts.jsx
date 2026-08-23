import React from 'react';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Space'], desc: 'Play / Pause' },
  { keys: ['↑'], desc: 'Kênh trước' },
  { keys: ['↓'], desc: 'Kênh sau' },
  { keys: ['Enter'], desc: 'Danh sách kênh (khi xem)' },
  { keys: ['I'], desc: 'Thông số kỹ thuật' },
  { keys: ['Esc'], desc: 'Đóng panel / Thoát' },
  { keys: ['0'-'9'], desc: 'Chuyển kênh nhanh' },
  { keys: ['?'], desc: 'Bảng phím tắt' },
  { keys: ['M'], desc: 'Bật/tắt âm thanh' },
  { keys: ['F'], desc: 'Toàn màn hình' },
  { keys: ['P'], desc: 'Picture-in-Picture' },
];

export default function KeyboardShortcuts({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#13151c] border border-slate-800/60 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/40">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Keyboard className="w-4 h-4 text-blue-400" /> Phím tắt
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh] space-y-1.5">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-xs text-slate-300">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, ki) => (
                  <kbd key={ki} className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300 font-mono min-w-[24px] text-center">{k}</kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
