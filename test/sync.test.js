import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSync, shouldApply, createBackoff, isHeldBack, MAX_CHANGES } from '../web/js/lib/sync.js';
import { deriveEncKey, encryptJSON, decryptJSON, randomBytes } from '../web/js/lib/crypto.js';

/** In-memory local store adapter. */
function memStore(initial = {}) {
  const data = new Map(); // `${store}/${id}` → rec
  const queue = [];
  let key = 1;
  let cursor = 0;
  for (const [store, recs] of Object.entries(initial)) for (const r of recs) data.set(`${store}/${r.id}`, r);
  return {
    data, queue,
    get cursor() { return cursor; },
    enqueue(store, id) { queue.push({ key: key++, store, id }); },
    put(store, rec) { data.set(`${store}/${rec.id}`, rec); this.enqueue(store, rec.id); },
    readQueue: async () => [...queue],
    getRecord: async (store, id) => data.get(`${store}/${id}`),
    applyRemote: async (store, rec) => { data.set(`${store}/${rec.id}`, rec); },
    clearQueue: async (keys) => { for (const k of keys) { const i = queue.findIndex((q) => q.key === k); if (i >= 0) queue.splice(i, 1); } },
    getCursor: async () => cursor,
    setCursor: async (c) => { cursor = c; },
  };
}

/** Minimal server mirroring §8 sync semantics. */
function fakeServer() {
  const rows = new Map();
  let seq = 0;
  const calls = [];
  return {
    rows, calls,
    async post({ cursor, changes }) {
      calls.push({ cursor, n: changes.length });
      const written = new Set();
      for (const c of changes) {
        const k = `${c.store}/${c.id}`;
        const cur = rows.get(k);
        if (!cur || c.updatedAt >= cur.updatedAt) {
          rows.set(k, { ...c, seq: ++seq });
          written.add(k);
        }
      }
      const out = [...rows.entries()].filter(([k, r]) => r.seq > cursor && !written.has(k)).map(([, r]) => r);
      return { cursor: seq, changes: out.map(({ seq: _s, ...c }) => c) };
    },
  };
}

async function deps(store, server, key) {
  return {
    store, post: (b) => server.post(b),
    encrypt: (v) => encryptJSON(key, v),
    decrypt: (b) => decryptJSON(key, b),
  };
}

test('LWW: newer wins, older ignored, tie goes to higher writer id', () => {
  assert.equal(shouldApply(undefined, { id: 'a', updatedAt: 1 }), true);
  assert.equal(shouldApply({ id: 'a', updatedAt: 5 }, { id: 'a', updatedAt: 6 }), true);
  assert.equal(shouldApply({ id: 'a', updatedAt: 5 }, { id: 'a', updatedAt: 4 }), false);
  assert.equal(shouldApply({ id: 'a', updatedAt: 5, writer: 'aaa' }, { id: 'a', updatedAt: 5, writer: 'bbb' }), true);
  assert.equal(shouldApply({ id: 'a', updatedAt: 5, writer: 'bbb' }, { id: 'a', updatedAt: 5, writer: 'aaa' }), false);
  assert.equal(shouldApply({ id: 'a', updatedAt: 5, writer: 'x' }, { id: 'a', updatedAt: 5, writer: 'x' }), false);
});

test('two devices converge through the server; cursor advances; queues clear', async () => {
  const key = await deriveEncKey(randomBytes(32));
  const server = fakeServer();
  const A = memStore();
  const B = memStore();
  A.put('triggerTags', { id: 't1', label: 'A', updatedAt: 10, writer: 'devA' });
  A.put('settings', { id: 'settings', delayMinutes: 10, updatedAt: 10, writer: 'devA' });
  B.put('triggerTags', { id: 't1', label: 'B', updatedAt: 20, writer: 'devB' });

  const r1 = await runSync(await deps(A, server, key));
  assert.deepEqual(r1, { sent: 2, received: 0 });
  assert.equal(A.queue.length, 0);
  assert.equal(A.cursor, 2);

  const r2 = await runSync(await deps(B, server, key));
  assert.equal(r2.sent, 1);
  assert.equal(r2.received, 1); // settings from A; t1 from A is older and B's write won server-side
  assert.equal(B.data.get('settings/settings').delayMinutes, 10);
  assert.equal(B.data.get('triggerTags/t1').label, 'B');

  await runSync(await deps(A, server, key));
  assert.equal(A.data.get('triggerTags/t1').label, 'B');
  // Ciphertext only on the server
  for (const r of server.rows.values()) assert.ok(!JSON.stringify(r).includes('"label"'));
});

