// @ts-check
/** Boot, router outlet, install gate, SW registration, chrome (§6.0, §6.1). Vanilla ES modules, no build. DD-001 */
import { S } from './strings.js';
import { APP_VERSION } from './config.js';
import { openDB } from './db.js';
import { app, bus, initState, sweepActive, getActiveMoment } from './state.js';
import { parseHash, navigate, isMomentRoute } from './router.js';
import { h, clear, link, cssMs, reducedMotion } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { openSheet, closeSheet } from './ui/sheet.js';
import { initScrollHint } from './ui/scrollhint.js';
import { resourcesFor } from './content/resources.js';
import { ensureIdentity } from './services/identity.js';
import { loadPushState } from './services/push.js';
import { startSync } from './services/syncer.js';
import { checkTimeZone, findDueCheckin, cancelDueSoon } from './services/checkins.js';
import { getSupportPerson, supportHref } from './services/support.js';
import { holdWakeLock, releaseWakeLock } from './services/wakelock.js';

/**
 * @typedef {{
 *   route: import('./router.js').Route,
 *   params: Record<string,string>,
 *   query: URLSearchParams,
 *   go: (hash:string, opts?:{replace?:boolean}) => void,
 *   setBack: (href:string|null) => void,
 *   onCleanup: (fn:()=>void) => void,
 * }} ScreenCtx
 */

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const backSlot = h('div', { class: 'topbar-left' });
const helpLink = h('button', { type: 'button', class: 'link topbar-help', on: { click: () => openHelp() } }, S.common.moreHelp);
const header = h('header', { class: 'topbar' }, backSlot, helpLink);
const banners = h('div', { class: 'banners', role: 'region', 'aria-label': S.appName });
const main = h('main', { id: 'main', class: 'main' });
root.append(header, banners, main);
const updateScrollHint = initScrollHint(main);

/** @type {HTMLElement|null} */
let current = null;
/** @type {(() => void)[]} */
let cleanups = [];
let renderSeq = 0;

/** Apply motion preference (§13.4). DD-027 */
export function applyMotion() {
  const pref = app.settings.reducedMotion;
  const sys = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.dataset.motion = pref === 'on' || (pref === 'system' && sys) ? 'reduce' : 'full';
}

/** More help sheet (§6.12), reachable from every screen. */
export function openHelp() {
  const res = resourcesFor('en-US');
  const items = res.items.map((r) => h('li', { class: 'help-item' },
    h('p', null, r.text),
    h('div', { class: 'help-links' }, r.links.map((l) => h('a', { class: 'btn btn-secondary-solid', href: l.href }, l.label)))));
  const sp = getSupportPerson();
  if (sp) items.unshift(h('li', { class: 'help-item' }, h('a', { class: 'btn btn-secondary-solid', href: supportHref(sp) }, S.checkin.reach(sp.name))));
  openSheet({ title: S.help.title, content: [h('ul', { class: 'help-list' }, items), h('p', { class: 'muted small' }, res.footer)] });
}

/** Persistent banners (E12, E19). */
async function renderBanners(routeName) {
  clear(banners);
  if (app.db.memoryMode) {
    banners.append(h('div', { class: 'banner' }, icon('info'), h('span', null, S.banners.memoryMode, ' '), link(S.banners.exportNow, '#/settings')));
  }
  if (routeName === 'home' && app.isIOS && !app.standalone && (await app.db.getMeta('installDismissedAt'))) {
    banners.append(h('div', { class: 'banner' }, icon('info'), h('span', null, S.banners.browserTab)));
  }
}

/** @param {string|null} href */
function setBack(href) {
  clear(backSlot);
  if (href) backSlot.append(h('a', { class: 'icon-btn back-btn', href, 'aria-label': S.common.back }, icon('back')));
}

/** Render the current hash. */
async function render() {
  const seq = ++renderSeq;
  let route = parseHash(location.hash);
  if (!route) {
    navigate('#/home', { replace: true });
    return;
  }
  // Moment screens need an active moment (except close/after, which handle unfinished check-outs themselves).
  if (isMomentRoute(route.name) && !['close', 'after'].includes(route.name)) {
    const active = await getActiveMoment();
    if (!active) { navigate('#/home', { replace: true }); return; }
  }
  if (seq !== renderSeq) return;
  closeSheet();
  for (const fn of cleanups.splice(0)) { try { fn(); } catch (e) { console.error(e); } }

  const view = h('div', { class: 'view' });
  setBack(null);
  /** @type {ScreenCtx} */
  const ctx = {
    route,
    params: route.params,
    query: route.query,
    go: (hash, opts) => navigate(hash, opts),
    setBack,
    onCleanup: (fn) => cleanups.push(fn),
  };
  try {
    const mod = await import(`./screens/${route.name}.js`);
    if (seq !== renderSeq) return;
    await mod.render(view, ctx);
  } catch (e) {
    console.error(e);
  }
  if (seq !== renderSeq) return;
  await renderBanners(route.name);
  swap(view);
}

