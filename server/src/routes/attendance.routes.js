const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const validate = require('../middleware/validate');
const attendanceService = require('../services/attendance.service');
const summaryController = require('../controllers/attendance.summary.controller');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

router.use(auth);

router.get(
  '/summary/employees',
  rbac('admin', 'hr_staff'),
  summaryController.employees
);

router.post(
  '/summary',
  rbac('admin', 'hr_staff'),
  summaryController.generate
);

// Employee: read-only history. Attendance is recorded by HR through the
// Excel import; identity always comes from the verified JWT, never params.
router.get(
  '/me',
  wrap(async (req, res) => {
    const result = await attendanceService.listOwn(req.user.id, req.query);
    res.json(result);
  })
);

router.get(
  '/me/leave-summary',
  wrap(async (req, res) => {
    const result = await attendanceService.monthlyLeaveSummary(req.user.id);
    res.json(result);
  })
);

// Admin / HR: workforce-wide visibility and corrections.
router.get(
  '/',
  rbac('admin', 'hr_staff'),
  wrap(async (req, res) => {
    const result = await attendanceService.adminList(req.query);
    res.json(result);
  })
);

router.get(
  '/leave-summary/:userId',
  rbac('admin', 'hr_staff'),
  wrap(async (req, res) => {
    const result = await attendanceService.monthlyLeaveSummary(req.params.userId);
    res.json(result);
  })
);

router.get(
  '/:id/history',
  rbac('admin', 'hr_staff'),
  wrap(async (req, res) => {
    res.json(await attendanceService.history(req.params.id));
  })
);

router.get(
  '/:id/notes',
  wrap(async (req, res) => {
    res.json(await attendanceService.listNotes(req.user, req.params.id));
  })
);

router.post(
  '/:id/notes',
  rbac('employee'),
  validate([body('note').isString().trim().isLength({ min: 1, max: 1000 })]),
  wrap(async (req, res) => {
    res.status(201).json(await attendanceService.addOwnNote(req.user.id, req.params.id, req.body.note));
  })
);

router.patch(
  '/:id',
  rbac('admin', 'hr_staff'),
  (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid attendance id' });
    }
    return next();
  },
  validate([
    body().custom((value) =>
      Object.keys(value || {}).every((key) => ['date', 'status', 'checkIn', 'checkOut', 'reason'].includes(key))
    ).withMessage('Only date, status, checkIn, checkOut and reason may be changed'),
    body('reason').isString().trim().isLength({ min: 3, max: 500 })
      .withMessage('A correction reason between 3 and 500 characters is required'),
    body('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/),
    body('status').optional().isIn(['present', 'absent', 'half-day', 'leave', 'incomplete']),
    body('checkIn')
      .optional({ nullable: true })
      .custom((value) => value === '' || !Number.isNaN(Date.parse(value)))
      .withMessage('Check-in must be a valid date and time'),
    body('checkOut')
      .optional({ nullable: true })
      .custom((value) => value === '' || !Number.isNaN(Date.parse(value)))
      .withMessage('Check-out must be a valid date and time'),
  ]),
  wrap(async (req, res) => {
    const { reason, ...fields } = req.body;
    const record = await attendanceService.adminUpdate(req.params.id, fields, req.user.id, reason);
    res.json({ record });
  })
);

router.post(
  '/:id/void',
  rbac('admin'),
  validate([body('reason').isString().trim().isLength({ min: 3, max: 500 })]),
  wrap(async (req, res) => {
    res.json(await attendanceService.voidAttendance(req.params.id, req.user.id, req.body.reason));
  })
);

module.exports = router;
