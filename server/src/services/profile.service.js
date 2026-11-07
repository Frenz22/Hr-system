const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const storage = require('../utils/storage');
const { toUser, toProfile } = require('../utils/serializers');
const path = require('path');

// Accepted request fields are camelCase (same vocabulary as the responses);
// each maps to the snake_case column it writes.
const PERSONAL_FIELDS = {
  firstName: 'first_name',
  lastName: 'last_name',
  dob: 'dob',
  phone: 'phone',
  address: 'address',
};

const JOB_FIELDS = {
  designation: 'designation',
  departmentId: 'department_id',
  joiningDate: 'joining_date',
  employmentType: 'employment_type',
};

const SALARY_FIELDS = {
  basic: 'salary_basic',
  hra: 'salary_hra',
  allowances: 'salary_allowances',
  deductions: 'salary_deductions',
};

const DATE_FIELDS = new Set(['dob', 'joining_date']);

function normalizeValue(column, value) {
  if (DATE_FIELDS.has(column)) return value ? String(value).slice(0, 10) : null;
  if (column === 'department_id') {
    if (value === '' || value === null || value === undefined) return null;
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'Invalid department');
    return id;
  }
  if (column.startsWith('salary_')) {
    const amount = Number(value);
    if (Number.isNaN(amount) || amount < 0) {
      throw new ApiError(400, `${column.replace('salary_', '')} must be a non-negative number`);
    }
    return amount;
  }
  return value;
}

function collect(body, fields, { salary = false } = {}) {
  const set = {};
  for (const [field, column] of Object.entries(fields)) {
    if (body[field] !== undefined) set[column] = normalizeValue(column, body[field]);
  }
  if (salary && body.salary && typeof body.salary === 'object') {
    for (const [field, column] of Object.entries(SALARY_FIELDS)) {
      if (body.salary[field] !== undefined) {
        set[column] = normalizeValue(column, body.salary[field]);
      }
    }
  }
  return set;
}

async function ensureProfile(userId) {
  const { rows } = await db.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (rows.length > 0) return rows[0];

  const inserted = await db.query('INSERT INTO profiles (user_id) VALUES ($1) RETURNING *', [userId]);
  return inserted.rows[0];
}

async function loadDocuments(userId) {
  const { rows } = await db.query(
    'SELECT id, original_name, mime_type, size_bytes, uploaded_at FROM profile_documents WHERE user_id = $1 ORDER BY uploaded_at DESC, id DESC',
    [userId]
  );
  return rows;
}

