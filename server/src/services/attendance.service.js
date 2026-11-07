const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { startOfDayUTC } = require('../utils/dates');
const { toAttendance } = require('../utils/serializers');

function toId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, `Invalid ${label}`);
  return id;
}

async function listOwn(userId, { from, to, page = '1', limit = '20' } = {}) {
  const pageNum = Number(page);
  const limitNum = Number(limit);
  if (!Number.isSafeInteger(pageNum) || pageNum < 1) throw new ApiError(400, 'Invalid page');
  if (![20, 50].includes(limitNum)) throw new ApiError(400, 'Page size must be 20 or 50');
  const offset = (pageNum - 1) * limitNum;
  if (!Number.isSafeInteger(offset)) throw new ApiError(400, 'Invalid page');

  const dateFrom = from ? parseAttendanceDate(from) : null;
  const dateTo = to ? parseAttendanceDate(to) : null;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new ApiError(400, 'Start date must be on or before end date');
  }

  let where = 'user_id = $1 AND voided_at IS NULL';
  const params = [userId];

  if (dateFrom) {
    params.push(dateFrom);
    where += ` AND date >= $${params.length}`;
  }

  if (dateTo) {
    params.push(dateTo);
    where += ` AND date <= $${params.length}`;
  }

  const countResult = await db.query(`SELECT count(*) FROM attendance WHERE ${where}`, params);
  const total = Number(countResult.rows[0].count);
  const listParams = [...params, limitNum, offset];
  const { rows } = await db.query(
    `SELECT * FROM attendance WHERE ${where}
      ORDER BY date DESC, id DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return {
    records: rows.map(toAttendance),
    total,
    page: pageNum,
    limit: limitNum,
    pages: Math.ceil(total / limitNum) || 1,
  };
}

async function adminList({ from, to, userId, status, page = 1, limit = 20 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  let query = `SELECT a.*, u.employee_id, u.email,
                      NULLIF(BTRIM(CONCAT_WS(' ', NULLIF(p.first_name, ''), NULLIF(p.last_name, ''))), '') AS employee_name
                 FROM attendance a
                 JOIN users u ON a.user_id = u.id
                 LEFT JOIN profiles p ON p.user_id = u.id`;
  const params = [];
  const where = ['a.voided_at IS NULL'];

  if (userId) {
    params.push(toId(userId, 'user id'));
    where.push(`a.user_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`a.status = $${params.length}`);
  }
  if (from) {
    params.push(startOfDayUTC(from));
    where.push(`a.date >= $${params.length}`);
  }
  if (to) {
    params.push(startOfDayUTC(to));
    where.push(`a.date <= $${params.length}`);
  }

  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

  const listParams = [...params, limitNum, offset];
  const { rows } = await db.query(
    `${query}${whereClause} ORDER BY a.date DESC, a.created_at DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const { rows: countRows } = await db.query(
    `SELECT count(*) FROM attendance a${whereClause}`,
    params
  );
  const total = parseInt(countRows[0].count, 10);

  return {
    records: rows.map(toAttendance),
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
  };
}

function parseClock(value, label) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${label} must be a valid date and time`);
  }
  return date;
}

function correctionReason(value) {
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 3 || reason.length > 500) {
    throw new ApiError(400, 'Correction reason must be between 3 and 500 characters');
  }
  return reason;
}

function parseAttendanceDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'Date must be a valid YYYY-MM-DD date');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'Date must be a valid YYYY-MM-DD date');
  }
  return value;
}

function auditValues(record, payHours) {
  return {
    date: startOfDayUTC(record.date).toISOString().slice(0, 10),
    checkIn: record.check_in ? new Date(record.check_in).toISOString() : null,
    checkOut: record.check_out ? new Date(record.check_out).toISOString() : null,
    status: record.status,
    workHours: Number(record.work_hours || 0),
    payHours,
  };
}

async function loadPayHours(client, attendanceId) {
  const { rows } = await client.query(
    `SELECT pr.id, pr.name, aph.hours
       FROM attendance_pay_hours aph
       JOIN pay_rules pr ON pr.id = aph.pay_rule_id
      WHERE aph.attendance_id = $1
      ORDER BY pr.id`,
    [attendanceId]
  );
  return rows.map((row) => ({ id: row.id, name: row.name, hours: Number(row.hours) }));
}

