// Worker handler tests (§19.1). Run: node --test test/worker.test.js  (Node >= 22.5 for node:sqlite)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHmac, createDecipheriv, randomBytes } from 'node:crypto';

import { handleFetch, runCron, MAX_BODY } from '../worker/src/index.js';
import { encryptPayload, PUSH_HEADERS } from '../worker/src/webpush.js';
import { b64urlDecode, b64urlEncode } from '../worker/src/util.js';
import { hashToken } from '../worker/src/auth.js';
import { createD1 } from './d1-shim.js';

const ORIGIN = 'https://user.github.io';
const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 6, 12, 0, 0);

// ---------- helpers ----------

let vapidKeys;
async function vapid() {
  if (!vapidKeys) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
    vapidKeys = { jwk: JSON.stringify({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }), publicKey: kp.publicKey };
  }
  return vapidKeys;
}

/** Fresh env with a mutable clock. */
async function makeEnv() {
  const v = await vapid();
  const clock = { now: T0 };
  const env = {
    DB: createD1(), ALLOWED_ORIGIN: ORIGIN,
    VAPID_PRIVATE_JWK: v.jwk, VAPID_SUBJECT: 'mailto:test@example.com',
    __now: () => clock.now,
  };
  return { env, clock };
}

function req(method, path, { body, auth, headers = {}, origin = ORIGIN } = {}) {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  if (auth) h.Authorization = auth;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  return new Request('https://api.test' + path, {
    method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function call(env, method, path, opts) {
  const res = await handleFetch(req(method, path, opts), env);
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
}

const newToken = () => randomBytes(32).toString('base64url');

async function register(env, deviceId = crypto.randomUUID(), authToken = newToken()) {
  const r = await call(env, 'POST', '/v1/devices', { body: { deviceId, authToken } });
  assert.equal(r.status, 201);
  return { deviceId, authToken, auth: `Bearer ${deviceId}.${authToken}` };
}

const ct = (n = 40) => randomBytes(n).toString('base64url');
const iv = () => randomBytes(12).toString('base64url');
const change = (store, id, updatedAt, extra = {}) => ({ store, id, updatedAt, deleted: false, iv: iv(), ct: ct(), ...extra });

/** Mock fetch capturing push requests. `statusFor(url, n)` picks the response status. */
function mockFetch(statusFor = () => 201) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: Buffer.from(init.body) });
    return new Response(null, { status: statusFor(url, calls.length) });
  };
  fn.calls = calls;
  return fn;
}

// Independent RFC 8291 decryption with node:crypto (HMAC-based HKDF, aes-128-gcm).
function hkdf(salt, ikm, info, len) {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  return createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
}
function decryptPush(body, ua, authSecret) {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const keyid = body.subarray(21, 21 + idlen);
  const data = body.subarray(21 + idlen);
  assert.equal(rs, 4096);
  assert.equal(idlen, 65);
  const ecdh = ua.computeSecret(keyid);
  const info = Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), keyid]);
  const ikm = hkdf(authSecret, ecdh, info, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(data.subarray(-16));
  const pt = Buffer.concat([d.update(data.subarray(0, -16)), d.final()]);
  let i = pt.length - 1;
  while (i >= 0 && pt[i] === 0) i--;
  assert.equal(pt[i], 2, 'last-record delimiter');
  return pt.subarray(0, i).toString('utf8');
}

