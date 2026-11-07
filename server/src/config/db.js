const { Pool, types } = require('pg');
const env = require('./env');

// PostgreSQL gives JS back a DATE as a local-midnight Date and a NUMERIC as a
// string. Both leak into JSON in unhelpful ways (a 2026-10-26 DATE serialises
// as 2026-10-25T16:00Z in UTC+8; salaries concatenate instead of adding).
// Normalise at the driver boundary so every layer sees plain values.
types.setTypeParser(1082, (value) => value); // DATE -> 'YYYY-MM-DD'
types.setTypeParser(1700, (value) => (value === null ? null : Number(value))); // NUMERIC -> number

const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.isProd ? { rejectUnauthorized: false } : false,
});

// Multi-statement work must run on one checked-out client. Calling
// pool.query('BEGIN') does not open a transaction: each call may land on a
// different connection.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  withTransaction,
  pool,
};
