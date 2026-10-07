// PUT /v1/checkins, POST /v1/checkins/:id/ack (§8) and the cron sender (§7.3).
// Server plaintext is limited to check-in dueAt + kind (§4). DD-018, DD-019

import { ID_RE, badRequest, isInt, isObj, noContent } from './util.js';
import { sendPush, vapidAuthorization } from './webpush.js';

export const KINDS = new Set(['plus10', 'plus30', 'plus2h', 'evening', 'morning', 'again30']);
export const MAX_ITEMS = 10;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** §7.3 LIMIT 3. Lower to 1 (new DD) if `wrangler tail` shows the 10 ms CPU cap being hit (E25). */
export const SEND_LIMIT = 3;
export const EXPIRE_AFTER = 30 * MIN; // §7.3: due_at < now - 30 min → expired
export const MAX_ATTEMPTS = 3; // §7.3: 429/5xx retried; at 3 → failed
const KEEP_DONE = 7 * DAY; // housekeeping: non-pending rows older than 7 days
const HOUSEKEEP_HOUR_UTC = 3;

/**
 * Replaces all *pending* check-ins of the device with `items` (§7.1 lifecycle).
 * Ids that already exist (non-pending rows of this device, or any other device's row) are left alone.
 * @param {unknown} body `{items: [{id, dueAt, kind}]}`
 * @param {{id: string}} device
 * @param {{DB: any}} env
 * @param {number} now
 * @returns {Promise<Response>}
 */
export async function putCheckins(body, device, env, now) {
  if (!isObj(body) || !Array.isArray(body.items) || body.items.length > MAX_ITEMS) throw badRequest();
  const seen = new Set();
  const rows = body.items.map((it) => {
    if (!isObj(it)) throw badRequest();
    const { id, dueAt, kind } = it;
    if (typeof id !== 'string' || !ID_RE.test(id) || seen.has(id)) throw badRequest();
    if (typeof kind !== 'string' || !KINDS.has(kind)) throw badRequest();
    if (!isInt(dueAt) || dueAt < now - 5 * MIN || dueAt > now + 48 * HOUR) throw badRequest();
    seen.add(id);
    return { i: id, d: dueAt, k: kind };
  });
  const db = env.DB;
  const stmts = [db.prepare("DELETE FROM checkins WHERE device_id = ? AND status = 'pending'").bind(device.id)];
  if (rows.length) {
    stmts.push(db.prepare(
      `INSERT INTO checkins (id, device_id, due_at, kind)
       SELECT json_extract(value, '$.i'), ?1, json_extract(value, '$.d'), json_extract(value, '$.k')
       FROM json_each(?2) WHERE 1
       ON CONFLICT (id) DO NOTHING`
    ).bind(device.id, JSON.stringify(rows)));
  }
  await db.batch(stmts);
  return noContent();
}

/* DD-069: ack is idempotent, 204 for unknown ids */
/**
 * Marks this device's check-in answered. 204 even when unknown: the client may ack
 * items answered in-app that never reached the server.
 * @param {string} id
 * @param {{id: string}} device
 * @param {{DB: any}} env
 * @returns {Promise<Response>}
 */
export async function ackCheckin(id, device, env) {
  if (!ID_RE.test(id)) throw badRequest();
  await env.DB.prepare("UPDATE checkins SET status = 'answered' WHERE id = ? AND device_id = ?")
    .bind(id, device.id).run();
  return noContent();
}

/** @param {number} s */
const retryable = (s) => !(s >= 200 && s < 300) && s !== 404 && s !== 410; // 429/5xx per §7.3, plus the rule below

/* DD-070: cron selects only items with a push sub or old enough to expire */
/**
 * Cron sender (§7.3). Sends at most SEND_LIMIT due check-ins per run.
 * Only selects items that can make progress: device has a subscription, or the item is
 * old enough to expire. Keeps in-app-only devices from starving the LIMIT.
 * Writes after each item so a CPU-limit kill (E25) loses at most the item in flight.
 * @param {{DB: any, VAPID_PRIVATE_JWK: string, VAPID_SUBJECT: string}} env
 * @param {number} now epoch ms
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{sent: number, expired: number, retried: number, failed: number, subsDeleted: number}>}
 */
