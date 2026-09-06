import React, { useEffect, useState } from 'react';
import { Check, X, Mail, BadgeCheck, ShieldCheck, RefreshCcw, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PLANS, activatePlan, fetchPlan, SUPPORT_EMAIL, planByCode } from '../services/plans';
import { useI18n } from '../contexts/I18nContext';

// ===== MÀN HÌNH MUA GÓI (MyTV-style nền sáng) =====
// 3 gói: Standard (kênh VN) · Recreational (VN + Phim) · VIP (xem hết) — tạm thời FREE
export default function PlansScreen() {
  const { user, setAuth, token } = useAuth();
  const { t, lang } = useI18n();
  const { addToast } = useToast();
  const [current, setCurrent] = useState((user?.plan || '').toLowerCase());
  const [busy, setBusy] = useState('');
  const [serverInfo, setServerInfo] = useState(null);

  useEffect(() => {
    let on = true;
    fetchPlan().then((j) => { if (on && j && j.success) { setServerInfo(j); if (j.current) setCurrent(j.current); } });
    return () => { on = false; };
  }, [token]);

  const currentPlan = planByCode(current);
  const currentRank = currentPlan ? currentPlan.rank : 0;

  const doActivate = async (code) => {
    setBusy(code);
    const r = await activatePlan(code);
    setBusy('');
    if (r?.success) {
      setCurrent(code);
      try { setAuth({ ...user, plan: code }, token); } catch (e) {}
      addToast(r.message || t('plans.activated', { code: code.toUpperCase() }), 'success');
    } else {
      addToast(r?.error || t('plans.activate_fail', { email: SUPPORT_EMAIL }), 'error');
    }
  };

  return (
    <div className="min-h-full bg-[#f6f7f9] text-slate-900 pb-16">
      {/* Hotline → email support */}
      <div className="w-full bg-white border-b border-slate-200">
        <div className="max-w-[1100px] mx-auto px-6 py-3 flex items-center justify-end gap-2 text-[13px]">
          <Mail className="w-4 h-4 text-[#f36f21]" />
          <span className="text-slate-500">{t('plans.support')}:</span>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-extrabold text-[#f36f21] hover:underline">{SUPPORT_EMAIL}</a>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6">
        <h1 className="text-center text-[30px] font-black italic tracking-wide pt-8">{t('plans.title')}</h1>
        <p className="text-center text-[13px] text-slate-500 mt-2 flex items-center justify-center gap-1.5">
          <BadgeCheck className="w-4 h-4 text-emerald-500" />
          {t('plans.promo', { email: SUPPORT_EMAIL })}
        </p>

        {/* Stepper 3 bước */}
        <div className="max-w-[760px] mx-auto mt-9 mb-10">
          <div className="relative flex items-start">
            <div className="absolute left-[12%] right-[12%] top-[15px] h-[2px] bg-slate-200" />
            {[
              { n: 1, t: t('plans.s1'), s: t('plans.s1s'), on: true },
              { n: 2, t: t('plans.s2'), s: t('plans.s2s'), on: true },
              { n: 3, t: t('plans.s3'), s: t('plans.s3s'), on: false },
            ].map((st, i) => (
              <React.Fragment key={st.n}>
                <div className="flex-1 flex items-center gap-2.5 relative z-10 justify-center">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-extrabold ${st.on ? 'bg-[#f36f21] text-white' : 'bg-slate-200 text-slate-400'}`}>{st.n}</span>
                  <div className="text-left">
                    <div className={`text-[13px] font-bold ${st.on ? 'text-slate-900' : 'text-slate-400'}`}>{st.t}</div>
                    <div className="text-[11px] text-slate-400">{st.s}</div>
                  </div>
                </div>
                {i < 2 && <div className="flex-1 h-[2px] bg-slate-200 mt-[15px] max-w-[70px]" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Gói hiện tại */}
        {currentRank > 0 && (
          <div className="max-w-[760px] mx-auto mb-6 flex items-center justify-center gap-2 text-[13px]">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            {t('plans.current')}: <b className="text-[#f36f21]">{currentPlan?.name}</b>
            {currentRank < 3 && <span className="text-slate-400">— {t('plans.upgrade_anytime')}</span>}
          </div>
        )}

        {/* 3 thẻ gói */}
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((p) => {
            const isCurrent = current === p.code;
            const canUp = p.rank > currentRank;
            return (
              <div key={p.code} className={`rounded-2xl bg-white overflow-hidden flex flex-col border ${isCurrent ? 'border-[#f36f21] shadow-[0_10px_40px_rgba(243,111,33,.15)]' : 'border-slate-200 shadow-sm'}`}>
                <div className="px-6 pt-5 pb-4 relative" style={{ background: `linear-gradient(180deg, ${p.color}18, ${p.color}08)` }}>
                  <div className="text-[24px] font-black italic" style={{ color: p.color }}>{t('plans.plan_of', { name: p.name })}</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">{lang === 'vi' ? p.tagline : (p.tagline_en || p.tagline)}</div>
                  <span className="absolute top-4 right-4 bg-[#e53935] text-white text-[11px] font-extrabold px-2.5 py-1 rounded-full">{t('plans.temp_free')}</span>
                </div>
                <div className="px-6 pt-3">
                  <span className="text-[26px] font-black">{t('plans.free_price')}</span>
                  <span className="text-[13px] text-slate-400 ml-1">{t('plans.per_month')}</span>
                  <span className="ml-2 text-[12px] text-slate-400 line-through">{p.rank === 3 ? '109.000đ' : p.rank === 2 ? '69.000đ' : '39.000đ'}</span>
                </div>
                <div className="px-6 pt-1 text-[11px] font-bold">
                  <span className="inline-block bg-gradient-to-r from-[#ff9a3d] to-[#f36f21] text-white px-2.5 py-1 rounded-md">{t('plans.launch_deal')}</span>
                </div>
                <button
                  onClick={() => doActivate(p.code)}
                  disabled={busy === p.code || isCurrent}
                  className={`mx-6 mt-4 py-3 rounded-xl font-extrabold text-[14px] transition ${isCurrent ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default' : 'text-white hover:brightness-105 disabled:opacity-60'}`}
                  style={!isCurrent ? { background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)` } : {}}
                >
                  {isCurrent ? t('plans.is_current') : busy === p.code ? t('plans.activating') : canUp || currentRank === 0 ? t('plans.activate_free') : t('plans.downgrade')}
                </button>
                <ul className="px-6 py-5 flex flex-col gap-2.5">
                  {(lang === 'vi' ? p.allows : (p.allows_en || p.allows)).map((f) => (
                    <li key={f} className="flex gap-2.5 text-[13px] text-slate-700 leading-snug">
                      <span className="w-[18px] h-[18px] rounded-full bg-[#fff1e7] text-[#f36f21] text-[10px] flex items-center justify-center shrink-0 mt-0.5"><Check className="w-3 h-3" /></span>{f}
                    </li>
                  ))}
                  {(lang === 'vi' ? p.not : (p.not_en || p.not)).map((f) => (
                    <li key={f} className="flex gap-2.5 text-[13px] text-slate-400 leading-snug">
                      <span className="w-[18px] h-[18px] rounded-full bg-slate-100 text-slate-400 text-[10px] flex items-center justify-center shrink-0 mt-0.5"><X className="w-3 h-3" /></span>{f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="max-w-[820px] mx-auto text-center text-[12px] text-slate-400 leading-relaxed mt-8">
          {t('plans.note1')}
          {t('plans.note2')}
          {t('plans.note3')} <a className="text-[#f36f21] font-bold" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> {t('plans.note4')}
        </p>
        <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> {t('plans.sec1')}</span>
          <span className="flex items-center gap-1"><RefreshCcw className="w-3 h-3" /> {t('plans.sec2')}</span>
        </div>
        {serverInfo?.support && <div className="text-center text-[11px] text-slate-400 mt-2">Đối tác hỗ trợ: {serverInfo.support}</div>}
      </div>
    </div>
  );
}
