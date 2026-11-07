const router = require('express').Router();
const { body } = require('express-validator');
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.post(
  '/login',
  validate([
    body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ]),
  controller.login
);

router.post('/refresh', controller.refresh);
router.post('/logout', auth, controller.logout);
router.get('/me', auth, controller.me);
router.patch(
  '/me/credentials',
  auth,
  rbac('admin'),
  validate([
    body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
    body('email').optional().isEmail().normalizeEmail().withMessage('A valid email is required'),
    body('newPassword').optional({ checkFalsy: true }).isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('confirmPassword').optional(),
  ]),
  controller.updateCredentials
);

module.exports = router;
