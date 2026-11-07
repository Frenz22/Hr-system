const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { toUser, toSalary } = require('../utils/serializers');
const { notify } = require('./notification.service');

const SALARY_FIELDS = {
  basic: 'salary_basic',
  hra: 'salary_hra',
  allowances: 'salary_allowances',
  deductions: 'salary_deductions',
};

async function getOwn(userId) {
  const { rows } = await db.query(
    'SELECT salary_basic, salary_hra, salary_allowances, salary_deductions FROM profiles WHERE user_id = $1',
    [userId]
  );
  return { salary: toSalary(rows[0] || {}) };
}

async function adminList({ page = 1, limit = 15, search = '' } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 15));
  const offset = (pageNum - 1) * limitNum;

  let query = `SELECT u.id, u.employee_id, u.email, u.role,
                      p.salary_basic, p.salary_hra, p.salary_allowances, p.salary_deductions,
                      p.first_name, p.last_name
               FROM users u LEFT JOIN profiles p ON u.id = p.user_id`;
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    query += ` WHERE (u.email ILIKE $${params.length} OR u.employee_id ILIKE $${params.length})`;
  }

  const listParams = [...params, limitNum, offset];
  query += ` ORDER BY u.employee_id ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`;
  const { rows: results } = await db.query(query, listParams);

  const { rows: countRows } = await db.query(
    `SELECT count(*) FROM users u${search ? ' WHERE (u.email ILIKE $1 OR u.employee_id ILIKE $1)' : ''}`,
    params
  );
  const total = parseInt(countRows[0].count, 10);

  const rows = results.map((r) => ({
    user: toUser(r),
    name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
    salary: toSalary(r),
  }));

  return { rows, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 };
}

async function adminGet(userId) {
  const userResult = await db.query('SELECT id, employee_id, email, role FROM users WHERE id = $1', [userId]);
  const user = userResult.rows[0];
  if (!user) throw new ApiError(404, 'User not found');

  const profileResult = await db.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  return { user: toUser(user), salary: toSalary(profileResult.rows[0] || {}) };
}

async function adminUpdate(userId, body = {}) {
  const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rows.length === 0) throw new ApiError(404, 'User not found');

  const columns = [];
  const values = [];

  for (const [field, column] of Object.entries(SALARY_FIELDS)) {
    if (body[field] === undefined) continue;
    const amount = Number(body[field]);
    if (Number.isNaN(amount) || amount < 0) {
      throw new ApiError(400, `${field} must be a non-negative number`);
    }
    columns.push(column);
    values.push(amount);
  }

  if (columns.length === 0) throw new ApiError(400, 'No salary fields supplied');

  // Column list, values and SET clause are all derived from the same ordered
  // list, so a partial update writes the fields it was given and nothing else.
  const placeholders = columns.map((_, i) => `$${i + 2}`).join(', ');
  const updates = columns.map((column) => `${column} = EXCLUDED.${column}`).join(', ');

  await db.query(
    `INSERT INTO profiles (user_id, ${columns.join(', ')})
     VALUES ($1, ${placeholders})
     ON CONFLICT (user_id) DO UPDATE SET ${updates}`,
    [userId, ...values]
  );

  await notify(userId, {
    message: 'Your salary structure was updated by HR.',
    type: 'payroll',
  });

  const final = await db.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  return { salary: toSalary(final.rows[0] || {}) };
}

module.exports = { getOwn, adminList, adminGet, adminUpdate };
