const env = require('../config/env');

class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // PostgreSQL SQLSTATE codes
  const PG_ERRORS = {
    '23505': [409, 'A record with that value already exists'],
    '23503': [400, 'That related record does not exist'],
    '23502': [400, 'A required value is missing'],
    '22P02': [400, 'Invalid identifier or value'],
    '22007': [400, 'Invalid date'],
  };
  if (PG_ERRORS[err.code]) {
    const [status, message] = PG_ERRORS[err.code];
    return res.status(status).json({ error: message });
  }
  // Mongo duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {}).join(', ');
    return res.status(409).json({ error: `Duplicate value for: ${field}` });
  }
  // Mongoose validation
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: Object.values(err.errors).map((e) => e.message),
    });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path}: ${err.value}` });
  }
  // Multer file-size / upload errors
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }

  const status = err.status || 500;
  const body = { error: status === 500 && env.isProd ? 'Internal server error' : err.message };
  if (err.details) body.details = err.details;
  if (status === 500 && !env.isProd) console.error(err);
  return res.status(status).json(body);
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

module.exports = { ApiError, errorHandler, notFound };
