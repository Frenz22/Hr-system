import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios';
import { Alert, Button, Input, Select, apiError } from './ui';
import { isoDay } from '../utils/dates';

async function reportError(err) {
  if (err.response?.data instanceof Blob) {
    const text = await err.response.data.text();
    try {
      return JSON.parse(text).error || 'Could not generate the attendance summary';
    } catch {
      return 'Could not generate the attendance summary';
    }
  }
  return apiError(err, 'Could not generate the attendance summary');
}

export default function AttendanceSummaryModal({ onClose, initialFrom = '', initialTo = '' }) {
  const [startDate, setStartDate] = useState(initialFrom);
  const [endDate, setEndDate] = useState(initialTo);
  const [departmentId, setDepartmentId] = useState('');
  const [reportMode, setReportMode] = useState('full');
  const [departments, setDepartments] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [dropdownPosition, setDropdownPosition] = useState(null);
  const [searching, setSearching] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingDepartmentEmployees, setLoadingDepartmentEmployees] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: 'info', text: '' });
  const employeeInput = useRef(null);

  useEffect(() => {
    let active = true;
    api
      .get('/departments')
      .then(({ data }) => {
        if (active) setDepartments(data.departments);
      })
      .catch((err) => {
        if (active) setMsg({ kind: 'error', text: apiError(err, 'Could not load departments') });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setSelectedEmployees([]);
    setSearch('');
    setSearching(false);
    if (!departmentId) {
      setLoadingDepartmentEmployees(false);
      return () => { active = false; };
    }

    setLoadingDepartmentEmployees(true);
    api
      .get('/attendance/summary/employees', { params: { all: 'true', departmentId } })
      .then(({ data }) => {
        if (active) {
          setSelectedEmployees(data.employees);
        }
      })
      .catch((err) => {
        if (active) setMsg({ kind: 'error', text: apiError(err, 'Could not load department employees') });
      })
      .finally(() => {
        if (active) setLoadingDepartmentEmployees(false);
      });

    return () => {
      active = false;
    };
  }, [departmentId]);

  useEffect(() => {
    if (!searching) {
      setSuggestions([]);
      return undefined;
    }

    let active = true;
    const timer = setTimeout(() => {
      setLoadingEmployees(true);
      api
        .get('/attendance/summary/employees', {
          params: { search, departmentId: departmentId || undefined },
        })
        .then(({ data }) => {
          if (active) setSuggestions(data.employees);
        })
        .catch((err) => {
          if (active) setMsg({ kind: 'error', text: apiError(err, 'Could not search employees') });
        })
        .finally(() => {
          if (active) setLoadingEmployees(false);
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [departmentId, search, searching]);

  useEffect(() => {
    if (!searching) {
      setDropdownPosition(null);
      return undefined;
    }

    const positionDropdown = () => {
      const rect = employeeInput.current?.getBoundingClientRect();
      if (!rect) return;
      const dropdownHeight = 280;
      const availableBelow = window.innerHeight - rect.bottom - 8;
      const availableAbove = rect.top - 12;
      const openAbove = availableBelow < dropdownHeight && availableAbove > availableBelow;
      const maxHeight = Math.max(
        0,
        Math.min(dropdownHeight, openAbove ? availableAbove : availableBelow)
      );
      setDropdownPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        top: openAbove ? Math.max(8, rect.top - maxHeight - 4) : rect.bottom + 4,
        width: rect.width,
        maxHeight,
      });
    };

    positionDropdown();
    window.addEventListener('resize', positionDropdown);
    window.addEventListener('scroll', positionDropdown, true);
    return () => {
      window.removeEventListener('resize', positionDropdown);
      window.removeEventListener('scroll', positionDropdown, true);
    };
  }, [searching]);

  const selectedIds = useMemo(
    () => new Set(selectedEmployees.map((employee) => employee.id)),
    [selectedEmployees]
  );

  const toggleEmployee = (employee) => {
    setSelectedEmployees((current) =>
      current.some((selected) => selected.id === employee.id)
        ? current.filter((selected) => selected.id !== employee.id)
        : [...current, employee]
    );
    setMsg({ kind: 'info', text: '' });
  };

  const selectAllEmployees = async () => {
    setLoadingEmployees(true);
    setMsg({ kind: 'info', text: '' });
    try {
      const { data } = await api.get('/attendance/summary/employees', {
        params: { all: 'true', departmentId: departmentId || undefined },
      });
      setSelectedEmployees(data.employees);
      setSearching(false);
      setSearch('');
    } catch (err) {
      setMsg({ kind: 'error', text: apiError(err, 'Could not load employees') });
    } finally {
      setLoadingEmployees(false);
    }
  };

  const generate = async (event) => {
    event.preventDefault();
    if (!startDate || !endDate || startDate > endDate) {
      setMsg({ kind: 'error', text: 'Choose a valid date range with the start on or before the end.' });
      return;
    }

    setBusy(true);
    setMsg({ kind: 'info', text: '' });
    try {
      const response = await api.post(
        '/attendance/summary',
        {
          startDate,
          endDate,
          employeeIds: selectedEmployees.map((employee) => employee.id),
          departmentId: departmentId || null,
          mode: reportMode,
        },
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance-summary-${isoDay(new Date())}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      onClose();
    } catch (err) {
      setMsg({ kind: 'error', text: await reportError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-summary-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <form onSubmit={generate} className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="attendance-summary-title" className="text-lg font-semibold text-slate-800">
                Attendance summary
              </h2>
              <p className="text-sm text-slate-500">Choose the records to include in the PDF.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close summary dialog"
              className="rounded px-2 text-xl leading-none text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              ×
            </button>
          </div>

          <Alert kind={msg.kind}>{msg.text}</Alert>

          <section className="space-y-3">
            <h3 className="font-medium text-slate-700">Date Range</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-600">
                Start Date
                <Input
                  type="date"
                  value={startDate}
                  required
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="text-sm text-slate-600">
                End Date
                <Input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  required
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-medium text-slate-700">Employee</h3>
            <div className="relative" ref={employeeInput}>
              <Input
                value={search}
                placeholder={
                  selectedEmployees.length
                    ? selectedEmployees.map((employee) => employee.name).join(', ')
                    : 'Search employees by name'
                }
                aria-label="Search employees by name"
                aria-expanded={searching}
                disabled={loadingDepartmentEmployees}
                onFocus={() => setSearching(true)}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearching(true);
                }}
                onBlur={() => setSearching(false)}
              />
            </div>
            {selectedEmployees.length > 0 && (
              <div className="flex flex-wrap gap-2" aria-label="Selected employees">
                {selectedEmployees.map((employee) => (
                  <span
                    key={employee.id}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs text-indigo-700"
                  >
                    {employee.name}
                    <button
                      type="button"
                      aria-label={`Remove ${employee.name}`}
                      onClick={() => toggleEmployee(employee)}
                      className="font-semibold hover:text-indigo-950"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedEmployees([])}
                  className="text-xs text-slate-500 underline"
                >
                  Clear
                </button>
              </div>
            )}
            <p className="text-xs text-slate-500">Leave employees unselected to include everyone.</p>
          </section>

          <section className="space-y-3">
            <h3 className="font-medium text-slate-700">Department</h3>
            <label className="text-sm text-slate-600">
              Department (optional)
              <Select
                value={departmentId}
                onChange={(event) => {
                  const nextDepartmentId = event.target.value;
                  setDepartmentId(nextDepartmentId);
                  setSelectedEmployees([]);
                  setLoadingDepartmentEmployees(Boolean(nextDepartmentId));
                }}
              >
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </Select>
            </label>
          </section>

          <section className="space-y-3">
            <h3 className="font-medium text-slate-700">Report Type</h3>
            <label className="text-sm text-slate-600">
              Choose report format
              <Select value={reportMode} onChange={(event) => setReportMode(event.target.value)}>
                <option value="full">Full Report (all active pay rates)</option>
                <option value="simplified">Simplified Report (omit unused pay rates)</option>
              </Select>
            </label>
          </section>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || loadingDepartmentEmployees || !startDate || !endDate || startDate > endDate}
            >
              {busy ? 'Generating…' : 'Generate PDF'}
            </Button>
          </div>
        </form>
      </section>
      {searching && dropdownPosition && createPortal(
        <div
          role="listbox"
          className="overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{
            position: 'fixed',
            zIndex: 60,
            left: dropdownPosition.left,
            top: dropdownPosition.top,
            width: dropdownPosition.width,
            maxHeight: dropdownPosition.maxHeight,
          }}
        >
          {loadingEmployees && (
            <p className="px-3 py-2 text-sm text-slate-500">Loading employees…</p>
          )}
          {!loadingEmployees && suggestions.slice(0, 3).map((employee) => {
            const selected = selectedIds.has(employee.id);
            return (
              <button
                key={employee.id}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => toggleEmployee(employee)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-indigo-50"
              >
                <span>
                  <span className="block font-medium text-slate-700">{employee.name}</span>
                  <span className="text-xs text-slate-500">
                    {employee.employeeId}{employee.department ? ` · ${employee.department}` : ''}
                  </span>
                </span>
                <span className="text-xs text-indigo-600">{selected ? 'Selected' : 'Select'}</span>
              </button>
            );
          })}
          {!loadingEmployees && suggestions.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-500">No employees found.</p>
          )}
          <button
            type="button"
            role="option"
            aria-selected={selectedEmployees.length > 0 && suggestions.length === 0}
            onMouseDown={(event) => event.preventDefault()}
            onClick={selectAllEmployees}
            disabled={loadingEmployees || loadingDepartmentEmployees}
            className="sticky bottom-0 w-full border-t border-slate-100 bg-white px-3 py-2 text-left text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          >
            Select All Employees
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
