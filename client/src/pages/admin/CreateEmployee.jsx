import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, Button, Input, Field, Select, Alert, apiError } from '../../components/ui';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const EMPTY = {
  employeeId: '',
  email: '',
  password: '',
  role: 'employee',
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  designation: '',
  departmentId: '',
  joiningDate: '',
  employmentType: 'full-time',
};

export default function CreateEmployee() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [departments, setDepartments] = useState([]);
  const [msg, setMsg] = useState({ kind: 'info', text: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/departments').then(({ data }) => setDepartments(data.departments)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      // Flat camelCase, same vocabulary as every other endpoint. Blank optional
      // values are omitted rather than sent as empty strings.
      await api.post('/employees/create', {
        ...form,
        phone: form.phone || undefined,
        address: form.address || undefined,
        designation: form.designation || undefined,
        departmentId: form.departmentId ? Number(form.departmentId) : undefined,
        joiningDate: form.joiningDate || undefined,
      });
      navigate('/admin/employees');
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err, 'Failed to create employee') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/admin/employees" className="text-sm text-indigo-600 hover:underline">
        ← Directory
      </Link>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Create new account</h2>
        <Alert kind={msg.kind}>{msg.text}</Alert>

        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee ID">
              <Input required value={form.employeeId} onChange={set('employeeId')} />
            </Field>
            <Field label="Role">
              <Select value={form.role} onChange={set('role')}>
                <option value="employee">Employee</option>
                <option value="hr_staff">HR Staff</option>
                {user?.role === 'admin' && <option value="admin">Admin</option>}
              </Select>
            </Field>
          </div>

          <Field label="Email">
            <Input type="email" required value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Temporary password">
            <Input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={set('password')}
            />
          </Field>

          <hr className="border-slate-200" />
          <h3 className="text-sm font-medium uppercase text-slate-500">Profile</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <Input value={form.firstName} onChange={set('firstName')} />
            </Field>
            <Field label="Last name">
              <Input value={form.lastName} onChange={set('lastName')} />
            </Field>
            <Field label="Phone">
              <Input value={form.phone} onChange={set('phone')} />
            </Field>
            <Field label="Address">
              <Input value={form.address} onChange={set('address')} />
            </Field>
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

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating…' : 'Create employee account'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
