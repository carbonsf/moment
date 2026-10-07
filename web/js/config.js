// @ts-check
/** App configuration. Edit API_BASE / VAPID_PUBLIC_KEY after deploying the Worker (see README). */

/** Worker base URL, no trailing slash. Must also be listed in index.html CSP connect-src. */
export const API_BASE = 'https://moment-api.USERNAME.workers.dev';

/** VAPID public key (uncompressed P-256 point, base64url). Generate with `npm run vapid` in /worker. */
export const VAPID_PUBLIC_KEY = 'BFVQzKI2uDcjsJ9MUX72zIw4JHXTuBBxfgy4z96grRAzwnUumAU0fxcwMTnJwzTOgjy6r0upxTWhrD11MxdhWys';

/** Must match CACHE_VERSION in sw.js. */
export const APP_VERSION = '1.0.0';

/** §18 feature flags. */
export const FLAGS = {
  sync: true,
  push: true,
  shadowPrompt: true,     // seeking question at close (§6.4 step 4)
  humanSupport: false,    // support-person stub
  audioGuidance: false,   // guidance.js audio renderer
  haptics: false,         // feedback.js; iOS Safari lacks Vibration API
  lightTheme: false,
};

/** True when the backend has been configured; sync/push are skipped otherwise. DD-037 */
export const BACKEND_CONFIGURED = !API_BASE.includes('USERNAME');
