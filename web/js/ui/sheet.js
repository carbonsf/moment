// @ts-check
/** Bottom sheet (§13.5): surface, dismiss by scrim or close button or Escape; focus moves in and returns. */
import { h } from './dom.js';
import { icon } from './icons.js';
import { S } from '../strings.js';

/** @type {(() => void)|null} */
let openClose = null;

/**
 * @param {{title:string, content:Node|Node[], onClose?:()=>void, label?:string}} opts
 * @returns {() => void} close function
 */
export function openSheet(opts) {
  openClose?.();
  const prevFocus = /** @type {HTMLElement|null} */ (document.activeElement);
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  const heading = h('h2', { id: titleId, class: 'sheet-title', tabindex: '-1' }, opts.title);
  const closeBtn = h('button', { type: 'button', class: 'icon-btn sheet-close', 'aria-label': S.help.close, on: { click: () => close() } }, icon('close'));
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'sheet-head' }, heading, closeBtn),
    h('div', { class: 'sheet-body' }, opts.content));
  const scrim = h('div', { class: 'sheet-scrim', on: { click: () => close() } });
  const root = h('div', { class: 'sheet-root' }, scrim, panel);

  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = /** @type {HTMLElement[]} */ ([...panel.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]).filter((x) => !x.hasAttribute('disabled'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    openClose = null;
    document.removeEventListener('keydown', onKey);
    document.getElementById('app')?.removeAttribute('aria-hidden');
    root.classList.remove('is-open');
    setTimeout(() => root.remove(), 200);
    prevFocus?.focus?.();
    opts.onClose?.();
  };

  document.body.append(root);
  document.getElementById('app')?.setAttribute('aria-hidden', 'true');
  document.addEventListener('keydown', onKey);
  void root.offsetWidth; // commit closed state so the open transition runs
  root.classList.add('is-open');
  heading.focus();
  openClose = close;
  return close;
}

/** Close any open sheet (e.g. on navigation). */
export function closeSheet() {
  openClose?.();
}
