import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (getToken()) {
      api('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
    }
    const onLogout = () => setUser(null);
    window.addEventListener('hospardo:logout', onLogout);
    return () => window.removeEventListener('hospardo:logout', onLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: u } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(token);
    setUser(u);
  }, []);

  const logout = useCallback(() => { setToken(null); setUser(null); }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