function fakeSub(endpoint = 'https://push.example.com/send/' + randomBytes(6).toString('hex')) {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const authSecret = randomBytes(16);
  return {
    ua, authSecret, endpoint,
    body: { endpoint, keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') } },
  };
}

async function verifyJwt(jwt, publicKeyB64) {
  const [h, p, s] = jwt.split('.');
  const key = await crypto.subtle.importKey('raw', b64urlDecode(publicKeyB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  return { ok, header: JSON.parse(Buffer.from(h, 'base64url')), payload: JSON.parse(Buffer.from(p, 'base64url')) };
}

const parseVapid = (v) => /^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/.exec(v);

// ---------- cross-cutting ----------

describe('cross-cutting', () => {
  test('health', async () => {
    const { env } = await makeEnv();
    const r = await call(env, 'GET', '/v1/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.match(r.headers.get('Vary'), /Origin/);
  });

  test('CORS preflight', async () => {
    const { env } = await makeEnv();
    const res = await handleFetch(req('OPTIONS', '/v1/sync', {
      headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    }), env);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
    assert.equal(res.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PUT, DELETE');
    assert.equal(res.headers.get('Access-Control-Allow-Headers'), 'Authorization, Content-Type');
    assert.equal(res.headers.get('Access-Control-Max-Age'), '86400');
  });

  test('wrong origin gets no Allow-Origin', async () => {
    const { env } = await makeEnv();
    for (const method of ['OPTIONS', 'GET']) {
      const res = await handleFetch(req(method, '/v1/health', { origin: 'https://evil.example' }), env);
      assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
    }
  });

  test('404 / 405', async () => {
    const { env } = await makeEnv();
    assert.deepEqual((await call(env, 'GET', '/v1/nope')).body, { error: 'not_found' });
    const r = await call(env, 'GET', '/v1/sync');
    assert.equal(r.status, 405);
    assert.deepEqual(r.body, { error: 'method_not_allowed' });
  });

  test('body > 1 MB → 413 (actual length and Content-Length)', async () => {
    const { env } = await makeEnv();
    const big = JSON.stringify({ deviceId: crypto.randomUUID(), authToken: 'x'.repeat(MAX_BODY) });
    // Streamed body without Content-Length.
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    let res = await handleFetch(new Request('https://api.test/v1/devices', { method: 'POST', body: stream, duplex: 'half' }), env);
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), { error: 'too_large' });
    // Declared Content-Length.
    res = await handleFetch(req('POST', '/v1/devices', { body: '{}', headers: { 'Content-Length': String(MAX_BODY + 1) } }), env);
    assert.equal(res.status, 413);
    // Authenticated sync path too.
    const d = await register(env);
    const r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: big });
    assert.equal(r.status, 413);
  });

  test('invalid JSON → 400', async () => {
    const { env } = await makeEnv();
    const r = await call(env, 'POST', '/v1/devices', { body: '{nope' });
    assert.equal(r.status, 400);
    assert.deepEqual(r.body, { error: 'bad_request' });
  });
});

// ---------- devices + auth ----------

describe('devices and auth', () => {
  test('register 201 / 200 same / 409 different; stores hash only', async () => {
    const { env } = await makeEnv();
    const deviceId = crypto.randomUUID();
    const authToken = newToken();
    let r = await call(env, 'POST', '/v1/devices', { body: { deviceId, authToken } });
    assert.equal(r.status, 201);
    r = await call(env, 'POST', '/v1/devices', { body: { deviceId, authToken } });
    assert.equal(r.status, 200);
    r = await call(env, 'POST', '/v1/devices', { body: { deviceId, authToken: newToken() } });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body, { error: 'conflict' });
    const [row] = env.DB.rows('SELECT * FROM devices');
    assert.equal(row.auth_hash, await hashToken(authToken));
    assert.match(row.auth_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(row).includes(authToken));
  });

  test('register validation', async () => {
    const { env } = await makeEnv();
    for (const body of [
      {}, { deviceId: 'abc', authToken: newToken() },
      { deviceId: crypto.randomUUID(), authToken: 'short' },
      { deviceId: crypto.randomUUID(), authToken: newToken() + '=' },
    ]) {
      assert.equal((await call(env, 'POST', '/v1/devices', { body })).status, 400);
    }
  });

  test('auth success and failures', async () => {
    const { env } = await makeEnv();
    const d = await register(env);
    assert.equal((await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: 0, changes: [] } })).status, 200);
    const fails = [
      undefined,
      `Bearer ${d.deviceId}.${newToken()}`, // bad token
      `Bearer ${crypto.randomUUID()}.${d.authToken}`, // unknown device
      `Bearer ${d.deviceId}`, // malformed
      `Basic ${d.deviceId}.${d.authToken}`,
    ];
    for (const auth of fails) {
      const r = await call(env, 'POST', '/v1/sync', { auth, body: { cursor: 0, changes: [] } });
      assert.equal(r.status, 401, String(auth));
      assert.deepEqual(r.body, { error: 'unauthorized' });
    }
    // Uppercase UUID is normalized.
    const up = `Bearer ${d.deviceId.toUpperCase()}.${d.authToken}`;
    assert.equal((await call(env, 'POST', '/v1/sync', { auth: up, body: {} })).status, 200);
  });

  test('last_seen updated at most once per hour', async () => {
    const { env, clock } = await makeEnv();
    const d = await register(env);
    const seen = () => env.DB.rows('SELECT last_seen FROM devices')[0].last_seen;
    clock.now = T0 + 30 * MIN;
    await call(env, 'POST', '/v1/sync', { auth: d.auth, body: {} });
    assert.equal(seen(), T0);
    clock.now = T0 + HOUR;
    await call(env, 'POST', '/v1/sync', { auth: d.auth, body: {} });
    assert.equal(seen(), T0 + HOUR);
  });

  test('DELETE /v1/devices/me wipes all tables for the device only', async () => {
    const { env } = await makeEnv();
    const a = await register(env);
    const b = await register(env);
    for (const d of [a, b]) {
      await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { changes: [change('moments', 'm1', 1)] } });
      await call(env, 'PUT', '/v1/push-subscription', { auth: d.auth, body: fakeSub().body });
      await call(env, 'PUT', '/v1/checkins', { auth: d.auth, body: { items: [{ id: crypto.randomUUID(), dueAt: T0 + HOUR, kind: 'plus2h' }] } });
    }
    const r = await call(env, 'DELETE', '/v1/devices/me', { auth: a.auth });
    assert.equal(r.status, 204);
    for (const [t, col] of [['devices', 'id'], ['records', 'device_id'], ['push_subs', 'device_id'], ['checkins', 'device_id']]) {
      assert.equal(env.DB.rows(`SELECT * FROM ${t} WHERE ${col} = ?`, a.deviceId).length, 0, t);
      assert.equal(env.DB.rows(`SELECT * FROM ${t} WHERE ${col} = ?`, b.deviceId).length, 1, t);
    }
    assert.equal((await call(env, 'POST', '/v1/sync', { auth: a.auth, body: {} })).status, 401);
  });
});

