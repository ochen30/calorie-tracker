import { html, useRef, useState } from '../../vendor/preact-htm.js';
import { MEALS, MEAL_LABELS, fromKcal, sumNutrients, validateEntryDraft } from '../domain/nutrition.js';
import * as fmt from '../app/format.js';
import { addEntry, closeSheet, deleteEntry, saveFood, updateEntry, useStore } from '../app/store.js';
import { Segmented, Sheet, Stepper, TextField } from './primitives.js';

const FIELD_ORDER = ['name', 'kcal', 'protein', 'carbs', 'fat', 'servings', 'grams', 'kcalTarget', 'proteinTarget', 'carbsTarget', 'fatTarget'];

// Form state as the text typed, plus errors that appear when you leave a field
// or press Save. Shared by the entry form and the food form.
export function useForm(initial, validate) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const formRef = useRef(null);

  const update = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };
  const field = (key) => ({
    name: key,
    value: values[key],
    error: errors[key],
    onInput: (event) => update(key, event.currentTarget.value),
    onBlur: () => {
      const result = validate(values);
      setErrors((current) => ({ ...current, [key]: result.ok ? undefined : result.errors[key] }));
    },
  });
  // Returns the clean value, or shows every error and focuses the first one.
  const check = () => {
    const result = validate(values);
    if (result.ok) return result.value;
    setErrors(result.errors);
    const first = FIELD_ORDER.find((key) => result.errors[key]);
    formRef.current?.querySelector(`[name="${first}"]`)?.focus();
    return null;
  };
  return { values, update, field, check, formRef };
}

export function NutrientFields({ field, energyUnit }) {
  const decimal = { inputmode: 'decimal', enterkeyhint: 'next' };
  return html`
    <div class="form-row">
      <${TextField} label=${energyUnit === 'kJ' ? 'Energy (kJ)' : 'Calories (kcal)'} ...${field('kcal')} ...${decimal} />
      <${TextField} label="Protein (g)" ...${field('protein')} ...${decimal} />
    </div>
    <div class="form-row">
      <${TextField} label="Carbs (g)" placeholder="Optional" ...${field('carbs')} ...${decimal} />
      <${TextField} label="Fat (g)" placeholder="Optional" ...${field('fat')} ...${decimal} />
    </div>`;
}

export function nutrientValues(per, energyUnit) {
  return {
    kcal: per.kcal == null ? '' : fmt.inputNumber(fromKcal(per.kcal, energyUnit)),
    protein: fmt.inputNumber(per.protein),
    carbs: fmt.inputNumber(per.carbs),
    fat: fmt.inputNumber(per.fat),
  };
}

// Manual entry and editing share this sheet. Nutrients are per serving, so
// changing servings updates the total line and leaves the fields alone.
export function EntryFormSheet({ entry, draft = {} }) {
  const { day, settings } = useStore();
  const energyUnit = settings.energyUnit;
  const editing = Boolean(entry);
  const source = entry ?? { name: draft.name ?? '', meal: draft.meal ?? 'snacks', serving: null, servings: 1, per: {} };
  const validate = (values) => validateEntryDraft(values, { energyUnit });
  const { values, update, field, check, formRef } = useForm(() => ({
    name: source.name,
    serving: source.serving ?? '',
    servings: String(source.servings),
    meal: source.meal,
    ...nutrientValues(source.per, energyUnit),
  }), validate);
  const [saveToFoods, setSaveToFoods] = useState(false);

  const preview = validate(values);
  const total = preview.ok ? sumNutrients([preview.value]) : null;

  async function submit(event) {
    event.preventDefault();
    const value = check();
    if (!value) return;
    if (editing) {
      if (await updateEntry(entry, value)) closeSheet();
      return;
    }
    const food = saveToFoods ? await saveFood({ name: value.name, serving: value.serving, per: value.per }) : null;
    if (await addEntry({ ...value, date: day, foodId: food?.id ?? null })) closeSheet();
  }

  function remove() {
    closeSheet();
    deleteEntry(entry);
  }

  return html`
    <${Sheet} label=${editing ? 'Edit entry' : 'Enter manually'} onClose=${closeSheet} focusField=${!editing}>
      <form ref=${formRef} class="sheet-form" style=${{ display: 'contents' }} onSubmit=${submit} novalidate>
        <div class="sheet__head">
          <h2 class="sheet__title">${editing ? 'Edit entry' : 'Enter manually'}</h2>
          ${editing && html`<button class="btn btn--danger" type="button" onClick=${remove}>Delete</button>`}
        </div>
        <div class="sheet__body form-grid">
          <${TextField} label="Name" placeholder="Chicken rice bowl" enterkeyhint="next" autofocus=${!editing && !source.name} ...${field('name')} />
          <${NutrientFields} field=${field} energyUnit=${energyUnit} />
          <div class="form-row">
            <${TextField} label="Serving" placeholder="1 bowl" ...${field('serving')} />
            <label class="field">
              <span class="field__label">Servings</span>
              <${Stepper} label="Servings" value=${values.servings} onChange=${(value) => update('servings', value)} />
            </label>
          </div>
          ${field('servings').error && html`<span class="field__error">${field('servings').error}</span>`}
          <${Segmented} label="Meal" value=${values.meal} onChange=${(meal) => update('meal', meal)}
            options=${MEALS.map((meal) => [meal, MEAL_LABELS[meal]])} />
          ${total && html`
            <p class="totals-preview num">
              Total ${fmt.energy(total.kcal, energyUnit)} · ${fmt.grams(total.protein)} protein · ${fmt.grams(total.carbs)} carbs · ${fmt.grams(total.fat)} fat
            </p>`}
          ${!editing && html`
            <label class="row-between">
              <span>Save to My foods</span>
              <input class="switch" type="checkbox" checked=${saveToFoods} onChange=${(event) => setSaveToFoods(event.currentTarget.checked)} />
            </label>`}
        </div>
        <div class="sheet__foot">
          <button class="btn btn--secondary" type="button" onClick=${closeSheet}>Cancel</button>
          <button class="btn btn--primary" type="submit">${editing ? 'Save' : 'Add'}</button>
        </div>
      </form>
    <//>`;
}
