// POST /v1/sync (§8 "Sync semantics"). Server sees ciphertext only. DD-005

import { B64URL_RE, ID_RE, badRequest, isInt, isObj, json } from './util.js';

/** Synced stores (§5.2). Anything else → 400 (§17). */
export const SYNCED_STORES = new Set([
  'settings', 'profile', 'distractOptions', 'triggerTags', 'permissionThoughts', 'moments', 'checkins',
]);
export const MAX_CHANGES = 200;
export const MAX_CT = 64 * 1024;
const MAX_IV = 32;
/* DD-064: sync pull paginated at 500 rows */
/** Response page size; `more: true` when truncated. */
export const PAGE = 500;

/**
 * Validates one change and maps it to the compact JSON row fed to json_each().
 * @param {unknown} c
 */
function normalize(c) {
  if (!isObj(c)) throw badRequest();
  const { store, id, updatedAt, deleted = false, iv = null, ct = null } = c;
  if (typeof store !== 'string' || !SYNCED_STORES.has(store)) throw badRequest();
  if (typeof id !== 'string' || !ID_RE.test(id)) throw badRequest();
  if (!isInt(updatedAt) || updatedAt < 0) throw badRequest();
  if (typeof deleted !== 'boolean') throw badRequest();
  if (iv !== null && (typeof iv !== 'string' || iv.length > MAX_IV || !B64URL_RE.test(iv))) throw badRequest();
  if (ct !== null && (typeof ct !== 'string' || ct.length > MAX_CT || !B64URL_RE.test(ct))) throw badRequest();
  /* DD-065: live records must carry iv+ct; tombstones may omit them */
  if (!deleted && (iv === null || ct === null)) throw badRequest();
  return { s: store, i: id, u: updatedAt, d: deleted ? 1 : 0, v: iv, c: ct };
}

// One statement upserts all changes (cheap on CPU and on D1 query count).
// server_seq = old devices.seq + position + 1; LWW: write only if incoming updatedAt >= stored.
const UPSERT = `
INSERT INTO records (device_id, store, id, updated_at, deleted, iv, ct, server_seq)
SELECT ?1, json_extract(j.value, '$.s'), json_extract(j.value, '$.i'), json_extract(j.value, '$.u'),
       json_extract(j.value, '$.d'), json_extract(j.value, '$.v'), json_extract(j.value, '$.c'),
       d.seq + j.key + 1
FROM json_each(?2) AS j, devices AS d
WHERE d.id = ?1
ON CONFLICT (device_id, store, id) DO UPDATE SET
  updated_at = excluded.updated_at, deleted = excluded.deleted,
  iv = excluded.iv, ct = excluded.ct, server_seq = excluded.server_seq
WHERE excluded.updated_at >= records.updated_at`;

// Seq is bumped by n even when some rows lose LWW; gaps are harmless.
/* DD-066: seq reserved per incoming change (gaps allowed) so one set-based upsert stays atomic */
const BUMP = 'UPDATE devices SET seq = seq + ?2 WHERE id = ?1';

// Rows newer than the cursor, excluding this request's range (d.seq - n, d.seq].
const PULL = `
SELECT r.store, r.id, r.updated_at, r.deleted, r.iv, r.ct, r.server_seq, d.seq AS dev_seq
FROM devices AS d LEFT JOIN records AS r
  ON r.device_id = d.id AND r.server_seq > ?2 AND r.server_seq <= d.seq - ?3
WHERE d.id = ?1
ORDER BY r.server_seq
LIMIT ?4`;

/**
 * @param {unknown} body `{cursor, changes}`
 * @param {{id: string}} device
 * @param {{DB: any}} env
 * @returns {Promise<Response>} `{cursor, changes, more?}`
 */
export async function handleSync(body, device, env) {
  if (!isObj(body)) throw badRequest();
  const cursor = body.cursor == null ? 0 : body.cursor;
  if (!isInt(cursor) || cursor < 0) throw badRequest();
  const raw = body.changes == null ? [] : body.changes;
  if (!Array.isArray(raw)) throw badRequest();
  if (raw.length > MAX_CHANGES) throw badRequest();
  const rows = raw.map(normalize);
  const n = rows.length;

  const db = env.DB;
  const stmts = [];
  if (n) {
    stmts.push(db.prepare(UPSERT).bind(device.id, JSON.stringify(rows)));
    stmts.push(db.prepare(BUMP).bind(device.id, n));
  }
  stmts.push(db.prepare(PULL).bind(device.id, cursor, n, PAGE + 1));
  const results = await db.batch(stmts); // one transaction
  const pulled = results[results.length - 1].results || [];
  if (!pulled.length) throw new Error('device vanished');
  const devSeq = pulled[0].dev_seq;
  const found = pulled[0].server_seq == null ? [] : pulled; // LEFT JOIN with no match → one null row

  const more = found.length > PAGE;
  const page = more ? found.slice(0, PAGE) : found;
  const changes = page.map((r) => ({
    store: r.store, id: r.id, updatedAt: r.updated_at, deleted: !!r.deleted, iv: r.iv, ct: r.ct,
  }));
  // Not truncated: cursor jumps past this request's own writes so they never echo back.
  // Truncated: cursor = last seq returned; client calls again (own writes may then echo, harmless under LWW).
  const out = more
    ? { cursor: page[page.length - 1].server_seq, changes, more: true }
    : { cursor: devSeq, changes };
  return json(200, out);
}
