// @ts-check
/** §6.11 Settings. */
import { S } from '../strings.js';
import { APP_VERSION, FLAGS } from '../config.js';
import { h, title, button, link, flash } from '../ui/dom.js';
import { app, bus, saveSettings, getActiveMoment } from '../state.js';
import { ALL_STORES, openDB } from '../db.js';
import { api } from '../services/api.js';
import { restoreLink } from '../services/identity.js';
import { permissionState, requestFromSettings, unsubscribe } from '../services/push.js';
import { syncStatus, syncNow } from '../services/syncer.js';
import { supportEnabled, getSupportPerson, saveSupportPerson } from '../services/support.js';
import { ago } from './_shared.js';
import { ITEMS } from './setup.js';
import { VISUAL_IDS } from '../ui/breath/index.js';

/** @param {string} label @param {boolean} on @param {(v:boolean)=>void} onChange @param {string} id */
function toggle(label, on, onChange, id) {
  const b = h('button', {
    type: 'button', class: 'toggle', role: 'switch', id, 'aria-checked': String(on),
    on: { click: () => { on = !on; b.setAttribute('aria-checked', String(on)); onChange(on); } },
  }, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }, h('span', { class: 'toggle-thumb' })), h('span', null, label));
  return b;
}

/**
 * Segmented single choice (radio group).
 * @param {string} legend @param {[string|number, string][]} opts @param {string|number} value @param {(v:any)=>void} onChange
 */
function segmented(legend, opts, value, onChange) {
  const name = `seg-${Math.random().toString(36).slice(2, 8)}`;
  return h('fieldset', { class: 'field' }, h('legend', { class: 'field-label' }, legend),
    h('div', { class: 'segmented segmented-radio' }, opts.map(([v, lab]) => {
      const id = `${name}-${v}`;
      const inp = /** @type {HTMLInputElement} */ (h('input', { type: 'radio', name, id, value: String(v), class: 'sr-only-input', checked: v === value,
        on: { change: () => onChange(v) } }));
      return h('span', { class: 'segment-radio' }, inp, h('label', { for: id, class: 'segment' }, lab));
    })));
}

/** @param {string} label @param {string} value @param {(v:string)=>void} onChange @param {string} id */
function timeField(label, value, onChange, id) {
  const inp = /** @type {HTMLInputElement} */ (h('input', { type: 'time', class: 'input input-time', id, value, step: 300 }));
  inp.addEventListener('change', () => { if (/^\d\d:\d\d$/.test(inp.value)) onChange(inp.value); });
  return h('div', { class: 'field field-inline' }, h('label', { for: id, class: 'field-label' }, label), inp);
}

/** Breath visual choice (DD-081). @param {string} value @param {(v:string)=>void} onChange */
function breathPicker(value, onChange) {
  const sel = /** @type {HTMLSelectElement} */ (h('select', { class: 'input', id: 'set-breath' },
    VISUAL_IDS.map((id) => h('option', { value: id }, S.settings.breathVisuals[/** @type {'wave'} */ (id)] || id))));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return h('div', { class: 'field' }, h('label', { for: 'set-breath', class: 'field-label' }, S.settings.breathVisual), sel);
}

/** Everything except meta.secret (§6.11). The sync queue is internal and left out. DD-074 */
async function buildExport() {
  /** @type {Record<string, any>} */
  const out = { app: 'moment', version: APP_VERSION, exportedAt: new Date().toISOString() };
  for (const s of ALL_STORES) {
    if (s === 'syncQueue') continue;
    const rows = await app.db.getAllRaw(s);
    out[s] = s === 'meta' ? rows.filter((r) => r.key !== 'secret') : rows;
  }
  return JSON.stringify(out, null, 2);
}