async function loadProfile(userId, { includeSalary = true, includeDocuments = true } = {}) {
  const profile = await ensureProfile(userId);
  const { rows } = await db.query('SELECT id, employee_id, email, role, is_system_admin FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) throw new ApiError(404, 'User not found');

  let department = null;
  if (profile.department_id) {
    const dept = await db.query('SELECT id, name, description, code FROM departments WHERE id = $1', [profile.department_id]);
    department = dept.rows[0] || null;
  }

  const documents = includeDocuments ? await loadDocuments(userId) : [];
  const profileDto = toProfile(profile, department, documents);
  // Salary is payroll data: only admins (and the employee themselves) may see it.
  if (!includeSalary) profileDto.salary = null;

  return { profile: profileDto, user: toUser(rows[0]) };
}

async function applyUpdate(userId, set, { includeSalary = true } = {}) {
  const keys = Object.keys(set);
  if (keys.length === 0) throw new ApiError(400, 'No editable fields supplied');

  await ensureProfile(userId);

  const setClause = keys.map((column, i) => `${column} = $${i + 2}`).join(', ');
  await db.query(
    `UPDATE profiles SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
    [userId, ...Object.values(set)]
  );

  return loadProfile(userId, { includeSalary });
}

async function updateOwn(userId, body) {
  return applyUpdate(userId, collect(body, PERSONAL_FIELDS));
}

async function adminUpdate(userId, body, { allowSalary = false } = {}) {
  const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rows.length === 0) throw new ApiError(404, 'User not found');

  // Payroll writes stay admin-only, including the salary block that is nested
  // inside a profile update.
  if (!allowSalary && body.salary !== undefined) {
    throw new ApiError(403, 'Only admins can change salary');
  }

  return applyUpdate(
    userId,
    collect(body, { ...PERSONAL_FIELDS, ...JOB_FIELDS }, { salary: allowSalary }),
    { includeSalary: allowSalary }
  );
}

async function adminGet(userId, { includeSalary = true } = {}) {
  const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
  if (userCheck.rows.length === 0) throw new ApiError(404, 'User not found');
  return loadProfile(userId, { includeSalary });
}

async function adminDelete(actorId, userId) {
  if (String(userId) === String(actorId)) {
    throw new ApiError(400, 'You cannot delete your own account');
  }

  const userCheck = await db.query('SELECT id, employee_id, email, is_system_admin FROM users WHERE id = $1', [userId]);
  if (userCheck.rows.length === 0) throw new ApiError(404, 'User not found');

  const user = userCheck.rows[0];
  if (user.is_system_admin) throw new ApiError(403, 'The system administrator account cannot be deleted');

  // Cascades (attendance, leave, notifications, profile) commit or roll back
  // with the user row on one connection. Stored files have no FK, so capture
  // their keys first and remove them after the database commit.
  const { rows: files } = await db.query(
    'SELECT storage_key FROM profile_documents WHERE user_id = $1',
    [userId]
  );

  await db.withTransaction(async (client) => {
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  await Promise.allSettled(files.map((file) => storage.remove(file.storage_key)));

  return { deleted: { id: user.id, employeeId: user.employee_id, email: user.email } };
}

async function adminList({ page = 1, limit = 10, search = '' } = {}, { includeSalary = true } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  let userQuery = 'SELECT id, employee_id, email, role, is_system_admin FROM users';
  const params = [];

  if (search) {
    userQuery += ' WHERE email ILIKE $1 OR employee_id ILIKE $1';
    params.push(`%${search}%`);
  }

  const listParams = [...params, limitNum, offset];
  userQuery += ` ORDER BY employee_id ASC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`;

  const { rows: users } = await db.query(userQuery, listParams);
  const totalResult = await db.query(
    search ? 'SELECT count(*) FROM users WHERE email ILIKE $1 OR employee_id ILIKE $1' : 'SELECT count(*) FROM users',
    params
  );
  const total = parseInt(totalResult.rows[0].count, 10);

  const userIds = users.map((u) => u.id);
  let profiles = [];
  if (userIds.length > 0) {
    const { rows } = await db.query('SELECT * FROM profiles WHERE user_id = ANY($1)', [userIds]);
    profiles = rows;
  }

  const departmentIds = [...new Set(profiles.map((p) => p.department_id).filter(Boolean))];
  let departments = [];
  if (departmentIds.length > 0) {
    const { rows } = await db.query('SELECT id, name, description, code FROM departments WHERE id = ANY($1)', [departmentIds]);
    departments = rows;
  }

  const byUser = new Map(profiles.map((p) => [p.user_id, p]));
  const byDepartment = new Map(departments.map((d) => [d.id, d]));

  const rows = users.map((u) => {
    const profile = byUser.get(u.id) || {};
    const profileDto = toProfile(profile, byDepartment.get(profile.department_id));
    if (!includeSalary) profileDto.salary = null;
    return {
      user: toUser(u),
      profile: profileDto,
    };
  });

  return { rows, total, page: pageNum, pages: Math.ceil(total / limitNum) || 1 };
}

async function setPicture(userId, file) {
  if (!file) throw new ApiError(400, 'No file uploaded');
  const { url } = await storage.save({
    buffer: file.buffer,
    originalName: file.originalname,
    mime: file.mimetype,
    folder: 'avatars',
  });

  await ensureProfile(userId);
  await db.query('UPDATE profiles SET profile_picture_url = $1 WHERE user_id = $2', [url, userId]);

  return loadProfile(userId);
}

function safeOriginalName(name) {
  return path.basename(String(name || 'document')).slice(0, 255) || 'document';
}

async function addDocument(userId, file) {
  if (!file) throw new ApiError(400, 'No file uploaded');

  const saved = await storage.save({
    buffer: file.buffer,
    originalName: file.originalname,
    mime: file.mimetype,
    folder: 'documents',
  });

  await db.query(
    `INSERT INTO profile_documents (user_id, original_name, storage_key, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, safeOriginalName(file.originalname), saved.key, file.mimetype, file.size]
  );

  return loadProfile(userId);
}

async function findDocument(documentId) {
  const id = Number(documentId);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'Invalid document id');

  const { rows } = await db.query(
    `SELECT d.*, u.role AS owner_role
       FROM profile_documents d
       JOIN users u ON d.user_id = u.id
      WHERE d.id = $1`,
    [id]
  );
  if (rows.length === 0) throw new ApiError(404, 'Document not found');
  return rows[0];
}

function canManageDocument(actor, document) {
  return (
    String(actor.id) === String(document.user_id) ||
    actor.role === 'admin' ||
    actor.role === 'hr_staff'
  );
}

async function downloadDocument(actor, documentId) {
  const document = await findDocument(documentId);
  if (!canManageDocument(actor, document)) {
    throw new ApiError(403, 'You do not have permission to open this document');
  }

  let buffer;
  try {
    buffer = await storage.read(document.storage_key);
  } catch {
    throw new ApiError(404, 'The stored file is missing');
  }
  return { document, buffer };
}

async function deleteDocument(actor, documentId) {
  const document = await findDocument(documentId);
  if (!canManageDocument(actor, document)) {
    throw new ApiError(403, 'You do not have permission to delete this document');
  }

  await db.query('DELETE FROM profile_documents WHERE id = $1', [document.id]);
  await storage.remove(document.storage_key).catch(() => {});
  return { deleted: { id: document.id } };
}

module.exports = {
  loadProfile,
  updateOwn,
  adminUpdate,
  adminGet,
  adminDelete,
  adminList,
  setPicture,
  addDocument,
  downloadDocument,
  deleteDocument,
};
