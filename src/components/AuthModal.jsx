import React, { useState } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff, Check, ArrowRight, RotateCcw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function AuthModal({ open, onClose, initialView = 'login' }) {
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

  const { login, register, verifyEmail, forgotPassword, resetPassword, loading } = useAuth();
  const { addToast } = useToast();

  if (!open) return null;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    const r = await login(loginVal, password);
    if (r.success) { addToast('Đăng nhập thành công!', 'success'); onClose(); }
    else setError(r.error);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const r = await register(username, email, password);
    if (r.success) {
      setSuccess(r.message || 'Đăng ký thành công! Nhập mã xác minh từ email.');
      if (r.verifyCode) setSuccess(`Mã xác minh: ${r.verifyCode}`);
      setView('verify');
    } else setError(r.error);
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    const r = await verifyEmail(email, verifyCode);
    if (r.success) { addToast('Xác minh email thành công!', 'success'); onClose(); }
    else setError(r.error);
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    const r = await forgotPassword(email);
    if (r.success) {
      setResetToken(r.resetToken || '');
      setSuccess(r.message || 'Đã gửi mã đặt lại');
      setView('reset');
    } else setError(r.error);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    const r = await resetPassword(resetToken || verifyCode, newPassword);
    if (r.success) { addToast('Đặt lại thành công!', 'success'); setView('login'); }
    else setError(r.error);
  };

  const resetForm = () => { setError(''); setSuccess(''); };

  const titles = { login: 'Đăng Nhập', register: 'Đăng Ký', verify: 'Xác Minh Email', forgot: 'Quên Mật Khẩu', reset: 'Đặt Lại Mật Khẩu' };

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
          {view === 'login' && <p className="text-[11px] text-slate-500 mt-1">Đăng nhập để đồng bộ dữ liệu</p>}
          {view === 'register' && <p className="text-[11px] text-slate-500 mt-1">Tạo tài khoản mới miễn phí</p>}
        </div>

        <div className="px-5 pb-5">
          {error && <div className="mb-3 px-3 py-2 bg-red-600/15 border border-red-600/30 rounded-xl text-[11px] text-red-400">{error}</div>}
          {success && <div className="mb-3 px-3 py-2 bg-emerald-600/15 border border-emerald-600/30 rounded-xl text-[11px] text-emerald-400">{success}</div>}

          {/* Login Form */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-2.5">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type="text" value={loginVal} onChange={e => setLoginVal(e.target.value)} placeholder="Email hoặc Username" required className="w-full pl-10 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mật khẩu" required className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
                  {showPass ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                </button>
              </div>
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                {loading ? 'Đang đăng nhập...' : <>Đăng nhập <ArrowRight className="w-4 h-4" /></>}
              </button>
              <div className="flex items-center justify-between text-[11px] pt-1">
                <button type="button" onClick={() => { setView('forgot'); resetForm(); }} className="text-red-400 hover:text-red-300">Quên mật khẩu?</button>
                <button type="button" onClick={() => { setView('register'); resetForm(); }} className="text-slate-500 hover:text-white">Đăng ký mới</button>
              </div>
            </form>
          )}

          {/* Register Form */}
          {view === 'register' && (
            <form onSubmit={handleRegister} className="space-y-2.5">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Tên hiển thị" required className="w-full pl-10 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className="w-full pl-10 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mật khẩu (≥6 ký tự)" required minLength={6} className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
                  {showPass ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                </button>
              </div>
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                {loading ? 'Đang tạo...' : <>Đăng ký <ArrowRight className="w-4 h-4" /></>}
              </button>
              <button type="button" onClick={() => { setView('login'); resetForm(); }} className="w-full text-center text-[11px] text-slate-500 hover:text-white pt-1">
                Đã có tài khoản? <span className="text-red-400">Đăng nhập</span>
              </button>
            </form>
          )}

          {/* Verify Email */}
          {view === 'verify' && (
            <form onSubmit={handleVerify} className="space-y-2.5">
              <p className="text-[11px] text-slate-400 text-center">Nhập mã 6 số đã gửi đến email</p>
              <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="Mã xác minh (6 số)" maxLength={6} required className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white text-center tracking-[0.3em] font-mono placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              <button type="submit" className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                <Check className="w-4 h-4" /> Xác minh
              </button>
              <button type="button" onClick={() => setView('login')} className="w-full text-center text-[11px] text-slate-500 hover:text-white">Quay lại đăng nhập</button>
            </form>
          )}

          {/* Forgot Password */}
          {view === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-2.5">
              <p className="text-[11px] text-slate-400 text-center">Nhập email để nhận mã đặt lại mật khẩu</p>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" required className="w-full pl-10 pr-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              </div>
              <button type="submit" className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5">
                <RotateCcw className="w-4 h-4" /> Gửi mã
              </button>
              <button type="button" onClick={() => { setView('login'); resetForm(); }} className="w-full text-center text-[11px] text-slate-500 hover:text-white">Quay lại đăng nhập</button>
            </form>
          )}

          {/* Reset Password */}
          {view === 'reset' && (
            <form onSubmit={handleReset} className="space-y-2.5">
              <p className="text-[11px] text-slate-400 text-center">Nhập mã và mật khẩu mới</p>
              <input type="text" value={verifyCode} onChange={e => setVerifyCode(e.target.value)} placeholder="Mã đặt lại" required className="w-full px-3 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white text-center font-mono placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input type={showPass ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mật khẩu mới (≥6)" required minLength={6} className="w-full pl-10 pr-10 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-red-600/60" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5">
                  {showPass ? <EyeOff className="w-4 h-4 text-slate-600" /> : <Eye className="w-4 h-4 text-slate-600" />}
                </button>
              </div>
              <button type="submit" className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all">Đặt lại</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
