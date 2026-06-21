/**
 * pages/LandingPage.jsx — Carbon Footprint Tracker Landing Page
 *
 * A visually stunning, highly premium landing page that introduces the
 * application, showcases its core MERN features, and guides users to start tracking.
 */

import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  const isLoggedIn = !!localStorage.getItem('ct_token');

  return (
    <div className="min-h-screen bg-[#111d11] text-[#f0ede8] font-sans overflow-x-hidden">
      {/* ─── Navigation Header ──────────────────────────────────────────────── */}
      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between border-b border-[#1e2e1e]">
        <div className="flex items-center gap-2">
          <span className="text-3xl animate-pulse">🌿</span>
          <span className="font-semibold text-xl tracking-tight bg-gradient-to-r from-[#a8c5a0] to-[#f0ede8] bg-clip-text text-transparent">
            CarbonTracker
          </span>
        </div>
        <nav className="flex items-center gap-6">
          {isLoggedIn ? (
            <Link
              to="/dashboard"
              className="bg-[#4a7c59] hover:bg-[#5a9c70] text-[#f0ede8] font-mono text-sm font-semibold px-5 py-2 rounded-lg transition-all"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/auth"
                className="text-[#a8c5a0] hover:text-[#f0ede8] font-mono text-sm transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/auth?mode=register"
                className="bg-[#4a7c59] hover:bg-[#5a9c70] text-[#f0ede8] font-mono text-sm font-semibold px-4 py-2 rounded-lg transition-all"
              >
                Get Started
              </Link>
            </>
          )}
        </nav>
      </header>

      {/* ─── Hero Section ─────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-20 text-center space-y-8 relative">
        {/* Subtle decorative background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-[#4a7c59]/10 rounded-full blur-[80px] -z-10" />

        <span className="inline-block bg-[#4a7c59]/15 border border-[#4a7c59]/30 rounded-full px-4 py-1.5 text-xs text-[#a8c5a0] font-mono uppercase tracking-widest">
          🌿 Join the green movement
        </span>

        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-4xl mx-auto leading-tight">
          Track, Understand, and{' '}
          <span className="bg-gradient-to-r from-[#a8c5a0] via-[#8fbf85] to-[#f0ede8] bg-clip-text text-transparent">
            Shrink Your Carbon Footprint
          </span>
        </h1>

        <p className="text-[#6b8f6b] text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          A gamified carbon tracking assistant built to turn sustainable choices into simple, rewarding daily habits. Get personalized insights to trim your emissions.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-4">
          <Link
            to={isLoggedIn ? "/dashboard" : "/auth?mode=register"}
            className="w-full sm:w-auto bg-[#4a7c59] hover:bg-[#5a9c70] active:scale-[0.98] text-[#f0ede8] font-mono font-semibold px-8 py-3.5 rounded-lg shadow-xl shadow-[#111]/30 transition-all text-center"
          >
            {isLoggedIn ? "Access Dashboard" : "Start Free Tracking"}
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto border border-[#2d4a2d] hover:border-[#4a7c59] hover:bg-[#1a2e1a]/30 text-[#a8c5a0] hover:text-[#f0ede8] font-mono px-8 py-3.5 rounded-lg transition-all text-center"
          >
            Learn More
          </a>
        </div>
      </section>

      {/* ─── Highlights Section ───────────────────────────────────────────── */}
      <section className="bg-[#1a2e1a]/40 border-y border-[#1e2e1e] py-16" id="features">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-6 space-y-4 hover:border-[#4a7c59]/40 transition-colors">
            <div className="text-3xl">📋</div>
            <h3 className="font-semibold text-lg text-[#a8c5a0] font-mono">Simple Daily Logs</h3>
            <p className="text-sm text-[#6b8f6b] leading-relaxed">
              Log transport, diet, and electricity usage in seconds. Keep track of daily fluctuations effortlessly.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-6 space-y-4 hover:border-[#4a7c59]/40 transition-colors">
            <div className="text-3xl">💡</div>
            <h3 className="font-semibold text-lg text-[#a8c5a0] font-mono">Personalized Insights</h3>
            <p className="text-sm text-[#6b8f6b] leading-relaxed">
              Get intelligent feedback addressing your highest carbon emitter of the day with simple tips to reduce it.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-6 space-y-4 hover:border-[#4a7c59]/40 transition-colors">
            <div className="text-3xl">⭐</div>
            <h3 className="font-semibold text-lg text-[#a8c5a0] font-mono">Gamified Streaks</h3>
            <p className="text-sm text-[#6b8f6b] leading-relaxed">
              Earn XP, level up, and unlock custom badges as you sustain streaks and stay below your baseline.
            </p>
          </div>
        </div>
      </section>

      {/* ─── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-24 text-center space-y-6">
        <h2 className="text-3xl font-bold font-mono text-[#a8c5a0]">Ready to make an impact?</h2>
        <p className="text-[#6b8f6b] text-sm max-w-md mx-auto leading-relaxed">
          Create your account today, establish your baseline carbon budget, and see how simple daily adjustments can shrink your overall carbon footprint.
        </p>
        <div className="pt-4">
          <Link
            to={isLoggedIn ? "/dashboard" : "/auth?mode=register"}
            className="inline-block bg-[#4a7c59] hover:bg-[#5a9c70] text-[#f0ede8] font-mono font-semibold px-8 py-3 rounded-lg transition-colors"
          >
            Create My Free Account
          </Link>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────────────── */}
      <footer className="max-w-6xl mx-auto px-6 py-8 border-t border-[#1e2e1e] flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-xs text-[#6b8f6b] font-mono">
          © {new Date().getFullYear()} CarbonTracker. All rights reserved.
        </p>
        <p className="text-xs text-[#6b8f6b] font-mono">
          Designed with 💚 for a sustainable future.
        </p>
      </footer>
    </div>
  );
};

export default LandingPage;
