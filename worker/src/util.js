// Shared helpers: HTTP errors, JSON responses, validation, base64url, clock.

/** Error carrying an HTTP status and a stable `{error: code}` body. */
export class HttpError extends Error {
  /** @param {number} status @param {string} code */
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** @returns {HttpError} */
export const badRequest = () => new HttpError(400, 'bad_request');

/**
 * JSON response.
 * @param {number} status
 * @param {unknown} body
 * @returns {Response}
 */
export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** @returns {Response} */
export const noContent = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

/**
 * Current time in epoch ms. Tests inject `env.__now` (number or () => number).
 * @param {{__now?: number | (() => number)}} env
 * @returns {number}
 */
export function nowMs(env) {
  const n = env && env.__now;
  if (typeof n === 'function') return n();
  if (typeof n === 'number') return n;
  return Date.now();
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const B64URL_RE = /^[A-Za-z0-9_-]*$/;
/* DD-063: ids must match [A-Za-z0-9_-]{1,64} */
/** Record / check-in ids: uuid-ish. */
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** @param {unknown} v @returns {v is Record<string, unknown>} */
export const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** @param {unknown} v @returns {v is number} */
export const isInt = (v) => typeof v === 'number' && Number.isSafeInteger(v);

/**
 * base64url (no padding) → bytes. Throws on invalid input.
 * @param {string} s
 * @returns {Uint8Array}
 */
export function b64urlDecode(s) {
  if (typeof s !== 'string' || !B64URL_RE.test(s) || s.length % 4 === 1) throw badRequest();
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * bytes → base64url (no padding).
 * @param {ArrayBuffer | Uint8Array} buf
 * @returns {string}
 */
export function b64urlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
