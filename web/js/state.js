// @ts-check
/**
 * App singleton, event bus, settings/profile/list access, and active-moment operations (§5.3, §16 E1–E9).
 * Every interaction in an active moment is written to IDB immediately; nothing lives only in memory.
 */
import { uuid } from './lib/crypto.js';
import { computeMomentMetrics } from './lib/metrics.js';
import { MIN, HOUR } from './lib/time.js';
import {
  DISTRACT_DEFAULTS, TRIGGER_DEFAULTS, THOUGHT_DEFAULTS, SETTINGS_DEFAULTS, PROFILE_DEFAULTS,
} from './content/defaults.js';

/** @typedef {import('./db.js').DB} DB */
/** @typedef {typeof SETTINGS_DEFAULTS & {id:string}} Settings */
/** @typedef {typeof PROFILE_DEFAULTS & {id:string}} Profile */
/** @typedef {any} Moment */

export const RESUME_MS = 30 * MIN; // E1/E2
export const MAX_ACTIVE_MS = 3 * HOUR; // E8
export const CHAIN_MS = 10 * MIN; // E4
export const RISING_COOLDOWN_MS = 10 * MIN; // DD-012
export const LONG_MS = 45 * MIN; // DD-012

/** Tiny event bus. */
function createBus() {
  /** @type {Map<string, Set<(d:any)=>void>>} */
  const m = new Map();
  return {
    /** @param {string} ev @param {(d:any)=>void} fn */
    on(ev, fn) {
      if (!m.has(ev)) m.set(ev, new Set());
      m.get(ev)?.add(fn);
      return () => m.get(ev)?.delete(fn);
    },
    /** @param {string} ev @param {any} [d] */
    emit(ev, d) {
      for (const fn of m.get(ev) || []) {
        try { fn(d); } catch (e) { console.error(e); }
      }
    },
  };
}

export const bus = createBus();

/** App singleton. Populated by initState(). */
export const app = {
  /** @type {DB} */ db: /** @type {any} */ (null),
  /** @type {Settings} */ settings: /** @type {any} */ ({ ...SETTINGS_DEFAULTS, id: 'settings' }),
  /** @type {Profile} */ profile: /** @type {any} */ ({ ...PROFILE_DEFAULTS, id: 'profile' }),
  /** @type {{deviceId:string, secret:Uint8Array, authToken:string, encKey:CryptoKey}|null} */ identity: null,
  standalone: false,
  isIOS: false,
};

/** @param {DB} db */
export async function initState(db) {
  app.db = db;
  await seedDefaults();
  await reloadSettings();
  await reloadProfile();
  db.onChange((ev) => {
    if (ev.store === 'settings') reloadSettings().then(() => bus.emit('settings'));
    if (ev.store === 'profile') reloadProfile().then(() => bus.emit('profile'));
    bus.emit('db', ev);
  });
}

/** Seed built-in lists, settings, profile on first run (§11). Not synced until changed. DD-038 */
export async function seedDefaults() {
  const db = app.db;
  if (await db.getMeta('seeded')) return;
  const now = Date.now();
  const base = { createdAt: now, updatedAt: 0, deleted: false, v: 1, writer: '' };
  /** @type {{store:string, value:any}[]} */
  const ops = [];
  DISTRACT_DEFAULTS.forEach((d, i) => ops.push({ store: 'distractOptions', value: { ...base, ...d, hidden: false, order: i, builtIn: true } }));
  TRIGGER_DEFAULTS.forEach((d, i) => ops.push({ store: 'triggerTags', value: { ...base, ...d, hidden: false, order: i, builtIn: true } }));
  THOUGHT_DEFAULTS.forEach((d, i) => ops.push({ store: 'permissionThoughts', value: { ...base, ...d, hidden: false, order: i, builtIn: true } }));
  if (!(await db.get('settings', 'settings'))) ops.push({ store: 'settings', value: { ...base, ...SETTINGS_DEFAULTS, id: 'settings' } });
  if (!(await db.get('profile', 'profile'))) ops.push({ store: 'profile', value: { ...base, ...structuredClone(PROFILE_DEFAULTS), id: 'profile' } });
  // updatedAt 0: any synced copy from another device wins over a fresh seed.
  await db.write(ops);
  await db.setMeta('seeded', now);
}

