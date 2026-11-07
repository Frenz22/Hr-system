const router = require('express').Router();
const controller = require('../controllers/payrule.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

router.use(auth);

router.get('/', rbac('admin', 'hr_staff'), controller.listRules);
router.post('/', rbac('admin'), controller.createRule);
router.patch('/:id', rbac('admin'), controller.updateRule);
router.patch('/:id/toggle', rbac('admin'), controller.toggleRule);

module.exports = router;
