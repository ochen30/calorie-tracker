# Calorie Tracker

A fast, phone-first tracker for calories and protein. It's a static site with no build step and no backend: your log is saved in the browser on your device.

## Use it

Open **https://ochen30.github.io/calorie-tracker/** on your phone and add it to your home screen (Safari: Share → Add to Home Screen). It opens full screen and works offline.

Your data stays on the device. **Settings → Backup** exports everything as JSON, and **Import backup** merges it into another device without duplicating anything.

## Develop

```bash
npm run dev    # serves the folder at http://localhost:8000
npm test       # domain and storage tests (Node 20+)
```

The browser loads the modules directly, so serve the folder over http. Opening `index.html` as a file won't work.

## Structure

| Path | What's there |
| --- | --- |
| `src/domain/` | Pure logic: dates, nutrition math, input checks, Quick add ranking |
| `src/data/` | `repository.js` (the only code that touches storage) and backup import/export |
| `src/app/` | App state and actions (`store.js`), number formatting |
| `src/ui/` | Preact components, one file per screen or sheet |
| `styles/app.css` | Design tokens and all styles |
| `vendor/preact-htm.js` | Preact, its hooks, and htm in one 13 KB file |
| `sw.js` | Offline cache |

To move to a real backend, write another repository with the same async methods as `src/data/repository.js` and swap it in at the top of `src/app/store.js`.

## Publishing updates

Push to `main` and GitHub Pages redeploys. Installed copies pick up a new version on the launch after they've downloaded it. If you add a file under `src/`, add it to the list in `sw.js` so it's available offline.
