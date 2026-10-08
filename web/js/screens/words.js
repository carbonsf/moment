// @ts-check
/** §6.3.9 Your words on the tide (DD-089): the water sits low so your own words are in clear air, sand style (DD-030). */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { app, updateMoment } from '../state.js';
import { enterMoment, stepIndicator } from './_shared.js';
import { setWaterScreen } from '../ui/tide/water.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'decide');
  if (!m) return;
  ctx.setBack('#/moment/decide');
  setWaterScreen('words');
  await updateMoment(m.id, (x) => { x.decide.wordsViewed = true; });
  const reasons = (app.profile.reasons || []).filter(Boolean);
  const msg = (app.profile.messageToSelf || '').trim();

  view.classList.add('view-tide');
  view.append(stepIndicator('decide', ctx), title(S.decide.words, 'sr-only'));
  if (!reasons.length && !msg) {
    view.append(
      h('h2', { class: 'section-title tide-label' }, S.words.reasonsTitle),
      h('p', { class: 'muted' }, S.words.empty),
      h('ul', { class: 'own-list' }, S.words.defaults.map((d) => h('li', { class: 'own-words tide-own' }, d))));
  } else {
    if (reasons.length) {
      view.append(h('h2', { class: 'section-title tide-label' }, S.words.reasonsTitle),
        h('ul', { class: 'own-list' }, reasons.map((r) => h('li', { class: 'own-words tide-own' }, r))));
    }
    if (msg) {
      view.append(h('h2', { class: 'section-title tide-label' }, S.words.messageTitle),
        h('blockquote', { class: 'own-words own-words-message tide-own' }, msg));
    }
  }
  view.append(h('div', { class: 'tide-pills tide-pills-1' }, button(S.words.back, () => ctx.go('#/moment/decide'), 'btn tide-pill')));
}
