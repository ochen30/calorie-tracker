import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalRepository, StorageError } from '../src/data/repository.js';
import { createMemoryStorage } from './helpers/memory-storage.js';

function setup(initial) {
  const storage = createMemoryStorage(initial);
  let clock = 1_000;
  let ids = 0;
  const repo = createLocalRepository({ storage, now: () => (clock += 1_000), makeId: () => `id${++ids}` });
  return { storage, repo };
}

const lunch = (overrides = {}) => ({
  date: '2026-09-10', meal: 'lunch', name: 'Chicken rice bowl', serving: '1 bowl', servings: 1,
  per: { kcal: 740, protein: 52, carbs: 80, fat: 18 }, ...overrides,
});

test('settings start unset and merge on save', async () => {
  const { repo } = setup();
  const initial = await repo.getSettings();
  assert.equal(initial.kcalTarget, null);
  assert.equal(initial.energyUnit, 'kcal');

  await repo.saveSettings({ kcalTarget: 3000, proteinTarget: 180 });
  await repo.saveSettings({ energyUnit: 'kJ' });
  const saved = await repo.getSettings();
  assert.equal(saved.kcalTarget, 3000);
  assert.equal(saved.energyUnit, 'kJ');
});

test('addEntry assigns an id and timestamps, and keeps the day in logging order', async () => {
  const { repo } = setup();
  const first = await repo.addEntry(lunch());
  const second = await repo.addEntry(lunch({ name: 'Apple', per: { kcal: 95, protein: 0 } }));
  assert.equal(first.id, 'id1');
  assert.ok(second.createdAt > first.createdAt);
  assert.equal(second.per.carbs, null);
  assert.deepEqual((await repo.getDay('2026-09-10')).map((e) => e.name), ['Chicken rice bowl', 'Apple']);
});

test('updateEntry edits in place, and a new date moves the entry', async () => {
  const { repo } = setup();
  const entry = await repo.addEntry(lunch());
  await repo.updateEntry('2026-09-10', entry.id, { servings: 1.5 });
  assert.equal((await repo.getDay('2026-09-10'))[0].servings, 1.5);

  await repo.updateEntry('2026-09-10', entry.id, { date: '2026-09-09' });
  assert.deepEqual(await repo.getDay('2026-09-10'), []);
  assert.equal((await repo.getDay('2026-09-09'))[0].id, entry.id);
});

test('deleteEntry returns the entry, and adding it back restores its place', async () => {
  const { repo, storage } = setup();
  const a = await repo.addEntry(lunch({ name: 'A' }));
  const b = await repo.addEntry(lunch({ name: 'B' }));

  const removed = await repo.deleteEntry('2026-09-10', a.id);
  assert.equal(removed.name, 'A');
  await repo.addEntry(removed);
  assert.deepEqual((await repo.getDay('2026-09-10')).map((e) => e.name), ['A', 'B']);

  await repo.deleteEntry('2026-09-10', a.id);
  await repo.deleteEntry('2026-09-10', b.id);
  assert.equal(storage.getItem('ct:v2:day:2026-09-10'), null, 'an emptied day leaves nothing behind');
});

test('getDays returns only logged days inside the range', async () => {
  const { repo } = setup();
  for (const date of ['2026-08-31', '2026-09-01', '2026-09-10']) await repo.addEntry(lunch({ date }));
  assert.deepEqual(Object.keys(await repo.getDays('2026-09-01', '2026-09-30')), ['2026-09-01', '2026-09-10']);
});

test('an unreadable day is set aside instead of crashing or being overwritten', async () => {
  const { repo, storage } = setup({ 'ct:v2:day:2026-09-10': '{not json' });
  assert.deepEqual(await repo.getDay('2026-09-10'), []);
  const backupKey = Object.keys(storage.dump()).find((key) => key.startsWith('ct:v2:day:2026-09-10:unreadable:'));
  assert.equal(storage.getItem(backupKey), '{not json');
  assert.deepEqual(await repo.getDays('2026-09-01', '2026-09-30'), {});
});

test('a failed save surfaces as a StorageError', async () => {
  const { repo, storage } = setup();
  storage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  await assert.rejects(repo.addEntry(lunch()), StorageError);
});

test('foods can be created, edited, and archived', async () => {
  const { repo } = setup();
  const food = await repo.saveFood({
    name: 'Whey shake', serving: '1 scoop', grams: 30, per: { kcal: 125, protein: 25, carbs: 3, fat: 2 },
  });
  await repo.saveFood({ id: food.id, per: { ...food.per, kcal: 120 } });
  const [edited] = await repo.listFoods();
  assert.equal(edited.per.kcal, 120);
  assert.equal(edited.name, 'Whey shake');

  await repo.archiveFood(food.id);
  assert.deepEqual(await repo.listFoods(), []);
  assert.equal((await repo.listFoods({ includeArchived: true })).length, 1);
});

test('exporting from one device and importing on another copies everything once', async () => {
  const phone = setup().repo;
  await phone.saveSettings({ kcalTarget: 3000, proteinTarget: 180 });
  await phone.saveFood({ name: 'Whey shake', per: { kcal: 125, protein: 25 } });
  await phone.addEntry(lunch());
  const backup = await phone.exportAll();

  const laptop = setup().repo;
  assert.deepEqual(await laptop.importAll(backup), { entriesAdded: 1, entriesSkipped: 0, foodsAdded: 1 });
  assert.deepEqual(await laptop.importAll(backup), { entriesAdded: 0, entriesSkipped: 1, foodsAdded: 0 });
  assert.equal((await laptop.getSettings()).proteinTarget, 180);
  assert.equal((await laptop.getDay('2026-09-10')).length, 1);
});

test('two settings saved at the same moment both stick', async () => {
  const { repo } = setup();
  await Promise.all([repo.saveSettings({ energyUnit: 'kJ' }), repo.saveSettings({ theme: 'dark' })]);
  const saved = await repo.getSettings();
  assert.equal(saved.energyUnit, 'kJ');
  assert.equal(saved.theme, 'dark');
});
