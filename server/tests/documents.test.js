const fs = require('fs');
const path = require('path');
const { app, request, db, loginAs } = require('./helpers');
const { UPLOAD_ROOT } = require('../src/utils/storage/disk');

const PDF = Buffer.from('%PDF-1.4\n% HR document test\n');

function uploadDocument(who, filename = 'contract.pdf', contentType = 'application/pdf') {
  return request(app)
    .post('/api/profiles/me/documents')
    .set('Authorization', `Bearer ${who.token}`)
    .attach('file', PDF, { filename, contentType });
}

describe('profile documents', () => {
  let employee;
  let admin;
  let hr;
  let other;

  beforeAll(async () => {
    employee = await loginAs({ role: 'employee' });
    admin = await loginAs({ role: 'admin' });
    hr = await loginAs({ role: 'hr_staff' });
    other = await loginAs({ role: 'employee' });
  });

  it('persists an uploaded document and serves it through the authenticated route', async () => {
    const uploaded = await uploadDocument(employee);
    expect(uploaded.status).toBe(200);

    const document = uploaded.body.profile.documents[0];
    expect(document).toMatchObject({
      name: 'contract.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF.length,
    });
    expect(document.id).toEqual(expect.any(Number));

    const mine = await request(app)
      .get('/api/profiles/me')
      .set('Authorization', `Bearer ${employee.token}`);
    expect(mine.body.profile.documents).toHaveLength(1);
    expect(mine.body.profile.documents[0].id).toBe(document.id);

    const ownDownload = await request(app)
      .get(`/api/profiles/documents/${document.id}/download`)
      .set('Authorization', `Bearer ${employee.token}`);
    expect(ownDownload.status).toBe(200);
    expect(ownDownload.headers['content-type']).toContain('application/pdf');
    expect(ownDownload.headers['content-disposition']).toContain('contract.pdf');
    expect(ownDownload.headers['x-content-type-options']).toBe('nosniff');

    const hrDownload = await request(app)
      .get(`/api/profiles/documents/${document.id}/download`)
      .set('Authorization', `Bearer ${hr.token}`);
    expect(hrDownload.status).toBe(200);

    const adminDownload = await request(app)
      .get(`/api/profiles/documents/${document.id}/download`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminDownload.status).toBe(200);

    const otherDownload = await request(app)
      .get(`/api/profiles/documents/${document.id}/download`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(otherDownload.status).toBe(403);

    const anonymous = await request(app).get(`/api/profiles/documents/${document.id}/download`);
    expect(anonymous.status).toBe(401);
  });

  it('rejects an extension that does not match the declared MIME type', async () => {
    const spoofedImage = await uploadDocument(employee, 'avatar.html', 'image/png');
    expect(spoofedImage.status).toBe(400);

    const spoofedPdf = await uploadDocument(employee, 'payload.exe', 'application/pdf');
    expect(spoofedPdf.status).toBe(400);
  });

  it('deletes the database row and the stored file', async () => {
    const uploaded = await uploadDocument(employee, 'old-contract.pdf');
    const document = uploaded.body.profile.documents[0];

    const { rows } = await db.query('SELECT storage_key FROM profile_documents WHERE id = $1', [
      document.id,
    ]);
    const storedPath = path.join(UPLOAD_ROOT, rows[0].storage_key);
    expect(fs.existsSync(storedPath)).toBe(true);

    const deleted = await request(app)
      .delete(`/api/profiles/documents/${document.id}`)
      .set('Authorization', `Bearer ${employee.token}`);
    expect(deleted.status).toBe(200);

    const after = await db.query('SELECT id FROM profile_documents WHERE id = $1', [document.id]);
    expect(after.rows).toHaveLength(0);
    expect(fs.existsSync(storedPath)).toBe(false);
  });
});