// ---------- sync ----------

describe('sync', () => {
  test('upsert, exclusion of own writes, cursor, second device pull', async () => {
    const { env } = await makeEnv();
    const d = await register(env);
    const c1 = change('moments', 'm1', 100);
    const c2 = change('settings', 'settings', 100);
    let r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: null, changes: [c1, c2] } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { cursor: 2, changes: [] }); // own writes not echoed; cursor past them

    // Second install of the same identity pulls from 0 (E23).
    r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: 0, changes: [] } });
    assert.equal(r.body.cursor, 2);
    assert.deepEqual(r.body.changes, [
      { store: 'moments', id: 'm1', updatedAt: 100, deleted: false, iv: c1.iv, ct: c1.ct },
      { store: 'settings', id: 'settings', updatedAt: 100, deleted: false, iv: c2.iv, ct: c2.ct },
    ]);

    // Second device writes m2 + tombstone for m1; first device (cursor 2) gets only those.
    const c3 = change('moments', 'm2', 200);
    const del = { store: 'moments', id: 'm1', updatedAt: 300, deleted: true, iv: null, ct: null };
    r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: 2, changes: [c3, del] } });
    assert.deepEqual(r.body, { cursor: 4, changes: [] });
    r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: 2 } });
    assert.equal(r.body.cursor, 4);
    assert.deepEqual(r.body.changes.map((c) => [c.id, c.deleted, c.iv]), [['m2', false, c3.iv], ['m1', true, null]]);

    // Mixed: incoming write + pending remote rows → remote rows returned, own excluded.
    r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: 2, changes: [change('profile', 'profile', 1)] } });
    assert.equal(r.body.cursor, 5);
    assert.deepEqual(r.body.changes.map((c) => c.id), ['m2', 'm1']);
    assert.equal(env.DB.rows('SELECT seq FROM devices')[0].seq, 5);
  });

  test('LWW: older ignored, equal accepted', async () => {
    const { env } = await makeEnv();
    const d = await register(env);
    const stored = () => env.DB.rows("SELECT ct, updated_at, server_seq FROM records WHERE id = 'x'")[0];
    const a = change('triggerTags', 'x', 1000);
    await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { changes: [a] } });
    const older = change('triggerTags', 'x', 999);
    let r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: 1, changes: [older] } });
    assert.equal(stored().ct, a.ct);
    assert.equal(stored().server_seq, 1);
    assert.deepEqual(r.body.changes, []); // already seen by cursor
    const equal = change('triggerTags', 'x', 1000);
    r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: r.body.cursor, changes: [equal] } });
    assert.equal(stored().ct, equal.ct);
    assert.equal(stored().server_seq, 3);
    assert.deepEqual(r.body, { cursor: 3, changes: [] });
    // Older write from a device whose cursor predates the newer row: gets the newer row back.
    r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: 0, changes: [change('triggerTags', 'x', 5)] } });
    assert.deepEqual(r.body.changes.map((c) => c.ct), [equal.ct]);
    // Duplicate ids in one request: newest wins.
    const n1 = change('moments', 'dup', 10);
    const n2 = change('moments', 'dup', 20);
    await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { changes: [n2, n1] } });
    assert.equal(env.DB.rows("SELECT ct FROM records WHERE id = 'dup'")[0].ct, n2.ct);
  });

  test('gratitude store (DD-090): accepted and returned like any other store', async () => {
    const { env } = await makeEnv();
    const d = await register(env);
    const g = change('gratitude', 'g1', 100);
    let r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { changes: [g, change('moments', 'm1', 100)] } });
    assert.equal(r.status, 200);
    r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: 0 } });
    assert.deepEqual(r.body.changes.map((c) => [c.store, c.id]), [['gratitude', 'g1'], ['moments', 'm1']]);
  });

  test('identities are isolated', async () => {
    const { env } = await makeEnv();
    const a = await register(env);
    const b = await register(env);
    await call(env, 'POST', '/v1/sync', { auth: a.auth, body: { changes: [change('moments', 'same', 1)] } });
    await call(env, 'POST', '/v1/sync', { auth: b.auth, body: { changes: [change('moments', 'same', 1)] } });
    const r = await call(env, 'POST', '/v1/sync', { auth: b.auth, body: { cursor: 0 } });
    assert.equal(r.body.changes.length, 1);
    assert.equal(r.body.cursor, 1);
  });

  test('validation: unknown store, >200 changes, ct > 64 KB, bad cursor, missing ct', async () => {
    const { env } = await makeEnv();
    const d = await register(env);
    const bad = [
      { changes: [change('meta', 'secret', 1)] },
      { changes: [change('syncQueue', '1', 1)] },
      { changes: Array.from({ length: 201 }, (_, i) => change('moments', 'm' + i, 1, { ct: 'a' })) },
      { changes: [change('moments', 'm', 1, { ct: 'a'.repeat(64 * 1024 + 1) })] },
      { cursor: -1 }, { cursor: '3' }, { cursor: 1.5 },
      { changes: [change('moments', 'm', 1, { ct: null })] },
      { changes: [change('moments', 'm', 1, { ct: 'not base64!' })] },
      { changes: [change('moments', 'm', 1, { deleted: 'yes' })] },
      { changes: [change('moments', '', 1)] },
      { changes: [change('moments', 'm', -1)] },
      { changes: {} },
      [],
    ];
    for (const body of bad) {
      const r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body });
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
    }
    assert.equal(env.DB.rows('SELECT * FROM records').length, 0);
    // Exactly 200 and exactly 64 KB are fine.
    const ok = Array.from({ length: 200 }, (_, i) => change('moments', 'm' + i, 1, { ct: 'a' }));
    ok[0].ct = 'a'.repeat(64 * 1024);
    assert.equal((await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { changes: ok } })).status, 200);
  });

  test('pagination: 500 rows per response, more: true', async () => {
    const { env } = await makeEnv();
    const d = await register(env);
    for (let p = 0; p < 3; p++) {
      const changes = Array.from({ length: 200 }, (_, i) => change('moments', `p${p}-${i}`, 1, { ct: 'a' }));
      await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { changes } });
    }
    let r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: 0 } });
    assert.equal(r.body.changes.length, 500);
    assert.equal(r.body.more, true);
    assert.equal(r.body.cursor, 500);
    r = await call(env, 'POST', '/v1/sync', { auth: d.auth, body: { cursor: r.body.cursor } });
    assert.equal(r.body.changes.length, 100);
    assert.equal(r.body.more, undefined);
    assert.equal(r.body.cursor, 600);
  });
});

