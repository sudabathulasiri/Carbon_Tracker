/**
 * context/AuthContext.jsx — Carbon Footprint Tracker
 *
 * Provides auth state (user, token) and actions (login, logout, register)
 * to the entire component tree via React Context.
 *
 * Token is persisted to localStorage under 'ct_token'.
 * User object is stored under 'ct_user' to survive page refresh without
 * an extra network request.
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { authApi } from '../services/api.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(() => {
    try {
      const stored = localStorage.getItem('ct_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ── Persist user to localStorage whenever it changes ─────────────────────
  useEffect(() => {
    if (user) {
      localStorage.setItem('ct_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('ct_user');
      localStorage.removeItem('ct_token');
    }
  }, [user]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError('');
    try {
      const res = await authApi.login({ email, password });
      localStorage.setItem('ct_token', res.data.token);
      setUser(res.data.user);
      return { success: true };
    } catch (err) {
      const msg = err.message || 'Login failed.';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async ({ name, email, password, baselineCarbon }) => {
    setLoading(true);
    setError('');
    try {
      const res = await authApi.register({ name, email, password, baselineCarbon });
      localStorage.setItem('ct_token', res.data.token);
      setUser(res.data.user);
      return { success: true };
    } catch (err) {
      const msg = err.message || 'Registration failed.';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* ignore network errors on logout */ }
    setUser(null);
  }, []);

  /**
   * refreshUser — re-fetches the latest user profile from /auth/me.
   * Call after submitting a log so XP and level stay current.
   */
  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.data.user);
    } catch {
      // Silently ignore — stale data is preferable to a broken UI
    }
  }, []);

  const clearError = useCallback(() => setError(''), []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, refreshUser, clearError }}>
      {children}
    </AuthContext.Provider>
  );
};

// Named hook for cleaner imports
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export default AuthContext;