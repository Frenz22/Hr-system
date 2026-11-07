const PDFDocument = require('pdfkit');
const db = require('../config/db');
const { ApiError } = require('../middleware/errorHandler');
const { dateOnly } = require('../utils/serializers');

const COMPANY_NAME = process.env.COMPANY_NAME?.trim() || 'HR System';
const PAGE_MARGIN = 28;

function parseDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${label} must be a valid date`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, `${label} must be a valid date`);
  }
  return value;
}

function parseFilters({ startDate, endDate, employeeIds = [], departmentId = null, mode = 'full' } = {}) {
  const from = parseDate(startDate, 'Start date');
  const to = parseDate(endDate, 'End date');
  if (from > to) throw new ApiError(400, 'Start date must be on or before end date');
  if (!Array.isArray(employeeIds)) throw new ApiError(400, 'Employee IDs must be a list');
  if (!['full', 'simplified'].includes(mode)) throw new ApiError(400, 'Report type must be full or simplified');

  const ids = employeeIds.map((value) => Number(value));
  if (ids.some((id) => !Number.isInteger(id) || id < 1)) {
    throw new ApiError(400, 'Employee IDs must be valid positive integers');
  }

  let department = null;
  if (departmentId !== null && departmentId !== undefined && departmentId !== '') {
    department = Number(departmentId);
    if (!Number.isInteger(department) || department < 1) {
      throw new ApiError(400, 'Department must be a valid positive integer');
    }
  }

  return { from, to, employeeIds: ids, departmentId: department, mode };
}

async function searchEmployees(search = '', { includeAll = false, departmentId = null } = {}) {
  const term = String(search).trim();
  const limitClause = includeAll ? '' : 'LIMIT 3';
  const { rows } = await db.query(
    `SELECT u.id,
            COALESCE(NULLIF(trim(concat_ws(' ', NULLIF(p.first_name, ''), NULLIF(p.last_name, ''))), ''), u.employee_id) AS name,
            u.employee_id AS "employeeId",
            d.name AS department
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN departments d ON d.id = p.department_id
      WHERE u.role = 'employee'
        AND ($1 = '' OR concat_ws(' ', p.first_name, p.last_name) ILIKE $2 OR u.employee_id ILIKE $2)
        AND ($3::integer IS NULL OR p.department_id = $3)
      ORDER BY name, u.employee_id
      ${limitClause}`,
    [term, `%${term}%`, departmentId]
  );
  return rows;
}

async function reportRows(filters) {
  const { from, to, employeeIds, departmentId, mode } = parseFilters(filters);
  if (departmentId) {
    const { rows: departments } = await db.query(
      'SELECT id FROM departments WHERE id = $1',
      [departmentId]
    );
    if (departments.length === 0) throw new ApiError(400, 'Selected department does not exist');
  }
  if (employeeIds.length > 0) {
    const { rows: employees } = await db.query(
      "SELECT id FROM users WHERE role = 'employee' AND id = ANY($1::integer[])",
      [employeeIds]
    );
    if (employees.length !== new Set(employeeIds).size) {
      throw new ApiError(400, 'One or more selected employees do not exist');
    }
  }
  const [{ rows }, { rows: activeRates }] = await Promise.all([
    db.query(
    `SELECT a.id,
            a.date,
            a.check_in,
            a.check_out,
            a.status,
            u.employee_id,
            COALESCE(NULLIF(trim(concat_ws(' ', NULLIF(p.first_name, ''), NULLIF(p.last_name, ''))), ''), u.employee_id) AS employee_name,
            COALESCE(d.name, '—') AS department
       FROM attendance a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN departments d ON d.id = p.department_id
      WHERE a.date >= $1
        AND a.date <= $2
        AND (cardinality($3::integer[]) = 0 OR a.user_id = ANY($3::integer[]))
        AND ($4::integer IS NULL OR p.department_id = $4)
        AND a.voided_at IS NULL
      ORDER BY employee_name, a.date, a.check_in NULLS LAST`,
    [from, to, employeeIds, departmentId]
    ),
    db.query('SELECT id, name FROM pay_rules WHERE is_active = TRUE ORDER BY id'),
  ]);

  if (rows.length === 0) throw new ApiError(404, 'No attendance records match the selected filters');

  const departmentName = departmentId
    ? (await db.query('SELECT name FROM departments WHERE id = $1', [departmentId])).rows[0].name
    : null;

  const { rows: payRows } = await db.query(
    `SELECT aph.attendance_id, aph.pay_rule_id, aph.hours
       FROM attendance_pay_hours aph
       JOIN pay_rules pr ON pr.id = aph.pay_rule_id AND pr.is_active = TRUE
      WHERE aph.attendance_id = ANY($1::integer[])`,
    [rows.map((row) => row.id)]
  );
  const payHoursByAttendance = new Map();
  for (const row of payRows) {
    if (!payHoursByAttendance.has(row.attendance_id)) payHoursByAttendance.set(row.attendance_id, {});
    payHoursByAttendance.get(row.attendance_id)[row.pay_rule_id] = Number(row.hours);
  }

  const records = new Map();
  for (const row of rows) {
    if (!records.has(row.id)) {
      records.set(row.id, {
        employeeName: row.employee_name,
        employeeId: row.employee_id,
        department: row.department,
        date: dateOnly(row.date),
        checkIn: row.check_in,
        checkOut: row.check_out,
        status: row.status,
        payRates: payHoursByAttendance.get(row.id) || {},
      });
    }
  }
  const allRows = [...records.values()];
  const selectedRates = mode === 'simplified'
    ? activeRates.filter((rate) => allRows.some((row) => Number(row.payRates[rate.id] || 0) !== 0))
    : activeRates;
  return {
    from,
    to,
    departmentName: departmentName || 'All Departments',
    mode,
    rows: allRows,
    payRateColumns: selectedRates.map((rate) => ({ id: rate.id, name: rate.name })),
  };
}

function displayTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(hours) {
  const totalMinutes = Math.round(Number(hours || 0) * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}-${String(totalMinutes % 60).padStart(2, '0')}`;
}

