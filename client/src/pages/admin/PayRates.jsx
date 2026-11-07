import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { Card, Field, Input, Select, Button, Alert, apiError } from '../../components/ui';

const EMPTY = { name: '', multiplier: '2', type: 'custom' };

const TYPE_LABELS = {
  regular: 'Regular',
  overtime: 'Overtime',
  rest_day: 'Rest Day',
  holiday: 'Holiday',
  night_diff: 'Night differential',
  custom: 'Custom',
};

export default function PayRates() {
  const [rules, setRules] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ kind: 'info', text: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api.get('/payrules');
    setRules(data.rules);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const create = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      await api.post('/payrules', {
        name: form.name.trim(),
        multiplier: Number(form.multiplier),
        type: form.type,
      });
      setForm(EMPTY);
      setMsg({ kind: 'success', text: 'Pay rate created.' });
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      await api.patch(`/payrules/${editing.id}`, {
        name: editing.name.trim(),
        multiplier: Number(editing.multiplier),
      });
      setEditing(null);
      setMsg({ kind: 'success', text: 'Pay rate updated.' });
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (rule) => {
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      await api.patch(`/payrules/${rule.id}/toggle`);
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Pay rates</h1>
        <p className="text-sm text-slate-500">
          Admin-only multipliers for future payroll. Every active rate becomes its own hours column
          in the attendance import/export workbook.
        </p>
      </div>

      <Alert kind={msg.kind}>{msg.text}</Alert>

      <Card>
        <h2 className="mb-3 font-semibold text-slate-700">Add a pay rate</h2>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-4">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Night differential"
              required
            />
          </Field>
          <Field label="Multiplier">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.multiplier}
              onChange={set('multiplier')}
              required
            />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={set('type')}>
              <option value="regular">Regular</option>
              <option value="custom">Custom</option>
              <option value="overtime">Overtime</option>
              <option value="rest_day">Rest Day</option>
              <option value="holiday">Holiday</option>
              <option value="night_diff">Night differential</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Saving…' : 'Add pay rate'}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Multiplier</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rules.map((rule) => (
              <tr key={rule.id}>
                {editing?.id === rule.id ? (
                  <>
                    <td className="px-4 py-2">
                      <Input
                        value={editing.name}
                        onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      />
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {TYPE_LABELS[rule.type] || rule.type}
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={editing.multiplier}
                        onChange={(event) =>
                          setEditing({ ...editing, multiplier: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-4 py-2">{rule.isActive ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <Button onClick={saveEdit} disabled={busy}>
                          Save
                        </Button>
                        <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2 font-medium text-slate-800">{rule.name}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {TYPE_LABELS[rule.type] || rule.type}
                    </td>
                    <td className="px-4 py-2 font-mono">{rule.multiplier}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          rule.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {rule.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            setEditing({
                              id: rule.id,
                              name: rule.name,
                              multiplier: String(rule.multiplier),
                            })
                          }
                          disabled={busy}
                        >
                          Edit
                        </Button>
                        <Button variant="secondary" onClick={() => toggle(rule)} disabled={busy}>
                          {rule.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {rules.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No pay rates yet. Add overtime, holiday or double-pay rates above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