async function doExport() {
  const json = await buildExport();
  const name = `moment-export-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const nav = /** @type {any} */ (navigator);
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file] }); return; } catch (e) { if (/** @type {any} */ (e)?.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Delete everything (§6.11, E24). */
async function deleteEverything() {
  const id = app.identity;
  await unsubscribe();
  let serverDone = false;
  try { await api.deleteDevice(); serverDone = true; } catch (e) {
    if (/** @type {any} */ (e)?.code === 'not_configured' || /** @type {any} */ (e)?.status === 404 || /** @type {any} */ (e)?.status === 401) serverDone = true;
  }
  await app.db.destroy();
  try {
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
    if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  } catch { /* ignore */ }
  if (!serverDone && id) {
    // Fresh meta carries the retry for the server delete.
    const { b64urlEncode } = await import('../lib/crypto.js');
    const fresh = await openDB();
    await fresh.setMeta('pendingServerDelete', { deviceId: id.deviceId, secret: b64urlEncode(id.secret) });
    fresh.idb?.close();
  }
  location.replace(`${location.pathname}#/home`);
  location.reload();
}

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  ctx.setBack('#/home');
  const st = app.settings;
  const status = h('div', { class: 'status-slot', role: 'status' });
  /** @param {Partial<typeof st>} patch */
  const set = async (patch) => { await saveSettings(patch); flash(status, S.setup.saved); };

  // Check-ins
  const perm = permissionState(); // DD-075: the spec's iOS fix path is shown for any denied state
  const notifText = perm === 'granted' ? S.settings.notifOn : perm === 'unsupported' ? S.settings.notifUnsupported : perm === 'denied' ? S.settings.notifOff : S.settings.notifOff;
  const notifRow = h('div', { class: 'field' },
    h('p', { class: 'field-label' }, S.settings.notifications),
    h('p', { class: perm === 'denied' ? 'notice' : null }, perm === 'default' ? '' : notifText),
    perm === 'default' ? button(S.settings.notifTurnOn, () => { requestFromSettings().then(() => ctx.go('#/settings', { replace: true })); }, 'btn btn-secondary') : null);

  const checkins = h('section', { class: 'card settings-section', 'aria-labelledby': 'set-checkins' },
    h('h2', { class: 'section-title', id: 'set-checkins' }, S.settings.checkins),
    toggle(S.settings.checkinsOn, !!st.checkinsEnabled, (v) => set({ checkinsEnabled: v }), 'set-checkins-on'),
    timeField(S.settings.evening, st.eveningTime, (v) => set({ eveningTime: v }), 'set-evening'),
    timeField(S.settings.morning, st.morningTime, (v) => set({ morningTime: v }), 'set-morning'),
    timeField(S.settings.quietStart, st.quietStart, (v) => set({ quietStart: v }), 'set-qs'),
    timeField(S.settings.quietEnd, st.quietEnd, (v) => set({ quietEnd: v }), 'set-qe'),
    notifRow);

  const moments = h('section', { class: 'card settings-section', 'aria-labelledby': 'set-moments' },
    h('h2', { class: 'section-title', id: 'set-moments' }, S.settings.moments),
    segmented(S.settings.delayLength, [5, 10, 15, 20].map((n) => [n, S.settings.minutes(n)]), st.delayMinutes, (v) => set({ delayMinutes: v })),
    segmented(S.settings.ratingInterval, [60, 120, 180].map((n) => [n, S.settings.minutes(n / 60)]), st.ratingPromptSec, (v) => set({ ratingPromptSec: v })),
    FLAGS.shadowPrompt ? toggle(S.settings.shadow, !!st.shadowPrompt, (v) => set({ shadowPrompt: v }), 'set-shadow') : null);

  const motion = h('section', { class: 'card settings-section', 'aria-labelledby': 'set-motion' },
    h('h2', { class: 'section-title', id: 'set-motion' }, S.settings.motion),
    segmented(S.settings.motion, [['system', S.settings.motionSystem], ['on', S.settings.motionReduce], ['off', S.settings.motionFull]], st.reducedMotion, (v) => set({ reducedMotion: v })),
    breathPicker(st.breathVisual || 'wave', (v) => set({ breathVisual: v })));

  const setup = h('section', { class: 'card settings-section', 'aria-labelledby': 'set-setup' },
    h('h2', { class: 'section-title', id: 'set-setup' }, S.settings.setup),
    h('ul', { class: 'plain-list link-list' }, ITEMS.map((it) => h('li', null, link(S.setup.items[/** @type {'reasons'} */ (it)], `#/setup/${it}?from=settings`)))));

  // Your data
  const syncLine = h('p', { 'aria-live': 'polite' });
  const drawSync = () => {
    if (!syncStatus.enabled) { syncLine.textContent = S.settings.syncOff; return; }
    const parts = [syncStatus.offline ? S.settings.offline : syncStatus.lastSyncAt ? S.settings.synced(ago(syncStatus.lastSyncAt)) : S.settings.neverSynced];
    if (syncStatus.pending) parts.push(S.settings.pending(syncStatus.pending));
    syncLine.textContent = parts.join(' · ');
  };
  drawSync();
  ctx.onCleanup(bus.on('sync', drawSync));
  if (syncStatus.enabled) syncNow();

  let persisted = false;
  try { persisted = !!(await /** @type {any} */ (navigator.storage)?.persisted?.()); } catch { /* ignore */ }

  const linkBox = h('div', { class: 'restore-box', hidden: true });
  const revealBtn = button(S.settings.reveal, () => {
    const url = restoreLink();
    const code = h('code', { class: 'restore-link' }, url);
    linkBox.replaceChildren(code, button(S.settings.copy, async () => {
      try { await navigator.clipboard.writeText(url); flash(linkBox, S.settings.copied); } catch {
        const r = document.createRange(); r.selectNodeContents(code); const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
      }
    }, 'btn btn-secondary'));
    linkBox.hidden = false;
    revealBtn.hidden = true;
  }, 'btn btn-secondary');

  // DD-046: paste field, since iOS Home Screen apps have no address bar to open a restore link in.
  const pasteInp = /** @type {HTMLInputElement} */ (h('input', { type: 'url', class: 'input', id: 'paste-restore', autocomplete: 'off', spellcheck: false }));
  const pasteForm = h('form', { class: 'field', on: { submit: (/** @type {Event} */ e) => {
    e.preventDefault();
    const v = pasteInp.value.trim();
    const i = v.indexOf('#/restore/');
    const token = i >= 0 ? v.slice(i + '#/restore/'.length) : v;
    if (token) ctx.go(`#/restore/${token}`);
  } } }, h('label', { for: 'paste-restore', class: 'field-label' }, S.settings.restorePaste), pasteInp,
  h('button', { type: 'submit', class: 'btn btn-secondary' }, S.settings.restorePasteBtn));

  const delField = /** @type {HTMLInputElement} */ (h('input', { type: 'text', class: 'input', id: 'del-confirm', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false }));
  const delGo = /** @type {HTMLButtonElement} */ (button(S.settings.deleteConfirm, async () => {
    if (delField.value.trim() !== S.settings.deleteWord) return;
    if (await getActiveMoment()) { /* allowed; the moment is deleted with everything else */ }
    delGo.disabled = true;
    delGo.textContent = S.settings.deleting;
    await deleteEverything();
  }, 'btn btn-secondary-solid'));
  delGo.disabled = true;
  delField.addEventListener('input', () => { delGo.disabled = delField.value.trim() !== S.settings.deleteWord; });
  const delBox = h('div', { class: 'card notice-card', hidden: true },
    h('p', null, S.settings.deleteExplain),
    h('div', { class: 'field' }, h('label', { for: 'del-confirm', class: 'field-label' }, S.settings.deleteField), delField),
    h('div', { class: 'row' }, delGo, button(S.common.cancel, () => { delBox.hidden = true; delStart.hidden = false; delField.value = ''; }, 'btn btn-text')));
  const delStart = button(S.settings.deleteAll, () => { delBox.hidden = false; delStart.hidden = true; delField.focus(); }, 'btn btn-text');

  const data = h('section', { class: 'card settings-section', 'aria-labelledby': 'set-data' },
    h('h2', { class: 'section-title', id: 'set-data' }, S.settings.data),
    syncLine,
    h('p', { class: 'muted small' }, persisted ? S.settings.persistOn : S.settings.persistOff),
    h('h3', { class: 'field-label' }, S.settings.restoreTitle),
    h('p', { class: 'notice small' }, S.settings.restoreWarning),
    h('p', { class: 'muted small' }, S.settings.restoreLost),
    revealBtn, linkBox,
    pasteForm,
    h('h3', { class: 'field-label' }, S.settings.exportBtn),
    h('p', { class: 'muted small' }, S.settings.exportWarning),
    button(S.settings.exportBtn, () => doExport(), 'btn btn-secondary'),
    delStart, delBox);

  // Support person (flagged stub, §18)
  let support = null;
  if (supportEnabled()) {
    const sp = getSupportPerson() || { name: '', method: 'sms', number: '', message: '' };
    const nameI = /** @type {HTMLInputElement} */ (h('input', { type: 'text', class: 'input', id: 'sp-name', value: sp.name }));
    const numI = /** @type {HTMLInputElement} */ (h('input', { type: 'tel', class: 'input', id: 'sp-num', value: sp.number }));
    const msgI = /** @type {HTMLInputElement} */ (h('input', { type: 'text', class: 'input', id: 'sp-msg', value: sp.message }));
    let method = sp.method;
    support = h('form', { class: 'card settings-section', on: { submit: async (/** @type {Event} */ e) => {
      e.preventDefault();
      await saveSupportPerson({ name: nameI.value.trim(), method: /** @type {'sms'|'tel'} */ (method), number: numI.value.trim(), message: msgI.value.trim() });
      flash(status, S.setup.saved);
    } } },
    h('h2', { class: 'section-title' }, S.settings.support),
    h('div', { class: 'field' }, h('label', { for: 'sp-name', class: 'field-label' }, S.settings.supportName), nameI),
    segmented(S.settings.supportMethod, [['sms', S.settings.supportSms], ['tel', S.settings.supportTel]], method, (v) => { method = v; }),
    h('div', { class: 'field' }, h('label', { for: 'sp-num', class: 'field-label' }, S.settings.supportNumber), numI),
    h('div', { class: 'field' }, h('label', { for: 'sp-msg', class: 'field-label' }, S.settings.supportMessage), msgI),
    h('button', { type: 'submit', class: 'btn btn-secondary' }, S.common.save));
  }

  const about = h('section', { class: 'card settings-section', 'aria-labelledby': 'set-about' },
    h('h2', { class: 'section-title', id: 'set-about' }, S.settings.about),
    h('p', null, S.settings.version(APP_VERSION)),
    h('p', null, S.settings.disclaimer));

  view.append(...[title(S.settings.title), status, checkins, moments, motion, setup, data, support, about].filter(Boolean));
}
