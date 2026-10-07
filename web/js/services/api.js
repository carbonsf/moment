// @ts-check
/** Worker client (§8). Network-only; callers decide how to queue on failure. DD-002 */
import { API_BASE, BACKEND_CONFIGURED } from '../config.js';
import { app } from '../state.js';

export class ApiError extends Error {
  /** @param {string} code @param {number} status 0 = network/offline */
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

/**
 * @param {string} method @param {string} path @param {any} [body] @param {{auth?:boolean, keepalive?:boolean}} [opts]
 */
async function call(method, path, body, opts = {}) {
  if (!BACKEND_CONFIGURED) throw new ApiError('not_configured', 0);
  /** @type {Record<string,string>} */
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false) {
    const id = app.identity;
    if (!id) throw new ApiError('no_identity', 0);
    headers.Authorization = `Bearer ${id.deviceId}.${id.authToken}`;
  }
  let res;
  try {
    res = await fetch(`${API_BASE}/v1${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: !!opts.keepalive,
    });
  } catch {
    throw new ApiError('offline', 0);
  }
  if (!res.ok) {
    let code = 'http_' + res.status;
    try { code = (await res.json()).error || code; } catch { /* no body */ }
    throw new ApiError(code, res.status);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  health: () => call('GET', '/health', undefined, { auth: false }),
  /** @param {string} deviceId @param {string} authToken */
  register: (deviceId, authToken) => call('POST', '/devices', { deviceId, authToken }, { auth: false }),
  deleteDevice: () => call('DELETE', '/devices/me'),
  /** @param {{cursor:number, changes:any[]}} body */
  sync: (body) => call('POST', '/sync', body),
  /** @param {{endpoint:string, keys:{p256dh:string, auth:string}}} sub */
  putPushSub: (sub) => call('PUT', '/push-subscription', sub),
  /** @param {string} endpoint */
  deletePushSub: (endpoint) => call('DELETE', '/push-subscription', { endpoint }),
  /** @param {{id:string, dueAt:number, kind:string}[]} items */
  putCheckins: (items) => call('PUT', '/checkins', { items }),
  /** @param {string} id */
  ack: (id) => call('POST', `/checkins/${encodeURIComponent(id)}/ack`, undefined, { keepalive: true }),
};
