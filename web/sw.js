/* Gratitude service worker: offline app shell, cache-first. Classic script. */
/* global self, caches */
'use strict';

// Bump on every deploy: the changed bytes are how browsers notice an update. The new version takes over on next launch.
const CACHE_VERSION = 'gratitude-1.1.0';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './css/tokens.css',
  './css/app.css',
  './fonts/PTSans-400.woff2',
  './fonts/PTSans-700.woff2',
  './fonts/Ovo-400.woff2',
  './js/app.js',
  './js/db.js',
  './js/dom.js',
  './js/water.js',
  './js/gl.js',
  './js/shaders.js',
  './js/crypto.js',
  './js/sync.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE_VERSION);
    await c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting(); // nothing mid-flow to protect here; the open page keeps the code it loaded
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE_VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    if (req.mode === 'navigate') {
      const page = await cache.match('./index.html');
      if (page) return page;
      return fetch(req);
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
