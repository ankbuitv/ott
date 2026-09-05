import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff, Check, ArrowRight, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useI18n } from '../contexts/I18nContext';

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
  const [devCode, setDevCode] = useState(null); // chỉ có khi server chưa gửi được email
  const [resendIn, setResendIn] = useState(0);
  const [needTotp, setNeedTotp] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  const { login, register, verifyEmail, forgotPassword, resetPassword, resendVerify, loading } = useAuth();
  const { addToast } = useToast();

  // Cooldown "gửi lại mã"
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const iv = setInterval(() => setResendIn(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(iv);
  }, [resendIn]);

  if (!open) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
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

  const titles = {
    login: t('auth.title.login'),
    register: t('auth.title.register'),
    verify: t('auth.title.verify'),
    forgot: t('auth.title.forgot'),
    reset: t('auth.title.reset'),
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#1a1c24] border border-slate-800/60 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 pt-5 pb-3 text-center relative">
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
          <div className="w-12 h-12 bg-red-600/15 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <span className="text-red-500 font-extrabold text-lg">C</span>
          </div>
          <h2 className="text-lg font-extrabold text-white">{titles[view]}</h2>
          {view === 'login' && <p className="text-[11px] text-slate-500 mt-1">{t('auth.login.help')}</p>}
          {view === 'register' && <p className="text-[11px] text-slate-500 mt-1">{t('auth.register.help')}</p>}
        </div>

        <div className="px-5 pb-5">
          {error && <div className="mb-3 px-3 py-2 bg-red-600/15 border border-red-600/30 rounded-xl text-[11px] text-red-400">{error}</div>}
          {success && <div className="mb-3 px-3 py-2 bg-emerald-600/15 border border-emerald-600/30 rounded-xl text-[11px] text-emerald-400">{success}</div>}

          {/* Login Form */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-2.5">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type="text" value={loginVal} onChange={e => setLoginVal(e.target.value)} placeholder={t('auth.email_or_username')} required className="w-full pl-10 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password')} required className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
                  {showPass ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                </button>
              </div>
              {needTotp && (
                <input type="text" value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Mã 2FA (6 số)" inputMode="numeric" required className="w-full px-3 py-2.5 bg-amber-500/5 border border-amber-500/30 rounded-xl text-sm font-mono tracking-[0.3em] text-center text-amber-200 placeholder:text-amber-700 focus:outline-none focus:border-amber-500" />
              )}
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                {loading ? t('app.loading') : <>{t('auth.btn.login')} <ArrowRight className="w-4 h-4" /></>}
              </button>
              <div className="flex items-center justify-between text-[11px] pt-1">
                <button type="button" onClick={() => { setView('forgot'); resetForm(); }} className="text-red-400 hover:text-red-300">{t('auth.link.forgot')}</button>
                <button type="button" onClick={() => { setView('register'); resetForm(); }} className="text-slate-500 hover:text-white">{t('auth.link.to_register')}</button>
              </div>
            </form>
          )}

          {/* Register Form */}
          {view === 'register' && (
            <form onSubmit={handleRegister} className="space-y-2.5">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('auth.username')} required className="w-full pl-10 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.email')} required className="w-full pl-10 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password_hint')} required minLength={6} className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
                  {showPass ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                </button>
              </div>
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                {loading ? t('app.loading') : <>{t('auth.btn.register')} <ArrowRight className="w-4 h-4" /></>}
              </button>
              <button type="button" onClick={() => { setView('login'); resetForm(); }} className="w-full text-center text-[11px] text-slate-500 hover:text-white pt-1">
                {t('auth.link.to_login')}
              </button>
            </form>
          )}

          {/* Verify Email */}
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
              <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder={t('auth.verify_code')} maxLength={6} required className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white text-center tracking-[0.3em] font-mono placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              <button type="submit" className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" /> {t('auth.btn.verify')}
              </button>
              <div className="flex items-center justify-between text-[11px]">
                <button type="button" onClick={handleResend} disabled={resendIn > 0 || !email} className="text-red-400 hover:text-red-300 disabled:opacity-40 disabled:cursor-not-allowed">
                  {resendIn > 0 ? t('auth.verify.resend_in', { s: resendIn }) : `↻ ${t('auth.btn.resend')}`}
                </button>
                <button type="button" onClick={() => setView('login')} className="text-slate-500 hover:text-white">{t('common.back')} {t('auth.title.login')}</button>
              </div>
            </form>
          )}

          {/* Forgot Password */}
          {view === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-2.5">
              <p className="text-[11px] text-slate-400 text-center">{t('auth.forgot.help')}</p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.email')} required className="w-full pl-10 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              </div>
              <button type="submit" className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                <RotateCcw className="w-4 h-4" /> {t('auth.btn.send_reset')}
              </button>
              <button type="button" onClick={() => { setView('login'); resetForm(); }} className="w-full text-center text-[11px] text-slate-500 hover:text-white">{t('common.back')} {t('auth.title.login')}</button>
            </form>
          )}

          {/* Reset Password */}
          {view === 'reset' && (
            <form onSubmit={handleReset} className="space-y-2.5">
              <p className="text-[11px] text-slate-400 text-center">{t('auth.reset.help')}</p>
              <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder={t('auth.reset_code')} required className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white text-center font-mono placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type={showPass ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('auth.new_password_hint')} required minLength={6} className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
                  {showPass ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                </button>
              </div>
              <button type="submit" className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all">{t('auth.btn.reset')}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}