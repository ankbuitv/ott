import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff, Check, ArrowRight, RotateCcw, QrCode as QrIcon, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useI18n } from '../contexts/I18nContext';
import { API_BASE } from '../services/config';
import Logo from './Logo';
import LegalModal from './LegalModal';

const inputCls = 'w-full pl-10 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-[#f36f21]/60';

export default function AuthModal({ open, onClose, initialView = 'login' }) {
  const { t } = useI18n();
  const [view, setView] = useState(initialView); // login, register, verify, forgot, reset
  const [loginVal, setLoginVal] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [username, setUsername] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [resendIn, setResendIn] = useState(0);
  const [needTotp, setNeedTotp] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [agree, setAgree] = useState(false);
  const [legal, setLegal] = useState(null);

  const { login, register, verifyEmail, forgotPassword, resetPassword, resendVerify, loading, setAuth } = useAuth();
  const { addToast } = useToast();

  // ===== QR login (cột trái) =====
  const [qrCode, setQrCode] = useState('');
  const [qrLeft, setQrLeft] = useState(0);
  const [qrBusy, setQrBusy] = useState(false);
  const pollRef = useRef(null);
  const stopQrPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => stopQrPoll, [stopQrPoll]);

  const startQr = useCallback(async () => {
    stopQrPoll();
    setQrBusy(true);
    try {
      const r = await fetch(`${API_BASE}/auth/qr/request`, { method: 'POST' });
      const d = await r.json();
      if (!d.success || !d.code) throw new Error(d.error || 'QR');
      setQrCode(d.code);
      setQrLeft(d.expiresIn || 120);
      pollRef.current = setInterval(async () => {
        try {
          const pr = await fetch(`${API_BASE}/auth/qr/poll?code=${encodeURIComponent(d.code)}`);
          const pd = await pr.json();
          if (pd.success && pd.token) {
            stopQrPoll();
            setAuth(pd.user, pd.token);
            addToast(t('auth.msg.login_ok'), 'success');
            onClose();
          } else if (pd.status === 'expired' || pd.status === 'invalid') {
            stopQrPoll();
            setQrLeft(0);
          }
        } catch {}
      }, 2000);
    } catch (e) {
      setQrCode('');
      setQrLeft(0);
    } finally {
      setQrBusy(false);
    }
  }, [stopQrPoll, setAuth, addToast, t, onClose]);

  // Mở modal ở tab đăng nhập → tự tạo QR; đóng modal / đổi view → dừng poll
  useEffect(() => {
    if (open && view === 'login') startQr();
    else stopQrPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view]);

  useEffect(() => {
    if (qrLeft <= 0) return undefined;
    const iv = setInterval(() => setQrLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [qrLeft]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const iv = setInterval(() => setResendIn(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [resendIn]);

  if (!open) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!agree) { setError(t('auth.agree_required')); return; }
    setError('');
    setNeedTotp(false);
    const r = await login(loginVal, password, totpCode);
    if (r.success) { addToast(t('auth.msg.login_ok'), 'success'); onClose(); }
    else if (r.code === 'TOTP_REQUIRED') { setNeedTotp(true); setError(r.error); return; }
    else if (r.code === 'EMAIL_NOT_VERIFIED') {
      if (r.email) setEmail(r.email);
      setDevCode(null);
      setError(t('auth.error.not_verified'));
      setResendIn(0);
      setView('verify');
    }
    else setError(r.error);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!agree) { setError(t('auth.agree_required')); return; }
    setError(''); setSuccess('');
    const r = await register(username, email, password);
    if (r.success) {
      setDevCode(r.devCode || null);
      setSuccess(r.emailSent ? `${t('auth.verify.sent_to')} ${email}` : (r.message || t('auth.msg.registered')));
      setResendIn(60);
      setView('verify');
    } else setError(r.error);
  };

  const handleResend = async () => {
    if (resendIn > 0 || !email) return;
    setError('');
    const r = await resendVerify(email);
    if (r.success) {
      setDevCode(r.devCode || null);
      setSuccess(r.emailSent ? `${t('auth.verify.sent_to')} ${email}` : (r.message || t('auth.msg.code_sent')));
      setResendIn(60);
    } else setError(r.error || 'Lỗi gửi lại mã');
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    const r = await verifyEmail(email, verifyCode);
    if (r.success) { addToast(t('auth.msg.verified'), 'success'); onClose(); }
    else setError(r.error);
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const r = await forgotPassword(email);
    if (r.success) {
      setResetToken(r.resetToken || '');
      setSuccess(r.message || t('auth.msg.code_sent'));
      setView('reset');
    } else setError(r.error);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    const r = await resetPassword(resetToken || verifyCode, newPassword);
    if (r.success) { addToast(t('auth.msg.reset_ok'), 'success'); setView('login'); }
    else setError(r.error);
  };

  const resetForm = () => { setError(''); setSuccess(''); };
  const gotoView = (v) => { resetForm(); setView(v); };

  const titles = {
    login: t('auth.title.login'),
    register: t('auth.title.register'),
    verify: t('auth.title.verify'),
    forgot: t('auth.title.forgot'),
    reset: t('auth.title.reset'),
  };

  const showSplit = view === 'login';

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 modal-backdrop overflow-y-auto" onClick={onClose}>
      <div
        className={`modal-panel bg-[#141419] border border-white/10 rounded-3xl shadow-2xl w-full overflow-hidden ${showSplit ? 'max-w-2xl' : 'max-w-sm'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Logo trên cùng */}
        <div className="px-6 pt-5 pb-2 relative">
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
          <div className="flex justify-center"><Logo size="sm" showSubtext={false} /></div>
          <h2 className="text-base font-black text-white text-center mt-2">{titles[view]}</h2>
          {view === 'login' && <p className="text-[11px] text-slate-500 mt-0.5 text-center">{t('auth.login.help')}</p>}
          {view === 'register' && <p className="text-[11px] text-slate-500 mt-0.5 text-center">{t('auth.register.help')}</p>}
        </div>

        {showSplit ? (
          <div className="grid sm:grid-cols-[1fr_1.15fr] gap-0 px-6 pb-6">
            {/* TRÁI: QR */}
            <div className="flex flex-col items-center justify-center py-4 sm:pr-5 sm:border-r sm:border-white/[0.07]">
              <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500 mb-3">
                <QrIcon className="w-3.5 h-3.5 text-[#ff9a3d]" /> {t('auth.tab.qr')}
              </p>
              {qrBusy && !qrCode ? (
                <div className="w-[150px] h-[150px] rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : qrCode && qrLeft > 0 ? (
                <>
                  <div className="relative bg-white p-2.5 rounded-2xl shadow-lg shadow-black/40">
                    <QRCodeSVG value={`CHRTV-QR:${qrCode}`} size={132} level="M" />
                    <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full grad-brand text-white text-[10px] font-mono font-black tracking-[0.2em] shadow-lg whitespace-nowrap">{qrCode}</span>
                  </div>
                  <p className="text-[10px] text-stone-500 mt-4">
                    {t('auth.qr.waiting')} · <span className={`font-mono font-bold ${qrLeft <= 20 ? 'text-[#ff9a3d]' : 'text-stone-200'}`}>{Math.floor(qrLeft / 60)}:{String(qrLeft % 60).padStart(2, '0')}</span>
                  </p>
                  <div className="w-[150px] h-1 rounded-full bg-white/10 overflow-hidden mt-1.5">
                    <div className="h-full bg-gradient-to-r from-[#f36f21] to-[#ff9a3d] transition-all" style={{ width: `${(qrLeft / 120) * 100}%` }}></div>
                  </div>
                </>
              ) : (
                <div className="text-center">
                  <p className="text-[11px] text-stone-400 font-semibold mb-2.5">{t('auth.qr.expired')}</p>
                  <button onClick={startQr} className="px-4 py-2 rounded-xl btn-orange text-white text-xs font-bold inline-flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> {t('auth.qr.new')}
                  </button>
                </div>
              )}
              <p className="text-[9px] text-stone-600 mt-3 leading-relaxed text-center max-w-[190px]">{t('auth.qr.hint')}</p>
            </div>

            {/* PHẢI: form email/mật khẩu */}
            <div className="py-4 sm:pl-5">
              {error && <div className="mb-3 px-3 py-2 bg-[#f36f21]/15 border border-[#f36f21]/30 rounded-xl text-[11px] text-[#ff9a3d]">{error}</div>}
              <form onSubmit={handleLogin} className="space-y-2.5">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type="text" value={loginVal} onChange={e => setLoginVal(e.target.value)} placeholder={t('auth.email_or_username')} required className={inputCls} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password')} required className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
                    {showPass ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                  </button>
                </div>
                {needTotp && (
                  <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Mã 2FA (6 số)" inputMode="numeric" required className="w-full px-3 py-2.5 bg-amber-500/5 border border-amber-500/30 rounded-xl text-sm font-mono tracking-[0.3em] text-center text-amber-200 placeholder:text-amber-700 focus:outline-none focus:border-amber-500" />
                )}
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#f36f21] shrink-0" />
                  <span className="text-[11px] text-slate-400 leading-relaxed">
                    {t('auth.agree_pre')}{' '}
                    <button type="button" onClick={() => setLegal('terms')} className="text-[#ff9a3d] hover:underline font-semibold">{t('footer.terms')}</button>
                    {' '}{t('auth.agree_and')}{' '}
                    <button type="button" onClick={() => setLegal('policy')} className="text-[#ff9a3d] hover:underline font-semibold">{t('footer.policy')}</button>
                  </span>
                </label>
                <button type="submit" disabled={loading} className="w-full py-2.5 btn-orange disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                  {loading ? t('app.loading') : <>{t('auth.btn.login')} <ArrowRight className="w-4 h-4" /></>}
                </button>
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <button type="button" onClick={() => gotoView('forgot')} className="text-[#ff9a3d] hover:text-[#ffb37a]">{t('auth.link.forgot')}</button>
                  <button type="button" onClick={() => gotoView('register')} className="text-slate-500 hover:text-white">{t('auth.link.to_register')}</button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="px-6 pb-6">
            {error && <div className="mb-3 px-3 py-2 bg-[#f36f21]/15 border border-[#f36f21]/30 rounded-xl text-[11px] text-[#ff9a3d]">{error}</div>}
            {success && <div className="mb-3 px-3 py-2 bg-emerald-600/15 border border-emerald-600/30 rounded-xl text-[11px] text-emerald-400">{success}</div>}

            {view === 'register' && (
              <form onSubmit={handleRegister} className="space-y-2.5">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('auth.username')} required className={inputCls} />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.email')} required className={inputCls} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password_hint')} required minLength={6} className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
                    {showPass ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                  </button>
                </div>
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#f36f21] shrink-0" />
                  <span className="text-[11px] text-slate-400 leading-relaxed">
                    {t('auth.agree_pre')}{' '}
                    <button type="button" onClick={() => setLegal('terms')} className="text-[#ff9a3d] hover:underline font-semibold">{t('footer.terms')}</button>
                    {' '}{t('auth.agree_and')}{' '}
                    <button type="button" onClick={() => setLegal('policy')} className="text-[#ff9a3d] hover:underline font-semibold">{t('footer.policy')}</button>
                  </span>
                </label>
                <button type="submit" disabled={loading} className="w-full py-2.5 btn-orange disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                  {loading ? t('app.loading') : <>{t('auth.btn.register')} <ArrowRight className="w-4 h-4" /></>}
                </button>
                <button type="button" onClick={() => gotoView('login')} className="w-full text-center text-[11px] text-slate-500 hover:text-white pt-1">
                  {t('auth.link.to_login')}
                </button>
              </form>
            )}

            {view === 'verify' && (
              <form onSubmit={handleVerify} className="space-y-2.5">
                <p className="text-[11px] text-slate-400 text-center">{t('auth.verify.help')}</p>
                {email && <p className="text-[11px] text-slate-300 text-center">📬 {t('auth.verify.sent_to')} <span className="text-white font-bold">{email}</span></p>}
                {devCode && (
                  <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 text-center">
                    <p className="leading-relaxed mb-1">{t('auth.msg.email_fail')}</p>
                    <p className="text-xl tracking-[0.35em] font-mono font-black text-amber-200">{devCode}</p>
                  </div>
                )}
                <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder={t('auth.verify_code')} maxLength={6} required className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white text-center tracking-[0.3em] font-mono placeholder:text-slate-600 focus:outline-none focus:border-[#f36f21]/60" />
                <button type="submit" className="w-full py-2.5 btn-orange text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" /> {t('auth.btn.verify')}
                </button>
                <div className="flex items-center justify-between text-[11px]">
                  <button type="button" onClick={handleResend} disabled={resendIn > 0 || !email} className="text-[#ff9a3d] hover:text-[#ffb37a] disabled:opacity-40 disabled:cursor-not-allowed">
                    {resendIn > 0 ? t('auth.verify.resend_in', { s: resendIn }) : `↻ ${t('auth.btn.resend')}`}
                  </button>
                  <button type="button" onClick={() => setView('login')} className="text-slate-500 hover:text-white">{t('common.back')} {t('auth.title.login')}</button>
                </div>
              </form>
            )}

            {view === 'forgot' && (
              <form onSubmit={handleForgot} className="space-y-2.5">
                <p className="text-[11px] text-slate-400 text-center">{t('auth.forgot.help')}</p>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.email')} required className={inputCls} />
                </div>
                <button type="submit" className="w-full py-2.5 btn-orange text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                  <RotateCcw className="w-4 h-4" /> {t('auth.btn.send_reset')}
                </button>
                <button type="button" onClick={() => gotoView('login')} className="w-full text-center text-[11px] text-slate-500 hover:text-white">{t('common.back')} {t('auth.title.login')}</button>
              </form>
            )}

            {view === 'reset' && (
              <form onSubmit={handleReset} className="space-y-2.5">
                <p className="text-[11px] text-slate-400 text-center">{t('auth.reset.help')}</p>
                <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder={t('auth.reset_code')} required className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white text-center font-mono placeholder:text-slate-600 focus:outline-none focus:border-[#f36f21]/60" />
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                  <input type={showPass ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('auth.new_password_hint')} required minLength={6} className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
                    {showPass ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                  </button>
                </div>
                <button type="submit" className="w-full py-2.5 btn-orange text-white font-bold text-sm rounded-xl transition-all">{t('auth.btn.reset')}</button>
              </form>
            )}
          </div>
        )}
      </div>
      {legal && <LegalModal tab={legal} onClose={() => setLegal(null)} onTab={setLegal} />}
    </div>
  );
}
