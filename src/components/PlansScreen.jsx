import React, { useEffect, useState } from 'react';
import { Check, X, Mail, BadgeCheck, ShieldCheck, RefreshCcw, Lock, Crown, Gift, Sparkles, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PLANS, PLAN_FEATURES, planHasFeature, activatePlan, fetchPlan, fetchPlanList, refreshPlanRanks, SUPPORT_EMAIL } from '../services/plans';
import { useI18n } from '../contexts/I18nContext';
import PayModal from './PayModal';
import GiftModal from './GiftModal';
import { redeemGift } from '../services/social';

function fmtPrice(p, lang) {
  const price = Number(p.price) || 0;
  if (price <= 0) return null;
  try {
    return price.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US') + 'đ';
  } catch { return `${price}đ`; }
}

// Art dự phòng theo mã gói (server không trả art)
function planArt(p) {
  const fb = PLANS.find((f) => f.code === p.code) || {};
  return {
    art: p.art || fb.art || '📦',
    grad: p.grad || fb.grad || `linear-gradient(135deg, ${p.color || '#f36f21'}, #1a1b22)`,
    tagline_en: p.tagline_en || fb.tagline_en || p.tagline || '',
    not: Array.isArray(p.not) && p.not.length ? p.not : (fb.not || []),
    not_en: Array.isArray(p.not_en) && p.not_en.length ? p.not_en : (fb.not_en || []),
  };
}

