import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getStorage, setStorage, removeStorage } from '../hooks/useStorage';
import { API_BASE } from '../services/config';
import { onAuthChanged } from '../services/session';

const AuthContext = createContext(null);
const BASE = API_BASE;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStorage('chrtv_user', null));
  const [token, setToken] = useState(() => getStorage('chrtv_token', ''));
  const [loading, setLoading] = useState(false);
  const planFetchedRef = useRef('');

  const setAuth = useCallback((u, t) => {
    setUser(u); setToken(t);
    setStorage('chrtv_user', u);
    setStorage('chrtv_token', t);
    try { onAuthChanged(); } catch {}
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${BASE}/user/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch {}
    setUser(null); setToken('');
    removeStorage('chrtv_user');
    removeStorage('chrtv_token');
    try { localStorage.removeItem('chrtv_profile'); } catch {}
    try { onAuthChanged(); } catch {}
  }, [token]);

  // Đồng bộ gói cước từ server (fix lỗi: đăng nhập lại mất plan VIP -> báo cần gói cao hơn)
  const refreshPlan = useCallback(async (tok) => {
    const t = tok !== undefined ? tok : getStorage('chrtv_token', '');
    if (!t) return null;
    try {
      const res = await fetch(`${BASE}/user/plan`, { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) return null;
      const j = await res.json();
      if (j && j.success && typeof j.current === 'string') {
        const plan = (j.current || '').toLowerCase() || 'standard';
        setUser((prev) => {
          if (!prev) return prev;
          if ((prev.plan || '') === plan) return prev;
          const next = { ...prev, plan };
          setStorage('chrtv_user', next);
          return next;
        });
        return plan;
      }
    } catch {}
    return null;
  }, []);

  // Tự sync plan khi có token (mở app / đăng nhập xong)
  useEffect(() => {
    if (token && planFetchedRef.current !== token) {
      planFetchedRef.current = token;
      refreshPlan(token);
    }
    if (!token) planFetchedRef.current = '';
  }, [token, refreshPlan]);

  const login = useCallback(async (loginStr, password, totp) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginStr, password, totp: totp || undefined })
      });
      const data = await res.json();
      setLoading(false);
      if (data.success) {
        // Server đã trả plan trong user (worker mới); nếu chưa có thì fetch riêng
        let u = data.user || null;
        setAuth(u, data.token);
        if (u && !u.plan) {
          try {
            const pr = await fetch(`${BASE}/user/plan`, { headers: { Authorization: `Bearer ${data.token}` } });
            if (pr.ok) {
              const pj = await pr.json();
              if (pj && pj.success && typeof pj.current === 'string') {
                u = { ...u, plan: (pj.current || '').toLowerCase() || 'standard' };
                setAuth(u, data.token);
              }
            }
          } catch {}
        }
        return { success: true, user: u };
      }
      // code === 'EMAIL_NOT_VERIFIED' → UI chuyển sang màn xác minh + gửi lại mã
      return { success: false, error: data.error || 'Đăng nhập thất bại', code: data.code, email: data.email };
    } catch (e) {
      setLoading(false);
      return { success: false, error: 'Lỗi kết nối server' };
    }
  }, [setAuth]);

  const register = useCallback(async (username, email, password) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      setLoading(false);
      return { ...data };
    } catch (e) {
      setLoading(false);
      return { success: false, error: 'Lỗi kết nối' };
    }
  }, []);

  const verifyEmail = useCallback(async (email, code) => {
    const res = await fetch(`${BASE}/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    return await res.json();
  }, []);

  const forgotPassword = useCallback(async (email) => {
    const res = await fetch(`${BASE}/auth/forgot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await res.json();
  }, []);

  const resetPassword = useCallback(async (token, newPassword) => {
    const res = await fetch(`${BASE}/auth/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    return await res.json();
  }, []);

  const resendVerify = useCallback(async (email) => {
    const res = await fetch(`${BASE}/auth/resend-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    return await res.json();
  }, []);

  const updateProfile = useCallback(async (data) => {
    try {
      const res = await fetch(`${BASE}/user/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(data)
      });
      const r = await res.json();
      if (r.success) setUser(prev => ({ ...prev, ...data }));
      return r;
    } catch (e) { return { success: false }; }
  }, [token]);

  const changePassword = useCallback(async (oldPassword, newPassword) => {
    const res = await fetch(`${BASE}/user/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ oldPassword, newPassword })
    });
    return await res.json();
  }, [token]);

  return (
    <AuthContext.Provider value={{
      user, token, loading, isAuthenticated: !!token && !!user,
      login, logout, register, verifyEmail, forgotPassword, resetPassword, resendVerify, updateProfile, changePassword, setAuth, refreshPlan,
      effectivePlan: (user?.plan || 'standard').toLowerCase() || 'standard',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
