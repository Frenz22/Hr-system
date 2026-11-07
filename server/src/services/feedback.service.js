const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');

const CATEGORIES = ['Bug Report', 'Feature Request', 'UI / Usability', 'Other'];
const STATUSES = ['new', 'in_review', 'resolved'];

function feedbackRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    submitterName: row.submitterName,
    submitterEmail: row.submitterEmail,
    category: row.category,
    message: row.message,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function submit(userId, { category, message }) {
  if (!CATEGORIES.includes(category)) {
    throw new ApiError(400, 'Choose a valid feedback category');
  }
  if (typeof message !== 'string') {
    throw new ApiError(400, 'Message is required');
  }
  const cleanMessage = message
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
  if (!cleanMessage || cleanMessage.length > 2000) {
    throw new ApiError(400, 'Message must contain 1 to 2000 characters');
  }

  const { rows } = await db.query(
    `INSERT INTO feedback (user_id, submitter_name, submitter_email, category, message)
     SELECT u.id,
            COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''), u.email),
            u.email, $2, $3
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1
      RETURNING id, user_id AS "userId", submitter_name AS "submitterName",
                submitter_email AS "submitterEmail", category, message, status,
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    [userId, category, cleanMessage]
  );
  if (!rows[0]) throw new ApiError(401, 'Authenticated account is no longer available');
  return feedbackRow(rows[0]);
}

async function list({ category, status, sort }) {
  const conditions = [];
  const values = [];
  if (category) {
    values.push(category);
    conditions.push(`category = $${values.length}`);
  }
  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const direction = sort === 'oldest' ? 'ASC' : 'DESC';
  const { rows } = await db.query(
    `SELECT id, user_id AS "userId", submitter_name AS "submitterName",
            submitter_email AS "submitterEmail", category, message, status,
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM feedback ${where}
      ORDER BY created_at ${direction}, id ${direction}`,
    values
  );
  return rows.map(feedbackRow);
}

async function updateStatus(id, status) {
  if (!STATUSES.includes(status)) throw new ApiError(400, 'Choose a valid feedback status');
  const { rows } = await db.query(
    `UPDATE feedback
        SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, user_id AS "userId", submitter_name AS "submitterName",
                submitter_email AS "submitterEmail", category, message, status,
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    [status, id]
  );
  if (!rows[0]) throw new ApiError(404, 'Feedback submission not found');
  return feedbackRow(rows[0]);
}

async function remove(id) {
  const { rows } = await db.query('DELETE FROM feedback WHERE id = $1 RETURNING id', [id]);
  if (!rows[0]) throw new ApiError(404, 'Feedback submission not found');
  return rows[0].id;
}

module.exports = { CATEGORIES, STATUSES, submit, list, updateStatus, remove };