test('incoming older than local is not applied', async () => {
  const key = await deriveEncKey(randomBytes(32));
  const server = fakeServer();
  const A = memStore();
  A.put('profile', { id: 'profile', reasons: ['old'], updatedAt: 5, writer: 'a' });
  await runSync(await deps(A, server, key));
  const B = memStore({ profile: [{ id: 'profile', reasons: ['new'], updatedAt: 9, writer: 'b' }] });
  const r = await runSync(await deps(B, server, key));
  assert.equal(r.received, 0);
  assert.deepEqual(B.data.get('profile/profile').reasons, ['new']);
});

test('active moments are held back until close; then sent', async () => {
  const key = await deriveEncKey(randomBytes(32));
  const server = fakeServer();
  const A = memStore();
  A.put('moments', { id: 'm1', status: 'active', updatedAt: 1 });
  assert.equal(isHeldBack('moments', A.data.get('moments/m1')), true);
  const r1 = await runSync(await deps(A, server, key));
  assert.equal(r1.sent, 0);
  assert.equal(A.queue.length, 1);
  A.put('moments', { id: 'm1', status: 'closed', updatedAt: 2 });
  const r2 = await runSync(await deps(A, server, key));
  assert.equal(r2.sent, 1);
  assert.equal(A.queue.length, 0);
});

test('duplicate queue entries collapse; entries for missing records are dropped', async () => {
  const key = await deriveEncKey(randomBytes(32));
  const server = fakeServer();
  const A = memStore();
  A.put('triggerTags', { id: 't1', label: 'x', updatedAt: 1 });
  A.put('triggerTags', { id: 't1', label: 'y', updatedAt: 2 });
  A.enqueue('triggerTags', 'ghost');
  A.enqueue('meta', 'deviceId');
  const r = await runSync(await deps(A, server, key));
  assert.equal(r.sent, 1);
  assert.equal(A.queue.length, 0);
});

test('a write made during sync stays queued', async () => {
  const key = await deriveEncKey(randomBytes(32));
  const server = fakeServer();
  const A = memStore();
  A.put('triggerTags', { id: 't1', label: 'x', updatedAt: 1 });
  const d = await deps(A, server, key);
  const post = d.post;
  d.post = async (b) => { A.put('triggerTags', { id: 't1', label: 'z', updatedAt: 3 }); return post(b); };
  await runSync(d);
  assert.equal(A.queue.length, 1);
});

test('chunks of ≤200 changes; cursor saved after each request', async () => {
  const key = await deriveEncKey(randomBytes(32));
  const server = fakeServer();
  const A = memStore();
  for (let i = 0; i < 450; i++) A.put('moments', { id: `m${i}`, status: 'closed', updatedAt: i + 1 });
  const r = await runSync(await deps(A, server, key));
  assert.equal(r.sent, 450);
  assert.deepEqual(server.calls.map((c) => c.n), [MAX_CHANGES, MAX_CHANGES, 50]);
  assert.deepEqual(server.calls.map((c) => c.cursor), [0, 200, 400]);
  assert.equal(A.cursor, 450);
});

test('server `more` flag keeps pulling', async () => {
  const key = await deriveEncKey(randomBytes(32));
  const A = memStore();
  const box = await encryptJSON(key, { id: 'x', updatedAt: 1 });
  let n = 0;
  const d = await deps(A, null, key);
  d.post = async ({ cursor }) => {
    n++;
    if (cursor === 0) return { cursor: 5, more: true, changes: [{ store: 'triggerTags', id: 'x', updatedAt: 1, deleted: false, ...box }] };
    return { cursor: 6, changes: [] };
  };
  await runSync(d);
  assert.equal(n, 2);
  assert.equal(A.cursor, 6);
});

test('network failure leaves the queue and cursor untouched', async () => {
  const key = await deriveEncKey(randomBytes(32));
  const A = memStore();
  A.put('triggerTags', { id: 't1', updatedAt: 1 });
  const d = await deps(A, null, key);
  d.post = async () => { throw new Error('offline'); };
  await assert.rejects(runSync(d));
  assert.equal(A.queue.length, 1);
  assert.equal(A.cursor, 0);
});

test('undecryptable incoming records are skipped', async () => {
  const key = await deriveEncKey(randomBytes(32));
  const other = await deriveEncKey(randomBytes(32));
  const A = memStore();
  const d = await deps(A, null, key);
  const box = await encryptJSON(other, { id: 'x', updatedAt: 1 });
  d.post = async () => ({ cursor: 1, changes: [{ store: 'triggerTags', id: 'x', updatedAt: 1, deleted: false, ...box }] });
  const r = await runSync(d);
  assert.equal(r.received, 0);
});

test('backoff doubles from 30 s, caps at 10 min, resets', () => {
  const b = createBackoff();
  assert.deepEqual([b.fail(), b.fail(), b.fail(), b.fail(), b.fail(), b.fail()], [30e3, 60e3, 120e3, 240e3, 480e3, 600e3]);
  b.ok();
  assert.equal(b.fail(), 30e3);
});
