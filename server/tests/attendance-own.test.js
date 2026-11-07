const { app, request, db, loginAs } = require('./helpers');

describe('employee attendance history pagination', () => {
  let employee;

  beforeAll(async () => {
    employee = await loginAs();
    await db.query(
      `INSERT INTO attendance (user_id, date, work_hours, status)
       SELECT $1, DATE '2030-01-01' + day, 8, 'present'
         FROM generate_series(0, 54) AS day`,
      [employee.user.id]
    );
  });

  it('returns all-time history in descending pages with filtered totals', async () => {
    const first = await request(app)
      .get('/api/attendance/me')
      .set('Authorization', `Bearer ${employee.token}`);

    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ total: 55, page: 1, limit: 20, pages: 3 });
    expect(first.body.records).toHaveLength(20);
    expect(first.body.records[0].date).toBe('2030-02-24');

    const second = await request(app)
      .get('/api/attendance/me?page=2&limit=50&from=2030-01-10&to=2030-01-20')
      .set('Authorization', `Bearer ${employee.token}`);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ total: 11, page: 2, limit: 50, pages: 1 });
    expect(second.body.records).toHaveLength(0);

    const firstFilteredPage = await request(app)
      .get('/api/attendance/me?page=1&limit=50&from=2030-01-10&to=2030-01-20')
      .set('Authorization', `Bearer ${employee.token}`);
    expect(firstFilteredPage.body.records).toHaveLength(11);
  });

  it('rejects invalid date ranges and unsupported page sizes', async () => {
    const invalidRange = await request(app)
      .get('/api/attendance/me?from=2030-02-01&to=2030-01-01')
      .set('Authorization', `Bearer ${employee.token}`);
    expect(invalidRange.status).toBe(400);

    const invalidSize = await request(app)
      .get('/api/attendance/me?limit=100')
      .set('Authorization', `Bearer ${employee.token}`);
    expect(invalidSize.status).toBe(400);
  });
});
