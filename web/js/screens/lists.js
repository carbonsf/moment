// @ts-check
/** §6.8 My lists: three tabs; edit, hide/show, reorder, add; built-ins hide only (E27); restore defaults. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { uuid } from '../lib/crypto.js';
import { app, getList, saveListItem, bus } from '../state.js';
import { DISTRACT_DEFAULTS, TRIGGER_DEFAULTS, THOUGHT_DEFAULTS, LIMITS } from '../content/defaults.js';

/** @typedef {'distract'|'triggers'|'thoughts'} Tab */
/** @type {Record<Tab, 'distractOptions'|'triggerTags'|'permissionThoughts'>} */
const STORE = { distract: 'distractOptions', triggers: 'triggerTags', thoughts: 'permissionThoughts' };
let lastTab = /** @type {Tab} */ ('distract');

/** @param {any} item @param {Tab} tab */
const labelOf = (item, tab) => (tab === 'thoughts' ? item.thought : item.label);

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  ctx.setBack('#/home');
  /** @type {Tab} */
  let tab = /** @type {Tab} */ (ctx.query.get('tab')) || lastTab;
  if (!STORE[tab]) tab = 'distract';
  const panel = h('div', { class: 'tab-panel', role: 'tabpanel', id: 'list-panel' });
  /** @type {HTMLElement[]} */
  const tabBtns = [];
  const tabs = h('div', { class: 'segmented', role: 'tablist', 'aria-label': S.lists.title },
    /** @type {Tab[]} */ (['distract', 'triggers', 'thoughts']).map((t) => {
      const b = h('button', {
        type: 'button', role: 'tab', class: 'segment', 'aria-controls': 'list-panel', id: `tab-${t}`,
        on: { click: () => { tab = t; lastTab = t; draw(); } },
      }, S.lists.tabs[t]);
      tabBtns.push(b);
      return b;
    }));
  // Arrow-key navigation between tabs.
  tabs.addEventListener('keydown', (e) => {
    const i = tabBtns.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (i < 0 || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
    tabBtns[n].click();
    tabBtns[n].focus();
  });

  /** Form for add/edit. @param {any|null} item @param {() => void} done */
  const form = (item, done) => {
    const isNew = !item;
    const fields = [];
    /** @type {Record<string, HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>} */
    const f = {};
    const fid = (/** @type {string} */ k) => `f-${k}-${item?.id || 'new'}`;
    /** @param {string} k @param {string} lab @param {HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement} el */
    const field = (k, lab, el) => { el.id = fid(k); f[k] = el; fields.push(h('div', { class: 'field' }, h('label', { for: el.id, class: 'field-label' }, lab), el)); };
    const select = (/** @type {[string,string][]} */ opts, /** @type {string} */ v) => {
      const s = /** @type {HTMLSelectElement} */ (h('select', { class: 'input' }, opts.map(([val, lab]) => h('option', { value: val }, lab))));
      s.value = v;
      return s;
    };
    const input = (/** @type {string} */ v, /** @type {number} */ max) => /** @type {HTMLInputElement} */ (h('input', { type: 'text', class: 'input', value: v || '', maxLength: max, autocomplete: 'off' }));
    if (tab === 'distract') {
      field('label', S.lists.labelField, input(item?.label, LIMITS.label));
      field('category', S.lists.categoryField, select(['body', 'place', 'hands', 'mind'].map((c) => [c, S.category[/** @type {'body'} */ (c)]]), item?.category || 'mind'));
      field('effort', S.lists.effortField, select([['low', S.lists.effort.low], ['medium', S.lists.effort.medium]], item?.effort || 'low'));
    } else if (tab === 'triggers') {
      field('label', S.lists.labelField, input(item?.label, LIMITS.label));
      field('group', S.lists.groupField, select([['halt', S.triggerGroup.halt], ['context', S.triggerGroup.context]], item?.group || 'context'));
    } else {
      field('thought', S.lists.thoughtField, input(item?.thought, LIMITS.thought));
      const ta = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input textarea', rows: 3, maxLength: LIMITS.thought }));
      ta.value = item?.counter || '';
      field('counter', S.lists.counterField, ta);
    }
    const el = h('form', { class: 'card list-form', on: {
      submit: async (/** @type {Event} */ e) => {
        e.preventDefault();
        const main = (tab === 'thoughts' ? f.thought : f.label).value.trim();
        if (!main) { (tab === 'thoughts' ? f.thought : f.label).focus(); return; }
        const all = await getList(STORE[tab], true);
        const base = item ? { ...item } : { id: uuid(), hidden: false, builtIn: false, order: Math.max(-1, ...all.map((x) => x.order)) + 1 };
        if (tab === 'distract') Object.assign(base, { label: main, category: f.category.value, effort: f.effort.value });
        else if (tab === 'triggers') Object.assign(base, { label: main, group: f.group.value });
        else Object.assign(base, { thought: main, counter: f.counter.value.trim() });
        await saveListItem(STORE[tab], base);
        done();
      },
    } }, fields, h('div', { class: 'row' },
      h('button', { type: 'submit', class: 'btn btn-primary' }, isNew ? S.common.add : S.common.save),
      button(S.common.cancel, done, 'btn btn-text')));
    return el;
  };

  /** Swap order with neighbor. @param {any[]} items @param {number} i @param {number} dir */
  const move = async (items, i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const norm = items.map((x, k) => ({ ...x, order: k }));
    [norm[i].order, norm[j].order] = [j, i];
    await app.db.putMany(STORE[tab], norm.filter((x, k) => x.order !== items[k].order));
    bus.emit('localChange');
    await draw(items[i].id, dir);
  };

  /** @param {string} [focusId] @param {number} [dir] */
  async function draw(focusId, dir) {
    tabBtns.forEach((b, i) => {
      const on = /** @type {Tab[]} */ (['distract', 'triggers', 'thoughts'])[i] === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-active', on);
    });
    panel.setAttribute('aria-labelledby', `tab-${tab}`);
    const items = await getList(STORE[tab], true);
    const ul = h('ul', { class: 'manage-list' });
    items.forEach((it, i) => {
      const li = h('li', { class: ['manage-row', it.hidden && 'is-hidden'], dataset: { id: it.id } });
      const text = h('div', { class: 'manage-text' },
        h('span', null, labelOf(it, tab)),
        tab === 'thoughts' && it.counter ? h('span', { class: 'own-words-small' }, it.counter) : null,
        it.hidden ? h('span', { class: 'badge' }, S.common.hidden) : null);
      const label = labelOf(it, tab);
      const ctrls = h('div', { class: 'manage-ctrls' },
        button(S.common.edit, () => { li.replaceChildren(form(it, () => draw())); /** @type {HTMLElement} */ (li.querySelector('input,textarea'))?.focus(); }, 'btn btn-text btn-small', { 'aria-label': `${S.common.edit}: ${label}` }),
        button(it.hidden ? S.common.show : S.common.hide, async () => { await saveListItem(STORE[tab], { ...it, hidden: !it.hidden }); draw(it.id); }, 'btn btn-text btn-small', { 'aria-label': `${it.hidden ? S.common.show : S.common.hide}: ${label}` }),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${S.common.moveUp}: ${label}`, disabled: i === 0, on: { click: () => move(items, i, -1) } }, icon('up')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${S.common.moveDown}: ${label}`, disabled: i === items.length - 1, on: { click: () => move(items, i, 1) } }, icon('down')),
        it.builtIn ? null : button(S.common.delete, async () => { await app.db.remove(STORE[tab], it.id); bus.emit('localChange'); draw(); }, 'btn btn-text btn-small', { 'aria-label': `${S.common.delete}: ${label}` }));
      li.append(text, ctrls);
      ul.append(li);
    });
    const addBtn = button(S.lists.addNew, () => { addBtn.replaceWith(form(null, () => draw())); /** @type {HTMLElement} */ (panel.querySelector('form input'))?.focus(); }, 'btn btn-secondary');
    const restore = button(S.lists.restore, async () => { await restoreDefaults(tab); draw(); }, 'btn btn-text');
    panel.replaceChildren(ul, addBtn, restore);
    if (focusId) {
      const row = panel.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
      const target = /** @type {HTMLElement|null} */ (row?.querySelector(dir === -1 ? '[aria-label^="' + S.common.moveUp + '"]' : dir === 1 ? '[aria-label^="' + S.common.moveDown + '"]' : 'button'));
      (target && !(/** @type {HTMLButtonElement} */ (target)).disabled ? target : /** @type {HTMLElement|null} */ (row?.querySelector('button')))?.focus();
    }
  }

  view.append(title(S.lists.title), tabs, panel);
  await draw();
}

/** Bring built-ins back with their default text and order. @param {Tab} tab */
async function restoreDefaults(tab) {
  const store = STORE[tab];
  const defs = tab === 'distract' ? DISTRACT_DEFAULTS : tab === 'triggers' ? TRIGGER_DEFAULTS : THOUGHT_DEFAULTS;
  const recs = [];
  for (let i = 0; i < defs.length; i++) {
    const cur = await app.db.get(store, defs[i].id);
    recs.push({ ...(cur || {}), ...defs[i], hidden: false, order: i, builtIn: true, deleted: false });
  }
  await app.db.putMany(store, recs);
  bus.emit('localChange');
}
