const { app, request, db, loginAs } = require('./helpers');

describe('feedback', () => {
  let admin;
  let exactAdmin;
  let hr;
  let employee;

  beforeAll(async () => {
    admin = await loginAs({ role: 'admin' });
    exactAdmin = await loginAs({ role: 'admin' });
    hr = await loginAs({ role: 'hr_staff' });
    employee = await loginAs({ role: 'employee' });
    await db.query('UPDATE users SET email = $1 WHERE id = $2', [
      'admin@gmail.com',
      exactAdmin.user.id,
    ]);
  });

  it('accepts authenticated feedback and rejects empty or overlong messages', async () => {
    const saved = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ category: 'Bug Report', message: '  The attendance page needs a clearer loading state.  ' });

    expect(saved.status).toBe(201);
    expect(saved.body.feedback).toMatchObject({
      userId: employee.user.id,
      submitterEmail: employee.user.email,
      submitterName: employee.user.email,
      category: 'Bug Report',
      message: 'The attendance page needs a clearer loading state.',
      status: 'new',
    });

    const empty = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ category: 'Other', message: '   ' });
    expect(empty.status).toBe(400);

    const tooLong = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({ category: 'Other', message: 'x'.repeat(2001) });
    expect(tooLong.status).toBe(400);
  });

  it('allows only admin@gmail.com to list, update, and delete feedback', async () => {
    const created = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${hr.token}`)
      .send({ category: 'UI / Usability', message: 'Navigation labels could be easier to scan.' });
    expect(created.status).toBe(201);

    for (const account of [admin, hr, employee]) {
      const forbidden = await request(app)
        .get('/api/feedback/admin')
        .set('Authorization', `Bearer ${account.token}`);
      expect(forbidden.status).toBe(403);

      const forbiddenDelete = await request(app)
        .delete(`/api/feedback/admin/${created.body.feedback.id}`)
        .set('Authorization', `Bearer ${account.token}`);
      expect(forbiddenDelete.status).toBe(403);
    }

    const listed = await request(app)
      .get('/api/feedback/admin')
      .query({ category: 'UI / Usability', status: 'new', sort: 'oldest' })
      .set('Authorization', `Bearer ${exactAdmin.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.feedback).toEqual([
      expect.objectContaining({
        id: created.body.feedback.id,
        category: 'UI / Usability',
        status: 'new',
      }),
    ]);

    const updated = await request(app)
      .patch(`/api/feedback/admin/${created.body.feedback.id}`)
      .set('Authorization', `Bearer ${exactAdmin.token}`)
      .send({ status: 'in_review' });
    expect(updated.status).toBe(200);
    expect(updated.body.feedback.status).toBe('in_review');

    const deleted = await request(app)
      .delete(`/api/feedback/admin/${created.body.feedback.id}`)
      .set('Authorization', `Bearer ${exactAdmin.token}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.id).toBe(created.body.feedback.id);

    const absent = await db.query('SELECT id FROM feedback WHERE id = $1', [
      created.body.feedback.id,
    ]);
    expect(absent.rows).toHaveLength(0);
  });
});
