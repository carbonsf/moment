// @ts-check
/**
 * §6.3.4 Distract on the tide (DD-083). The glass fills; options hang at depths that follow their order and effort
 * (low effort near the surface). Picking one lifts it toward the surface while the others sink, then Doing.
 */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { uuid } from '../lib/crypto.js';
import { getList, saveListItem, updateMoment, latestRating } from '../state.js';
import { LIMITS } from '../content/defaults.js';
import { enterMoment, stepIndicator } from './_shared.js';
import { setWaterScreen } from '../ui/tide/water.js';

const LIFT_MS = 850;

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'distract');
  if (!m) return;
  setWaterScreen('distract');
  let low = ctx.query.get('low') === '1';
  let options = await getList('distractOptions');
  const list = h('ul', { class: 'tide-options' });
  let picking = false;

  /** @param {any} o @param {HTMLElement} [el] */
  const choose = async (o, el) => {
    if (picking) return;
    picking = true;
    await updateMoment(m.id, (x) => {
      x.distractUses.push({ optionId: o.id, startedAt: Date.now(), returnedAt: null, ratingBefore: latestRating(x), ratingAfter: null });
    });
    if (el && document.documentElement.dataset.motion !== 'reduce') {
      list.classList.add('is-picking');
      el.classList.add('is-rising');
      setTimeout(() => ctx.go(`#/moment/doing/${encodeURIComponent(o.id)}`), LIFT_MS);
    } else {
      ctx.go(`#/moment/doing/${encodeURIComponent(o.id)}`);
    }
  };

  const renderList = () => {
    list.replaceChildren();
    // Depth follows effort: low first, medium deeper (order kept within each).
    const shown = options.filter((o) => !low || o.effort === 'low').sort((a, b) => (a.effort === b.effort ? 0 : a.effort === 'low' ? -1 : 1));
    if (!shown.length) list.append(h('li', { class: 'muted' }, S.distract.empty));
    shown.forEach((o, i) => {
      const depth = shown.length > 1 ? i / (shown.length - 1) : 0;
      const b = h('button', { type: 'button', class: 'tide-option' }, o.label);
      b.style.setProperty('--depth', depth.toFixed(3));
      b.addEventListener('click', () => choose(o, b));
      const li = h('li', null, b);
      if (o.effort !== 'low' && (i === 0 || shown[i - 1].effort === 'low')) list.append(h('li', { class: 'tide-depth-label', 'aria-hidden': 'true' }, S.tide.deeper));
      list.append(li);
    });
  };

  const toggle = h('button', {
    type: 'button', class: 'toggle tide-toggle', role: 'switch', 'aria-checked': String(low),
    on: { click: () => { low = !low; toggle.setAttribute('aria-checked', String(low)); renderList(); } },
  }, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }, h('span', { class: 'toggle-thumb' })), h('span', null, S.distract.lowEnergy));

  // "Something else": inline add, saved to the list, then picked. DD-059
  const input = /** @type {HTMLInputElement} */ (h('input', { type: 'text', class: 'input', maxLength: LIMITS.label, id: 'add-option', autocomplete: 'off' }));
  const addForm = h('form', { class: 'inline-add tide-card', hidden: true, on: {
    submit: async (/** @type {Event} */ e) => {
      e.preventDefault();
      const label = input.value.trim();
      if (!label) return;
      const all = await getList('distractOptions', true);
      const o = await saveListItem('distractOptions', {
        id: uuid(), label, category: 'mind', effort: 'low', hidden: false,
        order: Math.max(-1, ...all.map((x) => x.order)) + 1, builtIn: false,
      });
      options = await getList('distractOptions');
      choose(o);
    },
  } },
  h('label', { for: 'add-option', class: 'field-label' }, S.distract.addLabel), input,
  h('button', { type: 'submit', class: 'btn tide-pill tide-pill-strong' }, S.distract.addSave));
  const elseBtn = button(S.distract.somethingElse, () => {
    addForm.hidden = false;
    elseBtn.hidden = true;
    input.focus();
  }, 'btn btn-text tide-else');

  view.classList.add('view-tide', 'view-distract');
  view.append(
    stepIndicator('distract', ctx),
    title(S.distract.title, 'screen-title tide-title tide-title-sm'),
    list,
    addForm,
    h('div', { class: 'tide-foot tide-foot-row' }, toggle, elseBtn),
  );
  renderList();
}
