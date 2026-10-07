// @ts-check
/** DOM helpers. Text always goes through textContent (user content is never parsed as HTML). */

/**
 * Create an element.
 * props: class, text, html (app-authored only), on:{event:fn}, dataset:{}, attrs:{}, plus any property/attribute.
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
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'attrs') for (const [a, av] of Object.entries(v)) { if (av != null && av !== false) el.setAttribute(a, av === true ? '' : String(av)); }
      else if (k.startsWith('aria-') || k === 'role' || k === 'for' || k === 'tabindex') el.setAttribute(k, v === true ? 'true' : String(v));
      else if (k in el) /** @type {any} */ (el)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

/** @param {Element} el @param {any[]} children */
export function append(el, children) {
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

/** Screen heading that receives focus after navigation (VoiceOver). @param {string} text @param {string} [cls] */
export function title(text, cls = 'screen-title') {
  return h('h1', { class: cls, tabindex: '-1', text });
}

/** @param {string} label @param {()=>void} onClick @param {string} [cls] @param {Record<string, any>} [extra] */
export function button(label, onClick, cls = 'btn btn-primary', extra = {}) {
  return h('button', { type: 'button', class: cls, on: { click: onClick }, ...extra }, label);
}

/** @param {string} label @param {string} href @param {string} [cls] */
export function link(label, href, cls = 'link') {
  return h('a', { href, class: cls }, label);
}

/** Visually hidden polite live region. */
export function liveRegion() {
  return h('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
}

/** Read a CSS custom property from :root. @param {string} name */
export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Parse a CSS time token ("320ms" / "1.5s") to ms. @param {string} name */
export function cssMs(name) {
  const v = cssVar(name);
  if (v.endsWith('ms')) return parseFloat(v);
  if (v.endsWith('s')) return parseFloat(v) * 1000;
  return parseFloat(v) || 0;
}

/** Whether motion should be reduced (setting overrides system). DD-027 */
export function reducedMotion() {
  return document.documentElement.dataset.motion === 'reduce';
}

/** Short-lived notice for confirmations ("Saved."). @param {HTMLElement} host @param {string} text */
export function flash(host, text) {
  const n = h('p', { class: 'notice-inline', role: 'status' }, text);
  host.append(n);
  setTimeout(() => n.remove(), 2500);
}
