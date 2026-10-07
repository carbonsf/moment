// @ts-check
/** Shared pieces for moment-flow screens (§6.3). */
import { S } from '../strings.js';
import { h } from '../ui/dom.js';
import { getActiveMoment, setLastRoute, addStep, app } from '../state.js';
import { HOUR, MIN } from '../lib/time.js';

/** @typedef {import('../app.js').ScreenCtx} ScreenCtx */
/** @typedef {'delay'|'distract'|'decide'} DddStep */

/**
 * DDD step indicator: all three tappable in any order, active highlighted, plus "I'm done". DD-008
 * @param {DddStep|null} active @param {ScreenCtx} ctx
 */
export function stepIndicator(active, ctx) {
  /** @type {[DddStep, string, string][]} */
  const items = [['delay', S.steps.delay, '#/moment/surf'], ['distract', S.steps.distract, '#/moment/distract'], ['decide', S.steps.decide, '#/moment/decide']];
  const list = h('ol', { class: 'ddd' }, items.map(([key, label, href], i) => h('li', null,
    i > 0 ? h('span', { class: 'ddd-sep', 'aria-hidden': 'true' }, '·') : null,
    h('a', {
      href, class: ['ddd-step', key === active && 'is-active'],
      'aria-current': key === active ? 'step' : null,
    }, label))));
  const done = h('button', { type: 'button', class: 'link ddd-done', on: { click: () => ctx.go('#/moment/close') } }, S.steps.imDone);
  return h('nav', { class: 'ddd-bar', 'aria-label': S.steps.label }, list, done);
}

/**
 * Load the active moment, remember this route for resume (E1), and record the step.
 * @param {ScreenCtx} ctx @param {'distance'|'surf'|'distract'|'decide'|'close'|null} step
 */
export async function enterMoment(ctx, step) {
  const m = await getActiveMoment();
  if (!m) { ctx.go('#/home', { replace: true }); return null; }
  await setLastRoute(m.id, ctx.route.hash);
  if (step) return addStep(m.id, step);
  return m;
}

/** Duration in words. @param {number} ms */
export function durationText(ms) {
  const m = Math.round(ms / MIN);
  if (m < 1) return S.time.lessThanMin;
  if (ms < HOUR) return S.time.min(m);
  return S.time.hourMin(Math.floor(m / 60), m % 60);
}

/** Time in device locale (§12). @param {number} ms */
export function clockTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Date + time in device locale. @param {number} ms */
export function dateTime(ms) {
  return new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "2 min ago". @param {number} ms */
export function ago(ms) {
  const d = Date.now() - ms;
  if (d < MIN) return S.time.justNow;
  if (d < HOUR) return S.time.minAgo(Math.round(d / MIN));
  if (d < 24 * HOUR) return S.time.hAgo(Math.round(d / HOUR));
  return S.time.dAgo(Math.round(d / (24 * HOUR)));
}

/** If-then plans whose trigger is still visible. @param {any[]} triggers visible trigger tags */
export function validPlans(triggers) {
  const ids = new Set(triggers.map((t) => t.id));
  return (app.profile.ifThenPlans || []).map((p) => ({ ...p, valid: ids.has(p.triggerTagId) }));
}

/**
 * Resolve a plan's "then" text (distract option label or written text).
 * @param {{thenText:string, distractOptionId?:string}} plan @param {any[]} options
 */
export function planThen(plan, options) {
  if (plan.thenText) return plan.thenText;
  const o = options.find((x) => x.id === plan.distractOptionId);
  return o ? o.label.charAt(0).toLowerCase() + o.label.slice(1) : '';
}

/** Category icon name. @param {string} cat */
export function categoryIcon(cat) {
  return /** @type {'body'|'place'|'hands'|'mind'} */ (['body', 'place', 'hands', 'mind'].includes(cat) ? cat : 'mind');
}