// ---------- push subscription ----------

describe('push subscription', () => {
  test('upsert by endpoint, delete, validation, per-device cap', async () => {
    const { env, clock } = await makeEnv();
    const a = await register(env);
    const b = await register(env);
    const s = fakeSub();
    assert.equal((await call(env, 'PUT', '/v1/push-subscription', { auth: a.auth, body: s.body })).status, 204);
    assert.equal((await call(env, 'PUT', '/v1/push-subscription', { auth: a.auth, body: s.body })).status, 204);
    assert.equal(env.DB.rows('SELECT * FROM push_subs').length, 1);
    // Same endpoint re-registered by another identity (restore on same browser) moves it.
    await call(env, 'PUT', '/v1/push-subscription', { auth: b.auth, body: s.body });
    assert.equal(env.DB.rows('SELECT device_id FROM push_subs')[0].device_id, b.deviceId);
    // a can't delete b's subscription.
    await call(env, 'DELETE', '/v1/push-subscription', { auth: a.auth, body: { endpoint: s.endpoint } });
    assert.equal(env.DB.rows('SELECT * FROM push_subs').length, 1);
    assert.equal((await call(env, 'DELETE', '/v1/push-subscription', { auth: b.auth, body: { endpoint: s.endpoint } })).status, 204);
    assert.equal(env.DB.rows('SELECT * FROM push_subs').length, 0);

    const bad = [
      { ...s.body, endpoint: 'http://push.example.com/x' },
      { ...s.body, endpoint: 'not a url' },
      { endpoint: s.endpoint, keys: { p256dh: 'abc', auth: s.body.keys.auth } },
      { endpoint: s.endpoint, keys: { p256dh: s.body.keys.p256dh, auth: 'a+b/' } },
      { endpoint: s.endpoint },
    ];
    for (const body of bad) assert.equal((await call(env, 'PUT', '/v1/push-subscription', { auth: a.auth, body })).status, 400);

    for (let i = 0; i < 7; i++) {
      clock.now = T0 + i;
      await call(env, 'PUT', '/v1/push-subscription', { auth: a.auth, body: fakeSub(`https://push.example.com/n${i}`).body });
    }
    const left = env.DB.rows('SELECT endpoint FROM push_subs WHERE device_id = ? ORDER BY endpoint', a.deviceId).map((r) => r.endpoint);
    assert.deepEqual(left, [2, 3, 4, 5, 6].map((i) => `https://push.example.com/n${i}`));
  });
});

