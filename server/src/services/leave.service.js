const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { startOfDayUTC, eachDayUTC } = require('../utils/dates');
const { toLeave } = require('../utils/serializers');
const { notify, notifyAdmins } = require('./notification.service');

const MAX_RANGE_DAYS = 60;

const ADMIN_SELECT = `
  SELECT l.*,
         u.employee_id AS user_emp_id,
         u.email       AS user_email,
         a.employee_id AS approver_emp_id,
         a.email       AS approver_email
  FROM leave_requests l
  JOIN users u ON l.user_id = u.id
  LEFT JOIN users a ON l.approver_id = a.id
`;

function toId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new ApiError(400, `Invalid ${label}`);
  return id;
}

async function create(userId, { type, startDate, endDate, remarks }) {
  const start = startOfDayUTC(startDate);
  const end = startOfDayUTC(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ApiError(400, 'Invalid date range');
  }
  if (start > end) throw new ApiError(400, 'Start date must be on or before the end date');
  if (eachDayUTC(start, end).length > MAX_RANGE_DAYS) {
    throw new ApiError(400, `A single request may cover at most ${MAX_RANGE_DAYS} days`);
  }

  // Check for overlaps with pending or approved requests
  const overlapResult = await db.query(
    `SELECT id FROM leave_requests
     WHERE user_id = $1
     AND status IN ('pending', 'approved')
     AND start_date <= $2
     AND end_date >= $3`,
    [userId, end, start]
  );

  if (overlapResult.rows.length > 0) {
    throw new ApiError(409, 'You already have a pending or approved leave overlapping these dates');
  }

  // Route the request to an approver: the first HR staff or admin who is not
  // the requester or protected system administrator. decide() replaces this
  // with whoever actually reviews it.
  const approverResult = await db.query(
    "SELECT id FROM users WHERE role IN ('hr_staff', 'admin') AND id != $1 AND is_system_admin = FALSE ORDER BY id LIMIT 1",
    [userId]
  );
  const approverId = approverResult.rows[0]?.id || null;

  const result = await db.query(
    'INSERT INTO leave_requests (user_id, approver_id, leave_type, start_date, end_date, reason) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [userId, approverId, type, start, end, remarks]
  );

  const requester = await db.query('SELECT employee_id FROM users WHERE id = $1', [userId]);
  const employeeId = requester.rows[0]?.employee_id || `Employee ${userId}`;
  const range = `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`;

  // Notifications are a convenience; a failure here must not lose the request.
  await notifyAdmins({
    message: `${employeeId} requested ${type} leave (${range}); pending review.`,
    type: 'leave',
    excludeUserId: userId,
    excludeSystemAdmin: true,
  }).catch(() => {});
  await notify(userId, {
    message: `Your ${type} leave request (${range}) was submitted and is pending review.`,
    type: 'leave',
  }).catch(() => {});

  return toLeave(result.rows[0]);
}

async function listOwn(userId, { from, to } = {}) {
  let query = 'SELECT * FROM leave_requests WHERE user_id = $1';
  const params = [userId];

  if (from && to) {
    query += ' AND start_date <= $2 AND end_date >= $3';
    params.push(startOfDayUTC(to), startOfDayUTC(from));
  } else if (from) {
    query += ' AND end_date >= $2';
    params.push(startOfDayUTC(from));
  } else if (to) {
    query += ' AND start_date <= $2';
    params.push(startOfDayUTC(to));
  }

  query += ' ORDER BY start_date DESC LIMIT 100';
  const { rows } = await db.query(query, params);
  return rows.map(toLeave);
}

async function cancelOwn(userId, requestId) {
  const id = toId(requestId, 'leave request id');
  const { rows } = await db.query('SELECT id, status FROM leave_requests WHERE id = $1 AND user_id = $2', [id, userId]);
  const request = rows[0];
  if (!request) throw new ApiError(404, 'Leave request not found');
  if (request.status !== 'pending') {
    throw new ApiError(409, 'Only pending requests can be cancelled');
  }

  await db.query("UPDATE leave_requests SET status = 'cancelled' WHERE id = $1", [id]);
}

