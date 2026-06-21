/**
 * controllers/authController.js — Carbon Footprint Tracker
 *
 * Handles all authentication business logic:
 *
 *   register   POST /api/v1/auth/register   — create account + return JWT
 *   login      POST /api/v1/auth/login      — verify credentials + return JWT
 *   logout     POST /api/v1/auth/logout     — clear refresh token cookie
 *   me         GET  /api/v1/auth/me         — return current user profile
 *   update     PATCH /api/v1/auth/me        — update name / baseline
 *
 * Token strategy:
 *   • Access token  — short-lived JWT sent in response body; client stores
 *                     in localStorage and attaches as Bearer header.
 *   • Refresh token — longer-lived JWT stored in an httpOnly cookie;
 *                     used by /auth/refresh (Phase 5+) to issue new access tokens
 *                     without re-login.  Stored hash in User.refreshToken for
 *                     server-side invalidation.
 */

'use strict';

const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const User      = require('../models/User');
const logger    = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * asyncHandler — wraps async route handlers so uncaught rejections are forwarded
 * to Express's central error middleware without try/catch in every handler.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * setRefreshCookie — write the refresh token into a secure httpOnly cookie.
 * Cookie is scoped to /api/v1/auth so it is not sent on every API request.
 */
const setRefreshCookie = (res, refreshToken) => {
  res.cookie('ct_refresh', refreshToken, {
    httpOnly:  true,
    secure:    process.env.NODE_ENV === 'production',
    sameSite:  process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path:      '/api/v1/auth',
    maxAge:    30 * 24 * 60 * 60 * 1000, // 30 days in ms
  });
};

/**
 * clearRefreshCookie — expire the cookie on logout.
 */
const clearRefreshCookie = (res) => {
  res.cookie('ct_refresh', '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path:     '/api/v1/auth',
    maxAge:   0,
  });
};

/**
 * generateRefreshToken — sign a long-lived token used only for re-issuance.
 */
