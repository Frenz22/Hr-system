import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { Card } from '../../components/ui';
import { Alert, Button, Input, Select, apiError } from '../../components/ui';
import StatusBadge from '../../components/StatusBadge';
import { fmtDay, isoDay } from '../../utils/dates';

const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
const fmtDate = (d) => fmtDay(d, { weekday: 'short', day: 'numeric', month: 'short' });

function getRange(filter, customFrom, customTo) {
  const today = new Date();
  if (filter === 'custom') return { from: customFrom, to: customTo };
  if (filter === 'today') return { from: isoDay(today), to: isoDay(today) };
  if (filter === 'last30') {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: isoDay(from), to: isoDay(today) };
  }
  if (filter === 'thisMonth') {
    return { from: isoDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDay(today) };
  }
  if (filter === 'lastMonth') {
    return {
      from: isoDay(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
      to: isoDay(new Date(today.getFullYear(), today.getMonth(), 0)),
    };
  }
  if (filter === 'last3Months') {
    return { from: isoDay(new Date(today.getFullYear(), today.getMonth() - 2, 1)), to: isoDay(today) };
  }
  if (filter === 'thisYear') {
    return { from: isoDay(new Date(today.getFullYear(), 0, 1)), to: isoDay(today) };
  }
  return { from: '', to: '' };
}

export default function EmployeeAttendance() {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [dateFilter, setDateFilter] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [notesRecord, setNotesRecord] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteMessage, setNoteMessage] = useState('');

  const range = getRange(dateFilter, customFrom, customTo);
  const load = useCallback(async (isCancelled) => {
    setLoading(true);
    setError('');
    setLoadFailed(false);
    if (range.from && range.to && range.from > range.to) {
      if (!isCancelled()) {
        setError('Start date must be on or before end date.');
        setRecords([]);
        setTotal(0);
        setPages(1);
        setLoading(false);
      }
      return;
    }

    try {
      const { data } = await api.get('/attendance/me', {
        params: {
          ...(range.from ? { from: range.from } : {}),
          ...(range.to ? { to: range.to } : {}),
          page,
          limit: pageSize,
        },
      });
      if (!isCancelled()) {
        setRecords(data.records);
        setTotal(data.total);
        setPages(data.pages);
      }
    } catch (err) {
      if (!isCancelled()) {
        setError(apiError(err, 'Could not load attendance history'));
        setLoadFailed(true);
        setRecords([]);
        setTotal(0);
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [range.from, range.to, page, pageSize]);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => { cancelled = true; };
  }, [load]);

  const changeFilter = (value) => {
    setDateFilter(value);
    setPage(1);
  };
  const changePageSize = (event) => {
    setPageSize(Number(event.target.value));
    setPage(1);
  };

  const todayKey = isoDay(new Date());
  const today = records.find((r) => r.date === todayKey);
  const todayLine = today
    ? [
        today.checkIn ? `Check in ${fmtTime(today.checkIn)}` : null,
        today.checkOut ? `Check out ${fmtTime(today.checkOut)}` : null,
        today.workHours != null ? `${today.workHours}h` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'No times recorded.'
    : 'No attendance recorded for today.';

  const toggleNotes = async (record) => {
    if (notesRecord?.id === record.id) {
      setNotesRecord(null);
      setNotes([]);
      setNoteMessage('');
      return;
    }
    setNotesRecord(record);
    setNoteDraft('');
    setNoteMessage('');
    try {
      const { data } = await api.get(`/attendance/${record.id}/notes`);
      setNotes(data.notes);
    } catch (err) {
      setNoteMessage(apiError(err, 'Could not load attendance notes'));
    }
  };

  const addNote = async (event) => {
    event.preventDefault();
    if (!notesRecord || !noteDraft.trim()) return;
    try {
      const { data } = await api.post(`/attendance/${notesRecord.id}/notes`, { note: noteDraft });
      setNotes([...notes, data.note]);
      setNoteDraft('');
      setNoteMessage('Note added. Official attendance was not changed.');
    } catch (err) {
      setNoteMessage(apiError(err, 'Could not add attendance note'));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">My attendance</h1>
        <p className="text-sm text-slate-500">
          Attendance is recorded by HR. Contact HR if a day looks wrong.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-700">Today</h2>
            <p className="text-sm text-slate-500">{todayLine}</p>
          </div>
          {today && <StatusBadge status={today.status} />}
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 text-sm text-slate-600">
            Date range
            <Select className="mt-1" value={dateFilter} onChange={(event) => changeFilter(event.target.value)}>
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="last30">Last 30 days</option>
              <option value="thisMonth">This month</option>
              <option value="lastMonth">Last month</option>
              <option value="last3Months">Last 3 months</option>
              <option value="thisYear">This year</option>
              <option value="custom">Custom range</option>
            </Select>
          </label>
          {dateFilter === 'custom' && (
            <>
              <label className="text-sm text-slate-600">
                Start date
                <Input className="mt-1" type="date" value={customFrom} onChange={(event) => {
                  setCustomFrom(event.target.value);
                  setPage(1);
                }} />
              </label>
              <label className="text-sm text-slate-600">
                End date
                <Input className="mt-1" type="date" value={customTo} onChange={(event) => {
                  setCustomTo(event.target.value);
                  setPage(1);
                }} />
              </label>
            </>
          )}
        </div>

        {error && <Alert kind="error">{error}</Alert>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Check in</th>
                <th className="px-4 py-3">Check out</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2">{fmtTime(r.checkIn)}</td>
                  <td className="px-4 py-2">{fmtTime(r.checkOut)}</td>
                  <td className="px-4 py-2">{r.workHours ?? '—'}</td>
                  <td className="px-4 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2">
                    <Button variant="secondary" onClick={() => toggleNotes(r)}>
                      {notesRecord?.id === r.id ? 'Close notes' : 'Notes'}
                    </Button>
                    {notesRecord?.id === r.id && (
                      <div className="mt-2 min-w-64 space-y-2">
                        {notes.map((item) => (
                          <div key={item.id} className="rounded bg-slate-50 p-2 text-xs text-slate-600">
                            <p>{item.note}</p>
                            <time>{new Date(item.createdAt).toLocaleString()}</time>
                          </div>
                        ))}
                        {noteMessage && (
                          <Alert kind={noteMessage === 'Note added. Official attendance was not changed.' ? 'success' : 'error'}>
                            {noteMessage}
                          </Alert>
                        )}
                        <form onSubmit={addNote} className="flex gap-2">
                          <Input
                            value={noteDraft}
                            maxLength={1000}
                            onChange={(event) => setNoteDraft(event.target.value)}
                            placeholder="Add a note for HR"
                            aria-label="Attendance note"
                          />
                          <Button type="submit" disabled={!noteDraft.trim()}>Add</Button>
                        </form>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && records.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {loadFailed ? 'Attendance history could not be loaded.' : 'No attendance records match this date range.'}
                  </td>
                </tr>
              )}
              {loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading attendance…</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>{total} record{total === 1 ? '' : 's'}{total ? ` · Page ${page} of ${pages}` : ''}</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2">
              Rows
              <Select value={pageSize} onChange={changePageSize} aria-label="Rows per page">
                <option value={20}>20</option>
                <option value={50}>50</option>
              </Select>
            </label>
            <Button variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
