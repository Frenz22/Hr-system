const router = require('express').Router();
const { body, param, query } = require('express-validator');
const auth = require('../middleware/auth');
const feedbackAdmin = require('../middleware/feedbackAdmin');
const validate = require('../middleware/validate');
const feedbackService = require('../services/feedback.service');

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

router.use(auth);

router.post(
  '/',
  validate([
    body('category')
      .isString()
      .withMessage('Feedback category is required')
      .bail()
      .isIn(feedbackService.CATEGORIES)
      .withMessage('Choose a valid feedback category'),
    body('message')
      .isString()
      .withMessage('Message is required')
      .bail()
      .customSanitizer((value) =>
        value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
      )
      .isLength({ min: 1, max: 2000 })
      .withMessage('Message must contain 1 to 2000 characters'),
  ]),
  wrap(async (req, res) => {
    const feedback = await feedbackService.submit(req.user.id, req.body);
    res.status(201).json({ feedback });
  })
);

router.get(
  '/admin',
  feedbackAdmin,
  validate([
    query('category').optional().isIn(feedbackService.CATEGORIES)
      .withMessage('Choose a valid feedback category'),
    query('status').optional().isIn(feedbackService.STATUSES)
      .withMessage('Choose a valid feedback status'),
    query('sort').optional().isIn(['newest', 'oldest'])
      .withMessage('Sort must be newest or oldest'),
  ]),
  wrap(async (req, res) => {
    const feedback = await feedbackService.list(req.query);
    res.json({ feedback });
  })
);

router.patch(
  '/admin/:id',
  feedbackAdmin,
  validate([
    param('id').isInt({ min: 1 }).withMessage('Feedback ID must be a positive integer'),
    body('status').isIn(feedbackService.STATUSES).withMessage('Choose a valid feedback status'),
  ]),
  wrap(async (req, res) => {
    const feedback = await feedbackService.updateStatus(req.params.id, req.body.status);
    res.json({ feedback });
  })
);

router.delete(
  '/admin/:id',
  feedbackAdmin,
  validate([param('id').isInt({ min: 1 }).withMessage('Feedback ID must be a positive integer')]),
  wrap(async (req, res) => {
    const id = await feedbackService.remove(req.params.id);
    res.json({ id, message: 'Feedback submission deleted' });
  })
);

module.exports = router;
