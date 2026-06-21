/**
 * components/Dashboard.jsx — Carbon Footprint Tracker
 *
 * The primary authenticated view. Fetches data from /carbon/dashboard,
 * assembles the gauge, metric cards, XP bar, badge shelf, and weekly chart.
 *
 * Layout (desktop):  2-column — left: gauge + XP + badges;  right: metric cards + chart
 * Layout (mobile):   single column, gauge first
 *
 * Props:
 *   user  : { name, level, currentXP, xpToNextLevel, ... } — from AuthContext (Phase 4)
 *         Falls back to fetching its own data when user prop is absent.
 */

import React, { useState, useEffect, useCallback } from 'react';
import CarbonGauge    from './dashboard/CarbonGauge.jsx';
import AnalyticsChart from './dashboard/AnalyticsChart.jsx';
import CarbonLogForm  from './tracker/CarbonLogForm.jsx';
import {
  MetricCard, BadgeChip, XPBar, Skeleton, EmptyState, SectionLabel,
} from './ui/index.jsx';
import { carbonApi, authApi } from '../services/api.js';

// ─── Toast notification (inline, no library) ──────────────────────────────────

const Toast = ({ message, type = 'success', onDismiss }) => {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const colours = {
    success: 'bg-[#4a7c59] border-[#4a7c59]',
    error:   'bg-[#c0392b] border-[#c0392b]',
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-start gap-3
                  ${colours[type]} bg-opacity-20 border rounded-lg
                  px-5 py-4 shadow-2xl backdrop-blur-sm max-w-sm`}
      role="status"
      aria-live="polite"
    >
      <span className="text-lg">{type === 'success' ? '✓' : '✕'}</span>
      <p className="text-[#f0ede8] text-sm font-mono leading-snug">{message}</p>
      <button
        onClick={onDismiss}
        className="ml-auto text-[#6b8f6b] hover:text-[#f0ede8] text-sm shrink-0"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
};

// ─── Streak display ───────────────────────────────────────────────────────────

const StreakBadge = ({ streak }) => {
  if (!streak) return null;
  return (
    <div className="flex items-center gap-1.5 bg-[#d47c2a]/15 border border-[#d47c2a]/30
                    rounded-full px-3 py-1">
      <span>🔥</span>
      <span className="text-[#d47c2a] font-mono text-xs font-semibold">
        {streak}-day streak
      </span>
    </div>
  );
};

// ─── Personalized Insights & Actions ──────────────────────────────────────────

const getPersonalizedInsights = (todayEntry, baseline) => {
  if (!todayEntry) {
    return [
      {
        icon: '🚴',
        title: 'Choose Green Commute',
        text: 'Walk, cycle, or take transit for trips under 5km. Active travel emits 0kg of CO₂e!',
      },
      {
        icon: '🥦',
        title: 'Try a Plant-Based Meal',
        text: 'Swapping a meat dish for vegan or vegetarian options reduces food emissions by up to 60%.',
      },
      {
        icon: '💡',
        title: 'Subtle Energy Saving',
        text: 'Unplug stand-by appliances and turn off lights in empty rooms to keep electricity under 2 kWh/day.',
      },
    ];
  }

  const { transportKg = 0, dietKg = 0, energyKg = 0 } = todayEntry.breakdown || {};
  const insights = [];

  // Congratulate or suggest reduction
  if (todayEntry.calculatedCarbon < baseline) {
    insights.push({
      icon: '🎉',
      title: 'Awesome Job!',
      text: `You are beating your baseline of ${baseline} kg by ${(baseline - todayEntry.calculatedCarbon).toFixed(1)} kg. Keep this green streak going!`,
    });
  } else {
    insights.push({
      icon: '🎯',
      title: 'Target in Sight',
      text: `You are ${(todayEntry.calculatedCarbon - baseline).toFixed(1)} kg above your baseline today. Look at the tips below to trim your footprint.`,
    });
  }

  // Find the highest category
  const categories = [
    { name: 'Transport', value: transportKg, icon: '🚗' },
    { name: 'Diet', value: dietKg, icon: '🍽️' },
    { name: 'Energy', value: energyKg, icon: '⚡' },
  ];
  categories.sort((a, b) => b.value - a.value);
  const highest = categories[0];

  if (highest.name === 'Transport' && highest.value > 0) {
    insights.push({
      icon: '🚌',
      title: 'Optimize Your Commute',
      text: `Transport is your largest carbon source today (${highest.value.toFixed(1)} kg). Substituting car rides with train or bus travel can save 50%+ of transit emissions.`,
    });
  } else if (highest.name === 'Diet' && highest.value > 0) {
    insights.push({
      icon: '🥗',
      title: 'Go Green on Your Plate',
      text: `Your dietary footprint contributed ${highest.value.toFixed(1)} kg. Incorporating more grains, beans, and vegetables instead of beef or pork is the single most effective way to cut personal emissions.`,
    });
  } else if (highest.name === 'Energy' && highest.value > 0) {
    insights.push({
      icon: '🔌',
      title: 'Smart Home Energy Usage',
      text: `Home energy is your top source today (${highest.value.toFixed(1)} kg). Try washing clothes at 30°C, air-drying laundry, or adjusting your thermostat by 1°C.`,
    });
  }

  // Add a generic secondary tip that isn't the highest
  const secondary = categories[1];
  if (secondary) {
    if (secondary.name === 'Transport') {
      insights.push({
        icon: '🚲',
        title: 'Active Transport',
        text: 'Consider walking or cycling for short errands. It is healthy, free, and emits absolutely zero carbon!',
      });
    } else if (secondary.name === 'Diet') {
      insights.push({
        icon: '🥑',
        title: 'Sustainably Sourced Food',
        text: 'Reducing food waste and choosing local, seasonal produce helps lower agricultural supply chain impacts.',
      });
    } else if (secondary.name === 'Energy') {
      insights.push({
        icon: '☀️',
        title: 'Power Down',
        text: 'Switching off appliances when they are not in use can shave off up to 10% from your daily electricity emissions.',
      });
    }
  }

  return insights;
};

const InsightsCard = ({ insights }) => (
  <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-5 space-y-4">
    <SectionLabel>🌿 Actionable Insights</SectionLabel>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {insights.map((insight, idx) => (
        <div key={idx} className="flex gap-3 bg-[#1e2e1e] p-3.5 rounded-lg border border-[#2d4a2d]/30">
          <span className="text-2xl shrink-0">{insight.icon}</span>
          <div>
            <h4 className="text-sm font-semibold text-[#a8c5a0] font-mono leading-snug">{insight.title}</h4>
            <p className="text-xs text-[#6b8f6b] mt-1.5 leading-relaxed">{insight.text}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const [dashboard,  setDashboard]  = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showForm,   setShowForm]   = useState(false);
  const [toast,      setToast]      = useState(null);

  // ── Logout handler ───────────────────────────────────────────────────────

  const handleLogout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      // Force clear local credentials regardless of API status
    }
    localStorage.removeItem('ct_token');
    localStorage.removeItem('ct_user');
    window.location.href = '/auth';
  }, []);

  // ── Data fetch ──────────────────────────────────────────────────────────

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await carbonApi.getDashboard();
      setDashboard(res.data);
      setError('');
    } catch (err) {
      if (err.status === 401) {
        // Redirect to login in Phase 4 when AuthContext is wired
        setError('Session expired. Please log in again.');
      } else {
        setError(err.message || 'Failed to load dashboard.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // ── Log submitted ───────────────────────────────────────────────────────

  const handleLogSuccess = useCallback((result) => {
    setShowForm(false);

    const { gamification, log } = result.data;
    const badgeMsg = gamification.newBadges?.length
      ? ` · Earned: ${gamification.newBadges.map((b) => `${b.icon} ${b.label}`).join(', ')}`
      : '';

    setToast({
      message: `${log.calculatedCarbonKg} kg CO₂e logged · +${gamification.xpAwarded} XP${badgeMsg}`,
      type: 'success',
    });

    // Refresh dashboard data
    setLoading(true);
    fetchDashboard();
  }, [fetchDashboard]);

  // ── Loading state ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111d11] p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-36" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#1a2e1a] rounded-xl p-6 space-y-6">
            <Skeleton className="h-[200px] w-[220px] mx-auto rounded-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[0,1,2,3].map((i) => <Skeleton key={i} className="h-20" />)}
            </div>
            <Skeleton className="h-[220px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────

  if (error && !dashboard) {
    return (
      <div className="min-h-screen bg-[#111d11] flex items-center justify-center p-6">
        <EmptyState
          icon="⚠️"
          title="Couldn't load your dashboard"
          body={error}
          action={
            <button
              onClick={fetchDashboard}
              className="mt-3 bg-[#4a7c59] hover:bg-[#5a9c70] text-[#f0ede8]
                         font-mono text-sm px-5 py-2.5 rounded-lg transition-colors"
            >
              Try again
            </button>
          }
        />
      </div>
    );
  }

  const { user, week = [], loggedToday } = dashboard || {};

  // Today's log (most recent in week array, if it matches today)
  const todayISO   = new Date().toISOString().slice(0, 10);
  const todayEntry = week.find((w) => w.date === todayISO);

  // Generate personalized insights
  const insights = getPersonalizedInsights(todayEntry, user?.baselineCarbon ?? 12);

  // Determine what to show in the gauge
  const gaugeValue = todayEntry?.calculatedCarbon ?? null;

  return (
    <div className="min-h-screen bg-[#111d11] text-[#f0ede8]">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-[#111d11]/90 backdrop-blur-sm
                         border-b border-[#1e2e1e] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🌿</span>
          <div>
            <h1 className="text-[#f0ede8] font-semibold text-lg leading-none">
              {user?.name ? `${user.name.split(' ')[0]}'s Tracker` : 'Carbon Tracker'}
            </h1>
            <p className="text-[#6b8f6b] font-mono text-xs mt-0.5">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user?.currentStreak > 1 && <StreakBadge streak={user.currentStreak} />}

          {!loggedToday ? (
            <button
              onClick={() => setShowForm(true)}
              className="bg-[#4a7c59] hover:bg-[#5a9c70] active:bg-[#3d6b4a]
                         text-[#f0ede8] font-mono text-sm font-semibold
                         px-4 py-2.5 rounded-lg transition-colors
                         focus:outline-none focus:ring-2 focus:ring-[#a8c5a0]"
            >
              + Log today
            </button>
          ) : (
            <span className="text-[#4a7c59] font-mono text-xs flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[#4a7c59] rounded-full inline-block" />
              Logged
            </span>
          )}

          <button
            onClick={handleLogout}
            className="border border-[#c0392b]/30 hover:bg-[#c0392b]/15 active:bg-[#c0392b]/25
                       text-[#e74c3c] font-mono text-xs font-semibold
                       px-3 py-2 rounded-lg transition-all focus:outline-none"
            aria-label="Log out of application"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">

        {/* Actionable Insights Widget */}
        <InsightsCard insights={insights} />

        {/* No-data prompt for new users */}
        {week.length === 0 && (
          <div className="bg-[#1e2e1e] border border-dashed border-[#2d4a2d] rounded-xl p-6 text-center">
            <p className="text-[#a8c5a0] font-mono text-sm">
              Welcome! Submit your first daily log to start tracking your footprint.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 bg-[#4a7c59] hover:bg-[#5a9c70] text-[#f0ede8]
                         font-mono text-sm px-6 py-2.5 rounded-lg transition-colors"
            >
              Log my first day →
            </button>
          </div>
        )}

        {/* ── Two-column layout ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── Left column: Gauge + XP + Badges ──────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Gauge card */}
            <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-6 flex flex-col items-center gap-5">
              <SectionLabel>Today's footprint</SectionLabel>

              <CarbonGauge
                actualKg={gaugeValue}
                baselineKg={user?.baselineCarbon ?? 12}
                loading={loading}
              />

              {!loggedToday && (
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full border border-dashed border-[#2d4a2d] hover:border-[#4a7c59]
                             text-[#6b8f6b] hover:text-[#a8c5a0] font-mono text-sm
                             py-3 rounded-lg transition-colors"
                >
                  + Log today to update gauge
                </button>
              )}
            </div>

            {/* XP & Level card */}
            <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-5 space-y-4">
              <SectionLabel>Progress</SectionLabel>
              {user ? (
                <XPBar
                  currentXP={user.currentXP}
                  xpToNextLevel={user.xpToNextLevel}
                  level={user.level}
                />
              ) : (
                <Skeleton className="h-10 w-full" />
              )}
            </div>

            {/* Badges card */}
            {user?.badgeCount > 0 && (
              <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <SectionLabel>Badges</SectionLabel>
                  <span className="text-[#6b8f6b] font-mono text-xs">{user.badgeCount} earned</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {user.latestBadge && <BadgeChip badge={user.latestBadge} />}
                  {user.badgeCount > 1 && (
                    <span className="text-[#6b8f6b] font-mono text-xs self-center">
                      +{user.badgeCount - 1} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Right column: Metric cards + Chart ────────────────────── */}
          <div className="lg:col-span-3 space-y-5">

            {/* Metric cards grid */}
            <div>
              <SectionLabel>Overview</SectionLabel>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Baseline"
                  value={user?.baselineCarbon ?? '—'}
                  unit="kg/day"
                  icon="🎯"
                  accentColor="sage"
                  sub="your personal target"
                />
                <MetricCard
                  label="Total saved"
                  value={user?.totalCarbonSavedKg != null
                    ? user.totalCarbonSavedKg.toFixed(1)
                    : '—'}
                  unit="kg CO₂e"
                  icon="💚"
                  accentColor="green"
                  sub="vs your baseline"
                />
                <MetricCard
                  label="Days logged"
                  value={user?.totalLogs ?? '—'}
                  icon="📋"
                  accentColor="sage"
                  sub={user?.currentStreak
                    ? `${user.currentStreak}-day streak`
                    : 'start a streak today'}
                />
                <MetricCard
                  label="Total XP"
                  value={user?.currentXP ?? '—'}
                  unit="xp"
                  icon="⭐"
                  accentColor="amber"
                  sub={`level ${user?.level ?? 1}`}
                />
              </div>
            </div>

            {/* Weekly chart */}
            <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-5">
              <SectionLabel>This week's emissions</SectionLabel>
              <AnalyticsChart
                weekData={week}
                baseline={user?.baselineCarbon ?? 12}
                loading={loading}
              />
            </div>

            {/* Today's breakdown (if logged) */}
            {todayEntry && (
              <div className="bg-[#1a2e1a] border border-[#1e2e1e] rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionLabel>Today's breakdown</SectionLabel>
                  <span className="text-[#6b8f6b] font-mono text-xs">
                    {todayEntry.xpAwarded > 0 && `+${todayEntry.xpAwarded} XP earned`}
                  </span>
                </div>
                {todayEntry.breakdown && (
                  <div className="space-y-3">
                    {[
                      { key: 'transportKg', label: 'Transport', icon: '🚗' },
                      { key: 'dietKg',      label: 'Diet',      icon: '🍽️' },
                      { key: 'energyKg',    label: 'Energy',    icon: '⚡' },
                    ].map(({ key, label, icon }) => {
                      const val     = todayEntry.breakdown[key] ?? 0;
                      const total   = todayEntry.calculatedCarbon || 1;
                      const pct     = Math.round((val / total) * 100);
                      return (
                        <div key={key} className="space-y-1.5">
                          <div className="flex justify-between font-mono text-xs">
                            <span className="flex items-center gap-2 text-[#a8c5a0]">
                              {icon} {label}
                            </span>
                            <span className="text-[#f0ede8]">
                              {val.toFixed(2)} kg
                              <span className="text-[#6b8f6b] ml-1">({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-[#2d4a2d] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-[#4a7c59] to-[#a8c5a0] rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Log form modal ───────────────────────────────────────────────── */}
      {showForm && (
        <CarbonLogForm
          onClose={() => setShowForm(false)}
          onSuccess={handleLogSuccess}
          baseline={user?.baselineCarbon ?? 12}
        />
      )}

      {/* ── Toast notifications ──────────────────────────────────────────── */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
