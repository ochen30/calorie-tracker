import { isDateKey } from '../domain/dates.js';
import { MEALS, NUTRIENTS, round1 } from '../domain/nutrition.js';

export const BACKUP_APP = 'calorie-tracker';
export const BACKUP_SCHEMA = 2;

export function backupToJSON(backup) {
  return JSON.stringify(backup, null, 2);
}

// ---------- CSV ----------

const CSV_COLUMNS = ['date', 'meal', 'name', 'serving', 'servings', 'kcal', 'protein_g', 'carbs_g', 'fat_g'];

// One row per entry, with totals for the servings eaten. Unknown carbs or fat
// stay blank rather than pretending to be 0.
export function entriesToCSV(entries) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const entry of entries) {
    const amount = (key) => (entry.per[key] == null ? '' : round1(entry.per[key] * entry.servings));
    const cells = [
      entry.date, entry.meal, entry.name, entry.serving ?? '', entry.servings,
      amount('kcal'), amount('protein'), amount('carbs'), amount('fat'),
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

// Quotes a cell when needed. Text starting with = + - @ gets an apostrophe in
// front so spreadsheet apps show it instead of running it as a formula.
function csvCell(value) {
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// ---------- JSON backup ----------

// Checks a backup file before anything is imported. Malformed entries and
// foods are dropped and counted instead of failing the whole import.
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  if (data?.app !== BACKUP_APP || !Array.isArray(data.entries)) {
    return { ok: false, error: "This file isn't a Calorie Tracker backup." };
  }
  if (typeof data.schema === 'number' && data.schema > BACKUP_SCHEMA) {
    return { ok: false, error: 'This backup comes from a newer version of the app. Update the app and try again.' };
  }

  const foods = Array.isArray(data.foods) ? data.foods : [];
  const entries = data.entries.filter(isValidEntry);
  const validFoods = foods.filter(isValidFood);
  return {
    ok: true,
    value: {
      settings: pickTargets(data.settings),
      entries,
      foods: validFoods,
      dropped: data.entries.length - entries.length + foods.length - validFoods.length,
    },
  };
}

const isAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isName = (value) => typeof value === 'string' && value.trim() !== '';
const isNutrients = (per) => Boolean(per) && isAmount(per.kcal)
  && NUTRIENTS.every((key) => per[key] == null || isAmount(per[key]));

function isValidEntry(entry) {
  return Boolean(entry) && typeof entry.id === 'string' && isDateKey(entry.date) && MEALS.includes(entry.meal)
    && isName(entry.name) && isAmount(entry.servings) && entry.servings > 0 && isNutrients(entry.per);
}

function isValidFood(food) {
  return Boolean(food) && typeof food.id === 'string' && isName(food.name) && isNutrients(food.per);
}

function pickTargets(settings) {
  const targets = {};
  for (const key of ['kcalTarget', 'proteinTarget', 'carbsTarget', 'fatTarget']) {
    if (isAmount(settings?.[key]) && settings[key] > 0) targets[key] = settings[key];
  }
  return targets;
}
