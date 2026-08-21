import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getStorage, setStorage, removeStorage } from '../hooks/useStorage';

const AuthContext = createContext(null);
const BASE = "https://chrtv-ott.htxuan-business.workers.dev";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStorage('chrtv_user', null));
  const [token, setToken] = useState(() => getStorage('chrtv_token', ''));
  const [loading, setLoading] = useState(false);

  const setAuth = useCallback((u, t) => {
    setUser(u); setToken(t);
    setStorage('chrtv_user', u);
    setStorage('chrtv_token', t);
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
  }, [token]);

  const login = useCallback(async (loginStr, password) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginStr, password })
      });
      const data = await res.json();
      setLoading(false);
      if (data.success) {
        setAuth(data.user, data.token);
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || 'Đăng nhập thất bại' };
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
      login, logout, register, verifyEmail, forgotPassword, resetPassword, resendVerify, updateProfile, changePassword, setAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
