// @ts-check
/**
 * §6.3.8 The thought on the tide (DD-089). Thoughts hang underwater; tapping one sinks the list and drains the glass,
 * and the counter surfaces above the waterline in the sand own-words style (DD-030).
 */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { getList, updateMoment } from '../state.js';
import { enterMoment, stepIndicator } from './_shared.js';
import { setWaterScreen, setWaterLevel } from '../ui/tide/water.js';

const SURFACE_MS = 650;

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'decide');
  if (!m) return;
  ctx.setBack('#/moment/decide');
  setWaterScreen('thought');
  const thoughts = await getList('permissionThoughts');
  const body = h('div', { class: 'thought-body' });
  const heading = title(S.thought.title, 'screen-title tide-title tide-title-sm');

  const showList = () => {
    setWaterLevel(0.78);
    heading.hidden = false;
    const list = h('ul', { class: 'tide-options' }, thoughts.map((t, i) => {
      const b = h('button', { type: 'button', class: 'tide-option' }, t.thought);
      b.style.setProperty('--depth', (thoughts.length > 1 ? (i / (thoughts.length - 1)) * 0.45 : 0).toFixed(3));
      b.addEventListener('click', () => pick(t, list, b));
      return h('li', null, b);
    }));
    body.replaceChildren(list, button(S.thought.none, () => ctx.go('#/moment/decide'), 'btn btn-text tide-else'));
  };

  /** @param {any} t @param {HTMLElement} list @param {HTMLElement} el */
  const pick = async (t, list, el) => {
    await updateMoment(m.id, (x) => { if (!x.decide.thoughtIds.includes(t.id)) x.decide.thoughtIds.push(t.id); });
    list.classList.add('is-sinking');
    el.classList.add('is-picked');
    setWaterLevel(0.4);
    setTimeout(() => {
      heading.hidden = true;
      const counter = h('blockquote', { class: 'own-words own-words-large tide-own tide-surfacing', tabindex: '-1' }, t.counter);
      body.replaceChildren(
        h('p', { class: 'muted' }, t.thought),
        counter,
        h('div', { class: 'tide-pills tide-pills-2' },
          button(S.thought.another, showList, 'btn tide-pill'),
          button(S.thought.back, () => ctx.go('#/moment/decide'), 'btn tide-pill tide-pill-strong')));
      counter.focus();
    }, SURFACE_MS);
  };

  view.classList.add('view-tide');
  view.append(stepIndicator('decide', ctx), heading, body);
  showList();
}
