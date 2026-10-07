// @ts-check
/** §6.7 Moment detail: curve, steps, distract uses, triggers, body; editable outcome (E10); delete. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { figure, momentCurve } from '../ui/chart.js';
import { bus, getMoment, updateMoment, deleteMoment, getList } from '../state.js';
import { metricsOf } from '../lib/metrics.js';
import { dateTime, durationText, clockTime } from './_shared.js';

const OUTCOMES = ['passed', 'quieter', 'strong', 'used', 'stopped', 'private'];

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  ctx.setBack('#/lookback');
  let m = await getMoment(ctx.params.momentId);
  if (!m) { view.append(title(S.detail.missing)); return; }
  const tags = await getList('triggerTags', true);
  const opts = await getList('distractOptions', true);
  const dur = (m.endedAt || m.lastInteractionAt || m.startedAt) - m.startedAt;
  const met = metricsOf(m);
  const r = [...m.ratings].sort((a, b) => a.t - b.t);

  view.append(title(dateTime(m.startedAt)), h('p', { class: 'muted' }, durationText(dur)));

  if (r.length) {
    const cap = S.surf.waveSummary(r.length, r[0].v, r[r.length - 1].v, /** @type {number} */ (met.peak));
    view.append(figure(S.detail.curve, momentCurve(r, dur), cap));
  }

  /** @param {string} t @param {(Node|string)[]} items */
  const section = (t, items) => (items.length ? h('section', { class: 'card lb-section' }, h('h2', { class: 'section-title' }, t), h('ul', { class: 'plain-list' }, items.map((x) => h('li', null, x)))) : null);

  view.append(...[
    section(S.detail.steps, (m.steps || []).map((/** @type {any} */ s) => `${S.detail.step[/** @type {keyof typeof S.detail.step} */ (s.step)] || s.step} · ${clockTime(s.at)}`)),
    section(S.detail.distract, (m.distractUses || []).map((/** @type {any} */ u) => {
      const label = opts.find((o) => o.id === u.optionId)?.label || '';
      const ch = S.detail.change(u.ratingBefore, u.ratingAfter);
      return ch ? `${label} · ${ch}` : label;
    })),
    section(S.detail.triggers, (m.triggerTagIds || []).map((/** @type {string} */ id) => tags.find((t) => t.id === id)?.label || '').filter(Boolean)),
    section(S.detail.body, (m.bodyLocations || []).map((/** @type {string} */ b) => S.body[/** @type {keyof typeof S.body} */ (b)] || b)),
  ].filter((x) => x != null));

  // How it ended: editable with the same options as §6.4; metrics recompute on edit (E10).
  const sel = /** @type {HTMLSelectElement} */ (h('select', { id: 'outcome', class: 'input' },
    h('option', { value: '' }, S.detail.notSet),
    OUTCOMES.map((o) => h('option', { value: o }, S.close[/** @type {'passed'} */ (o)]))));
  sel.value = m.outcome || '';
  sel.addEventListener('change', async () => {
    m = (await updateMoment(m.id, (x) => { x.outcome = sel.value || null; }, { touch: false })) || m;
    bus.emit('localChange');
  });
  view.append(h('section', { class: 'card lb-section' },
    h('label', { for: 'outcome', class: 'section-title' }, S.detail.ended), sel));

  const confirmBox = h('div', { class: 'card notice-card', hidden: true },
    h('p', null, S.detail.deleteConfirm),
    h('div', { class: 'row' },
      button(S.detail.deleteYes, async () => { await deleteMoment(m.id); ctx.go('#/lookback'); }, 'btn btn-secondary-solid'),
      button(S.common.cancel, () => { confirmBox.hidden = true; delBtn.hidden = false; }, 'btn btn-text')));
  const delBtn = button(S.detail.deleteBtn, () => { confirmBox.hidden = false; delBtn.hidden = true; }, 'btn btn-text');
  view.append(delBtn, confirmBox);
}
