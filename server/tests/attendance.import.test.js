const XLSX = require('xlsx');
const { app, request, db, loginAs } = require('./helpers');

function workbook(rows) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Attendance');
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

// Superagent does not know the xlsx mime type, so collect the raw bytes.
function binaryParser(res, callback) {
  res.setEncoding('binary');
  res.data = '';
  res.on('data', (chunk) => {
    res.data += chunk;
  });
  res.on('end', () => callback(null, Buffer.from(res.data, 'binary')));
}

function upload(token, file, name = 'attendance.xlsx') {
  return request(app)
    .post('/api/attendance/import/preview')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', file, name);
}

function confirm(token, file, name = 'attendance.xlsx') {
  return request(app)
    .post('/api/attendance/import/confirm')
    .field('reason', 'Importing attendance records')
    .set('Authorization', `Bearer ${token}`)
    .attach('file', file, name);
}

describe('attendance Excel import/export', () => {
  let admin;
  let employee;

  beforeAll(async () => {
    admin = await loginAs({ role: 'admin' });
    employee = await loginAs();
  });

  it('previews a workbook with computed hours and imports it', async () => {
    const file = workbook([
      {
        'Employee Name': 'Taylor Trial Export',
        'Employee ID': employee.user.employee_id,
        Email: employee.user.email,
        Date: '2030-05-04',
        'Check In': '09:00',
        'Check Out': '17:30',
      },
    ]);

    const preview = await upload(admin.token, file);
    expect(preview.status).toBe(200);
    expect(preview.body.preview).toMatchObject({ total: 1, valid: 1, invalid: 0 });
    expect(preview.body.preview.rows[0]).toMatchObject({
      employeeId: employee.user.employee_id,
      date: '2030-05-04',
      checkIn: '09:00',
      checkOut: '17:30',
      status: 'present',
    });
    expect(preview.body.preview.rows[0].workHours).toBe(8.5);

    const imported = await confirm(admin.token, file);
    expect(imported.status).toBe(200);
    expect(imported.body.result).toMatchObject({ imported: 1, rejected: 0 });

    const list = await request(app)
      .get(`/api/attendance?userId=${employee.user.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    const record = list.body.records.find((row) => row.date === '2030-05-04');
    expect(record).toMatchObject({ status: 'present', workHours: 8.5 });
    const audit = await db.query(
      'SELECT action, reason FROM attendance_audit WHERE attendance_id = $1',
      [record.id]
    );
    expect(audit.rows).toEqual([{ action: 'import', reason: 'Importing attendance records' }]);
  });

  it('identifies missing required headers separately from row-level errors', async () => {
    const missingHeaders = await upload(
      admin.token,
      workbook([{ Employee: 'Example Employee' }])
    );

    expect(missingHeaders.status).toBe(200);
    expect(missingHeaders.body.preview).toMatchObject({
      valid: 0,
      invalid: 1,
      requiredColumns: ['Employee ID', 'Email', 'Date'],
      missingColumns: ['Employee ID', 'Email', 'Date'],
      errors: [],
    });

    const blankValues = await upload(
      admin.token,
      workbook([{
        'Employee ID': employee.user.employee_id,
        Email: '',
        Date: '2030-05-04',
        'Check In': '09:00',
        'Check Out': '17:00',
      }])
    );
    expect(blankValues.status).toBe(200);
    expect(blankValues.body.preview.missingColumns).toEqual([]);
    expect(blankValues.body.preview.errors).toEqual([
      { rowNum: 2, reason: 'Email is required' },
    ]);
  });

  it('accepts employee ID aliases and status-only rows without requiring time columns', async () => {
    const preview = await upload(
      admin.token,
      workbook([{
        'Emp ID': employee.user.employee_id,
        Email: employee.user.email,
        Date: '2030-05-06',
        Status: 'leave',
      }])
    );

    expect(preview.status).toBe(200);
    expect(preview.body.preview.missingColumns).toEqual([]);
    expect(preview.body.preview).toMatchObject({ valid: 1, invalid: 0 });
  });

  it('imports status-only leave/absent rows and upserts an existing day', async () => {
    const file = workbook([
      { 'Employee ID': employee.user.employee_id, Email: employee.user.email, Date: '2030-05-04', Status: 'leave' },
      { 'Employee ID': employee.user.employee_id, Email: employee.user.email, Date: '2030-05-05', Status: 'absent' },
    ]);

    const imported = await confirm(admin.token, file);
    expect(imported.status).toBe(200);
    expect(imported.body.result).toMatchObject({ imported: 2, rejected: 0 });

    const { rows } = await db.query(
      'SELECT date, status, check_in FROM attendance WHERE user_id = $1 AND date >= $2 ORDER BY date',
      [employee.user.id, '2030-05-04']
    );
    expect(rows.map((row) => row.date)).toEqual(['2030-05-04', '2030-05-05']);
    expect(rows[0].status).toBe('leave');
    expect(rows[0].check_in).toBeNull();
  });

  it('reports bad rows while the rest of the sheet stays importable', async () => {
    const file = workbook([
      {
        'Employee ID': employee.user.employee_id,
        Email: employee.user.email,
        Date: '2030-06-01',
        'Check In': '09:00',
        'Check Out': '10:00',
      },
      {
        'Employee ID': 'NOPE999',
        Email: employee.user.email,
        Date: '2030-06-02',
        'Check In': '09:00',
        'Check Out': '17:00',
      },
      {
        'Employee ID': employee.user.employee_id,
        Email: employee.user.email,
        Date: 'not-a-date',
        'Check In': '09:00',
        'Check Out': '17:00',
      },
    ]);

    const preview = await upload(admin.token, file);
    expect(preview.status).toBe(200);
    expect(preview.body.preview.total).toBe(3);
    expect(preview.body.preview.valid).toBe(1);
    expect(preview.body.preview.invalid).toBe(2);
    expect(preview.body.preview.errors).toHaveLength(2);
    expect(preview.body.preview.errors[0].reason).toBe(
      'Employee ID and email do not match an employee account'
    );
    expect(preview.body.preview.rows[0].status).toBe('half-day');
  });

  it('exports the filtered records as a downloadable xlsx', async () => {
    const res = await request(app)
      .get('/api/attendance/import/export?from=2030-05-04&to=2030-05-05')
      .set('Authorization', `Bearer ${admin.token}`)
      .buffer(true)
      .parse(binaryParser);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('attachment; filename="attendance-');

    const book = XLSX.read(res.body, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.Date).sort()).toEqual(['2030-05-04', '2030-05-05']);
    expect(rows.find((row) => row.Date === '2030-05-04').Status).toBe('leave');
    expect(rows[0]).toHaveProperty('Employee ID');
  });

  it('shows profile names in attendance records and the first three export columns', async () => {
    const employeeWithoutProfile = await loginAs();
    await db.query(
      'INSERT INTO profiles (user_id, first_name, last_name) VALUES ($1, $2, $3)',
      [employee.user.id, 'Taylor', 'Trial Export']
    );
    await db.query(
      `INSERT INTO attendance (user_id, date, status, work_hours)
       VALUES ($1, '2031-02-03', 'present', 8), ($2, '2031-02-03', 'present', 8)`,
      [employee.user.id, employeeWithoutProfile.user.id]
    );

    const list = await request(app)
      .get('/api/attendance?from=2031-02-03&to=2031-02-03&limit=200')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(list.status).toBe(200);
    expect(list.body.records.find((row) => row.userId === employee.user.id).user).toMatchObject({
      name: 'Taylor Trial Export',
      email: employee.user.email,
      employeeId: employee.user.employee_id,
    });
    expect(list.body.records.find((row) => row.userId === employeeWithoutProfile.user.id).user.name)
      .toBeNull();

    const exported = await request(app)
      .get('/api/attendance/import/export?from=2031-02-03&to=2031-02-03')
      .set('Authorization', `Bearer ${admin.token}`)
      .buffer(true)
      .parse(binaryParser);
    expect(exported.status).toBe(200);

    const book = XLSX.read(exported.body, { type: 'buffer' });
    const sheet = book.Sheets.Attendance;
    expect(XLSX.utils.sheet_to_json(sheet, { header: 1 })[0].slice(0, 8)).toEqual([
      'Employee Name',
      'Email',
      'Employee ID',
      'Date',
      'Check In',
      'Check Out',
      'Work Hours',
      'Status',
    ]);
    const exportedRows = XLSX.utils.sheet_to_json(sheet);
    expect(exportedRows.find((row) => row['Employee ID'] === employee.user.employee_id))
      .toMatchObject({
        'Employee Name': 'Taylor Trial Export',
        Email: employee.user.email,
      });
    expect(exportedRows.find((row) => row['Employee ID'] === employeeWithoutProfile.user.employee_id)
      ['Employee Name']).toBe('');
  });

  it('rejects a file that is not a workbook', async () => {
    const res = await upload(admin.token, Buffer.from('this is not a sheet'), 'broken.xlsx');
    expect(res.status).toBe(400);
  });

  it('rejects an import without a file', async () => {
    const res = await request(app)
      .post('/api/attendance/import/preview')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(400);
  });

  it('uses admin-defined pay rates as dynamic import/export columns', async () => {
    const overtime = await request(app)
      .post('/api/payrules')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Overtime', type: 'overtime', multiplier: 2 });
    expect(overtime.status).toBe(201);

    const holiday = await request(app)
      .post('/api/payrules')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Holiday', type: 'holiday', multiplier: 2.5 });
    expect(holiday.status).toBe(201);

    const file = workbook([
      {
        'Employee ID': employee.user.employee_id,
        Email: employee.user.email,
        Date: '2030-07-01',
        'Check In': '09:00',
        'Check Out': '17:00',
        'Overtime Hours': 2,
        'Holiday Hours': 3,
      },
    ]);

    const preview = await upload(admin.token, file);
    expect(preview.status).toBe(200);
    expect(preview.body.preview.valid).toBe(1);
    expect(preview.body.preview.rows[0].payHours).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Overtime', hours: 2 }),
        expect.objectContaining({ name: 'Holiday', hours: 3 }),
      ])
    );

    const imported = await confirm(admin.token, file);
    expect(imported.status).toBe(200);

    const { rows } = await db.query(
      `SELECT p.name, h.hours
         FROM attendance_pay_hours h
         JOIN pay_rules p ON p.id = h.pay_rule_id
         JOIN attendance a ON a.id = h.attendance_id
        WHERE a.user_id = $1 AND a.date = '2030-07-01'
        ORDER BY p.name`,
      [employee.user.id]
    );
    expect(rows).toEqual([
      { name: 'Holiday', hours: 3 },
      { name: 'Overtime', hours: 2 },
    ]);

    const exported = await request(app)
      .get('/api/attendance/import/export?from=2030-07-01&to=2030-07-01')
      .set('Authorization', `Bearer ${admin.token}`)
      .buffer(true)
      .parse(binaryParser);
    expect(exported.status).toBe(200);

    const book = XLSX.read(exported.body, { type: 'buffer' });
    const attendanceRows = XLSX.utils.sheet_to_json(book.Sheets.Attendance);
    expect(attendanceRows[0]['Overtime Hours']).toBe(2);
    expect(attendanceRows[0]['Holiday Hours']).toBe(3);

    const rateRows = XLSX.utils.sheet_to_json(book.Sheets['Pay Rates']);
    expect(rateRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ Name: 'Overtime', Multiplier: 2 }),
        expect.objectContaining({ Name: 'Holiday', Multiplier: 2.5 }),
      ])
    );
  });
});
