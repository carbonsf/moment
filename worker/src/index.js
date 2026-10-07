// Moment API Worker: router, CORS, body limit, auth (§8). DD-002
//
// Test injection (no globals patched):
//   env.__now   number | () => number   clock for request handlers (default Date.now)
//   env.__fetch typeof fetch             push transport for scheduled() (default global fetch)
// or call the exported helpers directly: handleFetch(request, env), runCron(env, now, fetchImpl).

import { HttpError, json, noContent, nowMs } from './util.js';
import { authenticate } from './auth.js';
import { deleteDevice, registerDevice } from './devices.js';
import { handleSync } from './sync.js';
import { deleteSubscription, putSubscription } from './push.js';
import { ackCheckin, housekeep, putCheckins, runCheckins } from './checkins.js';

export const MAX_BODY = 1024 * 1024; // §8: > 1 MB → 413

const ERR_CODES = {
  400: 'bad_request', 401: 'unauthorized', 404: 'not_found', 405: 'method_not_allowed',
  409: 'conflict', 413: 'too_large', 500: 'internal',
};

/* DD-061: CORS headers sent only to the allowed Origin; others get none (browser blocks) */
/**
 * CORS headers. Allow-Origin is only ever ALLOWED_ORIGIN, and only sent when the request's
 * Origin matches it. Non-browser clients without Origin are unaffected.
 * @param {Request} request
 * @param {{ALLOWED_ORIGIN?: string}} env
 * @returns {Record<string, string>}
 */
function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const h = { Vary: 'Origin' };
  if (origin && env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

/** @param {Response} res @param {Record<string, string>} headers */
function withHeaders(res, headers) {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

/**
 * Reads and parses a JSON body with a hard size cap (Content-Length and actual bytes).
 * Bodies are never logged (§17).
 * @param {Request} request
 * @returns {Promise<unknown>}
 */
export async function readJson(request) {
  const len = request.headers.get('Content-Length');
  if (len && Number(len) > MAX_BODY) throw new HttpError(413, 'too_large');
  if (!request.body) throw new HttpError(400, 'bad_request');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY) {
      reader.cancel().catch(() => {});
      throw new HttpError(413, 'too_large');
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new HttpError(400, 'bad_request');
  }
}

/**
 * Route table. `auth: false` only for POST /v1/devices and GET /v1/health (§8).
 * @type {{re: RegExp, methods: Record<string, {auth: boolean, body?: boolean, run: Function}>}[]}
 */
const ROUTES = [
  { re: /^\/v1\/health$/, methods: {
    GET: { auth: false, run: () => json(200, { ok: true }) },
  } },
  { re: /^\/v1\/devices$/, methods: {
    POST: { auth: false, body: true, run: (c) => registerDevice(c.body, c.env, c.now) },
  } },
  { re: /^\/v1\/devices\/me$/, methods: {
    DELETE: { auth: true, run: (c) => deleteDevice(c.device, c.env) },
  } },
  { re: /^\/v1\/sync$/, methods: {
    POST: { auth: true, body: true, run: (c) => handleSync(c.body, c.device, c.env) },
  } },
  { re: /^\/v1\/push-subscription$/, methods: {
    PUT: { auth: true, body: true, run: (c) => putSubscription(c.body, c.device, c.env, c.now) },
    DELETE: { auth: true, body: true, run: (c) => deleteSubscription(c.body, c.device, c.env) },
  } },
  { re: /^\/v1\/checkins$/, methods: {
    PUT: { auth: true, body: true, run: (c) => putCheckins(c.body, c.device, c.env, c.now) },
  } },
  { re: /^\/v1\/checkins\/([^/]+)\/ack$/, methods: {
    POST: { auth: true, run: (c) => ackCheckin(c.params[0], c.device, c.env) },
  } },
];

/**
 * @param {Request} request
 * @param {any} env
 * @returns {Promise<Response>}
 */
async function route(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    } });
  }
  const r = ROUTES.find((x) => x.re.test(url.pathname));
  if (!r) throw new HttpError(404, 'not_found');
  const h = r.methods[request.method];
  if (!h) {
    const res = json(405, { error: 'method_not_allowed' });
    res.headers.set('Allow', Object.keys(r.methods).join(', '));
    return res;
  }
  const now = nowMs(env);
  const m = r.re.exec(url.pathname);
  let params;
  try { params = m.slice(1).map(decodeURIComponent); } catch { throw new HttpError(400, 'bad_request'); }
  const c = { env, now, params, body: undefined, device: null };
  if (h.auth) {
    c.device = await authenticate(request, env, now);
    if (!c.device) {
      const res = json(401, { error: 'unauthorized' });
      res.headers.set('WWW-Authenticate', 'Bearer');
      return res;
    }
  }
  if (h.body) c.body = await readJson(request);
  return h.run(c);
}

/**
 * Fetch handler with CORS and error mapping. Exported for tests.
 * @param {Request} request
 * @param {{DB: any, ALLOWED_ORIGIN: string, VAPID_PRIVATE_JWK?: string, VAPID_SUBJECT?: string, __now?: any}} env
 * @param {ExecutionContext} [ctx]
 * @returns {Promise<Response>}
 */
export async function handleFetch(request, env, ctx) {
  let res;
  try {
    res = await route(request, env);
  } catch (err) {
    if (err instanceof HttpError) {
      res = json(err.status, { error: ERR_CODES[err.status] || err.code });
    } else {
      // Log only the error type/message, never request data (§17).
      console.error('internal', err && err.name, err && err.message);
      res = json(500, { error: 'internal' });
    }
  }
  return withHeaders(res, corsHeaders(request, env));
}

/**
 * One cron run: send due check-ins, then daily housekeeping. Exported for tests.
 * @param {any} env
 * @param {number} [now]
 * @param {typeof fetch} [fetchImpl]
 */
export async function runCron(env, now = Date.now(), fetchImpl = (...a) => fetch(...a)) {
  const stats = await runCheckins(env, now, fetchImpl);
  const housekept = await housekeep(env, now);
  return { ...stats, housekept };
}

export default {
  /** @param {Request} request @param {any} env @param {ExecutionContext} ctx */
  fetch(request, env, ctx) {
    return handleFetch(request, env, ctx);
  },
  /** @param {ScheduledController} event @param {any} env @param {ExecutionContext} ctx */
  scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env, nowMs(env), env.__fetch || ((...a) => fetch(...a))).catch((err) => {
      console.error('cron', err && err.name, err && err.message);
    }));
  },
};
