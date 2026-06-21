/**
 * controllers/carbonController.js — Carbon Footprint Tracker
 *
 * Handles all business logic for carbon log creation and retrieval:
 *
 *   submitLog    POST /api/v1/carbon/log
 *   getMyLogs    GET  /api/v1/carbon/logs
 *   getLogById   GET  /api/v1/carbon/logs/:id
 *   getStats     GET  /api/v1/carbon/stats
 *   getDashboard GET  /api/v1/carbon/dashboard
 *
 * All handlers follow the pattern:
 *   1. Validate inputs (express-validator results checked by validateRequest middleware)
 *   2. Compute pure values via carbonEngine (no side effects)
 *   3. Read / write MongoDB in a logical transaction order
 *   4. Return a consistent { success, data, message } response shape
 */

'use strict';

const mongoose = require('mongoose');
const User     = require('../models/User');
const Log      = require('../models/Log');
const engine   = require('../utils/carbonEngine');
const logger   = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * toUTCMidnight — zero the time component of a Date so that two logs on the
 * same calendar day map to the same Date value (required for the unique index).
 *
 * @param {Date|string} date
 * @returns {Date}
 */
const toUTCMidnight = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * asyncHandler — wraps async route handlers so uncaught rejections are forwarded
 * to Express's error middleware without try/catch boilerplate in every handler.
 *
 * @param {Function} fn
 * @returns {Function}
 */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─────────────────────────────────────────────────────────────────────────────
// submitLog
// POST /api/v1/carbon/log
// ─────────────────────────────────────────────────────────────────────────────

/**
 * submitLog — the core write path.
 *
 * Flow:
 *   1. Parse and normalise the log date to UTC midnight.
 *   2. Guard against duplicate logs for the same day.
 *   3. Run the carbon engine to get emissions breakdown.
 *   4. Run the XP and streak engines.
 *   5. Evaluate badge eligibility.
 *   6. Persist the Log document.
 *   7. Atomically update the User document.
 *   8. Return the full result including any newly awarded badges.
 */
