// All attendance records key on a UTC-midnight date so that one document
// exists per user per calendar day regardless of server timezone.
function startOfDayUTC(d) {
  const date = new Date(d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDaysUTC(d, days) {
  const date = new Date(d);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

// Inclusive list of UTC-midnight dates between start and end.
function eachDayUTC(start, end) {
  const days = [];
  let cursor = startOfDayUTC(start);
  const last = startOfDayUTC(end);
  while (cursor <= last) {
    days.push(cursor);
    cursor = addDaysUTC(cursor, 1);
  }
  return days;
}

module.exports = { startOfDayUTC, addDaysUTC, eachDayUTC };