async function adminList({ status, page = 1, limit = 15 } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 15));
  const offset = (pageNum - 1) * limitNum;

  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`l.status = $${params.length}`);
  }
  const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

  const listParams = [...params, limitNum, offset];
  const { rows } = await db.query(
    `${ADMIN_SELECT}${whereClause} ORDER BY l.created_at DESC LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  const { rows: countRows } = await db.query(
    `SELECT count(*) FROM leave_requests l${whereClause}`,
    params
  );
  const total = parseInt(countRows[0].count, 10);

  return {
    requests: rows.map(toLeave),
    total,
    page: pageNum,
    pages: Math.ceil(total / limitNum) || 1,
  };
}

async function decide(reviewerId, requestId, { status, adminComment = '' }) {
  const id = toId(requestId, 'leave request id');

  const { rows } = await db.query('SELECT * FROM leave_requests WHERE id = $1', [id]);
  const request = rows[0];
  if (!request) throw new ApiError(404, 'Leave request not found');
  if (String(request.user_id) === String(reviewerId)) {
    throw new ApiError(403, 'You cannot review your own leave request');
  }
  if (request.status !== 'pending') {
    throw new ApiError(409, `This request was already ${request.status}`);
  }

  // approver_id records who actually made the decision; decision_remarks and
  // decision_date capture the review. Attendance and the status change commit
  // together on a single connection.
  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE leave_requests
          SET status = $1,
              decision_remarks = $2,
              approver_id = $3,
              decision_date = CURRENT_TIMESTAMP
        WHERE id = $4`,
      [status, adminComment, reviewerId, id]
    );

    if (status === 'approved') {
      const days = eachDayUTC(request.start_date, request.end_date);
      for (const day of days) {
        const { rows: previousRows } = await client.query(
          'SELECT * FROM attendance WHERE user_id = $1 AND date = $2 FOR UPDATE',
          [request.user_id, day]
        );
        const previousRecord = previousRows[0];
        if (previousRecord?.voided_at) {
          throw new ApiError(409, 'Leave cannot be applied to a voided attendance record');
        }
        const { rows: previousPayHours } = previousRecord
          ? await client.query(
              `SELECT pr.id, pr.name, aph.hours
                 FROM attendance_pay_hours aph
                 JOIN pay_rules pr ON pr.id = aph.pay_rule_id
                WHERE aph.attendance_id = $1 ORDER BY pr.id`,
              [previousRecord.id]
            )
          : { rows: [] };
        const previousValues = previousRecord
          ? {
              date: day.toISOString().slice(0, 10),
              checkIn: previousRecord.check_in?.toISOString?.() || null,
              checkOut: previousRecord.check_out?.toISOString?.() || null,
              status: previousRecord.status,
              workHours: Number(previousRecord.work_hours || 0),
              payHours: previousPayHours.map((pay) => ({
                id: pay.id, name: pay.name, hours: Number(pay.hours),
              })),
            }
          : null;
        const saved = previousRecord
          ? await client.query(
              `UPDATE attendance
                  SET status = 'leave', check_in = NULL, check_out = NULL, work_hours = 0
                WHERE id = $1 RETURNING id`,
              [previousRecord.id]
            )
          : await client.query(
              `INSERT INTO attendance (user_id, date, status)
               VALUES ($1, $2, 'leave') RETURNING id`,
              [request.user_id, day]
            );
        await client.query('DELETE FROM attendance_pay_hours WHERE attendance_id = $1', [saved.rows[0].id]);
        const updatedValues = {
          date: day.toISOString().slice(0, 10),
          checkIn: null,
          checkOut: null,
          status: 'leave',
          workHours: 0,
          payHours: [],
        };
        const auditReason = (typeof adminComment === 'string' ? adminComment.trim() : '') ||
          `Approved leave request #${id}`;
        await client.query(
          `INSERT INTO attendance_audit
             (attendance_id, employee_id, action, previous_values, updated_values, actor_id, reason)
           VALUES ($1, $2, 'leave_approval', $3::jsonb, $4::jsonb, $5, $6)`,
          [
            saved.rows[0].id,
            request.user_id,
            previousValues && JSON.stringify(previousValues),
            JSON.stringify(updatedValues),
            reviewerId,
            auditReason,
          ]
        );
      }
    }
  });

  const finalResult = await db.query(`${ADMIN_SELECT} WHERE l.id = $1`, [id]);

  await notify(request.user_id, {
    message: `Your ${request.leave_type} leave request was ${status}.`,
    type: 'leave',
  });

  return toLeave(finalResult.rows[0]);
}

module.exports = { create, listOwn, cancelOwn, adminList, decide };
