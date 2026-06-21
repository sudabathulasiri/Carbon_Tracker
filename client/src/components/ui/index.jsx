/**
 * components/ui/index.jsx — Shared primitives
 *
 * Tiny, self-contained components that carry the design system's tokens.
 * No external UI library dependency — keeping the bundle lean.
 */

import React from 'react';

// ─── MetricCard ───────────────────────────────────────────────────────────────
/**
 * Left-border accent card used for secondary stats.
 * accentColor: 'green' | 'amber' | 'sage' | 'neutral'
 */
export const MetricCard = ({ label, value, unit, sub, accentColor = 'green', icon }) => {
  const accent = {
    green:   'border-l-[#4a7c59]',
    amber:   'border-l-[#d47c2a]',
    sage:    'border-l-[#a8c5a0]',
    neutral: 'border-l-[#4a5568]',
  }[accentColor] || 'border-l-[#4a7c59]';

  return (
    <div className={`bg-[#1e2e1e] border-l-4 ${accent} rounded-r-lg px-5 py-4 flex flex-col gap-1`}>
      <div className="flex items-center gap-2 text-[#a8c5a0] text-xs font-mono uppercase tracking-widest">
        {icon && <span className="text-sm">{icon}</span>}
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[#f0ede8] text-2xl font-mono font-semibold leading-none">
          {value ?? '—'}
        </span>
        {unit && <span className="text-[#a8c5a0] text-xs font-mono">{unit}</span>}
      </div>
      {sub && <div className="text-[#6b8f6b] text-xs mt-0.5">{sub}</div>}
    </div>
  );
};

// ─── Badge chip ───────────────────────────────────────────────────────────────
export const BadgeChip = ({ badge }) => (
  <div
    title={badge.description}
    className="flex items-center gap-1.5 bg-[#2d4a2d] border border-[#4a7c59]/40
               text-[#a8c5a0] text-xs font-mono px-2.5 py-1 rounded-full"
  >
    <span>{badge.icon}</span>
    <span>{badge.label}</span>
  </div>
);

// ─── XP Progress Bar ──────────────────────────────────────────────────────────
export const XPBar = ({ currentXP, xpToNextLevel, level }) => {
  // XP earned toward the next level = total earned in this level window
  const xpInLevel = currentXP - Math.pow(level - 1, 2) * 100;
  const xpNeeded  = Math.pow(level, 2) * 100 - Math.pow(level - 1, 2) * 100;
  const pct       = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[#a8c5a0] text-xs font-mono uppercase tracking-widest">
          Level {level}
        </span>
        <span className="text-[#6b8f6b] text-xs font-mono">
          {xpInLevel} / {xpNeeded} XP
        </span>
      </div>
      <div className="h-2 bg-[#2d4a2d] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#4a7c59] to-[#a8c5a0] rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Level ${level} progress: ${pct}%`}
        />
      </div>
      <div className="text-right text-[#6b8f6b] text-xs font-mono">
        {xpToNextLevel} XP to level {level + 1}
      </div>
    </div>
  );
};

// ─── Skeleton loader ──────────────────────────────────────────────────────────
export const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-[#2d4a2d]/60 rounded ${className}`} />
);

// ─── Status pill ──────────────────────────────────────────────────────────────
export const StatusPill = ({ beat }) =>
  beat ? (
    <span className="inline-flex items-center gap-1 text-[#4a7c59] bg-[#4a7c59]/15
                     border border-[#4a7c59]/30 text-xs font-mono px-2 py-0.5 rounded-full">
      ✓ below baseline
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[#d47c2a] bg-[#d47c2a]/15
                     border border-[#d47c2a]/30 text-xs font-mono px-2 py-0.5 rounded-full">
      ↑ above baseline
    </span>
  );

// ─── Section header ───────────────────────────────────────────────────────────
export const SectionLabel = ({ children }) => (
  <h2 className="text-[#6b8f6b] text-xs font-mono uppercase tracking-[0.15em] mb-3">
    {children}
  </h2>
);

// ─── Empty state ──────────────────────────────────────────────────────────────
export const EmptyState = ({ icon = '📋', title, body, action }) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
    <span className="text-4xl opacity-60">{icon}</span>
    <p className="text-[#f0ede8] font-medium">{title}</p>
    {body && <p className="text-[#6b8f6b] text-sm max-w-xs">{body}</p>}
    {action}
  </div>
);