const submitLog = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { transport = [], diet, energy, notes = '', logDate } = req.body;

  // ── 1. Normalise log date ─────────────────────────────────────────────────
  const targetDate = toUTCMidnight(logDate || new Date());

  // Guard: cannot log a future date
  const todayMidnight = toUTCMidnight(new Date());
  if (targetDate > todayMidnight) {
    return res.status(400).json({
      success: false,
      message: 'You cannot submit a log for a future date.',
    });
  }

  // ── 2. Duplicate check ────────────────────────────────────────────────────
  const existingLog = await Log.findOne({ user: userId, logDate: targetDate }).select('_id').lean();
  if (existingLog) {
    return res.status(409).json({
      success: false,
      message: `A log for ${targetDate.toISOString().slice(0, 10)} already exists.`,
      data: { existingLogId: existingLog._id },
    });
  }

  // ── 3. Fetch user (need baseline + streak state) ──────────────────────────
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    return res.status(404).json({ success: false, message: 'User account not found.' });
  }

  // ── 4. Carbon engine ──────────────────────────────────────────────────────
  const carbonResult = engine.calculate({ transport, diet, energy });
  const { totalCarbonKg, breakdown, transport: annotatedLegs, energy: energyBreakdown } = carbonResult;

  // ── 5. Streak engine ──────────────────────────────────────────────────────
  let newStreak = user.currentStreak;
  let streakContinued = false;

  const isLatestLog = !user.lastLogDate || targetDate > user.lastLogDate;

  if (isLatestLog) {
    const streakResult = engine.computeStreak({
      lastLogDate:    user.lastLogDate,
      currentLogDate: targetDate,
      currentStreak:  user.currentStreak,
    });
    newStreak = streakResult.newStreak;
    streakContinued = streakResult.streakContinued;
  }

  // ── 6. XP engine ─────────────────────────────────────────────────────────
  const { xp, beatBaseline, savedKg } = engine.computeXP({
    calculatedCarbonKg: totalCarbonKg,
    baselineCarbon:     user.baselineCarbon,
    streak:             newStreak,
  });

  // ── 7. Determine if this is the first time beating baseline ───────────────
  const firstTimeBeatingBaseline = beatBaseline && !user.hasBadge('BASELINE_BEATER');

  // ── 8. Compute updated aggregate stats (in-memory, not yet saved) ─────────
  const updatedTotalLogs        = user.totalLogs + 1;
  const updatedTotalCarbonKg    = user.totalCarbonKg + totalCarbonKg;
  const updatedTotalSavedKg     = user.totalCarbonSavedKg + (beatBaseline ? savedKg : 0);
  const updatedAverageDailyCarbon = updatedTotalCarbonKg / updatedTotalLogs;

  // ── 9. Derive behaviour-specific streak counters for badge evaluation ──────
  // Query the last N logs to count consecutive themed days.
  // We look back only as far as needed per badge threshold.
  const recentLogs = await Log.find({ user: userId })
    .sort({ logDate: -1 })
    .limit(30)
    .select('diet transport energy.electricityKwh')
    .lean();

  const streakContext = deriveStreakContext(recentLogs, { diet, transport, energy });

  // ── 10. Badge evaluation ─────────────────────────────────────────────────
  // Apply streak/stat changes to user in memory so hasBadge checks are current.
  if (isLatestLog) {
    user.currentStreak      = newStreak;
    user.lastLogDate        = targetDate;
    if (newStreak > user.longestStreak) user.longestStreak = newStreak;
  }
  user.currentXP         += xp;
  user.totalLogs          = updatedTotalLogs;
  user.totalCarbonKg      = updatedTotalCarbonKg;
  user.totalCarbonSavedKg = updatedTotalSavedKg;

  const badgeCodesToAward = engine.evaluateBadges({
    totalLogs:              updatedTotalLogs,
    newStreak,
    beatBaseline,
    firstTimeBeatingBaseline,
    averageDailyCarbonKg:   updatedAverageDailyCarbon,
    baselineCarbon:         user.baselineCarbon,
    streakContext,
    user,
  });

  const newBadges = badgeCodesToAward
    .map((code) => {
      const awarded = user.awardBadge(code);
      return awarded ? user.badges.find((b) => b.code === code) : null;
    })
    .filter(Boolean);

  // ── 11. Build the transport array with per-leg emissions for storage ───────
  const transportForStorage = annotatedLegs.map((leg) => ({
    mode:        leg.mode,
    distanceKm:  leg.distanceKm,
    emissionsKg: leg.emissionsKg,
  }));

  // ── 12. Persist Log document ──────────────────────────────────────────────
  const log = await Log.create({
    user:              userId,
    logDate:           targetDate,
    transport:         transportForStorage,
    diet,
    energy: {
      electricityKwh: energy.electricityKwh,
      naturalGasKwh:  energy.naturalGasKwh ?? 0,
      emissionsKg:    energyBreakdown.emissionsKg,
    },
    calculatedCarbonKg: totalCarbonKg,
    breakdown,
    beatBaseline,
    xpAwarded: xp,
    notes,
  });

  // ── 13. Persist updated User document ────────────────────────────────────
  await user.save();

  logger.info(`Log submitted: user=${userId} date=${targetDate.toISOString().slice(0, 10)} carbon=${totalCarbonKg}kg xp=+${xp}`);

  // ── 14. Response ──────────────────────────────────────────────────────────
  return res.status(201).json({
    success: true,
    message: beatBaseline
      ? `Great work! You beat your baseline by ${savedKg.toFixed(2)} kg CO₂e and earned ${xp} XP.`
      : `Log saved. You emitted ${totalCarbonKg} kg CO₂e today.`,
    data: {
      log: {
        id:                 log._id,
        logDate:            log.logDateFormatted,
        calculatedCarbonKg: totalCarbonKg,
        breakdown,
        beatBaseline,
        savedKg,
        xpAwarded:          xp,
        notes,
      },
      gamification: {
        xpAwarded:      xp,
        totalXP:        user.currentXP,
        level:          user.level,
        xpToNextLevel:  user.xpToNextLevel,
        currentStreak:  newStreak,
        longestStreak:  user.longestStreak,
        streakContinued,
        newBadges,
      },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMyLogs
// GET /api/v1/carbon/logs?page=1&limit=20&from=YYYY-MM-DD&to=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────

const getMyLogs = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const skip   = (page - 1) * limit;

  // Optional date range filter
  const dateFilter = {};
  if (req.query.from) dateFilter.$gte = toUTCMidnight(req.query.from);
  if (req.query.to)   dateFilter.$lte = toUTCMidnight(req.query.to);

  const query = {
    user: userId,
    ...(Object.keys(dateFilter).length && { logDate: dateFilter }),
  };

  const [logs, total] = await Promise.all([
    Log.find(query).sort({ logDate: -1 }).skip(skip).limit(limit).lean(),
    Log.countDocuments(query),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
      },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getLogById
// GET /api/v1/carbon/logs/:id
// ─────────────────────────────────────────────────────────────────────────────

const getLogById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid log ID format.' });
  }

  const log = await Log.findOne({ _id: id, user: req.user.id }).lean();

  if (!log) {
    return res.status(404).json({ success: false, message: 'Log not found.' });
  }

  return res.status(200).json({ success: true, data: { log } });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStats
// GET /api/v1/carbon/stats
// Returns aggregated statistics for the authenticated user
// ─────────────────────────────────────────────────────────────────────────────

const getStats = asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.id);

  // Single aggregation pipeline — avoids multiple round trips
  const [stats] = await Log.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id:              null,
        totalLogs:        { $sum: 1 },
        totalCarbonKg:    { $sum: '$calculatedCarbonKg' },
        avgDailyCarbonKg: { $avg: '$calculatedCarbonKg' },
        minDayCarbonKg:   { $min: '$calculatedCarbonKg' },
        maxDayCarbonKg:   { $max: '$calculatedCarbonKg' },
        baselineBeaten:   { $sum: { $cond: ['$beatBaseline', 1, 0] } },
        totalXPAwarded:   { $sum: '$xpAwarded' },
        totalSavedKg: 0,
      },
    },
    {
      $project: {
        _id:              0,
        totalLogs:        1,
        totalCarbonKg:    { $round: ['$totalCarbonKg', 2] },
        avgDailyCarbonKg: { $round: ['$avgDailyCarbonKg', 2] },
        minDayCarbonKg:   { $round: ['$minDayCarbonKg', 2] },
        maxDayCarbonKg:   { $round: ['$maxDayCarbonKg', 2] },
        baselineBeaten:   1,
        totalXPAwarded:   1,
      },
    },
  ]);

  // Monthly trend: total emissions per calendar month for the past 12 months
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setUTCMonth(twelveMonthsAgo.getUTCMonth() - 11);
  twelveMonthsAgo.setUTCDate(1);
  twelveMonthsAgo.setUTCHours(0, 0, 0, 0);

  const monthlyTrend = await Log.aggregate([
    { $match: { user: userId, logDate: { $gte: twelveMonthsAgo } } },
    {
      $group: {
        _id: {
          year:  { $year:  '$logDate' },
          month: { $month: '$logDate' },
        },
        totalCarbonKg:    { $sum: '$calculatedCarbonKg' },
        avgDailyCarbonKg: { $avg: '$calculatedCarbonKg' },
        logCount:         { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
    {
      $project: {
        _id:              0,
        year:             '$_id.year',
        month:            '$_id.month',
        totalCarbonKg:    { $round: ['$totalCarbonKg', 2] },
        avgDailyCarbonKg: { $round: ['$avgDailyCarbonKg', 2] },
        logCount:         1,
      },
    },
  ]);

  // Category breakdown averaged across all logs
  const [categoryAvg] = await Log.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id:            null,
        avgTransportKg: { $avg: '$breakdown.transportKg' },
        avgDietKg:      { $avg: '$breakdown.dietKg' },
        avgEnergyKg:    { $avg: '$breakdown.energyKg' },
      },
    },
    {
      $project: {
        _id:            0,
        avgTransportKg: { $round: ['$avgTransportKg', 2] },
        avgDietKg:      { $round: ['$avgDietKg', 2] },
        avgEnergyKg:    { $round: ['$avgEnergyKg', 2] },
      },
    },
  ]);

  const user = await User.findById(userId).select(
    'baselineCarbon currentXP currentStreak longestStreak totalCarbonSavedKg badges'
  );

  return res.status(200).json({
    success: true,
    data: {
      overview: stats || {
        totalLogs: 0,
        totalCarbonKg: 0,
        avgDailyCarbonKg: 0,
        minDayCarbonKg: 0,
        maxDayCarbonKg: 0,
        baselineBeaten: 0,
        totalXPAwarded: 0,
      },
      categoryAverages: categoryAvg || { avgTransportKg: 0, avgDietKg: 0, avgEnergyKg: 0 },
      monthlyTrend,
      gamification: {
        currentXP:          user.currentXP,
        level:              user.level,
        xpToNextLevel:      user.xpToNextLevel,
        currentStreak:      user.currentStreak,
        longestStreak:      user.longestStreak,
        totalCarbonSavedKg: user.totalCarbonSavedKg,
        badgeCount:         user.badges.length,
        badges:             user.badges,
        baselineCarbon:     user.baselineCarbon,
      },
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getDashboard
// GET /api/v1/carbon/dashboard
// Lightweight combined payload for the app's main dashboard screen
// ─────────────────────────────────────────────────────────────────────────────

const getDashboard = asyncHandler(async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.user.id);

  // Last 7 days of logs for the week-at-a-glance chart
  let sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  sevenDaysAgo = toUTCMidnight(sevenDaysAgo);

  const [user, recentLogs] = await Promise.all([
    User.findById(userId).select(
      'name baselineCarbon currentXP currentStreak longestStreak totalCarbonSavedKg totalLogs badges lastLogDate'
    ),
    Log.find({ user: userId, logDate: { $gte: sevenDaysAgo } })
      .sort({ logDate: -1 })
      .limit(7)
      .select('logDate calculatedCarbonKg breakdown beatBaseline xpAwarded')
      .lean(),
  ]);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  // Has the user already logged today?
  const todayISO    = toUTCMidnight(new Date()).toISOString().slice(0, 10);
  const loggedToday = recentLogs.some((l) => l.logDate.toISOString().slice(0, 10) === todayISO);

  // Most recent badge earned
  const latestBadge = user.badges.length
    ? [...user.badges].sort((a, b) => b.awardedAt - a.awardedAt)[0]
    : null;

  return res.status(200).json({
    success: true,
    data: {
      user: {
        name:               user.name,
        baselineCarbon:     user.baselineCarbon,
        level:              user.level,
        currentXP:          user.currentXP,
        xpToNextLevel:      user.xpToNextLevel,
        currentStreak:      user.currentStreak,
        longestStreak:      user.longestStreak,
        totalCarbonSavedKg: user.totalCarbonSavedKg,
        totalLogs:          user.totalLogs,
        badgeCount:         user.badges.length,
        latestBadge,
      },
      week: recentLogs.map((l) => ({
        date:              l.logDate.toISOString().slice(0, 10),
        calculatedCarbon:  l.calculatedCarbonKg,
        breakdown:         l.breakdown,
        beatBaseline:      l.beatBaseline,
        xpAwarded:         l.xpAwarded,
      })),
      loggedToday,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Private Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * deriveStreakContext — analyse recent logs + today's input to count
 * consecutive themed days for the behaviour-specific badge checks.
 *
 * Returns:
 *   greenCommuteDays : consecutive days using only green transport
 *   plantDays        : consecutive days on vegan/vegetarian diet
 *   lowEnergyDays    : consecutive days with electricity ≤ 2 kWh
 *
 * @param {Array}  recentLogs   — last 30 logs, newest first (from DB, no today)
 * @param {object} todayInput   — today's raw input { diet, transport, energy }
 * @returns {{ greenCommuteDays: number, plantDays: number, lowEnergyDays: number }}
 */
const deriveStreakContext = (recentLogs, { diet, transport, energy }) => {
  const GREEN_MODES  = new Set(['cycling', 'walking', 'train', 'tram_metro', 'bus', 'none']);
  const PLANT_DIETS  = new Set(['vegan', 'vegetarian']);
  const LOW_ENERGY_THRESHOLD = 2; // kWh

  const isGreenCommute = (legs) =>
    legs.length === 0 || legs.every((l) => GREEN_MODES.has(l.mode));

  const isPlantDay = (d) => PLANT_DIETS.has(d);

  const isLowEnergy = (e) => (e?.electricityKwh ?? 0) <= LOW_ENERGY_THRESHOLD;

  // Prepend today as the first entry for streak counting
  const allDays = [
    { diet, transport, energy: { electricityKwh: energy?.electricityKwh ?? 0 } },
    ...recentLogs.map((l) => ({
      diet:      l.diet,
      transport: l.transport,
      energy:    { electricityKwh: l.energy?.electricityKwh ?? 0 },
    })),
  ];

  const count = (predicateFn) => {
    let streak = 0;
    for (const day of allDays) {
      if (predicateFn(day)) streak++;
      else break;
    }
    return streak;
  };

  return {
    greenCommuteDays: count((d) => isGreenCommute(d.transport)),
    plantDays:        count((d) => isPlantDay(d.diet)),
    lowEnergyDays:    count((d) => isLowEnergy(d.energy)),
  };
};

module.exports = { submitLog, getMyLogs, getLogById, getStats, getDashboard };
