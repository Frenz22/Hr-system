const router = require('express').Router();
const auth = require('../middleware/auth');
const notificationService = require('../services/notification.service');
const { ApiError } = require('../middleware/errorHandler');

router.use(auth);

router.get('/me', async (req, res, next) => {
  try {
    const notifications = await notificationService.listForUser(req.user.id);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    const notifications = await notificationService.markAllRead(req.user.id);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const notification = await notificationService.markRead(req.user.id, req.params.id);
    if (!notification) throw new ApiError(404, 'Notification not found');
    res.json({ notification });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
