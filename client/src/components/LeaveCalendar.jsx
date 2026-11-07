import { Card, Button } from './ui';
import { isoDay } from '../utils/dates';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_STYLES = {
  pending: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  approved: 'bg-sky-100 text-sky-800 ring-1 ring-sky-300',
  rejected: 'bg-red-50 text-red-400 line-through',
};

// month: Date anchored anywhere in the displayed month.
// leaves: [{ startDate, endDate, status }] overlapping the month.
export default function LeaveCalendar({ month, onMonthChange, leaves }) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstWeekday = new Date(year, m, 1).getDay();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const today = new Date();

  const statusFor = (day) => {
    // Both sides are local 'YYYY-MM-DD' strings, so a plain string compare is
    // chronological and no timezone conversion can shift the day.
    const date = isoDay(new Date(year, m, day));
    for (const status of ['approved', 'pending', 'rejected']) {
      const hit = leaves.find(
        (l) => l.status === status && date >= l.startDate && date <= l.endDate
      );
      if (hit) return status;
    }
    return null;
  };

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-700">
          {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onMonthChange(new Date(year, m - 1, 1))}>
            ←
          </Button>
          <Button variant="secondary" onClick={() => onMonthChange(new Date(year, m + 1, 1))}>
            →
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 font-semibold text-slate-400">
            {d}
          </div>
        ))}
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const status = statusFor(day);
          const isToday =
            today.getFullYear() === year && today.getMonth() === m && today.getDate() === day;
          return (
            <div
              key={day}
              title={status ? `Leave: ${status}` : ''}
              className={`rounded-lg py-2 text-sm ${
                status ? DAY_STYLES[status] : 'text-slate-600'
              } ${isToday ? 'font-bold underline' : ''}`}
            >
              {day}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex gap-4 text-xs text-slate-500">
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-sky-200 align-middle" /> Approved
        </span>
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-amber-200 align-middle" /> Pending
        </span>
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded bg-red-100 align-middle" /> Rejected
        </span>
      </div>
    </Card>
  );
}
