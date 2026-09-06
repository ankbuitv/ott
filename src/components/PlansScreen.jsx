import React, { useEffect, useState } from 'react';
import { Check, Mail, BadgeCheck, ShieldCheck, RefreshCcw, Lock, Crown, Gift } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PLANS, activatePlan, fetchPlan, fetchPlanList, refreshPlanRanks, SUPPORT_EMAIL } from '../services/plans';
import { useI18n } from '../contexts/I18nContext';
import PayModal from './PayModal';
import { redeemGift } from '../services/social';

function fmtPrice(p, lang) {
  const price = Number(p.price) || 0;
  if (price <= 0) return null;
  try {
    return price.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') + 'đ';
  } catch { return `${price}đ`; }
}

// ===== MÀN HÌNH MUA GÓI — giá & gói do admin quản lý (API), fallback gói cứng =====
export default function PlansScreen() {
  const { user, setAuth, token } = useAuth();
  const { t, lang } = useI18n();
  const { addToast } = useToast();
  const [current, setCurrent] = useState((user?.plan || '').toLowerCase());
  const [busy, setBusy] = useState('');
  const [plans, setPlans] = useState(PLANS);
  const [serverInfo, setServerInfo] = useState(null);
  const [payPlan, setPayPlan] = useState(null);
  const [giftCode, setGiftCode] = useState('');
  const [giftBusy, setGiftBusy] = useState(false);

  useEffect(() => {
    let on = true;
    fetchPlan().then((j) => {
      if (!on || !j?.success) return;
      setServerInfo(j);
      if (j.current) setCurrent(String(j.current).toLowerCase());
      if (j.plans) {
        const list = Object.values(j.plans).sort((a, b) => (a.rank || 1) - (b.rank || 1));
        if (list.length) { refreshPlanRanks(list); setPlans(list); }
      }
    }).catch(() => {});
    fetchPlanList().then((list) => {
      if (on && list?.length) setPlans([...list].sort((a, b) => (a.rank || 1) - (b.rank || 1)));
    }).catch(() => {});
    return () => { on = false; };
  }, [token]);

  const cur = plans.find(p => p.code === current);
  const currentRank = cur ? Number(cur.rank) || 0 : 0;
  const maxRank = Math.max(1, ...plans.map(p => Number(p.rank) || 1));

  // Gói có giá -> mở thanh toán VietQR; gói free -> kích hoạt ngay
  const startBuy = (p) => {
    if (current === p.code) return;
    if ((Number(p.price) || 0) > 0) { setPayPlan(p); return; }
    doActivate(p.code);
  };

  const doGift = async () => {
    const code = giftCode.trim();
    if (!code) return;
    setGiftBusy(true);
    try {
      const r = await redeemGift(code);
      setCurrent(r.plan);
      try { setAuth({ ...user, plan: r.plan }, token); } catch (e) {}
      setGiftCode('');
      addToast(t('gift.ok', { plan: String(r.plan).toUpperCase(), days: r.days }), 'success');
    } catch (e) {
      addToast(e.code === 'LOGIN_REQUIRED' ? t('gift.need_login') : (e.message || t('gift.fail')), 'error');
    } finally { setGiftBusy(false); }
  };

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
    <div className="min-h-full pb-16 relative">
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(700px 260px at 50% 0%, rgba(243,111,33,.12), transparent 70%)' }}></div>
      <div className="max-w-[1100px] mx-auto px-5 md:px-6 relative">
        <div className="flex items-center justify-end gap-2 text-[12px] pt-4 text-stone-500">
          <Mail className="w-3.5 h-3.5 text-[#f36f21]" />
          {t('plans.support')}:
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-[#ff9a3d] hover:underline">{SUPPORT_EMAIL}</a>
        </div>

        <h1 className="text-center text-[28px] md:text-[34px] font-black tracking-tight pt-4 text-white">{t('plans.title')}</h1>
        <p className="text-center text-[13px] text-stone-400 mt-2 flex items-center justify-center gap-1.5">
          <BadgeCheck className="w-4 h-4 text-emerald-400" />
          {t('plans.promo', { email: SUPPORT_EMAIL })}
        </p>

        {/* Stepper */}
        <div className="max-w-[760px] mx-auto mt-8 mb-8">
          <div className="relative flex items-start">
            <div className="absolute left-[12%] right-[12%] top-[15px] h-[2px] bg-white/10" />
            {[
              { n: 1, t: t('plans.s1'), s: t('plans.s1s'), on: true },
              { n: 2, t: t('plans.s2'), s: t('plans.s2s'), on: true },
              { n: 3, t: t('plans.s3'), s: t('plans.s3s'), on: false },
            ].map((st, i) => (
              <React.Fragment key={st.n}>
                <div className="flex-1 flex items-center gap-2.5 relative z-10 justify-center">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-extrabold shrink-0 ${st.on ? 'grad-brand text-white shadow-lg shadow-[#f36f21]/30' : 'bg-white/10 text-stone-500'}`}>{st.n}</span>
                  <div className="text-left hidden sm:block">
                    <div className={`text-[13px] font-bold ${st.on ? 'text-white' : 'text-stone-500'}`}>{st.t}</div>
                    <div className="text-[11px] text-stone-500">{st.s}</div>
                  </div>
                </div>
                {i < 2 && <div className="flex-1 h-[2px] bg-white/10 mt-[15px] max-w-[70px]" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Gói hiện tại */}
        {currentRank > 0 && (
          <div className="max-w-[760px] mx-auto mb-6 flex items-center justify-center gap-2 text-[13px] text-stone-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            {t('plans.current')}: <b className="text-[#ff9a3d]">{cur?.name || current.toUpperCase()}</b>
            {currentRank < maxRank && <span className="text-stone-500">— {t('plans.upgrade_anytime')}</span>}
          </div>
        )}

        {/* Thẻ gói */}
        <div className={`grid gap-5 ${plans.length >= 4 ? 'md:grid-cols-4' : plans.length === 2 ? 'md:grid-cols-2 max-w-[760px] mx-auto' : 'md:grid-cols-3'}`}>
          {plans.map((p) => {
            const isCurrent = current === p.code;
            const rank = Number(p.rank) || 1;
            const canUp = rank > currentRank;
            const isTop = rank === maxRank && maxRank > 1;
            const allows = Array.isArray(p.allows) ? p.allows : [];
            const priceStr = fmtPrice(p, lang);
            return (
              <div key={p.code} className={`rounded-3xl overflow-hidden flex flex-col border transition-all hover:-translate-y-1 ${isCurrent ? 'border-[#f36f21] shadow-[0_10px_40px_rgba(243,111,33,.25)]' : isTop ? 'border-amber-400/40 shadow-[0_10px_40px_rgba(251,191,36,.12)]' : 'border-white/10 shadow-xl shadow-black/30'} bg-[#14151c]`}>
                <div className="px-6 pt-5 pb-4 relative" style={{ background: `linear-gradient(180deg, ${p.color || '#f36f21'}26, transparent)` }}>
                  <div className="text-[22px] font-black italic tracking-tight" style={{ color: p.color || '#f36f21' }}>{p.name}</div>
                  <div className="text-[12px] text-stone-400 mt-0.5">{lang === 'vi' ? p.tagline : (p.tagline_en || p.tagline)}</div>
                  {isTop && (
                    <span className="absolute top-4 right-4 bg-amber-400 text-black text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1"><Crown className="w-3 h-3" /> HOT</span>
                  )}
                  {!priceStr && (
                    <span className="absolute top-4 right-4 bg-[#e53935] text-white text-[10px] font-black px-2.5 py-1 rounded-full">{p.price_text || t('plans.temp_free')}</span>
                  )}
                </div>
                <div className="px-6 pt-2 flex items-baseline">
                  {priceStr ? (
                    <>
                      <span className="text-[30px] font-black text-white">{priceStr}</span>
                      <span className="text-[13px] text-stone-500 ml-1">{t('plans.per_month')}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[30px] font-black text-emerald-400">{t('plans.free_price')}</span>
                      <span className="text-[13px] text-stone-500 ml-1">{t('plans.per_month')}</span>
                    </>
                  )}
                </div>
                {!priceStr && (
                  <div className="px-6 pt-1.5 text-[11px] font-bold">
                    <span className="inline-block grad-brand text-white px-2.5 py-1 rounded-lg">{t('plans.launch_deal')}</span>
                  </div>
                )}
                <button
                  onClick={() => startBuy(p)}
                  disabled={busy === p.code || isCurrent}
                  className={`mx-6 mt-4 py-3 rounded-2xl font-extrabold text-[14px] transition active:scale-[0.98] ${isCurrent ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 cursor-default' : 'text-white hover:brightness-110 disabled:opacity-60 shadow-lg'}`}
                  style={!isCurrent ? { background: `linear-gradient(135deg, ${p.color || '#f36f21'}, ${p.color || '#f36f21'}bb)`, boxShadow: `0 8px 24px ${p.color || '#f36f21'}44` } : {}}
                >
                  {isCurrent ? t('plans.is_current') : busy === p.code ? t('plans.activating') : canUp || currentRank === 0 ? (priceStr ? t('plans.activate') : t('plans.activate_free')) : t('plans.downgrade')}
                </button>
                <ul className="px-6 py-5 flex flex-col gap-2.5">
                  {allows.map((f, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] text-stone-300 leading-snug">
                      <span className="w-[18px] h-[18px] rounded-full bg-[#f36f21]/20 text-[#ff9a3d] flex items-center justify-center shrink-0 mt-0.5"><Check className="w-3 h-3" /></span>{f}
                    </li>
                  ))}
                  {allows.length === 0 && <li className="text-[12px] text-stone-600">—</li>}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Mã quà tặng */}
        <div className="max-w-[560px] mx-auto mt-8 rounded-3xl border border-fuchsia-500/25 bg-fuchsia-500/[0.05] p-4">
          <p className="text-[13px] font-black text-white flex items-center gap-2 mb-2"><Gift className="w-4 h-4 text-fuchsia-400" />{t('gift.title')}</p>
          <div className="flex gap-2">
            <input
              value={giftCode} onChange={e => setGiftCode(e.target.value.toUpperCase().slice(0, 32))}
              onKeyDown={e => { if (e.key === 'Enter') doGift(); }}
              placeholder="CHRTV-XXXXXXXX"
              className="flex-1 px-3 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[13px] font-mono font-bold text-white placeholder:text-stone-600 outline-none focus:border-fuchsia-500 uppercase"
            />
            <button onClick={doGift} disabled={giftBusy || !giftCode.trim()} className="px-5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[13px] font-bold disabled:opacity-40 active:scale-95">
              {t('gift.redeem')}
            </button>
          </div>
        </div>

        <p className="max-w-[820px] mx-auto text-center text-[12px] text-stone-500 leading-relaxed mt-8">
          {t('plans.note1')} {t('plans.note2')}<br />
          {t('plans.note3')} <a className="text-[#ff9a3d] font-bold" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> {t('plans.note4')}
        </p>
        <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-stone-600">
          <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> {t('plans.sec1')}</span>
          <span className="flex items-center gap-1"><RefreshCcw className="w-3 h-3" /> {t('plans.sec2')}</span>
        </div>
        {serverInfo?.support && <div className="text-center text-[11px] text-stone-600 mt-2">{t('plans.partner')}: {serverInfo.support}</div>}
      </div>
      {payPlan && (
        <PayModal
          plan={payPlan}
          onClose={() => setPayPlan(null)}
          onPaid={(code) => { setCurrent(code); setPayPlan(null); }}
        />
      )}
    </div>
  );
}
