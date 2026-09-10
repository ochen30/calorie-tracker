import { html } from '../../vendor/preact-htm.js';
import { fromKcal, parseAmount, toKcal } from '../domain/nutrition.js';
import * as fmt from '../app/format.js';
import { exportBackup, importBackup, saveSettings, showToast, useStore } from '../app/store.js';
import { useForm } from './entry-form.js';
import { Icon } from './icons.js';
import { Segmented, TextField } from './primitives.js';

// Calories and protein are required; carbs and fat targets are optional.
function validateTargets(values, energyUnit) {
  const errors = {};
  const value = {};
  const check = (key, { required, max, toStored = (n) => n }) => {
    const amount = parseAmount(values[key]);
    if (amount === null) {
      if (required) errors[key] = 'Enter a target.';
      else value[key] = null;
    } else if (Number.isNaN(amount) || amount <= 0) errors[key] = 'Enter a number above 0.';
    else if (amount > max) errors[key] = `That's over ${fmt.int(max)}. Check for a typo.`;
    else value[key] = Math.round(toStored(amount));
  };
  check('kcalTarget', { required: true, max: fromKcal(20_000, energyUnit), toStored: (n) => toKcal(n, energyUnit) });
  check('proteinTarget', { required: true, max: 1_000 });
  check('carbsTarget', { required: false, max: 2_000 });
  check('fatTarget', { required: false, max: 1_000 });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

function targetValues(settings) {
  const text = (n) => (n == null ? '' : String(n));
  return {
    kcalTarget: settings.kcalTarget == null ? '' : String(Math.round(fromKcal(settings.kcalTarget, settings.energyUnit))),
    proteinTarget: text(settings.proteinTarget),
    carbsTarget: text(settings.carbsTarget),
    fatTarget: text(settings.fatTarget),
  };
}

function TargetFields({ field, energyUnit, optional }) {
  const numeric = { inputmode: 'numeric', enterkeyhint: 'next' };
  return html`
    <div class="form-row">
      <${TextField} label=${energyUnit === 'kJ' ? 'Energy (kJ)' : 'Calories (kcal)'} placeholder=${energyUnit === 'kJ' ? '12550' : '3000'} ...${field('kcalTarget')} ...${numeric} />
      <${TextField} label="Protein (g)" placeholder="180" ...${field('proteinTarget')} ...${numeric} />
    </div>
    ${optional && html`
      <div class="form-row">
        <${TextField} label="Carbs (g)" placeholder="Optional" ...${field('carbsTarget')} ...${numeric} />
        <${TextField} label="Fat (g)" placeholder="Optional" ...${field('fatTarget')} ...${numeric} />
      </div>`}`;
}

// First run: the two targets everything is measured against, then straight to Today.
export function Onboarding() {
  const { settings } = useStore();
  const { field, check, formRef } = useForm(() => targetValues(settings), (values) => validateTargets(values, settings.energyUnit));
  const submit = (event) => {
    event.preventDefault();
    const value = check();
    if (value) saveSettings(value);
  };
  return html`
    <main class="onboarding">
      <div class="form-grid" style=${{ gap: 'var(--s2)' }}>
        <h1>Set your daily targets</h1>
        <p>Progress is measured against these. You can change them any time in Settings.</p>
      </div>
      <form ref=${formRef} class="form-grid" onSubmit=${submit} novalidate>
        <${TargetFields} field=${field} energyUnit=${settings.energyUnit} />
        <button class="btn btn--primary btn--block" type="submit">Start logging</button>
      </form>
    </main>`;
}

export function SettingsScreen() {
  const { settings } = useStore();
  return html`
    <h1 class="screen-title">Settings</h1>

    <section class="group" aria-labelledby="targets-title">
      <h2 class="group__title" id="targets-title">Daily targets</h2>
      <${TargetsCard} key=${settings.energyUnit} settings=${settings} />
    </section>

    <section class="group" aria-labelledby="units-title">
      <h2 class="group__title" id="units-title">Units</h2>
      <div class="card">
        <div class="row-between">
          <span>Energy</span>
          <${Segmented} label="Energy unit" value=${settings.energyUnit} options=${[['kcal', 'kcal'], ['kJ', 'kJ']]}
            onChange=${(energyUnit) => saveSettings({ energyUnit })} />
        </div>
        <div class="row-between">
          <span>Serving weight</span>
          <${Segmented} label="Weight unit" value=${settings.weightUnit} options=${[['g', 'g'], ['oz', 'oz']]}
            onChange=${(weightUnit) => saveSettings({ weightUnit })} />
        </div>
      </div>
    </section>

    <section class="group" aria-labelledby="appearance-title">
      <h2 class="group__title" id="appearance-title">Appearance</h2>
      <div class="card">
        <${Segmented} label="Theme" value=${settings.theme} onChange=${(theme) => saveSettings({ theme })}
          options=${[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} />
      </div>
    </section>

    <section class="group" aria-labelledby="data-title">
      <h2 class="group__title" id="data-title">Your data</h2>
      <div class="card">
        <p class="totals-preview">Your log is stored on this device only. Export a backup now and then, and import it to move your log to another device.</p>
        <div class="form-row">
          <button class="btn btn--secondary" type="button" onClick=${() => exportBackup('json')}>
            <${Icon} name="download" size=${18} /> Backup
          </button>
          <button class="btn btn--secondary" type="button" onClick=${() => exportBackup('csv')}>
            <${Icon} name="download" size=${18} /> CSV
          </button>
        </div>
        <label class="btn btn--secondary btn--block file-button">
          <${Icon} name="upload" size=${18} /> Import backup
          <input class="visually-hidden" type="file" accept="application/json,.json"
            onChange=${(event) => {
              const [file] = event.currentTarget.files;
              if (file) importBackup(file);
              event.currentTarget.value = '';
            }} />
        </label>
      </div>
    </section>`;
}

function TargetsCard({ settings }) {
  const { field, check, formRef } = useForm(() => targetValues(settings), (values) => validateTargets(values, settings.energyUnit));
  const submit = async (event) => {
    event.preventDefault();
    const value = check();
    if (value && (await saveSettings(value))) showToast('Targets saved');
  };
  return html`
    <form ref=${formRef} class="card" onSubmit=${submit} novalidate>
      <${TargetFields} field=${field} energyUnit=${settings.energyUnit} optional />
      <button class="btn btn--primary" type="submit">Save targets</button>
    </form>`;
}
