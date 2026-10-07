// @ts-check
/** §6.13 Restore from `#/restore/<deviceId>.<secret>` (E21, E22). No local change until the server accepts the identity. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { app, seedDefaults, reloadSettings, reloadProfile, bus } from '../state.js';
import { parseRestoreToken, deriveAuthToken, deriveEncKey } from '../lib/crypto.js';
import { SYNCED_STORES } from '../lib/sync.js';
import { api, ApiError } from '../services/api.js';
import { adoptIdentity } from '../services/identity.js';
import { syncNow, syncStatus } from '../services/syncer.js';
import { checkSubscription } from '../services/push.js';

/** Any user-made data here? Seeded defaults have updatedAt 0. */
async function hasLocalData() {
  for (const s of SYNCED_STORES) {
    if ((await app.db.getAllRaw(s)).some((r) => r.updatedAt > 0)) return true;
  }
  return false;
}

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  ctx.setBack('#/home');
  const parsed = parseRestoreToken(ctx.params.token);
  view.append(title(S.restore.title));
  if (!parsed) {
    view.append(h('p', { class: 'notice' }, S.restore.bad), button(S.restore.home, () => ctx.go('#/home')));
    return;
  }
  const msg = h('p', { 'aria-live': 'polite', class: 'status-line' });
  if (app.isIOS && !app.standalone) view.append(h('p', { class: 'notice small' }, S.restore.iosNote));
  const already = app.identity?.deviceId === parsed.deviceId;
  const local = !already && (await hasLocalData());
  view.append(h('p', null, S.restore.intro));
  if (local) view.append(h('p', null, S.restore.hasData));

  /** @param {'replace'|'merge'} mode */
  const run = async (mode) => {
    for (const b of view.querySelectorAll('button')) /** @type {HTMLButtonElement} */ (b).disabled = true;
    msg.textContent = S.restore.working;
    // Preflight with the candidate identity; nothing local changes if it fails (E21). DD-073
    const prev = app.identity;
    try {
      app.identity = { deviceId: parsed.deviceId, secret: parsed.secret, authToken: await deriveAuthToken(parsed.secret), encKey: await deriveEncKey(parsed.secret) };
      await api.sync({ cursor: 0, changes: [] });
    } catch (e) {
      app.identity = prev;
      msg.textContent = e instanceof ApiError && (e.status === 401 || e.status === 400) ? S.restore.bad : S.restore.failed;
      for (const b of view.querySelectorAll('button')) /** @type {HTMLButtonElement} */ (b).disabled = false;
      return;
    }
    if (mode === 'replace') {
      await app.db.clearAll();
      await seedDefaults();
    }
    await adoptIdentity(parsed.deviceId, parsed.secret);
    await app.db.setMeta('registeredAt', Date.now()); // the identity exists server-side
    if (mode === 'merge') await app.db.enqueueAll();
    await syncNow();
    await reloadSettings();
    await reloadProfile();
    bus.emit('settings');
    checkSubscription(); // re-register push for this identity
    history.replaceState(null, '', `${location.pathname}#/home`); // drop the secret from the URL
    msg.textContent = syncStatus.offline ? S.restore.failed : S.restore.done;
    view.append(button(S.restore.home, () => ctx.go('#/home')));
  };

  if (local) {
    view.append(h('div', { class: 'stack' },
      button(S.restore.replace, () => run('replace'), 'btn btn-secondary-solid'),
      button(S.restore.merge, () => run('merge'), 'btn btn-secondary-solid')));
  } else {
    view.append(button(S.restore.go, () => run(already ? 'merge' : 'replace')));
  }
  view.append(msg);
}
