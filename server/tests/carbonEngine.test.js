/**
 * tests/carbonEngine.test.js — Carbon Footprint Tracker
 *
 * Automated unit tests for the pure carbon calculation logic, XP awards,
 * and streak calculators using Node.js's built-in test runner.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const engine = require('../utils/carbonEngine');

// ─── Carbon Calculation Tests ────────────────────────────────────────────────

test('carbonEngine.calculate - calculates emissions correctly for various modes', () => {
  const result = engine.calculate({
    transport: [{ mode: 'car_petrol', distanceKm: 10 }],
    diet: 'vegan',
    energy: { electricityKwh: 5, naturalGasKwh: 10 }
  });

  // Calculations:
  // Transport: 10 * 0.192 = 1.92
  // Diet vegan: 2.89
  // Energy electricity: 5 * 0.233 = 1.165
  // Energy gas: 10 * 0.203 = 2.03
  // Total expected: 1.92 + 2.89 + 1.165 + 2.03 = 8.005 -> rounded to 2dp is 8.01
  assert.strictEqual(result.totalCarbonKg, 8.01);
  assert.strictEqual(result.breakdown.transportKg, 1.92);
  assert.strictEqual(result.breakdown.dietKg, 2.89);
  assert.strictEqual(result.breakdown.energyKg, 3.2); // 1.165 + 2.03 = 3.195 -> round to 2dp is 3.2
});

test('carbonEngine.calculate - handles empty or missing inputs gracefully', () => {
  const result = engine.calculate({
    transport: [],
    diet: 'none',
    energy: {}
  });

  assert.strictEqual(result.totalCarbonKg, 0);
  assert.strictEqual(result.breakdown.transportKg, 0);
  assert.strictEqual(result.breakdown.dietKg, 0);
  assert.strictEqual(result.breakdown.energyKg, 0);
});

// ─── XP Engine Tests ─────────────────────────────────────────────────────────

test('carbonEngine.computeXP - awards participation XP only when failing to beat baseline', () => {
  const result = engine.computeXP({
    calculatedCarbonKg: 15,
    baselineCarbon: 12,
    streak: 3
  });

  // No baseline beat, no streak multiplier: 10 XP
  assert.strictEqual(result.xp, 10);
  assert.strictEqual(result.beatBaseline, false);
  assert.strictEqual(result.savedKg, 0);
});

test('carbonEngine.computeXP - awards baseline bonus and savings XP', () => {
  const result = engine.computeXP({
    calculatedCarbonKg: 8,
    baselineCarbon: 12,
    streak: 0
  });

  // Baseline beat: +20 XP
  // Saved: 4kg -> +4 XP
  // Base: 10 XP
  // Total expected: 10 + 20 + 4 = 34 XP
  assert.strictEqual(result.xp, 34);
  assert.strictEqual(result.beatBaseline, true);
  assert.strictEqual(result.savedKg, 4);
});

test('carbonEngine.computeXP - applies streak multipliers correctly', () => {
  // Case 1: 7-day streak (1.25x)
  const res7 = engine.computeXP({
    calculatedCarbonKg: 15,
    baselineCarbon: 12,
    streak: 7
  });
  // base 10 * 1.25 = 12.5 -> rounded to 13
  assert.strictEqual(res7.xp, 13);

  // Case 2: 15-day streak (1.5x)
  const res15 = engine.computeXP({
    calculatedCarbonKg: 15,
    baselineCarbon: 12,
    streak: 15
  });
  // base 10 * 1.5 = 15
  assert.strictEqual(res15.xp, 15);

  // Case 3: 30-day streak (2.0x)
  const res30 = engine.computeXP({
    calculatedCarbonKg: 15,
    baselineCarbon: 12,
    streak: 30
  });
  // base 10 * 2 = 20
  assert.strictEqual(res30.xp, 20);
});

// ─── Streak Engine Tests ─────────────────────────────────────────────────────

test('carbonEngine.computeStreak - starts new streak at 1 for first log', () => {
  const result = engine.computeStreak({
    lastLogDate: null,
    currentLogDate: new Date('2026-06-21'),
    currentStreak: 0
  });

  assert.strictEqual(result.newStreak, 1);
  assert.strictEqual(result.streakContinued, false);
});

test('carbonEngine.computeStreak - increments streak for consecutive days', () => {
  const result = engine.computeStreak({
    lastLogDate: new Date('2026-06-20'),
    currentLogDate: new Date('2026-06-21'),
    currentStreak: 4
  });

  assert.strictEqual(result.newStreak, 5);
  assert.strictEqual(result.streakContinued, true);
});

test('carbonEngine.computeStreak - resets streak to 1 if gap is more than one day', () => {
  const result = engine.computeStreak({
    lastLogDate: new Date('2026-06-18'),
    currentLogDate: new Date('2026-06-21'),
    currentStreak: 4
  });

  assert.strictEqual(result.newStreak, 1);
  assert.strictEqual(result.streakContinued, false);
});
