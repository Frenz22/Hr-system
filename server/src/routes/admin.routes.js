const router = require('express').Router();
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const db = require('../config/db');
const { startOfDayUTC } = require('../utils/dates');

router.use(auth, rbac('admin', 'hr_staff'));

// Dashboard summary tiles (admin and HR staff).
router.get('/summary', async (req, res, next) => {
  try {
    const [totalEmployees, totalAdmins] = await Promise.all([
      db.query("SELECT count(*) FROM users WHERE role = 'employee'").then(r => parseInt(r.rows[0].count, 10)),
      db.query("SELECT count(*) FROM users WHERE role IN ('admin', 'hr_staff')").then(r => parseInt(r.rows[0].count, 10)),
    ]);

    let presentToday = 0;
    let pendingLeaves = 0;
    
    try {
      const today = startOfDayUTC(new Date());
      const attRes = await db.query(
        'SELECT count(*) FROM attendance WHERE date = $1 AND status IN (\'present\', \'half-day\')',
        [today]
      );
      presentToday = parseInt(attRes.rows[0].count);
    } catch (err) { 
      console.error('[admin/summary] Attendance count failed:', err.message);
    }
    
    try {
      const leaveRes = await db.query(
        'SELECT count(*) FROM leave_requests WHERE status = \'pending\''
      );
      pendingLeaves = parseInt(leaveRes.rows[0].count);
    } catch (err) {
      console.error('[admin/summary] Leave count failed:', err.message);
    }

    res.json({ summary: { totalEmployees, totalAdmins, presentToday, pendingLeaves } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
