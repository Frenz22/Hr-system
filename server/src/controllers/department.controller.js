const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { toDepartment } = require('../utils/serializers');

async function createDepartment(req, res, next) {
  try {
    const { name, description, code } = req.body;
    const result = await db.query(
      'INSERT INTO departments (name, description, code) VALUES ($1, $2, $3) RETURNING *',
      [name, description, code]
    );
    res.status(201).json({ department: toDepartment(result.rows[0]) });
  } catch (err) {
    if (err.code === '23505') {
      return next(new ApiError(409, 'Department name or code already exists'));
    }
    next(err);
  }
}

async function getDepartments(req, res, next) {
  try {
    const { rows } = await db.query('SELECT * FROM departments ORDER BY name');
    res.json({ departments: rows.map(toDepartment) });
  } catch (err) {
    next(err);
  }
}

async function deleteDepartment(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'Invalid department id');

    const result = await db.query('DELETE FROM departments WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new ApiError(404, 'Department not found');

    res.json({ message: 'Department deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { createDepartment, getDepartments, deleteDepartment };
