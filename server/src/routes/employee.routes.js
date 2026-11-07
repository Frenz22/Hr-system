const router = require('express').Router();
const controller = require('../controllers/employee.controller');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.post(
  '/create',
  rbac('admin', 'hr_staff'),
  validate([
    body('employeeId').trim().notEmpty().withMessage('Employee ID is required'),
    body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['employee', 'hr_staff', 'admin']).withMessage('Invalid role'),
    body('firstName').optional().isString().isLength({ max: 255 }),
    body('lastName').optional().isString().isLength({ max: 255 }),
    body('phone').optional().isString().isLength({ max: 50 }),
    body('address').optional().isString().isLength({ max: 500 }),
    body('designation').optional().isString().isLength({ max: 255 }),
    body('employmentType').optional().isString().isLength({ max: 50 }),
    body('departmentId').optional({ nullable: true }).isInt({ min: 1 }),
    body('joiningDate').optional({ nullable: true }).isISO8601(),
  ]),
  controller.createAccount
);

router.patch(
  '/:userId/role',
  rbac('admin'),
  validate([
    body('role').isIn(['employee', 'hr_staff', 'admin']).withMessage('Invalid role'),
  ]),
  controller.updateRole
);

module.exports = router;
