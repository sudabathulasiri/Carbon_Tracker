/**
 * services/api.js — Carbon Footprint Tracker
 *
 * Thin wrapper around fetch() that:
 *   - Prefixes all requests with the API base URL
 *   - Attaches the Authorization header from localStorage
 *   - Normalises successful and error responses into a consistent shape
 *   - Handles 401s by clearing auth state (token expiry)
 */

'use strict';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// ─── Core request helper ──────────────────────────────────────────────────────

const request = async (path, options = {}) => {
  const token = localStorage.getItem('ct_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include', // Send cookies across origins (for HttpOnly refresh tokens)
  });

  if (res.status === 401 && path !== '/auth/login' && path !== '/auth/register') {
    localStorage.removeItem('ct_token');
    localStorage.removeItem('ct_user');
    if (!window.location.pathname.startsWith('/auth')) {
      window.location.href = '/auth?expired=true';
    }
  }

  const json = await res.json().catch(() => ({ success: false, message: 'Invalid server response.' }));

  if (!res.ok) {
    // Surface the server's own message so the UI can display it
    const error = new Error(json.message || `Request failed with status ${res.status}`);
    error.status  = res.status;
    error.errors  = json.errors || null;
    throw error;
  }

  return json;
};

// ─── Carbon endpoints ────────────────────────────────────────────────────────

export const carbonApi = {
  /**
   * Fetch the lightweight dashboard payload (user summary + 7-day week).
   */
  getDashboard: () => request('/carbon/dashboard'),

  /**
   * Fetch full aggregated stats + monthly trend.
   */
  getStats: () => request('/carbon/stats'),

  /**
   * Fetch paginated log history.
   * @param {{ page?: number, limit?: number, from?: string, to?: string }} params
   */
  getLogs: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString();
    return request(`/carbon/logs${qs ? `?${qs}` : ''}`);
  },

  /**
   * Submit a daily carbon log.
   * @param {{ diet: string, energy: object, transport?: array, logDate?: string, notes?: string }} body
   */
  submitLog: (body) =>
    request('/carbon/log', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

// ─── Auth endpoints (wired up in Phase 4) ────────────────────────────────────

export const authApi = {
  register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login:    (body) => request('/auth/login',    { method: 'POST', body: JSON.stringify(body) }),
  logout:   ()     => request('/auth/logout',   { method: 'POST' }),
  me:       ()     => request('/auth/me'),
};

export default { carbonApi, authApi };