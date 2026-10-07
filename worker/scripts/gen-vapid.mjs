#!/usr/bin/env node
// Generates a VAPID P-256 key pair (Node >= 20, WebCrypto only).
// Prints (1) private JWK for `wrangler secret put VAPID_PRIVATE_JWK`
//        (2) public key (uncompressed point, base64url) for web/js/config.js VAPID_PUBLIC_KEY.

const { subtle } = globalThis.crypto;

const b64url = (buf) => Buffer.from(buf).toString('base64url');

const { privateKey, publicKey } = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await subtle.exportKey('jwk', privateKey);
const raw = await subtle.exportKey('raw', publicKey); // 65 bytes, 0x04 || x || y

const priv = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });

console.log('1) VAPID_PRIVATE_JWK (keep secret). Run `npx wrangler secret put VAPID_PRIVATE_JWK` and paste:\n');
console.log(priv);
console.log('\n2) VAPID_PUBLIC_KEY for web/js/config.js:\n');
console.log(b64url(raw));
console.log('\nAlso set the subject: `npx wrangler secret put VAPID_SUBJECT` (e.g. mailto:you@example.com).');
