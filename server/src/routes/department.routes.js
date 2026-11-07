const router = require('express').Router();
const controller = require('../controllers/department.controller');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/', rbac('admin', 'hr_staff'), controller.getDepartments);
router.post('/', rbac('admin'), validate([
  body('name').trim().notEmpty().withMessage('Department name is required')
]), controller.createDepartment);
router.delete('/:id', rbac('admin'), controller.deleteDepartment);

module.exports = router;