async function adminUpdate(id, body = {}, actorId, reasonValue) {
  const recordId = toId(id, 'attendance id');
  const reason = correctionReason(reasonValue);
  const allowedFields = new Set(['date', 'status', 'checkIn', 'checkOut']);
  if (Object.keys(body).some((field) => !allowedFields.has(field))) {
    throw new ApiError(400, 'Only date, status, checkIn and checkOut may be changed');
  }
  if (Object.keys(body).length === 0) throw new ApiError(400, 'Provide at least one attendance field');
  if (!Number.isInteger(Number(actorId)) || Number(actorId) < 1) {
    throw new ApiError(401, 'Authenticated actor is required');
  }

  const result = await db.withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM attendance WHERE id = $1 AND voided_at IS NULL FOR UPDATE',
      [recordId]
    );
    if (rows.length === 0) throw new ApiError(404, 'Attendance record not found');
    const current = rows[0];
    const previousPayHours = await loadPayHours(client, recordId);
    const previous = auditValues(current, previousPayHours);

    const currentDate = previous.date;
    const nextDate = body.date !== undefined ? parseAttendanceDate(body.date) : currentDate;
    if (nextDate !== currentDate) {
      const { rows: conflicts } = await client.query(
        'SELECT id FROM attendance WHERE user_id = $1 AND date = $2 AND id <> $3',
        [current.user_id, nextDate, recordId]
      );
      if (conflicts.length > 0) {
        throw new ApiError(409, 'This employee already has an attendance record for that date');
      }
    }
    const shiftDays = Math.round(
      (Date.parse(`${nextDate}T00:00:00Z`) - Date.parse(`${currentDate}T00:00:00Z`)) / 86400000
    );
    let nextCheckIn = body.checkIn !== undefined ? parseClock(body.checkIn, 'Check-in') : current.check_in;
    let nextCheckOut = body.checkOut !== undefined ? parseClock(body.checkOut, 'Check-out') : current.check_out;
    if (shiftDays && body.checkIn === undefined && nextCheckIn) {
      nextCheckIn = new Date(new Date(nextCheckIn).getTime() + shiftDays * 86400000);
    }
    if (shiftDays && body.checkOut === undefined && nextCheckOut) {
      nextCheckOut = new Date(new Date(nextCheckOut).getTime() + shiftDays * 86400000);
    }
    const statusProvided = body.status !== undefined;
    let nextStatus = statusProvided ? body.status : current.status;
    let workHours = Number(current.work_hours || 0);

    const clearsDay = statusProvided && (nextStatus === 'leave' || nextStatus === 'absent');
    if (clearsDay) {
      nextCheckIn = null;
      nextCheckOut = null;
      workHours = 0;
    } else if (nextCheckIn && nextCheckOut) {
      const duration = (new Date(nextCheckOut) - new Date(nextCheckIn)) / 36e5;
      if (duration <= 0 || duration > 24) {
        throw new ApiError(400, 'Check-out must be after check-in and within 24 hours');
      }
      workHours = Math.round(duration * 100) / 100;
      if (!statusProvided) nextStatus = duration < 4 ? 'half-day' : 'present';
    } else if (body.checkIn !== undefined || body.checkOut !== undefined || shiftDays) {
      workHours = 0;
      if (!statusProvided) nextStatus = 'incomplete';
    }

    const updatedResult = await client.query(
      `UPDATE attendance
          SET date = $2, status = $3, check_in = $4, check_out = $5, work_hours = $6
        WHERE id = $1
        RETURNING *`,
      [recordId, nextDate, nextStatus, nextCheckIn, nextCheckOut, workHours]
    );

    if (clearsDay) {
      await client.query('DELETE FROM attendance_pay_hours WHERE attendance_id = $1', [recordId]);
    }
    const updated = updatedResult.rows[0];
    const updatedValues = auditValues(updated, await loadPayHours(client, recordId));
    await client.query(
      `INSERT INTO attendance_audit
         (attendance_id, employee_id, action, previous_values, updated_values, actor_id, reason)
       VALUES ($1, $2, 'correction', $3::jsonb, $4::jsonb, $5, $6)`,
      [recordId, current.user_id, JSON.stringify(previous), JSON.stringify(updatedValues), actorId, reason]
    );
    return updated;
  });

  return toAttendance(result);
}

async function voidAttendance(id, actorId, reasonValue) {
  const recordId = toId(id, 'attendance id');
  const reason = correctionReason(reasonValue);
  return db.withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT * FROM attendance WHERE id = $1 AND voided_at IS NULL FOR UPDATE',
      [recordId]
    );
    if (!rows[0]) throw new ApiError(404, 'Attendance record not found');
    const previous = auditValues(rows[0], await loadPayHours(client, recordId));
    const updatedValues = {
      ...previous,
      voidedAt: new Date().toISOString(),
      voidedBy: Number(actorId),
      voidReason: reason,
    };
    const result = await client.query(
      `UPDATE attendance SET voided_at = CURRENT_TIMESTAMP, voided_by = $2, void_reason = $3
        WHERE id = $1 RETURNING *`,
      [recordId, actorId, reason]
    );
    await client.query(
      `INSERT INTO attendance_audit
         (attendance_id, employee_id, action, previous_values, updated_values, actor_id, reason)
       VALUES ($1, $2, 'void', $3::jsonb, $4::jsonb, $5, $6)`,
      [recordId, rows[0].user_id, JSON.stringify(previous), JSON.stringify(updatedValues), actorId, reason]
    );
    return { id: result.rows[0].id, voidedAt: result.rows[0].voided_at };
  });
}

