import { html, useMemo, useRef, useState } from '../../vendor/preact-htm.js';
import { formatShortDate } from '../domain/dates.js';
import { MEALS, MEAL_LABELS, defaultMeal, sumNutrients } from '../domain/nutrition.js';
import { matchesQuery, rankSuggestions } from '../domain/suggest.js';
import * as fmt from '../app/format.js';
import { addEntry, closeSheet, deleteEntry, openSheet, updateEntry, useStore } from '../app/store.js';
import { Icon } from './icons.js';
import { Sheet } from './primitives.js';

// Two taps for a repeat food: open this sheet, tap the food. The sheet stays
// open so a meal with several items costs one tap per item, and tapping a
// food again adds another serving to the same entry.
export function QuickAddSheet({ meal: requestedMeal, focusSearch = false }) {
  const { day, today, dayEntries, recentEntries, foods, settings } = useStore();
  const [meal, setMeal] = useState(() => requestedMeal ?? defaultMeal({ dayKey: day, todayKey: today, dayEntries }));
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState({}); // row key -> the entry this sheet created
  const pending = useRef(new Set());
  const unit = settings.energyUnit;
  const trimmed = query.trim();

  // Ranked once per meal and search, not after every tap, so rows don't jump
  // around under your thumb as you add things.
  const rows = useMemo(() => {
    const ranked = rankSuggestions({ entries: recentEntries, foods, todayKey: today, meal, limit: trimmed ? Infinity : 8 });
    return trimmed ? ranked.filter((row) => matchesQuery(row.name, trimmed)) : ranked;
  }, [meal, trimmed, foods]);

  async function change(row, delta) {
    if (pending.current.has(row.key)) return;
    pending.current.add(row.key);
    try {
      const existing = added[row.key];
      let next = null;
      if (!existing && delta > 0) next = await addEntry({ date: day, meal, ...row.template, servings: 1 });
      else if (existing && existing.servings + delta > 0) next = await updateEntry(existing, { servings: existing.servings + delta });
      else if (existing) await deleteEntry(existing, { undo: false });
      setAdded((current) => {
        const copy = { ...current };
        if (next) copy[row.key] = next;
        else if (existing && delta < 0) delete copy[row.key];
        return copy;
      });
    } finally {
      pending.current.delete(row.key);
    }
  }

  const addedList = Object.values(added);
  const addedTotal = sumNutrients(addedList);
  const dayLabel = day === today ? `Today · ${formatShortDate(day, today)}` : formatShortDate(day, today);

  return html`
    <${Sheet} label="Add food" onClose=${closeSheet} focusField=${focusSearch}>
      <div class="sheet__head">
        <div>
          <span class="sheet__eyebrow">Add to</span>
          <label class="qa-meal">
            <span class="visually-hidden">Meal</span>
            <select value=${meal} onChange=${(event) => setMeal(event.currentTarget.value)}>
              ${MEALS.map((option) => html`<option value=${option}>${MEAL_LABELS[option]}</option>`)}
            </select>
            <${Icon} name="chevronDown" size=${18} />
          </label>
        </div>
        <span class="sheet__eyebrow">${dayLabel}</span>
      </div>

      <div class="sheet__body">
        <label class="search">
          <${Icon} name="search" size=${18} />
          <span class="visually-hidden">Search foods</span>
          <input type="search" placeholder="Search foods" enterkeyhint="search" autofocus=${focusSearch} value=${query}
            onInput=${(event) => setQuery(event.currentTarget.value)} />
        </label>

        <p class="section-label">${trimmed ? 'Results' : `Suggested for ${MEAL_LABELS[meal].toLowerCase()}`}</p>
        ${rows.length === 0 && !trimmed && html`<p class="muted">Foods you log show up here, the likeliest first.</p>`}
        <ul class="entries">
          ${rows.map((row) => html`
            <${FoodRow} key=${row.key} row=${row} entry=${added[row.key]} unit=${unit}
              onAdd=${() => change(row, 1)} onRemove=${() => change(row, -1)} />`)}
        </ul>

        ${trimmed
          ? html`
            <button class="link-row" type="button" onClick=${() => openSheet({ type: 'entry', draft: { name: trimmed, meal } })}>
              <${Icon} name="plus" size=${18} /> Create “${trimmed}”
            </button>`
          : html`
            <button class="link-row" type="button" onClick=${() => openSheet({ type: 'entry', draft: { meal } })}>
              <${Icon} name="pencil" size=${18} /> Enter manually
            </button>`}
      </div>

      <div class="sheet__foot">
        ${addedList.length > 0
          ? html`
            <button class="added-bar" type="button" onClick=${closeSheet}>
              <span class="num">${addedList.length} added · ${fmt.energy(addedTotal.kcal, unit)} · ${fmt.grams(addedTotal.protein)}</span>
              <span>Done</span>
            </button>`
          : html`<button class="btn btn--secondary" type="button" onClick=${closeSheet}>Close</button>`}
      </div>
    <//>`;
}

function FoodRow({ row, entry, unit, onAdd, onRemove }) {
  const { per, serving } = row.template;
  const meta = [serving, fmt.energy(per.kcal, unit), fmt.grams(per.protein ?? 0)].filter(Boolean).join(' · ');
  return html`
    <li class="food-row ${entry ? 'is-added' : ''}">
      <button class="food-row__main" type="button" onClick=${onAdd}
        aria-label="Add ${row.name}, ${meta}${entry ? `. ${entry.servings} added` : ''}">
        <span>${row.name}</span>
        <span class="food-row__meta num">${meta}</span>
      </button>
      ${entry
        ? html`
          <span class="count-pill">
            <button type="button" aria-label="Remove one ${row.name}" onClick=${onRemove}><${Icon} name="minus" size=${16} /></button>
            <span class="num">${entry.servings}</span>
          </span>`
        : html`<span class="food-row__plus" aria-hidden="true"><${Icon} name="plus" size=${20} /></span>`}
    </li>`;
}
