import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { Card, Field, Input, Select, Button, Alert, apiError } from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';
import LeaveCalendar from '../../components/LeaveCalendar';
import MonthlyLeaveTable from '../../components/MonthlyLeaveTable';
import { fmtDay, isoDay } from '../../utils/dates';

const fmt = (d) => fmtDay(d);

export default function EmployeeLeave() {
  const [month, setMonth] = useState(new Date());
  const [monthLeaves, setMonthLeaves] = useState([]);
  const [history, setHistory] = useState([]);
  const [leaveMonths, setLeaveMonths] = useState([]);
  const [form, setForm] = useState({ type: 'paid', startDate: '', endDate: '', remarks: '' });
  const [msg, setMsg] = useState({ kind: 'info', text: '' });
  const [busy, setBusy] = useState(false);

  const loadMonth = useCallback(async () => {
    const from = new Date(month.getFullYear(), month.getMonth(), 1);
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const { data } = await api.get('/leaves/me', { params: { from: isoDay(from), to: isoDay(to) } });
    setMonthLeaves(data.requests);
  }, [month]);

  const loadHistory = useCallback(async () => {
    const { data } = await api.get('/leaves/me');
    setHistory(data.requests);
  }, []);

  const loadSummary = useCallback(async () => {
    const { data } = await api.get('/attendance/me/leave-summary');
    setLeaveMonths(Array.isArray(data.months) ? data.months : []);
  }, []);

  useEffect(() => {
    loadMonth().catch(() => {});
  }, [loadMonth]);
  useEffect(() => {
    loadHistory().catch(() => {});
    loadSummary().catch(() => {});
  }, [loadHistory, loadSummary]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      await api.post('/leaves', form);
      setMsg({ kind: 'success', text: 'Leave request submitted for approval.' });
      setForm({ type: 'paid', startDate: '', endDate: '', remarks: '' });
      await Promise.all([loadMonth(), loadHistory()]);
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id) => {
    try {
      await api.delete(`/leaves/${id}`);
      await Promise.all([loadMonth(), loadHistory()]);
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-800">Leave & time off</h1>
      <Alert kind={msg.kind}>{msg.text}</Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-slate-700">Request leave</h2>
          <form onSubmit={submit} className="space-y-3">
            <Field label="Leave type">
              <Select value={form.type} onChange={set('type')}>
                <option value="paid">Paid leave</option>
                <option value="sick">Sick leave</option>
                <option value="unpaid">Unpaid leave</option>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="From">
                <Input type="date" required value={form.startDate} onChange={set('startDate')} />
              </Field>
              <Field label="To">
                <Input type="date" required value={form.endDate} onChange={set('endDate')} />
              </Field>
            </div>
            <Field label="Remarks (optional)">
              <textarea
                value={form.remarks}
                onChange={set('remarks')}
                rows={3}
                maxLength={500}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                placeholder="Reason or notes for HR…"
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit request'}
            </Button>
          </form>
        </Card>

        <LeaveCalendar month={month} onMonthChange={setMonth} leaves={monthLeaves} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">From</th>
              <th className="px-4 py-3">To</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">HR comment</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {history.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 capitalize">{r.type}</td>
                <td className="px-4 py-2">{fmt(r.startDate)}</td>
                <td className="px-4 py-2">{fmt(r.endDate)}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2 text-slate-500">{r.adminComment || '—'}</td>
                <td className="px-4 py-2 text-right">
                  {r.status === 'pending' && (
                    <button onClick={() => cancel(r.id)} className="text-red-600 hover:underline">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  You haven't requested any leave yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <MonthlyLeaveTable title="Your leaves by month" months={leaveMonths} />
    </div>
  );
}
