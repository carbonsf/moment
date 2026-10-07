// @ts-check
/** §6.9 Setup items: reasons, message, thoughts, plans. Offered only in calm windows (DD-031). */
import { S } from '../strings.js';
import { h, title, button, flash } from '../ui/dom.js';
import { uuid } from '../lib/crypto.js';
import { app, saveProfile, getList, saveListItem } from '../state.js';
import { LIMITS } from '../content/defaults.js';
import { validPlans, planThen } from './_shared.js';

export const ITEMS = ['reasons', 'message', 'thoughts', 'plans'];

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const item = ITEMS.includes(ctx.params.item) ? ctx.params.item : 'reasons';
  const from = ctx.query.get('from') === 'settings' ? '#/settings' : '#/home';
  ctx.setBack(from);
  const idx = ITEMS.indexOf(item);
  const status = h('div', { class: 'status-slot', role: 'status' });
  const nav = h('div', { class: 'actions' },
    idx < ITEMS.length - 1
      ? button(S.setup.nextItem, () => ctx.go(`#/setup/${ITEMS[idx + 1]}${from === '#/settings' ? '?from=settings' : ''}`))
      : button(S.setup.finish, () => ctx.go(from)),
    idx < ITEMS.length - 1 ? button(S.setup.finish, () => ctx.go(from), 'btn btn-text') : null);
  const body = h('div', { class: 'setup-body' });
  view.append(h('p', { class: 'muted small' }, S.setup.items[/** @type {'reasons'} */ (item)]), body, status, nav);

  /** @param {Partial<typeof app.profile>} patch */
  const save = async (patch) => { await saveProfile(patch); flash(status, S.setup.saved); };

  if (item === 'reasons') {
    body.append(title(S.setup.reasons.title));
    let reasons = [...(app.profile.reasons || [])];
    const list = h('ol', { class: 'reason-list' });
    /** @type {ReturnType<typeof setTimeout>|null} */
    let t = null;
    const persist = () => { if (t) clearTimeout(t); t = setTimeout(() => save({ reasons: reasons.map((r) => r.trim()).filter(Boolean) }), 600); };
    ctx.onCleanup(() => { if (t) { clearTimeout(t); saveProfile({ reasons: reasons.map((r) => r.trim()).filter(Boolean) }); } });
    const draw = (/** @type {number} */ focusIdx = -1) => {
      list.replaceChildren();
      if (!reasons.length) reasons = [''];
      reasons.forEach((r, i) => {
        const inp = /** @type {HTMLInputElement} */ (h('input', {
          type: 'text', class: 'input own-input', value: r, maxLength: LIMITS.reasonChars, id: `reason-${i}`,
          placeholder: i === 0 ? S.setup.reasons.placeholder : '', 'aria-label': `${S.setup.items.reasons} ${i + 1}`,
          on: { input: (/** @type {Event} */ e) => { reasons[i] = /** @type {HTMLInputElement} */ (e.target).value; persist(); } },
        }));
        list.append(h('li', { class: 'reason-row' }, inp,
          reasons.length > 1 || r ? button(S.common.delete, () => { reasons.splice(i, 1); persist(); draw(); }, 'btn btn-text btn-small', { 'aria-label': `${S.common.delete} ${i + 1}` }) : null));
        if (i === focusIdx) setTimeout(() => inp.focus(), 0);
      });
      addBtn.hidden = reasons.length >= LIMITS.reasons;
      maxNote.hidden = reasons.length < LIMITS.reasons;
    };
    const addBtn = button(S.setup.reasons.add, () => { reasons.push(''); draw(reasons.length - 1); }, 'btn btn-secondary');
    const maxNote = h('p', { class: 'muted small' }, S.setup.reasons.max(LIMITS.reasons));
    body.append(list, addBtn, maxNote);
    draw();
  }

  if (item === 'message') {
    body.append(title(S.setup.message.title));
    const ta = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input textarea own-input', rows: 6, maxLength: LIMITS.message, id: 'msg', placeholder: S.setup.message.placeholder, 'aria-label': S.setup.items.message }));
    ta.value = app.profile.messageToSelf || '';
    const left = h('p', { class: 'muted small', 'aria-live': 'polite' });
    const upd = () => { left.textContent = S.common.charsLeft(LIMITS.message - ta.value.length); };
    /** @type {ReturnType<typeof setTimeout>|null} */
    let t = null;
    ta.addEventListener('input', () => { upd(); if (t) clearTimeout(t); t = setTimeout(() => save({ messageToSelf: ta.value.trim() }), 600); });
    ctx.onCleanup(() => { if (t) { clearTimeout(t); saveProfile({ messageToSelf: ta.value.trim() }); } });
    upd();
    body.append(ta, left);
  }

  if (item === 'thoughts') {
    body.append(title(S.setup.thoughts.title));
    const thoughts = await getList('permissionThoughts');
    body.append(h('ul', { class: 'thought-edit-list' }, thoughts.map((th) => {
      const ta = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input textarea own-input', rows: 2, maxLength: LIMITS.thought, id: `c-${th.id}` }));
      ta.value = th.counter || '';
      /** @type {ReturnType<typeof setTimeout>|null} */
      let t = null;
      const commit = async () => { const cur = await app.db.get('permissionThoughts', th.id); await saveListItem('permissionThoughts', { ...cur, counter: ta.value.trim() }); flash(status, S.setup.saved); };
      ta.addEventListener('input', () => { if (t) clearTimeout(t); t = setTimeout(commit, 700); });
      ctx.onCleanup(() => { if (t) { clearTimeout(t); commit(); } });
      return h('li', { class: 'field' }, h('label', { for: ta.id, class: 'field-label' }, th.thought), ta);
    })));
    body.append(button(S.setup.thoughts.reviewed, async () => {
      await saveProfile({ thoughtsReviewed: true });
      ctx.go(`#/setup/plans${from === '#/settings' ? '?from=settings' : ''}`);
    }, 'btn btn-secondary'));
  }

  if (item === 'plans') {
    body.append(title(S.setup.plans.title));
    const triggers = await getList('triggerTags');
    const options = await getList('distractOptions');
    const list = h('ul', { class: 'own-list' });
    const drawList = () => {
      list.replaceChildren();
      for (const p of validPlans(triggers)) {
        const trig = triggers.find((t) => t.id === p.triggerTagId);
        const then = planThen(p, options);
        list.append(h('li', { class: 'plan-row' },
          h('div', { class: 'own-words' }, p.valid && trig ? S.decide.planLine(trig.label, then) : S.decide.planNoTrigger(then)),
          p.valid ? null : h('p', { class: 'notice small' }, S.setup.plans.needsReview),
          button(S.common.delete, async () => {
            await save({ ifThenPlans: (app.profile.ifThenPlans || []).filter((x) => x.id !== p.id) });
            drawList();
          }, 'btn btn-text btn-small')));
      }
      formWrap.hidden = (app.profile.ifThenPlans || []).length >= LIMITS.plans;
      maxNote.hidden = !formWrap.hidden;
    };
    const trigSel = /** @type {HTMLSelectElement} */ (h('select', { class: 'input', id: 'plan-trigger' },
      h('option', { value: '' }, S.setup.plans.pickTrigger), triggers.map((t) => h('option', { value: t.id }, t.label))));
    const optSel = /** @type {HTMLSelectElement} */ (h('select', { class: 'input', id: 'plan-option' },
      h('option', { value: '' }, S.setup.plans.pickOption), options.map((o) => h('option', { value: o.id }, o.label))));
    const thenInp = /** @type {HTMLInputElement} */ (h('input', { type: 'text', class: 'input own-input', id: 'plan-then', maxLength: LIMITS.reasonChars }));
    const formWrap = h('form', { class: 'card list-form', on: {
      submit: async (/** @type {Event} */ e) => {
        e.preventDefault();
        if (!trigSel.value) { trigSel.focus(); return; }
        const thenText = thenInp.value.trim();
        if (!thenText && !optSel.value) { optSel.focus(); return; }
        const plan = { id: uuid(), triggerTagId: trigSel.value, thenText, ...(optSel.value && !thenText ? { distractOptionId: optSel.value } : {}) };
        await save({ ifThenPlans: [...(app.profile.ifThenPlans || []), plan] });
        trigSel.value = ''; optSel.value = ''; thenInp.value = '';
        drawList();
      },
    } },
    h('div', { class: 'field' }, h('label', { for: 'plan-trigger', class: 'field-label' }, S.setup.plans.trigger), trigSel),
    h('div', { class: 'field' }, h('label', { for: 'plan-option', class: 'field-label' }, S.setup.plans.thenOption), optSel),
    h('div', { class: 'field' }, h('label', { for: 'plan-then', class: 'field-label' }, S.setup.plans.orWrite), thenInp),
    h('button', { type: 'submit', class: 'btn btn-primary' }, S.setup.plans.add));
    const maxNote = h('p', { class: 'muted small' }, S.setup.plans.max(LIMITS.plans));
    body.append(list, formWrap, maxNote);
    drawList();
  }
}
