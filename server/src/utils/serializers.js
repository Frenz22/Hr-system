// Single source of truth for the JSON shapes the API returns.
//
// The database speaks snake_case and PostgreSQL types; the client speaks
// camelCase. Every controller/service response goes through one of these
// mappers so there is exactly one vocabulary at the HTTP boundary.

const num = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
};

// DATE columns come back as 'YYYY-MM-DD' (see config/db.js). Timestamps and
// JS Dates are rendered as their calendar day.
const dateOnly = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
};

function toUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    email: row.email,
    role: row.role,
    ...(row.is_system_admin ? { isSystemAdmin: true } : {}),
  };
}

function toSalary(profile = {}) {
  const basic = num(profile.salary_basic);
  const hra = num(profile.salary_hra);
  const allowances = num(profile.salary_allowances);
  const deductions = num(profile.salary_deductions);
  return {
    basic,
    hra,
    allowances,
    deductions,
    currency: 'INR',
    gross: basic + hra + allowances,
    net: basic + hra + allowances - deductions,
  };
}

function toProfileDocument(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at || null,
  };
}

function toProfile(profile = {}, department = null, documents = []) {
  return {
    id: profile.id,
    userId: profile.user_id,
    firstName: profile.first_name || '',
    lastName: profile.last_name || '',
    dob: dateOnly(profile.dob),
    phone: profile.phone || '',
    address: profile.address || '',
    designation: profile.designation || '',
    departmentId: profile.department_id ?? null,
    department: department?.name || null,
    joiningDate: dateOnly(profile.joining_date),
    employmentType: profile.employment_type || 'full-time',
    salary: toSalary(profile),
    profilePictureUrl: profile.profile_picture_url || '',
    documents: documents.map(toProfileDocument),
  };
}

function toAttendance(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: dateOnly(row.date),
    checkIn: row.check_in || null,
    checkOut: row.check_out || null,
    status: row.status,
    workHours: row.work_hours === null || row.work_hours === undefined ? null : num(row.work_hours),
    // Present only on the admin list, which joins users.
    ...(row.employee_id
      ? {
          user: {
            name: row.employee_name || null,
            email: row.email,
            employeeId: row.employee_id,
          },
        }
      : {}),
  };
}

function toLeave(row) {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.leave_type,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    remarks: row.reason || '',
    status: row.status,
    adminComment: row.decision_remarks || '',
    reviewedAt: row.decision_date || null,
    createdAt: row.created_at || null,
    // Present only on the admin list, which joins the requester and reviewer.
    ...(row.user_emp_id
      ? { user: { employeeId: row.user_emp_id, email: row.user_email } }
      : {}),
    ...(row.approver_emp_id
      ? { reviewedBy: { employeeId: row.approver_emp_id, email: row.approver_email } }
      : {}),
  };
}

function toNotification(row) {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at || null,
  };
}

function toDepartment(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    code: row.code || null,
  };
}

function toPayRule(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.type,
    multiplier: num(row.multiplier),
    thresholdHours: num(row.threshold_hours),
    effectiveDate: dateOnly(row.effective_date),
    expiryDate: dateOnly(row.expiry_date),
    isActive: Boolean(row.is_active),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at || null,
  };
}

module.exports = {
  dateOnly,
  toUser,
  toSalary,
  toProfile,
  toAttendance,
  toLeave,
  toNotification,
  toDepartment,
  toPayRule,
};
