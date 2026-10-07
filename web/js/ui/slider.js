// @ts-check
/**
 * 0–10 intensity slider (§13.6, DD-029). Native range input, restyled.
 * Tap anywhere on the track sets the value (iOS doesn't move the thumb on track taps natively).
 * Can start empty: thumb hidden until the first tap.
 * DD-051: a rating commits 700 ms after the last change (or on pointer up) so dragging records one value.
 */
import { h } from './dom.js';
import { S } from '../strings.js';
import { tick } from '../services/feedback.js';

export const COMMIT_DELAY_MS = 700;

/**
 * @param {{value?:number|null, compact?:boolean, label?:string, onCommit:(v:number)=>void, onInput?:(v:number)=>void}} opts
 */
export function createSlider(opts) {
  let value = opts.value ?? null;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let commitT = null;
  let dragging = false;

  const num = h('div', { class: 'slider-value', 'aria-hidden': 'true' });
  const anchor = h('div', { class: 'slider-anchor', 'aria-hidden': 'true' });
  const input = /** @type {HTMLInputElement} */ (h('input', {
    type: 'range', min: '0', max: '10', step: '1', class: 'slider-input',
    'aria-label': opts.label || S.slider.label,
  }));
  const ticks = h('div', { class: 'slider-ticks', 'aria-hidden': 'true' }, h('span', null, S.slider.min), h('span', null, S.slider.max));
  const el = h('div', { class: ['slider', opts.compact && 'slider-compact'] },
    h('div', { class: 'slider-readout' }, num, anchor), input, ticks);

  const render = () => {
    el.classList.toggle('is-empty', value == null);
    if (value == null) {
      num.textContent = '–';
      anchor.textContent = S.slider.noValue;
      input.value = '5';
      input.setAttribute('aria-valuetext', S.slider.noValue);
    } else {
      num.textContent = String(value);
      anchor.textContent = S.slider.anchor(value);
      input.value = String(value);
      input.setAttribute('aria-valuetext', S.slider.valueText(value));
    }
    // Track fill position via a custom property (CSSOM, CSP-safe).
    el.style.setProperty('--fill', `${((value ?? 0) / 10) * 100}%`);
  };

  /** @param {number} v @param {boolean} immediate */
  const set = (v, immediate) => {
    v = Math.max(0, Math.min(10, Math.round(v)));
    const changed = v !== value;
    value = v;
    render();
    if (changed) { tick(); opts.onInput?.(v); }
    if (commitT) clearTimeout(commitT);
    commitT = setTimeout(() => { commitT = null; opts.onCommit(/** @type {number} */ (value)); }, immediate ? 0 : COMMIT_DELAY_MS);
  };

  /** @param {PointerEvent} e */
  const fromPointer = (e) => {
    const r = input.getBoundingClientRect();
    const thumb = 44; // matches CSS thumb size; value range spans the thumb travel
    const x = Math.min(Math.max(e.clientX - r.left - thumb / 2, 0), r.width - thumb);
    return (x / Math.max(1, r.width - thumb)) * 10;
  };

  input.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    input.setPointerCapture?.(e.pointerId);
    input.focus({ preventScroll: true });
    set(fromPointer(e), false);
  });
  input.addEventListener('pointermove', (e) => { if (dragging) set(fromPointer(e), false); });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (commitT && value != null) { clearTimeout(commitT); commitT = null; opts.onCommit(value); }
  };
  input.addEventListener('pointerup', end);
  input.addEventListener('pointercancel', end);
  // Keyboard and assistive tech (VoiceOver swipe up/down) go through native input events.
  input.addEventListener('input', () => { if (!dragging) set(Number(input.value), false); });

  render();
  return {
    el,
    input,
    getValue: () => value,
    /** @param {number|null} v */
    setValue(v) { value = v; render(); },
    /** Soft glow for the rating prompt (never modal). @param {boolean} on */
    glow(on) { el.classList.toggle('is-prompting', on); },
    focus() { input.focus(); },
    destroy() { if (commitT) clearTimeout(commitT); },
  };
}
