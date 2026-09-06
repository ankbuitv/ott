import React, { useState, useEffect } from 'react';
import { X, QrCode, CheckCircle, RefreshCw, Copy } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { fetchPayConfig, createPayOrder, claimPayOrder } from '../services/social';

// Thanh toán gói: VietQR (Momo/ZaloPay/banking quét) + tự động qua SePay / duyệt tay
export default function PayModal({ plan, onClose, onPaid }) {
  const { t, lang } = useI18n();
  const { addToast } = useToast();
  const { setAuth, user, token } = useAuth();
  const [cfg, setCfg] = useState(null);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    let on = true;
    fetchPayConfig().then(d => { if (on) setCfg(d.config); }).catch(() => {});
    if (plan?.code) {
      createPayOrder(plan.code).then(o => { if (on) setOrder(o); }).catch((e) => {
        if (on) addToast(e.code === 'LOGIN_REQUIRED' ? t('pay.need_login') : (e.message || t('pay.order_fail')), 'error');
      });
    }
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.code]);

  const price = (s) => {
    try { return Number(s).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') + 'đ'; } catch { return `${s}đ`; }
  };
  const copy = (txt) => {
    try { navigator.clipboard.writeText(txt); addToast(t('share.copied'), 'success'); } catch {}
  };
  const claim = async () => {
    if (!order?.order_code) return;
    setBusy(true);
    try {
      const r = await claimPayOrder(order.order_code);
      if (r.status === 'paid') {
        addToast(t('pay.paid'), 'success');
        try { setAuth({ ...user, plan: plan.code }, token); } catch {}
        onPaid && onPaid(plan.code);
        onClose();
      } else {
        setClaimed(true);
        addToast(t('pay.claimed'), 'info');
      }
    } catch { addToast(t('pay.claim_fail'), 'error'); }
    finally { setBusy(false); }
  };

  const qr = cfg?.bank_id && cfg?.account_no && order ? (
    `https://img.vietqr.io/image/${encodeURIComponent(cfg.bank_id)}-${encodeURIComponent(cfg.account_no)}-${encodeURIComponent(cfg.template || 'compact2')}.png?amount=${order.amount}&addInfo=${encodeURIComponent(order.order_code)}&accountName=${encodeURIComponent(cfg.account_name || 'CHRTV')}`
  ) : '';

  return (
    <div className="fixed inset-0 z-[210] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm modal-panel overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
          <p className="text-[13px] font-black text-white flex items-center gap-2"><QrCode className="w-4 h-4 text-emerald-400" />{t('pay.title', { plan: plan?.name || '' })}</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10"><X className="w-4 h-4 text-slate-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          {!cfg?.bank_id ? (
            <p className="text-[12px] text-stone-400 text-center py-4">{t('pay.no_config')}</p>
          ) : !order ? (
            <p className="text-[12px] text-stone-500 text-center py-8">⟳ {t('app.loading')}</p>
          ) : (
            <>
              <div className="text-center">
                <p className="text-[26px] font-black text-white">{price(order.amount)}</p>
                <p className="text-[11px] text-stone-500">{t('pay.per_month')}</p>
              </div>
              {qr && <div className="bg-white rounded-2xl p-3 flex items-center justify-center"><img src={qr} alt="VietQR" className="w-52 h-52 object-contain" /></div>}
              <div className="rounded-2xl bg-black/40 border border-white/10 p-3 space-y-1.5 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-stone-500">{t('pay.bank')}</span>
                  <span className="font-bold text-white">{cfg.bank_id} · {cfg.account_no}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-stone-500">{t('pay.owner')}</span>
                  <span className="font-bold text-white truncate">{cfg.account_name}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-stone-500">{t('pay.content')}</span>
                  <button onClick={() => copy(order.order_code)} className="font-black text-amber-300 flex items-center gap-1">{order.order_code}<Copy className="w-3 h-3" /></button>
                </div>
              </div>
              <p className="text-[11px] text-stone-500 text-center">{t('pay.hint')}</p>
              {claimed ? (
                <p className="text-[12px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 text-center flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-4 h-4" />{t('pay.pending')}
                </p>
              ) : (
                <button onClick={claim} disabled={busy} className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" />{t('pay.claim')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