/** Crossfade only (§6.0); instant with reduced motion. */
function swap(view) {
  const old = current;
  current = view;
  const dur = reducedMotion() ? 0 : cssMs('--dur-base');
  if (old && dur > 0) {
    old.classList.add('view-leaving');
    view.classList.add('view-entering');
    main.append(view);
    void view.offsetWidth; // commit the start state so the fade runs without waiting on rAF. DD-058
    view.classList.remove('view-entering');
    setTimeout(() => old.remove(), dur);
  } else {
    old?.remove();
    main.append(view);
  }
  window.scrollTo(0, 0);
  updateScrollHint();
  const t = /** @type {HTMLElement|null} */ (view.querySelector('h1'));
  t?.focus({ preventScroll: true });
}

function detectPlatform() {
  const ua = navigator.userAgent;
  app.isIOS = !/Android/.test(ua) && (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  app.standalone = /** @type {any} */ (navigator).standalone === true || !!window.matchMedia?.('(display-mode: standalone)').matches;
}

/** Service worker with deferred updates: never reload mid-moment (E18). */
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    let reloaded = false;
    // First install claims the page too; only an update (there was a controller) warrants the one reload. DD-057
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      location.reload();
    });
    if (reg.waiting && navigator.serviceWorker.controller && !(await getActiveMoment())) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    navigator.serviceWorker.addEventListener('message', (ev) => {
      // Notification tapped while the app is open (§7.4, E16).
      if (ev.data?.type === 'navigate' && typeof ev.data.hash === 'string') navigate(ev.data.hash);
    });
  } catch (e) {
    console.warn('SW registration failed', e);
  }
}

/** Decide the first route (§6.1). @returns {Promise<string|null>} hash to go to, or null to keep current */
async function initialRoute() {
  const route = parseHash(location.hash);
  if (route?.name === 'restore') return null;
  const active = await sweepActive();
  if (active) return active.lastRoute || '#/moment';
  if (app.isIOS && !app.standalone && !(await app.db.getMeta('installDismissedAt'))) return '#/install';
  if (route && route.name !== 'install' && route.name !== 'home' && !isMomentRoute(route.name)) return null;
  const due = await findDueCheckin();
  if (due) return `#/checkin/${due.id}`;
  return '#/home';
}

/** On returning to the app: re-read state, expire stale moments, deliver due check-ins (§7.5, E2, E17). */
async function onVisible() {
  const route = parseHash(location.hash);
  const before = await getActiveMoment();
  const active = await sweepActive();
  if (before && !active && route && isMomentRoute(route.name)) { navigate('#/home', { replace: true }); return; }
  if (active) return;
  if (route && ['home', 'lookback', 'learn', 'lists'].includes(route.name)) {
    const due = await findDueCheckin();
    if (due) { navigate(`#/checkin/${due.id}`); return; }
  }
  await checkTimeZone();
  if (route?.name === 'home') render();
}

async function boot() {
  detectPlatform();
  const db = await openDB();
  await initState(db);
  await ensureIdentity();
  await loadPushState();
  applyMotion();
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', applyMotion);
  bus.on('settings', applyMotion);
  bus.on('moment:start', () => { cancelDueSoon(); holdWakeLock(); });
  bus.on('moment:close', () => releaseWakeLock());
  db.onChange((ev) => {
    // Another tab changed data (E17): re-render read-only screens.
    if (ev.remote && current) {
      const r = parseHash(location.hash);
      if (r && ['home', 'lookback', 'lists', 'settings'].includes(r.name)) render();
    }
  });

  try { await /** @type {any} */ (navigator.storage)?.persist?.(); } catch { /* E20 */ }

  window.addEventListener('hashchange', () => render());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onVisible(); });

  const first = await initialRoute();
  if (first && first !== location.hash) history.replaceState(null, '', first);
  if (await getActiveMoment()) holdWakeLock();
  await render();

  registerSW();
  await checkTimeZone();
  startSync();
  document.documentElement.dataset.version = APP_VERSION;
}

boot();
