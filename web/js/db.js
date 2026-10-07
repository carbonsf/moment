// @ts-check
/**
 * IndexedDB wrapper + migrations (§5.2). IDB is the source of truth (DD-003).
 * Falls back to an in-memory backend when IDB is unavailable or over quota (E19).
 * Writes to synced stores stamp common fields and enqueue {store,id} in syncQueue in the same transaction (§9).
 */
import { SYNCED_STORES } from './lib/sync.js';
import { uuid } from './lib/crypto.js';

export const DB_NAME = 'moment-db';
export const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const ALL_STORES = ['meta', 'settings', 'profile', 'distractOptions', 'triggerTags', 'permissionThoughts', 'moments', 'checkins', 'syncQueue'];

/**
 * Migrations by target version. Future: v2 adds `reflections` (§18, reserved for #/reflect).
 * @type {Record<number, (db:IDBDatabase) => void>}
 */
const MIGRATIONS = {
  1: (db) => {
    db.createObjectStore('meta', { keyPath: 'key' });
    for (const s of ['settings', 'profile', 'distractOptions', 'triggerTags', 'permissionThoughts', 'moments']) {
      db.createObjectStore(s, { keyPath: 'id' });
    }
    const c = db.createObjectStore('checkins', { keyPath: 'id' });
    c.createIndex('dueAt', 'dueAt');
    db.createObjectStore('syncQueue', { keyPath: 'key', autoIncrement: true });
  },
};

/**
 * @typedef {{
 *   get(store:string, key:any): Promise<any>,
 *   getAll(store:string): Promise<any[]>,
 *   write(ops:{store:string, value?:any, del?:any}[]): Promise<void>,
 *   clear(store:string): Promise<void>,
 * }} Backend
 */

/** @param {IDBRequest} req @returns {Promise<any>} */
function reqP(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

/** @param {IDBDatabase} idb @returns {Backend} */
function idbBackend(idb) {
  return {
    async get(store, key) {
      return reqP(idb.transaction(store).objectStore(store).get(key));
    },
    async getAll(store) {
      return reqP(idb.transaction(store).objectStore(store).getAll());
    },
    write(ops) {
      const stores = [...new Set(ops.map((o) => o.store))];
      return new Promise((res, rej) => {
        const tx = idb.transaction(stores, 'readwrite');
        for (const o of ops) {
          const os = tx.objectStore(o.store);
          if (o.del !== undefined) os.delete(o.del);
          else os.put(o.value);
        }
        tx.oncomplete = () => res(undefined);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      });
    },
    async clear(store) {
      await reqP(idb.transaction(store, 'readwrite').objectStore(store).clear());
    },
  };
}

/** @returns {Backend & {dump: Map<string, Map<any, any>>}} */
function memBackend() {
  /** @type {Map<string, Map<any, any>>} */
  const m = new Map(ALL_STORES.map((s) => [s, new Map()]));
  let auto = 1;
  const keyOf = (/** @type {string} */ store, /** @type {any} */ v) => (store === 'meta' ? v.key : store === 'syncQueue' ? v.key : v.id);
  return {
    dump: m,
    async get(store, key) { return structuredClone(m.get(store)?.get(key)); },
    async getAll(store) { return [...(m.get(store)?.values() || [])].map((v) => structuredClone(v)); },
    async write(ops) {
      for (const o of ops) {
        const s = /** @type {Map<any, any>} */ (m.get(o.store));
        if (o.del !== undefined) { s.delete(o.del); continue; }
        const v = structuredClone(o.value);
        if (o.store === 'syncQueue' && v.key == null) v.key = auto++;
        s.set(keyOf(o.store, v), v);
      }
    },
    async clear(store) { m.get(store)?.clear(); },
  };
}

/** @returns {Promise<IDBDatabase>} */
function openIdb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no_idb'));
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      return rej(e);
    }
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      for (let v = (ev.oldVersion || 0) + 1; v <= DB_VERSION; v++) MIGRATIONS[v]?.(db);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error('blocked'));
  });
}

