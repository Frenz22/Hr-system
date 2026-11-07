const { app, request, db, loginAs } = require('./helpers');

// One vocabulary at the HTTP boundary: camelCase keys, numeric ids and money,
// ISO date strings. Anything snake_case or a Mongo `_id` is a leak from the
// storage layer and would reintroduce the two-vocabulary bug on the client.
function findBadKeys(value, path = '') {
  const bad = [];
  if (Array.isArray(value)) {
    value.forEach((item, i) => bad.push(...findBadKeys(item, `${path}[${i}]`)));
    return bad;
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [key, child] of Object.entries(value)) {
      const here = path ? `${path}.${key}` : key;
      if (key === '_id' || key === '__v') bad.push(here);
      else if (/^[a-z]+(_[a-z]+)+$/.test(key)) bad.push(here);
      bad.push(...findBadKeys(child, here));
    }
  }
  return bad;
}

function expectClean(body, label) {
  expect({ label, bad: findBadKeys(body) }).toEqual({ label, bad: [] });
}

describe('API contract', () => {
  let admin;
  let hr;
  let employee;

  beforeAll(async () => {
    admin = await loginAs({ role: 'admin' });
    hr = await loginAs({ role: 'hr_staff' });
    employee = await loginAs({ role: 'employee' });
  });

  it('returns the profile envelope with a flat camelCase profile', async () => {
    const res = await request(app)
      .get('/api/profiles/me')
      .set('Authorization', `Bearer ${employee.token}`);

    expect(res.status).toBe(200);
    expectClean(res.body, 'profiles/me');
    expect(res.body.user).toMatchObject({
      id: employee.user.id,
      employeeId: employee.user.employee_id,
      email: employee.user.email,
      role: 'employee',
    });
    expect(res.body.profile).toMatchObject({
      userId: employee.user.id,
      firstName: '',
      lastName: '',
      employmentType: 'full-time',
      salary: { basic: 0, hra: 0, allowances: 0, deductions: 0, currency: 'INR' },
    });
    expect(typeof res.body.profile.id).toBe('number');
    expect(res.body.profile).not.toHaveProperty('personal');
    expect(res.body.profile).not.toHaveProperty('job');
  });

  it('accepts camelCase profile updates and echoes them back', async () => {
    const res = await request(app)
      .patch('/api/profiles/me')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ firstName: 'Ada', lastName: 'Lovelace', phone: '555-0100' });

    expect(res.status).toBe(200);
    expectClean(res.body, 'profiles/me patch');
    expect(res.body.profile).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '555-0100',
    });
  });

  it('lists the directory as rows of { user, profile }', async () => {
    const res = await request(app)
      .get('/api/profiles')
      .set('Authorization', `Bearer ${hr.token}`);

    expect(res.status).toBe(200);
    expectClean(res.body, 'profiles list');
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body).toMatchObject({ total: expect.any(Number), page: 1 });
    const row = res.body.rows.find((r) => r.user.id === employee.user.id);
    expect(row).toBeDefined();
    expect(row.profile.firstName).toBe('Ada');
  });

  it('returns attendance with camelCase fields and a numeric workHours', async () => {
    await db.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, work_hours, status)
       VALUES ($1, $2, $3, $4, $5, 'present')`,
      [
        employee.user.id,
        '2032-04-01',
        '2032-04-01T09:00:00Z',
        '2032-04-01T17:30:00Z',
        8.5,
      ]
    );

    const own = await request(app)
      .get('/api/attendance/me')
      .set('Authorization', `Bearer ${employee.token}`);

    expect(own.status).toBe(200);
    expectClean(own.body, 'attendance own list');
    expect(own.body.records[0]).toMatchObject({
      status: 'present',
      userId: employee.user.id,
      workHours: 8.5,
      date: '2032-04-01',
    });
    expect(own.body.records[0]).not.toHaveProperty('check_in');

    const list = await request(app)
      .get('/api/attendance')
      .set('Authorization', `Bearer ${hr.token}`);

    expect(list.status).toBe(200);
    expectClean(list.body, 'attendance list');
    const record = list.body.records.find((r) => r.date === '2032-04-01');
    expect(record).toBeDefined();
    expect(record.user.employeeId).toBe(employee.user.employee_id);
  });

  it('no longer exposes employee check-in or check-out', async () => {
    for (const path of ['/api/attendance/check-in', '/api/attendance/check-out']) {
      const res = await request(app)
        .post(path)
        .set('Authorization', `Bearer ${employee.token}`);

      expect(res.status).toBe(404);
    }
  });

  it('returns payroll money as numbers, never concatenated strings', async () => {
    const update = await request(app)
      .put(`/api/payroll/${employee.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ basic: 30000, hra: 12000, allowances: 3000, deductions: 5000 });

    expect(update.status).toBe(200);
    expect(update.body.salary).toMatchObject({
      basic: 30000,
      hra: 12000,
      allowances: 3000,
      deductions: 5000,
      gross: 45000,
      net: 40000,
    });

    const list = await request(app)
      .get('/api/payroll')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(list.status).toBe(200);
    expectClean(list.body, 'payroll list');
    const row = list.body.rows.find((r) => r.user.id === employee.user.id);
    expect(row.salary.gross).toBe(45000);
    expect(typeof row.salary.basic).toBe('number');
  });

  it('keeps salary admin-only for HR reads and writes', async () => {
    const setSalary = await request(app)
      .put(`/api/profiles/${employee.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ salary: { basic: 52000, hra: 8000, allowances: 2000, deductions: 1000 } });

    expect(setSalary.status).toBe(200);
    expect(setSalary.body.profile.salary).toMatchObject({ basic: 52000, hra: 8000 });

    const hrRead = await request(app)
      .get(`/api/profiles/${employee.user.id}`)
      .set('Authorization', `Bearer ${hr.token}`);
    expect(hrRead.status).toBe(200);
    expect(hrRead.body.profile.salary).toBeNull();

    const hrList = await request(app)
      .get(`/api/profiles?search=${employee.user.employee_id}`)
      .set('Authorization', `Bearer ${hr.token}`);
    expect(hrList.status).toBe(200);
    const listed = hrList.body.rows.find((r) => r.user.id === employee.user.id);
    expect(listed.profile.salary).toBeNull();

    const hrSalaryWrite = await request(app)
      .put(`/api/profiles/${employee.user.id}`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ salary: { basic: 90000 } });
    expect(hrSalaryWrite.status).toBe(403);
    expect(hrSalaryWrite.body.error).toMatch(/only admins/i);

    const hrEdit = await request(app)
      .put(`/api/profiles/${employee.user.id}`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ firstName: 'Grace' });
    expect(hrEdit.status).toBe(200);
    expect(hrEdit.body.profile.firstName).toBe('Grace');
    // A people-field update must not echo the hidden salary back to HR.
    expect(hrEdit.body.profile.salary).toBeNull();

    const { rows } = await db.query('SELECT salary_basic FROM profiles WHERE user_id = $1', [
      employee.user.id,
    ]);
    expect(Number(rows[0].salary_basic)).toBe(52000);

    const adminRead = await request(app)
      .get(`/api/profiles/${employee.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.profile.salary).toMatchObject({ basic: 52000, hra: 8000 });
  });

  it('returns departments in a departments envelope', async () => {
    const created = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${hr.token}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Engineering', description: 'Builds things', code: 'ENG' });

    expect(created.status).toBe(201);
    expectClean(created.body, 'department create');
    expect(created.body.department).toMatchObject({ name: 'Engineering', code: 'ENG' });

    const list = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${hr.token}`);
    expect(list.status).toBe(200);
    expectClean(list.body, 'department list');
    expect(Array.isArray(list.body.departments)).toBe(true);
  });

  it('serves the dashboard summary to HR staff', async () => {
    const res = await request(app)
      .get('/api/admin/summary')
      .set('Authorization', `Bearer ${hr.token}`);

    expect(res.status).toBe(200);
    expectClean(res.body, 'admin summary');
    expect(res.body.summary).toMatchObject({
      totalEmployees: expect.any(Number),
      presentToday: expect.any(Number),
      pendingLeaves: expect.any(Number),
    });
  });

  it('notifies in camelCase', async () => {
    const res = await request(app)
      .get('/api/notifications/me')
      .set('Authorization', `Bearer ${employee.token}`);

    expect(res.status).toBe(200);
    expectClean(res.body, 'notifications');
    expect(Array.isArray(res.body.notifications)).toBe(true);
    for (const note of res.body.notifications) {
      expect(typeof note.isRead).toBe('boolean');
      expect(note).not.toHaveProperty('is_read');
    }
  });

  it('rejects malformed ids with 400 rather than a database error', async () => {
    const res = await request(app)
      .patch('/api/attendance/undefined')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'present' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid attendance id/i);
  });

  it('keeps payroll admin-only while HR staff can read people data', async () => {
    const payroll = await request(app)
      .get('/api/payroll')
      .set('Authorization', `Bearer ${hr.token}`);
    expect(payroll.status).toBe(403);

    const directory = await request(app)
      .get('/api/profiles')
      .set('Authorization', `Bearer ${hr.token}`);
    expect(directory.status).toBe(200);
  });

  it('returns the signed-in user in camelCase', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${employee.token}`);

    expect(res.status).toBe(200);
    expectClean(res.body, 'auth me');
    expect(res.body.user).toEqual({
      id: employee.user.id,
      employeeId: employee.user.employee_id,
      email: employee.user.email,
      role: 'employee',
    });
  });

  it('returns pay rules with numeric multipliers in envelopes', async () => {
    const created = await request(app)
      .post('/api/payrules')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Overtime', type: 'overtime', multiplier: 1.5, thresholdHours: 8 });

    expect(created.status).toBe(201);
    expectClean(created.body, 'pay rule create');
    expect(created.body.rule).toMatchObject({
      name: 'Overtime',
      type: 'overtime',
      multiplier: 1.5,
      thresholdHours: 8,
      isActive: true,
    });
    expect(typeof created.body.rule.multiplier).toBe('number');

    const list = await request(app)
      .get('/api/payrules')
      .set('Authorization', `Bearer ${hr.token}`);
    expect(list.status).toBe(200);
    expectClean(list.body, 'pay rule list');
    expect(list.body.rules.some((r) => r.id === created.body.rule.id)).toBe(true);
  });

  it('reports a duplicate department as 409, not a 500', async () => {
    const res = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Engineering', code: 'ENG2' });

    expect(res.status).toBe(409);
    expectClean(res.body, 'duplicate department');
  });
});
