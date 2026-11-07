const { app, request, db, loginAs } = require('./helpers');

async function insertRecord(userId, date, status = 'present') {
  const { rows } = await db.query(
    `INSERT INTO attendance (user_id, date, check_in, check_out, work_hours, status)
     VALUES ($1, $2, NULL, NULL, 0, $3)
     RETURNING id`,
    [userId, date, status]
  );
  return rows[0].id;
}

function correct(token, id, body) {
  return request(app)
    .patch(`/api/attendance/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reason: 'Correcting an attendance record', ...body });
}

function addNote(token, id, note) {
  return request(app)
    .post(`/api/attendance/${id}/notes`)
    .set('Authorization', `Bearer ${token}`)
    .send({ note });
}

describe('attendance corrections', () => {
  let admin;
  let hr;
  let employee;

  beforeAll(async () => {
    admin = await loginAs({ role: 'admin' });
    hr = await loginAs({ role: 'hr_staff' });
    employee = await loginAs({ role: 'employee' });
  });

  it('recomputes work hours from corrected clock times', async () => {
    const id = await insertRecord(employee.user.id, '2031-01-05', 'present');

    const res = await correct(admin.token, id, {
      status: 'present',
      checkIn: '2031-01-05T09:15:00.000Z',
      checkOut: '2031-01-05T16:45:00.000Z',
    });

    expect(res.status).toBe(200);
    expect(res.body.record.workHours).toBe(7.5);
    expect(res.body.record.status).toBe('present');
  });

  it('derives half-day from a short shift when no status is supplied', async () => {
    const id = await insertRecord(employee.user.id, '2031-01-06', 'absent');

    const res = await correct(admin.token, id, {
      checkIn: '2031-01-06T09:00:00.000Z',
      checkOut: '2031-01-06T11:00:00.000Z',
    });

    expect(res.status).toBe(200);
    expect(res.body.record.status).toBe('half-day');
    expect(res.body.record.workHours).toBe(2);
  });

  it('clears clocks and payable hours when a day becomes leave', async () => {
    const id = await insertRecord(employee.user.id, '2031-01-07', 'present');
    await db.query(
      `INSERT INTO pay_rules (name, type, multiplier) VALUES ('Correction test rate', 'custom', 2)
       ON CONFLICT DO NOTHING`
    );
    const { rows: rules } = await db.query("SELECT id FROM pay_rules WHERE name = 'Correction test rate'");
    await db.query('INSERT INTO attendance_pay_hours (attendance_id, pay_rule_id, hours) VALUES ($1, $2, 3)', [
      id,
      rules[0].id,
    ]);

    const res = await correct(admin.token, id, { status: 'leave' });
    expect(res.status).toBe(200);
    expect(res.body.record).toMatchObject({
      status: 'leave',
      checkIn: null,
      checkOut: null,
      workHours: 0,
    });

    const { rows } = await db.query('SELECT * FROM attendance_pay_hours WHERE attendance_id = $1', [id]);
    expect(rows).toHaveLength(0);
  });

  it('allows HR corrections and rejects malformed times', async () => {
    const id = await insertRecord(employee.user.id, '2031-01-08', 'present');

    const asHr = await correct(hr.token, id, { status: 'present' });
    expect(asHr.status).toBe(200);

    const badTime = await correct(admin.token, id, { checkIn: 'not-a-time' });
    expect(badTime.status).toBe(400);
  });

  it('requires a correction reason and records the correction in audit history', async () => {
    const id = await insertRecord(employee.user.id, '2031-01-09', 'present');
    const missingReason = await correct(admin.token, id, { reason: '', status: 'half-day' });
    expect(missingReason.status).toBe(400);

    const corrected = await correct(hr.token, id, { status: 'half-day' });
    expect(corrected.status).toBe(200);
    const { rows } = await db.query(
      'SELECT action, reason, previous_values, updated_values FROM attendance_audit WHERE attendance_id = $1',
      [id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'correction',
      reason: 'Correcting an attendance record',
      previous_values: expect.objectContaining({ status: 'present' }),
      updated_values: expect.objectContaining({ status: 'half-day' }),
    });
  });

  it('lets employees add notes only to their own attendance records', async () => {
    const id = await insertRecord(employee.user.id, '2031-01-10', 'present');
    const added = await addNote(employee.token, id, 'My check-in was delayed by a transit issue.');
    expect(added.status).toBe(201);
    expect(added.body.note.note).toMatch(/transit issue/);

    const ownNotes = await request(app)
      .get(`/api/attendance/${id}/notes`)
      .set('Authorization', `Bearer ${employee.token}`);
    expect(ownNotes.status).toBe(200);
    expect(ownNotes.body.notes).toHaveLength(1);

    const outsider = await loginAs({ role: 'employee' });
    const forbidden = await request(app)
      .get(`/api/attendance/${id}/notes`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(forbidden.status).toBe(403);
  });

  it('restricts voiding to admins and preserves the void audit entry', async () => {
    const id = await insertRecord(employee.user.id, '2031-01-11', 'present');
    const forbidden = await request(app)
      .post(`/api/attendance/${id}/void`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ reason: 'Duplicate attendance record' });
    expect(forbidden.status).toBe(403);

    const voided = await request(app)
      .post(`/api/attendance/${id}/void`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ reason: 'Duplicate attendance record' });
    expect(voided.status).toBe(200);

    const { rows } = await db.query(
      'SELECT action, reason FROM attendance_audit WHERE attendance_id = $1',
      [id]
    );
    expect(rows).toEqual([{ action: 'void', reason: 'Duplicate attendance record' }]);
  });
});
