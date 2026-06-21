/**
 * components/dashboard/AnalyticsChart.jsx
 *
 * Weekly carbon footprint visualisation.
 *
 * Renders a composed chart (bar for absolute emissions, line for baseline)
 * using recharts. Falls back to a clean empty state when no data exists.
 *
 * Props:
 *   weekData    : array of { date: 'YYYY-MM-DD', calculatedCarbon: number, beatBaseline: boolean }
 *   baseline    : number  — the user's daily baseline in kg CO₂e
 *   loading     : boolean
 */

import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Skeleton, EmptyState } from '../ui/index.jsx';

// ─── Custom tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label, baseline }) => {
  if (!active || !payload?.length) return null;
  const carbon = payload[0]?.value;
  const beat   = carbon != null && carbon < baseline;

  return (
    <div className="bg-[#1a2e1a] border border-[#4a7c59]/30 rounded-lg px-4 py-3 shadow-xl
                    font-mono text-xs space-y-1">
      <p className="text-[#a8c5a0] uppercase tracking-widest text-[10px]">{label}</p>
      <p className="text-[#f0ede8] text-base font-semibold">
        {carbon != null ? `${carbon.toFixed(2)} kg` : 'No log'}
      </p>
      {carbon != null && (
        <p style={{ color: beat ? '#4a7c59' : '#d47c2a' }}>
          {beat
            ? `${(baseline - carbon).toFixed(2)} kg below baseline`
            : `${(carbon - baseline).toFixed(2)} kg above baseline`}
        </p>
      )}
    </div>
  );
};

// ─── Day label formatter ──────────────────────────────────────────────────────

const shortDay = (isoDate) => {
  const d = new Date(isoDate + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
};

// ─── AnalyticsChart ───────────────────────────────────────────────────────────

const AnalyticsChart = ({ weekData = [], baseline = 12, loading = false }) => {
  // Build a full 7-day array so missing days render as gaps, not compression
  const chartData = useMemo(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - (6 - i));
      const iso = d.toISOString().slice(0, 10);
      const match = weekData.find((w) => w.date === iso);
      return {
        iso,
        day:            shortDay(iso),
        carbon:         match?.calculatedCarbon ?? null,
        beatBaseline:   match?.beatBaseline ?? false,
      };
    });
  }, [weekData]);

  // Y-axis upper bound: at least 1.5× baseline, or the max value with 20% headroom
  const maxCarbon = Math.max(...chartData.map((d) => d.carbon ?? 0), baseline);
  const yMax      = Math.ceil(Math.max(baseline * 1.5, maxCarbon * 1.2) / 5) * 5;

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        <Skeleton className="h-[180px] w-full" />
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-3 flex-1" />
          ))}
        </div>
      </div>
    );
  }

  const hasAnyData = chartData.some((d) => d.carbon != null);

  if (!hasAnyData) {
    return (
      <EmptyState
        icon="📊"
        title="No data yet this week"
        body="Submit your first daily log to see your footprint chart here."
      />
    );
  }

  return (
    <div className="w-full">
      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-5 mb-4 font-mono text-xs text-[#6b8f6b]">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#4a7c59] inline-block" />
          below baseline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-[#d47c2a] inline-block" />
          above baseline
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 bg-[#a8c5a0] inline-block border-dashed border-t border-[#a8c5a0]" />
          your baseline
        </span>
      </div>

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
          barCategoryGap="28%"
        >
          {/* Grid */}
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#2d4a2d"
            vertical={false}
          />

          {/* Axes */}
          <XAxis
            dataKey="day"
            tick={{ fill: '#6b8f6b', fontSize: 11, fontFamily: 'DM Mono, monospace' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, yMax]}
            tick={{ fill: '#6b8f6b', fontSize: 10, fontFamily: 'DM Mono, monospace' }}
            axisLine={false}
            tickLine={false}
            unit=" kg"
            width={52}
          />

          {/* Baseline reference line */}
          <ReferenceLine
            y={baseline}
            stroke="#a8c5a0"
            strokeDasharray="5 3"
            strokeWidth={1.5}
            label={{
              value: `baseline ${baseline} kg`,
              position: 'insideTopRight',
              fill: '#a8c5a0',
              fontSize: 9,
              fontFamily: 'DM Mono, monospace',
              dy: -6,
            }}
          />

          {/* Tooltip */}
          <Tooltip
            content={<CustomTooltip baseline={baseline} />}
            cursor={{ fill: '#2d4a2d', opacity: 0.4 }}
          />

          {/* Bars — coloured by whether baseline was beaten */}
          <Bar dataKey="carbon" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={
                  entry.carbon == null
                    ? '#2d4a2d'
                    : entry.beatBaseline
                    ? '#4a7c59'
                    : '#d47c2a'
                }
                opacity={entry.carbon == null ? 0.2 : 0.85}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AnalyticsChart;
