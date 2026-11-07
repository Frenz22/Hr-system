// Date helpers for values the API sends as plain calendar days
// ('YYYY-MM-DD'). `new Date('2026-10-26')` is parsed as UTC midnight, which
// renders as the previous day west of Greenwich, so parse those by parts.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayString(value) {
  return typeof value === 'string' && DAY_RE.test(value);
}

export function parseDay(value) {
  if (!value) return null;
  if (isDayString(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

// Local calendar day for a Date, unaffected by timezone or DST.
export function isoDay(date = new Date()) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function fmtDay(value, options) {
  const date = parseDay(value);
  return date ? date.toLocaleDateString([], options) : '—';
}
