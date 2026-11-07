import { Card } from './ui';

const monthLabel = (year, month) =>
  new Date(Date.UTC(year, month - 1)).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default function MonthlyLeaveTable({ title, months = [] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-700">{title}</h2>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Month</th>
            <th className="px-4 py-3">Leave days</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {months.map((m) => (
            <tr key={`${m.year}-${m.month}`}>
              <td className="px-4 py-2">{monthLabel(m.year, m.month)}</td>
              <td className="px-4 py-2">{m.days}</td>
            </tr>
          ))}
          {months.length === 0 && (
            <tr>
              <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                No leaves taken yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}
