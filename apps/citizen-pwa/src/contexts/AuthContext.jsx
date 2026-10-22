// Auth context — exposes { user, login, register, logout, refresh }.
// On mount, attempts to refresh the user from stored tokens.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, storage } from '../lib/apiClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => storage.getUser());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = storage.getAccess();
    if (!token) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const me = await api.get('/me');
      setUser(me);
      storage.setSession({ user: me });
      return me;
    } catch {
      storage.clear();
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async ({ identifier, password }) => {
    const data = await api.post('/auth/login', { identifier, password }, { skipAuth: true });
    storage.setSession(data);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api.post('/auth/register', payload, { skipAuth: true });
    storage.setSession(data);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    storage.clear();
    setUser(null);
  }, []);

  const value = { user, loading, login, register, logout, refresh };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
