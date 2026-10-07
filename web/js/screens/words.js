// @ts-check
/** §6.3.9 Your words: reasons and message to self in the user's own voice. DD-030 */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { app, updateMoment } from '../state.js';
import { enterMoment, stepIndicator } from './_shared.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'decide');
  if (!m) return;
  ctx.setBack('#/moment/decide');
  await updateMoment(m.id, (x) => { x.decide.wordsViewed = true; });
  const reasons = (app.profile.reasons || []).filter(Boolean);
  const msg = (app.profile.messageToSelf || '').trim();

  view.append(stepIndicator('decide', ctx), title(S.decide.words));
  if (!reasons.length && !msg) {
    view.append(
      h('p', { class: 'muted' }, S.words.empty),
      h('ul', { class: 'own-list' }, S.words.defaults.map((d) => h('li', { class: 'own-words' }, d))));
  } else {
    if (reasons.length) {
      view.append(h('h2', { class: 'section-title' }, S.words.reasonsTitle),
        h('ul', { class: 'own-list' }, reasons.map((r) => h('li', { class: 'own-words' }, r))));
    }
    if (msg) {
      view.append(h('h2', { class: 'section-title' }, S.words.messageTitle),
        h('blockquote', { class: 'own-words own-words-message' }, msg));
    }
  }
  view.append(h('div', { class: 'actions' }, button(S.words.back, () => ctx.go('#/moment/decide'), 'btn btn-secondary')));
}
