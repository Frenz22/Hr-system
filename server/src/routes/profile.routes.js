const router = require('express').Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const { uploadImage, uploadDocument } = require('../middleware/upload');
const controller = require('../controllers/profile.controller');

router.use(auth);

// Own profile (any authenticated user; employee-editable fields only)
router.get('/me', controller.getMe);
router.patch('/me', controller.updateMe);
router.post('/me/picture', uploadImage, controller.uploadPicture);
router.post('/me/documents', uploadDocument, controller.uploadDocument);
router.get('/documents/:id/download', controller.downloadDocument);
router.delete('/documents/:id', controller.deleteDocument);

// Directory + full edit (admin, or HR staff managing people). Deletion stays
// admin-only because it is destructive.
router.get('/', rbac('admin', 'hr_staff'), controller.list);
router.get('/:userId', rbac('admin', 'hr_staff'), controller.getOne);
router.put('/:userId', rbac('admin', 'hr_staff'), controller.updateOne);
router.delete('/:userId', rbac('admin'), controller.deleteOne);

module.exports = router;
