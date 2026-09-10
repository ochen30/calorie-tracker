import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { formatMonth, formatShortDate, formatWeekRange, shiftDay, startOfWeek, weekdayOf } from '../domain/dates.js';
import { sumNutrients } from '../domain/nutrition.js';
import * as fmt from '../app/format.js';
import { goToDay, navigate, repo, useStore } from '../app/store.js';
import { Icon } from './icons.js';
import { Segmented } from './primitives.js';

function periodFor(range, anchor) {
  if (range === 'week') {
    const start = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
    return { days, label: formatWeekRange(start) };
  }
  const year = Number(anchor.slice(0, 4));
  const index = Number(anchor.slice(5, 7)) - 1;
  const count = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
  const start = `${anchor.slice(0, 7)}-01`;
  return { days: Array.from({ length: count }, (_, i) => shiftDay(start, i)), label: formatMonth(year, index) };
}

export function HistoryScreen() {
  const { today, settings } = useStore();
  const [range, setRange] = useState('week');
  const [anchor, setAnchor] = useState(today); // any day inside the period on screen
  const [data, setData] = useState({});
  const { days, label } = periodFor(range, anchor);
  const start = days[0];
  const end = days[days.length - 1];

  useEffect(() => {
    let current = true;
    repo.getDays(start, end).then((result) => current && setData(result));
    return () => {
      current = false;
    };
  }, [start, end]);

  const totals = days.map((key) => (data[key]?.length ? sumNutrients(data[key]) : null));
  const logged = totals.filter(Boolean);
  const average = (key) => (logged.length ? logged.reduce((sum, total) => sum + total[key], 0) / logged.length : null);
  const met = logged.filter((total) => total.protein >= settings.proteinTarget).length;
  const elapsed = days.filter((key) => key <= today).length;
  const unit = settings.energyUnit;
  const openDay = (key) => {
    goToDay(key);
    navigate('today');
  };
  const label1 = (key, i) => (range === 'week' ? weekdayOf(key).slice(0, 1) : i % 7 === 0 ? Number(key.slice(8)) : '');

  return html`
    <h1 class="screen-title">History</h1>
    <${Segmented} label="Range" value=${range} onChange=${setRange} options=${[['week', 'Week'], ['month', 'Month']]} />
    <div class="period-nav">
      <button class="icon-button" type="button" aria-label="Previous ${range}" onClick=${() => setAnchor(shiftDay(start, -1))}>
        <${Icon} name="chevronLeft" />
      </button>
      <strong aria-live="polite">${label}</strong>
      <button class="icon-button" type="button" aria-label="Next ${range}" disabled=${end >= today} onClick=${() => setAnchor(shiftDay(end, 1))}>
        <${Icon} name="chevronRight" />
      </button>
    </div>

    <${BarChart} kind="kcal" title="Calories" days=${days} today=${today} labelFor=${label1} onPick=${openDay}
      values=${totals.map((total) => total?.kcal ?? null)} target=${settings.kcalTarget} average=${average('kcal')}
      format=${(kcal) => fmt.energyNumber(kcal, unit)} unitLabel=${unit} />
    <${BarChart} kind="protein" title="Protein" days=${days} today=${today} labelFor=${label1} onPick=${openDay}
      values=${totals.map((total) => total?.protein ?? null)} target=${settings.proteinTarget} average=${average('protein')}
      format=${fmt.gramsNumber} unitLabel="g" />

    <p class="stat-line num">
      ${logged.length} of ${elapsed} days logged${logged.length ? ` · protein target met on ${met} of ${logged.length}` : ''}
    </p>`;
}

// Plain HTML bars, so every day is a real button that opens it.
function BarChart({ kind, title, days, today, values, target, average, format, unitLabel, labelFor, onPick }) {
  const top = Math.max(target, ...values.filter((value) => value != null)) * 1.1 || 1;
  return html`
    <section class="chart-card chart--${kind}" aria-label=${title}>
      <div class="chart-card__head">
        <h2 class="chart-card__title">${title}</h2>
        <span class="muted num">${average == null ? 'Nothing logged' : `Avg ${format(average)} ${unitLabel} · target ${format(target)}`}</span>
      </div>
      <div class="bars">
        <div class="bars__target" style=${{ bottom: `${(target / top) * 100}%` }} aria-hidden="true"></div>
        ${days.map((key, i) => {
          const value = values[i];
          return html`
            <button type="button" class="bars__col ${value == null ? 'is-empty' : ''}" disabled=${key > today}
              aria-label="${formatShortDate(key, today)}: ${value == null ? 'nothing logged' : `${format(value)} ${unitLabel}`}"
              onClick=${() => onPick(key)}>
              <span class="bars__fill" style=${{ height: value == null ? '0' : `${(value / top) * 100}%` }}></span>
            </button>`;
        })}
      </div>
      <div class="bar-labels num" aria-hidden="true">${days.map((key, i) => html`<span>${labelFor(key, i)}</span>`)}</div>
    </section>`;
}
