import { useState } from 'react';
import api from '../api/axios';
import { Card } from './ui';
import { fmtDay } from '../utils/dates';

const fmtDate = (d) => fmtDay(d);
const fmtMoney = (n, cur = 'INR') => `${cur} ${Number(n || 0).toLocaleString()}`;

export function Avatar({ url, size = 'h-20 w-20' }) {
  return url ? (
    <img src={url} alt="Profile" className={`${size} rounded-full border border-slate-200 object-cover`} />
  ) : (
    <div className={`${size} flex items-center justify-center rounded-full bg-indigo-100 text-2xl`}>👤</div>
  );
}

export function InfoGrid({ rows }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm sm:block sm:border-0">
          <dt className="text-slate-500">{label}</dt>
          <dd className="font-medium text-slate-800">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SalaryCard({ salary }) {
  const s = salary || {};
  const net = (s.basic || 0) + (s.hra || 0) + (s.allowances || 0) - (s.deductions || 0);
  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-700">Salary structure</h2>
      <InfoGrid
        rows={[
          ['Basic', fmtMoney(s.basic, s.currency)],
          ['HRA', fmtMoney(s.hra, s.currency)],
          ['Allowances', fmtMoney(s.allowances, s.currency)],
          ['Deductions', `- ${fmtMoney(s.deductions, s.currency)}`],
        ]}
      />
      <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-sm">
        <span className="font-semibold text-slate-600">Net monthly pay</span>
        <span className="font-bold text-emerald-700">{fmtMoney(net, s.currency)}</span>
      </div>
    </Card>
  );
}

export function JobCard({ profile }) {
  const p = profile || {};
  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-700">Job details</h2>
      <InfoGrid
        rows={[
          ['Designation', p.designation],
          ['Department', p.department],
          ['Joining date', fmtDate(p.joiningDate)],
          ['Employment type', p.employmentType],
        ]}
      />
    </Card>
  );
}

export function DocumentsCard({ documents, onDeleted }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const download = async (doc) => {
    setBusyId(doc.id);
    setError('');
    try {
      const response = await api.get(`/profiles/documents/${doc.id}/download`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Could not download that document.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Delete ${doc.name}?`)) return;
    setBusyId(doc.id);
    setError('');
    try {
      await api.delete(`/profiles/documents/${doc.id}`);
      onDeleted?.();
    } catch {
      setError('Could not delete that document.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-700">Documents</h2>
      {!documents?.length ? (
        <p className="text-sm text-slate-500">No documents uploaded.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => download(d)}
                disabled={busyId === d.id}
                className="text-indigo-600 hover:underline disabled:text-slate-400"
              >
                📄 {d.name}
              </button>
              <span className="text-xs text-slate-400">{fmtDate(d.uploadedAt)}</span>
              {onDeleted && (
                <button
                  type="button"
                  onClick={() => remove(d)}
                  disabled={busyId === d.id}
                  className="text-xs text-red-600 hover:underline disabled:text-red-300"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Card>
  );
}
