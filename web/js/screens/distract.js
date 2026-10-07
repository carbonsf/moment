// @ts-check
/** §6.3.4 Distract list with low-energy filter and inline add. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { uuid } from '../lib/crypto.js';
import { getList, saveListItem, updateMoment, latestRating } from '../state.js';
import { LIMITS } from '../content/defaults.js';
import { enterMoment, stepIndicator, categoryIcon } from './_shared.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'distract');
  if (!m) return;
  let low = ctx.query.get('low') === '1';
  let options = await getList('distractOptions');
  const list = h('ul', { class: 'option-list' });

  /** @param {any} o */
  const choose = async (o) => {
    await updateMoment(m.id, (x) => {
      x.distractUses.push({ optionId: o.id, startedAt: Date.now(), returnedAt: null, ratingBefore: latestRating(x), ratingAfter: null });
    });
    ctx.go(`#/moment/doing/${encodeURIComponent(o.id)}`);
  };

  const renderList = () => {
    list.replaceChildren();
    const shown = options.filter((o) => !low || o.effort === 'low');
    if (!shown.length) list.append(h('li', { class: 'muted' }, S.distract.empty));
    for (const o of shown) {
      list.append(h('li', null, h('button', { type: 'button', class: 'option-card', on: { click: () => choose(o) } },
        h('span', { class: 'option-icon' }, icon(categoryIcon(o.category), { label: S.category[/** @type {keyof typeof S.category} */ (o.category)] })),
        h('span', { class: 'option-label' }, o.label))));
    }
  };

  const toggle = h('button', {
    type: 'button', class: 'toggle', role: 'switch', 'aria-checked': String(low),
    on: {
      click: () => {
        low = !low;
        toggle.setAttribute('aria-checked', String(low));
        renderList();
      },
    },
  }, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }, h('span', { class: 'toggle-thumb' })), h('span', null, S.distract.lowEnergy));

  // "Something else": inline add, saved to the list, then picked. DD-059: defaults to mind/low energy.
  const input = /** @type {HTMLInputElement} */ (h('input', { type: 'text', class: 'input', maxLength: LIMITS.label, id: 'add-option', autocomplete: 'off' }));
  const addForm = h('form', { class: 'inline-add', hidden: true, on: {
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
  h('button', { type: 'submit', class: 'btn btn-primary' }, S.distract.addSave));
  const elseBtn = button(S.distract.somethingElse, () => {
    addForm.hidden = false;
    elseBtn.hidden = true;
    input.focus();
  }, 'btn btn-secondary');

  view.append(stepIndicator('distract', ctx), title(S.distract.title), toggle, list, elseBtn, addForm);
  renderList();
}
