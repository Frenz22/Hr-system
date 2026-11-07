const STYLES = {
  present: 'bg-emerald-100 text-emerald-700',
  absent: 'bg-red-100 text-red-700',
  'half-day': 'bg-amber-100 text-amber-700',
  leave: 'bg-sky-100 text-sky-700',
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  new: 'bg-sky-100 text-sky-700',
  in_review: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
};

export default function StatusBadge({ status }) {
  const labels = { in_review: 'In Review' };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
        STYLES[status] || 'bg-slate-100 text-slate-600'
      }`}
    >
      {labels[status] || status}
    </span>
  );
}
