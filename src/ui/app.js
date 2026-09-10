import { html, useEffect } from '../../vendor/preact-htm.js';
import {
  dismissToast, getState, goToday, navigate, openSheet, stepDay, syncToday, useStore,
} from '../app/store.js';
import { EntryFormSheet } from './entry-form.js';
import { FoodFormSheet, FoodsScreen } from './foods.js';
import { HistoryScreen } from './history.js';
import { Icon } from './icons.js';
import { MonthPickerSheet } from './month-picker.js';
import { Toast } from './primitives.js';
import { QuickAddSheet } from './quick-add.js';
import { Onboarding, SettingsScreen } from './settings.js';
import { TodayScreen } from './today.js';

const SCREENS = { today: TodayScreen, history: HistoryScreen, foods: FoodsScreen, settings: SettingsScreen };
const SHEETS = { quickAdd: QuickAddSheet, entry: EntryFormSheet, food: FoodFormSheet, month: MonthPickerSheet };
const THEME_COLORS = { light: '#F4F4F2', dark: '#0B0B0C' };

export function App() {
  const { status, settings, route, sheet, toast } = useStore();
  useTheme(settings?.theme);
  useShortcuts();
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && syncToday();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (status === 'loading') return null;
  if (status === 'error') {
    return html`
      <main class="onboarding">
        <h1>Your log couldn't be opened</h1>
        <p>Your browser may be blocking storage for this site. Make sure it isn't a private window, then reload.</p>
      </main>`;
  }
  if (settings.kcalTarget == null || settings.proteinTarget == null) return html`<${Onboarding} />`;

  const Screen = SCREENS[route];
  const SheetView = sheet && SHEETS[sheet.type];
  const tab = (id, label) => html`
    <a class="tab" href="#/${id}" aria-current=${route === id ? 'page' : undefined}
      onClick=${(event) => {
        event.preventDefault();
        navigate(id);
      }}>
      <${Icon} name=${id} /><span>${label}</span>
    </a>`;

  return html`
    <div class="shell">
      <main class="main"><${Screen} /></main>
      <nav class="tabbar" aria-label="Main">
        ${tab('today', 'Today')}
        ${tab('history', 'History')}
        <button class="add-button" type="button" onClick=${() => openSheet({ type: 'quickAdd' })}>
          <${Icon} name="plus" size=${24} /><span class="add-label">Add food</span>
        </button>
        ${tab('foods', 'Foods')}
        ${tab('settings', 'Settings')}
      </nav>
      ${SheetView && html`<${SheetView} key=${`${sheet.type}:${sheet.entry?.id ?? sheet.food?.id ?? ''}`} ...${sheet} />`}
      <div aria-live="polite">${toast && html`<${Toast} key=${toast.id} toast=${toast} onDismiss=${dismissToast} />`}</div>
    </div>`;
}

// Applies the Settings theme and keeps the phone's status bar colour in step.
function useTheme(theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (!theme || theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      const systemColor = meta.media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light;
      meta.content = THEME_COLORS[theme] ?? systemColor;
    }
  }, [theme]);
}

// Keyboard on desktop: A or / to add, ← → to change day, T for today.
// Esc is handled by each sheet's <dialog>.
function useShortcuts() {
  useEffect(() => {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (event.target.closest?.('input, textarea, select, [contenteditable]')) return;
      const { sheet, route } = getState();
      if (sheet) return;
      const key = event.key.toLowerCase();
      if (key === 'a' || key === '/') {
        event.preventDefault();
        openSheet({ type: 'quickAdd', focusSearch: key === '/' });
      } else if (route === 'today' && key === 'arrowleft') stepDay(-1);
      else if (route === 'today' && key === 'arrowright') stepDay(1);
      else if (route === 'today' && key === 't') goToday();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
}
