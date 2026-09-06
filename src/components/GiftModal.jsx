import React, { useEffect, useState } from 'react';
import { X, Gift, Copy, BadgeCheck, Clock3, Send, Sparkles, UserRound } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { createGift, fetchMyGifts, redeemGift } from '../services/social';
import { PLANS } from '../services/plans';

// ===== TẶNG GÓI QUÀ KÊNH CHO BẠN BÈ =====
// Tạo mã quà tặng gói cước (1 lần dùng) gửi cho bạn bè:
//  - Ghi tên đăng nhập bạn bè -> CHỈ tài khoản đó nhận được (khoá tên)
//  - Bỏ trống -> ai cầm mã cũng nhận được (gửi nhóm, livestream...)
// Sau khi tạo: copy mã hoặc chia sẻ link deep ?gift=CODE — bạn mở link là vào
// thẳng trang Gói cước với mã đã điền sẵn, bấm Nhận gói xong.
const DAY_OPTIONS = [
  { v: 7, label: '7 ngày' },
  { v: 30, label: '30 ngày' },
  { v: 90, label: '90 ngày' },
  { v: 365, label: '365 ngày' },
];

export default function GiftModal({ onClose }) {
  const { t } = useI18n();
  const { addToast } = useToast();
  const { user, setAuth, token } = useAuth();
  const [plan, setPlan] = useState('signature');
  const [days, setDays] = useState(30);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // { code, plan, days, to_username }
  const [mine, setMine] = useState({ sent: [], received: [] });
  const [tab, setTab] = useState('sent');

  const loadMine = () => { fetchMyGifts().then((d) => setMine({ sent: d.sent || [], received: d.received || [] })).catch(() => {}); };
  useEffect(() => { loadMine(); }, []);

  const planMeta = (code) => PLANS.find((p) => p.code === code) || {};
  const planName = (code) => String(planMeta(code).name || (code || '').toUpperCase());
  const planColor = (code) => planMeta(code).color || '#f36f21';

  const shareLink = (code) => {
    try {
      const u = new URL(window.location.href);
      u.search = `?gift=${code}`;
      return u.toString();
    } catch { return `?gift=${code}`; }
  };

  const copy = (txt) => {
    try { navigator.clipboard.writeText(txt); addToast(t('gift.copied'), 'success'); } catch {}
  };

  const share = async (g) => {
    const text = t('gift.share_text', { plan: planName(g.plan), days: g.days, code: g.code, link: shareLink(g.code) });
    try {
      if (navigator.share) { await navigator.share({ title: 'CHRTV PL▷Y', text }); return; }
    } catch {}
    copy(text);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await createGift({ plan, days, to: to.trim(), note: note.trim() });
      setCreated(r);
      addToast(t('gift.created_ok'), 'success');
      loadMine();
    } catch (e) {
      addToast(e.code === 'LOGIN_REQUIRED' ? t('gift.need_login') : (e.message || t('gift.create_fail')), 'error');
    } finally { setBusy(false); }
  };

  const doRedeem = async (code) => {
    try {
      const r = await redeemGift(code);
      try { setAuth({ ...user, plan: r.plan }, token); } catch {}
      addToast(t('gift.ok', { plan: String(r.plan).toUpperCase(), days: r.days }), 'success');
      loadMine();
    } catch (e) {
      addToast(e.code === 'LOGIN_REQUIRED' ? t('gift.need_login') : (e.message || t('gift.fail')), 'error');
    }
  };

  const Row = ({ g, kind }) => (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.07]">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-[16px] shrink-0" style={{ background: `${planColor(g.plan)}22`, border: `1px solid ${planColor(g.plan)}55` }}>
        {planMeta(g.plan).art || '📦'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-bold text-white leading-tight">
          {planName(g.plan)} · <span className="text-stone-400 font-semibold">{g.days} {t('gift.day_unit')}</span>
        </p>
        <p className="text-[11px] text-stone-500 font-mono truncate">{g.code}</p>
        {g.note ? <p className="text-[11px] text-stone-400 italic truncate">“{g.note}”</p> : null}
        {kind === 'sent' && g.to_username ? <p className="text-[11px] text-stone-500 flex items-center gap-1"><UserRound className="w-3 h-3" />{t('gift.locked_to', { name: g.to_username })}</p> : null}
      </div>
      {g.status === 'redeemed' ? (
        <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-lg flex items-center gap-1 shrink-0"><BadgeCheck className="w-3 h-3" />{t('gift.redeemed')}</span>
      ) : kind === 'received' ? (
        <button onClick={() => doRedeem(g.code)} className="text-[11px] font-black text-white px-3 py-1.5 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 active:scale-95 shrink-0">{t('gift.redeem')}</button>
      ) : (
        <span className="text-[10px] font-black text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded-lg flex items-center gap-1 shrink-0"><Clock3 className="w-3 h-3" />{t('gift.pending')}</span>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[520px] max-h-[88vh] overflow-y-auto rounded-3xl border border-fuchsia-500/25 shadow-2xl"
        style={{ background: 'linear-gradient(160deg,#17111f 0%,#141420 45%,#101018 100%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.07]" style={{ background: 'linear-gradient(160deg,#17111f,#141420)' }}>
          <p className="text-[15px] font-black text-white flex items-center gap-2">
            <Gift className="w-5 h-5 text-fuchsia-400" />{t('gift.give_title')}
          </p>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-stone-400 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {created ? (
            <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 flex flex-col items-center gap-3">
              <span className="text-[11px] font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full flex items-center gap-1"><Sparkles className="w-3 h-3" />{t('gift.created_ok')}</span>
              <p className="text-[13px] text-stone-300 text-center">{t('gift.created_desc', { plan: planName(created.plan), days: created.days })}{created.to_username ? ` — ${created.to_username}` : ''}</p>
              <p className="px-4 py-2.5 rounded-2xl bg-black/50 border border-fuchsia-500/40 text-fuchsia-300 font-mono font-black text-[17px] tracking-wider select-all">{created.code}</p>
              <p className="text-[11px] text-stone-500 text-center leading-relaxed">{t('gift.link_hint')}</p>
              <p className="text-[11.5px] text-stone-400 font-mono bg-black/40 border border-white/10 rounded-xl px-3 py-2 max-w-full truncate select-all">{shareLink(created.code)}</p>
              <div className="flex gap-2 w-full">
                <button onClick={() => copy(created.code)} className="flex-1 py-2.5 rounded-2xl bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 text-white text-[12.5px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]"><Copy className="w-3.5 h-3.5" />{t('gift.copy_code')}</button>
                <button onClick={() => share(created)} className="flex-1 py-2.5 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white text-[12.5px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.98]"><Send className="w-3.5 h-3.5" />{t('gift.share')}</button>
              </div>
              <button onClick={() => { setCreated(null); setNote(''); }} className="text-[12px] text-fuchsia-400 font-bold hover:underline">{t('gift.make_another')}</button>
            </div>
          ) : (
            <>
              {/* Chọn gói */}
              <div>
                <p className="text-[12px] font-bold text-stone-400 mb-2">{t('gift.pick_plan')}</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {PLANS.map((p) => (
                    <button
                      key={p.code}
                      onClick={() => setPlan(p.code)}
                      className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl border transition active:scale-95 ${plan === p.code ? 'border-white/30 bg-white/[0.09]' : 'border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]'}`}
                      style={plan === p.code ? { boxShadow: `0 0 0 1px ${p.color}, 0 6px 18px ${p.color}33`, background: `${p.color}1a` } : {}}
                    >
                      <span className="text-[17px] leading-none">{p.art}</span>
                      <span className="text-[8.5px] font-black tracking-wide" style={{ color: plan === p.code ? p.color : '#a8a29e' }}>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Thời hạn */}
              <div>
                <p className="text-[12px] font-bold text-stone-400 mb-2">{t('gift.duration')}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {DAY_OPTIONS.map((d) => (
                    <button
                      key={d.v}
                      onClick={() => setDays(d.v)}
                      className={`py-2 rounded-xl text-[12px] font-bold border transition active:scale-95 ${days === d.v ? 'text-white border-fuchsia-500/60 bg-fuchsia-500/15' : 'text-stone-400 border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]'}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Người nhận */}
              <div>
                <p className="text-[12px] font-bold text-stone-400 mb-2">{t('gift.to_label')}</p>
                <input
                  value={to}
                  onChange={(e) => setTo(e.target.value.replace(/\s+/g, '').slice(0, 40))}
                  placeholder={t('gift.to_placeholder')}
                  className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[13px] font-semibold text-white placeholder:text-stone-600 outline-none focus:border-fuchsia-500"
                />
                <p className="text-[11px] text-stone-500 mt-1.5">{to.trim() ? t('gift.locked_hint') : t('gift.anyone_hint')}</p>
              </div>

              {/* Lời nhắn */}
              <div>
                <p className="text-[12px] font-bold text-stone-400 mb-2">{t('gift.note_label')}</p>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 200))}
                  placeholder={t('gift.note_placeholder')}
                  className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-[13px] text-white placeholder:text-stone-600 outline-none focus:border-fuchsia-500"
                />
              </div>

              <button
                onClick={submit}
                disabled={busy}
                className="w-full py-3 rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-[14px] font-black flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-fuchsia-900/40"
              >
                <Gift className="w-4 h-4" />{busy ? t('gift.creating') : t('gift.create_btn')}
              </button>
            </>
          )}

          {/* Lịch sử quà */}
          {user && (
            <div className="mt-1">
              <div className="flex items-center gap-2 mb-2.5">
                {(['sent', 'received'] ).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`px-3 py-1.5 rounded-xl text-[11.5px] font-bold border transition ${tab === k ? 'text-white border-fuchsia-500/50 bg-fuchsia-500/15' : 'text-stone-500 border-white/[0.07] bg-white/[0.03]'}`}
                  >
                    {k === 'sent' ? t('gift.my_sent') : t('gift.my_received')}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                {(tab === 'sent' ? mine.sent : mine.received).length === 0 ? (
                  <p className="text-[12px] text-stone-600 text-center py-3">{tab === 'sent' ? t('gift.empty_sent') : t('gift.empty_received')}</p>
                ) : (
                  (tab === 'sent' ? mine.sent : mine.received).map((g) => <Row key={g.code} g={g} kind={tab} />)
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
