import { html, useEffect, useRef } from '../../vendor/preact-htm.js';
import { parseAmount } from '../domain/nutrition.js';
import { Icon } from './icons.js';

// A bottom sheet on phones and a side panel on desktop. It's a real <dialog>,
// so focus stays inside, Esc closes it, and the page behind is hidden from
// screen readers without extra code. Only Esc and a tap on the backdrop call
// onClose; the 'close' event isn't used, because it fires late and could
// close the next sheet when one sheet replaces another.
//
// On open, <dialog> focuses its first input, which pops up the phone keyboard
// over Quick add's suggestions. So focus starts on the grabber instead, unless
// the sheet asks for a field with `autofocus` (manual entry does).
export function Sheet({ label, onClose, className = '', focusField = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.open && dialog.close();
  }, []);

  const onCancel = (event) => {
    event.preventDefault();
    onClose();
  };
  const onBackdrop = (event) => {
    if (event.target === ref.current) onClose();
  };

  return html`
    <dialog ref=${ref} class="sheet ${className}" aria-label=${label} onCancel=${onCancel} onClick=${onBackdrop}>
      <div class="sheet__grabber" aria-hidden="true" tabindex=${focusField ? undefined : -1} autofocus=${!focusField}></div>
      ${children}
    </dialog>`;
}

export function TextField({ label, name, error, inputRef, ...input }) {
  const errorId = `${name}-error`;
  return html`
    <label class="field ${error ? 'has-error' : ''}">
      <span class="field__label">${label}</span>
      <input ref=${inputRef} name=${name} autocomplete="off"
        aria-invalid=${error ? 'true' : undefined} aria-describedby=${error ? errorId : undefined} ...${input} />
      ${error && html`<span class="field__error" id=${errorId}>${error}</span>`}
    </label>`;
}

export function Segmented({ label, options, value, onChange }) {
  return html`
    <div class="segmented" role="group" aria-label=${label}>
      ${options.map(([optionValue, text]) => html`
        <button type="button" aria-pressed=${String(optionValue === value)} onClick=${() => onChange(optionValue)}>
          ${text}
        </button>`)}
    </div>`;
}

// Servings: type any amount, or step by half a serving.
export function Stepper({ label, value, onChange, step = 0.5 }) {
  const number = parseAmount(value);
  const current = Number.isFinite(number) ? number : 1;
  const set = (next) => onChange(String(Math.round(next * 100) / 100));
  return html`
    <div class="stepper" role="group" aria-label=${label}>
      <button type="button" aria-label="Less" disabled=${current <= step} onClick=${() => set(current - step)}>
        <${Icon} name="minus" size=${18} />
      </button>
      <input class="num" inputmode="decimal" aria-label=${label} value=${value}
        onInput=${(event) => onChange(event.currentTarget.value)} />
      <button type="button" aria-label="More" onClick=${() => set(current + step)}>
        <${Icon} name="plus" size=${18} />
      </button>
    </div>`;
}

export function Toast({ toast, onDismiss }) {
  const act = () => {
    onDismiss();
    toast.action();
  };
  return html`
    <div class="toast">
      <span>${toast.message}</span>
      ${toast.actionLabel && html`<button type="button" onClick=${act}>${toast.actionLabel}</button>`}
    </div>`;
}
