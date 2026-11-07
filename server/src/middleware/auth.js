const { verifyAccessToken } = require('../utils/jwt');
const { ApiError } = require('./errorHandler');
const db = require('../config/db');

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Authentication required'));
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return next(new ApiError(401, 'Invalid or expired token'));
  }

  try {
    const { rows } = await db.query(
      'SELECT id, role, token_version FROM users WHERE id = $1',
      [payload.sub]
    );
    if (!rows[0]) return next(new ApiError(401, 'Account no longer exists'));
    if (Number(payload.tokenVersion || 0) !== Number(rows[0].token_version || 0)) {
      return next(new ApiError(401, 'Session expired; sign in again'));
    }
    req.user = { id: rows[0].id, role: rows[0].role };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = auth;
