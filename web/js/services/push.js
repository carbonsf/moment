// @ts-check
/** §7.2 notification permission + push subscription. DD-018 */
import { VAPID_PUBLIC_KEY, FLAGS, BACKEND_CONFIGURED } from '../config.js';
import { app } from '../state.js';
import { b64urlDecode, b64urlEncode } from '../lib/crypto.js';
import { api } from './api.js';

/** Cached at boot so tap handlers can decide synchronously (iOS needs the gesture). */
export const pushState = { asked: false, explained: false };

export async function loadPushState() {
  pushState.asked = !!(await app.db.getMeta('notifAskedAt'));
  pushState.explained = !!(await app.db.getMeta('notifExplainedAt'));
}

/** Push is possible here: APIs present, flag on, backend configured, and standalone on iOS. */
export function pushSupported() {
  if (!FLAGS.push || !BACKEND_CONFIGURED || VAPID_PUBLIC_KEY.startsWith('REPLACE')) return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (app.isIOS && !app.standalone) return false;
  return true;
}

/** @returns {'granted'|'denied'|'default'|'unsupported'} */
export function permissionState() {
  if (!pushSupported()) return 'unsupported';
  return /** @type {any} */ (Notification.permission);
}

/**
 * Call synchronously at the top of a tap handler ("Yes", "In 10 min", "Check on me later").
 * Requests permission only the first time; otherwise ensures the subscription.
 * Resolves to 'granted' | 'denied' | 'unsupported' | 'default'.
 * @returns {Promise<string>}
 */
export function requestInGesture() {
  const st = permissionState();
  if (st === 'unsupported' || st === 'denied') return Promise.resolve(st);
  if (st === 'granted') return subscribe().then(() => 'granted', () => 'granted');
  if (pushState.asked) return Promise.resolve('default');
  pushState.asked = true;
  // requestPermission must be the first async step inside the gesture (iOS).
  const p = Notification.requestPermission();
  app.db.setMeta('notifAskedAt', Date.now());
  return Promise.resolve(p).then(async (res) => {
    if (res === 'granted') {
      try { await subscribe(); } catch (e) { console.warn('subscribe failed', e); }
    }
    return res;
  });
}

/** Settings "Turn on notifications" button. */
export function requestFromSettings() {
  if (permissionState() !== 'default') return Promise.resolve(permissionState());
  pushState.asked = true;
  const p = Notification.requestPermission();
  app.db.setMeta('notifAskedAt', Date.now());
  return Promise.resolve(p).then(async (res) => {
    if (res === 'granted') await subscribe().catch(() => {});
    return res;
  });
}

async function registration() {
  return navigator.serviceWorker.ready;
}

/** Subscribe (or reuse), then PUT to the server and remember the endpoint. */
export async function subscribe() {
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlDecode(VAPID_PUBLIC_KEY) });
  }
  await sendSubscription(sub);
}

/** @param {PushSubscription} sub */
async function sendSubscription(sub) {
  const json = sub.toJSON();
  const keys = json.keys || {
    p256dh: b64urlEncode(/** @type {ArrayBuffer} */ (sub.getKey('p256dh'))),
    auth: b64urlEncode(/** @type {ArrayBuffer} */ (sub.getKey('auth'))),
  };
  await api.putPushSub({ endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
  await app.db.setMeta('pushEndpoint', sub.endpoint);
}

/** On every open: re-PUT when the endpoint changed or the subscription expired (E14). */
export async function checkSubscription() {
  if (permissionState() !== 'granted') return;
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      await subscribe();
      return;
    }
    if (sub.endpoint !== (await app.db.getMeta('pushEndpoint'))) await sendSubscription(sub);
  } catch (e) {
    console.warn('push check failed', e);
  }
}

/** Unsubscribe locally and on the server (Delete everything). */
export async function unsubscribe() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) {
      api.deletePushSub(sub.endpoint).catch(() => {});
      await sub.unsubscribe();
    }
  } catch { /* ignore */ }
}

/** Whether to show the one-time "notifications are off" sheet (§7.2). */
export function shouldExplainDenied() {
  if (pushState.explained) return false;
  const st = permissionState();
  return st === 'denied' || st === 'unsupported';
}

export async function markExplained() {
  pushState.explained = true;
  await app.db.setMeta('notifExplainedAt', Date.now());
}
