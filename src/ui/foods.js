import { html, useState } from '../../vendor/preact-htm.js';
import { fromGrams, validateFoodDraft } from '../domain/nutrition.js';
import { matchesQuery } from '../domain/suggest.js';
import * as fmt from '../app/format.js';
import { archiveFood, closeSheet, openSheet, saveFood, useStore } from '../app/store.js';
import { NutrientFields, nutrientValues, useForm } from './entry-form.js';
import { Icon } from './icons.js';
import { Sheet, TextField } from './primitives.js';

export function FoodsScreen() {
  const { foods, settings } = useStore();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const shown = trimmed ? foods.filter((food) => matchesQuery(food.name, trimmed)) : foods;

  return html`
    <h1 class="screen-title">My foods</h1>
    <div class="toolbar">
      <label class="search">
        <${Icon} name="search" size=${18} />
        <span class="visually-hidden">Search my foods</span>
        <input type="search" placeholder="Search" value=${query} onInput=${(event) => setQuery(event.currentTarget.value)} />
      </label>
      <button class="btn btn--primary" type="button" onClick=${() => openSheet({ type: 'food' })}>
        <${Icon} name="plus" size=${18} /> New
      </button>
    </div>
    ${foods.length === 0
      ? html`<p class="empty-list">Saved foods are one tap away in Quick add. Create one here, or switch on “Save to My foods” when you enter a food manually.</p>`
      : shown.length === 0
        ? html`<p class="empty-list">No foods match “${trimmed}”.</p>`
        : html`
          <ul class="list">
            ${shown.map((food) => html`
              <li key=${food.id}>
                <button class="list-row" type="button" onClick=${() => openSheet({ type: 'food', food })}>
                  <span>
                    <span>${food.name}</span><br />
                    <span class="list-row__meta num">${foodMeta(food, settings.energyUnit)}</span>
                  </span>
                  <${Icon} name="chevronRight" size=${18} />
                </button>
              </li>`)}
          </ul>`}`;
}

// "1 scoop · 125 kcal · P 25 g · C 3 g · F 2 g"
function foodMeta(food, energyUnit) {
  const macro = (label, grams) => (grams == null ? null : `${label} ${fmt.grams(grams)}`);
  return [food.serving, fmt.energy(food.per.kcal, energyUnit), macro('P', food.per.protein), macro('C', food.per.carbs), macro('F', food.per.fat)]
    .filter(Boolean).join(' · ');
}

export function FoodFormSheet({ food }) {
  const { settings } = useStore();
  const { energyUnit, weightUnit } = settings;
  const validate = (values) => validateFoodDraft(values, { energyUnit, weightUnit });
  const { field, check, formRef } = useForm(() => ({
    name: food?.name ?? '',
    serving: food?.serving ?? '',
    grams: food?.grams == null ? '' : fmt.inputNumber(fromGrams(food.grams, weightUnit)),
    ...nutrientValues(food?.per ?? {}, energyUnit),
  }), validate);

  async function submit(event) {
    event.preventDefault();
    const value = check();
    if (value && (await saveFood({ ...(food ? { id: food.id } : {}), ...value }))) closeSheet();
  }

  function remove() {
    closeSheet();
    archiveFood(food);
  }

  return html`
    <${Sheet} label=${food ? 'Edit food' : 'New food'} onClose=${closeSheet} focusField=${!food}>
      <form ref=${formRef} style=${{ display: 'contents' }} onSubmit=${submit} novalidate>
        <div class="sheet__head">
          <h2 class="sheet__title">${food ? 'Edit food' : 'New food'}</h2>
          ${food && html`<button class="btn btn--danger" type="button" onClick=${remove}>Delete</button>`}
        </div>
        <div class="sheet__body form-grid">
          <${TextField} label="Name" placeholder="Whey shake" autofocus=${!food} ...${field('name')} />
          <div class="form-row">
            <${TextField} label="Serving" placeholder="1 scoop" ...${field('serving')} />
            <${TextField} label="Weight (${weightUnit})" placeholder="Optional" inputmode="decimal" ...${field('grams')} />
          </div>
          <p class="totals-preview">Nutrients per serving. Past entries keep the values they were logged with.</p>
          <${NutrientFields} field=${field} energyUnit=${energyUnit} />
        </div>
        <div class="sheet__foot">
          <button class="btn btn--secondary" type="button" onClick=${closeSheet}>Cancel</button>
          <button class="btn btn--primary" type="submit">Save</button>
        </div>
      </form>
    <//>`;
}
