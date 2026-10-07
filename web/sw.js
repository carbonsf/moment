/* Moment service worker: offline shell (cache-first), network-only API, push display (§7.4). Classic script for Firefox. */
/* global self, caches, clients */
'use strict';

// Bump on every deploy; must match APP_VERSION in js/config.js.
const CACHE_VERSION = 'moment-1.0.2';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './js/app.js',
  './js/config.js',
  './js/strings.js',
  './js/router.js',
  './js/db.js',
  './js/state.js',
  './js/lib/metrics.js',
  './js/lib/schedule.js',
  './js/lib/crypto.js',
  './js/lib/sync.js',
  './js/lib/time.js',
  './js/ui/dom.js',
  './js/ui/icons.js',
  './js/ui/wave.js',
  './js/ui/slider.js',
  './js/ui/chips.js',
  './js/ui/sheet.js',
  './js/ui/chart.js',
  './js/ui/scrollhint.js',
  './js/services/api.js',
  './js/services/checkins.js',
  './js/services/feedback.js',
  './js/services/guidance.js',
  './js/services/identity.js',
  './js/services/push.js',
  './js/services/support.js',
  './js/services/syncer.js',
  './js/services/wakelock.js',
  './js/content/defaults.js',
  './js/content/learn.js',
  './js/content/resources.js',
  './js/screens/_shared.js',
  './js/screens/after.js',
  './js/screens/checkin.js',
  './js/screens/close.js',
  './js/screens/decide.js',
  './js/screens/detail.js',
  './js/screens/distance.js',
  './js/screens/distract.js',
  './js/screens/doing.js',
  './js/screens/home.js',
  './js/screens/install.js',
  './js/screens/learn.js',
  './js/screens/lists.js',
  './js/screens/lookback.js',
  './js/screens/restore.js',
  './js/screens/settings.js',
  './js/screens/setup.js',
  './js/screens/start.js',
  './js/screens/surf.js',
  './js/screens/tape.js',
  './js/screens/thought.js',
  './js/screens/words.js',
];

// DD-019: neutral bodies, never user content.
const BODIES = {
  morning: "Morning. How's today starting?",
  other: "Checking in. How's the next hour?",
};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))));
  // No skipWaiting here: an update waits until the app says no moment is active (E18).
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE_VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API and anything else: network only
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    if (req.mode === 'navigate') {
      return (await cache.match('./index.html')) || fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  })());
});

self.addEventListener('push', (event) => {
  let id = '';
  let kind = '';
  try {
    const p = event.data ? event.data.json() : null;
    if (p && p.t === 'checkin') { id = String(p.id || ''); kind = String(p.kind || ''); }
  } catch (e) { /* generic body below */ }
  const body = kind === 'morning' ? BODIES.morning : BODIES.other;
  // MUST show a notification for every push (iOS revokes permission otherwise).
  event.waitUntil(self.registration.showNotification('Moment', {
    body,
    tag: 'checkin',
    data: { id },
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = (event.notification.data && event.notification.data.id) || '';
  const hash = id ? `#/checkin/${encodeURIComponent(id)}` : '#/home';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin !== self.location.origin) continue;
      // The app routes to an active moment instead of the check-in if one is running (E16).
      c.postMessage({ type: 'navigate', hash });
      if ('focus' in c) return c.focus();
    }
    return self.clients.openWindow(`./${hash}`);
  })());
});
