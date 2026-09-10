import { useEffect, useReducer } from '../../vendor/preact-htm.js';
import { createLocalRepository } from '../data/repository.js';
import { backupToJSON, entriesToCSV, parseBackup } from '../data/transfer.js';
import { shiftDay, toDateKey } from '../domain/dates.js';
import { LOOKBACK_DAYS } from '../domain/suggest.js';

// App state lives here rather than inside components. Screens read it with
// useStore() and change it only through the actions below, which save through
// the repository and then publish the new state to every subscriber.

export const repo = createLocalRepository();

const ROUTES = ['today', 'history', 'foods', 'settings'];
function routeFromHash() {
  const route = location.hash.replace(/^#\/?/, '');
  return ROUTES.includes(route) ? route : 'today';
}

let state = {
  status: 'loading', // 'loading' | 'ready' | 'error'
  route: routeFromHash(),
  today: toDateKey(new Date()),
  day: toDateKey(new Date()), // the day on screen
  dayEntries: [],
  recentEntries: [], // the last 90 days, for Quick add suggestions
  foods: [],
  settings: null,
  sheet: null, // { type: 'quickAdd' | 'entry' | 'food' | 'month', ...options }
  toast: null, // { id, message, actionLabel, action }
  slide: null, // 'prev' | 'next': direction of the last day change
  removingId: null, // entry fading out before it's deleted
};

const listeners = new Set();

function publish(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export const getState = () => state;

export function useStore() {
  const [, rerender] = useReducer((n) => n + 1, 0);
  const rendered = state;
  useEffect(() => {
    listeners.add(rerender);
    // Effects run after paint, and loading from localStorage is faster than
    // that, so catch up on anything published before we subscribed.
    if (state !== rendered) rerender();
    return () => listeners.delete(rerender);
  }, []);
  return state;
}

// ---------- Loading ----------

export async function init() {
  addEventListener('hashchange', () => publish({ route: routeFromHash(), sheet: null }));
  try {
    const [settings, foods, dayEntries] = await Promise.all([
      repo.getSettings(), repo.listFoods(), repo.getDay(state.day),
    ]);
    publish({ settings, foods, dayEntries, status: 'ready' });
    await loadRecent();
  } catch (error) {
    console.error(error);
    publish({ status: 'error' });
  }
}

async function loadRecent() {
  const days = await repo.getDays(shiftDay(state.today, -LOOKBACK_DAYS), state.today);
  publish({ recentEntries: Object.values(days).flat() });
}

async function refreshDays(dateKeys) {
  if (dateKeys.includes(state.day)) publish({ dayEntries: await repo.getDay(state.day) });
  await loadRecent();
}

// ---------- Navigation ----------

export function navigate(route) {
  // Tapping Today while already on it, but looking at a past day, goes back to today.
  if (route === 'today' && state.route === 'today') goToday();
  location.hash = `/${route}`;
}

export async function goToDay(day) {
  if (day > state.today || day === state.day) return;
  const dayEntries = await repo.getDay(day);
  publish({ day, dayEntries, slide: day < state.day ? 'prev' : 'next' });
}

export const stepDay = (days) => goToDay(shiftDay(state.day, days));
export const goToday = () => goToDay(state.today);

// A phone can keep the app open overnight. When it comes back into view on a
// new date, "today" moves forward and the app lands on it.
export async function syncToday() {
  const today = toDateKey(new Date());
  if (today === state.today) return;
  publish({ today });
  await goToDay(today);
  await loadRecent();
}

export const openSheet = (sheet) => publish({ sheet });
export const closeSheet = () => publish({ sheet: null });

// ---------- Entries, foods, settings ----------

export async function addEntry(draft) {
  const entry = await guard(() => repo.addEntry(draft));
  if (entry) await refreshDays([entry.date]);
  return entry;
}

export async function updateEntry(entry, patch) {
  const updated = await guard(() => repo.updateEntry(entry.date, entry.id, patch));
  if (updated) await refreshDays([entry.date, updated.date]);
  return updated;
}

// Fades the row out, deletes it, and offers Undo.
export async function deleteEntry(entry, { undo = true } = {}) {
  if (undo && entry.date === state.day) {
    publish({ removingId: entry.id });
    await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 0 : 200));
  }
  const removed = await guard(() => repo.deleteEntry(entry.date, entry.id));
  publish({ removingId: null });
  if (!removed) return;
  await refreshDays([entry.date]);
  if (undo) showToast(`Deleted ${removed.name}`, 'Undo', () => addEntry(removed));
}

export async function saveFood(draft) {
  const food = await guard(() => repo.saveFood(draft));
  if (food) publish({ foods: await repo.listFoods() });
  return food;
}

export async function archiveFood(food) {
  if (!(await guard(() => repo.archiveFood(food.id)))) return;
  publish({ foods: await repo.listFoods() });
  showToast(`Deleted ${food.name}`, 'Undo', () => saveFood({ ...food, archived: false }));
}

export async function saveSettings(patch) {
  const settings = await guard(() => repo.saveSettings(patch));
  if (settings) publish({ settings });
  return settings;
}

// ---------- Backup ----------

export async function exportBackup(kind) {
  const backup = await repo.exportAll();
  if (kind === 'csv') downloadText(`calorie-tracker-${state.today}.csv`, entriesToCSV(backup.entries), 'text/csv');
  else downloadText(`calorie-tracker-${state.today}.json`, backupToJSON(backup), 'application/json');
}

export async function importBackup(file) {
  const parsed = parseBackup(await file.text());
  if (!parsed.ok) return showToast(parsed.error);
  const result = await guard(() => repo.importAll(parsed.value));
  if (!result) return;
  const [settings, foods] = await Promise.all([repo.getSettings(), repo.listFoods()]);
  publish({ settings, foods });
  await refreshDays([state.day]);
  const skipped = result.entriesSkipped + parsed.value.dropped;
  showToast(`Imported ${result.entriesAdded} entries and ${result.foodsAdded} foods${skipped ? `. Skipped ${skipped} already here or unreadable.` : '.'}`);
}

function downloadText(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Feedback ----------

let toastTimer;
export function showToast(message, actionLabel, action) {
  clearTimeout(toastTimer);
  const toast = { id: Date.now(), message, actionLabel, action };
  publish({ toast });
  toastTimer = setTimeout(() => {
    if (state.toast?.id === toast.id) publish({ toast: null });
  }, 5000);
}

export const dismissToast = () => publish({ toast: null });

// Failed saves become a toast instead of an unhandled rejection.
async function guard(operation) {
  try {
    return await operation();
  } catch (error) {
    console.error(error);
    showToast(error.name === 'StorageError' ? error.message : 'Something went wrong. Try again.');
    return null;
  }
}

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
