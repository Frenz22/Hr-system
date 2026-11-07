const bcrypt = require('bcryptjs');
const { app, request, db, createUser } = require('./helpers');

describe('authentication', () => {
  it('logs in an HR-provisioned account without any email verification step', async () => {
    const { user, password } = await createUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toEqual({
      id: user.id,
      email: user.email,
      role: 'employee',
      employeeId: user.employee_id,
    });
  });

  it('rejects bad credentials without leaking which part was wrong', async () => {
    const { user } = await createUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password');
  });

  it('stores bcrypt hashes, never plaintext passwords', async () => {
    const { user, password } = await createUser();
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);

    expect(rows[0].password_hash).not.toBe(password);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$/);
    expect(await bcrypt.compare(password, rows[0].password_hash)).toBe(true);
  });

  it('lets admins change their credentials and invalidates earlier sessions after a password change', async () => {
    const { user, password } = await createUser({ role: 'admin' });
    await db.query('UPDATE users SET is_system_admin = TRUE WHERE id = $1', [user.id]);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password });

    const updated = await request(app)
      .patch('/api/auth/me/credentials')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('Cookie', login.headers['set-cookie'])
      .send({
        currentPassword: password,
        email: 'admin.updated@test.local',
        newPassword: 'NewStr0ngPass2',
        confirmPassword: 'NewStr0ngPass2',
      });

    expect(updated.status).toBe(200);
    expect(updated.body.user).toMatchObject({
      id: user.id,
      email: 'admin.updated@test.local',
      role: 'admin',
      isSystemAdmin: true,
    });
    expect(updated.body.accessToken).toBeTruthy();

    const oldAccess = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(oldAccess.status).toBe(401);

    const oldRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', login.headers['set-cookie']);
    expect(oldRefresh.status).toBe(401);

    const newSession = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${updated.body.accessToken}`);
    expect(newSession.status).toBe(200);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin.updated@test.local', password: 'NewStr0ngPass2' });
    expect(newLogin.status).toBe(200);
  });

  it('requires an admin session and the current password for credential changes', async () => {
    const anonymous = await request(app)
      .patch('/api/auth/me/credentials')
      .send({ currentPassword: 'whatever', email: 'other@test.local' });
    expect(anonymous.status).toBe(401);

    const { user, password } = await createUser({ role: 'employee' });
    const employeeLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password });

    const forbidden = await request(app)
      .patch('/api/auth/me/credentials')
      .set('Authorization', `Bearer ${employeeLogin.body.accessToken}`)
      .send({ currentPassword: password, email: 'other@test.local' });
    expect(forbidden.status).toBe(403);

    const { user: adminUser, password: adminPassword } = await createUser({ role: 'admin' });
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: adminUser.email, password: adminPassword });
    const rejected = await request(app)
      .patch('/api/auth/me/credentials')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({ currentPassword: 'WrongPass1', email: 'other@test.local' });
    expect(rejected.status).toBe(401);
  });

  describe('refresh tokens', () => {
    it('exchanges the httpOnly cookie for a new access token and user', async () => {
      const { user, password } = await createUser();
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password });

      const loginCookie = login.headers['set-cookie'].join(';');
      expect(loginCookie).toMatch(/hr_refresh=/);
      expect(loginCookie).toMatch(/HttpOnly/i);
      expect(loginCookie).toMatch(/Path=\/api\/auth/i);

      const refreshed = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', login.headers['set-cookie']);

      expect(refreshed.status).toBe(200);
      expect(refreshed.body.accessToken).toBeTruthy();
      expect(refreshed.body.user).toEqual({
        id: user.id,
        email: user.email,
        role: 'employee',
        employeeId: user.employee_id,
      });
      // The cookie is rotated on every refresh.
      expect(refreshed.headers['set-cookie'].join(';')).toMatch(/hr_refresh=/);

      const me = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`);
      expect(me.status).toBe(200);
      expect(me.body.user.id).toBe(user.id);
    });

    it('rejects a refresh request with no cookie', async () => {
      const res = await request(app).post('/api/auth/refresh');
      expect(res.status).toBe(401);
    });

    it('rejects a tampered refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['hr_refresh=not-a-real-token']);
      expect(res.status).toBe(401);
    });

    it('refuses to accept an access token as a refresh token', async () => {
      const { user, password } = await createUser();
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password });

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`hr_refresh=${login.body.accessToken}`]);
      expect(res.status).toBe(401);
    });

    it('rejects refresh once the account has been removed', async () => {
      const { user, password } = await createUser();
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password });

      await db.query('DELETE FROM users WHERE id = $1', [user.id]);

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', login.headers['set-cookie']);
      expect(res.status).toBe(401);
    });
  });

  it('no longer exposes self-registration or email-verification endpoints', async () => {
    const register = await request(app).post('/api/auth/register').send({});
    expect(register.status).toBe(404);

    const verify = await request(app).get(
      `/api/auth/verify-email?token=${'a'.repeat(64)}`
    );
    expect(verify.status).toBe(404);

    const resend = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'someone@test.local' });
    expect(resend.status).toBe(404);
  });

  it('has no verification columns left in the users table', async () => {
    const { rows } = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'users'
         AND column_name IN ('is_email_verified', 'verification_token', 'verification_token_expires')`
    );
    expect(rows).toHaveLength(0);
  });
});
