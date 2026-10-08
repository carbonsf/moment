// @ts-check
/**
 * Breathing visuals inside the water (DD-088). The tide (DD-083) took over the moment flow; the six breath
 * visuals (DD-081) now live beneath its surface instead of beside a slider:
 * - Wave = the water alone (no extra layer).
 * - Silk, Ink, Shallows, Pendulum, Murmuration render on a square canvas centred in the water body,
 *   scaled to fit it, clipped to the live waterline every frame, and screen-blended into the tide,
 *   so they rise, fall and slosh with it. They breathe on the same curve as the water.
 * Strength per screen keeps text legible (soft behind the Distract list, strongest on Surf).
 * Chosen per moment like before (Random / Cycling, DD-082). Same breath, reduced motion = still frame.
 */
import { VISUALS } from '../breath/index.js';
import { readPalette } from '../breath/common.js';
import { onWaterFrame, surfaceY, waterLayer } from './water.js';

/** Opacity of the visual on each tide screen. */
const STRENGTH = {
  start: 0.5, distance: 0.7, surf: 0.7, distract: 0.22, doing: 0.6,
  decide: 0.45, tape: 0.25, thought: 0.3, words: 0.5, close: 0.5,
  after: 0, // After stays plain: safety information only (DD-089)
  moment: 0.35,
};
const MAX_SIZE = 520;
const CLIP_POINTS = 24;

/** @type {HTMLCanvasElement|null} */ let el = null;
/** @type {import('../breath/common.js').BreathRenderer|null} */ let renderer = null;
let current = 'wave';
let size = 0;
/** @type {(() => void)|null} */ let unhook = null;

const dprCap = () => Math.min(1.5, window.devicePixelRatio || 1);

function teardown() {
  renderer?.destroy();
  renderer = null;
  el?.remove();
  el = null;
  unhook?.();
  unhook = null;
}

/** Fit the square canvas to the viewport width (re-created on resize). */
function sizeFor() {
  return Math.round(Math.min(window.innerWidth, MAX_SIZE));
}

/**
 * Show breath visual `id` inside the water ('wave' or unknown = none).
 * @param {string} id
 */
export function setWaterVisual(id) {
  const make = VISUALS[id];
  if (id === current && (renderer || !make)) return;
  teardown();
  current = id;
  if (!make) return;
  el = document.createElement('canvas');
  el.className = 'tide-visual';
  el.setAttribute('aria-hidden', 'true');
  const below = waterLayer();
  if (below) below.after(el); else document.body.prepend(el);
  renderer = make(el, readPalette());
  if (!renderer) { teardown(); return; } // e.g. no WebGL for Ink / Shallows: the water alone
  size = sizeFor();
  renderer.resize(size, size, dprCap());
  const onResize = () => {
    const s = sizeFor();
    if (s !== size && renderer) { size = s; renderer.resize(size, size, dprCap()); }
  };
  window.addEventListener('resize', onResize);
  const off = onWaterFrame(frame);
  unhook = () => { off(); window.removeEventListener('resize', onResize); };
}

/** @param {{t:number, b:number, level:number, shown:boolean, screen:string, reduce:boolean}} f */
function frame(f) {
  if (!el || !renderer) return;
  const strength = f.shown ? (STRENGTH[/** @type {keyof typeof STRENGTH} */ (f.screen)] ?? STRENGTH.moment) : 0;
  el.style.opacity = String(strength);
  if (!strength) return;
  const iw = window.innerWidth, ih = window.innerHeight;
  const top0 = (1 - f.level) * ih; // mean waterline
  const body = Math.max(1, ih - top0);
  const scale = Math.max(0.3, Math.min(1.2, (body * 0.92) / size));
  const box = size * scale;
  const left = (iw - box) / 2;
  const top = top0 + (body - box) / 2;
  el.style.transform = `translate3d(${left.toFixed(1)}px, ${top.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
  // Clip to the live, rippling waterline (local, unscaled coordinates).
  const pts = [];
  for (let k = 0; k <= CLIP_POINTS; k++) {
    const lx = (k / CLIP_POINTS) * size;
    const sy = surfaceY((left + lx * scale) / iw);
    const ly = Math.max(0, Math.min(size, (sy - top) / scale));
    pts.push(`${lx.toFixed(1)}px ${ly.toFixed(1)}px`);
  }
  el.style.clipPath = `polygon(${pts.join(',')},${size}px ${size}px,0px ${size}px)`;
  renderer.draw(f.t, f.b, f.reduce);
}
