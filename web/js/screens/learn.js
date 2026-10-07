// @ts-check
/** §6.10 Learn: five cards, each opens a short read (disclosure). Copy is final. */
import { S } from '../strings.js';
import { h, title } from '../ui/dom.js';
import { LEARN_CARDS } from '../content/learn.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  ctx.setBack('#/home');
  view.append(title(S.learn.title), h('ul', { class: 'card-list' }, LEARN_CARDS.map((c) => h('li', null,
    h('details', { class: 'card learn-card' },
      h('summary', { class: 'card-title' }, c.title),
      h('p', { class: 'learn-body' }, c.body))))));
}
