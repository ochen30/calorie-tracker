import { html, render } from '../vendor/preact-htm.js';
import { init } from './app/store.js';
import { App } from './ui/app.js';

render(html`<${App} />`, document.getElementById('app'));
init();

// Offline support and home-screen install, on the published https site only
// (a cached copy would get in the way of local development).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
}

// Installed on a home screen, ask the browser not to clear stored data when
// space runs low.
if (matchMedia('(display-mode: standalone)').matches) navigator.storage?.persist?.();
