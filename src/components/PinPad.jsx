import React, { useState } from 'react';
import { Delete, Lock } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';

// Bàn phím nhập PIN dùng chung (PIN app, thoát chế độ bé)
export default function PinPad({ title, error = '', onSubmit, onCancel }) {
  const { t } = useI18n();
  const [pin, setPin] = useState('');
  const press = (d) => {
    if (pin.length >= 8) return;
    const v = pin + d;
    setPin(v);
    if (v.length >= 4) {
      // Tự submit khi đủ 4 số (trừ khi đang đặt PIN mới — caller tự xử lý)
      setTimeout(() => onSubmit && onSubmit(v), 150);
    }
  };
  return (
    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur flex items-center justify-center p-4">
      <div className="w-full max-w-[300px] text-center">
        <span className="w-14 h-14 rounded-2xl grad-brand inline-flex items-center justify-center shadow-lg shadow-[#f36f21]/30 mb-3">
          <Lock className="w-6 h-6 text-white" />
        </span>
        <h2 className="text-lg font-black text-white mb-1">{title || t('pin.title')}</h2>
        <div className="flex justify-center gap-2 my-4">
          {[0, 1, 2, 3].map(i => (
            <span key={i} className={`w-3.5 h-3.5 rounded-full border ${pin.length > i ? 'bg-[#f36f21] border-[#f36f21]' : 'border-white/25'}`} />
          ))}
        </div>
        {error && <p className="text-[11px] text-red-400 font-bold mb-2">{error}</p>}
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
            <button key={d} onClick={() => press(String(d))} className="h-14 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] text-xl font-black text-white active:scale-95 transition-all">{d}</button>
          ))}
          <span />
          <button onClick={() => press('0')} className="h-14 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] text-xl font-black text-white active:scale-95 transition-all">0</button>
          <button onClick={() => setPin(p => p.slice(0, -1))} className="h-14 rounded-2xl bg-white/[0.07] hover:bg-white/[0.14] text-stone-300 active:scale-95 transition-all flex items-center justify-center"><Delete className="w-5 h-5" /></button>
        </div>
        {onCancel && (
          <button onClick={onCancel} className="mt-3 text-[12px] font-bold text-stone-500 hover:text-white">{t('common.back')}</button>
        )}
      </div>
    </div>
  );
}
