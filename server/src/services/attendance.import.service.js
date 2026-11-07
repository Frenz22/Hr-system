const XLSX = require('xlsx');
const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { startOfDayUTC } = require('../utils/dates');
const { dateOnly } = require('../utils/serializers');

const MAX_IMPORT_ROWS = 5000;
const MAX_WORKDAY_HOURS = 24;
const VALID_STATUSES = ['present', 'absent', 'half-day', 'leave', 'incomplete'];

const COLUMNS = [
  'Employee Name',
  'Email',
  'Employee ID',
  'Date',
  'Check In',
  'Check Out',
  'Work Hours',
  'Status',
];
const REQUIRED_COLUMNS = [
  { label: 'Employee ID', field: 'employeeId' },
  { label: 'Email', field: 'email' },
  { label: 'Date', field: 'date' },
];

// Header matching is forgiving: "Employee ID", "employee_id" and "employeeId"
// all mean the same column. That lets an exported sheet be edited and re-imported.
const HEADER_ALIASES = {
  employeeid: 'employeeId',
  empid: 'employeeId',
  email: 'email',
  date: 'date',
  checkin: 'checkIn',
  timein: 'checkIn',
  checkout: 'checkOut',
  timeout: 'checkOut',
  workhours: 'workHours',
  status: 'status',
};

function pad(value) {
  return String(value).padStart(2, '0');
}

function normaliseHeader(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function missingRequiredColumns(rows) {
  const headers = new Set(Object.keys(rows[0] || {}).map(normaliseHeader));
  return REQUIRED_COLUMNS
    .filter(({ field }) => ![...headers].some((header) => HEADER_ALIASES[header] === field))
    .map(({ label }) => label);
}

// Reads the first cell whose header maps to `field`, skipping empty cells.
function pick(row, field) {
  for (const [key, value] of Object.entries(row)) {
    if (HEADER_ALIASES[normaliseHeader(key)] !== field) continue;
    if (value === '' || value === null || value === undefined) continue;
    return value;
  }
  return undefined;
}

// Pay-rate columns are named after admin-defined rates, so they cannot live in
// HEADER_ALIASES. Return undefined when the column is absent and '' when it is
// present but blank; that distinction lets a re-import clear a value without
// wiping rates that were not part of the sheet at all.
function pickHeader(row, headers) {
  for (const [key, value] of Object.entries(row)) {
    if (headers.includes(normaliseHeader(key))) return value;
  }
  return undefined;
}

async function activePayRates() {
  const { rows } = await db.query(
    'SELECT id, name FROM pay_rules WHERE is_active = TRUE ORDER BY id'
  );
  return rows;
}

// Excel can hand back a real Date (cellDates), an Excel serial number, or a
// typed string. All three become a plain 'YYYY-MM-DD'.
function toDay(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  if (typeof value === 'number') {
    const decoded = XLSX.SSF.parse_date_code(value);
    if (!decoded) return null;
    return `${decoded.y}-${pad(decoded.m)}-${pad(decoded.d)}`;
  }

  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  const isRealDate =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return isRealDate ? `${year}-${pad(month)}-${pad(day)}` : null;
}

function toClock(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { hours: value.getHours(), minutes: value.getMinutes() };
  }

  if (typeof value === 'number') {
    const decoded = XLSX.SSF.parse_date_code(value);
    return decoded ? { hours: decoded.H, minutes: decoded.M } : null;
  }

  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;

  return { hours, minutes };
}

// Imported wall-clock times are interpreted in the API server's timezone, which
// is what a single-office deployment expects. The date itself is stored as the
// UTC-midnight key used by every attendance record.
function atLocalTime(day, clock) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, clock.hours, clock.minutes, 0, 0);
}

function clockLabel(date) {
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
}

function readWorkbook(buffer) {
  let workbook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw new ApiError(400, 'That file is not a readable Excel workbook');
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ApiError(400, 'The workbook has no sheets');

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: '',
    raw: true,
  });

  if (rows.length === 0) throw new ApiError(400, 'The first sheet has no data rows');
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ApiError(400, `Import is limited to ${MAX_IMPORT_ROWS} rows per file`);
  }

  return rows;
}

