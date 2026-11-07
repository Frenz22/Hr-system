const { app, request, db, loginAs } = require('./helpers');

function binaryParser(res, callback) {
  res.setEncoding('binary');
  res.data = '';
  res.on('data', (chunk) => {
    res.data += chunk;
  });
  res.on('end', () => callback(null, Buffer.from(res.data, 'binary')));
}

function pdfText(buffer) {
  return [...buffer.toString('latin1').matchAll(/<([0-9a-f]+)>/gi)]
    .map((match) => Buffer.from(match[1], 'hex').toString('latin1'))
    .join('');
}

describe('attendance summary PDF', () => {
  let admin;
  let employee;
  let otherEmployee;
  let department;

  beforeAll(async () => {
    admin = await loginAs({ role: 'admin' });
    employee = await loginAs();
    otherEmployee = await loginAs();

    const departmentResult = await db.query(
      'INSERT INTO departments (name) VALUES ($1) RETURNING id',
      ['Summary Operations']
    );
    department = departmentResult.rows[0];
    await db.query(
      `INSERT INTO profiles (user_id, first_name, last_name, department_id)
       VALUES ($1, $2, $3, $4)`,
      [employee.user.id, 'Summary', 'Employee', department.id]
    );
    await db.query(
      `INSERT INTO profiles (user_id, first_name, last_name, department_id)
       VALUES ($1, $2, $3, $4)`,
      [otherEmployee.user.id, 'Other', 'Employee', department.id]
    );

    const { rows: attendance } = await db.query(
      `INSERT INTO attendance (user_id, date, check_in, check_out, work_hours, status)
       VALUES ($1, $2, $3, $4, $5, 'present')
       RETURNING id`,
      [
        employee.user.id,
        '2031-04-15',
        new Date(2031, 3, 15, 9),
        new Date(2031, 3, 15, 17),
        8,
      ]
    );
    const { rows: rate } = await db.query(
      `INSERT INTO pay_rules (name, type, multiplier)
       VALUES ('Summary Regular Pay', 'regular', 1)
       RETURNING id`
    );
    await db.query(
      'INSERT INTO attendance_pay_hours (attendance_id, pay_rule_id, hours) VALUES ($1, $2, $3)',
      [attendance[0].id, rate[0].id, 8]
    );
    const { rows: overtimeRate } = await db.query(
      `INSERT INTO pay_rules (name, type, multiplier)
       VALUES ('Summary Overtime', 'overtime', 1.25)
       RETURNING id`
    );
    await db.query(
      'INSERT INTO attendance_pay_hours (attendance_id, pay_rule_id, hours) VALUES ($1, $2, $3)',
      [attendance[0].id, overtimeRate[0].id, 1.5]
    );
    await db.query(
      `INSERT INTO pay_rules (name, type, multiplier)
       VALUES ('Summary Zero Rate', 'custom', 1)`
    );
    const { rows: inactiveRate } = await db.query(
      `INSERT INTO pay_rules (name, type, multiplier, is_active)
       VALUES ('Summary Inactive Night Differential', 'night_diff', 1.1, false)
       RETURNING id`
    );
    await db.query(
      'INSERT INTO attendance_pay_hours (attendance_id, pay_rule_id, hours) VALUES ($1, $2, $3)',
      [attendance[0].id, inactiveRate[0].id, 2]
    );
    await db.query(
      `INSERT INTO attendance (user_id, date, work_hours, status)
       VALUES ($1, $2, 0, 'incomplete')`,
      [otherEmployee.user.id, '2031-04-16']
    );
  });

  it('downloads a PDF with the selected attendance, department, time, and pay-rate data', async () => {
    const response = await request(app)
      .post('/api/attendance/summary')
      .set('Authorization', `Bearer ${admin.token}`)
      .buffer(true)
      .parse(binaryParser)
      .send({
        startDate: '2031-04-01',
        endDate: '2031-04-30',
        employeeIds: [employee.user.id],
        departmentId: department.id,
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attendance-summary-2031-04-01.pdf');
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    const contents = pdfText(response.body);
    expect(contents).toContain('HR System');
    expect(contents).toContain('Attendance Summary');
    expect(contents.indexOf('HR System')).toBeLessThan(contents.indexOf('Date:'));
    expect(contents.indexOf('Date:')).toBeLessThan(contents.indexOf('Attendance Summary'));
    expect(contents).toContain('Summary Employee');
    expect(contents).toContain(employee.user.employee_id);
    expect(contents).toContain('Summary Operations');
    expect(contents).toContain('Summary Regular Pay');
    expect(contents).toContain('Summary Overtime');
    expect(contents).toContain('8.00');
    expect(contents).toContain('1.50');
    expect(contents).toContain('present');
    expect(contents).toContain('Status');
    expect(contents).not.toContain('Employee Status');
    expect(contents).not.toContain('Summary Inactive Night Differential');
    expect(contents.indexOf('Employee Name')).toBeLessThan(contents.indexOf('Employee ID'));
    expect(contents.indexOf('Employee ID')).toBeLessThan(contents.lastIndexOf('Department'));
    expect(contents.lastIndexOf('Department')).toBeLessThan(contents.lastIndexOf('Date'));
    expect(contents.indexOf('Time In')).toBeLessThan(contents.indexOf('Time Out'));
    expect(contents.indexOf('Summary Regular Pay')).toBeLessThan(contents.lastIndexOf('present'));
    expect(contents.lastIndexOf('Summary Regular Pay')).toBeLessThan(contents.lastIndexOf('Status'));
    expect(contents).toContain('09:00');
    expect(contents).toContain('17:00');
  });

  it('repeats report headers across multiple pages', async () => {
    await db.query(
  `INSERT INTO attendance (user_id, date, work_hours, status)
   SELECT $1, DATE '2032-01-01' + day, 0, 'incomplete'
     FROM generate_series(0, 69) AS day`,
  [employee.user.id]
    );

    const response = await request(app)
  .post('/api/attendance/summary')
  .set('Authorization', `Bearer ${admin.token}`)
  .buffer(true)
  .parse(binaryParser)
  .send({
    startDate: '2032-01-01',
    endDate: '2032-04-30',
    employeeIds: [employee.user.id],
    departmentId: department.id,
  });

    expect(response.status).toBe(200);
    expect((pdfText(response.body).match(/Attendance Summary/g) || []).length).toBeGreaterThan(1);
  });

  it('applies employee and department filters together and reports empty results', async () => {
    const response = await request(app)
      .post('/api/attendance/summary')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        startDate: '2040-04-01',
        endDate: '2040-04-30',
        employeeIds: [employee.user.id],
        departmentId: department.id,
      });

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/No attendance records match/);
  });

  it('omits zero-only active pay-rate columns in a simplified report', async () => {
        const response = await request(app)
          .post('/api/attendance/summary')
          .set('Authorization', `Bearer ${admin.token}`)
          .buffer(true)
          .parse(binaryParser)
          .send({
            startDate: '2031-04-01',
            endDate: '2031-04-30',
            employeeIds: [],
            departmentId: department.id,
            mode: 'simplified',
          });

        expect(response.status).toBe(200);
        const contents = pdfText(response.body);
        expect(contents).toContain('Simplified Report');
        expect(contents).toContain('Summary Regular Pay');
        expect(contents).toContain('Summary Overtime');
        expect(contents).toContain('Other Employee');
        expect(contents).toContain('0.00');
        expect(contents).not.toContain('Summary Inactive Night Differential');
        expect(contents).not.toContain('Summary Zero Rate');
      });

  it('denies employees access to workforce attendance reports', async () => {
    const response = await request(app)
      .post('/api/attendance/summary')
      .set('Authorization', `Bearer ${employee.token}`)
      .send({
        startDate: '2031-04-01',
        endDate: '2031-04-30',
        employeeIds: [employee.user.id],
      });

    expect(response.status).toBe(403);
  });

  it('rejects invalid date ranges', async () => {
    const response = await request(app)
      .post('/api/attendance/summary')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        startDate: '2031-04-31',
        endDate: '2031-04-01',
        employeeIds: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/valid date/);
  });

  it('searches employees by their profile name', async () => {
    const response = await request(app)
      .get('/api/attendance/summary/employees?search=Summary%20Employee')
      .set('Authorization', `Bearer ${admin.token}`);

    expect(response.status).toBe(200);
    expect(response.body.employees).toContainEqual(
      expect.objectContaining({ id: employee.user.id, name: 'Summary Employee' })
    );
  });
});
