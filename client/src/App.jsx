/**
 * App.jsx — Carbon Footprint Tracker
 *
 * Root component. Sets up:
 *   - AuthProvider wrapping the entire tree
 *   - React Router v6 route declarations
 *   - Public route: /auth  (login + register)
 *   - Protected routes: /dashboard, / (redirect)
 */

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';

// Lazy-load pages so the auth page loads instantly on cold start
const AuthPage    = lazy(() => import('./pages/AuthPage.jsx'));
const Dashboard   = lazy(() => import('./components/Dashboard.jsx'));
const LandingPage = lazy(() => import('./pages/LandingPage.jsx'));

// ─── Full-screen spinner shown during code-splitting loads ────────────────────
const PageLoader = () => (
  <div className="min-h-screen bg-[#111d11] flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <span className="text-4xl animate-pulse-slow">🌿</span>
      <span className="text-[#4a7c59] font-mono text-xs uppercase tracking-widest">
        Loading…
      </span>
    </div>
  </div>
);

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthPage />} />

          {/* Protected */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Catch-all: redirect root to landing page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </AuthProvider>
);

export default App;