export async function runCheckins(env, now, fetchImpl) {
  const db = env.DB;
  const stats = { sent: 0, expired: 0, retried: 0, failed: 0, subsDeleted: 0 };
  const expireBefore = now - EXPIRE_AFTER;
  const { results: due } = await db.prepare(
    `SELECT c.id, c.device_id, c.due_at, c.kind, c.attempts FROM checkins AS c
     WHERE c.status = 'pending' AND c.due_at <= ?1
       AND (c.due_at < ?2 OR EXISTS (SELECT 1 FROM push_subs AS p WHERE p.device_id = c.device_id))
     ORDER BY c.due_at LIMIT ?3`
  ).bind(now, expireBefore, SEND_LIMIT).all();
  if (!due.length) return stats;

  // All subscriptions for the selected devices in one query (E23: every sub of the identity).
  const devices = [...new Set(due.filter((c) => c.due_at >= expireBefore).map((c) => c.device_id))];
  /** @type {Map<string, {endpoint: string, p256dh: string, auth: string}[]>} */
  const subsBy = new Map();
  if (devices.length) {
    const { results: subs } = await db.prepare(
      `SELECT endpoint, device_id, p256dh, auth FROM push_subs WHERE device_id IN (${devices.map(() => '?').join(',')})`
    ).bind(...devices).all();
    for (const s of subs) {
      if (!subsBy.has(s.device_id)) subsBy.set(s.device_id, []);
      subsBy.get(s.device_id).push(s);
    }
  }

  const memo = new Map();
  const gone = new Set();
  for (const c of due) {
    if (c.due_at < expireBefore) {
      await db.prepare("UPDATE checkins SET status = 'expired' WHERE id = ? AND status = 'pending'").bind(c.id).run();
      stats.expired++;
      continue;
    }
    const subs = (subsBy.get(c.device_id) || []).filter((s) => !gone.has(s.endpoint));
    if (!subs.length) continue; // stays pending; in-app delivery covers it, expires after 30 min
    const payload = { t: 'checkin', id: c.id, kind: c.kind }; // §7.4, DD-019
    let ok = false;
    let retry = false;
    const stmts = [];
    for (const s of subs) {
      let status;
      try {
        const authz = await vapidAuthorization(env, new URL(s.endpoint).origin, now, memo);
        status = await sendPush(s, payload, authz, fetchImpl);
      } catch {
        status = 0;
      }
      if (status >= 200 && status < 300) ok = true;
      else if (status === 404 || status === 410) { // E14
        gone.add(s.endpoint);
        stmts.push(db.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint));
        stats.subsDeleted++;
      } else if (retryable(status)) retry = true; /* DD-071: other non-2xx (e.g. 400/403) and network errors also count as attempts */
    }
    if (ok) {
      stmts.push(db.prepare("UPDATE checkins SET status = 'sent', sent_at = ? WHERE id = ? AND status = 'pending'")
        .bind(now, c.id));
      stats.sent++;
    } else if (retry) {
      const failed = c.attempts + 1 >= MAX_ATTEMPTS;
      stmts.push(db.prepare(
        "UPDATE checkins SET attempts = attempts + 1, status = CASE WHEN attempts + 1 >= ?2 THEN 'failed' ELSE status END WHERE id = ?1 AND status = 'pending'"
      ).bind(c.id, MAX_ATTEMPTS));
      if (failed) stats.failed++; else stats.retried++;
    }
    // else: every sub was 404/410 → deleted; item stays pending until it expires.
    if (stmts.length) await db.batch(stmts);
  }
  return stats;
}

/* DD-072: housekeeping also drops expired vapid_cache rows */
/**
 * Daily housekeeping (§7.3 step 4): first run at/after 03:00 UTC each UTC day deletes
 * non-pending check-ins due > 7 days ago. Tracked in `kv` (DD-036).
 * @param {{DB: any}} env
 * @param {number} now
 * @returns {Promise<boolean>} true if it ran
 */
export async function housekeep(env, now) {
  const d = new Date(now);
  if (d.getUTCHours() < HOUSEKEEP_HOUR_UTC) return false;
  const day = d.toISOString().slice(0, 10);
  const db = env.DB;
  const last = await db.prepare("SELECT v FROM kv WHERE k = 'housekeep'").first('v');
  if (last === day) return false;
  await db.batch([
    db.prepare("DELETE FROM checkins WHERE status != 'pending' AND due_at < ?").bind(now - KEEP_DONE),
    db.prepare('DELETE FROM vapid_cache WHERE exp < ?').bind(Math.floor(now / 1000)),
    db.prepare("INSERT INTO kv (k, v) VALUES ('housekeep', ?1) ON CONFLICT (k) DO UPDATE SET v = excluded.v")
      .bind(day),
  ]);
  return true;
}