// ---------- check-ins ----------

describe('check-ins', () => {
  test('PUT replaces pending, keeps answered/sent, never clobbers other devices', async () => {
    const { env } = await makeEnv();
    const a = await register(env);
    const b = await register(env);
    const put = (d, items) => call(env, 'PUT', '/v1/checkins', { auth: d.auth, body: { items } });
    assert.equal((await put(a, [
      { id: 'c1', dueAt: T0 + 30 * MIN, kind: 'plus30' },
      { id: 'c2', dueAt: T0 + 2 * HOUR, kind: 'plus2h' },
      { id: 'c3', dueAt: T0 + 8 * HOUR, kind: 'evening' },
    ])).status, 204);
    assert.equal((await put(b, [{ id: 'bx', dueAt: T0 + HOUR, kind: 'plus10' }])).status, 204);
    assert.equal((await call(env, 'POST', '/v1/checkins/c1/ack', { auth: a.auth })).status, 204);
    env.DB.rows("UPDATE checkins SET status = 'sent' WHERE id = 'c2'");

    // New plan: c1 (answered) and c2 (sent) resubmitted, c3 dropped, c4 new, bx = b's id.
    await put(a, [
      { id: 'c1', dueAt: T0 + 40 * MIN, kind: 'plus30' },
      { id: 'c2', dueAt: T0 + 40 * MIN, kind: 'plus30' },
      { id: 'c4', dueAt: T0 + 20 * HOUR, kind: 'morning' },
      { id: 'bx', dueAt: T0 + 3 * HOUR, kind: 'plus2h' },
    ]);
    const rows = env.DB.rows('SELECT id, device_id, status, due_at, kind FROM checkins ORDER BY id');
    assert.deepEqual(rows.map((r) => [r.id, r.device_id === a.deviceId ? 'a' : 'b', r.status, r.due_at]), [
      ['bx', 'b', 'pending', T0 + HOUR],
      ['c1', 'a', 'answered', T0 + 30 * MIN],
      ['c2', 'a', 'sent', T0 + 2 * HOUR],
      ['c4', 'a', 'pending', T0 + 20 * HOUR],
    ]);
    // Empty list clears pending ("Stop for today").
    await put(a, []);
    assert.equal(env.DB.rows("SELECT * FROM checkins WHERE device_id = ? AND status = 'pending'", a.deviceId).length, 0);
  });

  test('PUT validation', async () => {
    const { env } = await makeEnv();
    const d = await register(env);
    const item = (o) => ({ id: crypto.randomUUID(), dueAt: T0 + HOUR, kind: 'plus30', ...o });
    const bad = [
      { items: Array.from({ length: 11 }, () => item()) },
      { items: [item({ kind: 'weekly' })] },
      { items: [item({ dueAt: T0 - 5 * MIN - 1 })] },
      { items: [item({ dueAt: T0 + 48 * HOUR + 1 })] },
      { items: [item({ dueAt: String(T0) })] },
      { items: [item({ id: 'x' }), item({ id: 'x' })] },
      { items: [item({ id: 'a b' })] },
      {},
    ];
    for (const body of bad) assert.equal((await call(env, 'PUT', '/v1/checkins', { auth: d.auth, body })).status, 400);
    const edge = [item({ dueAt: T0 - 5 * MIN }), item({ dueAt: T0 + 48 * HOUR })];
    assert.equal((await call(env, 'PUT', '/v1/checkins', { auth: d.auth, body: { items: edge } })).status, 204);
    assert.equal((await call(env, 'PUT', '/v1/checkins', { auth: d.auth, body: { items: Array.from({ length: 10 }, () => item()) } })).status, 204);
  });

  test('ack only affects own row', async () => {
    const { env } = await makeEnv();
    const a = await register(env);
    const b = await register(env);
    await call(env, 'PUT', '/v1/checkins', { auth: a.auth, body: { items: [{ id: 'k', dueAt: T0, kind: 'plus10' }] } });
    assert.equal((await call(env, 'POST', '/v1/checkins/k/ack', { auth: b.auth })).status, 204);
    assert.equal(env.DB.rows('SELECT status FROM checkins')[0].status, 'pending');
    assert.equal((await call(env, 'POST', '/v1/checkins/k/ack', { auth: a.auth })).status, 204);
    assert.equal(env.DB.rows('SELECT status FROM checkins')[0].status, 'answered');
    assert.equal((await call(env, 'POST', '/v1/checkins/unknown/ack', { auth: a.auth })).status, 204);
    assert.equal((await call(env, 'POST', '/v1/checkins/k/ack')).status, 401);
  });
});

