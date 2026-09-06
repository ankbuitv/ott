// (20) Nút "Báo kênh lỗi" — 1 chạm gửi channel_id + mã lỗi + ghi chú về Admin.
import React, { useState } from 'react';
import { AlertTriangle, X, Check } from 'lucide-react';
import { REPORT_CODES, reportChannel } from '../services/telemetry';

export default function ReportChannelModal({ channel, defaultCode = 'no_play', onClose, addToast }) {
  const [code, setCode] = useState(defaultCode);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (sending) return;
    setSending(true);
    const r = await reportChannel({ channel, code, note });
    setSending(false);
    if (r && r.success) {
      setDone(true);
      addToast?.('Đã gửi báo lỗi, cảm ơn bro! Bọn mình kiểm tra ngay.', 'success');
      setTimeout(() => onClose?.(), 1200);
    } else {
      addToast?.(r?.error || 'Gửi không được, thử lại sau nhé', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[#14151c] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-[#f36f21]/15 border border-[#f36f21]/25 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-[#ff9a3d]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-black text-white leading-tight">Báo kênh lỗi</h3>
            <p className="text-[11px] text-stone-500 truncate">{channel?.name || channel?.channel_id}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-stone-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {REPORT_CODES.map(c => (
            <button
              key={c.code}
              type="button"
              onClick={() => setCode(c.code)}
              className={`px-3 py-2.5 rounded-xl text-[12px] font-bold text-left transition-all border ${
                code === c.code
                  ? 'bg-[#f36f21]/20 border-[#f36f21]/60 text-white'
                  : 'bg-black/30 border-white/[0.07] text-stone-400 hover:border-white/20'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          rows={2}
          placeholder="Mô tả thêm (không bắt buộc) — VD: lỗi từ 20h, kênh khác vẫn xem được"
          className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-3 py-2.5 text-[12px] text-white placeholder-stone-600 focus:outline-none focus:border-[#f36f21]/50 resize-none"
        />

        <button
          type="submit"
          disabled={sending || done}
          className="w-full py-3 rounded-xl bg-[#f36f21] hover:bg-[#e05f0f] disabled:opacity-60 text-white text-[13px] font-black flex items-center justify-center gap-2"
        >
          {done ? <><Check className="w-4 h-4" /> Đã gửi</> : sending ? 'Đang gửi…' : 'Gửi báo lỗi'}
        </button>
        <p className="text-[10px] text-stone-600 text-center">Nhiều người cùng báo 1 kênh, hệ thống sẽ tự kiểm tra luồng và báo kỹ thuật ngay.</p>
      </form>
    </div>
  );
}
