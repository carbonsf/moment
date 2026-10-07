// PUT / DELETE /v1/push-subscription (§7.2, §8).

import { badRequest, b64urlDecode, isObj, noContent } from './util.js';

/* DD-067: max 5 push subs per identity, oldest evicted */
/** Bounds cron subrequests (50 cap). */
export const MAX_SUBS_PER_DEVICE = 5;
const MAX_ENDPOINT = 2048;

/** @param {unknown} s @returns {string} */
function checkEndpoint(s) {
  if (typeof s !== 'string' || s.length > MAX_ENDPOINT) throw badRequest();
  let u;
  try { u = new URL(s); } catch { throw badRequest(); }
  if (u.protocol !== 'https:') throw badRequest();
  return s;
}

/** @param {unknown} s @param {number} len */
function checkKey(s, len) {
  if (typeof s !== 'string' || s.length > 128) throw badRequest();
  let bytes;
  try { bytes = b64urlDecode(s); } catch { throw badRequest(); }
  if (bytes.length !== len) throw badRequest();
  return s;
}

/* DD-068: re-PUT of an endpoint reassigns it to the calling identity */
/**
 * Upsert by endpoint. An endpoint belongs to one browser; re-PUT from another identity
 * (e.g. after restore) moves it. created_at refreshed so eviction keeps the newest.
 * @param {unknown} body `{endpoint, keys: {p256dh, auth}}`
 * @param {{id: string}} device
 * @param {{DB: any}} env
 * @param {number} now
 * @returns {Promise<Response>}
 */
export async function putSubscription(body, device, env, now) {
  if (!isObj(body) || !isObj(body.keys)) throw badRequest();
  const endpoint = checkEndpoint(body.endpoint);
  const p256dh = checkKey(body.keys.p256dh, 65); // uncompressed P-256 point
  const auth = checkKey(body.keys.auth, 16);
  if (b64urlDecode(p256dh)[0] !== 4) throw badRequest();
  const db = env.DB;
  await db.batch([
    db.prepare(
      `INSERT INTO push_subs (endpoint, device_id, p256dh, auth, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT (endpoint) DO UPDATE SET device_id = excluded.device_id, p256dh = excluded.p256dh,
         auth = excluded.auth, created_at = excluded.created_at`
    ).bind(endpoint, device.id, p256dh, auth, now),
    db.prepare(
      `DELETE FROM push_subs WHERE device_id = ?1 AND endpoint NOT IN
         (SELECT endpoint FROM push_subs WHERE device_id = ?1 ORDER BY created_at DESC LIMIT ?2)`
    ).bind(device.id, MAX_SUBS_PER_DEVICE),
  ]);
  return noContent();
}

/**
 * Deletes this device's subscription for the endpoint. 204 even if absent (idempotent).
 * @param {unknown} body `{endpoint}`
 * @param {{id: string}} device
 * @param {{DB: any}} env
 * @returns {Promise<Response>}
 */
export async function deleteSubscription(body, device, env) {
  if (!isObj(body) || typeof body.endpoint !== 'string' || body.endpoint.length > MAX_ENDPOINT) throw badRequest();
  await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND device_id = ?')
    .bind(body.endpoint, device.id).run();
  return noContent();
}
