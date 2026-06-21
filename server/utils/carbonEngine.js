/**
 * utils/carbonEngine.js — Carbon Footprint Tracker
 *
 * Pure calculation module: takes structured activity data and returns
 * a breakdown of CO₂e emissions in kg for each category, plus a total.
 *
 * No I/O, no side effects — every function is deterministic and testable.
 *
 * Emission factor sources:
 *   Transport : UK DEFRA Greenhouse Gas Conversion Factors 2023
 *   Diet      : Poore & Nemecek (2018); Oxford / Our World in Data
 *   Energy    : UK DEFRA 2023 (electricity); UK BEIS gas factor
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Emission Factor Tables
// ─────────────────────────────────────────────────────────────────────────────

/**
 * kg CO₂e per kilometre travelled by mode.
 * Values represent per-passenger emissions at average occupancy.
 */
const TRANSPORT_FACTORS = {
  car_petrol:   0.192,
  car_diesel:   0.171,
  car_electric: 0.053,
  motorbike:    0.114,
  bus:          0.089,
  train:        0.041,
  tram_metro:   0.029,
  cycling:      0.000,
  walking:      0.000,
  flight_short: 0.255, // Short-haul <3 h, includes radiative forcing index
  flight_long:  0.195, // Long-haul, includes RFI
  none:         0.000,
};

/**
 * kg CO₂e per person per day for different dietary patterns.
 * Represents the full supply-chain footprint of a typical day's meals.
 */
const DIET_FACTORS = {
  meat_heavy:  7.19,
  meat_medium: 5.63,
  meat_low:    4.67,
  pescatarian: 3.91,
  vegetarian:  3.81,
  vegan:       2.89,
};

/**
 * kg CO₂e per kWh for home energy sources.
 *   electricity : UK grid average 2023 (National Grid ESO data)
 *   natural_gas : UK BEIS 2023 gas combustion factor
 */
