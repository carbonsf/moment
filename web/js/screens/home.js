// @ts-check
/** §6.2 Home. Setup card rules (§6.9) live here. DD-031 */
import { S } from '../strings.js';
import { h, button, link } from '../ui/dom.js';
import { app, bus, startMoment, getActiveMoment, allMoments } from '../state.js';
import { cumulativeCount } from '../lib/metrics.js';
import { nextCheckin, stopForToday } from '../services/checkins.js';
import { clockTime } from './_shared.js';
import { HOUR } from '../lib/time.js';

export const SETUP_CALM_MS = 2 * HOUR;
const UNFINISHED_WINDOW_MS = 24 * HOUR;
let setupShownThisSession = false; // DD-052: "shown today" = first app session of the day

/** Local "YYYY-MM-DD". */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** First incomplete setup item, or null. */
export function nextSetupItem() {
  const p = app.profile;
  if (!(p.reasons || []).filter(Boolean).length) return 'reasons';
  if (!(p.messageToSelf || '').trim()) return 'message';
  if (!p.thoughtsReviewed) return 'thoughts';
  if (!(p.ifThenPlans || []).length) return 'plans';
  return null;
}

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const now = Date.now();
  const moments = await allMoments();

  const startBtn = h('button', {
    type: 'button', class: 'btn-moment',
    on: {
      click: async () => {
        // One tap creates the moment and starts its clock (P1, DD-007). E3: resumes an active one.
        const m = await startMoment();
        ctx.go(m.lastRoute && m.lastRoute !== '#/moment' ? m.lastRoute : '#/moment');
      },
    },
  }, S.home.mainButton);
  const heading = h('h1', { class: 'sr-only', tabindex: '-1' }, S.appName);
  view.append(heading, startBtn);

  // Status line when a check-in plan is active.
  const next = await nextCheckin(now);
  if (next) {
    view.append(h('p', { class: 'status-line' },
      S.home.nextCheckin(clockTime(next.dueAt)), ' · ',
      button(S.home.stopForToday, async () => { await stopForToday(); ctx.go('#/home', { replace: true }); }, 'link')));
  }

  // Unfinished line (last 24 h). DD-076: dismissal is remembered per moment id.
  const dismissed = await app.db.getMeta('dismissedUnfinished');
  const unfinished = [...moments].reverse().find((m) => m.status === 'unfinished' && now - (m.endedAt || m.startedAt) < UNFINISHED_WINDOW_MS);
  if (unfinished && unfinished.id !== dismissed) {
    const row = h('div', { class: 'card notice-card' },
      h('p', null, S.home.unfinished),
      h('div', { class: 'row' },
        link(S.home.unfinishedAdd, `#/moment/close?m=${unfinished.id}`, 'btn btn-secondary-solid'),
        button(S.home.dismiss, async () => { await app.db.setMeta('dismissedUnfinished', unfinished.id); row.remove(); }, 'btn btn-text')));
    view.append(row);
  }

  // Setup card (§6.9): calm window, once per day, one item.
  const active = await getActiveMoment();
  const recentClose = moments.some((m) => m.status === 'closed' && m.endedAt && now - m.endedAt < SETUP_CALM_MS);
  const lastDate = await app.db.getMeta('lastSetupCardDate');
  const item = nextSetupItem();
  if (!active && !recentClose && item && (lastDate !== today() || setupShownThisSession)) {
    setupShownThisSession = true;
    await app.db.setMeta('lastSetupCardDate', today());
    const card = h('section', { class: 'card setup-card', 'aria-label': S.home.setupTitle },
      h('h2', { class: 'card-title' }, S.home.setupTitle),
      h('p', null, S.home.setupItem[/** @type {keyof typeof S.home.setupItem} */ (item)]),
      h('div', { class: 'row' },
        link(S.home.setupGo, `#/setup/${item}`, 'btn btn-secondary-solid'),
        button(S.common.notNow, () => { setupShownThisSession = false; card.remove(); }, 'btn btn-text')));
    view.append(card);
  }

  // DD-014/DD-015: no streaks or day counts; only the cumulative count, shown from 1.
  const n = cumulativeCount(moments);
  if (n >= 1) view.append(h('p', { class: 'cumulative' }, S.home.cumulative(n)));

  view.append(h('nav', { class: 'footer-links', 'aria-label': S.appName },
    link(S.home.footer.lookback, '#/lookback'), h('span', { 'aria-hidden': 'true' }, '·'),
    link(S.home.footer.lists, '#/lists'), h('span', { 'aria-hidden': 'true' }, '·'),
    link(S.home.footer.learn, '#/learn'), h('span', { 'aria-hidden': 'true' }, '·'),
    link(S.home.footer.settings, '#/settings')));

  const off = bus.on('checkins', () => { if (location.hash === '#/home') ctx.go('#/home', { replace: true }); });
  ctx.onCleanup(off);
}