async function parseAttendanceFile(rows) {
  const valid = [];
  const invalid = [];
  const userCache = new Map();
  const rates = await activePayRates();

  async function findUserId(employeeId, email) {
    const cacheKey = `${employeeId}:${email}`;
    if (!userCache.has(cacheKey)) {
      const { rows: users } = await db.query(
        'SELECT id FROM users WHERE upper(employee_id) = $1 AND lower(email) = $2',
        [employeeId, email]
      );
      userCache.set(cacheKey, users[0]?.id ?? null);
    }
    return userCache.get(cacheKey);
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNum = index + 2; // sheet row 1 is the header
    const employeeId = String(pick(row, 'employeeId') ?? '').trim().toUpperCase();
    const email = String(pick(row, 'email') ?? '').trim().toLowerCase();

    if (!employeeId) {
      invalid.push({ rowNum, reason: 'Employee ID is required' });
      continue;
    }
    if (!email) {
      invalid.push({ rowNum, reason: 'Email is required' });
      continue;
    }

    const day = toDay(pick(row, 'date'));
    if (!day) {
      invalid.push({ rowNum, reason: 'Date must be a real date (use YYYY-MM-DD)' });
      continue;
    }

    const checkInValue = pick(row, 'checkIn');
    const checkOutValue = pick(row, 'checkOut');
    const checkInClock = checkInValue === undefined ? null : toClock(checkInValue);
    const checkOutClock = checkOutValue === undefined ? null : toClock(checkOutValue);

    if (checkInValue !== undefined && !checkInClock) {
      invalid.push({ rowNum, reason: 'Check-in must be a time such as 09:00' });
      continue;
    }
    if (checkOutValue !== undefined && !checkOutClock) {
      invalid.push({ rowNum, reason: 'Check-out must be a time such as 17:30' });
      continue;
    }

    const statusValue = String(pick(row, 'status') ?? '').trim().toLowerCase();
    let checkIn = null;
    let checkOut = null;
    let workHours = 0;
    let status;

    if (checkInClock && checkOutClock) {
      checkIn = atLocalTime(day, checkInClock);
      checkOut = atLocalTime(day, checkOutClock);
      const duration = (checkOut - checkIn) / 36e5;

      if (duration <= 0) {
        status = 'incomplete';
      } else if (duration > MAX_WORKDAY_HOURS) {
        invalid.push({ rowNum, reason: 'A shift cannot be longer than 24 hours' });
        continue;
      } else {
        workHours = Math.round(duration * 100) / 100;
        status = duration < 4 ? 'half-day' : 'present';
      }
    } else if (!checkInClock && !checkOutClock) {
      if (!['absent', 'leave', 'incomplete'].includes(statusValue)) {
        invalid.push({
          rowNum,
          reason: 'Add both times, or a status of absent, leave or incomplete',
        });
        continue;
      }
      status = statusValue;
    } else {
      invalid.push({ rowNum, reason: 'Both check-in and check-out are required' });
      continue;
    }

    if (!VALID_STATUSES.includes(status)) {
      invalid.push({ rowNum, reason: `Unknown status "${statusValue}"` });
      continue;
    }

    const payHours = [];
    let payHoursError = null;
    for (const rate of rates) {
      const value = pickHeader(row, [
        normaliseHeader(rate.name),
        normaliseHeader(`${rate.name} hours`),
      ]);
      if (value === undefined) continue;

      if (value === '' || value === null) {
        payHours.push({ payRuleId: rate.id, name: rate.name, hours: 0 });
        continue;
      }

      const hours = Number(value);
      if (!Number.isFinite(hours) || hours < 0 || hours > MAX_WORKDAY_HOURS) {
        payHoursError = `${rate.name} hours must be a number between 0 and ${MAX_WORKDAY_HOURS}`;
        break;
      }
      payHours.push({
        payRuleId: rate.id,
        name: rate.name,
        hours: Math.round(hours * 100) / 100,
      });
    }

    if (payHoursError) {
      invalid.push({ rowNum, reason: payHoursError });
      continue;
    }

    const userId = await findUserId(employeeId, email);
    if (!userId) {
      invalid.push({ rowNum, reason: 'Employee ID and email do not match an employee account' });
      continue;
    }

    valid.push({
      rowNum,
      userId,
      employeeId,
      email,
      day,
      checkIn,
      checkOut,
      workHours,
      status,
      payHours,
    });
  }

  return { valid, invalid };
}

