// @ts-check
/**
 * The water, borrowed from Moment's tide: one WebGL layer behind every screen.
 * Here the level is how much you've kept today; each new entry raises it a little.
 * - Surface: a 64-column height field (1D wave equation); ripples travel and reflect off the walls.
 * - Breath: the level rises over --wave-rise and falls over --wave-fall by a small amount.
 */
import { createTideRenderer } from './gl.js';

/** @typedef {[number, number, number]} RGB 0..1 */
/** @typedef {{bg:RGB, accent:RGB, sand:RGB, text:RGB}} Palette */

/** Moment's water styles (shaders.js). */
export const STYLES = ['glass', 'storm', 'boil'];

const NH = 64;
const BREATH = 0.014;
const AMP = 0.8;
const H = new Float32Array(NH), V = new Float32Array(NH), HB = new Uint8Array(NH);
/** @type {HTMLCanvasElement|null} */ let canvas = null;
/** @type {HTMLElement|null} */ let fallback = null;
/** @type {ReturnType<typeof createTideRenderer>} */ let renderer = null;
let L = 0.06, vel = 0, target = 0.06, dim = 0, dimTarget = 0, pb = 0, kick = 0, t = 0, last = 0, raf = 0, shown = false;
let riseMs = 4000, fallMs = 6000;

const cssVar = (/** @type {string} */ n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const cssMs = (/** @type {string} */ n) => { const v = cssVar(n); return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000 || 0; };
const reduced = () => document.documentElement.dataset.motion === 'reduce';

/** @param {string} c @param {RGB} fb @returns {RGB} */
function rgb(c, fb) {
  if (!c.startsWith('#')) return fb;
  const hex = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1, 7);
  return /** @type {RGB} */ ([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
}

/** @returns {Palette} */
function readPalette() {
  return {
    bg: rgb(cssVar('--c-bg'), [0.07, 0.08, 0.094]),
    accent: rgb(cssVar('--c-accent'), [0.55, 0.765, 0.8]),
    sand: rgb(cssVar('--c-sand'), [0.824, 0.725, 0.561]),
    text: rgb(cssVar('--c-text'), [0.914, 0.902, 0.875]),
  };
}

/** Breath level 0..1. @param {number} ms */
function breath(ms) {
  const period = riseMs + fallMs;
  const p = ((ms % period) + period) % period;
  const x = p < riseMs ? p / riseMs : 1 - (p - riseMs) / fallMs;
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/** Height-field step: 1D wave equation with damping and small random swells. @param {number} dt */
function sim(dt) {
  const sub = 4, d = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (let i = 0; i < NH; i++) {
      const a = H[i > 0 ? i - 1 : 1], b = H[i < NH - 1 ? i + 1 : NH - 2]; // reflective walls
      V[i] += (2600 * (a + b - 2 * H[i]) - 1.4 * V[i] - 3 * H[i]) * d;
    }
    for (let i = 0; i < NH; i++) H[i] = Math.max(-0.078, Math.min(0.078, H[i] + V[i] * d));
  }
  kick -= dt;
  if (kick < 0) {
    kick = 0.25 + Math.random() * 0.5;
    V[1 + Math.floor(Math.random() * (NH - 2))] += (Math.random() - 0.5) * 0.25 * AMP;
  }
  for (let i = 0; i < NH; i++) HB[i] = Math.max(0, Math.min(255, Math.round(128 + (H[i] / 0.08) * 127)));
}

/** @param {number} ts */
function frame(ts) {
  raf = requestAnimationFrame(frame);
  const reduce = reduced();
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  if (reduce) {
    L = target; vel = 0; dim = dimTarget; H.fill(0); V.fill(0); HB.fill(128);
  } else {
    const pv = vel;
    vel += ((target - L) * 9 - vel * 4.5) * dt; // slow, heavy rise
    L += vel * dt;
    dim += (dimTarget - dim) * Math.min(1, dt * 2);
    const acc = (vel - pv) / Math.max(dt, 0.001);
    for (let i = 0; i < NH; i++) V[i] += -acc * (i / (NH - 1) - 0.5) * 0.05 * dt; // level changes slosh
    sim(dt);
  }
  const b = breath(Date.now());
  const bm = reduce ? 0 : BREATH;
  if (!reduce) {
    const db = b - pb;
    for (let i = 0; i < NH; i++) V[i] += db * Math.cos((Math.PI * 2 * i) / (NH - 1)) * bm * 14; // edges lead the swell
  }
  pb = b;
  const level = L + (b - 0.5) * bm;
  t += reduce ? 0 : dt;
  if (renderer && shown) renderer.draw({ t, b, level, amp: AMP, dim, heights: HB });
  if (fallback) fallback.style.transform = `translateY(${((1 - level) * 100).toFixed(2)}%)`;
}

/** Create the layer once at boot. */
export function mountWater() {
  if (canvas || fallback) return;
  riseMs = cssMs('--wave-rise') || riseMs;
  fallMs = cssMs('--wave-fall') || fallMs;
  canvas = document.createElement('canvas');
  canvas.className = 'water';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  renderer = createTideRenderer(canvas, readPalette());
  if (renderer) renderer.setStyle('glass');
  else {
    canvas.remove(); canvas = null;
    fallback = document.createElement('div');
    fallback.className = 'water water-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    document.body.prepend(fallback);
  }
  const resize = () => renderer?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  window.addEventListener('resize', resize);
  resize();
  const onVis = () => {
    cancelAnimationFrame(raf);
    if (document.visibilityState === 'visible') { last = performance.now(); raf = requestAnimationFrame(frame); }
  };
  document.addEventListener('visibilitychange', onVis);
  onVis();
  requestAnimationFrame(() => { shown = true; (canvas || fallback)?.classList.add('is-shown'); });
}

/** Move the water to a level (0..1 from the bottom) with a slosh. @param {number} lv */
export function setLevel(lv) {
  const dir = Math.sign(lv - L);
  for (let i = 0; i < NH; i++) V[i] += dir * Math.cos((Math.PI * i) / (NH - 1)) * 0.3 * Math.min(1, Math.abs(lv - L) * 3);
  target = lv;
}

/** @param {string} id one of STYLES */
export function setStyle(id) { renderer?.setStyle(id); }

/** Darken the water under the surface (0..1). @param {number} d */
export function setDim(d) { dimTarget = d; }

/** A drop landing at x (0..1 across the screen). @param {number} x @param {number} [strength] */
export function drop(x, strength = 1) {
  if (reduced()) return;
  for (let i = 0; i < NH; i++) {
    const g = Math.exp(-(((i / (NH - 1) - x) / 0.04) ** 2));
    V[i] -= g * 0.9 * strength; // pushes the surface down; it rebounds and spreads
  }
}
