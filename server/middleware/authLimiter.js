/**
 * middleware/authLimiter.js — Carbon Footprint Tracker
 *
 * Stricter rate limiters for authentication endpoints to slow brute-force
 * and credential-stuffing attacks without affecting the global API limiter.
 *
 *   loginLimiter    — 10 attempts per IP per 15 minutes on POST /auth/login
 *   registerLimiter — 5 new accounts per IP per hour on POST /auth/register
 */

'use strict';

const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  skipSuccessfulRequests: true,    // Only count failed attempts toward the limit
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again in 15 minutes.',
  },
});

const registerLimiter = rateLimit({
  windowMs:        60 * 60 * 1000, // 1 hour
  max:             5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many accounts created from this IP. Please try again later.',
  },
});

const refreshLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many token refresh requests. Please try again shortly.',
  },
});

module.exports = { loginLimiter, registerLimiter, refreshLimiter };
