// @ts-check
/** E30: keep the screen on during an active moment where supported. */

/** @type {any} */
let sentinel = null;
let wanted = false;

async function acquire() {
  try {
    const wl = /** @type {any} */ (navigator).wakeLock;
    if (!wl || document.visibilityState !== 'visible') return;
    sentinel = await wl.request('screen');
    sentinel.addEventListener?.('release', () => { sentinel = null; });
  } catch { /* denied or unsupported */ }
}

export function holdWakeLock() {
  wanted = true;
  if (!sentinel) acquire();
}

export function releaseWakeLock() {
  wanted = false;
  try { sentinel?.release(); } catch { /* ignore */ }
  sentinel = null;
}

document.addEventListener('visibilitychange', () => {
  if (wanted && document.visibilityState === 'visible' && !sentinel) acquire();
});
