// Bearer auth: `Authorization: Bearer <deviceId>.<authToken>` (§4). DD-004
// Server stores SHA-256(authToken) as lowercase hex only (§17).

import { UUID_RE } from './util.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // base64url of 32 bytes, no padding
const LAST_SEEN_EVERY = 60 * 60 * 1000; // §8: at most once per hour
const DUMMY_HASH = '0'.repeat(64);

/**
 * SHA-256 → lowercase hex.
 * @param {string} token
 * @returns {Promise<string>}
 */
export async function hashToken(token) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  let s = '';
  for (let i = 0; i < d.length; i++) s += d[i].toString(16).padStart(2, '0');
  return s;
}

/**
 * Constant-time string compare (equal-length hex in practice).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/** @param {unknown} s @returns {s is string} */
export const isDeviceId = (s) => typeof s === 'string' && UUID_RE.test(s);
/** @param {unknown} s @returns {s is string} */
export const isAuthToken = (s) => typeof s === 'string' && TOKEN_RE.test(s);

/**
 * Authenticates a request. Returns the device row or null.
 * Touches `last_seen` at most once per hour.
 * @param {Request} request
 * @param {{DB: any}} env
 * @param {number} now
 * @returns {Promise<{id: string, seq: number} | null>}
 */
export async function authenticate(request, env, now) {
  const h = request.headers.get('Authorization') || '';
  const m = /^Bearer ([^.\s]+)\.([^.\s]+)$/.exec(h);
  if (!m || !isDeviceId(m[1]) || !isAuthToken(m[2])) return null;
  const id = m[1].toLowerCase(); /* DD-062: device ids normalized to lowercase */
  const hash = await hashToken(m[2]);
  const row = await env.DB.prepare('SELECT id, auth_hash, last_seen, seq FROM devices WHERE id = ?')
    .bind(id).first();
  // Compare even when unknown so timing doesn't reveal device existence.
  const ok = timingSafeEqual(hash, row ? row.auth_hash : DUMMY_HASH) && !!row;
  if (!ok) return null;
  if (now - row.last_seen >= LAST_SEEN_EVERY) {
    await env.DB.prepare('UPDATE devices SET last_seen = ? WHERE id = ?').bind(now, id).run();
  }
  return { id, seq: row.seq };
}
