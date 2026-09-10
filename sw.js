// Serves the app from a cache so it opens instantly and works offline, and
// refreshes that cache from the network in the background. A newly published
// version shows up on the launch after it's first fetched.
const CACHE = 'calorie-tracker-v1';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './styles/app.css', './vendor/preact-htm.js',
  './src/main.js', './src/app/store.js', './src/app/format.js',
  './src/data/repository.js', './src/data/transfer.js',
  './src/domain/dates.js', './src/domain/nutrition.js', './src/domain/suggest.js',
  './src/ui/app.js', './src/ui/icons.js', './src/ui/primitives.js', './src/ui/today.js', './src/ui/quick-add.js',
  './src/ui/entry-form.js', './src/ui/foods.js', './src/ui/month-picker.js', './src/ui/history.js', './src/ui/settings.js',
  './icons/icon.svg', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  // A navigation Request can't be re-sent with options, so refetch it by URL.
  const fresh = fetch(request.mode === 'navigate' ? request.url : request, { cache: 'no-cache' })
    .then(async (response) => {
      if (response.ok) await (await caches.open(CACHE)).put(request, response.clone());
      return response;
    });
  event.waitUntil(fresh.catch(() => {}));
  event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached ?? fresh));
});