function createPdf({ from, to, departmentName = 'All Departments', mode = 'full', rows, payRateColumns = [] }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A3',
      layout: 'landscape',
      margin: PAGE_MARGIN,
      compress: false,
      info: { Title: 'Attendance Summary', Author: COMPANY_NAME },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fixedColumns = [
      { key: 'employeeName', name: 'Employee Name', width: 140 },
      { key: 'employeeId', name: 'Employee ID', width: 80 },
      { key: 'department', name: 'Department', width: 105 },
      { key: 'date', name: 'Date', width: 68 },
      { key: 'checkIn', name: 'Time In', width: 57 },
      { key: 'checkOut', name: 'Time Out', width: 57 },
    ];
    const statusColumn = { key: 'status', name: 'Status', width: 65 };
    const rateWidth = 78;
    const availableRateWidth = doc.page.width - PAGE_MARGIN * 2 -
      fixedColumns.reduce((total, column) => total + column.width, 0) - statusColumn.width;
    const ratesPerPanel = Math.max(1, Math.floor(availableRateWidth / rateWidth));
    const panels = [];
    for (let index = 0; index < payRateColumns.length; index += ratesPerPanel) {
      panels.push(payRateColumns.slice(index, index + ratesPerPanel));
    }
    if (panels.length === 0) panels.push([]);
    const rowPadding = 5;

    function drawHeader(columns, tableWidth, panelIndex) {
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#1e293b').text(COMPANY_NAME);
      doc.moveDown(0.25);
      doc.font('Helvetica').fontSize(9).fillColor('#475569')
        .text(`Date: ${new Date().toLocaleDateString('en-GB')}    Range: ${from} to ${to}    Department: ${departmentName}`);
      doc.moveDown(0.25);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1e293b').text('Attendance Summary');
      doc.font('Helvetica').fontSize(9).fillColor('#475569')
        .text(`${mode === 'simplified' ? 'Simplified' : 'Full'} Report${panels.length > 1 ? ` · Pay-rate columns ${panelIndex + 1} of ${panels.length}` : ''}`);
      doc.moveDown(0.8);

      const top = doc.y;
      doc.rect(PAGE_MARGIN, top, tableWidth, 22).fill('#e2e8f0');
      let x = PAGE_MARGIN;
      columns.forEach((column) => {
        doc.font('Helvetica-Bold').fontSize(6).fillColor('#334155')
          .text(column.name, x + rowPadding, top + 4, {
            width: column.width - rowPadding * 2,
            height: 18,
          });
        x += column.width;
      });
      doc.y = top + 22;
    }

    panels.forEach((panel, panelIndex) => {
      const columns = [
        ...fixedColumns,
        ...panel.map((rate) => ({ key: `rate-${rate.id}`, name: rate.name, width: rateWidth })),
        statusColumn,
      ];
      const tableWidth = columns.reduce((total, column) => total + column.width, 0);
      if (panelIndex > 0) doc.addPage();
      drawHeader(columns, tableWidth, panelIndex);
      let pageRowIndex = 0;
      for (const row of rows) {
          const values = columns.map((column) => {
            if (column.key === 'checkIn' || column.key === 'checkOut') {
              return displayTime(row[column.key]);
            }
            if (column.key.startsWith('rate-')) {
              const payRateId = column.key.slice(5);
              return formatDuration(row.payRates[payRateId]);
            }
            return String(row[column.key] ?? '—');
          });
          const cellHeight = Math.max(22, ...columns.map((column, index) =>
            doc.font('Helvetica').fontSize(8).heightOfString(values[index], {
              width: column.width - rowPadding * 2,
              lineGap: 1,
            }) + rowPadding * 2
          ));
          if (doc.y + cellHeight > doc.page.height - PAGE_MARGIN) {
            doc.addPage();
            drawHeader(columns, tableWidth, panelIndex);
            pageRowIndex = 0;
          }
          const rowTop = doc.y;
          doc.rect(PAGE_MARGIN, rowTop, tableWidth, cellHeight)
            .fillColor(pageRowIndex % 2 ? '#f8fafc' : '#ffffff').fill();
          doc.moveTo(PAGE_MARGIN, rowTop + cellHeight).lineTo(PAGE_MARGIN + tableWidth, rowTop + cellHeight)
            .strokeColor('#cbd5e1').lineWidth(0.5).stroke();

          let x = PAGE_MARGIN;
          values.forEach((value, index) => {
            doc.font('Helvetica').fontSize(8).fillColor('#0f172a')
              .text(value, x + rowPadding, rowTop + rowPadding, {
                width: columns[index].width - rowPadding * 2,
                lineGap: 1,
              });
            x += columns[index].width;
          });
          doc.y = rowTop + cellHeight;
          pageRowIndex += 1;
      }
    });

    doc.end();
  });
}

async function generateSummary(filters) {
  const report = await reportRows(filters);
  const pdf = await createPdf(report);
  return { pdf, from: report.from };
}

module.exports = { parseFilters, searchEmployees, reportRows, createPdf, generateSummary };
