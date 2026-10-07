// @ts-check
/** Chip group: pill toggles; selection shown by border + check icon, not color alone (§13.5). */
import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * @param {{options:{value:string,label:string}[], selected?:string[], multi?:boolean, legend:string, legendHidden?:boolean, onChange:(sel:string[])=>void}} opts
 */
export function createChips(opts) {
  let sel = new Set(opts.selected || []);
  const multi = opts.multi !== false;
  const group = h('div', { class: 'chips' });
  const el = h('fieldset', { class: 'chip-group' },
    h('legend', { class: opts.legendHidden ? 'sr-only' : 'chip-legend' }, opts.legend), group);

  const render = () => {
    for (const b of group.querySelectorAll('button')) {
      const on = sel.has(/** @type {HTMLElement} */ (b).dataset.value || '');
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-selected', on);
    }
  };

  for (const o of opts.options) {
    const b = h('button', {
      type: 'button', class: 'chip', dataset: { value: o.value },
      on: {
        click: () => {
          if (sel.has(o.value)) sel.delete(o.value);
          else {
            if (!multi) sel = new Set();
            sel.add(o.value);
          }
          render();
          opts.onChange([...sel]);
        },
      },
    }, icon('check', { size: 18 }), h('span', null, o.label));
    group.append(b);
  }
  render();
  return {
    el,
    get value() { return [...sel]; },
    /** @param {string[]} v */
    set(v) { sel = new Set(v); render(); },
  };
}