// ---------- cron sender ----------

async function setupDue(env, clock, { subs = 1, items } = {}) {
  const d = await register(env);
  const s = [];
  for (let i = 0; i < subs; i++) {
    const sub = fakeSub();
    s.push(sub);
    await call(env, 'PUT', '/v1/push-subscription', { auth: d.auth, body: sub.body });
  }
  items = items || [{ id: 'due1', dueAt: clock.now, kind: 'plus30' }];
  assert.equal((await call(env, 'PUT', '/v1/checkins', { auth: d.auth, body: { items } })).status, 204);
  return { d, subs: s };
}
const statusOf = (env, id) => env.DB.rows('SELECT status, attempts, sent_at FROM checkins WHERE id = ?', id)[0];

describe('cron sender', () => {
  test('2xx → sent; payload decrypts; headers + VAPID JWT valid; all subs of identity (E23)', async () => {
    const { env, clock } = await makeEnv();
    const { subs } = await setupDue(env, clock, { subs: 2, items: [{ id: 'due1', dueAt: T0, kind: 'morning' }] });
    clock.now = T0 + MIN;
    const f = mockFetch(() => 201);
    const stats = await runCron(env, clock.now, f);
    assert.equal(stats.sent, 1);
    assert.equal(f.calls.length, 2);
    assert.deepEqual(statusOf(env, 'due1'), { status: 'sent', attempts: 0, sent_at: T0 + MIN });

    const v = await vapid();
    const pub = b64urlEncode(await crypto.subtle.exportKey('raw', v.publicKey));
    for (const call of f.calls) {
      const sub = subs.find((s) => s.endpoint === call.url);
      assert.ok(sub);
      assert.equal(call.init.method, 'POST');
      for (const [k, val] of Object.entries(PUSH_HEADERS)) assert.equal(call.init.headers[k], val);
      assert.equal(decryptPush(call.body, sub.ua, sub.authSecret), '{"t":"checkin","id":"due1","kind":"morning"}');
      const m = parseVapid(call.init.headers.Authorization);
      assert.ok(m, call.init.headers.Authorization);
      assert.equal(m[2], pub);
      const jwt = await verifyJwt(m[1], m[2]);
      assert.ok(jwt.ok, 'signature verifies');
      assert.deepEqual(jwt.header, { typ: 'JWT', alg: 'ES256' });
      assert.deepEqual(jwt.payload, { aud: 'https://push.example.com', exp: Math.floor(clock.now / 1000) + 12 * 3600, sub: 'mailto:test@example.com' });
    }
    // Not resent.
    assert.equal((await runCron(env, clock.now + MIN, f)).sent, 0);
    assert.equal(f.calls.length, 2);
  });

  test('429/5xx → attempts++ → failed at 3', async () => {
    const { env, clock } = await makeEnv();
    await setupDue(env, clock);
    const codes = [429, 503, 500];
    for (let i = 0; i < 3; i++) {
      const f = mockFetch(() => codes[i]);
      await runCron(env, T0 + i * MIN, f);
      assert.equal(f.calls.length, 1);
      const st = statusOf(env, 'due1');
      assert.equal(st.attempts, i + 1);
      assert.equal(st.status, i < 2 ? 'pending' : 'failed');
    }
    const f = mockFetch();
    await runCron(env, T0 + 3 * MIN, f);
    assert.equal(f.calls.length, 0);
  });

  test('network error counts as an attempt; one sub ok is enough', async () => {
    const { env, clock } = await makeEnv();
    await setupDue(env, clock, { subs: 2 });
    let n = 0;
    const f = async () => { if (n++ === 0) throw new Error('net'); return new Response(null, { status: 201 }); };
    await runCron(env, T0, f);
    assert.equal(statusOf(env, 'due1').status, 'sent');
    const { env: env2, clock: clock2 } = await makeEnv();
    await setupDue(env2, clock2);
    await runCron(env2, T0, async () => { throw new Error('net'); });
    assert.deepEqual(statusOf(env2, 'due1'), { status: 'pending', attempts: 1, sent_at: null });
  });

  test('expired when > 30 min late; not-yet-due untouched', async () => {
    const { env, clock } = await makeEnv();
    await setupDue(env, clock, { items: [
      { id: 'late', dueAt: T0, kind: 'plus30' },
      { id: 'edge', dueAt: T0 + 5 * MIN, kind: 'plus10' },
      { id: 'future', dueAt: T0 + 2 * HOUR, kind: 'plus2h' },
    ] });
    const f = mockFetch();
    const now = T0 + 35 * MIN; // late: 35 min overdue; edge: exactly 30 min → still sent
    const stats = await runCron(env, now, f);
    assert.equal(statusOf(env, 'late').status, 'expired');
    assert.equal(statusOf(env, 'edge').status, 'sent');
    assert.equal(statusOf(env, 'future').status, 'pending');
    assert.equal(stats.expired, 1);
    assert.equal(f.calls.length, 1);
  });

  test('404/410 deletes subscription (E14); item stays pending', async () => {
    const { env, clock } = await makeEnv();
    const { subs } = await setupDue(env, clock, { subs: 2 });
    const gone = subs[0].endpoint;
    let f = mockFetch((url) => (url === gone ? 410 : 404));
    const stats = await runCron(env, T0, f);
    assert.equal(stats.subsDeleted, 2);
    assert.equal(env.DB.rows('SELECT * FROM push_subs').length, 0);
    assert.deepEqual(statusOf(env, 'due1'), { status: 'pending', attempts: 0, sent_at: null });
    // With no subs: not selected (in-app delivery covers it) until it can expire.
    f = mockFetch();
    await runCron(env, T0 + 10 * MIN, f);
    assert.equal(f.calls.length, 0);
    assert.equal(statusOf(env, 'due1').status, 'pending');
    await runCron(env, T0 + 31 * MIN, f);
    assert.equal(statusOf(env, 'due1').status, 'expired');
  });

  test('410 on one sub, 201 on another → sent, dead sub removed', async () => {
    const { env, clock } = await makeEnv();
    const { subs } = await setupDue(env, clock, { subs: 2 });
    const f = mockFetch((url) => (url === subs[0].endpoint ? 410 : 201));
    await runCron(env, T0, f);
    assert.equal(statusOf(env, 'due1').status, 'sent');
    assert.deepEqual(env.DB.rows('SELECT endpoint FROM push_subs').map((r) => r.endpoint), [subs[1].endpoint]);
  });

  test('LIMIT 3 per run, ordered by due_at; subscription-less devices do not starve others', async () => {
    const { env, clock } = await makeEnv();
    // In-app-only device with many due items.
    const lonely = await register(env);
    await call(env, 'PUT', '/v1/checkins', { auth: lonely.auth, body: { items: [0, 1, 2, 3].map((i) => ({ id: 'l' + i, dueAt: T0 - 4 * MIN, kind: 'plus10' })) } });
    await setupDue(env, clock, { items: [0, 1, 2, 3].map((i) => ({ id: 'p' + i, dueAt: T0 - (4 - i) * MIN, kind: 'plus30' })) });
    const f = mockFetch();
    await runCron(env, T0, f);
    assert.equal(f.calls.length, 3);
    assert.deepEqual(['p0', 'p1', 'p2', 'p3'].map((id) => statusOf(env, id).status), ['sent', 'sent', 'sent', 'pending']);
    assert.ok(['l0', 'l1', 'l2', 'l3'].every((id) => statusOf(env, id).status === 'pending'));
  });

  test('VAPID JWT cached per audience and reused until < 1 h left', async () => {
    const { env, clock } = await makeEnv();
    const d = await register(env);
    await call(env, 'PUT', '/v1/push-subscription', { auth: d.auth, body: fakeSub().body });
    const jwtOf = (f) => parseVapid(f.calls.at(-1).init.headers.Authorization)[1];
    const send = async (at) => {
      clock.now = at;
      await call(env, 'PUT', '/v1/checkins', { auth: d.auth, body: { items: [{ id: crypto.randomUUID(), dueAt: at, kind: 'plus10' }] } });
      const f = mockFetch();
      await runCron(env, at, f);
      assert.equal(f.calls.length, 1);
      return jwtOf(f);
    };
    const j1 = await send(T0);
    const cached = env.DB.rows('SELECT * FROM vapid_cache');
    assert.equal(cached.length, 1);
    assert.equal(cached[0].audience, 'https://push.example.com');
    assert.equal(cached[0].exp, Math.floor(T0 / 1000) + 12 * 3600);
    const j2 = await send(T0 + 10 * HOUR); // 2 h left → reuse
    assert.equal(j2, j1);
    const j3 = await send(T0 + 11 * HOUR + MIN); // < 1 h left → new
    assert.notEqual(j3, j1);
    assert.equal(env.DB.rows('SELECT exp FROM vapid_cache')[0].exp, Math.floor((T0 + 11 * HOUR + MIN) / 1000) + 12 * 3600);
  });

  test('daily housekeeping after 03:00 UTC, once per UTC day', async () => {
    const { env } = await makeEnv();
    const d = await register(env);
    const day = Date.UTC(2026, 9, 7);
    const ins = (id, status, due) => env.DB.rows(
      'INSERT INTO checkins (id, device_id, due_at, kind, status) VALUES (?, ?, ?, ?, ?)', id, d.deviceId, due, 'plus10', status);
    ins('old-sent', 'sent', day - 8 * 24 * HOUR);
    ins('old-answered', 'answered', day - 8 * 24 * HOUR);
    ins('old-pending', 'pending', day + 24 * HOUR); // pending is never housekept (future so cron ignores it)
    ins('recent', 'expired', day - 6 * 24 * HOUR);
    const f = mockFetch();
    assert.equal((await runCron(env, day + 2 * HOUR, f)).housekept, false);
    assert.equal(env.DB.rows('SELECT * FROM checkins').length, 4);
    assert.equal((await runCron(env, day + 3 * HOUR, f)).housekept, true);
    assert.deepEqual(env.DB.rows('SELECT id FROM checkins ORDER BY id').map((r) => r.id), ['old-pending', 'recent']);
    ins('old2', 'failed', day - 9 * 24 * HOUR);
    assert.equal((await runCron(env, day + 5 * HOUR, f)).housekept, false);
    assert.equal((await runCron(env, day + 24 * HOUR + 3 * HOUR, f)).housekept, true);
    assert.equal(env.DB.rows("SELECT * FROM checkins WHERE id = 'old2'").length, 0);
  });

  test('scheduled() uses env.__fetch and env.__now', async () => {
    const { default: worker } = await import('../worker/src/index.js');
    const { env, clock } = await makeEnv();
    await setupDue(env, clock);
    const f = mockFetch();
    env.__fetch = f;
    const waits = [];
    worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
    assert.equal(f.calls.length, 1);
    assert.equal(statusOf(env, 'due1').status, 'sent');
  });
});

