// POST /v1/devices, DELETE /v1/devices/me (§4, §8). DD-004

import { HttpError, badRequest, isObj, json, noContent } from './util.js';
import { hashToken, isAuthToken, isDeviceId, timingSafeEqual } from './auth.js';

/**
 * Idempotent registration: 201 new / 200 same hash / 409 different hash.
 * @param {unknown} body
 * @param {{DB: any}} env
 * @param {number} now
 * @returns {Promise<Response>}
 */
export async function registerDevice(body, env, now) {
  if (!isObj(body) || !isDeviceId(body.deviceId) || !isAuthToken(body.authToken)) throw badRequest();
  const id = body.deviceId.toLowerCase();
  const hash = await hashToken(body.authToken);
  const res = await env.DB.prepare(
    'INSERT INTO devices (id, auth_hash, created_at, last_seen) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING'
  ).bind(id, hash, now, now).run();
  if (res.meta && res.meta.changes > 0) return json(201, { ok: true });
  const stored = await env.DB.prepare('SELECT auth_hash FROM devices WHERE id = ?').bind(id).first('auth_hash');
  if (stored && timingSafeEqual(stored, hash)) return json(200, { ok: true });
  throw new HttpError(409, 'conflict');
}

/**
 * Deletes every row for the device across all tables (E24), atomically.
 * @param {{id: string}} device
 * @param {{DB: any}} env
 * @returns {Promise<Response>}
 */
export async function deleteDevice(device, env) {
  const db = env.DB;
  await db.batch([
    db.prepare('DELETE FROM records WHERE device_id = ?').bind(device.id),
    db.prepare('DELETE FROM push_subs WHERE device_id = ?').bind(device.id),
    db.prepare('DELETE FROM checkins WHERE device_id = ?').bind(device.id),
    db.prepare('DELETE FROM devices WHERE id = ?').bind(device.id),
  ]);
  return noContent();
}
