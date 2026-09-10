import { isDateKey } from '../domain/dates.js';
import { MEALS, NUTRIENTS } from '../domain/nutrition.js';

// The only module that knows where data lives. Every method is async even
// though localStorage answers instantly: a server-backed repository can then
// replace this one without changing any code that calls it.

export const DEFAULT_SETTINGS = Object.freeze({
  kcalTarget: null, // null until first-run setup
  proteinTarget: null,
  carbsTarget: null, // optional
  fatTarget: null, // optional
  energyUnit: 'kcal', // 'kcal' | 'kJ'
  weightUnit: 'g', // 'g' | 'oz'
  theme: 'system', // 'system' | 'light' | 'dark'
});

const TARGET_KEYS = ['kcalTarget', 'proteinTarget', 'carbsTarget', 'fatTarget'];

export class StorageError extends Error {
  name = 'StorageError';
}

export function createLocalRepository({
  storage = globalThis.localStorage,
  prefix = 'ct:v2:',
  now = () => Date.now(),
  makeId = randomId,
} = {}) {
  const settingsKey = `${prefix}settings`;
  const foodsKey = `${prefix}foods`;
  const dayPrefix = `${prefix}day:`;

  function read(key, fallback) {
    const raw = storage.getItem(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      // Set the unreadable text aside so nothing is lost, then carry on without it.
      try {
        storage.setItem(`${key}:unreadable:${now()}`, raw);
        storage.removeItem(key);
      } catch {
        // Storage is full: leave the original where it is.
      }
      return fallback;
    }
  }

  function write(key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
    } catch (cause) {
      throw new StorageError('Could not save. Storage may be full or blocked.', { cause });
    }
  }

  const readDay = (dateKey) => read(dayPrefix + dateKey, []);
  const readFoods = () => read(foodsKey, []);

  function writeDay(dateKey, entries) {
    if (entries.length === 0) storage.removeItem(dayPrefix + dateKey);
    else write(dayPrefix + dateKey, [...entries].sort(byCreatedAt));
  }

  function loggedDays() {
    const days = [];
    for (let i = 0; i < storage.length; i++) {
      const dateKey = storage.key(i)?.startsWith(dayPrefix) ? storage.key(i).slice(dayPrefix.length) : null;
      if (isDateKey(dateKey)) days.push(dateKey);
    }
    return days.sort();
  }

  // ---------- Settings ----------

  async function getSettings() {
    return { ...DEFAULT_SETTINGS, ...read(settingsKey, {}) };
  }

  // Read and write with no await in between, so two quick saves (say, a unit
  // and a theme) can't both start from the old settings and undo each other.
  async function saveSettings(patch) {
    const next = { ...DEFAULT_SETTINGS, ...read(settingsKey, {}), ...patch };
    write(settingsKey, next);
    return next;
  }

  // ---------- Entries ----------

  async function getDay(dateKey) {
    assertDateKey(dateKey);
    return readDay(dateKey);
  }

  // Logged days between two dates (inclusive), as { "2026-09-10": [entries] }.
  async function getDays(fromKey, toKey) {
    const result = {};
    for (const dateKey of loggedDays()) {
      if (dateKey >= fromKey && dateKey <= toKey) result[dateKey] = readDay(dateKey);
    }
    return result;
  }

  // Also undoes a delete: pass the removed entry back and it keeps its id and place.
  async function addEntry(draft) {
    assertDateKey(draft.date);
    const stamp = now();
    const entry = toEntry({ ...draft, id: draft.id ?? makeId(), createdAt: draft.createdAt ?? stamp, updatedAt: stamp });
    writeDay(entry.date, [...readDay(entry.date), entry]);
    return entry;
  }

  // `patch` may include a new `date`, which moves the entry to that day.
  async function updateEntry(dateKey, id, patch) {
    const entries = readDay(dateKey);
    const current = entries.find((entry) => entry.id === id);
    if (!current) throw new StorageError('That entry no longer exists.');
    const updated = toEntry({ ...current, ...patch, id, createdAt: current.createdAt, updatedAt: now() });
    assertDateKey(updated.date);

    const rest = entries.filter((entry) => entry.id !== id);
    if (updated.date === dateKey) {
      writeDay(dateKey, [...rest, updated]);
    } else {
      // Write the new day first, so a failed save duplicates the entry rather than losing it.
      writeDay(updated.date, [...readDay(updated.date), updated]);
      writeDay(dateKey, rest);
    }
    return updated;
  }

  // Returns the removed entry so the UI can offer Undo.
  async function deleteEntry(dateKey, id) {
    const entries = readDay(dateKey);
    const removed = entries.find((entry) => entry.id === id);
    if (!removed) return null;
    writeDay(dateKey, entries.filter((entry) => entry.id !== id));
    return removed;
  }

  // ---------- Foods ----------

  async function listFoods({ includeArchived = false } = {}) {
    return readFoods()
      .filter((food) => includeArchived || !food.archived)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Creates the food when it has no id, otherwise updates it.
  async function saveFood(draft) {
    const foods = readFoods();
    const stamp = now();
    const index = draft.id ? foods.findIndex((food) => food.id === draft.id) : -1;
    const existing = index === -1 ? {} : foods[index];
    const food = toFood({
      ...existing,
      ...draft,
      id: draft.id ?? makeId(),
      createdAt: existing.createdAt ?? stamp,
      updatedAt: stamp,
    });
    if (index === -1) foods.push(food);
    else foods[index] = food;
    write(foodsKey, foods);
    return food;
  }

  // Foods are hidden rather than deleted, so entries that point at them keep working.
  async function archiveFood(id) {
    const foods = readFoods();
    const food = foods.find((item) => item.id === id);
    if (!food) return null;
    food.archived = true;
    food.updatedAt = now();
    write(foodsKey, foods);
    return food;
  }

  // ---------- Backup ----------

  async function exportAll() {
    return {
      app: 'calorie-tracker',
      schema: 2,
      exportedAt: new Date(now()).toISOString(),
      settings: await getSettings(),
      foods: readFoods(),
      entries: loggedDays().flatMap((dateKey) => readDay(dateKey)),
    };
  }

  // Merges a parsed backup (see parseBackup in transfer.js). Nothing already
  // here is overwritten: entries and foods already present (same id) are
  // skipped, and settings only fill in targets you haven't set yet.
  async function importAll({ settings = {}, foods = [], entries = [] }) {
    const savedFoods = readFoods();
    const knownFoods = new Set(savedFoods.map((food) => food.id));
    let foodsAdded = 0;
    for (const food of foods) {
      if (knownFoods.has(food.id)) continue;
      savedFoods.push(toFood(food));
      knownFoods.add(food.id);
      foodsAdded += 1;
    }
    if (foodsAdded > 0) write(foodsKey, savedFoods);

    const incomingByDay = new Map();
    for (const entry of entries) {
      if (!incomingByDay.has(entry.date)) incomingByDay.set(entry.date, []);
      incomingByDay.get(entry.date).push(entry);
    }
    let entriesAdded = 0;
    for (const [dateKey, incoming] of incomingByDay) {
      const day = readDay(dateKey);
      const knownIds = new Set(day.map((entry) => entry.id));
      const fresh = [];
      for (const entry of incoming) {
        if (knownIds.has(entry.id)) continue;
        knownIds.add(entry.id);
        fresh.push(toEntry(entry));
      }
      if (fresh.length > 0) writeDay(dateKey, [...day, ...fresh]);
      entriesAdded += fresh.length;
    }

    const current = await getSettings();
    const missingTargets = {};
    for (const key of TARGET_KEYS) {
      if (current[key] == null && settings[key] != null) missingTargets[key] = settings[key];
    }
    if (Object.keys(missingTargets).length > 0) await saveSettings(missingTargets);

    return { entriesAdded, entriesSkipped: entries.length - entriesAdded, foodsAdded };
  }

  return {
    getSettings, saveSettings,
    getDay, getDays, addEntry, updateEntry, deleteEntry,
    listFoods, saveFood, archiveFood,
    exportAll, importAll,
  };
}

function toEntry(entry) {
  if (!MEALS.includes(entry.meal)) throw new StorageError(`Unknown meal: ${entry.meal}`);
  return {
    id: String(entry.id),
    date: entry.date,
    meal: entry.meal,
    name: String(entry.name).trim(),
    serving: entry.serving ?? null,
    servings: Number(entry.servings ?? 1),
    per: pickNutrients(entry.per),
    foodId: entry.foodId ?? null,
    createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : 0,
    updatedAt: entry.updatedAt ?? entry.createdAt ?? 0,
  };
}

function toFood(food) {
  return {
    id: String(food.id),
    name: String(food.name).trim(),
    serving: food.serving ?? null,
    grams: food.grams ?? null,
    per: pickNutrients(food.per),
    archived: Boolean(food.archived),
    createdAt: food.createdAt ?? 0,
    updatedAt: food.updatedAt ?? food.createdAt ?? 0,
  };
}

function pickNutrients(per = {}) {
  return Object.fromEntries(NUTRIENTS.map((key) => [key, per[key] ?? null]));
}

const byCreatedAt = (a, b) => a.createdAt - b.createdAt;

function assertDateKey(value) {
  if (!isDateKey(value)) throw new StorageError(`Not a date key: ${value}`);
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
