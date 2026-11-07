import { Fragment, useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import api from '../../api/axios';
import { Card, Input, Button, Alert, apiError } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

const fmt = (n, cur) => `${cur} ${Number(n || 0).toLocaleString()}`;

function EditRow({ row, onSaved, onError }) {
  const [form, setForm] = useState({
    basic: row.salary.basic,
    hra: row.salary.hra,
    allowances: row.salary.allowances,
    deductions: row.salary.deductions,
  });
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: Number(e.target.value) });

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/payroll/${row.user.id}`, form);
      onSaved();
    } catch (err) {
      onError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="bg-indigo-50/50">
      <td colSpan={7} className="px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          {['basic', 'hra', 'allowances', 'deductions'].map((k) => (
            <label key={k} className="text-xs font-medium capitalize text-slate-600">
              {k}
              <Input type="number" min="0" value={form[k]} onChange={set(k)} className="mt-1 w-32" />
            </label>
          ))}
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default function AdminPayroll() {
  const { user } = useAuth();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pages: 1 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ kind: 'info', text: '' });

  const load = useCallback(async () => {
    const { data } = await api.get('/payroll', { params: { page, limit: 15, search } });
    setData(data);
  }, [page, search]);

  useEffect(() => {
    const t = setTimeout(() => load().catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [load]);

  // Payroll is admin-only on the server; send HR staff back to the dashboard
  // instead of leaving them on a page that cannot load.
  if (user?.role !== 'admin') return <Navigate to="/admin" replace />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-800">Payroll</h1>
        <Input
          placeholder="Search by email or employee ID…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-xs"
        />
      </div>
      <Alert kind={msg.kind}>{msg.text}</Alert>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Basic</th>
              <th className="px-4 py-3">HRA</th>
              <th className="px-4 py-3">Allowances</th>
              <th className="px-4 py-3">Deductions</th>
              <th className="px-4 py-3">Net</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map((row) => (
              <Fragment key={row.user.id}>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-800">{row.name || row.user.employeeId}</div>
                    <div className="text-xs text-slate-500">
                      {row.user.employeeId} · {row.user.email}
                    </div>
                  </td>
                  <td className="px-4 py-2">{fmt(row.salary.basic, row.salary.currency)}</td>
                  <td className="px-4 py-2">{fmt(row.salary.hra, row.salary.currency)}</td>
                  <td className="px-4 py-2">{fmt(row.salary.allowances, row.salary.currency)}</td>
                  <td className="px-4 py-2 text-red-600">
                    - {fmt(row.salary.deductions, row.salary.currency)}
                  </td>
                  <td className="px-4 py-2 font-semibold text-emerald-700">
                    {fmt(row.salary.net, row.salary.currency)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => setEditing(editing === row.user.id ? null : row.user.id)}
                      className="text-indigo-600 hover:underline"
                    >
                      {editing === row.user.id ? 'Close' : 'Edit'}
                    </button>
                  </td>
                </tr>
                {editing === row.user.id && (
                  <EditRow
                    key={`${row.user.id}-edit`}
                    row={row}
                    onSaved={() => {
                      setEditing(null);
                      setMsg({ kind: 'success', text: 'Salary updated. The employee was notified.' });
                      load();
                    }}
                    onError={(text) => setMsg({ kind: 'error', text })}
                  />
                )}
              </Fragment>
            ))}
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {data.page} of {data.pages} · {data.total} people
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Prev
          </Button>
          <Button variant="secondary" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}
