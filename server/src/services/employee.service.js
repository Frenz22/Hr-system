const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { toUser } = require('../utils/serializers');
const bcrypt = require('bcryptjs');

// HR/admin provisioning. The payload is flat camelCase, matching every other
// endpoint. User and profile rows are created in one transaction so a failure
// cannot leave an account without a profile.
async function createEmployeeAccount({
  employeeId,
  email,
  password,
  role = 'employee',
  firstName = '',
  lastName = '',
  phone = '',
  address = '',
  designation = '',
  departmentId = null,
  joiningDate = null,
  employmentType = 'full-time',
}, actorRole) {
  if (!['employee', 'hr_staff', 'admin'].includes(role)) {
    throw new ApiError(400, 'Invalid account role');
  }
  if (role === 'admin' && actorRole !== 'admin') {
    throw new ApiError(403, 'Only admins can create admin accounts');
  }
  const normalizedEmail = email.toLowerCase();
  const normalizedEmployeeId = employeeId.toUpperCase();

  const existing = await db.query(
    'SELECT id FROM users WHERE email = $1 OR employee_id = $2',
    [normalizedEmail, normalizedEmployeeId]
  );
  if (existing.rows.length > 0) {
    throw new ApiError(409, 'An account with this email or employee ID already exists');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const department = departmentId === '' || departmentId === null || departmentId === undefined
    ? null
    : Number(departmentId);
  if (department !== null && (!Number.isInteger(department) || department < 1)) {
    throw new ApiError(400, 'Invalid department');
  }

  return db.withTransaction(async (client) => {
    const userResult = await client.query(
      `INSERT INTO users (employee_id, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, employee_id, email, role`,
      [normalizedEmployeeId, normalizedEmail, passwordHash, role]
    );

    const user = userResult.rows[0];

    await client.query(
      `INSERT INTO profiles
         (user_id, first_name, last_name, phone, address, designation,
          department_id, joining_date, employment_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        user.id,
        firstName,
        lastName,
        phone,
        address,
        designation,
        department,
        joiningDate || null,
        employmentType,
      ]
    );

    return toUser(user);
  });
}

async function updateRole(actorId, userId, role) {
  const targetId = Number(userId);
  if (!Number.isInteger(targetId) || targetId < 1) throw new ApiError(400, 'Invalid user id');
  if (!['employee', 'hr_staff', 'admin'].includes(role)) throw new ApiError(400, 'Invalid role');
  if (String(actorId) === String(targetId)) {
    throw new ApiError(400, 'You cannot change your own role');
  }

  const result = await db.query(
    `UPDATE users
        SET role = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND is_system_admin = FALSE
      RETURNING id, employee_id, email, role, is_system_admin`,
    [targetId, role]
  );
  if (!result.rows[0]) {
    const { rows } = await db.query('SELECT id, is_system_admin FROM users WHERE id = $1', [targetId]);
    if (!rows[0]) throw new ApiError(404, 'User not found');
    if (rows[0].is_system_admin) throw new ApiError(403, 'The system administrator account cannot be demoted');
  }
  return toUser(result.rows[0]);
}

module.exports = { createEmployeeAccount, updateRole };
