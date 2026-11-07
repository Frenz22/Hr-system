const db = require('../config/db');
const { toNotification } = require('../utils/serializers');

async function notify(userId, { message, type = 'system' }) {
  const result = await db.query(
    'INSERT INTO notifications (user_id, message, type, is_read) VALUES ($1, $2, $3, false) RETURNING *',
    [userId, message, type]
  );
  return toNotification(result.rows[0]);
}

async function notifyAdmins({
  message,
  type = 'system',
  excludeUserId = null,
  excludeSystemAdmin = false,
} = {}) {
  const params = [];
  let where = "role IN ('admin', 'hr_staff')";
  if (excludeUserId) {
    params.push(excludeUserId);
    where += ' AND id != $1';
  }
  if (excludeSystemAdmin) {
    where += ' AND is_system_admin = FALSE';
  }

  const { rows: admins } = await db.query(`SELECT id FROM users WHERE ${where}`, params);
  if (admins.length === 0) return [];

  const values = [];
  const placeholders = admins
    .map((admin, i) => {
      const offset = i * 3;
      values.push(admin.id, message, type);
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, false)`;
    })
    .join(',');

  const result = await db.query(
    `INSERT INTO notifications (user_id, message, type, is_read) VALUES ${placeholders} RETURNING *`,
    values
  );

  return result.rows.map(toNotification);
}

async function listForUser(userId, limit = 15) {
  const { rows } = await db.query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
  return rows.map(toNotification);
}

async function markRead(userId, notificationId) {
  const id = Number(notificationId);
  if (!Number.isInteger(id) || id < 1) return null;

  const result = await db.query(
    'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  return result.rows[0] ? toNotification(result.rows[0]) : null;
}

async function markAllRead(userId) {
  const result = await db.query(
    'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false RETURNING *',
    [userId]
  );
  return result.rows.map(toNotification);
}

module.exports = { notify, notifyAdmins, listForUser, markRead, markAllRead };
