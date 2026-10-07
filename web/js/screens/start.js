// @ts-check
/** §6.3.1 Start: first rating, no default value. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { createSlider } from '../ui/slider.js';
import { updateMoment } from '../state.js';
import { enterMoment, stepIndicator } from './_shared.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, null);
  if (!m) return;
  const initial = (m.ratings || []).find((/** @type {any} */ r) => r.src === 'initial');
  const slider = createSlider({
    value: initial ? initial.v : null,
    onCommit: (v) => updateMoment(m.id, (x) => {
      // One initial rating; changing it before moving on replaces it.
      const r = { t: Math.max(0, Date.now() - x.startedAt), v, src: 'initial' };
      const i = x.ratings.findIndex((/** @type {any} */ y) => y.src === 'initial');
      if (i >= 0) x.ratings[i] = { ...r, t: x.ratings[i].t };
      else x.ratings.push(r);
    }),
  });
  ctx.onCleanup(() => slider.destroy());
  view.append(
    stepIndicator('delay', ctx),
    title(S.start.title),
    slider.el,
    h('div', { class: 'actions' },
      button(S.start.next, () => ctx.go('#/moment/distance')),
      button(S.start.skip, () => ctx.go('#/moment/distance'), 'btn btn-text')),
  );
}
