// @ts-check
/** Check-in plan lifecycle (§7.1), in-app delivery (§7.5), server mirror via PUT /v1/checkins. DD-018, DD-032 */
import { app, bus } from '../state.js';
import { uuid } from '../lib/crypto.js';
import { generatePlan, quickItem, regenerateForTz, dueSoon } from '../lib/schedule.js';
import { deviceTimeZone, HOUR, MIN } from '../lib/time.js';
import { api } from './api.js';

export const IN_APP_WINDOW_MS = 3 * HOUR;
const SERVER_MIN_AHEAD_MS = 5 * MIN; // server accepts dueAt ≥ now − 5 min
const SERVER_MAX_ITEMS = 10;

/** @returns {Promise<any[]>} pending check-ins, soonest first */
export async function pendingCheckins() {
  return (await app.db.list('checkins')).filter((c) => c.status === 'pending').sort((a, b) => a.dueAt - b.dueAt);
}

/** Next pending check-in in the future, or null. */
export async function nextCheckin(now = Date.now()) {
  return (await pendingCheckins()).find((c) => c.dueAt > now) || null;
}

/** @param {any[]} items @param {string} status */
async function setStatus(items, status) {
  if (!items.length) return;
  await app.db.putMany('checkins', items.map((c) => ({ ...c, status })));
}

/**
 * Accept the full plan after a close (§6.4 step 6). Replaces all pending items.
 * @param {string|null} momentId @param {number} [closeTime]
 */
export async function acceptPlan(momentId, closeTime = Date.now()) {
  const tz = deviceTimeZone();
  await setStatus(await pendingCheckins(), 'cancelled');
  const plan = generatePlan(closeTime, app.settings, tz);
  await app.db.putMany('checkins', plan.map((p) => ({ id: uuid(), momentId, dueAt: p.dueAt, kind: p.kind, status: 'pending' })));
  await app.db.setMeta('plan', { closeTime, tz, momentId });
  await afterChange();
}

/**
 * Add a single quick check-in ("In 10 min", "Check again in 30 min"); keeps the rest of the plan.
 * @param {'plus10'|'again30'} kind @param {string|null} momentId
 */
export async function addQuick(kind, momentId) {
  const it = quickItem(Date.now(), kind);
  await app.db.put('checkins', { id: uuid(), momentId, dueAt: it.dueAt, kind: it.kind, status: 'pending' });
  if (!(await app.db.getMeta('plan'))) await app.db.setMeta('plan', { closeTime: Date.now(), tz: deviceTimeZone(), momentId });
  await afterChange();
}

/** Starting a moment cancels pending items due within 60 min (§7.1). */
export async function cancelDueSoon(now = Date.now()) {
  const soon = dueSoon(await pendingCheckins(), now);
  if (!soon.length) return;
  await setStatus(soon, 'cancelled');
  await afterChange();
}

/** "Stop for today": cancel all pending. */
export async function stopForToday() {
  await setStatus(await pendingCheckins(), 'cancelled');
  await app.db.delMeta('plan');
  await afterChange();
}

/**
 * Answer a check-in locally and ack it on the server (§6.6).
 * @param {string} id @param {'okay'|'rough'|'start'|'later'|'stop'} answer
 */
export async function answerCheckin(id, answer) {
  const c = await app.db.get('checkins', id);
  if (!c || c.deleted) return;
  if (c.status !== 'answered') {
    await app.db.put('checkins', { ...c, status: 'answered', answer, answeredAt: Date.now() });
    bus.emit('checkins');
  }
  api.ack(id).catch(() => { /* best effort; server marks it sent/expired anyway */ });
}

/** Persist and mirror after any plan change (§7.1 Lifecycle). */
async function afterChange() {
  bus.emit('checkins');
  bus.emit('localChange');
  await app.db.setMeta('checkinsDirty', true);
  await flushCheckins();
}

/** PUT pending items to the server; stays dirty while offline (E13). */
export async function flushCheckins() {
  if (!(await app.db.getMeta('checkinsDirty'))) return;
  const now = Date.now();
  const items = (await pendingCheckins())
    .filter((c) => c.dueAt >= now - SERVER_MIN_AHEAD_MS + 30_000)
    .slice(0, SERVER_MAX_ITEMS)
    .map((c) => ({ id: c.id, dueAt: c.dueAt, kind: c.kind }));
  try {
    await api.putCheckins(items);
    await app.db.setMeta('checkinsDirty', false);
  } catch {
    /* retried by the sync service */
  }
}

/** On open: regenerate local-time items after a time zone change (§7.1, E15). */
export async function checkTimeZone(now = Date.now()) {
  const plan = await app.db.getMeta('plan');
  const tz = deviceTimeZone();
  if (!plan || plan.tz === tz) return;
  const pending = await pendingCheckins();
  const regen = regenerateForTz(pending.map((c) => ({ kind: c.kind, dueAt: c.dueAt })), plan.closeTime, app.settings, tz, now);
  /** @type {any[]} */
  const updates = [];
  const used = new Set();
  for (const c of pending) {
    const r = regen.find((x, i) => x.kind === c.kind && !used.has(i) && (used.add(i), true));
    updates.push(r ? { ...c, dueAt: r.dueAt } : { ...c, status: 'cancelled' });
  }
  await app.db.putMany('checkins', updates);
  await app.db.setMeta('plan', { ...plan, tz });
  await afterChange();
}

/**
 * §7.5 in-app delivery: latest unanswered pending/sent item due in the last 3 h; older ones expire.
 * @returns {Promise<any|null>}
 */
export async function findDueCheckin(now = Date.now()) {
  const all = (await app.db.list('checkins')).filter((c) => (c.status === 'pending' || c.status === 'sent') && c.dueAt <= now);
  const old = all.filter((c) => c.dueAt < now - IN_APP_WINDOW_MS);
  if (old.length) await setStatus(old, 'expired');
  const due = all.filter((c) => c.dueAt >= now - IN_APP_WINDOW_MS).sort((a, b) => b.dueAt - a.dueAt);
  // Only the latest is shown; earlier ones in the window are superseded. DD-053
  if (due.length > 1) await setStatus(due.slice(1), 'expired');
  return due[0] || null;
}

/** Whether a plan is active (any pending item). */
export async function planActive() {
  return (await pendingCheckins()).length > 0;
}
