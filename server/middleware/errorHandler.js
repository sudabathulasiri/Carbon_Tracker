const logger = require('../utils/logger');

/**
 * Centralised error response shape:
 * { success: false, message: string, errors?: array, stack?: string }
 */
const errorHandler = (err, req, res, next) => {
  // Default to 500 if status code not already set
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = null;

  // ─── Mongoose Validation Error ────────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // ─── Mongoose Duplicate Key ───────────────────────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `An account with that ${field} already exists.`;
  }

  // ─── Mongoose Cast Error (invalid ObjectId) ───────────────────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for field: ${err.path}`;
  }

  // ─── JWT Errors ───────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token. Please log in again.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
  }

  // Log server-side errors with full stack
  if (statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} → ${statusCode}: ${err.stack}`);
  } else {
    logger.warn(`[${req.method}] ${req.originalUrl} → ${statusCode}: ${message}`);
  }

  const body = {
    success: false,
    message,
    ...(errors && { errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  };

  res.status(statusCode).json(body);
};

/**
 * Catches requests to routes that don't exist and forwards a 404 error.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

module.exports = { errorHandler, notFound };