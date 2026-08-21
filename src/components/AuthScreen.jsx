import React, { useState } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff, Check, ArrowRight, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useI18n } from '../contexts/I18nContext';
import Logo from './Logo';

export default function AuthScreen() {
  const { t } = useI18n();
  const { login, register, verifyEmail, forgotPassword, resetPassword, loading } = useAuth();
  const { addToast } = useToast();
  const [view, setView] = useState('login'); // login | register | verify | forgot | reset
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const r = await login(loginVal, password);
    if (r.success) addToast(t('auth.msg.login_ok'), 'success');
    else setError(r.error);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const r = await register(username, email, password);
    if (r.success) {
      setSuccess(t('auth.msg.registered'));
      if (r.verifyCode) setSuccess(t('auth.msg.verify_code_label') + r.verifyCode);
      setView('verify');
    } else setError(r.error);
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
  };

  // Single-form returns
  if (view === 'verify') {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center p-4">
        {/* Backdrop image */}
        <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1920)' }}></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/30"></div>
        <div className="relative w-full max-w-md">
          <Logo size="lg" className="mb-8 justify-center" />
          <div className="bg-black/70 backdrop-blur-md border border-white/10 rounded-2xl p-6">
            <h1 className="text-2xl font-black mb-1">{t('auth.title.verify')}</h1>
            <p className="text-xs text-stone-400 mb-5">{t('auth.verify.help')}</p>
            <form onSubmit={handleVerify} className="space-y-3">
              {error && <div className="px-3 py-2 bg-red-600/15 border border-red-600/30 rounded-xl text-xs text-red-400">{error}</div>}
              {success && <div className="px-3 py-2 bg-emerald-600/15 border border-emerald-600/30 rounded-xl text-xs text-emerald-400">{success}</div>}
              {(!error && !success && !email) && (
                <input type="email" placeholder={t('auth.email')} onChange={e => setEmail(e.target.value)} className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500" />
              )}
              <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="000000" maxLength={6} className="w-full bg-white/10 border border-white/15 rounded-lg px-3 py-3 text-2xl tracking-[0.5em] font-mono text-center text-white focus:outline-none focus:border-red-500" />
              <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg">{t('auth.btn.verify')}</button>
              <button type="button" onClick={() => setView('login')} className="w-full text-xs text-stone-500 hover:text-white">{t('common.back')} {t('auth.title.login')}</button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black flex items-center justify-center p-4 overflow-hidden">
      {/* Cinematic backdrop */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=1920)' }}></div>
        <div className="absolute inset-0 bg-black/60"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
      </div>

      {/* Decorative gradients */}
      <div className="absolute top-20 right-20 w-[500px] h-[500px] bg-gradient-to-bl from-red-900/30 via-purple-900/20 to-transparent rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-20 left-20 w-[400px] h-[400px] bg-gradient-to-tr from-rose-900/30 to-transparent rounded-full blur-3xl pointer-events-none"></div>

      {/* Card */}
      <div className="relative w-full max-w-md">
        <Logo size="lg" className="mb-6 justify-center" />

        <div className="bg-black/75 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl shadow-black/50">
          {/* Tab switcher */}
          <div className="flex bg-white/5 rounded-xl p-0.5 mb-5 border border-white/10">
            <button
              onClick={() => { setView('login'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${view === 'login' || view === 'forgot' || view === 'reset' ? 'bg-white text-black' : 'text-stone-400 hover:text-white'}`}
            >
              {t('auth.title.login')}
            </button>
            <button
              onClick={() => { setView('register'); setError(''); setSuccess(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${view === 'register' ? 'bg-white text-black' : 'text-stone-400 hover:text-white'}`}
            >
              {t('auth.title.register')}
            </button>
          </div>

          <h1 className="text-2xl font-black tracking-tight mb-1">{titles[view]}</h1>

          {/* Login */}
          {(view === 'login' || view === 'forgot' || view === 'reset') && view !== 'register' && view !== 'verify' && (
            <p className="text-xs text-stone-400 mb-5">
              {view === 'login' && t('auth.login.help')}
              {view === 'forgot' && t('auth.forgot.help')}
              {view === 'reset' && t('auth.reset.help')}
            </p>
          )}
          {view === 'register' && (
            <p className="text-xs text-stone-400 mb-5">{t('auth.register.help')}</p>
          )}

          {error && <div className="mb-3 px-3 py-2 bg-red-600/15 border border-red-600/30 rounded-xl text-xs text-red-400">{error}</div>}
          {success && <div className="mb-3 px-3 py-2 bg-emerald-600/15 border border-emerald-600/30 rounded-xl text-xs text-emerald-400">{success}</div>}

          {/* Login form */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input type="text" value={loginVal} onChange={e => setLoginVal(e.target.value)} placeholder={t('auth.email_or_username')} required className="w-full pl-10 pr-3 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500 focus:bg-white/10 transition-colors" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password')} required className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500 focus:bg-white/10 transition-colors" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-500 hover:text-stone-300">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <button type="button" onClick={() => { setView('forgot'); setError(''); setSuccess(''); }} className="text-red-400 hover:text-red-300">{t('auth.link.forgot')}</button>
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 mt-2">
                {loading ? t('app.loading')} : <>{t('auth.btn.login')} <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          {/* Register form */}
          {view === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder={t('auth.username')} required maxLength={20} className="w-full pl-10 pr-3 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500 focus:bg-white/10" />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.email')} required className="w-full pl-10 pr-3 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500 focus:bg-white/10" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.password_hint')} required minLength={6} className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500 focus:bg-white/10" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-500 hover:text-stone-300">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button type="submit" disabled={loading} className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 mt-2">
                {loading ? t('app.loading')} : <>{t('auth.btn.register')} <ArrowRight className="w-4 h-4" /></>}
              </button>
              <p className="text-[10px] text-stone-500 leading-relaxed text-center pt-2">
                {t('auth.terms_label')} <a className="text-stone-300 underline">{t('auth.terms_link')}</a>
              </p>
            </form>
          )}

          {/* Forgot */}
          {view === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t('auth.email')} required className="w-full pl-10 pr-3 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500" />
              </div>
              <button type="submit" className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2">
                <RotateCcw className="w-4 h-4" /> {t('auth.btn.send_reset')}
              </button>
              <button type="button" onClick={() => { setView('login'); setError(''); setSuccess(''); }} className="w-full text-xs text-stone-500 hover:text-white">{t('common.back')} {t('auth.title.login')}</button>
            </form>
          )}

          {/* Reset */}
          {view === 'reset' && (
            <form onSubmit={handleReset} className="space-y-3">
              <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder={t('auth.reset_code')} required className="w-full px-3 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white text-center font-mono placeholder:text-stone-500 focus:outline-none focus:border-red-500" />
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input type={showPass ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={t('auth.new_password_hint')} required minLength={6} className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-stone-500 focus:outline-none focus:border-red-500" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-500 hover:text-stone-300">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button type="submit" className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl">{t('auth.btn.reset')}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
