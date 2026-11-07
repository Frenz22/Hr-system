const attendanceSummaryService = require('../services/attendance.summary.service');
const { ApiError } = require('../middleware/errorHandler');

async function employees(req, res, next) {
  try {
    const search = req.query.search || '';
    if (typeof search !== 'string' || search.length > 100) {
      throw new ApiError(400, 'Employee search must be 100 characters or fewer');
    }
    const includeAll = req.query.all === 'true';
    const rawDepartmentId = req.query.departmentId;
    const departmentId = rawDepartmentId === undefined || rawDepartmentId === ''
      ? null
      : Number(rawDepartmentId);
    if (departmentId !== null && (!Number.isInteger(departmentId) || departmentId < 1)) {
      throw new ApiError(400, 'Department must be a valid positive integer');
    }
    const results = await attendanceSummaryService.searchEmployees(search, {
      includeAll,
      departmentId,
    });
    res.json({ employees: results });
  } catch (err) {
    next(err);
  }
}

async function generate(req, res, next) {
  try {
    const { pdf, from } = await attendanceSummaryService.generateSummary(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="attendance-summary-${from}.pdf"`
    );
    res.send(pdf);
  } catch (err) {
    next(err);
  }
}

module.exports = { employees, generate };
