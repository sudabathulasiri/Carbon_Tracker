/**
 * routes/authRoutes.js — Carbon Footprint Tracker
 *
 * Mounts at: /api/v1/auth  (registered in app.js)
 *
 * Route map:
 *   POST   /register   — create a new user account
 *   POST   /login      — authenticate and receive JWT
 *   POST   /logout     — invalidate refresh token + clear cookie
 *   GET    /me         — get the authenticated user's profile  [protected]
 *   PATCH  /me         — update name or baseline              [protected]
 *   POST   /refresh    — issue new access token via refresh cookie
 *
 * All mutating routes run through express-validator chains; errors are
 * collected and returned by the validateRequest middleware before the
 * controller is ever invoked.
 */

'use strict';

const { Router }   = require('express');
const { body }     = require('express-validator');

const { protect }        = require('../middleware/auth');
const validateRequest    = require('../middleware/validateRequest');
const { loginLimiter, registerLimiter, refreshLimiter } = require('../middleware/authLimiter');
const {
  register,
  login,
  logout,
  me,
  updateMe,
  refreshToken,
} = require('../controllers/authController');

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Validation chains
// ─────────────────────────────────────────────────────────────────────────────

const registerRules = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required.')
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be between 2 and 60 characters.'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email address is required.')
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required.')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters.')
    .matches(/[A-Za-z]/)
    .withMessage('Password must contain at least one letter.')
    .matches(/[0-9]/)
    .withMessage('Password must contain at least one number.'),

  body('baselineCarbon')
    .optional()
    .isFloat({ min: 0, max: 200 })
    .withMessage('Baseline carbon must be a number between 0 and 200 kg/day.'),
];

const loginRules = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email address is required.')
    .isEmail()
    .withMessage('Please enter a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage('Password is required.'),
];

const updateMeRules = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage('Name must be between 2 and 60 characters.'),

  body('baselineCarbon')
    .optional()
    .isFloat({ min: 0, max: 200 })
    .withMessage('Baseline must be between 0 and 200 kg/day.'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/auth/register
 * Create a new user account and return an access token.
 *
 * Body: { name, email, password, baselineCarbon? }
 * Response: { success, message, data: { token, user } }
 */
router.post(
  '/register',
  registerLimiter,
  registerRules,
  validateRequest,
  register
);

/**
 * POST /api/v1/auth/login
 * Authenticate with email + password. Returns access token + sets refresh cookie.
 *
 * Body: { email, password }
 * Response: { success, message, data: { token, user } }
 */
router.post(
  '/login',
  loginLimiter,
  loginRules,
  validateRequest,
  login
);

/**
 * POST /api/v1/auth/logout
 * Clears the refresh token cookie and invalidates the server-side token hash.
 * Does NOT require a valid access token — the refresh cookie is used instead.
 *
 * Response: { success, message }
 */
router.post('/logout', logout);

/**
 * POST /api/v1/auth/refresh
 * Exchange a valid refresh token (from httpOnly cookie) for a new access token.
 * Implements refresh token rotation — the old refresh token is replaced.
 *
 * Response: { success, data: { token } }
 */
router.post('/refresh', refreshLimiter, refreshToken);

/**
 * GET /api/v1/auth/me
 * Return the authenticated user's full profile (with virtuals: level, XP, etc.)
 *
 * Headers: Authorization: Bearer <access_token>
 * Response: { success, data: { user } }
 */
router.get('/me', protect, me);

/**
 * PATCH /api/v1/auth/me
 * Update the authenticated user's display name and/or carbon baseline.
 *
 * Headers: Authorization: Bearer <access_token>
 * Body: { name?, baselineCarbon? }
 * Response: { success, message, data: { user } }
 */
router.patch('/me', protect, updateMeRules, validateRequest, updateMe);

module.exports = router;
