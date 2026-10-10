# Gratitude

Moment's sister app: a small installable PWA for keeping what you're grateful for. It shares Moment's repo, look (WebGL water, tokens, PT Sans and Ovo), hosting and backend. Live at <https://carbonsf.github.io/moment/gratitude/>. See DD-090 in `../DESIGN_DECISIONS.md`.

- **Today** (`#/today`): opens with the cursor in the box. Write one thing and tap **Keep it** (or press Return; Shift+Return for a new line). Each entry raises the water a little. **Prompt me** shows one of 20 prompts; **Another** moves to the next. Once a day, one older entry floats up from before.
- **Water**: Moment's three styles take turns, one per day (glass, storm, boil). `?water=<id>` overrides it.
- **Look back** (`#/past`): everything, grouped by day. Tap an entry to edit or delete it.
- **Data**: IndexedDB on the device is the source of truth. Entries sync, end-to-end encrypted, through Moment's Worker and D1 (store `gratitude`, same protocol and crypto as Moment). Deletes are tombstones so they sync too.
- **Backup link** (Look back): opening or pasting it on another device brings everything back. Pasting Moment's restore link instead makes both apps share one identity. **Export** / **Import** still work as a plain JSON backup.

## Run locally

```bash
npm run serve
```

Then open <http://localhost:8090>. The service worker caches the app shell. After editing files, bump `CACHE_VERSION` in `web/sw.js`, or unregister the worker in DevTools.

## Deploy

Pushing to `main` in the Moment repo deploys both apps: `.github/workflows/pages.yml` publishes `web/` at `/moment/` and `gratitude/web/` at `/moment/gratitude/`. Bump `CACHE_VERSION` in `gratitude/web/sw.js` on every deploy; the new version takes over the next time the app opens. `test/gratitude.test.js` checks the precache list and CSP.

Sync only works from `https://carbonsf.github.io` (the Worker's `ALLOWED_ORIGIN`), so local runs stay offline.

## Install on iPhone

Open <https://carbonsf.github.io/moment/gratitude/> in **Safari** → **Share** → **Add to Home Screen**. Entries live with the Home Screen app, separate from Safari and from Moment.

## Layout

```
web/
  index.html, manifest.webmanifest, sw.js
  css/tokens.css    design tokens (from Moment)
  css/app.css       everything else
  js/app.js         screens, export/import, boot
  js/db.js          IndexedDB: entries, meta (identity, cursor), sync queue
  js/sync.js        sync with Moment's Worker, backup link
  js/crypto.js      copied from Moment's lib/crypto.js
  js/dom.js         h(), bottom sheet
  js/water.js       the water layer (simplified from Moment's tide)
  js/gl.js, shaders.js   WebGL renderer + shaders, copied from Moment
scripts/make-icons.mjs   regenerates the PNG icons (Moment's wave with a sun)
```
