// @ts-check
/** §6.3.8 The thought: tap a permission thought → its counter, large, in the own-words style. DD-030 */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { getList, updateMoment } from '../state.js';
import { enterMoment, stepIndicator } from './_shared.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'decide');
  if (!m) return;
  ctx.setBack('#/moment/decide');
  const thoughts = await getList('permissionThoughts');
  const body = h('div', { class: 'thought-body' });

  const showList = () => {
    body.replaceChildren(
      h('ul', { class: 'option-list' }, thoughts.map((t) => h('li', null,
        h('button', { type: 'button', class: 'option-card', on: { click: () => pick(t) } }, h('span', { class: 'option-label' }, t.thought))))),
      button(S.thought.none, () => ctx.go('#/moment/decide'), 'btn btn-text'));
  };

  /** @param {any} t */
  const pick = async (t) => {
    await updateMoment(m.id, (x) => { if (!x.decide.thoughtIds.includes(t.id)) x.decide.thoughtIds.push(t.id); });
    const counter = h('blockquote', { class: 'own-words own-words-large', tabindex: '-1' }, t.counter);
    body.replaceChildren(
      h('p', { class: 'muted' }, t.thought),
      counter,
      h('div', { class: 'actions' },
        button(S.thought.another, showList, 'btn btn-secondary'),
        button(S.thought.back, () => ctx.go('#/moment/decide'), 'btn btn-text')));
    counter.focus();
  };

  view.append(stepIndicator('decide', ctx), title(S.thought.title), body);
  showList();
}
