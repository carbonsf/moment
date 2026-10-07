// @ts-check
/**
 * Breath visual registry (DD-081, DD-082). 'wave' is the original ambient band drawn inside wave.js;
 * the others render on a backdrop canvas beneath the ratings plot.
 * Setting values: any visual id, 'random' or 'cycle' (a new visual per moment; see pickVisualForMoment).
 * Overridable per page load with ?breath=<id> for design review.
 */
import { create as silk } from './silk.js';
import { create as ink } from './ink.js';
import { create as shallows } from './shallows.js';
import { create as pendulum } from './pendulum.js';
import { create as murmuration } from './murmuration.js';

/** @type {Record<string, ((canvas:HTMLCanvasElement, pal:import('./common.js').Palette) => import('./common.js').BreathRenderer|null)|null>} */
export const VISUALS = { wave: null, silk, ink, shallows, pendulum, murmuration };
export const VISUAL_IDS = Object.keys(VISUALS);
/** Settings choices: every visual plus the two modes. */
export const CHOICES = [...VISUAL_IDS, 'random', 'cycle'];

/**
 * Pick the visual for a new moment when the setting is a mode (DD-082).
 * 'random': any of the six except the previous moment's. 'cycle': the one after `lastIndex`, so each moment gets the next in turn.
 * @param {string} setting @param {number} lastIndex position used by the previous moment (-1 if none)
 * @returns {{id:string, index:number}|null} null when the setting is a fixed visual
 */
export function pickVisualForMoment(setting, lastIndex) {
  const n = VISUAL_IDS.length;
  if (setting === 'random') {
    const prev = lastIndex >= 0 && lastIndex < n ? lastIndex : -1;
    let index = Math.floor(Math.random() * (prev >= 0 ? n - 1 : n));
    if (prev >= 0 && index >= prev) index++; // skip last moment's visual
    return { id: VISUAL_IDS[index], index };
  }
  if (setting === 'cycle') {
    const index = (((lastIndex ?? -1) + 1) % n + n) % n;
    return { id: VISUAL_IDS[index], index };
  }
  return null;
}

/**
 * What a moment screen should draw. A ?breath=<id> override wins (design review); a mode uses the visual
 * picked when the moment started; a fixed setting is used as is.
 * @param {string|undefined|null} setting @param {{breathVisual?:string}|null} [moment]
 * @returns {string} a visual id
 */
export function resolveVisual(setting, moment) {
  try {
    const o = new URLSearchParams(location.search).get('breath');
    if (o && VISUAL_IDS.includes(o)) return o;
  } catch { /* no location */ }
  if (setting === 'random' || setting === 'cycle') {
    return moment?.breathVisual && VISUAL_IDS.includes(moment.breathVisual) ? moment.breathVisual : 'wave';
  }
  return setting && VISUAL_IDS.includes(setting) ? setting : 'wave';
}