async function history(id) {
  const recordId = toId(id, 'attendance id');
  const { rows } = await db.query(
    `SELECT h.id,
            h.attendance_id AS "attendanceId",
            h.employee_id AS "employeeId",
            h.action,
            h.previous_values AS "previousValues",
            h.updated_values AS "updatedValues",
            h.actor_id AS "actorId",
            COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), u.employee_id, 'Former user') AS "actorName",
            h.reason,
            h.changed_at AS "changedAt"
       FROM attendance_audit h
       LEFT JOIN users u ON u.id = h.actor_id
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE h.attendance_id = $1
      ORDER BY h.changed_at DESC, h.id DESC`,
    [recordId]
  );
  return { history: rows };
}

async function addOwnNote(actorId, attendanceId, noteValue) {
  const recordId = toId(attendanceId, 'attendance id');
  const note = typeof noteValue === 'string' ? noteValue.trim() : '';
  if (!note || note.length > 1000) throw new ApiError(400, 'Note must be between 1 and 1000 characters');

  const result = await db.query(
    `INSERT INTO attendance_notes (attendance_id, user_id, note)
     SELECT id, user_id, $3 FROM attendance
      WHERE id = $1 AND user_id = $2 AND voided_at IS NULL
     RETURNING id, attendance_id AS "attendanceId", user_id AS "userId", note, created_at AS "createdAt"`,
    [recordId, actorId, note]
  );
  if (!result.rows[0]) throw new ApiError(404, 'Attendance record not found');
  return { note: result.rows[0] };
}

async function listNotes(actor, attendanceId) {
  const recordId = toId(attendanceId, 'attendance id');
  const { rows: recordRows } = await db.query(
    'SELECT user_id FROM attendance WHERE id = $1',
    [recordId]
  );
  if (!recordRows[0]) throw new ApiError(404, 'Attendance record not found');
  if (
    actor.role === 'employee' &&
    String(recordRows[0].user_id) !== String(actor.id)
  ) {
    throw new ApiError(403, 'You may only view notes on your own attendance');
  }
  if (!['employee', 'hr_staff', 'admin'].includes(actor.role)) {
    throw new ApiError(403, 'You do not have permission to view attendance notes');
  }
  const ownNotesOnly = actor.role === 'employee';
  const { rows } = await db.query(
    `SELECT id, attendance_id AS "attendanceId", user_id AS "userId", note, created_at AS "createdAt"
       FROM attendance_notes
      WHERE attendance_id = $1 AND ($2::boolean = FALSE OR user_id = $3)
      ORDER BY created_at, id`,
    [recordId, ownNotesOnly, actor.id]
  );
  return { notes: rows };
}

// Approved leave days grouped by the month they fall in, newest first. A
// request that spans a month boundary is split across both months, and
// `DISTINCT` keeps overlapping approved requests from double-counting a day.
async function monthlyLeaveSummary(userId) {
  const id = Number(userId);
  const valid = Number.isInteger(id) && id > 0;

  if (!valid) throw new ApiError(404, 'User not found');
  const { rows: userRows } = await db.query('SELECT id FROM users WHERE id = $1', [id]);
  if (userRows.length === 0) throw new ApiError(404, 'User not found');

  const { rows } = await db.query(
    `SELECT EXTRACT(YEAR FROM day)::int AS year,
            EXTRACT(MONTH FROM day)::int AS month,
            count(DISTINCT day)::int AS days
       FROM leave_requests l
       CROSS JOIN LATERAL generate_series(l.start_date::timestamp, l.end_date::timestamp, interval '1 day') AS day
      WHERE l.user_id = $1 AND l.status = 'approved'
      GROUP BY 1, 2
      ORDER BY 1 DESC, 2 DESC`,
    [id]
  );

  return { months: rows.map((row) => ({ year: row.year, month: row.month, days: row.days })) };
}

module.exports = {
  listOwn,
  adminList,
  adminUpdate,
  voidAttendance,
  history,
  addOwnNote,
  listNotes,
  monthlyLeaveSummary,
};
