const router = require('express').Router();
const controller = require('../controllers/attendance.import.controller');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { uploadExcel } = require('../middleware/upload');

router.use(auth);
router.use(rbac('admin', 'hr_staff'));

router.post('/preview', uploadExcel, controller.previewImport);
router.post('/confirm', uploadExcel, controller.confirmImport);
router.get('/export', controller.exportAttendance);

module.exports = router;
