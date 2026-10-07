// @ts-check
/** §6.3.1 Start: first rating by dragging the waterline (DD-083). No default value; nothing shows until the first touch. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { updateMoment } from '../state.js';
import { enterMoment, stepIndicator } from './_shared.js';
import { setWaterScreen, enableGrab, ride } from '../ui/tide/water.js';

const COMMIT_PAUSE_MS = 900; // the number settles on the surface before the flow moves on

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, null);
  if (!m) return;
  const initial = (m.ratings || []).find((/** @type {any} */ r) => r.src === 'initial');
  setWaterScreen('start', { value: initial ? initial.v : null });

  const num = h('span', { class: 'tide-num' });
  const anc = h('span', { class: 'tide-anchor' });
  const reading = h('div', { class: 'tide-reading', 'aria-live': 'polite' }, num, anc);
  const handle = h('div', { class: 'tide-handle-row' }, h('span', { class: 'tide-handle', 'aria-hidden': 'true' }));
  const hint = h('p', { class: 'tide-hint' });
  ctx.onCleanup(ride(reading, { offset: -176, x: 0.2 }));
  ctx.onCleanup(ride(handle, { offset: -11, x: 0.83 }));

  /** @param {number|null} v */
  const show = (v) => {
    reading.classList.toggle('is-empty', v == null);
    num.textContent = v == null ? '' : String(v);
    anc.textContent = v == null ? '' : S.slider.anchor(v);
    hint.textContent = v == null ? S.tide.dragHint : S.tide.letGo;
  };

  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let next;
  ctx.onCleanup(() => clearTimeout(next));
  ctx.onCleanup(enableGrab({
    onStart: () => clearTimeout(next),
    onInput: show,
    onCommit: async (v) => {
      // One initial rating; changing it before moving on replaces it.
      await updateMoment(m.id, (x) => {
        const r = { t: Math.max(0, Date.now() - x.startedAt), v, src: 'initial' };
        const i = x.ratings.findIndex((/** @type {any} */ y) => y.src === 'initial');
        if (i >= 0) x.ratings[i] = { ...r, t: x.ratings[i].t };
        else x.ratings.push(r);
      });
      next = setTimeout(() => ctx.go('#/moment/distance'), COMMIT_PAUSE_MS);
    },
  }));

  view.classList.add('view-tide');
  view.append(
    stepIndicator('delay', ctx),
    title(S.start.title, 'screen-title tide-title'),
    reading,
    handle,
    h('div', { class: 'tide-foot' }, hint, button(S.start.skip, () => ctx.go('#/moment/distance'), 'btn btn-text')),
  );
  show(initial ? initial.v : null);
}
