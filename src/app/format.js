import { fromKcal, round1 } from '../domain/nutrition.js';

const whole = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const upToOne = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const upToTwo = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export const int = (n) => whole.format(Math.round(n));

// Energy in the user's unit: energyNumber(740, 'kJ') -> "3,096".
export const energyNumber = (kcal, unit) => int(fromKcal(kcal, unit));
export const energy = (kcal, unit) => `${energyNumber(kcal, unit)} ${unit}`;

// Whole grams from 10 up; one decimal below that, where 2.5 g of fat matters.
export const gramsNumber = (g) => (Math.abs(g) >= 10 ? int(g) : upToOne.format(round1(g)));
export const grams = (g) => `${gramsNumber(g)} g`;

// "1 bowl", "2 × 1 scoop", "1.5 servings", or "" for a single unnamed serving.
export function servingText({ serving, servings }) {
  const count = upToTwo.format(servings);
  if (!serving) return servings === 1 ? '' : `${count} servings`;
  return servings === 1 ? serving : `${count} × ${serving}`;
}

// A number as it should appear inside an input: no grouping, at most 1 decimal.
export const inputNumber = (n) => (n == null ? '' : String(round1(n)));
