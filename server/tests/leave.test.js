const { app, request, db, loginAs } = require('./helpers');

const days = (start, end) => {
  const out = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

describe('leave requests and approval', () => {
  let admin;
  let employee;
  let systemAdmin;

  beforeAll(async () => {
    admin = await loginAs({ role: 'admin' });
    employee = await loginAs({ role: 'employee' });
    systemAdmin = await loginAs({ role: 'admin' });
    await db.query('UPDATE users SET is_system_admin = TRUE WHERE id = $1', [systemAdmin.user.id]);
  });

  async function submit(who, body) {
    return request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${who.token}`)
      .send(body);
  }

  it('creates a request and returns camelCase dates', async () => {
    const res = await submit(employee, {
      type: 'paid',
      startDate: '2026-11-02',
      endDate: '2026-11-04',
      remarks: 'Family trip',
    });

    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({
      type: 'paid',
      startDate: '2026-11-02',
      endDate: '2026-11-04',
      remarks: 'Family trip',
      status: 'pending',
    });
    expect(typeof res.body.request.id).toBe('number');
    expect(res.body.request).not.toHaveProperty('_id');
    expect(res.body.request).not.toHaveProperty('leave_type');

    const inbox = await request(app)
      .get('/api/notifications/me')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(inbox.status).toBe(200);
    expect(inbox.body.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'leave',
          isRead: false,
        }),
      ])
    );
    expect(
      inbox.body.notifications.some((note) =>
        note.message.includes(employee.user.employee_id)
      )
    ).toBe(true);

    const systemAdminInbox = await request(app)
      .get('/api/notifications/me')
      .set('Authorization', `Bearer ${systemAdmin.token}`);
    expect(systemAdminInbox.status).toBe(200);
    expect(systemAdminInbox.body.notifications).toHaveLength(0);

    const requesterInbox = await request(app)
      .get('/api/notifications/me')
      .set('Authorization', `Bearer ${employee.token}`);
    expect(requesterInbox.status).toBe(200);
    expect(requesterInbox.body.notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'leave',
          isRead: false,
          message: expect.stringContaining('submitted and is pending review'),
        }),
      ])
    );

    const createdRequest = await db.query(
      'SELECT approver_id FROM leave_requests WHERE id = $1',
      [res.body.request.id]
    );
    expect(createdRequest.rows[0].approver_id).toBe(admin.user.id);
  });

  it('gives admins the queue with the requester attached', async () => {
    await submit(employee, { type: 'sick', startDate: '2026-12-01', endDate: '2026-12-02' });

    const res = await request(app)
      .get('/api/leaves?status=pending')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    const row = res.body.requests.find((r) => r.startDate === '2026-12-01');
    expect(row).toBeDefined();
    expect(row.user).toEqual({ employeeId: employee.user.employee_id, email: employee.user.email });
  });

  it('approves, records the reviewer, and writes leave attendance', async () => {
    const created = await submit(employee, {
      type: 'unpaid',
      startDate: '2027-01-05',
      endDate: '2027-01-07',
      remarks: 'Moving house',
    });
    const id = created.body.request.id;

    const decided = await request(app)
      .patch(`/api/leaves/${id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved', adminComment: 'Enjoy' });

    expect(decided.status).toBe(200);
    expect(decided.body.request).toMatchObject({
      id,
      status: 'approved',
      adminComment: 'Enjoy',
    });
    // approver_id is written by the decision, not left as the pre-assigned route.
    expect(decided.body.request.reviewedBy.employeeId).toBe(admin.user.employee_id);
    expect(decided.body.request.reviewedAt).toBeTruthy();

    const { rows } = await db.query(
      'SELECT date, status FROM attendance WHERE user_id = $1 ORDER BY date',
      [employee.user.id]
    );
    expect(rows.map((r) => r.date)).toEqual(days('2027-01-05', '2027-01-07'));
    expect(rows.every((r) => r.status === 'leave')).toBe(true);
  });

  it('clears stale clock times when leave is approved over an attendance day', async () => {
    const created = await submit(employee, {
      type: 'paid',
      startDate: '2027-07-05',
      endDate: '2027-07-06',
    });
    const id = created.body.request.id;

    await db.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, work_hours, status)
       VALUES ($1, '2027-07-05', '2027-07-05T09:00:00Z', '2027-07-05T17:30:00Z', 8.5, 'present')`,
      [employee.user.id]
    );

    const decided = await request(app)
      .patch(`/api/leaves/${id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });
    expect(decided.status).toBe(200);

    const { rows } = await db.query(
      `SELECT date, status, check_in, check_out, work_hours
         FROM attendance
        WHERE user_id = $1 AND date BETWEEN '2027-07-05' AND '2027-07-06'
        ORDER BY date`,
      [employee.user.id]
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe('leave');
      expect(row.check_in).toBeNull();
      expect(row.check_out).toBeNull();
      expect(Number(row.work_hours)).toBe(0);
    }
    const audit = await db.query(
      `SELECT action, reason, previous_values, updated_values
         FROM attendance_audit
        WHERE employee_id = $1
          AND action = 'leave_approval'
          AND updated_values->>'date' BETWEEN '2027-07-05' AND '2027-07-06'
        ORDER BY attendance_id`,
      [employee.user.id]
    );
    expect(audit.rows).toHaveLength(2);
    expect(audit.rows[0]).toMatchObject({
      action: 'leave_approval',
      previous_values: expect.objectContaining({ status: 'present' }),
      updated_values: expect.objectContaining({ status: 'leave' }),
    });
    expect(audit.rows[1]).toMatchObject({
      action: 'leave_approval',
      previous_values: null,
      updated_values: expect.objectContaining({ status: 'leave' }),
    });
  });

  it('does not let HR or admins decide their own leave request', async () => {
    const hr = await loginAs({ role: 'hr_staff' });
    const created = await submit(hr, {
      type: 'paid',
      startDate: '2027-08-02',
      endDate: '2027-08-02',
    });

    const res = await request(app)
      .patch(`/api/leaves/${created.body.request.id}/decision`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/own leave/i);

    const { rows } = await db.query('SELECT status FROM leave_requests WHERE id = $1', [
      created.body.request.id,
    ]);
    expect(rows[0].status).toBe('pending');
  });

  it('refuses a second decision on the same request', async () => {
    const created = await submit(employee, { type: 'paid', startDate: '2027-02-01', endDate: '2027-02-01' });
    const id = created.body.request.id;

    await request(app)
      .patch(`/api/leaves/${id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });

    const again = await request(app)
      .patch(`/api/leaves/${id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'rejected' });

    expect(again.status).toBe(409);
  });

  it('lets HR staff list the queue and decide', async () => {
    const hr = await loginAs({ role: 'hr_staff' });
    const created = await submit(employee, {
      type: 'paid',
      startDate: '2027-03-10',
      endDate: '2027-03-10',
    });

    const queue = await request(app)
      .get('/api/leaves?status=pending')
      .set('Authorization', `Bearer ${hr.token}`);
    expect(queue.status).toBe(200);
    expect(queue.body.requests.some((r) => r.id === created.body.request.id)).toBe(true);

    const decided = await request(app)
      .patch(`/api/leaves/${created.body.request.id}/decision`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ status: 'rejected', adminComment: 'Peak period' });

    expect(decided.status).toBe(200);
    expect(decided.body.request.reviewedBy.employeeId).toBe(hr.user.employee_id);
  });

  it('keeps the queue admin/HR-only', async () => {
    const res = await request(app)
      .get('/api/leaves')
      .set('Authorization', `Bearer ${employee.token}`);
    expect(res.status).toBe(403);
  });

  it('cancels a pending request and refuses to cancel an approved one', async () => {
    const pending = await submit(employee, { type: 'paid', startDate: '2027-04-01', endDate: '2027-04-01' });
    const cancel = await request(app)
      .delete(`/api/leaves/${pending.body.request.id}`)
      .set('Authorization', `Bearer ${employee.token}`);
    expect(cancel.status).toBe(200);

    const approved = await submit(employee, { type: 'paid', startDate: '2027-05-01', endDate: '2027-05-01' });
    await request(app)
      .patch(`/api/leaves/${approved.body.request.id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });

    const refused = await request(app)
      .delete(`/api/leaves/${approved.body.request.id}`)
      .set('Authorization', `Bearer ${employee.token}`);
    expect(refused.status).toBe(409);
  });

  it('rejects a malformed id instead of leaking a database error', async () => {
    const res = await request(app)
      .patch('/api/leaves/undefined/decision')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid leave request id/i);
  });

  it('notifies the requester when a decision is made', async () => {
    const created = await submit(employee, { type: 'paid', startDate: '2027-06-01', endDate: '2027-06-01' });
    await request(app)
      .patch(`/api/leaves/${created.body.request.id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });

    const notes = await request(app)
      .get('/api/notifications/me')
      .set('Authorization', `Bearer ${employee.token}`);

    expect(notes.status).toBe(200);
    expect(notes.body.notifications.some((n) => n.type === 'leave')).toBe(true);
  });

  it('marks every notification read', async () => {
    const res = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications.every((note) => note.isRead)).toBe(true);

    const after = await request(app)
      .get('/api/notifications/me')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(after.body.notifications.every((note) => note.isRead)).toBe(true);
  });
});