// ---------- webpush encryption ----------

describe('webpush', () => {
  test('aes128gcm round trip (independent node:crypto decrypt)', async () => {
    const s = fakeSub();
    const payload = JSON.stringify({ t: 'checkin', id: crypto.randomUUID(), kind: 'plus2h' });
    const body = await encryptPayload(new TextEncoder().encode(payload), s.body.keys.p256dh, s.body.keys.auth);
    assert.equal(decryptPush(Buffer.from(body), s.ua, s.authSecret), payload);
    // Fresh salt + ephemeral key per message.
    const body2 = await encryptPayload(new TextEncoder().encode(payload), s.body.keys.p256dh, s.body.keys.auth);
    assert.notDeepEqual(Buffer.from(body2).subarray(0, 86), Buffer.from(body).subarray(0, 86));
  });

  test('RFC 8291 Appendix A test vector', async () => {
    const asPub = b64urlDecode('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const x = b64urlEncode(asPub.slice(1, 33));
    const y = b64urlEncode(asPub.slice(33));
    const privateKey = await crypto.subtle.importKey('jwk',
      { kty: 'EC', crv: 'P-256', x, y, d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' },
      { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const publicKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    const out = await encryptPayload(
      new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      'BTBZMqHH6r4Tts7J_aSIgg',
      { salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), localKeys: { privateKey, publicKey } });
    assert.equal(b64urlEncode(out),
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  });
});

test('VAPID subject gets mailto: when missing', async () => {
  const { normalizeSubject } = await import('../worker/src/webpush.js');
  assert.equal(normalizeSubject('me@example.com'), 'mailto:me@example.com');
  assert.equal(normalizeSubject(' mailto:me@example.com '), 'mailto:me@example.com');
  assert.equal(normalizeSubject('https://example.com'), 'https://example.com');
});
