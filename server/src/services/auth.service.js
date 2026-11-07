const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { ApiError } = require('../middleware/errorHandler');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    employeeId: row.employee_id,
    ...(row.is_system_admin ? { isSystemAdmin: true } : {}),
  };
}

async function login({ email, password }) {
  const { rows } = await db.query(
    'SELECT id, password_hash, role, employee_id, email, is_system_admin, token_version FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const accessToken = signAccessToken({ id: user.id, role: user.role, tokenVersion: user.token_version });
  const refreshToken = signRefreshToken({ id: user.id, tokenVersion: user.token_version });

  return { accessToken, refreshToken, user: publicUser(user) };
}

async function refresh(refreshToken) {
  if (!refreshToken) throw new ApiError(401, 'Refresh token missing');

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }
  // Access tokens carry no `type`; only refresh tokens may be exchanged here.
  if (payload.type !== 'refresh') throw new ApiError(401, 'Invalid refresh token');

  const { rows } = await db.query(
    'SELECT id, email, role, employee_id, is_system_admin, token_version FROM users WHERE id = $1',
    [payload.sub]
  );
  const user = rows[0];
  if (!user) throw new ApiError(401, 'Account no longer exists');
  if (Number(payload.tokenVersion || 0) !== Number(user.token_version || 0)) {
    throw new ApiError(401, 'Refresh token is no longer valid');
  }

  return {
    accessToken: signAccessToken({ id: user.id, role: user.role, tokenVersion: user.token_version }),
    refreshToken: signRefreshToken({ id: user.id, tokenVersion: user.token_version }),
    user: publicUser(user),
  };
}

async function getMe(userId) {
  const { rows } = await db.query(
    'SELECT id, email, role, employee_id, is_system_admin FROM users WHERE id = $1',
    [userId]
  );
  if (rows.length === 0) throw new ApiError(404, 'User not found');
  return publicUser(rows[0]);
}

async function updateCredentials(userId, { currentPassword, email, newPassword, confirmPassword }) {
  const nextEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const nextPassword = typeof newPassword === 'string' ? newPassword : '';
  if (!nextEmail && !nextPassword) {
    throw new ApiError(400, 'Provide a new email address or password');
  }
  if (nextPassword && nextPassword !== confirmPassword) {
    throw new ApiError(400, 'New password and confirmation do not match');
  }
  if (nextPassword && nextPassword.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  try {
    const updated = await db.withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT id, email, role, employee_id, password_hash, is_system_admin, token_version FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      const user = rows[0];
      if (!user) throw new ApiError(404, 'Account not found');
      if (user.role !== 'admin') throw new ApiError(403, 'Only admins can change these credentials');
      if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
        throw new ApiError(401, 'Current password is incorrect');
      }

      const passwordHash = nextPassword ? await bcrypt.hash(nextPassword, 12) : user.password_hash;
      const result = await client.query(
        `UPDATE users
            SET email = $2,
                password_hash = $3,
                token_version = token_version + $4,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id, email, role, employee_id, is_system_admin, token_version`,
        [
          userId,
          nextEmail || user.email,
          passwordHash,
          nextPassword ? 1 : 0,
        ]
      );
      return result.rows[0];
    });

    return {
      accessToken: signAccessToken({
        id: updated.id,
        role: updated.role,
        tokenVersion: updated.token_version,
      }),
      refreshToken: signRefreshToken({ id: updated.id, tokenVersion: updated.token_version }),
      user: publicUser(updated),
    };
  } catch (err) {
    if (err.code === '23505') throw new ApiError(409, 'That email address is already in use');
    throw err;
  }
}

async function logout(userId, refreshToken) {
  // Refresh tokens are stateless; clearing the cookie on the client is enough.
  // A token revocation table can be added here when server-side invalidation is needed.
}

module.exports = { login, refresh, getMe, updateCredentials, logout };
