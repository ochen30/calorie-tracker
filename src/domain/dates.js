// Day keys are local calendar dates ("2026-09-14"). Never build them from
// toISOString(): that's UTC, and it files evening entries under tomorrow.

export function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && toDateKey(fromDateKey(value)) === value; // rejects impossible dates like 2026-02-30
}

export function shiftDay(key, days) {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days); // calendar math, so DST changes can't skip or repeat a day
  return toDateKey(date);
}

// The same calendar date as a UTC midnight. Arithmetic and formatting on these
// ignore the device's time zone, so travelling can't shift a label by a day.
function utcDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Whole calendar days from `fromKey` to `toKey`, negative if toKey is earlier.
export function daysBetween(fromKey, toKey) {
  return Math.round((utcDate(toKey) - utcDate(fromKey)) / 86_400_000);
}

// Monday of the week that contains `key`.
export function startOfWeek(key) {
  const mondayOffset = (utcDate(key).getUTCDay() + 6) % 7;
  return shiftDay(key, -mondayOffset);
}

// Monday-first weeks for the month picker, 7 slots each. Slots that belong to
// the neighbouring months are null.
export function monthWeeks(year, monthIndex) {
  const lead = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const month = String(monthIndex + 1).padStart(2, '0');
  const slots = Array(lead).fill(null);
  for (let day = 1; day <= daysInMonth; day++) slots.push(`${year}-${month}-${String(day).padStart(2, '0')}`);
  while (slots.length % 7 !== 0) slots.push(null);

  const weeks = [];
  for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
  return weeks;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Labels are spelled out by hand: Intl's en-GB data now abbreviates September
// as "Sept", and browsers ship different versions of that data.

// "Thu 10 Sep", plus the year when it isn't the same year as `todayKey`.
export function formatShortDate(key, todayKey) {
  const date = utcDate(key);
  const label = `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return key.slice(0, 4) === todayKey.slice(0, 4) ? label : `${label} ${date.getUTCFullYear()}`;
}

// "Today", or the short date.
export function formatDayTitle(key, todayKey) {
  return key === todayKey ? 'Today' : formatShortDate(key, todayKey);
}

export const formatMonth = (year, monthIndex) => `${MONTH_NAMES[monthIndex]} ${year}`;
export const weekdayOf = (key) => WEEKDAYS[utcDate(key).getUTCDay()];

// "7–13 Sep", or "28 Sep – 4 Oct" when the week spans two months.
export function formatWeekRange(startKey) {
  const start = utcDate(startKey);
  const end = utcDate(shiftDay(startKey, 6));
  const startMonth = MONTHS[start.getUTCMonth()];
  const endMonth = MONTHS[end.getUTCMonth()];
  return startMonth === endMonth
    ? `${start.getUTCDate()}–${end.getUTCDate()} ${endMonth}`
    : `${start.getUTCDate()} ${startMonth} – ${end.getUTCDate()} ${endMonth}`;
}
