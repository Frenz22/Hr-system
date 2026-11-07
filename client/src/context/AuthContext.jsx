import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, { setAccessToken } from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session on first load (refresh cookie -> new access token).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        if (!cancelled) {
          setAccessToken(data.accessToken);
          setUser(data.user);
        }
      } catch {
        if (!cancelled) setAccessToken(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onForcedLogout = () => setUser(null);
    window.addEventListener('hr:logout', onForcedLogout);
    return () => window.removeEventListener('hr:logout', onForcedLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Session already invalid - clear local state regardless.
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const updateSession = useCallback(({ accessToken, user: nextUser }) => {
    setAccessToken(accessToken);
    setUser(nextUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// HR staff work in the admin console; only employees land in the self-service
// portal. Keeping this in one place means the guards and the login redirect
// cannot disagree.
export const ADMIN_ROLES = ['admin', 'hr_staff'];

export function isAdminRole(user) {
  return ADMIN_ROLES.includes(user?.role);
}

export function homePathFor(user) {
  return isAdminRole(user) ? '/admin' : '/app';
}
