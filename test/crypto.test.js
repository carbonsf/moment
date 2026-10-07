import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  b64urlEncode, b64urlDecode, deriveAuthToken, deriveEncKey, encryptJSON, decryptJSON,
  parseRestoreToken, uuid, UUID_RE, randomBytes,
} from '../web/js/lib/crypto.js';

test('base64url round trip, no padding, url-safe alphabet', () => {
  for (const n of [0, 1, 2, 3, 31, 32, 33, 100]) {
    const b = randomBytes(n);
    const s = b64urlEncode(b);
    assert.match(s, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual(b64urlDecode(s), b);
  }
  assert.equal(b64urlEncode(new Uint8Array([0xfb, 0xff])), '-_8');
  assert.throws(() => b64urlDecode('ab+/'));
});

test('HKDF auth token is deterministic, 32 bytes, distinct per secret', async () => {
  const secret = new Uint8Array(32).fill(7);
  const a = await deriveAuthToken(secret);
  const b = await deriveAuthToken(secret);
  assert.equal(a, b);
  assert.equal(b64urlDecode(a).length, 32);
  assert.equal(a.length, 43);
  assert.notEqual(a, await deriveAuthToken(new Uint8Array(32).fill(8)));
});

test('HKDF matches an independent derivation (salt "moment", info "auth-v1")', async () => {
  const secret = new Uint8Array(32).map((_, i) => i);
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('moment'), info: enc.encode('auth-v1') }, base, 256);
  assert.equal(await deriveAuthToken(secret), b64urlEncode(bits));
});

test('encKey is non-extractable AES-GCM; same secret decrypts across derivations', async () => {
  const secret = randomBytes(32);
  const k1 = await deriveEncKey(secret);
  assert.equal(k1.extractable, false);
  assert.equal(k1.algorithm.name, 'AES-GCM');
  const value = { id: 'x', note: 'héllo', n: [1, 2, 3] };
  const box = await encryptJSON(k1, value);
  assert.equal(b64urlDecode(box.iv).length, 12);
  const k2 = await deriveEncKey(secret);
  assert.deepEqual(await decryptJSON(k2, box), value);
});

test('AES-GCM uses a fresh IV each time and rejects tampering or wrong keys', async () => {
  const k = await deriveEncKey(randomBytes(32));
  const a = await encryptJSON(k, { a: 1 });
  const b = await encryptJSON(k, { a: 1 });
  assert.notEqual(a.iv, b.iv);
  const ct = b64urlDecode(a.ct);
  ct[0] ^= 1;
  await assert.rejects(decryptJSON(k, { iv: a.iv, ct: b64urlEncode(ct) }));
  await assert.rejects(decryptJSON(await deriveEncKey(randomBytes(32)), a));
});

test('uuid v4 format', () => {
  assert.match(uuid(), UUID_RE);
});

test('restore token parse', () => {
  const id = uuid();
  const secret = randomBytes(32);
  const ok = parseRestoreToken(`${id}.${b64urlEncode(secret)}`);
  assert.equal(ok.deviceId, id);
  assert.deepEqual(ok.secret, secret);
  assert.equal(parseRestoreToken('nonsense'), null);
  assert.equal(parseRestoreToken(`${id}.${b64urlEncode(randomBytes(16))}`), null);
  assert.equal(parseRestoreToken(`not-a-uuid.${b64urlEncode(secret)}`), null);
  assert.equal(parseRestoreToken(''), null);
});
