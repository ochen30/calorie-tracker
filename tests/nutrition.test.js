import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  entryNutrients, sumNutrients, progress, mealForHour, defaultMeal, parseAmount,
  validateEntryDraft, validateFoodDraft,
} from '../src/domain/nutrition.js';

const entry = (per, servings = 1, meal = 'lunch') => ({
  per: { kcal: null, protein: null, carbs: null, fat: null, ...per }, servings, meal,
});

test('entryNutrients multiplies the per-serving snapshot by servings', () => {
  assert.deepEqual(
    entryNutrients(entry({ kcal: 740, protein: 52, carbs: 80, fat: 18 }, 1.5)),
    { kcal: 1110, protein: 78, carbs: 120, fat: 27 },
  );
});

test('entryNutrients counts unknown carbs and fat as 0', () => {
  assert.deepEqual(entryNutrients(entry({ kcal: 95, protein: 0 })), { kcal: 95, protein: 0, carbs: 0, fat: 0 });
});

test('sumNutrients adds entries without floating-point noise', () => {
  const total = sumNutrients([entry({ kcal: 0.1, protein: 0.1 }), entry({ kcal: 0.2, protein: 0.2 })]);
  assert.equal(total.kcal, 0.3);
  assert.equal(total.protein, 0.3);
});

test('progress under target', () => {
  assert.deepEqual(progress(1620, 3000), { consumed: 1620, target: 3000, left: 1380, fill: 0.54, over: 0 });
});

test('progress over target splits the bar at the target mark', () => {
  const p = progress(3240, 3000);
  assert.equal(p.left, -240);
  assert.ok(Math.abs(p.fill - 3000 / 3240) < 1e-9);
  assert.ok(Math.abs(p.fill + p.over - 1) < 1e-9);
});

test('mealForHour follows the clock', () => {
  assert.equal(mealForHour(7), 'breakfast');
  assert.equal(mealForHour(12), 'lunch');
  assert.equal(mealForHour(19), 'dinner');
  assert.equal(mealForHour(23), 'snacks');
  assert.equal(mealForHour(2), 'snacks');
});

test('defaultMeal uses the clock for today', () => {
  const now = new Date(2026, 8, 10, 12, 40);
  assert.equal(defaultMeal({ dayKey: '2026-09-10', todayKey: '2026-09-10', now }), 'lunch');
});

test('defaultMeal picks the meal after the last one logged on a past day', () => {
  const past = { dayKey: '2026-09-09', todayKey: '2026-09-10', now: new Date(2026, 8, 10, 8, 0) };
  assert.equal(defaultMeal({ ...past, dayEntries: [] }), 'breakfast');
  assert.equal(defaultMeal({ ...past, dayEntries: [entry({}, 1, 'breakfast'), entry({}, 1, 'lunch')] }), 'dinner');
  assert.equal(defaultMeal({ ...past, dayEntries: [entry({}, 1, 'snacks')] }), 'snacks');
});

test('parseAmount reads decimals, commas, and thousands', () => {
  assert.equal(parseAmount('12.5'), 12.5);
  assert.equal(parseAmount('12,5'), 12.5);
  assert.equal(parseAmount('1,200'), 1200);
  assert.equal(parseAmount('  '), null);
  assert.ok(Number.isNaN(parseAmount('abc')));
});

const draft = (overrides = {}) => ({
  name: 'Chicken rice bowl', kcal: '740', protein: '52', carbs: '', fat: '', servings: '1', meal: 'lunch', ...overrides,
});

test('validateEntryDraft cleans a valid draft', () => {
  const result = validateEntryDraft(draft({ name: '  Chicken   rice bowl ', carbs: '80' }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    name: 'Chicken rice bowl', serving: null, servings: 1,
    per: { kcal: 740, protein: 52, carbs: 80, fat: null }, meal: 'lunch',
  });
});

test('validateEntryDraft requires calories and protein', () => {
  const result = validateEntryDraft(draft({ kcal: '', protein: '' }));
  assert.equal(result.ok, false);
  assert.equal(result.errors.kcal, 'Enter calories.');
  assert.equal(result.errors.protein, 'Enter protein, or 0 if there is none.');
});

test('validateEntryDraft rejects blanks, negatives, junk, and typos', () => {
  const result = validateEntryDraft(draft({ name: '', protein: '-12', fat: 'lots', kcal: '74000', servings: '0' }));
  assert.equal(result.errors.name, 'Enter a name.');
  assert.equal(result.errors.protein, 'Enter 0 or more.');
  assert.equal(result.errors.fat, 'Enter a number.');
  assert.equal(result.errors.kcal, "That's over 10,000 kcal. Check for a typo.");
  assert.equal(result.errors.servings, 'Enter more than 0.');
});

test('validateEntryDraft converts kilojoules to kcal', () => {
  const result = validateEntryDraft(draft({ kcal: '4184' }), { energyUnit: 'kJ' });
  assert.equal(result.value.per.kcal, 1000);
});

test('validateFoodDraft stores serving weight in grams', () => {
  const result = validateFoodDraft(
    { name: 'Greek yogurt', serving: '1 pot', grams: '8', kcal: '240', protein: '25' },
    { weightUnit: 'oz' },
  );
  assert.equal(result.ok, true);
  assert.equal(result.value.grams, 226.8);
  assert.equal(result.value.per.carbs, null);
});
