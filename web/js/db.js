// @ts-check
/** IndexedDB on the device is the only copy (export from Look back to keep a backup). Falls back to memory if IDB is unavailable. */

/** @typedef {{id:string, text:string, createdAt:number, updatedAt?:number}} Entry */

/**
 * @returns {Promise<{all:()=>Promise<Entry[]>, put:(e:Entry)=>Promise<void>, putMany:(es:Entry[])=>Promise<void>, del:(id:string)=>Promise<void>, memory:boolean}>}
 */
export async function openDB() {
  try {
    /** @type {IDBDatabase} */
    const idb = await new Promise((res, rej) => {
      const r = indexedDB.open('gratitude', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('entries', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    /** @template T @param {IDBTransactionMode} mode @param {(s:IDBObjectStore)=>IDBRequest<T>|void} fn @returns {Promise<T|undefined>} */
    const tx = (mode, fn) => new Promise((res, rej) => {
      const t = idb.transaction('entries', mode);
      const req = fn(t.objectStore('entries'));
      t.oncomplete = () => res(req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
    return {
      all: async () => /** @type {Entry[]} */ ((await tx('readonly', (s) => s.getAll())) || []).sort((a, b) => a.createdAt - b.createdAt),
      put: async (e) => { await tx('readwrite', (s) => { s.put(e); }); },
      putMany: async (es) => { await tx('readwrite', (s) => { for (const e of es) s.put(e); }); },
      del: async (id) => { await tx('readwrite', (s) => { s.delete(id); }); },
      memory: false,
    };
  } catch (e) {
    console.warn('IndexedDB unavailable; entries will not be saved', e);
    /** @type {Map<string, Entry>} */
    const m = new Map();
    return {
      all: async () => [...m.values()].sort((a, b) => a.createdAt - b.createdAt),
      put: async (e) => { m.set(e.id, e); },
      putMany: async (es) => { for (const e of es) m.set(e.id, e); },
      del: async (id) => { m.delete(id); },
      memory: true,
    };
  }
}
