const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

let counter = 0;

async function createUser({ role = 'employee', password = 'Passw0rd1' } = {}) {
  counter += 1;
  const employeeId = `T${String(counter).padStart(3, '0')}`;
  const email = `t${counter}@test.local`;
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    'INSERT INTO users (employee_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, employee_id, email, role',
    [employeeId, email, passwordHash, role]
  );
  return { user: rows[0], password };
}

async function loginAs(spec = {}) {
  const { user, password } = await createUser(spec);
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password });
  if (!res.body.accessToken) {
    throw new Error(`Test login failed: ${JSON.stringify(res.body)}`);
  }
  return {
    user,
    password,
    token: res.body.accessToken,
    cookies: res.headers['set-cookie'] || [],
  };
}

module.exports = { app, request, db, createUser, loginAs };