// ===== MÀN HÌNH MUA GÓI — giá & gói do admin quản lý (API), fallback gói cứng =====
export default function PlansScreen({ initialCode = '' }) {
  const { user, setAuth, token } = useAuth();
  const { t, lang } = useI18n();
  const { addToast } = useToast();
  const [current, setCurrent] = useState((user?.plan || '').toLowerCase());
  const [busy, setBusy] = useState('');
  const [plans, setPlans] = useState(PLANS);
  const [serverInfo, setServerInfo] = useState(null);
  const [payPlan, setPayPlan] = useState(null);
  const [giftCode, setGiftCode] = useState(String(initialCode || '').toUpperCase().slice(0, 32));
  const [giftBusy, setGiftBusy] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);

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
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 relative">
        <div className="flex items-center justify-end gap-2 text-[12px] pt-4 text-stone-500">
          <Mail className="w-3.5 h-3.5 text-[#f36f21]" />
          {t('plans.support')}:
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-[#ff9a3d] hover:underline">{SUPPORT_EMAIL}</a>
        </div>

        {/* ===== HERO minh hoạ ===== */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 mt-3 mb-6" style={{ background: 'linear-gradient(120deg,#1a0f08 0%,#2b1410 40%,#101828 100%)' }}>
          <div className="absolute -right-10 -top-10 w-64 h-64 rounded-full opacity-30 blur-2xl" style={{ background: 'radial-gradient(circle,#f36f21,transparent 70%)' }} />
          <div className="absolute -left-14 -bottom-14 w-72 h-72 rounded-full opacity-20 blur-2xl" style={{ background: 'radial-gradient(circle,#42a5f5,transparent 70%)' }} />
          <div className="relative flex flex-col md:flex-row items-center gap-5 p-6 md:p-8">
            {/* Minh hoạ gói */}
            <div className="flex items-end gap-1 shrink-0 select-none" aria-hidden>
              {plans.slice(0, 5).map((p, i) => {
                const a = planArt(p);
                const h = 44 + i * 12;
                return (
                  <div key={p.code} className="flex flex-col items-center gap-1.5">
                    <div className="rounded-2xl flex items-center justify-center shadow-lg border border-white/20" style={{ width: 52, height: h, background: a.grad }}>
                      <span style={{ fontSize: 20 + i * 2 }}>{a.art}</span>
                    </div>
                    <span className="text-[8px] font-black tracking-wide" style={{ color: p.color || '#fff' }}>{(p.name || '').slice(0, 4)}</span>
                  </div>
                );
              })}
            </div>
            {/* Tiêu đề */}
            <div className="text-center md:text-left flex-1">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#ff9a3d] bg-[#f36f21]/10 border border-[#f36f21]/30 rounded-full px-3 py-1 mb-2">
                <Sparkles className="w-3 h-3" /> CHRTV PLAY
              </div>
              <h1 className="text-[26px] md:text-[32px] font-black tracking-tight text-white leading-tight">{t('plans.title')}</h1>
              <p className="text-[13px] text-stone-400 mt-1.5 flex items-center justify-center md:justify-start gap-1.5">
                <BadgeCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                {t('plans.sub')}
              </p>
            </div>
            {/* Gói hiện tại */}
            {currentRank > 0 && (
              <div className="shrink-0 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-stone-400 font-bold"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />{t('plans.current')}</div>
                <div className="text-lg font-black" style={{ color: cur?.color || '#ff9a3d' }}>{cur?.name || current.toUpperCase()}</div>
                {currentRank < maxRank && <div className="text-[11px] text-stone-500">{t('plans.upgrade_anytime')}</div>}
              </div>
            )}
          </div>
          {/* Thang gói */}
          <div className="relative border-t border-white/[0.07] px-4 md:px-8 py-3 flex items-center gap-1 overflow-x-auto scrollbar-none">
            {plans.map((p, i) => {
              const a = planArt(p);
              const isCur = current === p.code;
              return (
                <React.Fragment key={p.code}>
                  <button onClick={() => startBuy(p)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-black whitespace-nowrap border transition-all active:scale-95 ${isCur ? 'text-white border-transparent' : 'text-stone-300 border-white/10 bg-white/[0.04] hover:border-white/25'}`} style={isCur ? { background: a.grad } : {}}>
                    <span>{a.art}</span> {p.name}
                  </button>
                  {i < plans.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-stone-600 shrink-0" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {plans.length > 1 && (
          <div className="mb-8 overflow-x-auto rounded-3xl border border-white/10 bg-[#101117]">
            <div className="px-4 py-3 border-b border-white/[0.07] flex items-center justify-between">
              <p className="text-[13px] font-black text-white">{t('plans.compare')}</p>
              <span className="text-[10px] font-bold uppercase tracking-widest text-stone-500">{t('plans.feature')}</span>
            </div>
            <table className="w-full min-w-[720px] text-left">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="px-4 py-3 text-[11px] font-black text-stone-500 uppercase tracking-wider w-[180px]">{t('plans.feature')}</th>
                  {plans.map((p) => (
                    <th key={p.code} className="px-3 py-3 text-center">
                      <div className="text-[13px] font-black italic" style={{ color: p.color || '#f36f21' }}>{p.name}</div>
                      <div className="text-[11px] text-stone-400 font-bold mt-0.5">{fmtPrice(p, lang) || t('plans.free_price')}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLAN_FEATURES.map((feat) => (
                  <tr key={feat.id} className="border-b border-white/[0.04]">
                    <td className="px-4 py-2.5 text-[12px] text-stone-300 font-semibold">{lang === 'vi' ? feat.vi : feat.en}</td>
                    {plans.map((p) => {
                      const ok = planHasFeature(p, feat.id);
                      return (
                        <td key={p.code} className="px-3 py-2.5 text-center">
                          {ok
                            ? <Check className="w-4 h-4 text-emerald-400 mx-auto" strokeWidth={3} />
                            : <X className="w-4 h-4 text-stone-600 mx-auto" strokeWidth={3} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-3" />
                  {plans.map((p) => {
                    const isCurrent = current === p.code;
                    return (
                      <td key={p.code} className="px-3 py-3 text-center align-bottom">
                        <button
                          onClick={() => startBuy(p)}
                          disabled={busy === p.code || isCurrent}
                          className={`h-11 w-full rounded-xl text-[12px] font-black ${isCurrent ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40' : 'grad-brand text-white'}`}
                        >
                          {isCurrent ? t('plans.is_current') : busy === p.code ? t('plans.activating') : t('plans.buy_now')}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ===== Thẻ gói ===== */}
        <div className={`grid gap-5 items-stretch ${plans.length >= 5 ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5' : plans.length >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : plans.length === 2 ? 'md:grid-cols-2 max-w-[760px] mx-auto' : 'md:grid-cols-3'}`}>
          {plans.map((p) => {
            const isCurrent = current === p.code;
            const rank = Number(p.rank) || 1;
            const isTop = rank === maxRank && maxRank > 1;
            const priceStr = fmtPrice(p, lang);
            const a = planArt(p);
            return (
              <div key={p.code} className={`rounded-3xl overflow-hidden flex flex-col h-full border transition-all hover:-translate-y-1 ${isCurrent ? 'border-[#f36f21] shadow-[0_10px_40px_rgba(243,111,33,.25)]' : isTop ? 'border-amber-400/40 shadow-[0_10px_40px_rgba(251,191,36,.12)]' : 'border-white/10 shadow-xl shadow-black/30'} bg-[#14151c]`}>
                <div className="relative h-[118px] flex items-center justify-center overflow-hidden shrink-0" style={{ background: a.grad }}>
                  <div className="absolute -left-6 -top-8 w-28 h-28 rounded-full bg-white/15" />
                  <div className="absolute -right-4 -bottom-10 w-32 h-32 rounded-full bg-black/20" />
                  <span className="text-[52px] leading-none drop-shadow-[0_6px_16px_rgba(0,0,0,.45)] relative">{a.art}</span>
                  {isTop && (
                    <span className="absolute top-2.5 right-2.5 bg-amber-400 text-black text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1"><Crown className="w-3 h-3" /> HOT</span>
                  )}
                </div>
                <div className="px-5 pt-4 pb-1">
                  <div className="text-[19px] font-black italic tracking-tight" style={{ color: p.color || '#f36f21' }}>{p.name}</div>
                  <div className="text-[12px] text-stone-400 mt-0.5 min-h-[18px]">{lang === 'vi' ? p.tagline : (a.tagline_en || p.tagline)}</div>
                </div>
                <div className="px-5 pt-1.5 h-10 flex items-baseline">
                  {priceStr ? (
                    <>
                      <span className="text-[26px] font-black text-white leading-none">{priceStr}</span>
                      <span className="text-[12px] text-stone-500 ml-1">{t('plans.per_month')}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[26px] font-black text-emerald-400 leading-none">{t('plans.free_price')}</span>
                      <span className="text-[12px] text-stone-500 ml-1">{t('plans.per_month')}</span>
                    </>
                  )}
                </div>
                <ul className="px-5 py-4 flex flex-col gap-2 flex-1">
                  {PLAN_FEATURES.map((feat) => {
                    const ok = planHasFeature(p, feat.id);
                    return (
                      <li key={feat.id} className={`flex gap-2 text-[12px] leading-snug ${ok ? 'text-stone-300' : 'text-stone-600'}`}>
                        <span className={`w-[17px] h-[17px] rounded-full flex items-center justify-center shrink-0 mt-px ${ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.06] text-stone-600'}`}>
                          {ok ? <Check className="w-3 h-3" strokeWidth={3} /> : <X className="w-3 h-3" strokeWidth={3} />}
                        </span>
                        {lang === 'vi' ? feat.vi : feat.en}
                      </li>
                    );
                  })}
                </ul>
                <button
                  onClick={() => startBuy(p)}
                  disabled={busy === p.code || isCurrent}
                  className={`mx-5 mb-5 mt-auto h-11 rounded-2xl font-extrabold text-[13px] transition active:scale-[0.98] shrink-0 ${isCurrent ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 cursor-default' : 'text-white hover:brightness-110 disabled:opacity-60 shadow-lg'}`}
                  style={!isCurrent ? { background: `linear-gradient(135deg, ${p.color || '#f36f21'}, ${p.color || '#f36f21'}bb)`, boxShadow: `0 8px 24px ${p.color || '#f36f21'}44` } : {}}
                >
                  {isCurrent ? t('plans.is_current') : busy === p.code ? t('plans.activating') : t('plans.buy_now')}
                </button>
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
          <button
            onClick={() => setShowGiftModal(true)}
            className="w-full mt-2.5 py-2.5 rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-300 text-[12.5px] font-black flex items-center justify-center gap-1.5 active:scale-[0.99]"
          >
            <Gift className="w-3.5 h-3.5" />{t('gift.give_title')} <ChevronRight className="w-3.5 h-3.5" />
          </button>
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
      {showGiftModal && (
        <GiftModal onClose={() => setShowGiftModal(false)} />
      )}
    </div>
  );
}
