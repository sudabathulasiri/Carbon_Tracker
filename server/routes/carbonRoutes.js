/**
 * routes/carbonRoutes.js — Carbon Footprint Tracker
 *
 * Mounts at: /api/v1/carbon  (registered in app.js)
 *
 * Route map:
 *   POST   /log           — submit a daily carbon log
 *   GET    /logs          — paginated history of the user's logs
 *   GET    /logs/:id      — single log detail
 *   GET    /stats         — aggregated lifetime statistics
 *   GET    /dashboard     — lightweight combined payload for the main screen
 *
 * Every route requires a valid JWT (enforced by the protect middleware).
 * Input validation uses express-validator chains; results checked by
 * validateRequest before the controller is invoked.
 */

'use strict';

const { Router }        = require('express');
const { body, param, query } = require('express-validator');

const { protect }         = require('../middleware/auth');
const validateRequest     = require('../middleware/validateRequest');
const {
  submitLog,
  getMyLogs,
  getLogById,
  getStats,
  getDashboard,
} = require('../controllers/carbonController');

const Log = require('../models/Log');

const router = Router();

// All carbon routes require authentication
router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// Validation chains
// ─────────────────────────────────────────────────────────────────────────────

/**
 * transportLegRules — validates a single entry in the transport array.
 * express-validator supports wildcard paths for array elements.
 */
const transportLegRules = [
  body('transport')
    .optional()
    .isArray({ max: 10 })
    .withMessage('transport must be an array with at most 10 entries.'),

  body('transport.*.mode')
    .notEmpty()
    .withMessage('Each transport entry must have a mode.')
    .isIn(Log.TRANSPORT_MODES)
    .withMessage(`mode must be one of: ${Log.TRANSPORT_MODES.join(', ')}.`),

  body('transport.*.distanceKm')
    .notEmpty()
    .withMessage('Each transport entry must have a distanceKm value.')
    .isFloat({ min: 0, max: 20000 })
    .withMessage('distanceKm must be a number between 0 and 20,000.'),
];

const submitLogRules = [
  // Diet — required
  body('diet')
    .notEmpty()
    .withMessage('Diet type is required.')
    .isIn(Log.DIET_TYPES)
    .withMessage(`diet must be one of: ${Log.DIET_TYPES.join(', ')}.`),

  // Energy — required object
  body('energy')
    .notEmpty()
    .withMessage('Energy usage object is required.')
    .isObject()
    .withMessage('energy must be an object.'),

  body('energy.electricityKwh')
    .notEmpty()
    .withMessage('energy.electricityKwh is required.')
    .isFloat({ min: 0, max: 500 })
    .withMessage('electricityKwh must be between 0 and 500.'),

  body('energy.naturalGasKwh')
    .optional()
    .isFloat({ min: 0, max: 500 })
    .withMessage('naturalGasKwh must be between 0 and 500.'),

  // Transport — optional (defaults to empty array in controller)
  ...transportLegRules,

  // Log date — optional (defaults to today)
  body('logDate')
    .optional()
    .isISO8601()
    .withMessage('logDate must be a valid ISO 8601 date string (YYYY-MM-DD).'),

  // Notes — optional
  body('notes')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('notes cannot exceed 500 characters.'),
];

const getLogsRules = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer.'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100.'),

  query('from')
    .optional()
    .isISO8601()
    .withMessage('from must be a valid ISO 8601 date string.'),

  query('to')
    .optional()
    .isISO8601()
    .withMessage('to must be a valid ISO 8601 date string.'),
];

const logIdRule = [
  param('id')
    .notEmpty()
    .withMessage('Log ID is required.')
    .isMongoId()
    .withMessage('Log ID must be a valid MongoDB ObjectId.'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Route Definitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/carbon/log
 * Submit a daily carbon footprint log.
 *
 * Body:
 *   {
 *     diet:      "vegan" | "vegetarian" | "pescatarian" | "meat_low" | "meat_medium" | "meat_heavy"
 *     energy:    { electricityKwh: number, naturalGasKwh?: number }
 *     transport: [{ mode: string, distanceKm: number }, ...]   // optional
 *     logDate:   "YYYY-MM-DD"                                  // optional, defaults to today
 *     notes:     "string"                                      // optional
 *   }
 */
router.post('/log', submitLogRules, validateRequest, submitLog);

/**
 * GET /api/v1/carbon/logs
 * Retrieve the authenticated user's log history, paginated.
 *
 * Query params: page, limit, from (ISO date), to (ISO date)
 */
router.get('/logs', getLogsRules, validateRequest, getMyLogs);

/**
 * GET /api/v1/carbon/logs/:id
 * Retrieve a single log by its MongoDB ObjectId.
 */
router.get('/logs/:id', logIdRule, validateRequest, getLogById);

/**
 * GET /api/v1/carbon/stats
 * Return aggregated statistics for the authenticated user:
 * total logs, average / min / max daily carbon, monthly trend,
 * category breakdown, and full gamification state.
 */
router.get('/stats', getStats);

/**
 * GET /api/v1/carbon/dashboard
 * Lightweight payload for the main screen:
 * user summary, last 7 days of logs, today's log status.
 */
router.get('/dashboard', getDashboard);

module.exports = router;
