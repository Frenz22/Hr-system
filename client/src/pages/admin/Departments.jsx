import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { Card, Field, Input, Button, Alert, apiError } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { name: '', description: '', code: '' };

export default function Departments() {
  const { user } = useAuth();
  const canManage = user?.role === 'admin';
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState({ kind: 'info', text: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get('/departments');
    setDepartments(data.departments);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      await api.post('/departments', {
        name: form.name,
        description: form.description || undefined,
        code: form.code || undefined,
      });
      setForm(EMPTY);
      setMsg({ kind: 'success', text: 'Department created.' });
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (department) => {
    if (!window.confirm(`Delete ${department.name}? Employees in it will be unassigned.`)) return;
    setMsg({ kind: 'info', text: '' });
    try {
      await api.delete(`/departments/${department.id}`);
      setMsg({ kind: 'success', text: 'Department deleted.' });
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">Departments</h1>
      <Alert kind={msg.kind}>{msg.text}</Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        {canManage && <Card className="lg:col-span-1">
          <h2 className="mb-3 font-semibold text-slate-700">Add department</h2>
          <form onSubmit={create} className="space-y-3">
            <Field label="Name">
              <Input required value={form.name} onChange={set('name')} />
            </Field>
            <Field label="Code (optional)">
              <Input value={form.code} onChange={set('code')} maxLength={20} />
            </Field>
            <Field label="Description (optional)">
              <Input value={form.description} onChange={set('description')} />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create department'}
            </Button>
          </form>
        </Card>}

        <Card className="overflow-x-auto p-0 lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Description</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departments.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-2 font-medium text-slate-800">{d.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{d.code || '—'}</td>
                  <td className="px-4 py-2 text-slate-500">{d.description || '—'}</td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => remove(d)} className="text-red-600 hover:underline">
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {departments.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 4 : 3} className="px-4 py-8 text-center text-slate-500">
                    No departments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
