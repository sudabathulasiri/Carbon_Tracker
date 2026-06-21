/**
 * tests/middleware.test.js — Carbon Footprint Tracker
 *
 * Automated unit tests for Express middleware functions (error handler,
 * 404 route not found handler, and JWT auth guards) using Node.js's native test runner.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { errorHandler, notFound } = require('../middleware/errorHandler');
const { protect } = require('../middleware/auth');

// ─── Error Handler Middleware Tests ──────────────────────────────────────────

test('notFound middleware - catches undefined routes and forwards 404 error', () => {
  let forwardedError;
  const req = { method: 'POST', originalUrl: '/api/v1/unknown' };
  const res = {};
  const next = (err) => {
    forwardedError = err;
  };

  notFound(req, res, next);

  assert.ok(forwardedError instanceof Error);
  assert.strictEqual(forwardedError.statusCode, 404);
  assert.ok(forwardedError.message.includes('/api/v1/unknown'));
});

test('errorHandler middleware - handles generic errors with default status 500', () => {
  const err = new Error('Database connection timeout');
  const req = { method: 'GET', originalUrl: '/dashboard' };

  let statusReturned;
  let jsonReturned;

  const res = {
    status(code) {
      statusReturned = code;
      return this;
    },
    json(body) {
      jsonReturned = body;
      return this;
    }
  };

  errorHandler(err, req, res, () => {});

  assert.strictEqual(statusReturned, 500);
  assert.strictEqual(jsonReturned.success, false);
  assert.strictEqual(jsonReturned.message, 'Database connection timeout');
});

test('errorHandler middleware - parses Mongoose validation errors correctly', () => {
  const err = {
    name: 'ValidationError',
    errors: {
      email: { path: 'email', message: 'Email is required' },
      password: { path: 'password', message: 'Password is too short' }
    }
  };
  const req = { method: 'POST', originalUrl: '/auth/register' };

  let statusReturned;
  let jsonReturned;

  const res = {
    status(code) {
      statusReturned = code;
      return this;
    },
    json(body) {
      jsonReturned = body;
      return this;
    }
  };

  errorHandler(err, req, res, () => {});

  assert.strictEqual(statusReturned, 400);
  assert.strictEqual(jsonReturned.success, false);
  assert.strictEqual(jsonReturned.message, 'Validation failed');
  assert.ok(Array.isArray(jsonReturned.errors));
  assert.strictEqual(jsonReturned.errors.length, 2);
  assert.strictEqual(jsonReturned.errors[0].field, 'email');
  assert.strictEqual(jsonReturned.errors[0].message, 'Email is required');
});

// ─── JWT Protection Middleware Tests ──────────────────────────────────────────

test('protect middleware - rejects requests with missing Authorization header', () => {
  const req = { headers: {} };
  let statusReturned;
  let jsonReturned;

  const res = {
    status(code) {
      statusReturned = code;
      return this;
    },
    json(body) {
      jsonReturned = body;
      return this;
    }
  };

  protect(req, res, () => {});

  assert.strictEqual(statusReturned, 401);
  assert.strictEqual(jsonReturned.success, false);
  assert.ok(jsonReturned.message.includes('Authentication required'));
});
