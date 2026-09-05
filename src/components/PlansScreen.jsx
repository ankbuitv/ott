import React, { useEffect, useState } from 'react';
import { Check, X, Mail, BadgeCheck, ShieldCheck, RefreshCcw, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { PLANS, activatePlan, fetchPlan, SUPPORT_EMAIL, planByCode } from '../services/plans';

// ===== MÀN HÌNH MUA GÓI (MyTV-style nền sáng) =====
// 3 gói: Standard (kênh VN) · Recreational (VN + Phim) · VIP (xem hết) — tạm thời FREE
export default function PlansScreen() {
  const { user, setAuth, token } = useAuth();
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
      addToast(r.message || `Đã kích hoạt gói ${code.toUpperCase()} (tạm free)`, 'success');
    } else {
      addToast(r?.error || 'Kích hoạt thất bại — thử lại hoặc gửi email ' + SUPPORT_EMAIL, 'error');
    }
  };

  return (
    <div className="min-h-full bg-[#f6f7f9] text-slate-900 pb-16">
      {/* Hotline → email support */}
      <div className="w-full bg-white border-b border-slate-200">
        <div className="max-w-[1100px] mx-auto px-6 py-3 flex items-center justify-end gap-2 text-[13px]">
          <Mail className="w-4 h-4 text-[#f36f21]" />
          <span className="text-slate-500">Hỗ trợ &amp; liên hệ:</span>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-extrabold text-[#f36f21] hover:underline">{SUPPORT_EMAIL}</a>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6">
        <h1 className="text-center text-[30px] font-black italic tracking-wide pt-8">MUA GÓI CHRTV</h1>
        <p className="text-center text-[13px] text-slate-500 mt-2 flex items-center justify-center gap-1.5">
          <BadgeCheck className="w-4 h-4 text-emerald-500" />
          Ưu đãi ra mắt: <b className="text-emerald-600">TẤT CẢ CÁC GÓI TẠM MIỄN PHÍ</b> — hỗ trợ qua email {SUPPORT_EMAIL}
        </p>

        {/* Stepper 3 bước */}
        <div className="max-w-[760px] mx-auto mt-9 mb-10">
          <div className="relative flex items-start">
            <div className="absolute left-[12%] right-[12%] top-[15px] h-[2px] bg-slate-200" />
            {[
              { n: 1, t: 'Chọn gói', s: 'Chọn gói phù hợp', on: true },
              { n: 2, t: 'Kích hoạt', s: 'Tạm miễn phí 100%', on: true },
              { n: 3, t: 'Xem ngay', s: 'Tự động mở khoá kênh', on: false },
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
            Gói hiện tại của bạn: <b className="text-[#f36f21]">{currentPlan?.name}</b>
            {currentRank < 3 && <span className="text-slate-400">— có thể nâng cấp bất cứ lúc nào (miễn phí)</span>}
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
                  <div className="text-[24px] font-black italic" style={{ color: p.color }}>Gói {p.name}</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">{p.tagline}</div>
                  <span className="absolute top-4 right-4 bg-[#e53935] text-white text-[11px] font-extrabold px-2.5 py-1 rounded-full">TẠM FREE</span>
                </div>
                <div className="px-6 pt-3">
                  <span className="text-[26px] font-black">0đ</span>
                  <span className="text-[13px] text-slate-400 ml-1">/tháng</span>
                  <span className="ml-2 text-[12px] text-slate-400 line-through">{p.rank === 3 ? '109.000đ' : p.rank === 2 ? '69.000đ' : '39.000đ'}</span>
                </div>
                <div className="px-6 pt-1 text-[11px] font-bold">
                  <span className="inline-block bg-gradient-to-r from-[#ff9a3d] to-[#f36f21] text-white px-2.5 py-1 rounded-md">KM RA MẮT · GIẢM 100%</span>
                </div>
                <button
                  onClick={() => doActivate(p.code)}
                  disabled={busy === p.code || isCurrent}
                  className={`mx-6 mt-4 py-3 rounded-xl font-extrabold text-[14px] transition ${isCurrent ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default' : 'text-white hover:brightness-105 disabled:opacity-60'}`}
                  style={!isCurrent ? { background: `linear-gradient(135deg, ${p.color}, ${p.color}cc)` } : {}}
                >
                  {isCurrent ? '✓ Gói hiện tại' : busy === p.code ? 'Đang kích hoạt...' : canUp || currentRank === 0 ? 'Kích hoạt miễn phí' : 'Chuyển xuống gói này'}
                </button>
                <ul className="px-6 py-5 flex flex-col gap-2.5">
                  {p.allows.map((f) => (
                    <li key={f} className="flex gap-2.5 text-[13px] text-slate-700 leading-snug">
                      <span className="w-[18px] h-[18px] rounded-full bg-[#fff1e7] text-[#f36f21] text-[10px] flex items-center justify-center shrink-0 mt-0.5"><Check className="w-3 h-3" /></span>{f}
                    </li>
                  ))}
                  {p.not.map((f) => (
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
          Ghi chú: Trong thời gian ưu đãi, tất cả gói đều <b>miễn phí</b> — chỉ cần bấm kích hoạt để mở khoá kênh tương ứng.
          Khi áp dụng thu phí sẽ thông báo qua email đăng ký và thông báo trong app.
          Mọi thắc mắc/hỗ trợ vui lòng gửi email: <a className="text-[#f36f21] font-bold" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> (không hỗ trợ qua điện thoại).
        </p>
        <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Luồng phát qua proxy AES-128 token xoay 10 phút</span>
          <span className="flex items-center gap-1"><RefreshCcw className="w-3 h-3" /> Chống ghi lại bằng công cụ ngoài (curl/ffplay bị chặn)</span>
        </div>
        {serverInfo?.support && <div className="text-center text-[11px] text-slate-400 mt-2">Đối tác hỗ trợ: {serverInfo.support}</div>}
      </div>
    </div>
  );
}
