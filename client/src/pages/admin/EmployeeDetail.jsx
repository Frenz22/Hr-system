import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { Card, Field, Input, Select, Button, Alert, Spinner, apiError } from '../../components/ui';
import { Avatar, DocumentsCard } from '../../components/ProfileView';
import MonthlyLeaveTable from '../../components/MonthlyLeaveTable';

const emptyForm = (p) => ({
  firstName: p.firstName || '',
  lastName: p.lastName || '',
  phone: p.phone || '',
  address: p.address || '',
  designation: p.designation || '',
  departmentId: p.departmentId ?? '',
  joiningDate: p.joiningDate ? p.joiningDate.slice(0, 10) : '',
  employmentType: p.employmentType || 'full-time',
  salary: {
    basic: p.salary?.basic ?? 0,
    hra: p.salary?.hra ?? 0,
    allowances: p.salary?.allowances ?? 0,
    deductions: p.salary?.deductions ?? 0,
  },
});

export default function EmployeeDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [msg, setMsg] = useState({ kind: 'info', text: '' });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaveMonths, setLeaveMonths] = useState([]);

  useEffect(() => {
    api.get(`/profiles/${userId}`).then(({ data }) => {
      setProfile(data.profile);
      setUser(data.user);
      setForm(emptyForm(data.profile));
    });
    api
      .get('/departments')
      .then(({ data }) => setDepartments(data.departments))
      .catch(() => {});
    api
      .get(`/attendance/leave-summary/${userId}`)
      .then(({ data }) => setLeaveMonths(data.months || []))
      .catch(() => {});
  }, [userId]);

  if (!profile || !form) return <Spinner />;

  const set = (key, isNumber) => (e) =>
    setForm({ ...form, [key]: isNumber ? Number(e.target.value) : e.target.value });

  const setSalary = (key) => (e) => setForm({ ...form, salary: { ...form.salary, [key]: Number(e.target.value) } });

  const isOwnAccount = String(profile.userId || '') === String(me?.id || '');
  const isAdmin = me?.role === 'admin';

  const reloadProfile = async () => {
    const { data } = await api.get(`/profiles/${userId}`);
    setProfile(data.profile);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setMsg({ kind: 'info', text: '' });
    try {
      await api.delete(`/profiles/${userId}`);
      navigate('/admin/employees', { replace: true });
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
      setConfirmDelete(false);
      setDeleting(false);
    }
  };

  const changeRole = async (role) => {
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      const { data } = await api.patch(`/employees/${userId}/role`, { role });
      setUser(data.user);
      setMsg({ kind: 'success', text: 'Account role updated.' });
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err, 'Could not change account role') });
    } finally {
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      const payload = {
        ...form,
        departmentId: form.departmentId ? Number(form.departmentId) : null,
        joiningDate: form.joiningDate || undefined,
      };
      // Salary is admin-only; HR saves the people fields without touching pay.
      if (!isAdmin) delete payload.salary;

      const { data } = await api.put(`/profiles/${userId}`, payload);
      setProfile(data.profile);
      setUser(data.user);
      setMsg({ kind: 'success', text: 'Profile saved.' });
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link to="/admin/employees" className="text-sm text-indigo-600 hover:underline">
          ← Directory
        </Link>
      </div>

      <Card>
        <div className="flex items-center gap-4">
          <Avatar url={profile.profilePictureUrl} />
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              {profile.firstName || user?.employeeId} {profile.lastName || ''}
            </h1>
            <p className="text-sm text-slate-500">
              {user?.email} · {user?.employeeId} ·{' '}
              <span className="uppercase">{user?.role}</span>
            </p>
          </div>
        </div>
      </Card>

      <Alert kind={msg.kind}>{msg.text}</Alert>

      {isAdmin && user?.isSystemAdmin && (
        <Alert kind="info">This is the protected system administrator account. Its role and account cannot be changed or deleted.</Alert>
      )}

      {isAdmin && !isOwnAccount && !user?.isSystemAdmin && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-700">Account role</h2>
            <p className="text-sm text-slate-500">Role changes take effect immediately for API authorization.</p>
          </div>
          <Select
            aria-label="Account role"
            value={user?.role || 'employee'}
            onChange={(event) => changeRole(event.target.value)}
            disabled={busy}
            className="max-w-xs"
          >
            <option value="employee">Employee</option>
            <option value="hr_staff">HR Staff</option>
            <option value="admin">Admin</option>
          </Select>
        </Card>
      )}

      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-semibold text-slate-700">Personal</h2>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name">
                  <Input value={form.firstName} onChange={set('firstName')} />
                </Field>
                <Field label="Last name">
                  <Input value={form.lastName} onChange={set('lastName')} />
                </Field>
              </div>
              <Field label="Phone">
                <Input value={form.phone} onChange={set('phone')} />
              </Field>
              <Field label="Address">
                <Input value={form.address} onChange={set('address')} />
              </Field>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-slate-700">Job</h2>
            <div className="space-y-3">
              <Field label="Designation">
                <Input value={form.designation} onChange={set('designation')} />
              </Field>
              <Field label="Department">
                <Select value={form.departmentId} onChange={set('departmentId')}>
                  <option value="">Unassigned</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Joining date">
                  <Input type="date" value={form.joiningDate} onChange={set('joiningDate')} />
                </Field>
                <Field label="Employment type">
                  <Select value={form.employmentType} onChange={set('employmentType')}>
                    <option value="full-time">Full-time</option>
                    <option value="part-time">Part-time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                  </Select>
                </Field>
              </div>
            </div>
          </Card>
        </div>

        {isAdmin && (
          <Card>
            <h2 className="mb-3 font-semibold text-slate-700">Salary structure (admin only)</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Basic">
                <Input type="number" min="0" value={form.salary.basic} onChange={setSalary('basic')} />
              </Field>
              <Field label="HRA">
                <Input type="number" min="0" value={form.salary.hra} onChange={setSalary('hra')} />
              </Field>
              <Field label="Allowances">
                <Input
                  type="number"
                  min="0"
                  value={form.salary.allowances}
                  onChange={setSalary('allowances')}
                />
              </Field>
              <Field label="Deductions">
                <Input
                  type="number"
                  min="0"
                  value={form.salary.deductions}
                  onChange={setSalary('deductions')}
                />
              </Field>
            </div>
          </Card>
        )}

        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save all changes'}
        </Button>
      </form>

      <DocumentsCard documents={profile.documents} onDeleted={reloadProfile} />

      <MonthlyLeaveTable title="Leaves by month" months={leaveMonths} />

      {me?.role === 'admin' && !isOwnAccount && !user?.isSystemAdmin && (
        <Card className="border-red-200">
          <h2 className="mb-1 font-semibold text-red-700">Danger zone</h2>
          {confirmDelete ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                This permanently removes {user?.email} and all of their attendance, leave, payroll
                and notification data. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button variant="danger" onClick={deleteAccount} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, delete this account'}
                </Button>
                <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Permanently delete this account and every record tied to it.
              </p>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete this account
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
