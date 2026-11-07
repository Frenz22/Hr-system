const router = require('express').Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const validate = require('../middleware/validate');
const leaveService = require('../services/leave.service');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

router.use(auth);

// Employee
router.post(
  '/',
  validate([
    body('type').isIn(['paid', 'sick', 'unpaid']).withMessage('Leave type must be paid, sick or unpaid'),
    body('startDate').isISO8601().withMessage('Start date is required'),
    body('endDate').isISO8601().withMessage('End date is required'),
    body('remarks').optional().isLength({ max: 500 }),
  ]),
  wrap(async (req, res) => {
    const request = await leaveService.create(req.user.id, req.body);
    res.status(201).json({ request });
  })
);

router.get(
  '/me',
  wrap(async (req, res) => {
    const requests = await leaveService.listOwn(req.user.id, req.query);
    res.json({ requests });
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    await leaveService.cancelOwn(req.user.id, req.params.id);
    res.json({ message: 'Request cancelled' });
  })
);

// Admin
router.get(
  '/',
  rbac('admin', 'hr_staff'),
  wrap(async (req, res) => {
    const result = await leaveService.adminList(req.query);
    res.json(result);
  })
);

router.patch(
  '/:id/decision',
  rbac('admin', 'hr_staff'),
  validate([
    body('status').isIn(['approved', 'rejected']).withMessage('Decision must be approved or rejected'),
    body('adminComment').optional().isLength({ max: 500 }),
  ]),
  wrap(async (req, res) => {
    const request = await leaveService.decide(req.user.id, req.params.id, req.body);
    res.json({ request });
  })
);

module.exports = router;
