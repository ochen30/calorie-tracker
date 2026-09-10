import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { collectFoodStats, rankSuggestions, matchesQuery, scoreFood } from '../src/domain/suggest.js';
import { shiftDay } from '../src/domain/dates.js';

const TODAY = '2026-09-10';
let created = 0;

// log('Oats', 'breakfast', 1, 2) logs Oats at breakfast 1 and 2 days ago.
function log(name, meal, ...daysAgo) {
  return daysAgo.map((ago) => ({
    id: `e${++created}`, date: shiftDay(TODAY, -ago), meal, name, serving: null, servings: 1,
    per: { kcal: 100, protein: 10, carbs: null, fat: null }, foodId: null, createdAt: created,
  }));
}

describe('collectFoodStats', () => {
  test('counts each food, its meal, and how recently it was eaten', () => {
    const entries = [...log('Oats', 'breakfast', 1, 2), ...log('oats ', 'lunch', 5)];
    const [oats, ...rest] = collectFoodStats({ entries, todayKey: TODAY, meal: 'breakfast' });
    assert.equal(rest.length, 0);
    assert.equal(oats.timesLogged, 3);
    assert.equal(oats.timesAtMeal, 2);
    assert.equal(oats.daysSinceLast, 1);
  });

  test('ignores entries older than 90 days and foods you archived', () => {
    const entries = [...log('Old', 'lunch', 91), ...log('Gone', 'lunch', 1).map((e) => ({ ...e, foodId: 'f9' }))];
    const foods = [{ id: 'f9', name: 'Gone', per: {}, archived: true }];
    assert.deepEqual(collectFoodStats({ entries, foods, todayKey: TODAY, meal: 'lunch' }), []);
  });

  test('includes saved foods you have not logged, and uses their current values', () => {
    const entries = log('Whey shake', 'snacks', 3).map((e) => ({ ...e, foodId: 'f1' }));
    const foods = [
      { id: 'f1', name: 'Whey shake', serving: '1 scoop', per: { kcal: 120, protein: 25, carbs: 3, fat: 2 } },
      { id: 'f2', name: 'Rice cakes', serving: '2 cakes', per: { kcal: 70, protein: 1, carbs: 15, fat: 0 } },
    ];
    const stats = collectFoodStats({ entries, foods, todayKey: TODAY, meal: 'snacks' });
    const whey = stats.find((s) => s.name === 'Whey shake');
    const rice = stats.find((s) => s.name === 'Rice cakes');
    assert.equal(whey.template.per.kcal, 120);
    assert.equal(rice.timesLogged, 0);
    assert.equal(rice.daysSinceLast, Infinity);
  });

  test('merges entries logged before a food was saved', () => {
    const entries = [
      ...log('Greek yogurt', 'breakfast', 4),
      ...log('Greek yogurt', 'breakfast', 1).map((e) => ({ ...e, foodId: 'f1' })),
    ];
    const foods = [{ id: 'f1', name: 'Greek yogurt', per: { kcal: 240, protein: 25 } }];
    const stats = collectFoodStats({ entries, foods, todayKey: TODAY, meal: 'breakfast' });
    assert.equal(stats.length, 1);
    assert.equal(stats[0].timesLogged, 2);
  });
});

test('matchesQuery matches every typed word, in any order', () => {
  assert.ok(matchesQuery('Chicken rice bowl', 'rice chick'));
  assert.ok(!matchesQuery('Chicken rice bowl', 'beef'));
});

// What any sensible ranking should do. These fail until scoreFood() is
// written: each one includes a case where the right answer is the reverse of
// alphabetical order, so an unranked list can't pass by accident.
describe('scoreFood ranking', () => {
  const rank = (entries, meal) => rankSuggestions({ entries, todayKey: TODAY, meal }).map((s) => s.name);

  test('a food you eat more often comes first', () => {
    assert.deepEqual(rank([...log('Apple', 'lunch', 1), ...log('Wrap', 'lunch', 1, 2, 3)], 'lunch'), ['Wrap', 'Apple']);
  });

  test('a food you had more recently comes first', () => {
    assert.deepEqual(rank([...log('Apple', 'lunch', 30), ...log('Wrap', 'lunch', 2)], 'lunch'), ['Wrap', 'Apple']);
  });

  test('a food you usually have at this meal comes first', () => {
    const entries = [...log('Apple', 'breakfast', 1, 2, 3), ...log('Wrap', 'lunch', 1, 2, 3)];
    assert.deepEqual(rank(entries, 'lunch'), ['Wrap', 'Apple']);
    assert.deepEqual(rank(entries, 'breakfast'), ['Apple', 'Wrap']);
  });

  test('scores stay usable for foods never logged', () => {
    const score = scoreFood({ timesLogged: 0, timesAtMeal: 0, daysSinceLast: Infinity }, { meal: 'lunch' });
    assert.ok(Number.isFinite(score) || score === -Infinity, `got ${score}`);
  });
});
