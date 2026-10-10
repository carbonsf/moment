// @ts-check
/**
 * IndexedDB on the device is the source of truth; sync.js copies it, encrypted, to Moment's Worker.
 * Stores: entries (soft-deleted so deletes sync), meta (identity, cursor), queue (ids waiting to sync).
 * Falls back to memory if IDB is unavailable.
 */

/** @typedef {{id:string, text:string, createdAt:number, updatedAt:number, deleted?:boolean, writer?:string}} Entry */
/** @typedef {{id:string, queuedAt:number}} Queued */

const STORES = ['entries', 'meta', 'queue'];

/**
 * @typedef {{
 *   all: () => Promise<Entry[]>,
 *   get: (id:string) => Promise<Entry|undefined>,
 *   put: (e:Entry) => Promise<void>,
 *   putMany: (es:Entry[]) => Promise<void>,
 *   putRemote: (e:Entry) => Promise<void>,
 *   queued: () => Promise<Queued[]>,
 *   unqueue: (sent:Queued[]) => Promise<void>,
 *   enqueueAll: () => Promise<void>,
 *   getMeta: (k:string) => Promise<any>,
 *   setMeta: (k:string, v:any) => Promise<void>,
 *   delMeta: (k:string) => Promise<void>,
 *   memory: boolean,
 * }} DB
 */

/** @returns {Promise<DB>} */
export async function openDB() {
  /** @type {{get:(s:string,k:string)=>Promise<any>, getAll:(s:string)=>Promise<any[]>, write:(ops:{store:string, value?:any, del?:string}[])=>Promise<void>}} */
  let b;
  let memory = false;
  try {
    /** @type {IDBDatabase} */
    const idb = await new Promise((res, rej) => {
      const r = indexedDB.open('gratitude', 2);
      r.onupgradeneeded = () => {
        for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('blocked'));
    });
    const req = (/** @type {string} */ s, /** @type {(o:IDBObjectStore)=>IDBRequest} */ fn) => new Promise((res, rej) => {
      const q = fn(idb.transaction(s, 'readonly').objectStore(s));
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    b = {
      get: (s, k) => req(s, (o) => o.get(k)),
      getAll: (s) => req(s, (o) => o.getAll()),
      // One transaction for a batch, so an entry and its queue mark land together.
      write: (ops) => new Promise((res, rej) => {
        const t = idb.transaction([...new Set(ops.map((o) => o.store))], 'readwrite');
        for (const o of ops) { const st = t.objectStore(o.store); if (o.del != null) st.delete(o.del); else st.put(o.value); }
        t.oncomplete = () => res(undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
    };
  } catch (e) {
    console.warn('IndexedDB unavailable; entries will not be saved', e);
    memory = true;
    /** @type {Record<string, Map<string, any>>} */
    const m = Object.fromEntries(STORES.map((s) => [s, new Map()]));
    b = {
      get: async (s, k) => structuredClone(m[s].get(k)),
      getAll: async (s) => [...m[s].values()].map((v) => structuredClone(v)),
      write: async (ops) => { for (const o of ops) { if (o.del != null) m[o.store].delete(o.del); else m[o.store].set(o.store === 'meta' ? o.value.key : o.value.id, structuredClone(o.value)); } },
    };
  }

  // Entries from before sync existed have no updatedAt.
  const norm = (/** @type {any} */ e) => ({ ...e, updatedAt: e.updatedAt ?? e.createdAt });
  const mark = (/** @type {Entry} */ e) => ({ store: 'queue', value: { id: e.id, queuedAt: Date.now() } });

  return {
    all: async () => (await b.getAll('entries')).map(norm).sort((x, y) => x.createdAt - y.createdAt),
    get: async (id) => { const e = await b.get('entries', id); return e && norm(e); },
    put: (e) => b.write([{ store: 'entries', value: e }, mark(e)]),
    putMany: (es) => b.write(es.flatMap((e) => [{ store: 'entries', value: e }, mark(e)])),
    putRemote: (e) => b.write([{ store: 'entries', value: e }]),
    queued: () => b.getAll('queue'),
    // Only clear marks that haven't been touched since they were sent (an edit mid-sync stays queued).
    unqueue: async (sent) => {
      const now = new Map((await b.getAll('queue')).map((q) => [q.id, q.queuedAt]));
      const ops = sent.filter((q) => now.get(q.id) === q.queuedAt).map((q) => ({ store: 'queue', del: q.id }));
      if (ops.length) await b.write(ops);
    },
    enqueueAll: async () => {
      const es = await b.getAll('entries');
      if (es.length) await b.write(es.map(mark));
    },
    getMeta: async (k) => (await b.get('meta', k))?.v,
    setMeta: (k, v) => b.write([{ store: 'meta', value: { key: k, v } }]),
    delMeta: (k) => b.write([{ store: 'meta', del: k }]),
    memory,
  };
}
