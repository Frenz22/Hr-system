import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { Alert, Card, Input, Button, apiError } from '../../components/ui';
import { Avatar } from '../../components/ProfileView';

export default function Directory() {
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pages: 1 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const t = setTimeout(() => {
      setLoading(true);
      setError('');
      api
        .get('/profiles', { params: { page, limit: 10, search } })
        .then(({ data: result }) => {
          if (active) setData(result);
        })
        .catch((err) => {
          if (active) setError(apiError(err, 'Could not load employees'));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [page, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-800">Employees</h1>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Input
              placeholder="Search by email or employee ID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Link
            to="/admin/employees/new"
            aria-label="Add employee"
            title="Add employee"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-5 w-5"
            >
              <path d="M10 4v12M4 10h12" />
            </svg>
          </Link>
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Employee ID</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.rows.map(({ user, profile }) => (
              <tr key={user.id} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <Avatar url={profile?.profilePictureUrl} size="h-8 w-8" />
                    <div>
                      <div className="font-medium text-slate-800">
                        {profile?.firstName
                          ? `${profile.firstName} ${profile.lastName || ''}`.trim()
                          : '—'}
                      </div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{user.employeeId}</td>
                <td className="px-4 py-2">{profile?.department || '—'}</td>
                <td className="px-4 py-2">{profile?.designation || '—'}</td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-600">
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <Link to={`/admin/employees/${user.id}`} className="text-indigo-600 hover:underline">
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
            {loading && data.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading employees…
                </td>
              </tr>
            )}
            {!loading && !error && data.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No employees found.
                </td>
              </tr>
            )}
            {!loading && error && data.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Employee list could not be loaded.
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