/** @param {unknown} e */
function isQuota(e) {
  const name = /** @type {any} */ (e)?.name || '';
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED';
}

/** Database facade used by the app. */
export class DB {
  /** @param {Backend} backend @param {IDBDatabase|null} idb */
  constructor(backend, idb) {
    this.backend = backend;
    this.idb = idb;
    this.memoryMode = !idb;
    /** Device id stamped as `writer` on synced records (LWW tie-break, DD-041). */
    this.writer = '';
    /** @type {Set<(ev:{store:string, id:string, remote:boolean}) => void>} */
    this.listeners = new Set();
    /** @type {BroadcastChannel|null} */
    this.channel = null;
    try {
      this.channel = new BroadcastChannel('moment'); // E17
      this.channel.onmessage = (ev) => this.emit({ ...ev.data, remote: true });
    } catch { /* unsupported */ }
  }

  /** @param {{store:string, id:string, remote:boolean}} ev */
  emit(ev) {
    for (const fn of this.listeners) {
      try { fn(ev); } catch (e) { console.error(e); }
    }
  }

  /** @param {(ev:{store:string, id:string, remote:boolean}) => void} fn */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** @param {string} store @param {string} id */
  notify(store, id) {
    this.emit({ store, id, remote: false });
    try { this.channel?.postMessage({ store, id }); } catch { /* closed */ }
  }

  /** Switch to memory mode after a quota error, carrying current data over. DD-077 */
  async fallbackToMemory() {
    if (this.memoryMode) return;
    const mem = memBackend();
    for (const s of ALL_STORES) {
      try {
        await mem.write((await this.backend.getAll(s)).map((value) => ({ store: s, value })));
      } catch { /* best effort */ }
    }
    this.backend = mem;
    this.memoryMode = true;
    this.emit({ store: 'meta', id: 'memoryMode', remote: false });
  }

  /** @param {{store:string, value?:any, del?:any}[]} ops */
  async write(ops) {
    try {
      await this.backend.write(ops);
    } catch (e) {
      if (!isQuota(e)) throw e;
      await this.fallbackToMemory();
      await this.backend.write(ops);
    }
  }

  /** @param {string} store @param {string} id */
  get(store, id) {
    return this.backend.get(store, id);
  }

  /** All records including tombstones. @param {string} store */
  getAllRaw(store) {
    return this.backend.getAll(store);
  }

  /** Live records (not deleted). @param {string} store */
  async list(store) {
    return (await this.backend.getAll(store)).filter((r) => !r.deleted);
  }

  /**
   * Put a record. Synced stores get common fields stamped and a queue entry (§5.1, §9).
   * @template T @param {string} store @param {T & {id:string}} rec @returns {Promise<T & {id:string, updatedAt:number}>}
   */
  async put(store, rec) {
    const now = Date.now();
    /** @type {any} */
    const v = { ...rec };
    if (SYNCED_STORES.includes(store)) {
      const prev = await this.backend.get(store, v.id);
      v.createdAt = v.createdAt || prev?.createdAt || now;
      v.updatedAt = Math.max(now, (prev?.updatedAt || 0) + 1);
      v.deleted = !!v.deleted;
      v.v = SCHEMA_VERSION;
      v.writer = this.writer;
      await this.write([{ store, value: v }, { store: 'syncQueue', value: { store, id: v.id, queuedAt: now } }]);
    } else {
      await this.write([{ store, value: v }]);
    }
    this.notify(store, v.id);
    return v;
  }

