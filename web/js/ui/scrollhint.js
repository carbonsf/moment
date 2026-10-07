// @ts-check
/**
 * Scroll affordance: a bottom fade + chevron shown only while more page content sits below the fold. DD-079
 * Purely presentational and token-styled (.scroll-hint in components.css) so a later design layer can restyle or replace it.
 */
import { h, reducedMotion } from './dom.js';
import { icon } from './icons.js';
import { S } from '../strings.js';

/** Pixels of remaining content below the fold before the hint shows. */
const THRESHOLD_PX = 24;

/** @param {HTMLElement} watch element whose size changes should re-check (the main outlet) */
export function initScrollHint(watch) {
  const btn = h('button', {
    type: 'button', class: 'scroll-hint-btn', tabindex: '-1', 'aria-hidden': 'true', title: S.common.moreBelow,
    on: { click: () => window.scrollBy({ top: Math.round(window.innerHeight * 0.7), behavior: reducedMotion() ? 'auto' : 'smooth' }) },
  }, icon('down'));
  const el = h('div', { class: 'scroll-hint', 'aria-hidden': 'true' }, btn);
  document.body.append(el);

  const update = () => {
    const root = document.documentElement;
    const below = root.scrollHeight - (window.scrollY + window.innerHeight);
    el.classList.toggle('is-visible', below > THRESHOLD_PX);
  };

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  new ResizeObserver(update).observe(watch); // content added/removed (chips, cards, forms)
  update();
  return update;
}