function toPreviewRows(valid) {
  return valid.map((item) => ({
    rowNum: item.rowNum,
    employeeId: item.employeeId,
    date: item.day,
    checkIn: clockLabel(item.checkIn),
    checkOut: clockLabel(item.checkOut),
    workHours: item.workHours,
    status: item.status,
    payHours: item.payHours || [],
  }));
}

async function importAttendance(rows, { actorId, reason } = {}) {
  const correctionReason = typeof reason === 'string' ? reason.trim() : '';
  if (correctionReason.length < 3 || correctionReason.length > 500) {
    throw new ApiError(400, 'Import reason must be between 3 and 500 characters');
  }
  if (!Number.isInteger(Number(actorId)) || Number(actorId) < 1) {
    throw new ApiError(401, 'Authenticated actor is required');
  }
  const { valid, invalid } = await parseAttendanceFile(rows);

  // The whole batch commits or none of it does; rejected rows are reported back
  // so the operator can fix them and upload the file again.
  await db.withTransaction(async (client) => {
    for (const item of valid) {
      const attendanceDate = startOfDayUTC(new Date(item.day));
      const { rows: previousRows } = await client.query(
        'SELECT * FROM attendance WHERE user_id = $1 AND date = $2 FOR UPDATE',
        [item.userId, attendanceDate]
      );
      if (previousRows[0]?.voided_at) {
        throw new ApiError(409, `Attendance for ${item.employeeId} on ${item.day} was voided and cannot be re-imported`);
      }
      const previousPayHours = previousRows[0]
        ? await client.query(
            `SELECT pr.id, pr.name, aph.hours FROM attendance_pay_hours aph
             JOIN pay_rules pr ON pr.id = aph.pay_rule_id WHERE aph.attendance_id = $1 ORDER BY pr.id`,
            [previousRows[0].id]
          )
        : { rows: [] };
      const previous = previousRows[0]
        ? {
            date: dateOnly(previousRows[0].date),
            checkIn: previousRows[0].check_in,
            checkOut: previousRows[0].check_out,
            status: previousRows[0].status,
            workHours: Number(previousRows[0].work_hours || 0),
            payHours: previousPayHours.rows.map((pay) => ({
              id: pay.id, name: pay.name, hours: Number(pay.hours),
            })),
          }
        : null;

      const saved = await client.query(
        `INSERT INTO attendance (user_id, date, check_in, check_out, work_hours, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, date)
         DO UPDATE SET check_in = EXCLUDED.check_in,
                       check_out = EXCLUDED.check_out,
                       work_hours = EXCLUDED.work_hours,
                       status = EXCLUDED.status
         RETURNING id`,
        [
          item.userId,
          attendanceDate,
          item.checkIn,
          item.checkOut,
          item.workHours,
          item.status,
        ]
      );

      const attendanceId = saved.rows[0].id;
      await client.query('DELETE FROM attendance_pay_hours WHERE attendance_id = $1', [attendanceId]);
      if (item.status !== 'leave' && item.status !== 'absent') {
        for (const pay of item.payHours || []) {
          await client.query(
            `INSERT INTO attendance_pay_hours (attendance_id, pay_rule_id, hours)
             VALUES ($1, $2, $3)
             ON CONFLICT (attendance_id, pay_rule_id)
             DO UPDATE SET hours = EXCLUDED.hours`,
            [attendanceId, pay.payRuleId, pay.hours]
          );
        }
      }

      const { rows: savedAttendance } = await client.query(
        'SELECT date, check_in, check_out, work_hours, status FROM attendance WHERE id = $1',
        [attendanceId]
      );
      const { rows: savedPayHours } = await client.query(
        `SELECT pr.id, pr.name, aph.hours FROM attendance_pay_hours aph
         JOIN pay_rules pr ON pr.id = aph.pay_rule_id WHERE aph.attendance_id = $1 ORDER BY pr.id`,
        [attendanceId]
      );
      const current = savedAttendance[0];
      const updated = {
        date: dateOnly(current.date),
        checkIn: current.check_in,
        checkOut: current.check_out,
        status: current.status,
        workHours: Number(current.work_hours || 0),
        payHours: savedPayHours.map((pay) => ({
          id: pay.id, name: pay.name, hours: Number(pay.hours),
        })),
      };
      await client.query(
        `INSERT INTO attendance_audit
           (attendance_id, employee_id, action, previous_values, updated_values, actor_id, reason)
         VALUES ($1, $2, 'import', $3::jsonb, $4::jsonb, $5, $6)`,
        [attendanceId, item.userId, previous && JSON.stringify(previous), JSON.stringify(updated), actorId, correctionReason]
      );
    }
  });

  return {
    imported: valid.length,
    rejected: invalid.length,
    errors: invalid,
  };
}

