import { useEffect, useState } from 'react';
import api from '../../api/axios';
import { Card, Spinner } from '../../components/ui';

const fmt = (n, cur) => `${cur} ${Number(n || 0).toLocaleString()}`;

export default function EmployeePayroll() {
  const [salary, setSalary] = useState(null);

  useEffect(() => {
    api.get('/payroll/me').then(({ data }) => setSalary(data.salary));
  }, []);

  if (!salary) return <Spinner />;

  const rows = [
    ['Basic salary', salary.basic],
    ['House rent allowance (HRA)', salary.hra],
    ['Other allowances', salary.allowances],
  ];

  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">My salary</h1>
        <p className="text-sm text-slate-500">
          Read-only view. Contact HR for any corrections.
        </p>
      </div>

      <Card>
        <dl className="space-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-slate-100 py-1.5">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-800">{fmt(value, salary.currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between py-1.5">
            <dt className="text-slate-500">Gross</dt>
            <dd className="font-medium text-slate-800">{fmt(salary.gross, salary.currency)}</dd>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-1.5">
            <dt className="text-slate-500">Deductions</dt>
            <dd className="font-medium text-red-600">- {fmt(salary.deductions, salary.currency)}</dd>
          </div>
          <div className="flex justify-between pt-2">
            <dt className="font-semibold text-slate-700">Net monthly pay</dt>
            <dd className="text-lg font-bold text-emerald-700">{fmt(salary.net, salary.currency)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
