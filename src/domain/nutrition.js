export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];
export const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat'];

// Upper bounds per serving. Anything past these is almost always a typo.
export const LIMITS = { kcal: 10_000, grams: 1_000, servings: 50, name: 80 };

export const KJ_PER_KCAL = 4.184;
export const GRAMS_PER_OUNCE = 28.349523125;

export const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Totals ----------

// An entry stores nutrients per serving (a snapshot taken when it was logged)
// plus how many servings were eaten. Unknown carbs or fat (null) count as 0.
export function entryNutrients(entry) {
  const result = {};
  for (const key of NUTRIENTS) result[key] = round1((entry.per[key] ?? 0) * entry.servings);
  return result;
}

export function sumNutrients(entries) {
  const total = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const entry of entries) {
    const nutrients = entryNutrients(entry);
    for (const key of NUTRIENTS) total[key] += nutrients[key];
  }
  for (const key of NUTRIENTS) total[key] = round1(total[key]);
  return total;
}

// Everything a progress bar needs. The bar's scale is whichever is larger,
// consumed or target: `fill` is the solid part up to the target and `over` is
// the part past it, both as fractions of the whole bar.
export function progress(consumed, target) {
  const left = round1(target - consumed);
  if (consumed <= target) {
    return { consumed, target, left, fill: target > 0 ? consumed / target : 0, over: 0 };
  }
  return { consumed, target, left, fill: target / consumed, over: 1 - target / consumed };
}

// ---------- Meals ----------

export function mealForHour(hour) {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 21) return 'dinner';
  return 'snacks';
}

// Today goes by the clock. On a past day it's the meal after the last one
// logged, so dinner logged the next morning lands in Dinner without a tap.
export function defaultMeal({ dayKey, todayKey, now = new Date(), dayEntries = [] }) {
  if (dayKey === todayKey) return mealForHour(now.getHours());
  const lastLogged = Math.max(-1, ...dayEntries.map((entry) => MEALS.indexOf(entry.meal)));
  return MEALS[Math.min(lastLogged + 1, MEALS.length - 1)];
}

// ---------- Units ----------
// Energy is always stored in kcal and weights in grams; these convert at the edges.

export const toKcal = (value, unit) => (unit === 'kJ' ? value / KJ_PER_KCAL : value);
export const fromKcal = (kcal, unit) => (unit === 'kJ' ? kcal * KJ_PER_KCAL : kcal);
export const toGrams = (value, unit) => (unit === 'oz' ? value * GRAMS_PER_OUNCE : value);
export const fromGrams = (grams, unit) => (unit === 'oz' ? grams / GRAMS_PER_OUNCE : grams);

// ---------- Input ----------

const THOUSANDS = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

// Reads a typed amount. Accepts "12.5", "12,5" (some keypads only offer a
// comma), and "1,200". Returns null for blank and NaN for anything else.
export function parseAmount(text) {
  let value = String(text ?? '').trim();
  if (value === '') return null;
  value = THOUSANDS.test(value) ? value.replaceAll(',', '') : value.replace(',', '.');
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

// Turns raw form values into a clean entry, or explains per field what's wrong.
// Calories and protein are required; carbs and fat may be left blank.
export function validateEntryDraft(raw, { energyUnit = 'kcal' } = {}) {
  const errors = {};
  const name = cleanName(raw.name, errors);
  const per = checkNutrients(raw, energyUnit, errors);

  const servings = parseAmount(raw.servings ?? '1');
  if (servings === null || Number.isNaN(servings) || servings <= 0) errors.servings = 'Enter more than 0.';
  else if (servings > LIMITS.servings) errors.servings = `Enter ${LIMITS.servings} or fewer.`;

  if (!MEALS.includes(raw.meal)) errors.meal = 'Choose a meal.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { name, serving: cleanServing(raw.serving), servings: round2(servings), per, meal: raw.meal },
  };
}

// The same checks for a saved food. `grams` (weight of one serving) is optional.
export function validateFoodDraft(raw, { energyUnit = 'kcal', weightUnit = 'g' } = {}) {
  const errors = {};
  const name = cleanName(raw.name, errors);
  const per = checkNutrients(raw, energyUnit, errors);

  let grams = parseAmount(raw.grams);
  if (grams !== null) {
    if (Number.isNaN(grams) || grams <= 0) errors.grams = 'Enter more than 0, or leave it blank.';
    else grams = round1(toGrams(grams, weightUnit));
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { name, serving: cleanServing(raw.serving), grams, per } };
}

function checkNutrients(raw, energyUnit, errors) {
  const per = {};
  for (const key of NUTRIENTS) {
    const value = parseAmount(raw[key]);
    const isEnergy = key === 'kcal';
    const unit = isEnergy ? energyUnit : 'g';
    const max = isEnergy ? fromKcal(LIMITS.kcal, energyUnit) : LIMITS.grams;
    per[key] = null;

    if (value === null) {
      if (key === 'kcal') errors.kcal = energyUnit === 'kJ' ? 'Enter kilojoules.' : 'Enter calories.';
      if (key === 'protein') errors.protein = 'Enter protein, or 0 if there is none.';
    } else if (Number.isNaN(value)) {
      errors[key] = 'Enter a number.';
    } else if (value < 0) {
      errors[key] = 'Enter 0 or more.';
    } else if (value > max) {
      errors[key] = `That's over ${Math.round(max).toLocaleString('en-GB')} ${unit}. Check for a typo.`;
    } else {
      per[key] = round1(isEnergy ? toKcal(value, energyUnit) : value);
    }
  }
  return per;
}

function cleanName(value, errors) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) errors.name = 'Enter a name.';
  else if (name.length > LIMITS.name) errors.name = `Keep it under ${LIMITS.name} characters.`;
  return name;
}

function cleanServing(value) {
  const serving = String(value ?? '').trim().replace(/\s+/g, ' ');
  return serving ? serving.slice(0, 40) : null;
}
