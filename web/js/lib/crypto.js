// @ts-check
/** §4 identity crypto: HKDF-SHA256, AES-GCM-256, base64url. WebCrypto only; works in browsers and Node ≥20. DD-005 */

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

/** @param {Uint8Array|ArrayBuffer} buf */
export function b64urlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} str @returns {Uint8Array} */
export function b64urlDecode(str) {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error('bad_b64url');
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** @param {number} n */
export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/** RFC 4122 v4 UUID. */
export function uuid() {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @param {Uint8Array} secret */
async function hkdfBase(secret) {
  return subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits', 'deriveKey']);
}

const SALT = enc.encode('moment');

/**
 * authToken = HKDF(secret, salt "moment", info "auth-v1", 32 bytes) as base64url.
 * @param {Uint8Array} secret
 */
export async function deriveAuthToken(secret) {
  const base = await hkdfBase(secret);
  const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode('auth-v1') }, base, 256);
  return b64urlEncode(bits);
}

/**
 * encKey = HKDF(secret, salt "moment", info "enc-v1") → AES-GCM-256, non-extractable.
 * @param {Uint8Array} secret
 */
export async function deriveEncKey(secret) {
  const base = await hkdfBase(secret);
  return subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode('enc-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/**
 * JSON → AES-GCM with random 12-byte IV.
 * @param {CryptoKey} key @param {unknown} value @returns {Promise<{iv:string, ct:string}>}
 */
export async function encryptJSON(key, value) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(value)));
  return { iv: b64urlEncode(iv), ct: b64urlEncode(ct) };
}

/** @param {CryptoKey} key @param {{iv:string, ct:string}} box */
export async function decryptJSON(key, box) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64urlDecode(box.iv) }, key, b64urlDecode(box.ct));
  return JSON.parse(dec.decode(pt));
}

/**
 * Parse a restore token "<deviceId>.<secretB64url>".
 * @param {string} token @returns {{deviceId:string, secret:Uint8Array}|null}
 */
export function parseRestoreToken(token) {
  try {
    const t = decodeURIComponent(String(token || '')).trim();
    const i = t.indexOf('.');
    if (i < 0) return null;
    const deviceId = t.slice(0, i);
    const secret = b64urlDecode(t.slice(i + 1));
    if (!UUID_RE.test(deviceId) || secret.length !== 32) return null;
    return { deviceId: deviceId.toLowerCase(), secret };
  } catch {
    return null;
  }
}
