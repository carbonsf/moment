// @ts-check
/** §9 client sync. Pure orchestration over injected adapters (testable without IDB or network). DD-003, DD-005 */

export const SYNCED_STORES = ['settings', 'profile', 'distractOptions', 'triggerTags', 'permissionThoughts', 'moments', 'checkins'];
export const MAX_CHANGES = 200;
export const BACKOFF_MIN_MS = 30_000;
export const BACKOFF_MAX_MS = 600_000;

/**
 * @typedef {{id:string, updatedAt:number, deleted?:boolean, writer?:string, [k:string]:any}} SyncRecord
 * @typedef {{key:number, store:string, id:string}} QueueEntry
 * @typedef {{store:string, id:string, updatedAt:number, deleted:boolean, iv:string, ct:string}} WireChange
 * @typedef {{
 *   readQueue: () => Promise<QueueEntry[]>,
 *   getRecord: (store:string, id:string) => Promise<SyncRecord|undefined>,
 *   applyRemote: (store:string, rec:SyncRecord) => Promise<void>,
 *   clearQueue: (keys:number[]) => Promise<void>,
 *   getCursor: () => Promise<number>,
 *   setCursor: (c:number) => Promise<void>,
 * }} SyncStore
 * @typedef {{
 *   store: SyncStore,
 *   post: (body:{cursor:number, changes:WireChange[]}) => Promise<{cursor:number, changes:WireChange[], more?:boolean}>,
 *   encrypt: (value:any) => Promise<{iv:string, ct:string}>,
 *   decrypt: (box:{iv:string, ct:string}) => Promise<any>,
 * }} SyncDeps
 */

/**
 * Last-writer-wins: newer updatedAt wins; ties go to the higher writer id (device id), so every replica converges. DD-041
 * @param {SyncRecord|undefined} local @param {SyncRecord} incoming
 */
export function shouldApply(local, incoming) {
  if (!local) return true;
  if (incoming.updatedAt !== local.updatedAt) return incoming.updatedAt > local.updatedAt;
  return String(incoming.writer || '') > String(local.writer || '');
}

/**
 * Records held back from sync: active moments sync on close only (§9).
 * @param {string} store @param {SyncRecord|undefined} rec
 */
export function isHeldBack(store, rec) {
  return store === 'moments' && !!rec && rec.status === 'active' && !rec.deleted;
}

/**
 * One sync run. Never throws on data issues; network errors propagate for backoff.
 * @param {SyncDeps} deps @returns {Promise<{sent:number, received:number}>}
 */
export async function runSync(deps) {
  const { store } = deps;
  const queue = await store.readQueue();
  // Collapse duplicates; remember every queue key per (store,id).
  /** @type {Map<string, {store:string, id:string, keys:number[]}>} */
  const byRec = new Map();
  for (const q of queue) {
    const k = `${q.store}\u0000${q.id}`;
    const e = byRec.get(k) || { store: q.store, id: q.id, keys: [] };
    e.keys.push(q.key);
    byRec.set(k, e);
  }
  /** @type {{change:WireChange, keys:number[]}[]} */
  const outgoing = [];
  /** @type {number[]} */
  const dropKeys = [];
  for (const e of byRec.values()) {
    if (!SYNCED_STORES.includes(e.store)) { dropKeys.push(...e.keys); continue; }
    const rec = await store.getRecord(e.store, e.id);
    if (!rec) { dropKeys.push(...e.keys); continue; }
    if (isHeldBack(e.store, rec)) continue;
    const box = await deps.encrypt(rec);
    outgoing.push({
      change: { store: e.store, id: rec.id, updatedAt: rec.updatedAt, deleted: !!rec.deleted, iv: box.iv, ct: box.ct },
      keys: e.keys,
    });
  }
  if (dropKeys.length) await store.clearQueue(dropKeys);

  let cursor = (await store.getCursor()) || 0;
  let sent = 0;
  let received = 0;
  let i = 0;
  // Send in chunks of ≤200; keep pulling while the server says there's more.
  for (;;) {
    const chunk = outgoing.slice(i, i + MAX_CHANGES);
    i += chunk.length;
    const res = await deps.post({ cursor, changes: chunk.map((c) => c.change) });
    for (const ch of res.changes || []) {
      if (!SYNCED_STORES.includes(ch.store)) continue;
      /** @type {SyncRecord} */
      let rec;
      try {
        rec = ch.deleted && !ch.ct ? { id: ch.id, updatedAt: ch.updatedAt, deleted: true } : await deps.decrypt({ iv: ch.iv, ct: ch.ct });
      } catch {
        continue; // undecryptable (different identity); skip
      }
      if (!rec || rec.id !== ch.id) continue;
      const local = await store.getRecord(ch.store, ch.id);
      if (shouldApply(local, rec)) {
        await store.applyRemote(ch.store, rec);
        received++;
      }
    }
    const keys = chunk.flatMap((c) => c.keys);
    if (keys.length) await store.clearQueue(keys);
    sent += chunk.length;
    if (typeof res.cursor === 'number' && res.cursor > cursor) cursor = res.cursor;
    await store.setCursor(cursor);
    if (i >= outgoing.length && !res.more) break;
  }
  return { sent, received };
}

/** Exponential backoff 30 s → 10 min (§9). */
export function createBackoff() {
  let failures = 0;
  return {
    /** Delay before the next attempt after a failure. */
    fail() {
      failures++;
      return Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** (failures - 1));
    },
    ok() { failures = 0; },
    get failures() { return failures; },
  };
}
