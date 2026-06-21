/**
 * components/dashboard/CarbonGauge.jsx
 *
 * Radial arc gauge showing today's carbon footprint vs the user's baseline.
 * Drawn entirely in SVG — no charting library dependency.
 *
 * The arc sweeps from ~210° to ~330° (a 240° range), like a speedometer.
 * The needle position maps the ratio (actual / baseline) onto that arc.
 * Green zone: < 75% of baseline. Amber zone: 75–100%. Red zone: > 100%.
 */

import React, { useMemo } from 'react';

const RADIUS    = 80;
const CX        = 110;
const CY        = 110;
const START_DEG = 210;  // 6 o'clock-left
const END_DEG   = 330;  // 6 o'clock-right (sweeping clockwise)
const SWEEP     = 240;  // total arc degrees

// Convert polar degrees (0 = right / 3 o'clock) to SVG x,y
const polarToXY = (cx, cy, r, deg) => {
  const rad = ((deg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
};

// Build an SVG arc path string
const describeArc = (cx, cy, r, startDeg, endDeg) => {
  const start    = polarToXY(cx, cy, r, startDeg);
  const end      = polarToXY(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
};

const CarbonGauge = ({ actualKg, baselineKg, loading = false }) => {
  const hasLog  = actualKg !== null && actualKg !== undefined;
  const ratio   = hasLog && baselineKg > 0 ? actualKg / baselineKg : 0;
  const clipped = Math.min(Math.max(ratio, 0), 1.5); // cap needle at 150%

  // How far along the 240° sweep the needle sits
  const needleDeg = START_DEG + (clipped / 1.5) * SWEEP;

  // Colour zones along the arc
  const zone75Deg  = START_DEG + (0.75 / 1.5) * SWEEP;  // 75% of baseline
  const zone100Deg = START_DEG + (1.0  / 1.5) * SWEEP;  // 100% (= baseline)

  // Needle tip
  const tip  = polarToXY(CX, CY, RADIUS - 10, needleDeg);
  const base = polarToXY(CX, CY, 18, needleDeg + 90);
  const base2= polarToXY(CX, CY, 18, needleDeg - 90);

  // Stroke colour of the value label
  const valueColor = !hasLog ? '#6b8f6b' : ratio < 0.75 ? '#4a7c59' : ratio < 1.0 ? '#d47c2a' : '#c0392b';

  const pctLabel = hasLog ? `${Math.round(ratio * 100)}%` : '—';
  const statusMsg = !hasLog
    ? 'Log today to see your breakdown'
    : ratio < 0.75
    ? 'Well below baseline'
    : ratio < 1.0
    ? 'Below baseline'
    : ratio < 1.25
    ? 'Above baseline'
    : 'Far above baseline';

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="w-[220px] h-[160px] rounded-full bg-[#2d4a2d]/40 animate-pulse" />
        <div className="h-4 w-24 bg-[#2d4a2d]/40 animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center select-none">
      <svg
        viewBox="0 0 220 160"
        width="220"
        height="160"
        aria-label={`Carbon gauge: ${actualKg} kg today vs ${baselineKg} kg baseline`}
        role="img"
      >
        {/* ── Track arc (background) ────────────────────────────── */}
        <path
          d={describeArc(CX, CY, RADIUS, START_DEG, END_DEG)}
          fill="none"
          stroke="#2d4a2d"
          strokeWidth="14"
          strokeLinecap="round"
        />

        {/* ── Green zone: start → 75% ────────────────────────────── */}
        <path
          d={describeArc(CX, CY, RADIUS, START_DEG, zone75Deg)}
          fill="none"
          stroke="#4a7c59"
          strokeWidth="14"
          strokeLinecap="butt"
          opacity="0.7"
        />

        {/* ── Amber zone: 75% → 100% ────────────────────────────── */}
        <path
          d={describeArc(CX, CY, RADIUS, zone75Deg, zone100Deg)}
          fill="none"
          stroke="#d47c2a"
          strokeWidth="14"
          strokeLinecap="butt"
          opacity="0.7"
        />

        {/* ── Red zone: 100% → end ──────────────────────────────── */}
        <path
          d={describeArc(CX, CY, RADIUS, zone100Deg, END_DEG)}
          fill="none"
          stroke="#c0392b"
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* ── Baseline tick mark ────────────────────────────────── */}
        {(() => {
          const outer = polarToXY(CX, CY, RADIUS + 8, zone100Deg);
          const inner = polarToXY(CX, CY, RADIUS - 8, zone100Deg);
          return (
            <line
              x1={inner.x} y1={inner.y}
              x2={outer.x} y2={outer.y}
              stroke="#f0ede8"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.5"
            />
          );
        })()}

        {/* ── Needle ────────────────────────────────────────────── */}
        {hasLog && (
          <polygon
            points={`${tip.x},${tip.y} ${base.x},${base.y} ${base2.x},${base2.y}`}
            fill={valueColor}
            opacity="0.95"
          />
        )}

        {/* ── Needle pivot ──────────────────────────────────────── */}
        <circle cx={CX} cy={CY} r="7" fill="#1a2e1a" stroke={valueColor} strokeWidth="2" />

        {/* ── Central readout ───────────────────────────────────── */}
        <text
          x={CX} y={CY + 30}
          textAnchor="middle"
          fontFamily="DM Mono, monospace"
          fontSize="22"
          fontWeight="600"
          fill={valueColor}
        >
          {actualKg != null ? actualKg.toFixed(1) : '—'}
        </text>
        <text
          x={CX} y={CY + 44}
          textAnchor="middle"
          fontFamily="DM Mono, monospace"
          fontSize="9"
          fill="#6b8f6b"
          letterSpacing="2"
        >
          KG CO₂E TODAY
        </text>

        {/* ── Arc end labels ─────────────────────────────────────── */}
        {(() => {
          const startPt = polarToXY(CX, CY, RADIUS + 18, START_DEG);
          const endPt   = polarToXY(CX, CY, RADIUS + 18, END_DEG);
          return (
            <>
              <text x={startPt.x - 4} y={startPt.y + 4} textAnchor="middle"
                    fontFamily="DM Mono, monospace" fontSize="8" fill="#6b8f6b">0</text>
              <text x={endPt.x + 4}   y={endPt.y + 4}   textAnchor="middle"
                    fontFamily="DM Mono, monospace" fontSize="8" fill="#6b8f6b">
                {baselineKg != null ? (baselineKg * 1.5).toFixed(0) : '—'}
              </text>
            </>
          );
        })()}
      </svg>

      {/* ── Below-gauge labels ─────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-0.5 mt-1">
        <span className="font-mono text-xs" style={{ color: valueColor }}>
          {hasLog ? `${pctLabel} of baseline` : 'Pending daily log'}
        </span>
        <span className="text-[#6b8f6b] text-xs">{statusMsg}</span>
        <span className="text-[#4a5568] text-xs font-mono mt-1">
          baseline {baselineKg ?? '—'} kg/day
        </span>
      </div>
    </div>
  );
};

export default CarbonGauge;
