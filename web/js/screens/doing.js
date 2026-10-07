// @ts-check
/** §6.3.5 Doing: option label large, ambient wave (no plot), elapsed time, "I'm back" → rating. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { createWave } from '../ui/wave.js';
import { createSlider } from '../ui/slider.js';
import { app, updateMoment } from '../state.js';
import { mmss } from '../lib/time.js';
import { enterMoment, stepIndicator } from './_shared.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'distract');
  if (!m) return;
  const optionId = ctx.params.optionId;
  const option = await app.db.get('distractOptions', optionId);
  const useIdx = (() => {
    for (let i = m.distractUses.length - 1; i >= 0; i--) if (m.distractUses[i].optionId === optionId && m.distractUses[i].returnedAt == null) return i;
    return -1;
  })();
  const use = useIdx >= 0 ? m.distractUses[useIdx] : null;
  const since = use ? use.startedAt : Date.now();

  const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'wave-canvas wave-ambient', 'aria-hidden': 'true' }));
  const wave = createWave({ canvas, plot: false, getState: () => ({ startedAt: m.startedAt, ratings: [], delayTargetMs: 0 }) });
  ctx.onCleanup(() => wave.destroy());

  const elapsedEl = h('p', { class: 'muted elapsed' });
  const tick = () => { elapsedEl.textContent = S.doing.elapsed(mmss(Date.now() - since)); };
  const iv = setInterval(tick, 1000);
  ctx.onCleanup(() => clearInterval(iv));
  tick();

  /** @param {number|null} v */
  const finish = async (v) => {
    await updateMoment(m.id, (x) => {
      const now = Date.now();
      if (v != null) x.ratings.push({ t: now - x.startedAt, v, src: 'return' });
      const u = useIdx >= 0 ? x.distractUses[useIdx] : null;
      if (u) { u.returnedAt = now; u.ratingAfter = v; }
    });
    ctx.go('#/moment/surf');
  };

  const back = h('div', { class: 'stack' });
  // DD-054: return rating is saved with an explicit button; skipping still records the return time.
  const showRate = () => {
    back.replaceChildren();
    let val = /** @type {number|null} */ (null);
    const slider = createSlider({ value: null, label: S.doing.ratePrompt, onCommit: (v) => { val = v; } });
    ctx.onCleanup(() => slider.destroy());
    back.append(
      h('h2', { class: 'section-title', tabindex: '-1' }, S.doing.ratePrompt),
      slider.el,
      button(S.doing.saveRating, () => finish(slider.getValue() ?? val)),
      button(S.doing.skipRating, () => finish(null), 'btn btn-text'));
    /** @type {HTMLElement} */ (back.querySelector('h2'))?.focus();
  };
  back.append(
    button(S.doing.back, showRate),
    button(S.doing.other, async () => {
      // Leaving for another option ends this use without an after-rating.
      await updateMoment(m.id, (x) => { const u = useIdx >= 0 ? x.distractUses[useIdx] : null; if (u) u.returnedAt = Date.now(); });
      ctx.go('#/moment/distract');
    }, 'btn btn-text'));

  view.append(
    stepIndicator('distract', ctx),
    title(option ? option.label : S.steps.distract, 'doing-label'),
    h('div', { class: 'wave-wrap wave-wrap-ambient' }, canvas),
    h('p', { class: 'lead' }, S.doing.go),
    elapsedEl,
    back,
  );
}
