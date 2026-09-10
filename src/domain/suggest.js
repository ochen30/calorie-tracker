import { daysBetween } from './dates.js';

// How far back Quick add looks when deciding what you eat often.
export const LOOKBACK_DAYS = 90;

// Entries linked to a saved food group by its id; everything else groups by
// name, so "Greek yogurt" and "greek  yogurt" count as the same food.
export function foodKey({ foodId, name }) {
  return foodId ? `food:${foodId}` : `name:${name.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

// One row per distinct food: the numbers scoreFood() works from, plus a
// template (name, serving, per-serving nutrients) for logging it again.
export function collectFoodStats({ entries, foods = [], todayKey, meal }) {
  const archived = new Set(foods.filter((food) => food.archived).map((food) => food.id));
  const rows = new Map();
  const newest = new Map(); // key -> createdAt of the entry used as the template

  for (const entry of entries) {
    if (entry.foodId && archived.has(entry.foodId)) continue;
    const age = daysBetween(entry.date, todayKey);
    if (age < 0 || age > LOOKBACK_DAYS) continue;

    const key = foodKey(entry);
    const row = rows.get(key) ?? emptyRow(key);
    row.timesLogged += 1;
    if (entry.meal === meal) row.timesAtMeal += 1;
    row.daysSinceLast = Math.min(row.daysSinceLast, age);
    if (!newest.has(key) || entry.createdAt > newest.get(key)) {
      newest.set(key, entry.createdAt);
      row.template = { name: entry.name, serving: entry.serving, per: { ...entry.per }, foodId: entry.foodId ?? null };
    }
    rows.set(key, row);
  }

  // Saved foods always appear, and their current values replace old snapshots.
  for (const food of foods) {
    if (food.archived) continue;
    const key = foodKey({ foodId: food.id });
    const row = rows.get(key) ?? emptyRow(key);

    // Fold in entries logged under the same name before the food was saved.
    const unlinkedKey = foodKey({ name: food.name });
    const unlinked = rows.get(unlinkedKey);
    if (unlinked) {
      row.timesLogged += unlinked.timesLogged;
      row.timesAtMeal += unlinked.timesAtMeal;
      row.daysSinceLast = Math.min(row.daysSinceLast, unlinked.daysSinceLast);
      rows.delete(unlinkedKey);
    }

    row.template = { name: food.name, serving: food.serving ?? null, per: { ...food.per }, foodId: food.id };
    rows.set(key, row);
  }

  return [...rows.values()].map((row) => ({ ...row, name: row.template.name }));
}

function emptyRow(key) {
  return { key, timesLogged: 0, timesAtMeal: 0, daysSinceLast: Infinity, template: null };
}

// How strongly to suggest a food right now. Higher scores are listed first.
//
//   stats.timesLogged    times logged in the last 90 days (0 for a saved food you haven't used)
//   stats.timesAtMeal    how many of those were at context.meal
//   stats.daysSinceLast  days since you last logged it: 0 is today, Infinity is not in 90 days
export function scoreFood(stats) {
  // Times logged at this meal count fully and other meals count a quarter, so
  // your usual lunch beats your usual breakfast when you're adding lunch. The
  // total then halves for every 10 days since you last had it.
  const weightedCount = stats.timesAtMeal + 0.25 * (stats.timesLogged - stats.timesAtMeal);
  return weightedCount * 0.5 ** (stats.daysSinceLast / 10);
}

export function rankSuggestions({ entries, foods = [], todayKey, meal, limit = 8 }) {
  return collectFoodStats({ entries, foods, todayKey, meal })
    .map((stats) => {
      const score = scoreFood(stats);
      return { ...stats, score: Number.isNaN(score) ? -Infinity : score };
    })
    .sort((a, b) => (b.score > a.score) - (b.score < a.score) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// True when every word typed appears somewhere in the name, in any order.
export function matchesQuery(name, query) {
  const haystack = name.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => haystack.includes(word));
}
