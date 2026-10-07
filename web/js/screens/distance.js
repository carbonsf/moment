// @ts-check
/** §6.3.2 Distance (Delay; stimulus control). DD-009. Water sits at the current rating and breathes (DD-083). */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { updateMoment, latestRating } from '../state.js';
import { enterMoment, stepIndicator } from './_shared.js';
import { setWaterScreen } from '../ui/tide/water.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'distance');
  if (!m) return;
  setWaterScreen('distance', { value: latestRating(m) });
  /** @param {'done'|'skipped'} v */
  const pick = async (v) => {
    await updateMoment(m.id, (x) => { x.distance = v; });
    ctx.go('#/moment/surf');
  };
  view.classList.add('view-tide');
  view.append(
    stepIndicator('delay', ctx),
    title(S.distance.title, 'screen-title tide-title'),
    h('p', { class: 'lead tide-lead' }, S.distance.body),
    h('div', { class: 'tide-pills tide-pills-2' },
      button(S.distance.done, () => pick('done'), 'btn tide-pill tide-pill-strong'),
      button(S.distance.notNow, () => pick('skipped'), 'btn tide-pill')),
  );
}
