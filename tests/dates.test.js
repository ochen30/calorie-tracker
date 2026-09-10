// `npm test` runs with TZ=America/Los_Angeles, so the DST cases cross real clock changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDateKey, isDateKey, shiftDay, daysBetween, startOfWeek, monthWeeks, formatDayTitle,
} from '../src/domain/dates.js';

test('toDateKey uses the local calendar day, even late in the evening', () => {
  assert.equal(toDateKey(new Date(2026, 8, 10, 23, 30)), '2026-09-10');
});

test('shiftDay crosses month and year boundaries', () => {
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
});

test('shiftDay steps exactly one day across DST changes', () => {
  // US clocks change on 8 Mar and 1 Nov 2026.
  assert.equal(shiftDay('2026-03-07', 1), '2026-03-08');
  assert.equal(shiftDay('2026-03-08', 1), '2026-03-09');
  assert.equal(shiftDay('2026-11-01', 1), '2026-11-02');
  assert.equal(shiftDay('2026-11-02', -1), '2026-11-01');
});

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2);
  assert.equal(daysBetween('2026-09-10', '2026-09-10'), 0);
  assert.equal(daysBetween('2026-09-10', '2026-09-01'), -9);
});

test('isDateKey accepts real dates only', () => {
  assert.ok(isDateKey('2026-02-28'));
  assert.ok(!isDateKey('2026-02-30'));
  assert.ok(!isDateKey('2026-9-1'));
  assert.ok(!isDateKey(20260901));
});

test('formatDayTitle says Today, otherwise "Mon 14 Sep"', () => {
  assert.equal(formatDayTitle('2026-09-10', '2026-09-10'), 'Today');
  assert.equal(formatDayTitle('2026-09-14', '2026-09-10'), 'Mon 14 Sep');
  assert.equal(formatDayTitle('2026-09-09', '2026-09-10'), 'Wed 9 Sep');
  assert.equal(formatDayTitle('2025-09-14', '2026-09-10'), 'Sun 14 Sep 2025');
});

test('startOfWeek returns the Monday', () => {
  assert.equal(startOfWeek('2026-09-10'), '2026-09-07');
  assert.equal(startOfWeek('2026-09-13'), '2026-09-07');
  assert.equal(startOfWeek('2026-09-07'), '2026-09-07');
});

test('monthWeeks lays out August 2026 Monday-first', () => {
  const weeks = monthWeeks(2026, 7);
  assert.equal(weeks.length, 6);
  assert.deepEqual(weeks[0], [null, null, null, null, null, '2026-08-01', '2026-08-02']);
  assert.deepEqual(weeks[5], ['2026-08-31', null, null, null, null, null, null]);
});

test('formatWeekRange handles weeks inside and across months', async () => {
  const { formatWeekRange } = await import('../src/domain/dates.js');
  assert.equal(formatWeekRange('2026-09-07'), '7–13 Sep');
  assert.equal(formatWeekRange('2026-09-28'), '28 Sep – 4 Oct');
});
