import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/axios';
import { Card, Input, Select, Button, Alert, apiError } from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';
import AttendanceSummaryModal from '../../components/AttendanceSummaryModal';
import { useAuth } from '../../context/AuthContext';
import { fmtDay, isoDay } from '../../utils/dates';

const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDate = (d) => fmtDay(d);
const timeValue = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export default function AttendanceRecords() {
  const { user: me } = useAuth();
  const [data, setData] = useState({ records: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState({ kind: 'info', text: '' });
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [preview, setPreview] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [historyRecord, setHistoryRecord] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [voiding, setVoiding] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [importReason, setImportReason] = useState('');
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [panelScrollRequest, setPanelScrollRequest] = useState(0);
  const [editForm, setEditForm] = useState({
    date: '',
    status: 'present',
    checkIn: '',
    checkOut: '',
    reason: '',
  });
  const fileInput = useRef();
  const editPanelRef = useRef(null);
  const historyPanelRef = useRef(null);

  const canCorrect = ['admin', 'hr_staff'].includes(me?.role);
  const canVoid = me?.role === 'admin';

  useEffect(() => {
    if (editing) editPanelRef.current?.scrollIntoView({ block: 'start' });
  }, [editing, panelScrollRequest]);

  useEffect(() => {
    if (historyRecord) historyPanelRef.current?.scrollIntoView({ block: 'start' });
  }, [historyRecord, panelScrollRequest]);

  const load = useCallback(async () => {
    setListLoading(true);
    setListError('');
    const params = { page, limit: 15 };
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    if (filters.status) params.status = filters.status;
    try {
      const { data: result } = await api.get('/attendance', { params });
      setData(result);
    } catch (err) {
      setListError(apiError(err, 'Could not load attendance records'));
      throw err;
    } finally {
      setListLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const set = (k) => (e) => {
    setFilters({ ...filters, [k]: e.target.value });
    setPage(1);
  };

  const exportSheet = async () => {
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      const params = {};
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.status) params.status = filters.status;

      const response = await api.get('/attendance/import/export', {
        params,
        responseType: 'blob',
      });

      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance-${isoDay(new Date())}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setMsg({ kind: 'success', text: 'Workbook exported.' });
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err, 'Export failed') });
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow choosing the same file again
    if (!file) return;

    setImportFile(file);
    setPreview(null);
    setMsg({ kind: 'info', text: '' });
    setBusy(true);

    const body = new FormData();
    body.append('file', file);

    api
      .post('/attendance/import/preview', body)
      .then(({ data: result }) => {
        setPreview(result.preview);
        if (result.preview.valid === 0) {
          setMsg({ kind: 'error', text: 'No importable rows in that workbook.' });
        }
      })
      .catch((err) => {
        setImportFile(null);
        setMsg({ kind: 'error', text: apiError(err, 'Could not read that workbook') });
      })
      .finally(() => setBusy(false));
  };

  const confirmImport = async () => {
    if (!importFile) return;
    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      const body = new FormData();
      body.append('file', importFile);
      body.append('reason', importReason);
      const { data: result } = await api.post('/attendance/import/confirm', body);
      setMsg({
        kind: 'success',
        text: `Imported ${result.result.imported} row(s); ${result.result.rejected} rejected.`,
      });
      setPreview(null);
      setImportFile(null);
      setImportReason('');
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err, 'Import failed') });
    } finally {
      setBusy(false);
    }
  };

  const cancelImport = () => {
    setPreview(null);
    setImportFile(null);
    setImportReason('');
    setMsg({ kind: 'info', text: '' });
  };

  const startEdit = (record) => {
    setEditing(record);
    setPanelScrollRequest((current) => current + 1);
    setEditForm({
      date: record.date,
      status: record.status,
      checkIn: timeValue(record.checkIn),
      checkOut: timeValue(record.checkOut),
      reason: '',
    });
    setMsg({ kind: 'info', text: '' });
  };

  const saveCorrection = async () => {
    if (!editing) return;
    setBusy(true);
    setMsg({ kind: 'info', text: '' });

    const payload = {
      date: editForm.date,
      status: editForm.status,
      reason: editForm.reason,
    };
    if (!['leave', 'absent'].includes(editForm.status)) {
      payload.checkIn = editForm.checkIn
        ? new Date(`${editForm.date}T${editForm.checkIn}`).toISOString()
        : null;
      payload.checkOut = editForm.checkOut
        ? new Date(`${editForm.date}T${editForm.checkOut}`).toISOString()
        : null;
    }

    try {
      await api.patch(`/attendance/${editing.id}`, payload);
      setEditing(null);
      setMsg({ kind: 'success', text: 'Attendance corrected.' });
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err, 'Could not save that correction') });
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async (record) => {
    setHistoryRecord(record);
    setPanelScrollRequest((current) => current + 1);
    try {
      const { data: result } = await api.get(`/attendance/${record.id}/history`);
      setHistoryRows(result.history);
    } catch (err) {
      setHistoryRecord(null);
      setMsg({ kind: 'error', text: apiError(err, 'Could not load attendance history') });
    }
  };

  const voidRecord = async () => {
    if (!voiding) return;
    setBusy(true);
    const record = voiding;
    try {
      await api.post(`/attendance/${record.id}/void`, { reason: voidReason });
      setMsg({ kind: 'success', text: 'Attendance record voided and recorded in its audit history.' });
      setVoiding(null);
      setVoidReason('');
      await loadHistory(record);
      await load();
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err, 'Could not void attendance record') });
    } finally {
      setBusy(false);
    }
  };

  const clearsDay = ['leave', 'absent'].includes(editForm.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Attendance records</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportSheet} disabled={busy}>
            Export
          </Button>
          <Button onClick={() => fileInput.current.click()} disabled={busy}>
            Import
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={chooseFile}
          />
        </div>
      </div>
      <Alert kind={msg.kind}>{msg.text}</Alert>
      {listError && <Alert kind="error">{listError}</Alert>}

      {editing && canCorrect && (
        <div ref={editPanelRef} className="scroll-mt-4">
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-700">
              Correct attendance · {editing.user?.employeeId} · {fmtDate(editing.date)}
            </h2>
            <span className="text-xs text-slate-500">
              Work hours are recalculated from the clock times.
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm text-slate-600">
              Date
              <Input
                type="date"
                value={editForm.date}
                onChange={(event) => setEditForm({ ...editForm, date: event.target.value })}
              />
            </label>
            <label className="text-sm text-slate-600">
              Status
              <Select
                value={editForm.status}
                onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}
              >
                <option value="present">Present</option>
                <option value="half-day">Half-day</option>
                <option value="absent">Absent</option>
                <option value="leave">Leave</option>
                <option value="incomplete">Incomplete</option>
              </Select>
            </label>
            <label className="text-sm text-slate-600">
              Check in
              <Input
                type="time"
                value={editForm.checkIn}
                disabled={clearsDay}
                onChange={(event) => setEditForm({ ...editForm, checkIn: event.target.value })}
              />
            </label>
            <label className="text-sm text-slate-600">
              Check out
              <Input
                type="time"
                value={editForm.checkOut}
                disabled={clearsDay}
                onChange={(event) => setEditForm({ ...editForm, checkOut: event.target.value })}
              />
            </label>
          </div>

          <label className="block text-sm text-slate-600">
            Correction reason (required)
            <Input
              value={editForm.reason}
              maxLength={500}
              onChange={(event) => setEditForm({ ...editForm, reason: event.target.value })}
              placeholder="Explain why this attendance record is being changed"
            />
          </label>

          {clearsDay && (
            <p className="text-xs text-amber-700">
              Saving a leave or absent day clears its clock times and extra pay hours.
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={saveCorrection} disabled={busy || editForm.reason.trim().length < 3}>
              {busy ? 'Saving…' : 'Save correction'}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Card>
        </div>
      )}

      {preview && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-700">
              Import preview · {preview.valid} valid · {preview.invalid} rejected
            </h2>
            <div className="flex gap-2">
              <Input
                value={importReason}
                maxLength={500}
                onChange={(event) => setImportReason(event.target.value)}
                placeholder="Reason for importing/correcting attendance (required)"
                aria-label="Attendance import reason"
                className="min-w-60"
              />
              <Button onClick={confirmImport} disabled={busy || preview.valid === 0 || importReason.trim().length < 3}>
                {busy ? 'Importing…' : 'Confirm import'}
              </Button>
              <Button variant="secondary" onClick={cancelImport} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>

          {preview.missingColumns?.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <p className="mb-1 font-medium">Required columns are missing:</p>
              <p>
                Include these columns in the Excel header row: {preview.requiredColumns.join(', ')}.
              </p>
              <p className="mt-1">
                Missing from this workbook: {preview.missingColumns.join(', ')}.
              </p>
            </div>
          )}

          {preview.errors.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="mb-1 font-medium">Row validation errors (rows that will be skipped):</p>
              <ul className="list-inside list-disc space-y-0.5">
                {preview.errors.map((error) => (
                  <li key={error.rowNum}>
                    Row {error.rowNum}: {error.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Check in</th>
                  <th className="px-3 py-2">Check out</th>
                  <th className="px-3 py-2">Hours</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.slice(0, 20).map((row) => (
                  <tr key={row.rowNum}>
                    <td className="px-3 py-1.5 text-slate-400">{row.rowNum}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{row.employeeId}</td>
                    <td className="px-3 py-1.5">{row.date}</td>
                    <td className="px-3 py-1.5">{row.checkIn || '—'}</td>
                    <td className="px-3 py-1.5">{row.checkOut || '—'}</td>
                    <td className="px-3 py-1.5">
                      {row.workHours || '—'}
                      {(row.payHours || []).filter((pay) => pay.hours > 0).length > 0 && (
                        <div className="text-xs text-slate-400">
                          {(row.payHours || [])
                            .filter((pay) => pay.hours > 0)
                            .map((pay) => `${pay.name} ${pay.hours}h`)
                            .join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 20 && (
              <p className="px-3 pt-2 text-xs text-slate-500">
                Showing the first 20 of {preview.rows.length} importable rows.
              </p>
            )}
          </div>
        </Card>
      )}

      {historyRecord && (
        <div ref={historyPanelRef} className="scroll-mt-4">
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-700">
              Change history · {historyRecord.user?.employeeId} · {fmtDate(historyRecord.date)}
            </h2>
            <Button variant="secondary" onClick={() => setHistoryRecord(null)}>Close</Button>
          </div>
          {historyRows.length === 0 ? (
            <p className="text-sm text-slate-500">No changes have been recorded.</p>
          ) : historyRows.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <div className="font-medium text-slate-700">
                {entry.action} · {entry.actorName} · {new Date(entry.changedAt).toLocaleString()}
              </div>
              <p className="text-slate-600">Reason: {entry.reason}</p>
              <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs">
                {JSON.stringify({ before: entry.previousValues, after: entry.updatedValues }, null, 2)}
              </pre>
            </div>
          ))}
        </Card>
        </div>
      )}

      {voiding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <Card className="w-full max-w-lg space-y-3">
            <h2 className="font-semibold text-slate-800">Void attendance record</h2>
            <p className="text-sm text-slate-600">
              This hides the record from ordinary attendance views but preserves it and the audit history.
            </p>
            <Input
              value={voidReason}
              maxLength={500}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Reason for voiding (required)"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setVoiding(null)} disabled={busy}>Cancel</Button>
              <Button variant="danger" onClick={voidRecord} disabled={busy || voidReason.trim().length < 3}>
                Void record
              </Button>
            </div>
          </Card>
        </div>
      )}

      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-600">
            From
            <Input type="date" value={filters.from} onChange={set('from')} />
          </label>
          <label className="text-sm text-slate-600">
            To
            <Input type="date" value={filters.to} onChange={set('to')} />
          </label>
          <label className="text-sm text-slate-600">
            Status
            <div className="flex gap-2">
              <Select value={filters.status} onChange={set('status')}>
                <option value="">All</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="half-day">Half-day</option>
                <option value="leave">Leave</option>
              </Select>
              <Button type="button" variant="secondary" onClick={() => setSummaryOpen(true)}>
                Summary
              </Button>
            </div>
          </label>
        </div>
      </Card>

      {summaryOpen && (
        <AttendanceSummaryModal
          onClose={() => setSummaryOpen(false)}
          initialFrom={filters.from}
          initialTo={filters.to}
        />
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Employee ID</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Check In</th>
              <th className="px-4 py-3">Check Out</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Status</th>
              {canCorrect && <th className="px-4 py-3">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.records.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 font-medium text-slate-800">
                  {r.user?.name || '—'}
                </td>
                <td className="px-4 py-2">{r.user?.email || '—'}</td>
                <td className="px-4 py-2">{r.user?.employeeId || '—'}</td>
                <td className="px-4 py-2">{fmtDate(r.date)}</td>
                <td className="px-4 py-2">{fmtTime(r.checkIn)}</td>
                <td className="px-4 py-2">{fmtTime(r.checkOut)}</td>
                <td className="px-4 py-2">{r.workHours ?? '—'}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={r.status} />
                </td>
                {canCorrect && (
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => startEdit(r)} disabled={busy}>
                        Edit
                      </Button>
                      <Button variant="secondary" onClick={() => loadHistory(r)} disabled={busy}>
                        History
                      </Button>
                      {canVoid && (
                        <button
                          onClick={() => {
                            setVoiding(r);
                            setVoidReason('');
                          }}
                          disabled={busy}
                          className="rounded-lg border border-transparent bg-transparent px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:border-red-300 focus-visible:bg-red-50 focus-visible:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Void
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {listLoading && data.records.length === 0 && (
              <tr>
                <td colSpan={canCorrect ? 9 : 8} className="px-4 py-8 text-center text-slate-500">
                  Loading attendance records…
                </td>
              </tr>
            )}
            {!listLoading && !listError && data.records.length === 0 && (
              <tr>
                <td
                  colSpan={canCorrect ? 9 : 8}
                  className="px-4 py-8 text-center text-slate-500"
                >
                  No records match these filters.
                </td>
              </tr>
            )}
            {!listLoading && listError && data.records.length === 0 && (
              <tr>
                <td colSpan={canCorrect ? 9 : 8} className="px-4 py-8 text-center text-slate-500">
                  Attendance records could not be loaded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {data.page} of {data.pages} · {data.total} records
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
