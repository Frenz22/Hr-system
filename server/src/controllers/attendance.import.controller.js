const attendanceImportService = require('../services/attendance.import.service');
const { ApiError } = require('../middleware/errorHandler');
const { dateOnly } = require('../utils/serializers');

function readFile(req) {
  if (!req.file) throw new ApiError(400, 'Choose an .xlsx or .xls file to import');
  return attendanceImportService.readWorkbook(req.file.buffer);
}

async function previewImport(req, res, next) {
  try {
    const rows = readFile(req);
    const { valid, invalid } = await attendanceImportService.parseAttendanceFile(rows);
    const requiredColumns = attendanceImportService.REQUIRED_COLUMNS;
    const missingColumns = attendanceImportService.missingRequiredColumns(rows);
    const missingColumnFields = new Set(
      requiredColumns
        .filter((column) => missingColumns.includes(column.label))
        .map((column) => column.field)
    );
    const errors = invalid.filter((item) => {
      if (missingColumnFields.has('employeeId') && item.reason === 'Employee ID is required') {
        return false;
      }
      if (missingColumnFields.has('email') && item.reason === 'Email is required') {
        return false;
      }
      if (missingColumnFields.has('date') && item.reason.startsWith('Date must be a real date')) {
        return false;
      }
      return true;
    });

    res.json({
      preview: {
        total: rows.length,
        valid: valid.length,
        invalid: invalid.length,
        requiredColumns: requiredColumns.map((column) => column.label),
        missingColumns,
        rows: attendanceImportService.toPreviewRows(valid),
        errors,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function confirmImport(req, res, next) {
  try {
    const rows = readFile(req);
    const result = await attendanceImportService.importAttendance(rows, {
      actorId: req.user.id,
      reason: req.body.reason,
    });
    res.json({ result });
  } catch (err) {
    next(err);
  }
}

async function exportAttendance(req, res, next) {
  try {
    const { rows, rules } = await attendanceImportService.exportAttendance(req.query);
    const buffer = attendanceImportService.toWorkbook(rows, rules);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attendance-${dateOnly(new Date())}.xlsx"`
    );
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

module.exports = { previewImport, confirmImport, exportAttendance };
