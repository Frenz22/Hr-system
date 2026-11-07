const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const sanitizeBody = require('./middleware/sanitize');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

// API responses are per-user and change constantly. Letting Express attach
// ETags causes conditional 304s that some dev proxies deliver without a body,
// which blanks out pages that fetch on mount (React StrictMode runs effects
// twice in development).
app.set('etag', false);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(sanitizeBody);

// Brute-force protection on the credential surface only.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.nodeEnv === 'test',
});
app.use('/api/auth', authLimiter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/feedback', require('./routes/feedback.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/profiles', require('./routes/profile.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));
app.use('/api/attendance/import', require('./routes/attendance.import.routes'));
app.use('/api/leaves', require('./routes/leave.routes'));
app.use('/api/payroll', require('./routes/payroll.routes'));
app.use('/api/payrules', require('./routes/payrule.routes'));
app.use('/api/departments', require('./routes/department.routes'));
app.use('/api/employees', require('./routes/employee.routes'));

// Avatars are intentionally public so they can be used in <img> tags. Documents
// are private and only leave the server through the authenticated download
// route in profile.routes.js.
app.use(
  '/uploads/avatars',
  express.static(path.join(__dirname, '..', 'uploads', 'avatars'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
    },
  })
);

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
