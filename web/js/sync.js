// @ts-check
/**
 * Sync through Moment's Worker and D1 database. Same protocol as Moment (POST /v1/sync, last writer wins),
 * one store: 'gratitude'. The server only ever sees ciphertext; the key comes from a secret that stays on the
 * device except in the backup link. Moment's client skips stores it doesn't know, so a shared identity is safe.
 */
import { uuid, randomBytes, b64urlEncode, b64urlDecode, deriveAuthToken, deriveEncKey, encryptJSON, decryptJSON, parseRestoreToken } from './crypto.js';

/** Moment's Worker. Must also be in index.html's CSP connect-src. */
export const API_BASE = 'https://moment-api.davidmgoehring.workers.dev';
const STORE = 'gratitude';
const MAX_CHANGES = 200;
const DEBOUNCE_MS = 2000;
const INTERVAL_MS = 5 * 60_000;

/** @typedef {import('./db.js').DB} DB */
/** @typedef {import('./db.js').Entry} Entry */
/** @typedef {{deviceId:string, secret:Uint8Array, authToken:string, encKey:CryptoKey}} Identity */

/** @type {DB} */ let db;
/** @type {Identity|null} */ let identity = null;
/** @type {(received:number) => void} */ let onReceive = () => {};
let running = false, again = false, failures = 0;
/** @type {ReturnType<typeof setTimeout>|undefined} */ let debounceT;
/** @type {ReturnType<typeof setTimeout>|undefined} */ let retryT;

class ApiError extends Error {
  /** @param {string} code @param {number} status 0 = offline */
  constructor(code, status) { super(code); this.status = status; }
}

/** @param {string} method @param {string} path @param {any} [body] @param {boolean} [auth] */
async function call(method, path, body, auth = true) {
  /** @type {Record<string,string>} */
  const headers = { 'Content-Type': 'application/json' };
  if (auth && identity) headers.Authorization = `Bearer ${identity.deviceId}.${identity.authToken}`;
  let res;
  try {
    res = await fetch(`${API_BASE}/v1${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    });
  } catch { throw new ApiError('offline', 0); }
  if (!res.ok) throw new ApiError(`http_${res.status}`, res.status);
  return res.status === 204 ? null : res.json();
}

/** @param {string} deviceId @param {Uint8Array} secret */
async function attach(deviceId, secret) {
  identity = { deviceId, secret, authToken: await deriveAuthToken(secret), encKey: await deriveEncKey(secret) };
}

/** Last writer wins; ties go to the higher writer id so every copy agrees (Moment DD-041). @param {Entry|undefined} local @param {Entry} incoming */
const shouldApply = (local, incoming) => !local
  || (incoming.updatedAt !== local.updatedAt ? incoming.updatedAt > local.updatedAt : String(incoming.writer || '') > String(local.writer || ''));

/** One sync run: push what's queued, pull what's new. Network errors throw (for backoff). @returns {Promise<number>} received */
async function runSync() {
  if (!identity) return 0;
  const id = identity;
  if (!(await db.getMeta('registeredAt'))) {
    await call('POST', '/devices', { deviceId: id.deviceId, authToken: id.authToken }, false);
    await db.setMeta('registeredAt', Date.now());
  }
  const queued = await db.queued();
  /** @type {{q:import('./db.js').Queued, change:any}[]} */
  const out = [];
  for (const q of queued) {
    const e = await db.get(q.id);
    if (!e) { await db.unqueue([q]); continue; }
    const box = await encryptJSON(id.encKey, e);
    out.push({ q, change: { store: STORE, id: e.id, updatedAt: e.updatedAt, deleted: !!e.deleted, iv: box.iv, ct: box.ct } });
  }
  let cursor = (await db.getMeta('cursor')) || 0;
  let received = 0, i = 0;
  for (;;) {
    const chunk = out.slice(i, i + MAX_CHANGES);
    i += chunk.length;
    const res = await call('POST', '/sync', { cursor, changes: chunk.map((c) => c.change) });
    for (const ch of res.changes || []) {
      if (ch.store !== STORE || !ch.ct) continue; // Moment's records, when sharing its identity
      /** @type {Entry} */ let e;
      try { e = await decryptJSON(id.encKey, ch); } catch { continue; }
      if (!e || e.id !== ch.id || typeof e.text !== 'string') continue;
      if (shouldApply(await db.get(e.id), e)) { await db.putRemote(e); received++; }
    }
    if (chunk.length) await db.unqueue(chunk.map((c) => c.q));
    if (typeof res.cursor === 'number' && res.cursor > cursor) cursor = res.cursor;
    await db.setMeta('cursor', cursor);
    if (i >= out.length && !res.more) break;
  }
  return received;
}

/** Sync now; never throws. Retries with backoff (30 s → 10 min) when it can't reach the server. */
export async function syncNow() {
  if (!identity || db.memory) return;
  if (running) { again = true; return; }
  running = true;
  try {
    const n = await runSync();
    failures = 0;
    await db.setMeta('lastSyncAt', Date.now());
    if (n) onReceive(n);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) await db.delMeta('registeredAt'); // register again next time
    else if (!(e instanceof ApiError)) console.warn('sync', e);
    clearTimeout(retryT);
    retryT = setTimeout(syncNow, Math.min(600_000, 30_000 * 2 ** failures++));
  } finally {
    running = false;
    if (again) { again = false; schedule(); }
  }
}

/** After a local change. */
export function schedule() {
  clearTimeout(debounceT);
  debounceT = setTimeout(syncNow, DEBOUNCE_MS);
}

/**
 * Load or create this device's identity and start syncing: now, after changes, every 5 min while open, on reconnect.
 * @param {DB} d @param {(received:number) => void} cb called after a sync brings in changes
 */
export async function startSync(d, cb) {
  db = d;
  onReceive = cb;
  let deviceId = await db.getMeta('deviceId');
  let secret = await db.getMeta('secret');
  if (!deviceId || !secret) {
    deviceId = uuid();
    secret = b64urlEncode(randomBytes(32));
    await db.setMeta('deviceId', deviceId);
    await db.setMeta('secret', secret);
  }
  await attach(deviceId, b64urlDecode(secret));
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, INTERVAL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  syncNow();
}

/** The backup link: opening it (or pasting it) on another device brings everything back. Secret lives only in the fragment. */
export function backupLink() {
  if (!identity) return '';
  return `${location.origin}${location.pathname}#/restore/${identity.deviceId}.${b64urlEncode(identity.secret)}`;
}

/**
 * Switch to the identity in a backup link (Gratitude's or Moment's). Entries already here are kept and sent up too.
 * @param {string} linkOrToken @returns {Promise<boolean>} false if it isn't a valid link
 */
export async function adoptLink(linkOrToken) {
  const raw = String(linkOrToken || '').trim();
  const m = raw.match(/#\/restore\/([^?\s]+)/);
  const parsed = parseRestoreToken(m ? m[1] : raw);
  if (!parsed) return false;
  if (identity && parsed.deviceId === identity.deviceId) return true;
  await db.setMeta('deviceId', parsed.deviceId);
  await db.setMeta('secret', b64urlEncode(parsed.secret));
  await db.setMeta('cursor', 0);
  await db.delMeta('registeredAt');
  await attach(parsed.deviceId, parsed.secret);
  await db.enqueueAll();
  await syncNow();
  return true;
}

/** Stamped on entries as `writer` (the tie-break above). */
export const writerId = () => identity?.deviceId || '';
