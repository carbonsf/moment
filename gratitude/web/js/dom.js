// @ts-check
/** DOM helper (from Moment). Text always goes through textContent: what you write is never parsed as HTML. */

/**
 * props: class, text, on:{event:fn}, plus any property/attribute.
 * @param {string} tag @param {Record<string, any>|null} [props] @param {...any} children
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
      else if (k.startsWith('aria-') || k === 'role' || k === 'tabindex') el.setAttribute(k, v === true ? 'true' : String(v));
      else if (k in el) /** @type {any} */ (el)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** @param {Element} el */
export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

/** Grow a textarea to fit what's in it. @param {HTMLTextAreaElement} el */
export function autosize(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

/**
 * Bottom sheet (from Moment): dismiss by scrim or Escape; focus moves in and returns.
 * @param {{title:string, content:Node[]}} opts @returns {() => void} close
 */
export function openSheet(opts) {
  const prevFocus = /** @type {HTMLElement|null} */ (document.activeElement);
  const heading = h('h2', { class: 'sheet-title', id: 'sheet-title', tabindex: '-1' }, opts.title);
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' }, heading, opts.content);
  const scrim = h('div', { class: 'sheet-scrim', on: { click: () => close() } });
  const root = h('div', { class: 'sheet-root' }, scrim, panel);
  const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    document.getElementById('app')?.removeAttribute('aria-hidden');
    root.classList.remove('is-open');
    setTimeout(() => root.remove(), 200);
    prevFocus?.focus?.({ preventScroll: true });
  };
  document.body.append(root);
  document.getElementById('app')?.setAttribute('aria-hidden', 'true');
  document.addEventListener('keydown', onKey);
  void root.offsetWidth; // commit the closed state so the open transition runs
  root.classList.add('is-open');
  heading.focus();
  return close;
}