async function exportAttendance({ from, to, userId, status } = {}) {
  let query = `SELECT a.*, u.employee_id, u.email,
                      NULLIF(BTRIM(CONCAT_WS(' ', NULLIF(p.first_name, ''), NULLIF(p.last_name, ''))), '') AS employee_name
                 FROM attendance a
                 JOIN users u ON a.user_id = u.id
                 LEFT JOIN profiles p ON p.user_id = u.id`;
  const params = [];
  const where = ['a.voided_at IS NULL'];

  if (userId !== undefined && userId !== '') {
    const id = Number(userId);
    if (!Number.isInteger(id) || id < 1) throw new ApiError(400, 'Invalid user id');
    params.push(id);
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

  if (where.length > 0) query += ` WHERE ${where.join(' AND ')}`;
  query += ' ORDER BY a.date DESC, u.employee_id ASC';

  const { rows } = await db.query(query, params);
  const { rows: rules } = await db.query(
    'SELECT id, name, multiplier, type, is_active FROM pay_rules ORDER BY id'
  );

  const hoursByAttendance = new Map();
  if (rows.length > 0) {
    const { rows: payRows } = await db.query(
      `SELECT attendance_id, pay_rule_id, hours
         FROM attendance_pay_hours
        WHERE attendance_id = ANY($1)`,
      [rows.map((row) => row.id)]
    );
    for (const pay of payRows) {
      if (!hoursByAttendance.has(pay.attendance_id)) {
        hoursByAttendance.set(pay.attendance_id, new Map());
      }
      hoursByAttendance.get(pay.attendance_id).set(pay.pay_rule_id, Number(pay.hours));
    }
  }

  return {
    rules: rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      multiplier: Number(rule.multiplier),
      type: rule.type,
      isActive: Boolean(rule.is_active),
    })),
    rows: rows.map((row) => {
      const stored = hoursByAttendance.get(row.id) || new Map();
      return {
        employeeName: row.employee_name || '',
        email: row.email,
        employeeId: row.employee_id,
        date: dateOnly(row.date),
        checkIn: clockLabel(row.check_in ? new Date(row.check_in) : null),
        checkOut: clockLabel(row.check_out ? new Date(row.check_out) : null),
        workHours: row.work_hours === null ? '' : Number(row.work_hours),
        status: row.status,
        payHours: Object.fromEntries(
          rules.map((rule) => [
            rule.id,
            stored.has(rule.id) ? stored.get(rule.id) : '',
          ])
        ),
      };
    }),
  };
}

function toWorkbook(rows, rules = []) {
  const rateHeaders = rules.map((rule) => `${rule.name} Hours`);
  const headers = [...COLUMNS, ...rateHeaders];

  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      'Employee Name': row.employeeName,
      Email: row.email,
      'Employee ID': row.employeeId,
      Date: row.date,
      'Check In': row.checkIn,
      'Check Out': row.checkOut,
      'Work Hours': row.workHours,
      Status: row.status,
      ...Object.fromEntries(
        rules.map((rule) => [`${rule.name} Hours`, row.payHours?.[rule.id] ?? ''])
      ),
    })),
    { header: headers }
  );

  sheet['!cols'] = [
    { wch: 30 },
    { wch: 30 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    ...rules.map(() => ({ wch: 16 })),
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance');

  if (rules.length > 0) {
    const rateSheet = XLSX.utils.json_to_sheet(
      rules.map((rule) => ({
        Name: rule.name,
        Multiplier: rule.multiplier,
        Type: rule.type,
        Active: rule.isActive,
      })),
      { header: ['Name', 'Multiplier', 'Type', 'Active'] }
    );
    rateSheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(workbook, rateSheet, 'Pay Rates');
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = {
  readWorkbook,
  parseAttendanceFile,
  REQUIRED_COLUMNS,
  missingRequiredColumns,
  toPreviewRows,
  importAttendance,
  exportAttendance,
  toWorkbook,
};
