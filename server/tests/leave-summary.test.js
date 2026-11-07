const { app, request, loginAs } = require('./helpers');

describe('monthly leave summary', () => {
  let employee;
  let admin;

  beforeAll(async () => {
    employee = await loginAs();
    admin = await loginAs({ role: 'admin' });

    // Approved leave spanning a month boundary: Jan 30 - Feb 2 (4 days).
    const created = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ type: 'paid', startDate: '2031-01-30', endDate: '2031-02-02', remarks: 'Boundary' });
    expect(created.status).toBe(201);

    const decided = await request(app)
      .patch(`/api/leaves/${created.body.request.id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'approved' });
    expect(decided.status).toBe(200);
  });

  it('gives the employee their own counts, split by month, newest first', async () => {
    const res = await request(app)
      .get('/api/attendance/me/leave-summary')
      .set('Authorization', `Bearer ${employee.token}`);

    expect(res.status).toBe(200);
    expect(res.body.months).toEqual([
      { year: 2031, month: 2, days: 2 },
      { year: 2031, month: 1, days: 2 },
    ]);
  });

  it('gives HR/admin the same counts for that user', async () => {
    const res = await request(app)
      .get(`/api/attendance/leave-summary/${employee.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.months).toEqual([
      { year: 2031, month: 2, days: 2 },
      { year: 2031, month: 1, days: 2 },
    ]);
  });

  it('returns an empty list for a user with no approved leave', async () => {
    const res = await request(app)
      .get('/api/attendance/me/leave-summary')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.months).toEqual([]);
  });

  it('does not count pending leave days', async () => {
    const other = await loginAs();
    const created = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${other.token}`)
      .send({ type: 'sick', startDate: '2031-03-10', endDate: '2031-03-11' });
    expect(created.status).toBe(201);

    const res = await request(app)
      .get('/api/attendance/me/leave-summary')
      .set('Authorization', `Bearer ${other.token}`);
    expect(res.status).toBe(200);
    expect(res.body.months).toEqual([]);
  });

  it('404s for a malformed or unknown user id', async () => {
    const malformed = await request(app)
      .get('/api/attendance/leave-summary/not-an-id')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(malformed.status).toBe(404);

    const unknown = await request(app)
      .get('/api/attendance/leave-summary/999999')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(unknown.status).toBe(404);
  });
});
