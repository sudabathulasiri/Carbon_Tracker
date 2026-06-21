/**
 * middleware/validateRequest.js
 *
 * Reads the result of express-validator chains that have already run and
 * short-circuits the request with a 422 if any field failed validation.
 * Import this after your validation chain arrays in route files.
 */

'use strict';

const { validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  return res.status(422).json({
    success: false,
    message: 'Validation failed. Please check your input.',
    errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
  });
};

module.exports = validateRequest;