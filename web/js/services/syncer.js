// @ts-check
/** Sync scheduling around lib/sync.js (§9): triggers, backoff, status, registration, deferred server ops. */
import { FLAGS, BACKEND_CONFIGURED } from '../config.js';
import { app, bus } from '../state.js';
import { runSync, createBackoff } from '../lib/sync.js';
import { encryptJSON, decryptJSON } from '../lib/crypto.js';
import { api, ApiError } from './api.js';
import { flushCheckins } from './checkins.js';
import { checkSubscription } from './push.js';

const DEBOUNCE_MS = 3000;
const INTERVAL_MS = 5 * 60_000;

export const syncStatus = {
  enabled: FLAGS.sync && BACKEND_CONFIGURED,
  /** @type {number|null} */ lastSyncAt: null,
  pending: 0,
  offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  running: false,
};

const backoff = createBackoff();
/** @type {ReturnType<typeof setTimeout>|null} */ let debounceT = null;
/** @type {ReturnType<typeof setTimeout>|null} */ let retryT = null;
/** @type {ReturnType<typeof setInterval>|null} */ let intervalT = null;
let again = false;

/** Register the device once (§4). Idempotent server-side. */
async function ensureRegistered() {
  if (await app.db.getMeta('registeredAt')) return;
  const id = app.identity;
  if (!id) return;
  await api.register(id.deviceId, id.authToken);
  await app.db.setMeta('registeredAt', Date.now());
}

async function refreshPending() {
  syncStatus.pending = await app.db.pendingCount();
  bus.emit('sync');
}

/** Run one sync now; never throws. */
export async function syncNow() {
  if (!syncStatus.enabled || !app.identity) return;
  if (syncStatus.running) { again = true; return; }
  syncStatus.running = true;
  try {
    await ensureRegistered();
    const key = /** @type {CryptoKey} */ (app.identity.encKey);
    await runSync({
      store: app.db.syncAdapter(),
      post: (body) => api.sync(body),
      encrypt: (v) => encryptJSON(key, v),
      decrypt: (b) => decryptJSON(key, b),
    });
    await flushCheckins();
    syncStatus.lastSyncAt = Date.now();
    syncStatus.offline = false;
    await app.db.setMeta('lastSyncAt', syncStatus.lastSyncAt);
    backoff.ok();
  } catch (e) {
    syncStatus.offline = e instanceof ApiError && e.status === 0;
    if (e instanceof ApiError && e.status === 401) await app.db.delMeta('registeredAt'); // re-register next run
    const wait = backoff.fail();
    if (retryT) clearTimeout(retryT);
    retryT = setTimeout(() => { retryT = null; syncNow(); }, wait);
  } finally {
    syncStatus.running = false;
    await refreshPending();
    if (again) { again = false; schedule(); }
  }
}

/** Debounced trigger for settings or list changes (3 s). */
export function schedule() {
  if (debounceT) clearTimeout(debounceT);
  debounceT = setTimeout(() => { debounceT = null; syncNow(); }, DEBOUNCE_MS);
}

/** Retry a "Delete everything" that couldn't reach the server (E24). */
export async function retryPendingServerDelete() {
  const pd = await app.db.getMeta('pendingServerDelete');
  if (!pd || !BACKEND_CONFIGURED) return;
  try {
    const { deriveAuthToken, b64urlDecode } = await import('../lib/crypto.js');
    const authToken = await deriveAuthToken(b64urlDecode(pd.secret));
    const prev = app.identity;
    // Call with the old identity's credentials.
    app.identity = /** @type {any} */ ({ ...prev, deviceId: pd.deviceId, authToken });
    try { await api.deleteDevice(); } finally { app.identity = prev; }
    await app.db.delMeta('pendingServerDelete');
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 404)) await app.db.delMeta('pendingServerDelete');
  }
}

/** Wire triggers: open, moment close, local changes, interval while visible, online. */
export async function startSync() {
  syncStatus.lastSyncAt = (await app.db.getMeta('lastSyncAt')) || null;
  await refreshPending();
  if (!syncStatus.enabled) return;
  bus.on('localChange', schedule);
  bus.on('moment:close', () => syncNow());
  window.addEventListener('online', () => { syncStatus.offline = false; syncNow(); });
  window.addEventListener('offline', () => { syncStatus.offline = true; bus.emit('sync'); });
  const tick = () => {
    if (intervalT) clearInterval(intervalT);
    intervalT = document.visibilityState === 'visible' ? setInterval(syncNow, INTERVAL_MS) : null;
  };
  document.addEventListener('visibilitychange', tick);
  tick();
  await retryPendingServerDelete();
  syncNow().then(() => checkSubscription());
}
