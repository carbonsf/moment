// @ts-check
/** §6.3.6 Decide hub on the tide (DD-089): water still and glassy at the current rating; three frosted cards; up to 3 plans. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { getList, updateMoment, latestRating } from '../state.js';
import { enterMoment, stepIndicator, validPlans, planThen } from './_shared.js';
import { setWaterScreen } from '../ui/tide/water.js';

export const PLANS_SHOWN = 3;

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'decide');
  if (!m) return;
  setWaterScreen('decide', { value: latestRating(m) });
  const triggers = await getList('triggerTags');
  const options = await getList('distractOptions');

  /** @param {string} t @param {string} sub @param {string} href */
  const card = (t, sub, href) => h('li', null, h('a', { class: 'card card-link tide-card tide-hub-card', href },
    h('span', { class: 'tide-hub-title' }, t), h('span', { class: 'muted' }, sub)));

  view.classList.add('view-tide');
  view.append(
    stepIndicator('decide', ctx),
    title(S.decide.title, 'screen-title tide-title'),
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
      h('h2', { class: 'section-title tide-label' }, S.decide.plans),
      h('ul', { class: 'own-list' }, shown.map((p) => {
        const trig = triggers.find((t) => t.id === p.triggerTagId);
        const then = planThen(p, options);
        return h('li', { class: 'own-words tide-own' }, p.valid && trig ? S.decide.planLine(trig.label, then) : S.decide.planNoTrigger(then));
      }))));
  }
  view.append(h('div', { class: 'tide-pills tide-pills-1' }, button(S.tide.backToWave, () => ctx.go('#/moment/surf'), 'btn tide-pill')));
}