export async function reloadSettings() {
  const s = await app.db.get('settings', 'settings');
  app.settings = { ...SETTINGS_DEFAULTS, ...(s || {}), id: 'settings' };
  return app.settings;
}

export async function reloadProfile() {
  const p = await app.db.get('profile', 'profile');
  app.profile = { ...structuredClone(PROFILE_DEFAULTS), ...(p || {}), id: 'profile' };
  return app.profile;
}

/** @param {Partial<Settings>} patch */
export async function saveSettings(patch) {
  app.settings = await app.db.put('settings', { ...app.settings, ...patch, id: 'settings' });
  bus.emit('settings');
  bus.emit('localChange');
}

/** @param {Partial<Profile>} patch */
export async function saveProfile(patch) {
  app.profile = await app.db.put('profile', { ...app.profile, ...patch, id: 'profile' });
  bus.emit('profile');
  bus.emit('localChange');
}

/** Sorted list (visible-only unless `all`). @param {'distractOptions'|'triggerTags'|'permissionThoughts'} store @param {boolean} [all] */
export async function getList(store, all = false) {
  const xs = await app.db.list(store);
  return xs.filter((x) => all || !x.hidden).sort((a, b) => a.order - b.order || String(a.label || a.thought).localeCompare(String(b.label || b.thought)));
}

/** @param {string} store @param {any} rec */
export async function saveListItem(store, rec) {
  const out = await app.db.put(store, rec);
  bus.emit('localChange');
  return out;
}

// ---------------------------------------------------------------------------
// Moments

/** @returns {Promise<Moment[]>} live moments, oldest first */
export async function allMoments() {
  return (await app.db.list('moments')).sort((a, b) => a.startedAt - b.startedAt);
}

/** @returns {Promise<Moment|null>} */
export async function getActiveMoment() {
  const ms = await app.db.list('moments');
  return ms.filter((m) => m.status === 'active').sort((a, b) => b.startedAt - a.startedAt)[0] || null;
}

/** @param {string} id @returns {Promise<Moment|null>} */
export async function getMoment(id) {
  const m = await app.db.get('moments', id);
  return m && !m.deleted ? m : null;
}

/**
 * Mark stale active moments unfinished (E2, E8). Returns the still-active moment, if any.
 * @param {number} [now]
 */
export async function sweepActive(now = Date.now()) {
  const ms = (await app.db.list('moments')).filter((m) => m.status === 'active');
  ms.sort((a, b) => b.startedAt - a.startedAt);
  /** @type {Moment|null} */
  let keep = null;
  for (const m of ms) {
    const idle = now - (m.lastInteractionAt || m.startedAt) >= RESUME_MS;
    const tooLong = now - m.startedAt >= MAX_ACTIVE_MS;
    if (!keep && !idle && !tooLong) { keep = m; continue; }
    const endedAt = m.lastInteractionAt || m.startedAt;
    const done = { ...m, status: 'unfinished', endedAt };
    done.metrics = computeMomentMetrics(done);
    await app.db.put('moments', done);
  }
  return keep;
}

/**
 * Start a moment, or resume the active one (E3). Chains to a recent close (E4).
 * @param {{previousMomentId?:string|null}} [opts]
 * @returns {Promise<Moment>}
 */
export async function startMoment(opts = {}) {
  const active = await sweepActive();
  if (active) return active;
  const now = Date.now();
  let prev = opts.previousMomentId || null;
  if (!prev) {
    const recent = (await app.db.list('moments')).filter((m) => m.endedAt && now - m.endedAt < CHAIN_MS).sort((a, b) => b.endedAt - a.endedAt)[0];
    if (recent) prev = recent.id;
  }
  const m = {
    id: uuid(),
    startedAt: now,
    endedAt: null,
    lastInteractionAt: now,
    status: 'active',
    previousMomentId: prev,
    delayTargetMin: app.settings.delayMinutes,
    ratings: [],
    distance: null,
    bodyLocations: [],
    sensations: [],
    triggerTagIds: [],
    steps: [],
    distractUses: [],
    decide: { tapeViewed: false, tapeNotes: null, thoughtIds: [], wordsViewed: false, plansShown: [] },
    outcome: null,
    seeking: null,
    checkinsAccepted: false,
    metrics: null,
    // Additions (DD-042): resume route, delay extensions, rule bookkeeping, close progress.
    lastRoute: '#/moment',
    delayExtraMin: 0,
    risingShownAt: null,
    longShown: false,
    closeStage: null,
  };
  await app.db.put('moments', m);
  bus.emit('moment:start', m);
  return m;
}

