// @ts-check
/** §6.3.2 Distance (Delay; stimulus control). DD-009 */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { updateMoment } from '../state.js';
import { enterMoment, stepIndicator } from './_shared.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'distance');
  if (!m) return;
  /** @param {'done'|'skipped'} v */
  const pick = async (v) => {
    await updateMoment(m.id, (x) => { x.distance = v; });
    ctx.go('#/moment/surf');
  };
  view.append(
    stepIndicator('delay', ctx),
    title(S.distance.title),
    h('p', { class: 'lead' }, S.distance.body),
    h('div', { class: 'actions' },
      button(S.distance.done, () => pick('done')),
      button(S.distance.notNow, () => pick('skipped'), 'btn btn-secondary')),
  );
}
