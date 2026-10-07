// @ts-check
/** §4 anonymous identity: deviceId + 32-byte secret, HKDF-derived auth token and encryption key. DD-004 */
import { app } from '../state.js';
import { uuid, randomBytes, b64urlEncode, b64urlDecode, deriveAuthToken, deriveEncKey } from '../lib/crypto.js';

/** Load or create the identity and attach it to `app`. */
export async function ensureIdentity() {
  const db = app.db;
  let deviceId = await db.getMeta('deviceId');
  let secretB64 = await db.getMeta('secret');
  if (!deviceId || !secretB64) {
    deviceId = uuid();
    secretB64 = b64urlEncode(randomBytes(32));
    await db.setMeta('deviceId', deviceId);
    await db.setMeta('secret', secretB64);
  }
  await attach(deviceId, b64urlDecode(secretB64));
  return app.identity;
}

/** @param {string} deviceId @param {Uint8Array} secret */
async function attach(deviceId, secret) {
  app.identity = {
    deviceId,
    secret,
    authToken: await deriveAuthToken(secret),
    encKey: await deriveEncKey(secret),
  };
  app.db.writer = deviceId;
}

/**
 * Adopt a restored identity (§6.13). Resets the sync cursor and registration so the next sync pulls everything.
 * @param {string} deviceId @param {Uint8Array} secret
 */
export async function adoptIdentity(deviceId, secret) {
  const db = app.db;
  await db.setMeta('deviceId', deviceId);
  await db.setMeta('secret', b64urlEncode(secret));
  await db.setMeta('syncCursor', 0);
  await db.delMeta('registeredAt');
  await db.delMeta('pushEndpoint');
  await attach(deviceId, secret);
}

/** Restore link; the secret lives only in the fragment (§4). */
export function restoreLink() {
  const id = app.identity;
  if (!id) return '';
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/restore/${id.deviceId}.${b64urlEncode(id.secret)}`;
}
