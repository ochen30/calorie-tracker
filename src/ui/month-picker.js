import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { formatMonth, formatShortDate, monthWeeks } from '../domain/dates.js';
import { sumNutrients } from '../domain/nutrition.js';
import { closeSheet, goToDay, repo, useStore } from '../app/store.js';
import { Icon } from './icons.js';
import { Sheet } from './primitives.js';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const STATUS_LABEL = { met: 'protein target met', logged: 'logged, protein target not met', none: 'nothing logged' };

// Every week is a row of marks ending in "met / logged", so whether a week
// was consistent shows without opening a single day.
export function MonthPickerSheet() {
  const { day, today, settings } = useStore();
  const [month, setMonth] = useState({ year: Number(day.slice(0, 4)), index: Number(day.slice(5, 7)) - 1 });
  const [days, setDays] = useState({});
  const weeks = monthWeeks(month.year, month.index);
  const first = weeks[0].find(Boolean);
  const last = weeks[weeks.length - 1].filter(Boolean).pop();

  useEffect(() => {
    let current = true;
    repo.getDays(first, last).then((result) => current && setDays(result));
    return () => {
      current = false;
    };
  }, [first, last]);

  const statusOf = (key) => {
    const entries = days[key];
    if (!entries?.length) return 'none';
    return sumNutrients(entries).protein >= settings.proteinTarget ? 'met' : 'logged';
  };
  const isCurrentMonth = `${month.year}-${String(month.index + 1).padStart(2, '0')}` === today.slice(0, 7);
  const shiftMonth = (delta) => setMonth(({ year, index }) => {
    const date = new Date(Date.UTC(year, index + delta, 1));
    return { year: date.getUTCFullYear(), index: date.getUTCMonth() };
  });
  const pick = (key) => {
    closeSheet();
    goToDay(key);
  };

  return html`
    <${Sheet} label="Choose a day" onClose=${closeSheet}>
      <div class="sheet__body" style=${{ paddingTop: 'var(--s3)' }}>
        <div class="month-nav">
          <button class="icon-button" type="button" aria-label="Previous month" onClick=${() => shiftMonth(-1)}>
            <${Icon} name="chevronLeft" />
          </button>
          <strong aria-live="polite">${formatMonth(month.year, month.index)}</strong>
          <button class="icon-button" type="button" aria-label="Next month" disabled=${isCurrentMonth} onClick=${() => shiftMonth(1)}>
            <${Icon} name="chevronRight" />
          </button>
        </div>

        <div class="month-grid">
          ${WEEKDAY_INITIALS.map((initial) => html`<span class="month-grid__dow" aria-hidden="true">${initial}</span>`)}
          <span aria-hidden="true"></span>
          ${weeks.map((week) => {
            let met = 0;
            let logged = 0;
            const cells = week.map((key) => {
              if (!key) return html`<span></span>`;
              const status = statusOf(key);
              // Today still in progress doesn't count against the week.
              if (status !== 'none' && (key !== today || status === 'met')) {
                logged += 1;
                if (status === 'met') met += 1;
              }
              return html`
                <button type="button" onClick=${() => pick(key)} disabled=${key > today}
                  class="day-cell ${key === today ? 'is-today' : ''} ${key === day ? 'is-selected' : ''}"
                  aria-current=${key === day ? 'date' : undefined}
                  aria-label="${formatShortDate(key, today)}, ${STATUS_LABEL[status]}">
                  <span class="day-cell__num num">${Number(key.slice(8))}</span>
                  <span class="dot ${status === 'met' ? 'dot--met' : status === 'logged' ? 'dot--logged' : ''}" aria-hidden="true"></span>
                </button>`;
            });
            return [
              ...cells,
              html`<span class="week-count num" aria-label=${logged ? `Protein target met on ${met} of ${logged} logged days` : undefined}>
                ${logged ? `${met}/${logged}` : ''}
              </span>`,
            ];
          })}
        </div>

        <div class="legend">
          <span><span class="dot dot--met"></span>Protein target met</span>
          <span><span class="dot dot--logged"></span>Logged, target not met</span>
          <span><span class="num">4/6</span>Target met on 4 of 6 logged days that week</span>
        </div>
      </div>
    <//>`;
}
