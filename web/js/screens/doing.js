// @ts-check
/**
 * §6.3.5 Doing on the tide (DD-083). The water drains low and nearly still. "I'm back" rides the waterline:
 * pulling the water up is the return rating (replaces the slider + save button of DD-054); tapping it returns without one.
 */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { app, updateMoment } from '../state.js';
import { mmss } from '../lib/time.js';
import { enterMoment, stepIndicator } from './_shared.js';
import { setWaterScreen, enableGrab, ride } from '../ui/tide/water.js';

const RETURN_PAUSE_MS = 700;

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'distract');
  if (!m) return;
  setWaterScreen('doing');
  const optionId = ctx.params.optionId;
  const option = await app.db.get('distractOptions', optionId);
  const useIdx = (() => {
    for (let i = m.distractUses.length - 1; i >= 0; i--) if (m.distractUses[i].optionId === optionId && m.distractUses[i].returnedAt == null) return i;
    return -1;
  })();
  const use = useIdx >= 0 ? m.distractUses[useIdx] : null;
  const since = use ? use.startedAt : Date.now();

  const elapsedNum = h('span', { class: 'tide-elapsed-num' });
  const elapsedEl = h('p', { class: 'tide-elapsed' }, elapsedNum, ' ', h('span', null, S.tide.soFar));
  const tick = () => { elapsedNum.textContent = mmss(Date.now() - since); };
  const iv = setInterval(tick, 1000);
  ctx.onCleanup(() => clearInterval(iv));
  tick();

  let done = false;
  /** @param {number|null} v */
  const finish = async (v) => {
    if (done) return;
    done = true;
    await updateMoment(m.id, (x) => {
      const now = Date.now();
      if (v != null) x.ratings.push({ t: now - x.startedAt, v, src: 'return' });
      const u = useIdx >= 0 ? x.distractUses[useIdx] : null;
      if (u) { u.returnedAt = now; u.ratingAfter = v; }
    });
    setTimeout(() => ctx.go('#/moment/surf'), v != null ? RETURN_PAUSE_MS : 0);
  };

  const backBtn = button(S.doing.back, () => finish(null), 'btn tide-back');
  const backRow = h('div', { class: 'tide-back-row' }, backBtn, h('span', { class: 'tide-handle', 'aria-hidden': 'true' }));
  const pullHint = h('p', { class: 'tide-pull-hint' }, S.tide.pullUp);
  ctx.onCleanup(ride(backRow, { offset: -52 }));
  ctx.onCleanup(ride(pullHint, { offset: 40 }));
  ctx.onCleanup(enableGrab({
    onInput: (v) => { backBtn.textContent = `${v} · ${S.slider.anchor(v)}`; },
    onCommit: (v) => finish(v),
  }));

  view.classList.add('view-tide', 'view-doing');
  view.append(
    stepIndicator('distract', ctx),
    title(option ? option.label : S.steps.distract, 'doing-label tide-doing-title'),
    h('p', { class: 'lead tide-doing-go' }, S.doing.go),
    elapsedEl,
    backRow,
    pullHint,
    h('div', { class: 'tide-foot' }, button(S.doing.other, async () => {
      // Leaving for another option ends this use without an after-rating.
      await updateMoment(m.id, (x) => { const u = useIdx >= 0 ? x.distractUses[useIdx] : null; if (u) u.returnedAt = Date.now(); });
      ctx.go('#/moment/distract');
    }, 'btn btn-text')),
  );
}
