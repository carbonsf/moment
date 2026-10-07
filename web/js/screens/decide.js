// @ts-check
/** §6.3.6 Decide hub: three cards in any order, plus up to 3 if-then plans. */
import { S } from '../strings.js';
import { h, title } from '../ui/dom.js';
import { getList, updateMoment } from '../state.js';
import { enterMoment, stepIndicator, validPlans, planThen } from './_shared.js';

export const PLANS_SHOWN = 3;

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'decide');
  if (!m) return;
  const triggers = await getList('triggerTags');
  const options = await getList('distractOptions');

  /** @param {string} t @param {string} sub @param {string} href */
  const card = (t, sub, href) => h('li', null, h('a', { class: 'card card-link', href },
    h('span', { class: 'card-title' }, t), h('span', { class: 'muted' }, sub)));

  view.append(
    stepIndicator('decide', ctx),
    title(S.decide.title),
    h('ul', { class: 'card-list' },
      card(S.decide.tape, S.decide.tapeSub, '#/moment/decide/tape'),
      card(S.decide.thought, S.decide.thoughtSub, '#/moment/decide/thought'),
      card(S.decide.words, S.decide.wordsSub, '#/moment/decide/words')),
  );

  // Matching plans first (trigger chosen in this moment), else all; plans with hidden triggers show without a match (E28).
  const plans = validPlans(triggers);
  const matching = plans.filter((p) => p.valid && m.triggerTagIds.includes(p.triggerTagId));
  const shown = (matching.length ? matching : plans).slice(0, PLANS_SHOWN);
  if (shown.length) {
    await updateMoment(m.id, (x) => { x.decide.plansShown = [...new Set([...(x.decide.plansShown || []), ...shown.map((p) => p.id)])]; }, { touch: false });
    view.append(h('section', { class: 'plans' },
      h('h2', { class: 'section-title' }, S.decide.plans),
      h('ul', { class: 'own-list' }, shown.map((p) => {
        const trig = triggers.find((t) => t.id === p.triggerTagId);
        const then = planThen(p, options);
        return h('li', { class: 'own-words' }, p.valid && trig ? S.decide.planLine(trig.label, then) : S.decide.planNoTrigger(then));
      }))));
  }
}
