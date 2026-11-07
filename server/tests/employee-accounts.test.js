const { app, request, loginAs } = require('./helpers');

const account = (suffix, overrides = {}) => ({
  employeeId: `NEW${suffix}`,
  email: `new${suffix}@test.local`,
  password: 'Str0ngPass1',
  role: 'employee',
  firstName: 'New',
  lastName: 'Hire',
  designation: 'Analyst',
  ...overrides,
});

describe('employee account provisioning', () => {
  let admin;
  let hr;
  let employee;

  beforeAll(async () => {
    admin = await loginAs({ role: 'admin' });
    hr = await loginAs({ role: 'hr_staff' });
    employee = await loginAs({ role: 'employee' });
  });

  it('lets an admin create an employee who can sign in immediately', async () => {
    const body = account('001');
    const created = await request(app)
      .post('/api/employees/create')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);

    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ employeeId: 'NEW001', email: body.email, role: 'employee' });

    // No verification step: the new account authenticates straight away.
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: body.email, password: body.password });

    expect(login.status).toBe(200);
    expect(login.body.user.employeeId).toBe(body.employeeId);
    expect(login.body.user.role).toBe('employee');
  });

  it('lets authorized HR staff create employee accounts', async () => {
    const body = account('002');
    const created = await request(app)
      .post('/api/employees/create')
      .set('Authorization', `Bearer ${hr.token}`)
      .send(body);

    expect(created.status).toBe(201);
    expect(created.body.user.role).toBe('employee');
  });

  it('does not let HR staff create an admin even when the request names that role', async () => {
    const denied = await request(app)
      .post('/api/employees/create')
      .set('Authorization', `Bearer ${hr.token}`)
      .send(account('010', { role: 'admin' }));

    expect(denied.status).toBe(403);
  });

  it('lets HR view departments but reserves department configuration for admins', async () => {
    const listed = await request(app)
      .get('/api/departments')
      .set('Authorization', `Bearer ${hr.token}`);
    expect(listed.status).toBe(200);

    const created = await request(app)
      .post('/api/departments')
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ name: 'HR-created department' });
    expect(created.status).toBe(403);
  });

  it('blocks employees from creating accounts', async () => {
    const res = await request(app)
      .post('/api/employees/create')
      .set('Authorization', `Bearer ${employee.token}`)
      .send(account('003'));

    expect(res.status).toBe(403);
  });

  it('blocks anonymous callers', async () => {
    const res = await request(app).post('/api/employees/create').send(account('004'));
    expect(res.status).toBe(401);
  });

  it('allows an authorized admin to create an account with the admin role', async () => {
    const res = await request(app)
      .post('/api/employees/create')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(account('005', { role: 'admin' }));

    expect(res.status).toBe(201);
  });

  it('lets only an admin change roles and applies role changes to existing tokens', async () => {
    const body = account('008');
    const created = await request(app)
      .post('/api/employees/create')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);
    expect(created.status).toBe(201);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: body.email, password: body.password });
    const targetToken = login.body.accessToken;

    const hrChange = await request(app)
      .patch(`/api/employees/${created.body.user.id}/role`)
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ role: 'admin' });
    expect(hrChange.status).toBe(403);

    const selfChange = await request(app)
      .patch(`/api/employees/${admin.user.id}/role`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'hr_staff' });
    expect(selfChange.status).toBe(400);

    const changed = await request(app)
      .patch(`/api/employees/${created.body.user.id}/role`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ role: 'hr_staff' });
    expect(changed.status).toBe(200);
    expect(changed.body.user.role).toBe('hr_staff');

    const payroll = await request(app)
      .get('/api/payroll')
      .set('Authorization', `Bearer ${targetToken}`);
    expect(payroll.status).toBe(403);
  });

  it('prevents another admin from changing or deleting the protected system admin', async () => {
    await require('./helpers').db.query(
      'UPDATE users SET is_system_admin = TRUE WHERE id = $1',
      [admin.user.id]
    );
    const secondAdmin = await loginAs({ role: 'admin' });

    const roleChange = await request(app)
      .patch(`/api/employees/${admin.user.id}/role`)
      .set('Authorization', `Bearer ${secondAdmin.token}`)
      .send({ role: 'hr_staff' });
    expect(roleChange.status).toBe(403);

    const deletion = await request(app)
      .delete(`/api/profiles/${admin.user.id}`)
      .set('Authorization', `Bearer ${secondAdmin.token}`);
    expect(deletion.status).toBe(403);
  });

  it('rejects duplicate employee IDs and emails', async () => {
    const body = account('006');
    const first = await request(app)
      .post('/api/employees/create')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);
    expect(first.status).toBe(201);

    const again = await request(app)
      .post('/api/employees/create')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);
    expect(again.status).toBe(409);
  });

  it('keeps role-based access control enforced', async () => {
    const forbidden = await request(app)
      .get('/api/payroll')
      .set('Authorization', `Bearer ${employee.token}`);
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .get('/api/payroll')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(allowed.status).toBe(200);

    const summaryForbidden = await request(app)
      .get('/api/admin/summary')
      .set('Authorization', `Bearer ${employee.token}`);
    expect(summaryForbidden.status).toBe(403);

    const summaryAllowed = await request(app)
      .get('/api/admin/summary')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(summaryAllowed.status).toBe(200);
  });

  it('keeps in-app notifications working alongside the payroll flow', async () => {
    const body = account('007');
    const created = await request(app)
      .post('/api/employees/create')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(body);

    const updated = await request(app)
      .put(`/api/payroll/${created.body.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ basic: 50000, hra: 20000, allowances: 5000, deductions: 7500 });
    expect(updated.status).toBe(200);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: body.email, password: body.password });
    const notes = await request(app)
      .get('/api/notifications/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(notes.status).toBe(200);
    expect(notes.body.notifications.some((n) => n.type === 'payroll')).toBe(true);
  });

  it('keeps the mailer available for other outbound email features', () => {
    const mailer = require('../src/utils/mailer');
    expect(typeof mailer.verifyMailer).toBe('function');
    expect(typeof mailer.getTransporter).toBe('function');
    // Verification-specific email helpers were removed with the feature.
    expect(mailer.sendVerificationEmail).toBeUndefined();
  });

  it('serves the health endpoint', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
