# Gratitude

A small installable PWA for keeping what you're grateful for. It uses Moment's look and setup: the same WebGL water, tokens, fonts (PT Sans, Ovo), no build step, and GitHub Pages hosting.

- **Today** (`#/today`): write one thing and tap **Keep it** (or press Return; Shift+Return for a new line). Each entry raises the water a little. Once a day, one older entry floats up from before.
- **Look back** (`#/past`): everything, grouped by day. Tap an entry to edit or delete it.
- **Data**: IndexedDB on the device is the only copy. No backend, no network calls. **Export** (Look back) saves a JSON backup; **Import** merges one back in (matched by id, so importing twice adds nothing).

## Run locally

```bash
npm run serve
```

Then open <http://localhost:8090>. The service worker caches the app shell. After editing files, bump `CACHE_VERSION` in `web/sw.js`, or unregister the worker in DevTools.

## Deploy (GitHub Pages)

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. `.github/workflows/pages.yml` publishes `/web` on every push to `main`.

Bump `CACHE_VERSION` in `web/sw.js` on every deploy. The new version takes over the next time the app opens.

## Install on iPhone

Open the Pages URL in **Safari** → **Share** → **Add to Home Screen**. Entries live with the Home Screen app, separate from Safari. Export now and then to keep a backup.

## Layout

```
web/
  index.html, manifest.webmanifest, sw.js
  css/tokens.css    design tokens (from Moment)
  css/app.css       everything else
  js/app.js         screens, export/import, boot
  js/db.js          IndexedDB store
  js/dom.js         h(), bottom sheet
  js/water.js       the water layer (simplified from Moment's tide)
  js/gl.js, shaders.js   WebGL renderer + shaders, copied from Moment
scripts/make-icons.mjs   regenerates the PNG icons (Moment's wave with a sun)
```
