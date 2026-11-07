const router = require('express').Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const payrollService = require('../services/payroll.service');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

router.use(auth);

// Employee: read-only. No POST/PUT/PATCH exists on this path for employees.
router.get(
  '/me',
  wrap(async (req, res) => {
    res.json(await payrollService.getOwn(req.user.id));
  })
);

// Admin: full read/write over all payroll data.
router.get(
  '/',
  rbac('admin'),
  wrap(async (req, res) => {
    res.json(await payrollService.adminList(req.query));
  })
);

router.get(
  '/:userId',
  rbac('admin'),
  wrap(async (req, res) => {
    res.json(await payrollService.adminGet(req.params.userId));
  })
);

router.put(
  '/:userId',
  rbac('admin'),
  wrap(async (req, res) => {
    res.json(await payrollService.adminUpdate(req.params.userId, req.body));
  })
);

module.exports = router;
