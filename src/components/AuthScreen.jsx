import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, RotateCcw, QrCode as QrIcon, RefreshCw, ShieldCheck, Tv, Film, Trophy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useI18n } from '../contexts/I18nContext';
import { API_BASE } from '../services/config';
import Logo from './Logo';

const inputCls = 'w-full pl-10 pr-3 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-[#f36f21] focus:ring-2 focus:ring-[#f36f21]/25 focus:bg-white/[0.07] transition-all';

export default function AuthScreen() {
  const { t } = useI18n();
  const { login, register, verifyEmail, forgotPassword, resetPassword, resendVerify, loading, setAuth } = useAuth();
  const { addToast } = useToast();
  const [view, setView] = useState('login'); // login | register | verify | forgot | reset | qr
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
  const [totpCode, setTotpCode] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [resendIn, setResendIn] = useState(0);
  const [needTotp, setNeedTotp] = useState(false);

  // ===== QR login =====
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
    setError('');
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
          } else if (pd.status === 'expired' || pd.status === 'invalid') {
            stopQrPoll();
            setQrLeft(0);
          }
        } catch {}
      }, 3000); // 3s: đủ nhanh cho QR mà không đốt hạn mức rate-limit /auth/* của IP
    } catch (e) {
      setError(t('auth.qr.error'));
    } finally {
      setQrBusy(false);
    }
  }, [stopQrPoll, setAuth, addToast, t]);

  useEffect(() => {
    if (qrLeft <= 0) return undefined;
    const iv = setInterval(() => setQrLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [qrLeft]);

  const gotoView = (v) => {
    stopQrPoll();
    setError(''); setSuccess('');
    setView(v);
    if (v === 'qr') startQr();
  };

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const iv = setInterval(() => setResendIn(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [resendIn]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setNeedTotp(false);
    const r = await login(loginVal.trim(), password, totpCode);
    if (r.success) addToast(t('auth.msg.login_ok'), 'success');
    else if (r.code === 'TOTP_REQUIRED') {
      setNeedTotp(true);
      setError(r.error);
      return;
    }
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
    setError(''); setSuccess('');
    const r = await register(username.trim(), email.trim(), password);
    if (r.success) {
      setDevCode(r.devCode || null);
      setSuccess(r.emailSent
        ? `${t('auth.verify.sent_to')} ${email}`
        : (r.message || t('auth.msg.registered')));
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
      setSuccess(r.emailSent
        ? `${t('auth.verify.sent_to')} ${email}`
        : (r.message || t('auth.msg.code_sent')));
      setResendIn(60);
    } else setError(r.error || t('auth.msg.code_fail'));
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    const r = await verifyEmail(email, verifyCode);
    if (r.success) {
      addToast(t('auth.msg.verified'), 'success');
      setView('login');
    } else setError(r.error);
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const r = await forgotPassword(email);
    if (r.success) {
      setResetToken(r.resetToken || '');
      setSuccess(t('auth.msg.code_sent'));
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

  const titles = {
    login: t('auth.title.login'),
    register: t('auth.title.register'),
    verify: t('auth.title.verify'),
    forgot: t('auth.title.forgot'),
    reset: t('auth.title.reset'),
    qr: t('auth.tab.qr'),
  };

  const mainTab = view === 'register' ? 'register' : view === 'qr' ? 'qr' : 'login';

  return (
    <div className="fixed inset-0 z-[200] bg-black overflow-y-auto anim-zoom-fade">
      {/* Cinematic backdrop */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=1920)' }}></div>
        <div className="absolute inset-0 bg-black/55"></div>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(115deg, rgba(10,8,6,.92) 0%, rgba(10,8,6,.55) 45%, rgba(20,10,4,.75) 100%)' }}></div>
        <div className="absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full blur-3xl opacity-25" style={{ background: 'radial-gradient(circle,#f36f21,transparent 70%)' }}></div>
        <div className="absolute -bottom-40 -left-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-20" style={{ background: 'radial-gradient(circle,#7c2d12,transparent 70%)' }}></div>
      </div>

      <div className="relative min-h-full flex items-center justify-center p-4 py-10">
        <div className="w-full max-w-4xl grid md:grid-cols-[1fr_1.1fr] rounded-3xl overflow-hidden border border-white/10 shadow-2xl shadow-black/60 bg-[#0b0b0e]/80 backdrop-blur-2xl">
          {/* ===== LEFT: hero ===== */}
          <div className="hidden md:flex flex-col justify-between p-8 relative overflow-hidden" style={{ background: 'linear-gradient(160deg,#160b05 0%,#2a1206 45%,#0b0b0e 100%)' }}>
            <div className="absolute inset-0 opacity-25 bg-cover bg-center" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=800)' }}></div>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(11,11,14,.25) 0%, rgba(11,11,14,.88) 100%)' }}></div>
            <div className="relative">
              <Logo size="md" showSubtext={false} />
              <div className="mt-8">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest text-white grad-brand px-3 py-1.5 rounded-full shadow-lg shadow-[#f36f21]/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                  {t('app.live_now')}
                </span>
                <h2 className="text-3xl font-black text-white leading-tight mt-4">{t('auth.hero.title')}</h2>
                <p className="text-[13px] text-stone-400 mt-2 leading-relaxed">{t('auth.hero.sub')}</p>
              </div>
            </div>
            <div className="relative space-y-3 mt-8">
              {[
                { icon: Tv, text: t('auth.hero.f1') },
                { icon: Film, text: t('auth.hero.f2') },
                { icon: Trophy, text: t('auth.hero.f3') },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3">
                  <span className="w-9 h-9 rounded-xl grad-brand flex items-center justify-center shrink-0 shadow-lg shadow-[#f36f21]/30">
                    <f.icon className="w-4 h-4 text-white" />
                  </span>
                  <span className="text-[12px] font-semibold text-stone-200">{f.text}</span>
                </div>
              ))}
              <p className="flex items-center gap-1.5 text-[10px] text-stone-500 pt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> {t('auth.hero.secure')}
              </p>
            </div>
          </div>

          {/* ===== RIGHT: form ===== */}
          <div className="p-6 sm:p-8">
            <div className="md:hidden mb-5"><Logo size="sm" showSubtext={false} className="justify-center" /></div>

            {/* Tabs */}
            <div className="flex bg-white/5 rounded-2xl p-1 mb-6 border border-white/10">
              {[
                { v: 'login', label: t('auth.title.login') },
                { v: 'register', label: t('auth.title.register') },
                { v: 'qr', label: t('auth.tab.qr'), icon: true },
              ].map(tb => (
                <button
                  key={tb.v}
                  onClick={() => gotoView(tb.v)}
                  className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${mainTab === tb.v ? 'grad-brand text-white shadow-lg shadow-[#f36f21]/30' : 'text-stone-400 hover:text-white'}`}
                >
                  {tb.icon && <QrIcon className="w-3.5 h-3.5" />}{tb.label}
                </button>
              ))}
            </div>

            <h1 className="text-[22px] font-black tracking-tight text-white mb-1">{titles[view]}</h1>
            {view !== 'qr' && view !== 'verify' && (
              <p className="text-xs text-stone-400 mb-5">
                {view === 'login' && t('auth.login.help')}
                {view === 'register' && t('auth.register.help')}
                {view === 'forgot' && t('auth.forgot.help')}
                {view === 'reset' && t('auth.reset.help')}
              </p>
            )}
            {view === 'verify' && (
              <p className="text-xs text-stone-400 mb-5">{t('auth.verify.help')}{email && <> — <span className="text-white font-bold">{email}</span></>}</p>
            )}

            {error && <div className="mb-3 px-3.5 py-2.5 bg-[#f36f21]/12 border border-[#f36f21]/30 rounded-2xl text-xs text-[#ff9a3d] leading-relaxed">{error}</div>}
            {success && <div className="mb-3 px-3.5 py-2.5 bg-emerald-600/12 border border-emerald-600/30 rounded-2xl text-xs text-emerald-400 leading-relaxed">{success}</div>}

            {/* Login form */}
            {view === 'login' && (
              <form onSubmit={handleLogin} className="space-y-3">
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                  <input type="text" value={loginVal} onChange={e => setLoginVal(e.target.value)} placeholder={t('auth.email_or_username')} required autoComplete="username" className={inputCls} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password')} required autoComplete="current-password" className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 hover:text-stone-200">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {needTotp && (
                  <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('auth.totp_hint')} inputMode="numeric" required className="w-full px-3 py-3 bg-amber-500/5 border border-amber-500/30 rounded-2xl text-sm font-mono tracking-[0.3em] text-center text-amber-200 placeholder:text-amber-700 focus:outline-none focus:border-amber-500" />
                )}
                <div className="flex items-center justify-end text-[11px]">
                  <button type="button" onClick={() => gotoView('forgot')} className="text-[#ff9a3d] hover:text-[#ffb37a] font-semibold">{t('auth.link.forgot')}</button>
                </div>
                <button type="submit" disabled={loading} className="w-full py-3.5 btn-orange text-white font-bold text-sm rounded-2xl shadow-xl shadow-[#f36f21]/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? t('app.loading') : <>{t('auth.btn.login')} <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}

            {/* Register form */}
            {view === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('auth.username')} required maxLength={20} autoComplete="username" className={inputCls} />
                </div>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.email')} required autoComplete="email" className={inputCls} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                  <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password_hint')} required minLength={6} autoComplete="new-password" className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 hover:text-stone-200">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button type="submit" disabled={loading} className="w-full py-3.5 btn-orange text-white font-bold text-sm rounded-2xl shadow-xl shadow-[#f36f21]/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                  {loading ? t('app.loading') : <>{t('auth.btn.register')} <ArrowRight className="w-4 h-4" /></>}
                </button>
                <p className="text-[10px] text-stone-500 leading-relaxed text-center pt-1">
                  {t('auth.terms_label')} <span className="text-stone-300 underline cursor-pointer">{t('auth.terms_link')}</span>
                </p>
              </form>
            )}

            {/* QR login */}
            {view === 'qr' && (
              <div className="text-center">
                <p className="text-xs text-stone-400 mb-4 leading-relaxed">{t('auth.qr.help')}</p>
                {qrBusy && !qrCode ? (
                  <div className="py-10">
                    <div className="w-10 h-10 mx-auto border-[3px] border-[#f36f21] border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs text-stone-500 mt-3">{t('app.loading')}</p>
                  </div>
                ) : qrCode && qrLeft > 0 ? (
                  <>
                    <div className="inline-block bg-white p-4 rounded-3xl shadow-2xl shadow-[#f36f21]/20 relative">
                      <QRCodeSVG value={`CHRTV-QR:${qrCode}`} size={180} level="M" />
                      <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full grad-brand text-white text-[11px] font-mono font-black tracking-[0.25em] shadow-lg whitespace-nowrap">{qrCode}</span>
                    </div>
                    <p className="text-[11px] text-stone-400 mt-6">
                      {t('auth.qr.waiting')} · <span className={`font-mono font-bold ${qrLeft <= 20 ? 'text-[#ff9a3d]' : 'text-stone-200'}`}>{Math.floor(qrLeft / 60)}:{String(qrLeft % 60).padStart(2, '0')}</span>
                    </p>
                    <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden max-w-[220px] mx-auto">
                      <div className="h-full bg-gradient-to-r from-[#f36f21] to-[#ff9a3d] transition-all" style={{ width: `${(qrLeft / 120) * 100}%` }}></div>
                    </div>
                  </>
                ) : (
                  <div className="py-6">
                    <p className="text-sm text-stone-300 font-semibold mb-4">{t('auth.qr.expired')}</p>
                    <button onClick={startQr} className="inline-flex items-center gap-2 px-6 py-3 btn-orange text-white text-sm font-bold rounded-2xl">
                      <RefreshCw className="w-4 h-4" /> {t('auth.qr.new')}
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-stone-600 mt-5 leading-relaxed">{t('auth.qr.hint')}</p>
              </div>
            )}

            {/* Forgot */}
            {view === 'forgot' && (
              <form onSubmit={handleForgot} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.email')} required className={inputCls} />
                </div>
                <button type="submit" className="w-full py-3.5 btn-orange text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2">
                  <RotateCcw className="w-4 h-4" /> {t('auth.btn.send_reset')}
                </button>
                <button type="button" onClick={() => gotoView('login')} className="w-full text-xs text-stone-500 hover:text-white">{t('common.back')} {t('auth.title.login')}</button>
              </form>
            )}

            {/* Reset */}
            {view === 'reset' && (
              <form onSubmit={handleReset} className="space-y-3">
                <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder={t('auth.reset_code')} required className="w-full px-3 py-3 bg-white/5 border border-white/10 rounded-2xl text-sm text-white text-center font-mono placeholder:text-stone-500 focus:outline-none focus:border-[#f36f21]" />
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                  <input type={showPass ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('auth.new_password_hint')} required minLength={6} className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-stone-500 hover:text-stone-200">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button type="submit" className="w-full py-3.5 btn-orange text-white font-bold text-sm rounded-2xl">{t('auth.btn.reset')}</button>
              </form>
            )}

            {/* Verify */}
            {view === 'verify' && (
              <form onSubmit={handleVerify} className="space-y-3">
                {devCode && (
                  <div className="px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-300">
                    <p className="mb-1.5 leading-relaxed">{t('auth.msg.email_fail')}</p>
                    <p className="text-center text-2xl tracking-[0.4em] font-mono font-black text-amber-200">{devCode}</p>
                  </div>
                )}
                {(!error && !success && !email) && (
                  <input type="email" placeholder={t('auth.email')} onChange={e => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-[#f36f21]" />
                )}
                <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="000000" maxLength={6} className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 text-2xl tracking-[0.5em] font-mono text-center text-white focus:outline-none focus:border-[#f36f21]" />
                <button type="submit" className="w-full py-3.5 btn-orange text-white font-bold text-sm rounded-2xl">{t('auth.btn.verify')}</button>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={handleResend} disabled={resendIn > 0 || !email} className="text-xs text-[#ff9a3d] hover:text-[#ffb37a] disabled:opacity-40 disabled:cursor-not-allowed font-semibold">
                    {resendIn > 0 ? t('auth.verify.resend_in', { s: resendIn }) : `↻ ${t('auth.btn.resend')}`}
                  </button>
                  <button type="button" onClick={() => gotoView('login')} className="text-xs text-stone-500 hover:text-white">{t('common.back')} {t('auth.title.login')}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
