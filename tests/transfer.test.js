import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entriesToCSV, parseBackup } from '../src/data/transfer.js';

const entry = (overrides = {}) => ({
  id: 'e1', date: '2026-09-10', meal: 'lunch', name: 'Chicken rice bowl', serving: '1 bowl', servings: 1.5,
  per: { kcal: 740, protein: 52, carbs: null, fat: 18 }, createdAt: 1, ...overrides,
});

test('entriesToCSV writes totals per entry and leaves unknown values blank', () => {
  assert.equal(
    entriesToCSV([entry()]),
    'date,meal,name,serving,servings,kcal,protein_g,carbs_g,fat_g\r\n'
      + '2026-09-10,lunch,Chicken rice bowl,1 bowl,1.5,1110,78,,27\r\n',
  );
});

test('entriesToCSV quotes commas and quotes, and defuses formulas', () => {
  const row = entriesToCSV([entry({ name: 'Rice, "sticky"', serving: '=HYPERLINK("x")' })]).split('\r\n')[1];
  assert.equal(row, `2026-09-10,lunch,"Rice, ""sticky""","'=HYPERLINK(""x"")",1.5,1110,78,,27`);
});

test('parseBackup rejects files that are not backups', () => {
  assert.equal(parseBackup('{oops').error, "This file isn't valid JSON.");
  assert.equal(parseBackup('{"entries": []}').error, "This file isn't a Calorie Tracker backup.");
  assert.match(parseBackup(JSON.stringify({ app: 'calorie-tracker', schema: 99, entries: [] })).error, /newer version/);
});

test('parseBackup keeps good records and counts the rest', () => {
  const result = parseBackup(JSON.stringify({
    app: 'calorie-tracker',
    schema: 2,
    settings: { kcalTarget: 3000, proteinTarget: -5, theme: 'dark' },
    foods: [{ id: 'f1', name: 'Whey', per: { kcal: 125, protein: 25 } }, { id: 'f2', name: '', per: {} }],
    entries: [entry(), entry({ id: 'e2', date: '2026-02-30' }), entry({ id: 'e3', meal: 'brunch' })],
  }));
  assert.equal(result.ok, true);
  assert.equal(result.value.entries.length, 1);
  assert.equal(result.value.foods.length, 1);
  assert.equal(result.value.dropped, 3);
  assert.deepEqual(result.value.settings, { kcalTarget: 3000 });
});