  /** Put many records of one store in a single transaction. @param {string} store @param {any[]} recs */
  async putMany(store, recs) {
    if (!recs.length) return;
    const now = Date.now();
    /** @type {{store:string, value:any}[]} */
    const ops = [];
    for (const rec of recs) {
      const prev = await this.backend.get(store, rec.id);
      const v = { ...rec, createdAt: rec.createdAt || prev?.createdAt || now, updatedAt: Math.max(now, (prev?.updatedAt || 0) + 1), deleted: !!rec.deleted, v: SCHEMA_VERSION, writer: this.writer };
      ops.push({ store, value: v }, { store: 'syncQueue', value: { store, id: v.id, queuedAt: now } });
    }
    await this.write(ops);
    this.notify(store, '*');
  }

  /** Apply a record from the server without enqueueing (sync applyRemote). @param {string} store @param {any} rec */
  async putRemote(store, rec) {
    await this.write([{ store, value: rec }]);
    this.notify(store, rec.id);
  }

  /** Soft-delete in synced stores (tombstone syncs), hard delete otherwise. @param {string} store @param {string} id */
  async remove(store, id) {
    if (SYNCED_STORES.includes(store)) {
      const prev = await this.backend.get(store, id);
      if (!prev) return;
      // Keep only identity fields in the tombstone so deleted content doesn't linger. DD-056
      await this.put(store, { id, deleted: true, createdAt: prev.createdAt });
    } else {
      await this.write([{ store, del: id }]);
      this.notify(store, id);
    }
  }

  /** @param {string} key */
  async getMeta(key) {
    return (await this.backend.get('meta', key))?.value;
  }

  /** @param {string} key @param {any} value */
  async setMeta(key, value) {
    await this.write([{ store: 'meta', value: { key, value } }]);
  }

  /** @param {string} key */
  async delMeta(key) {
    await this.write([{ store: 'meta', del: key }]);
  }

  /** Adapter for lib/sync.js. @returns {import('./lib/sync.js').SyncStore} */
  syncAdapter() {
    return {
      readQueue: async () => (await this.backend.getAll('syncQueue')).map((q) => ({ key: q.key, store: q.store, id: q.id })),
      getRecord: (store, id) => this.backend.get(store, id),
      applyRemote: (store, rec) => this.putRemote(store, rec),
      clearQueue: (keys) => this.write(keys.map((k) => ({ store: 'syncQueue', del: k }))),
      getCursor: async () => (await this.getMeta('syncCursor')) || 0,
      setCursor: (c) => this.setMeta('syncCursor', c),
    };
  }

  /** Enqueue every live record of every synced store (used after restore-merge). */
  async enqueueAll() {
    const now = Date.now();
    /** @type {{store:string, value:any}[]} */
    const ops = [];
    for (const s of SYNCED_STORES) for (const r of await this.backend.getAll(s)) ops.push({ store: 'syncQueue', value: { store: s, id: r.id, queuedAt: now } });
    if (ops.length) await this.write(ops);
  }

  async pendingCount() {
    return (await this.backend.getAll('syncQueue')).length;
  }

  /** Clear every store (in place; used by restore-replace). */
  async clearAll() {
    for (const s of ALL_STORES) await this.backend.clear(s);
  }

  /** Delete the whole database (Delete everything). */
  async destroy() {
    try { this.idb?.close(); } catch { /* ignore */ }
    if (this.memoryMode || typeof indexedDB === 'undefined') {
      for (const s of ALL_STORES) await this.backend.clear(s);
      return;
    }
    await new Promise((res) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => res(undefined);
    });
  }
}

/** Open the database; memory mode if IDB is unavailable (E19). @returns {Promise<DB>} */
export async function openDB() {
  try {
    const idb = await openIdb();
    // Probe a write: some private modes open but refuse writes.
    const db = new DB(idbBackend(idb), idb);
    await db.backend.write([{ store: 'meta', value: { key: 'schemaVersion', value: SCHEMA_VERSION } }]);
    idb.onversionchange = () => idb.close();
    return db;
  } catch (e) {
    console.warn('IndexedDB unavailable; memory mode', e);
    return new DB(memBackend(), null);
  }
}

export { uuid };
