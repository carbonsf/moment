# Moment

An installable PWA that helps one person get through a hard moment, or a hard day, with cravings.
Built from `MOMENT_SPEC.md`. Design choices are logged in `DESIGN_DECISIONS.md`.

- **Frontend** (`/web`): static HTML/CSS/vanilla ES modules, no build step, no runtime dependencies. Hosted on GitHub Pages.
- **Backend** (`/worker`): one Cloudflare Worker + D1 on the free plan. Stores only ciphertext and check-in times; sends Web Push check-ins from a per-minute cron.
- **Data**: IndexedDB on the device is the source of truth. Sync is end-to-end encrypted (AES-GCM, key derived from a secret that never leaves the device except in your restore link).

The app works fully offline with no backend at all. Sync and push switch on once `web/js/config.js` is filled in (DD-037).

---

## Run locally

```bash
npm run serve
```

Then open <http://localhost:8080>. The service worker caches the app shell; after editing files, unregister it in DevTools (Application → Service workers) or bump `CACHE_VERSION` in `web/sw.js`.

## Tests

Node 22.13+ (uses global WebCrypto and `node:sqlite` for the D1 shim).

```bash
npm test
```

| File | Covers |
|---|---|
| `test/metrics.test.js` | §10 metrics, thresholds, rounding, `used` excluded from aggregates |
| `test/schedule.test.js` | §7.1 plan rules, quiet hours, dedupe, evening skip, DST (America/Los_Angeles), time zone change |
| `test/sync.test.js` | LWW, tie-break, cursor handling, queue clearing, chunking |
| `test/crypto.test.js` | HKDF determinism, AES-GCM round trip, base64url, restore tokens |
| `test/worker.test.js` | Worker handlers on an in-memory D1 shim: auth, sync, check-ins, cron transitions, 410 cleanup, Web Push encryption (RFC 8291 vector) |
| `test/web.test.js` | Precache completeness, CSP/no inline code, copy rules (§12) |

---

## Deploy

### 1. Frontend → GitHub Pages

1. Push this repo to GitHub.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. `.github/workflows/pages.yml` runs the tests and publishes `/web` on every push to `main`.

The site is served at `https://<user>.github.io/<repo>/`. All asset URLs are relative, so the subpath works.

### 2. Backend → Cloudflare Worker + D1

From `/worker`:

```bash
npm install
```

```bash
npx wrangler login
```

Create the database and paste the printed `database_id` into `worker/wrangler.toml`:

```bash
npx wrangler d1 create moment
```

```bash
npm run db:init
```

Generate VAPID keys. The script prints a private JWK (for the Worker) and a public key (for the app):

```bash
npm run vapid
```

Set the Worker secrets (paste the JWK JSON when prompted; the subject is a `mailto:` you control):

```bash
npx wrangler secret put VAPID_PRIVATE_JWK
```

```bash
npx wrangler secret put VAPID_SUBJECT
```

Set `ALLOWED_ORIGIN` in `worker/wrangler.toml` to your Pages origin, e.g. `https://<user>.github.io` (origin only, no path). Then:

```bash
npm run deploy
```

Optional: `.github/workflows/worker.yml` deploys on push when a `CLOUDFLARE_API_TOKEN` repository secret exists.

### 3. Connect the app to the Worker

Edit `web/js/config.js`:

- `API_BASE` → your Worker URL, e.g. `https://moment-api.<account>.workers.dev`
- `VAPID_PUBLIC_KEY` → the public key from `npm run vapid`

Edit the CSP in `web/index.html` so `connect-src` lists the same Worker URL. Bump `APP_VERSION` in `config.js` and `CACHE_VERSION` in `sw.js` together on every deploy (a test checks they match).

---

## Install on iPhone (iOS 16.4+)

1. Open the Pages URL in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Open Moment from the Home Screen. Data lives with the Home Screen app, separate from Safari.

Notifications are only requested after a moment, when you tap **Yes**, **In 10 min**, or **Check on me later**. If they're off, check-ins appear when you open the app.

## Your data

- **Restore link** (Settings → Your data): `…/#/restore/<deviceId>.<secret>`. Anyone with it can read your data. On iPhone, copy it, open Moment from the Home Screen, and paste it into the field in Settings.
- If you lose the link and the device, the server copy can't be decrypted by anyone.
- **Export** writes plain JSON of everything except the secret. It isn't encrypted.
- **Delete everything** wipes the device, unsubscribes push, and deletes all server rows. If you're offline, the server delete retries next time the app opens.

Verify a server delete with:

```bash
npx wrangler d1 execute moment --remote --command "SELECT COUNT(*) FROM records"
```

---

## Layout

```
web/            static app (deployed)
  css/          tokens.css (all design tokens), base.css, components.css
  js/           app.js (boot, router outlet), config.js, strings.js (every user-facing string),
                router.js, db.js (IndexedDB + migrations), state.js (moment state, event bus)
  js/lib/       pure, tested: metrics, schedule, crypto, sync, time
  js/ui/        wave (canvas), slider, chips, sheet, chart, icons, dom
  js/screens/   one module per route
  js/services/  api, sync runner, check-ins, push, identity, guidance, feedback/support stubs, wake lock
  js/content/   defaults, learn cards, crisis resources
worker/         Cloudflare Worker: router/CORS/auth, sync, devices, push subs, check-ins cron, Web Push (WebCrypto only)
test/           node --test suites + D1 shim
scripts/        make-icons.mjs (regenerates PNG icons, no dependencies)
```

## Overriding the design

Every visual is a token in `web/css/tokens.css`; every string is in `web/js/strings.js`; every choice has a `DD-###` entry. Change the token or string, then update the DD entry's "Override impact" if it matters.

## Before release (M7)

Run the manual iOS checklist in `MOMENT_SPEC.md` §19.2 on a real device: offline moment, ≤2 taps to rating, resume after kill, push round trip, denied-permission fallback, largest Dynamic Type, VoiceOver end to end, Reduce Motion, two-device restore, and delete everything. Also watch Worker CPU with `npx wrangler tail` while check-ins send (§7.3). If it exceeds 10 ms, lower `SEND_LIMIT` in `worker/src/checkins.js` to 1 and log a DD entry.

Moment isn't medical care. In an emergency, call 911.
