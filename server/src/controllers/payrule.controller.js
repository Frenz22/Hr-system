const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { toPayRule, dateOnly } = require('../utils/serializers');

const PAY_RULE_TYPES = new Set(['regular', 'overtime', 'rest_day', 'holiday', 'night_diff', 'custom']);

function toId(value, label = 'pay rule id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, `Invalid ${label}`);
  return id;
}

function amount(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, 'Multiplier and threshold must be non-negative numbers');
  return n;
}

function parseRuleDate(value, label) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${label} must be a valid date`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${label} must be a valid date`);
  }
  return value;
}

function assertRuleDateRange(effectiveDate, expiryDate) {
  if (effectiveDate && expiryDate && expiryDate < effectiveDate) {
    throw new ApiError(400, 'Expiry date must be on or after the effective date');
  }
}

async function listRules(req, res, next) {
  try {
    const { rows } = await db.query('SELECT * FROM pay_rules ORDER BY created_at DESC');
    res.json({ rules: rows.map(toPayRule) });
  } catch (err) {
    next(err);
  }
}

async function createRule(req, res, next) {
  try {
    const { description = '', thresholdHours, effectiveDate, expiryDate } = req.body;
    const name = String(req.body.name || '').trim();
    const type = req.body.type || 'custom';
    if (!name) throw new ApiError(400, 'Pay rate name is required');
    if (!PAY_RULE_TYPES.has(type)) throw new ApiError(400, 'Invalid pay rate type');

    const duplicate = await db.query('SELECT id FROM pay_rules WHERE lower(name) = lower($1)', [name]);
    if (duplicate.rows.length > 0) {
      throw new ApiError(409, 'A pay rate with that name already exists');
    }

    const multiplier = amount(req.body.multiplier, 1);
    const parsedEffectiveDate = effectiveDate === undefined
      ? null
      : parseRuleDate(effectiveDate, 'Effective date');
    const parsedExpiryDate = expiryDate === undefined
      ? null
      : parseRuleDate(expiryDate, 'Expiry date');
    const effectiveDateForRange = parsedEffectiveDate || (parsedExpiryDate
      ? (await db.query('SELECT CURRENT_DATE::text AS today')).rows[0].today
      : null);
    assertRuleDateRange(effectiveDateForRange, parsedExpiryDate);

    const result = await db.query(
      `INSERT INTO pay_rules
         (name, description, type, multiplier, threshold_hours, effective_date, expiry_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name,
        description,
        type,
        multiplier,
        amount(thresholdHours, 0),
        parsedEffectiveDate,
        parsedExpiryDate,
        req.user.id,
      ]
    );
    res.status(201).json({ rule: toPayRule(result.rows[0]) });
  } catch (err) {
    next(err);
  }
}

async function updateRule(req, res, next) {
  try {
    const id = toId(req.params.id);
    const { name, description, isActive, effectiveDate, expiryDate } = req.body;

    let existingDates = null;
    if (effectiveDate !== undefined || expiryDate !== undefined) {
      const { rows } = await db.query(
        'SELECT effective_date, expiry_date FROM pay_rules WHERE id = $1',
        [id]
      );
      if (rows.length === 0) throw new ApiError(404, 'Pay rule not found');
      existingDates = rows[0];
    }

    const parsedEffectiveDate = effectiveDate === undefined
      ? undefined
      : parseRuleDate(effectiveDate, 'Effective date');
    const parsedExpiryDate = expiryDate === undefined
      ? undefined
      : parseRuleDate(expiryDate, 'Expiry date');
    if (existingDates) {
      const nextEffectiveDate = parsedEffectiveDate === undefined
        ? dateOnly(existingDates.effective_date)
        : parsedEffectiveDate;
      const nextExpiryDate = parsedExpiryDate === undefined
        ? dateOnly(existingDates.expiry_date)
        : parsedExpiryDate;
      assertRuleDateRange(nextEffectiveDate, nextExpiryDate);
    }

    const columns = [];
    const values = [];

    if (name !== undefined) {
      const cleanName = String(name || '').trim();
      if (!cleanName) throw new ApiError(400, 'Pay rate name is required');
      const duplicate = await db.query(
        'SELECT id FROM pay_rules WHERE lower(name) = lower($1) AND id != $2',
        [cleanName, id]
      );
      if (duplicate.rows.length > 0) {
        throw new ApiError(409, 'A pay rate with that name already exists');
      }
      columns.push('name');
      values.push(cleanName);
    }
    if (description !== undefined) {
      columns.push('description');
      values.push(description);
    }
    if (req.body.multiplier !== undefined) {
      columns.push('multiplier');
      values.push(amount(req.body.multiplier, 1));
    }
    if (req.body.thresholdHours !== undefined) {
      columns.push('threshold_hours');
      values.push(amount(req.body.thresholdHours, 0));
    }
    if (effectiveDate !== undefined) {
      columns.push('effective_date');
      values.push(parsedEffectiveDate);
    }
    if (expiryDate !== undefined) {
      columns.push('expiry_date');
      values.push(parsedExpiryDate);
    }
    if (isActive !== undefined) {
      columns.push('is_active');
      values.push(Boolean(isActive));
    }

    if (columns.length === 0) throw new ApiError(400, 'No editable fields supplied');

    // One statement so a partial update cannot half-apply.
    const setClause = columns.map((column, i) => `${column} = $${i + 2}`).join(', ');
    const result = await db.query(
      `UPDATE pay_rules SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    if (result.rows.length === 0) throw new ApiError(404, 'Pay rule not found');
    res.json({ rule: toPayRule(result.rows[0]) });
  } catch (err) {
    next(err);
  }
}

async function toggleRule(req, res, next) {
  try {
    const id = toId(req.params.id);
    const result = await db.query(
      'UPDATE pay_rules SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) throw new ApiError(404, 'Pay rule not found');
    res.json({ rule: toPayRule(result.rows[0]) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listRules, createRule, updateRule, toggleRule };
