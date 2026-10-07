// Web Push with WebCrypto only (§3.2): RFC 8291 aes128gcm encryption + RFC 8292 VAPID (ES256).
// No Node built-ins; runs in Workers and Node >= 20.

import { b64urlDecode, b64urlEncode } from './util.js';

const enc = new TextEncoder();
const RS = 4096;
const JWT_TTL = 12 * 3600; // s; §7.3 12 h exp
const JWT_MIN_LEFT = 3600; // s; reuse cached JWT only if > 1 h left

/** Push request headers (§7.3). DD-019: payload carries no user content. */
export const PUSH_HEADERS = Object.freeze({
  TTL: '1800',
  Urgency: 'normal',
  Topic: 'checkin',
  'Content-Encoding': 'aes128gcm',
  'Content-Type': 'application/octet-stream',
});

/** @param {...Uint8Array} parts @returns {Uint8Array} */
export function concat(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/**
 * HKDF-SHA256 (extract + expand) via WebCrypto.
 * @param {Uint8Array} salt @param {Uint8Array} ikm @param {Uint8Array} info @param {number} len bytes
 * @returns {Promise<Uint8Array>}
 */
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

/**
 * RFC 8291 message encryption: single aes128gcm record, rs 4096, delimiter 0x02, no extra padding.
 * @param {Uint8Array} plaintext
 * @param {string} p256dhB64 UA public key (uncompressed point, base64url)
 * @param {string} authB64 UA auth secret (16 bytes, base64url)
 * @param {{salt?: Uint8Array, localKeys?: CryptoKeyPair}} [testOpts] fixed salt / ephemeral keys (test vectors only)
 * @returns {Promise<Uint8Array>} aes128gcm body
 */
export async function encryptPayload(plaintext, p256dhB64, authB64, testOpts = {}) {
  const uaPublic = b64urlDecode(p256dhB64);
  const authSecret = b64urlDecode(authB64);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('bad subscription keys');
  if (plaintext.length + 1 + 16 > RS) throw new Error('payload too large');

  const local = testOpts.localKeys ||
    await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const salt = testOpts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([2])); // last-record delimiter
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // Header: salt(16) || rs(uint32 BE) || idlen(1) || keyid(as_public, 65)
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RS);
  header[20] = 65;
  header.set(asPublic, 21);
  return concat(header, ct);
}

/** @type {Map<string, Promise<{privateKey: CryptoKey, publicKey: string}>>} isolate-level cache */
const keyCache = new Map();

/**
 * Imports VAPID_PRIVATE_JWK (JSON string, P-256 with x, y, d). Public key = 0x04 || x || y.
 * Cached per isolate: config is immutable, saves CPU every cron run.
 * @param {string} jwkJson
 * @returns {Promise<{privateKey: CryptoKey, publicKey: string}>}
 */
export function importVapidKey(jwkJson) {
  let p = keyCache.get(jwkJson);
  if (!p) {
    p = (async () => {
      const j = JSON.parse(jwkJson);
      if (j.kty !== 'EC' || j.crv !== 'P-256' || !j.x || !j.y || !j.d) throw new Error('bad VAPID key');
      const privateKey = await crypto.subtle.importKey(
        'jwk', { kty: 'EC', crv: 'P-256', x: j.x, y: j.y, d: j.d, ext: false },
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
      );
      const publicKey = b64urlEncode(concat(new Uint8Array([4]), b64urlDecode(j.x), b64urlDecode(j.y)));
      return { privateKey, publicKey };
    })();
    p.catch(() => keyCache.delete(jwkJson));
    keyCache.set(jwkJson, p);
  }
  return p;
}

/**
 * VAPID `sub` must be a mailto: or https: URI (Apple rejects bare addresses); add mailto: when missing. DD-078
 * @param {string} sub
 */
export function normalizeSubject(sub) {
  const s = String(sub || '').trim();
  return /^(mailto|https):/i.test(s) ? s : `mailto:${s}`;
}

/**
 * Signs an RFC 8292 VAPID JWT (ES256). WebCrypto ECDSA output is already r||s (JWS format).
 * @param {string} aud push service origin
 * @param {string} sub VAPID_SUBJECT (mailto:)
 * @param {number} exp epoch seconds
 * @param {CryptoKey} privateKey
 * @returns {Promise<string>}
 */
export async function signVapidJwt(aud, sub, exp, privateKey) {
  const head = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64urlEncode(enc.encode(JSON.stringify({ aud, exp, sub })));
  const input = `${head}.${body}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(input));
  return `${input}.${b64urlEncode(sig)}`;
}

/**
 * VAPID Authorization header for a push service origin, cached in `vapid_cache` (§7.3).
 * Reuses the cached JWT while exp > now + 1 h; else signs a new one with a 12 h exp.
 * @param {{DB: any, VAPID_PRIVATE_JWK: string, VAPID_SUBJECT: string}} env
 * @param {string} audience origin, e.g. https://web.push.apple.com
 * @param {number} now epoch ms
 * @param {Map<string, string>} [memo] per-run memo to skip repeat D1 reads
 * @returns {Promise<string>} `vapid t=<jwt>, k=<publicKey>`
 */
export async function vapidAuthorization(env, audience, now, memo) {
  if (memo && memo.has(audience)) return /** @type {string} */ (memo.get(audience));
  const { privateKey, publicKey } = await importVapidKey(env.VAPID_PRIVATE_JWK);
  const nowSec = Math.floor(now / 1000);
  const row = await env.DB.prepare('SELECT jwt, exp FROM vapid_cache WHERE audience = ?').bind(audience).first();
  let jwt;
  if (row && row.exp > nowSec + JWT_MIN_LEFT) {
    jwt = row.jwt;
  } else {
    const exp = nowSec + JWT_TTL;
    jwt = await signVapidJwt(audience, normalizeSubject(env.VAPID_SUBJECT), exp, privateKey);
    await env.DB.prepare(
      'INSERT INTO vapid_cache (audience, jwt, exp) VALUES (?1, ?2, ?3) ' +
      'ON CONFLICT (audience) DO UPDATE SET jwt = excluded.jwt, exp = excluded.exp'
    ).bind(audience, jwt, exp).run();
  }
  const header = `vapid t=${jwt}, k=${publicKey}`;
  if (memo) memo.set(audience, header);
  return header;
}

/**
 * Encrypts and POSTs one push message.
 * @param {{endpoint: string, p256dh: string, auth: string}} sub
 * @param {object} payload JSON-serializable, e.g. {t:'checkin', id, kind}
 * @param {string} authorization from vapidAuthorization()
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<number>} HTTP status, or 0 on network error
 */
export async function sendPush(sub, payload, authorization, fetchImpl) {
  const body = await encryptPayload(enc.encode(JSON.stringify(payload)), sub.p256dh, sub.auth);
  try {
    const res = await fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: { ...PUSH_HEADERS, Authorization: authorization },
      body,
    });
    if (res.body) res.body.cancel().catch(() => {}); // free the connection; body unused
    return res.status;
  } catch {
    return 0;
  }
}
