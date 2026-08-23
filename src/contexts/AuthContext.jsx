import React, { createContext, useContext, useState, useEffect } from 'react';
const AuthContext = createContext({ user: null, isAuthenticated: false, token: null });
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const isAuthenticated = !!user;
  useEffect(() => {
    try {
      const raw = localStorage.getItem('chrtv_user');
      if (raw) { setUser(JSON.parse(raw)); }
      else {
        const du = { id:1, username:'demo', email:'demo@chrtv.app' };
        localStorage.setItem('chrtv_user', JSON.stringify(du));
        setUser(du);
      }
    } catch {}
  }, []);
  return <AuthContext.Provider value={{ user, isAuthenticated, token, setUser, setToken }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);