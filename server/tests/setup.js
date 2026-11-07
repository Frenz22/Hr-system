const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { Client } = require('pg');

// Load .env first so the dedicated test database can be derived from DATABASE_URL.
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:PG2026@superuser@localhost:5432/hr_system';

function buildTestUrl(connectionString) {
  const url = new URL(connectionString);
  const baseName = url.pathname.slice(1) || 'hr_system';
  const name = `${baseName}_test`.replace(/[^a-zA-Z0-9_]/g, '_');
  url.pathname = `/${name}`;
  return { url: url.toString(), name };
}

const { url: TEST_URL, name: TEST_DB } = buildTestUrl(BASE_URL);

// Must be set before src/config/env.js is loaded (i.e. before requiring the app).
process.env.DATABASE_URL = TEST_URL;

const db = require('../src/config/db');

async function ensureTestDatabase() {
  const admin = new Client({ connectionString: BASE_URL });
  await admin.connect();
  try {
    const { rows } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
    if (rows.length === 0) {
      await admin.query(`CREATE DATABASE "${TEST_DB}"`);
    }
  } finally {
    await admin.end();
  }
}

async function resetSchema() {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8');
  await db.query(schema);
  await db.query(`
    TRUNCATE users, departments, profiles, profile_documents, feedback, attendance, attendance_pay_hours,
             leave_requests, pay_rules, notifications
    RESTART IDENTITY CASCADE
  `);
}

beforeAll(async () => {
  await ensureTestDatabase();
  await resetSchema();
});

afterAll(async () => {
  await db.pool.end();
});
