const db = require('../config/db');
const { ApiError } = require('./errorHandler');

async function feedbackAdmin(req, res, next) {
  try {
    const { rows } = await db.query(
      'SELECT id FROM users WHERE id = $1 AND email = $2 AND role = $3',
      [req.user.id, 'admin@gmail.com', 'admin']
    );
    if (!rows[0]) {
      return next(new ApiError(403, 'Only admin@gmail.com can manage feedback'));
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = feedbackAdmin;
