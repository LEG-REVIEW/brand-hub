// BC/Canada statutory holidays plus a few marketing occasions, used by /api/cron/holiday-reminders to
// auto-create a "get holiday design ready" task 7 days before each one.
// Add/remove entries in the array built inside getCanadianHolidays() if the
// list of holidays worth planning content around changes.

function nthWeekdayOfMonth(year, month, weekday, n) {
  // month: 0-11, weekday: 0=Sun..6=Sat, n: 1st, 2nd, 3rd...
  const first = new Date(year, month, 1);
  const firstWeekday = first.getDay();
  const offset = (weekday - firstWeekday + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return new Date(year, month, day);
}

function mondayOnOrBefore(date) {
  const d = new Date(date);
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  return d;
}

// Meeus/Jones/Butcher Gregorian Easter algorithm.
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns [{ name, date: 'YYYY-MM-DD' }, ...] for the given year.
export function getCanadianHolidays(year) {
  const easter = easterDate(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);

  const victoriaDay = mondayOnOrBefore(new Date(year, 4, 25)); // Monday on/before May 25

  return [
    { name: "New Year's Day", date: fmt(new Date(year, 0, 1)) },
    { name: 'Family Day', date: fmt(nthWeekdayOfMonth(year, 1, 1, 3)) }, // 3rd Monday of Feb
    { name: 'Good Friday', date: fmt(goodFriday) },
    { name: 'Victoria Day', date: fmt(victoriaDay) },
    { name: 'Canada Day', date: fmt(new Date(year, 6, 1)) },
    { name: 'BC Day', date: fmt(nthWeekdayOfMonth(year, 7, 1, 1)) }, // 1st Monday of Aug
    { name: 'Labour Day', date: fmt(nthWeekdayOfMonth(year, 8, 1, 1)) }, // 1st Monday of Sep
    { name: 'National Day for Truth and Reconciliation', date: fmt(new Date(year, 8, 30)) },
    { name: 'Thanksgiving', date: fmt(nthWeekdayOfMonth(year, 9, 1, 2)) }, // 2nd Monday of Oct
    { name: 'Remembrance Day', date: fmt(new Date(year, 10, 11)) },
    { name: 'Christmas Day', date: fmt(new Date(year, 11, 25)) },
    { name: 'Boxing Day', date: fmt(new Date(year, 11, 26)) },

    // Not statutory holidays, but common marketing/content occasions.
    // Delete a line here to stop getting a reminder for it.
    { name: "Valentine's Day", date: fmt(new Date(year, 1, 14)) },
    { name: 'Easter Sunday', date: fmt(easter) },
    { name: "Mother's Day", date: fmt(nthWeekdayOfMonth(year, 4, 0, 2)) }, // 2nd Sunday of May
    { name: 'Halloween', date: fmt(new Date(year, 9, 31)) },
    {
      name: 'Black Friday',
      date: fmt(new Date(year, 10, nthWeekdayOfMonth(year, 10, 4, 4).getDate() + 1)), // day after US Thanksgiving (4th Thu of Nov)
    },
    { name: 'Christmas Eve', date: fmt(new Date(year, 11, 24)) },
  ];
}