const generateRefreshToken = (userId) =>
  jwt.sign(
    { id: userId, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

/**
 * safeUser — strip sensitive fields from a User document before sending it
 * to the client.  Returns a plain object so virtuals (level, xpToNextLevel)
 * are included.
 */
const safeUser = (user) => {
  const obj = user.toObject({ virtuals: true });
  delete obj.password;
  delete obj.refreshToken;
  delete obj.__v;
  return obj;
};

// ─────────────────────────────────────────────────────────────────────────────
// register — POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new user account, generates access + refresh tokens, and returns
 * the sanitised user object along with the access token.
 *
 * Validation is performed upstream by express-validator chains in authRoutes.js.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, baselineCarbon } = req.body;

  // Guard: check for duplicate email before letting Mongoose throw a 11000
  // so we can return a cleaner message.
  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'An account with that email address already exists.',
    });
  }

  // Create the user — password is hashed by the pre-save hook in User.js
  const user = await User.create({
    name:           name.trim(),
    email:          email.toLowerCase().trim(),
    password,
    baselineCarbon: baselineCarbon ?? 12.0,
  });

  // Issue tokens
  const accessToken  = user.generateAccessToken();
  const refreshToken = generateRefreshToken(user._id);

  // Persist a hash of the refresh token so we can invalidate it on logout
  user.refreshToken = await bcrypt.hash(refreshToken, 10);
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  logger.info(`New user registered: ${user.email} (id: ${user._id})`);

  return res.status(201).json({
    success: true,
    message: 'Account created successfully. Welcome!',
    data: {
      token: accessToken,
      user:  safeUser(user),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// login — POST /api/v1/auth/login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verifies credentials and issues a fresh pair of tokens.
 *
 * Deliberately returns the same error message for "wrong email" and "wrong
 * password" to prevent user-enumeration attacks.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Fetch user with password field (it is select:false by default)
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  // Constant-time comparison — bcrypt handles this, but we call it even when
  // user is null so response time doesn't leak whether the email exists.
  const dummyHash  = '$2a$12$dummyhashtopreventtimingattacksXXXXXXXXXXXXX';
  const isMatch    = user
    ? await user.comparePassword(password)
    : await bcrypt.compare(password, dummyHash).then(() => false);

  if (!user || !isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Incorrect email or password.',
    });
  }

  if (!user.isActive) {
    return res.status(403).json({
      success: false,
      message: 'This account has been deactivated. Please contact support.',
    });
  }

  // Issue new tokens
  const accessToken  = user.generateAccessToken();
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = await bcrypt.hash(refreshToken, 10);
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, refreshToken);

  logger.info(`User logged in: ${user.email}`);

  return res.status(200).json({
    success: true,
    message: 'Logged in successfully.',
    data: {
      token: accessToken,
      user:  safeUser(user),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// logout — POST /api/v1/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Invalidates the server-side refresh token and clears the cookie.
 * The access token is short-lived so we don't need a blocklist — it will
 * naturally expire within JWT_EXPIRES_IN.
 *
 * Works even if the user's access token has already expired (no protect guard
 * on this route) because we identify the user from the refresh cookie.
 */
const logout = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.ct_refresh;

  if (refreshToken) {
    try {
      // Decode without verifying expiry so an expired refresh token still logs out
      const decoded = jwt.decode(refreshToken);
      if (decoded?.id) {
        await User.findByIdAndUpdate(decoded.id, { refreshToken: null }, { validateBeforeSave: false });
      }
    } catch {
      // Non-fatal — we still clear the cookie
    }
  }

  clearRefreshCookie(res);

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// me — GET /api/v1/auth/me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the full, up-to-date user profile for the authenticated user.
 * Called by the client after a page refresh to re-hydrate AuthContext,
 * and after a carbon log submission to pick up new XP/badges.
 *
 * Requires a valid access token (protect middleware).
 */
const me = asyncHandler(async (req, res) => {
  // req.user.id is attached by the protect middleware after JWT verification
  const user = await User.findById(req.user.id);

  if (!user || !user.isActive) {
    return res.status(404).json({
      success: false,
      message: 'User account not found.',
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      user: safeUser(user),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateMe — PATCH /api/v1/auth/me
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Allows the authenticated user to update their display name and/or carbon
 * baseline. Does NOT allow password or email changes via this endpoint —
 * those require a dedicated password-reset flow.
 */
const updateMe = asyncHandler(async (req, res) => {
  const { name, baselineCarbon } = req.body;

  const updates = {};
  if (name          != null) updates.name          = name.trim();
  if (baselineCarbon != null) updates.baselineCarbon = parseFloat(baselineCarbon);

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'No valid fields provided. Send name or baselineCarbon to update.',
    });
  }

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  logger.info(`User profile updated: ${user.email} → ${JSON.stringify(updates)}`);

  return res.status(200).json({
    success: true,
    message: 'Profile updated successfully.',
    data: { user: safeUser(user) },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// refreshToken — POST /api/v1/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Issues a new access token using the httpOnly refresh token cookie.
 * No Authorization header required — the cookie is sent automatically.
 *
 * This endpoint enables silent re-authentication when the access token expires,
 * giving users persistent sessions up to 30 days without re-entering credentials.
 */
const refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.ct_refresh;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No refresh token. Please log in again.',
    });
  }

  // Verify the refresh token signature and expiry
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    clearRefreshCookie(res);
    return res.status(401).json({
      success: false,
      message: 'Refresh token is invalid or has expired. Please log in again.',
    });
  }

  if (decoded.type !== 'refresh') {
    return res.status(401).json({ success: false, message: 'Invalid token type.' });
  }

  // Load user and verify the stored token hash matches
  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user || !user.isActive || !user.refreshToken) {
    clearRefreshCookie(res);
    return res.status(401).json({
      success: false,
      message: 'Session has been invalidated. Please log in again.',
    });
  }

  const tokenMatches = await bcrypt.compare(token, user.refreshToken);
  if (!tokenMatches) {
    // Possible token reuse attack — invalidate all sessions
    user.refreshToken = null;
    await user.save({ validateBeforeSave: false });
    clearRefreshCookie(res);
    return res.status(401).json({
      success: false,
      message: 'Session conflict detected. Please log in again.',
    });
  }

  // Issue fresh token pair (rotation: old refresh token is replaced)
  const newAccessToken  = user.generateAccessToken();
  const newRefreshToken = generateRefreshToken(user._id);

  user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
  await user.save({ validateBeforeSave: false });

  setRefreshCookie(res, newRefreshToken);

  return res.status(200).json({
    success: true,
    data: { token: newAccessToken },
  });
});

module.exports = { register, login, logout, me, updateMe, refreshToken };
