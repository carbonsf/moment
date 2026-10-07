// @ts-check
/**
 * App updates (DD-080). A new deploy ships a new sw.js (CACHE_VERSION changes); the browser installs it in the
 * background and it waits. We look for one on launch, on return to the app, and hourly while open, then ask
 * the person before switching. Never prompts or reloads during an active moment (E18).
 */
import { bus } from '../state.js';

export const CHECK_INTERVAL_MS = 60 * 60_000;
const MIN_GAP_MS = 5 * 60_000; // don't hit the network for sw.js more than this often

export const updateState = {
  /** @type {ServiceWorkerRegistration|null} */ reg: null,
  /** "Later" hides the prompt for the rest of this session; it returns next launch. */
  dismissed: false,
  lastCheck: 0,
};

/** A newer version is installed and waiting (and this isn't the very first install). */
export function updateReady() {
  return !!(updateState.reg?.waiting && navigator.serviceWorker.controller);
}

/** @param {ServiceWorker|null} w */
function watchWorker(w) {
  w?.addEventListener('statechange', () => {
    if (w.state === 'installed' && navigator.serviceWorker.controller) bus.emit('update');
  });
}

/** Start watching a registration for new versions. @param {ServiceWorkerRegistration} reg */
export function watchForUpdates(reg) {
  updateState.reg = reg;
  watchWorker(reg.installing);
  reg.addEventListener('updatefound', () => watchWorker(reg.installing));
  if (updateReady()) bus.emit('update');
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
  setInterval(() => { if (document.visibilityState === 'visible') checkForUpdate(); }, CHECK_INTERVAL_MS);
}

/** Ask the browser to re-fetch sw.js (throttled). */
export async function checkForUpdate() {
  const reg = updateState.reg;
  if (!reg || Date.now() - updateState.lastCheck < MIN_GAP_MS) return;
  updateState.lastCheck = Date.now();
  try { await reg.update(); } catch { /* offline: try again later */ }
  if (updateReady()) bus.emit('update');
}

/** Switch to the waiting version; app.js reloads once on controllerchange. */
export function applyUpdate() {
  updateState.reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export function dismissUpdate() {
  updateState.dismissed = true;
  bus.emit('update');
}
