const db = require('../config/db');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

async function initializeDatabase() {
  const fs = require('fs');
  const path = require('path');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  try {
    await db.withTransaction(async (client) => {
      await client.query(schema);
    });
    console.log('[db] Schema initialized successfully');
  } catch (err) {
    console.error('[db] Schema initialization failed:', err);
    throw err;
  }
}

async function bootstrapAdmin() {
  const { email, password, employeeId } = env.initialAdmin;
  if (!email && !password) {
    console.warn('[bootstrap] Initial admin not configured; set INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD');
    return;
  }
  if (!email || !password) {
    throw new Error('Set both INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD to bootstrap an administrator');
  }
  if (password.length < 12) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be at least 12 characters');
  }
  if (env.isProd && password.length < 16) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be at least 16 characters in production');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const { rows } = await db.query(
    'SELECT id, role, is_system_admin FROM users WHERE email = $1 OR employee_id = $2',
    [normalizedEmail, employeeId.toUpperCase()]
  );
  if (rows.length > 0) {
    if (rows.length !== 1 || rows[0].role !== 'admin') {
      throw new Error('Initial admin identifiers belong to an incompatible account; no account was changed');
    }
    if (!rows[0].is_system_admin) {
      const { rows: protectedRows } = await db.query(
        'SELECT id FROM users WHERE is_system_admin = TRUE'
      );
      if (protectedRows.length === 0) {
        await db.query('UPDATE users SET is_system_admin = TRUE WHERE id = $1', [rows[0].id]);
      }
    }
    console.log('[bootstrap] Admin already exists');
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await db.withTransaction(async (client) => {
      const userResult = await client.query(
        'INSERT INTO users (employee_id, email, password_hash, role, is_system_admin) VALUES ($1, $2, $3, $4, TRUE) RETURNING id',
        [employeeId, normalizedEmail, passwordHash, 'admin']
      );
      await client.query(
        'INSERT INTO profiles (user_id, first_name, last_name, designation) VALUES ($1, $2, $3, $4)',
        [userResult.rows[0].id, 'System', 'Admin', 'System Administrator']
      );
    });
    console.log(`[bootstrap] Initial admin created: ${normalizedEmail}`);
  } catch (err) {
    console.error('[bootstrap] Failed to create admin:', err);
    throw err;
  }
}

async function bootstrapPayRates() {
  const defaults = [
    { name: 'Regular Pay', description: 'Regular working hours', type: 'regular', multiplier: 1 },
    { name: 'Overtime', description: 'Hours worked beyond the normal shift', type: 'overtime', multiplier: 1.25 },
    { name: 'Rest Day', description: 'Hours worked on a rest day', type: 'rest_day', multiplier: 1.3 },
    { name: 'Rest Day Overtime', description: 'Overtime hours worked on a rest day', type: 'overtime', multiplier: 1.69 },
    { name: 'Special Holiday', description: 'Hours worked on a special holiday', type: 'holiday', multiplier: 1.3 },
    { name: 'Special Holiday Overtime', description: 'Overtime hours worked on a special holiday', type: 'overtime', multiplier: 1.69 },
    { name: 'Regular Holiday', description: 'Hours worked on a regular holiday', type: 'holiday', multiplier: 2 },
    { name: 'Regular Holiday Overtime', description: 'Overtime hours worked on a regular holiday', type: 'overtime', multiplier: 2.6 },
    { name: 'Night Differential', description: 'Hours worked during night hours', type: 'night_diff', multiplier: 1.1 },
    { name: 'Double Pay', description: 'Hours that attract double pay', type: 'custom', multiplier: 2 },
  ];

  for (const rate of defaults) {
    const { rows } = await db.query(
      'SELECT id, type, multiplier FROM pay_rules WHERE lower(name) = lower($1) ORDER BY id LIMIT 1',
      [rate.name]
    );
    if (rows.length === 0) {
      await db.query(
        'INSERT INTO pay_rules (name, description, type, multiplier) VALUES ($1, $2, $3, $4)',
        [rate.name, rate.description, rate.type, rate.multiplier]
      );
      continue;
    }

    // Migrate the original seeded values once while leaving admin-edited rates alone.
    const legacyDefaults = {
      overtime: { type: 'overtime', multiplier: 2 },
      'double pay': { type: 'custom', multiplier: 3.5 },
    };
    const legacy = legacyDefaults[rate.name.toLowerCase()];
    if (
      legacy &&
      rows[0].type === legacy.type &&
      Number(rows[0].multiplier) === legacy.multiplier
    ) {
      await db.query(
        'UPDATE pay_rules SET name = $1, description = $2, type = $3, multiplier = $4 WHERE id = $5',
        [rate.name, rate.description, rate.type, rate.multiplier, rows[0].id]
      );
    }
  }
}

module.exports = { initializeDatabase, bootstrapAdmin, bootstrapPayRates };
