import { html, useRef } from '../../vendor/preact-htm.js';
import { formatDayTitle, formatShortDate } from '../domain/dates.js';
import { MEALS, MEAL_LABELS, entryNutrients, progress, sumNutrients } from '../domain/nutrition.js';
import * as fmt from '../app/format.js';
import { goToday, openSheet, stepDay, useStore } from '../app/store.js';
import { Icon } from './icons.js';

export function TodayScreen() {
  const { day, today, dayEntries, settings, slide, removingId } = useStore();
  const isToday = day === today;
  const swipe = useSwipe({ onPrev: () => stepDay(-1), onNext: () => !isToday && stepDay(1) });
  const shortDate = formatShortDate(day, today);

  return html`
    <header class="day-header">
      <button class="icon-button" type="button" aria-label="Choose a day" onClick=${() => openSheet({ type: 'month' })}>
        <${Icon} name="calendar" />
      </button>
      <div class="day-header__center">
        <button class="icon-button" type="button" aria-label="Previous day" onClick=${() => stepDay(-1)}>
          <${Icon} name="chevronLeft" />
        </button>
        <button class="day-title" type="button" aria-label="${isToday ? 'Today, ' : ''}${shortDate}. Choose a day"
          onClick=${() => openSheet({ type: 'month' })}>
          <strong>${formatDayTitle(day, today)}</strong>
          ${isToday && html`<span>${shortDate}</span>`}
        </button>
        <button class="icon-button" type="button" aria-label="Next day" disabled=${isToday} onClick=${() => stepDay(1)}>
          <${Icon} name="chevronRight" />
        </button>
      </div>
      ${isToday ? html`<span></span>` : html`<button class="today-pill" type="button" onClick=${goToday}>Today</button>`}
      <span class="visually-hidden" aria-live="polite">${isToday ? 'Today' : shortDate}</span>
    </header>

    <div class="day-body" key=${day} data-slide=${slide} ...${swipe}>
      ${dayEntries.length === 0 && !isToday
        ? html`<div class="empty-day"><p>Nothing logged on this day.</p></div>`
        : html`
          <${Summary} entries=${dayEntries} settings=${settings} />
          ${dayEntries.length === 0
            ? html`<${EmptyToday} />`
            : html`<${MealLog} entries=${dayEntries} unit=${settings.energyUnit} removingId=${removingId} />`}`}
    </div>`;
}

function Summary({ entries, settings }) {
  const total = sumNutrients(entries);
  const unit = settings.energyUnit;
  const macro = (label, grams, target) => (target
    ? `${label} ${fmt.gramsNumber(grams)} / ${fmt.int(target)} g`
    : `${label} ${fmt.grams(grams)}`);

  return html`
    <section class="summary" aria-label="Daily totals">
      <${Meter} label="Calories" unitLabel=${unit} consumed=${total.kcal} target=${settings.kcalTarget}
        format=${(kcal) => fmt.energyNumber(kcal, unit)} />
      <${Meter} label="Protein" unitLabel="g" protein consumed=${total.protein} target=${settings.proteinTarget}
        format=${fmt.gramsNumber} />
      <p class="macros-line num">${macro('Carbs', total.carbs, settings.carbsTarget)} · ${macro('Fat', total.fat, settings.fatTarget)}</p>
    </section>`;
}

// Remaining is the big number. Past the target the bar fills to a notch and
// continues in grey, and the label says "over": a fact, not a warning.
function Meter({ label, unitLabel, consumed, target, format, protein = false }) {
  const bar = progress(consumed, target);
  const over = bar.left < 0;
  const remaining = `${format(Math.abs(bar.left))}${unitLabel === 'g' ? ' g' : ''}`;
  const word = over ? 'over' : 'left';

  return html`
    <div class="meter ${protein ? 'meter--protein' : ''}">
      <div class="meter__top">
        <span>${label}</span>
        <span class="num">${format(consumed)} / ${format(target)} ${unitLabel}</span>
      </div>
      <div class="meter__hero num">${remaining} <span class="meter__word">${word}</span></div>
      <div class="bar" role="progressbar" aria-label=${label} aria-valuemin="0"
        aria-valuemax=${Math.round(target)} aria-valuenow=${Math.round(consumed)}
        aria-valuetext="${format(consumed)} of ${format(target)} ${unitLabel}, ${remaining} ${word}">
        <span class="bar__fill" style=${{ width: `${bar.fill * 100}%` }}></span>
        <span class="bar__over" style=${{ width: `${bar.over * 100}%` }}></span>
      </div>
    </div>`;
}

function MealLog({ entries, unit, removingId }) {
  return html`
    <section class="log" aria-label="Food log">
      ${MEALS.map((meal) => {
        const items = entries.filter((entry) => entry.meal === meal);
        const total = sumNutrients(items);
        return html`
          <section class="meal" key=${meal} aria-labelledby="meal-${meal}">
            <div class="meal__head">
              <h2 class="meal__name" id="meal-${meal}">${MEAL_LABELS[meal]}</h2>
              <span class="row-between" style=${{ minHeight: 0 }}>
                ${items.length > 0 && html`<span class="muted num">${fmt.energy(total.kcal, unit)} · ${fmt.grams(total.protein)}</span>`}
                <button class="meal__add" type="button" onClick=${() => openSheet({ type: 'quickAdd', meal })}>
                  <${Icon} name="plus" size=${16} />${items.length === 0 && ' Add'}
                  <span class="visually-hidden"> to ${MEAL_LABELS[meal]}</span>
                </button>
              </span>
            </div>
            ${items.length > 0 && html`
              <ul class="entries">
                ${items.map((entry) => html`
                  <${EntryRow} key=${entry.id} entry=${entry} unit=${unit} removing=${entry.id === removingId} />`)}
              </ul>`}
          </section>`;
      })}
    </section>`;
}

function EntryRow({ entry, unit, removing }) {
  const nutrients = entryNutrients(entry);
  const serving = fmt.servingText(entry);
  const justAdded = Date.now() - entry.createdAt < 1500;
  return html`
    <li class="entry-row ${removing ? 'is-removing' : ''} ${justAdded ? 'is-new' : ''}">
      <button class="entry" type="button" onClick=${() => openSheet({ type: 'entry', entry })}
        aria-label="Edit ${entry.name}, ${fmt.energy(nutrients.kcal, unit)}, ${fmt.grams(nutrients.protein)} protein">
        <span class="entry__name">${entry.name}${serving && html`<span class="entry__serving">${serving}</span>`}</span>
        <span class="entry__nums num">${fmt.energyNumber(nutrients.kcal, unit)} <span class="muted">· ${fmt.grams(nutrients.protein)}</span></span>
      </button>
    </li>`;
}

function EmptyToday() {
  return html`
    <div class="empty-day">
      <p>Nothing logged yet today.</p>
      <button class="btn btn--secondary" type="button" onClick=${() => openSheet({ type: 'quickAdd' })}>
        <${Icon} name="plus" size=${18} /> Add food
      </button>
    </div>`;
}

// A sideways swipe changes the day. It has to be at least 60px and mostly
// horizontal, so scrolling the log never triggers it.
function useSwipe({ onPrev, onNext }) {
  const start = useRef(null);
  return {
    onTouchStart(event) {
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
    },
    onTouchEnd(event) {
      if (!start.current) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
      if (dx > 0) onPrev();
      else onNext();
    },
  };
}