const ENERGY_FACTORS = {
  electricityKwh: 0.233,
  naturalGasKwh:  0.203,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Round to 4 significant decimal places to avoid floating-point noise. */
const round4 = (n) => Math.round(n * 10000) / 10000;

/** Round to 2 decimal places for user-facing totals. */
const round2 = (n) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────
// Category Calculators
// ─────────────────────────────────────────────────────────────────────────────

/**
 * calculateTransport — sum emissions across all transport legs.
 *
 * @param {Array<{ mode: string, distanceKm: number }>} legs
 * @returns {{ totalKg: number, legsWithEmissions: Array }}
 */
const calculateTransport = (legs = []) => {
  let totalKg = 0;

  const legsWithEmissions = legs.map((leg) => {
    const factor = TRANSPORT_FACTORS[leg.mode] ?? 0;
    const emissionsKg = round4(factor * leg.distanceKm);
    totalKg += emissionsKg;
    return { ...leg, emissionsKg };
  });

  return { totalKg: round4(totalKg), legsWithEmissions };
};

/**
 * calculateDiet — return the flat daily emissions for the given diet type.
 *
 * @param {string} dietType
 * @returns {number} kg CO₂e
 */
const calculateDiet = (dietType) => {
  return round4(DIET_FACTORS[dietType] ?? 0);
};

/**
 * calculateEnergy — compute combined electricity + gas emissions.
 *
 * @param {{ electricityKwh: number, naturalGasKwh?: number }} energy
 * @returns {{ totalKg: number, electricityKg: number, gasKg: number }}
 */
const calculateEnergy = ({ electricityKwh = 0, naturalGasKwh = 0 }) => {
  const electricityKg = round4(electricityKwh * ENERGY_FACTORS.electricityKwh);
  const gasKg         = round4(naturalGasKwh  * ENERGY_FACTORS.naturalGasKwh);
  return { totalKg: round4(electricityKg + gasKg), electricityKg, gasKg };
};

// ─────────────────────────────────────────────────────────────────────────────
// Primary Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * calculate — compute the full carbon breakdown for one day's activity data.
 *
 * @param {object} input
 * @param {Array<{ mode: string, distanceKm: number }>} input.transport
 * @param {string}  input.diet
 * @param {{ electricityKwh: number, naturalGasKwh?: number }} input.energy
 *
 * @returns {{
 *   totalCarbonKg:  number,   // grand total rounded to 2 dp
 *   breakdown: {
 *     transportKg: number,
 *     dietKg:      number,
 *     energyKg:    number,
 *   },
 *   transport: Array,         // legs annotated with per-leg emissionsKg
 *   energy: {
 *     electricityKg: number,
 *     gasKg:         number,
 *     emissionsKg:   number,
 *   }
 * }}
 */
const calculate = ({ transport = [], diet, energy = {} }) => {
  const transportResult = calculateTransport(transport);
  const dietKg          = calculateDiet(diet);
  const energyResult    = calculateEnergy(energy);

  const totalCarbonKg = round2(
    transportResult.totalKg + dietKg + energyResult.totalKg
  );

  return {
    totalCarbonKg,
    breakdown: {
      transportKg: round2(transportResult.totalKg),
      dietKg:      round2(dietKg),
      energyKg:    round2(energyResult.totalKg),
    },
    // Return annotated transport legs so the model can persist per-leg emissions
    transport: transportResult.legsWithEmissions,
    energy: {
      electricityKg: round2(energyResult.electricityKg),
      gasKg:         round2(energyResult.gasKg),
      emissionsKg:   round2(energyResult.totalKg),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// XP Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeXP — calculate how many XP points to award for a single log.
 *
 * Rules:
 *   - Base: 10 XP per log submitted (showing up matters)
 *   - Baseline bonus: +20 XP if calculatedCarbonKg < baselineCarbon
 *   - Savings bonus: +1 XP per full kg saved below baseline (max 50 XP)
 *   - Streak multiplier:
 *       streak 7–13  → ×1.25
 *       streak 14–29 → ×1.5
 *       streak ≥ 30  → ×2.0
 *
 * @param {{ calculatedCarbonKg: number, baselineCarbon: number, streak: number }} params
 * @returns {{ xp: number, beatBaseline: boolean, savedKg: number }}
 */
const computeXP = ({ calculatedCarbonKg, baselineCarbon, streak = 0 }) => {
  const beatBaseline = calculatedCarbonKg < baselineCarbon;
  const savedKg      = beatBaseline ? round2(baselineCarbon - calculatedCarbonKg) : 0;

  let xp = 10; // Participation XP — always awarded

  if (beatBaseline) {
    xp += 20;                             // Baseline bonus
    xp += Math.min(50, Math.floor(savedKg)); // Savings bonus capped at 50
  }

  // Apply streak multiplier
  let multiplier = 1.0;
  if (streak >= 30)      multiplier = 2.0;
  else if (streak >= 14) multiplier = 1.5;
  else if (streak >= 7)  multiplier = 1.25;

  const finalXP = Math.round(xp * multiplier);

  return { xp: finalXP, beatBaseline, savedKg };
};

// ─────────────────────────────────────────────────────────────────────────────
// Streak Engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * computeStreak — determine the new streak length given the last log date
 * and the current log date (both UTC midnight Date objects).
 *
 * Streak continues if logDate is exactly one calendar day after lastLogDate.
 * Streak resets to 1 for any gap > 1 day, or for the very first log.
 *
 * @param {{ lastLogDate: Date|null, currentLogDate: Date, currentStreak: number }} params
 * @returns {{ newStreak: number, streakContinued: boolean }}
 */
const computeStreak = ({ lastLogDate, currentLogDate, currentStreak }) => {
  if (!lastLogDate) {
    return { newStreak: 1, streakContinued: false };
  }

  const msPerDay = 86_400_000;
  const diffDays = Math.round((currentLogDate - lastLogDate) / msPerDay);

  if (diffDays === 1) {
    return { newStreak: currentStreak + 1, streakContinued: true };
  }

  // Gap of 0 means same calendar day — should not happen due to unique index,
  // but handled defensively.
  return { newStreak: diffDays === 0 ? currentStreak : 1, streakContinued: false };
};

// ─────────────────────────────────────────────────────────────────────────────
// Badge Eligibility Checks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * evaluateBadges — given the full post-log user state, return an array of
 * badge codes that should be newly awarded.
 *
 * Designed to be called after the user document has been updated in memory
 * (but before saving) so we always evaluate against the latest values.
 *
 * @param {object} params
 * @param {number}  params.totalLogs
 * @param {number}  params.newStreak
 * @param {boolean} params.beatBaseline
 * @param {boolean} params.firstTimeBeatingBaseline
 * @param {number}  params.averageDailyCarbonKg   — updated average after this log
 * @param {number}  params.baselineCarbon
 * @param {string}  params.diet
 * @param {Array}   params.transport               — annotated legs
 * @param {number}  params.electricityKwh
 * @param {object}  params.user                   — the User document (to call hasBadge)
 * @param {object}  params.streakContext           — { greenDays, plantDays, lowEnergyDays }
 *
 * @returns {string[]} array of badge codes to award
 */
const evaluateBadges = ({
  totalLogs,
  newStreak,
  beatBaseline,
  firstTimeBeatingBaseline,
  averageDailyCarbonKg,
  baselineCarbon,
  streakContext = {},
  user,
}) => {
  const toAward = [];
  const check   = (code, condition) => {
    if (condition && !user.hasBadge(code)) toAward.push(code);
  };

  // Milestone logs
  check('FIRST_LOG', totalLogs === 1);

  // Streak badges
  check('WEEK_STREAK',  newStreak >= 7);
  check('MONTH_STREAK', newStreak >= 30);

  // Baseline badges
  check('BASELINE_BEATER', firstTimeBeatingBaseline);

  // Percentage reduction badges (based on updated lifetime average)
  if (baselineCarbon > 0 && totalLogs >= 7) {
    const reductionPct = ((baselineCarbon - averageDailyCarbonKg) / baselineCarbon) * 100;
    check('CARBON_CUTTER_10', reductionPct >= 10);
    check('CARBON_CUTTER_25', reductionPct >= 25);
    check('CARBON_CUTTER_50', reductionPct >= 50);
  }

  // Behaviour-specific streak badges (tracked by controller via streakContext)
  check('GREEN_COMMUTER',  (streakContext.greenCommuteDays  ?? 0) >= 5);
  check('PLANT_WEEK',      (streakContext.plantDays         ?? 0) >= 7);
  check('LOW_ENERGY_HERO', (streakContext.lowEnergyDays     ?? 0) >= 3);

  return toAward;
};

module.exports = {
  calculate,
  computeXP,
  computeStreak,
  evaluateBadges,
  // Export factor tables for tests and documentation
  TRANSPORT_FACTORS,
  DIET_FACTORS,
  ENERGY_FACTORS,
};
