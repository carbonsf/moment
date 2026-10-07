// @ts-check
/**
 * Breath visual registry (DD-081). 'wave' is the original ambient band drawn inside wave.js;
 * the others render on a backdrop canvas beneath the ratings plot.
 * Choice: settings.breathVisual, overridable per page load with ?breath=<id> for design review.
 */
import { create as silk } from './silk.js';
import { create as ink } from './ink.js';
import { create as shallows } from './shallows.js';
import { create as pendulum } from './pendulum.js';
import { create as murmuration } from './murmuration.js';

/** @type {Record<string, ((canvas:HTMLCanvasElement, pal:import('./common.js').Palette) => import('./common.js').BreathRenderer|null)|null>} */
export const VISUALS = { wave: null, silk, ink, shallows, pendulum, murmuration };
export const VISUAL_IDS = Object.keys(VISUALS);

/** @param {string|undefined|null} setting @returns {string} */
export function resolveVisual(setting) {
  let override = null;
  try { override = new URLSearchParams(location.search).get('breath'); } catch { /* no location */ }
  if (override && override in VISUALS) return override;
  return setting && setting in VISUALS ? setting : 'wave';
}