/**
 * Mutate and persist a moment immediately (§5.3 Writes).
 * @param {string} id @param {(m:Moment)=>void} fn @param {{touch?:boolean}} [opts]
 * @returns {Promise<Moment|null>}
 */
export async function updateMoment(id, fn, opts = {}) {
  const m = await app.db.get('moments', id);
  if (!m || m.deleted) return null;
  fn(m);
  if (opts.touch !== false) m.lastInteractionAt = Date.now();
  if (m.status !== 'active' && m.endedAt) m.metrics = computeMomentMetrics(m); // E10: recompute on edit
  return app.db.put('moments', m);
}

/** @param {string} id @param {number} v @param {'initial'|'prompt'|'manual'|'return'|'close'} src */
export function addRating(id, v, src) {
  return updateMoment(id, (m) => {
    m.ratings.push({ t: Math.max(0, Date.now() - m.startedAt), v: Math.max(0, Math.min(10, Math.round(v))), src });
  });
}

/** Record entering a DDD step (consecutive duplicates collapse). @param {string} id @param {'distance'|'surf'|'distract'|'decide'|'close'} step */
export function addStep(id, step) {
  return updateMoment(id, (m) => {
    const last = m.steps[m.steps.length - 1];
    if (!last || last.step !== step) m.steps.push({ step, at: Date.now() });
  });
}

/** Remember the screen for resume (E1). @param {string} id @param {string} route */
export function setLastRoute(id, route) {
  return updateMoment(id, (m) => { m.lastRoute = route; }, { touch: false });
}

/** Latest rating value or null. @param {Moment} m */
export function latestRating(m) {
  const r = [...(m.ratings || [])].sort((a, b) => a.t - b.t);
  return r.length ? r[r.length - 1].v : null;
}

/** @param {Moment} m */
export function lastRatingAt(m) {
  const r = m.ratings || [];
  return r.length ? m.startedAt + Math.max(...r.map((/** @type {any} */ x) => x.t)) : null;
}

/**
 * Rising rule (§6.3.3): +2 over previous, 3 consecutive increases, or 10. DD-012
 * @param {{t:number,v:number}[]} ratings
 */
export function isRising(ratings) {
  const r = [...ratings].sort((a, b) => a.t - b.t).map((x) => x.v);
  const n = r.length;
  if (!n) return false;
  if (r[n - 1] === 10) return true;
  if (n >= 2 && r[n - 1] >= r[n - 2] + 2) return true;
  if (n >= 4 && r[n - 1] > r[n - 2] && r[n - 2] > r[n - 3] && r[n - 3] > r[n - 4]) return true;
  return false;
}

/** Delay target in ms including "Keep surfing" extensions. @param {Moment} m */
export function delayTargetMs(m) {
  return ((m.delayTargetMin || 15) + (m.delayExtraMin || 0)) * MIN;
}

/**
 * Close a moment (§6.4 step 7): status closed, endedAt, metrics. Sync is triggered by the caller via bus.
 * @param {string} id @param {{retro?:boolean}} [opts] retro: checking out an unfinished moment keeps its endedAt
 */
export async function finishMoment(id, opts = {}) {
  const out = await updateMoment(id, (m) => {
    if (!opts.retro || !m.endedAt) m.endedAt = Date.now();
    m.status = 'closed';
    m.closeStage = null;
    m.metrics = computeMomentMetrics(m);
  }, { touch: !opts.retro });
  bus.emit('moment:close', out);
  return out;
}

/** @param {string} id */
export async function deleteMoment(id) {
  await app.db.remove('moments', id);
  bus.emit('localChange');
}
