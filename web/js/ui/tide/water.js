// @ts-check
/**
 * The tide (DD-083): one persistent water layer behind every moment screen. The waterline is the urge.
 * - Level: 0–10 maps to 10%–90% of the viewport height (levelFor / valueAt).
 * - Surface: a 64-column height field (1D wave equation) you can grab; ripples travel and reflect off the walls.
 * - Breath: the level rises over --wave-rise and falls over --wave-fall (DD-027) by a per-screen amount.
 * - Riders: elements that sit on the surface (the number, the handle, "I'm back") are moved here each frame via CSSOM.
 * Screens call setWaterScreen() on render and enableGrab() where the water is the input.
 */
import { cssMs, reducedMotion } from '../dom.js';
import { readPalette } from '../breath/common.js';
import { tick } from '../../services/feedback.js';
import { createTideRenderer } from './gl.js';

const NH = 64;
/** @param {number} v 0–10 */
export const levelFor = (v) => 0.1 + 0.08 * v;
/** @param {number} L 0–1 */
export const valueAt = (L) => Math.max(0, Math.min(10, Math.round((L - 0.1) / 0.08)));

/**
 * Per-screen behavior. amp: ambient ripple; breath: rise as a fraction of screen height; dim: underwater darkening;
 * speed: time scale; fixed: level regardless of rating; rest: level before the first rating.
 * @type {Record<string, {amp:number, breath:number, dim:number, speed:number, fixed?:number, rest?:number, style?:string}>}
 */
const SCREENS = {
  start: { amp: 1, breath: 0.012, dim: 0, speed: 1, rest: 0.3 },
  distance: { amp: 0.8, breath: 0.03, dim: 0, speed: 1, rest: 0.4 },
  surf: { amp: 1.3, breath: 0.05, dim: 0, speed: 1, rest: 0.4 },
  distract: { amp: 0.6, breath: 0.012, dim: 0, speed: 1, fixed: 0.78 },
  doing: { amp: 0.25, breath: 0.03, dim: 0.2, speed: 0.4, fixed: 0.24 },
  decide: { amp: 0.35, breath: 0.02, dim: 0.1, speed: 0.5, rest: 0.4 },   // still, glassy, at the current rating
  tape: { amp: 0.4, breath: 0.015, dim: 0, speed: 0.6, fixed: 0.8 },       // prompts step down the glass (setWaterDim / setWaterLevel)
  thought: { amp: 0.5, breath: 0.015, dim: 0, speed: 0.8, fixed: 0.78 },   // drops to 0.4 when a counter surfaces
  words: { amp: 0.4, breath: 0.02, dim: 0, speed: 0.7, fixed: 0.3 },       // own words sit in clear air
  close: { amp: 0.6, breath: 0.02, dim: 0, speed: 1, rest: 0.4 },
  after: { amp: 0, breath: 0, dim: 0.3, speed: 0.25, fixed: 0.06, style: 'glass' }, // drained, no effects
  moment: { amp: 0.6, breath: 0.03, dim: 0.15, speed: 0.6, fixed: 0.2 },
};

const H = new Float32Array(NH), V = new Float32Array(NH), HB = new Uint8Array(NH);
/** @type {HTMLCanvasElement|null} */ let canvas = null;
/** @type {HTMLElement|null} */ let fallback = null;
/** @type {ReturnType<typeof createTideRenderer>} */ let renderer = null;
let L = 0.2, vel = 0, target = 0.2, grabbing = false, fx = 0.5, fL = 0.2, bm = 0, pb = 0, kick = 0, t = 0, last = 0, raf = 0, shown = false;
let cfg = SCREENS.moment;
let dimOverride = /** @type {number|null} */ (null);
let styleId = 'glass';
let screenName = 'moment';
/** Per-frame listeners (e.g. the breathing visual inside the water, DD-088). @type {Set<(f:{t:number, b:number, level:number, shown:boolean, screen:string, reduce:boolean}) => void>} */
const hooks = new Set();
let riseMs = 4000, fallMs = 6000;
/** @type {Map<HTMLElement, {offset:number, x:number}>} */
const riders = new Map();

/** Breath level 0..1 and phase (matches wave.js breathLevel). @param {number} ms */
function breath(ms) {
  const period = riseMs + fallMs;
  const p = ((ms % period) + period) % period;
  const inhale = p < riseMs;
  const x = inhale ? p / riseMs : 1 - (p - riseMs) / fallMs;
  return { b: 0.5 - 0.5 * Math.cos(Math.PI * x), inhale, phase: inhale ? p / riseMs : (p - riseMs) / fallMs };
}

/** Current breath phase, for the "in / out" cue. */
export function breathPhase() { return breath(Date.now()); }

/** Height-field step: 1D wave equation with damping, the finger's pull, and small random swells. @param {number} dt */
function sim(dt) {
  const sub = 4, d = dt / sub;
  for (let s = 0; s < sub; s++) {
    for (let i = 0; i < NH; i++) {
      const a = H[i > 0 ? i - 1 : 1], b = H[i < NH - 1 ? i + 1 : NH - 2]; // reflective walls
      V[i] += (2600 * (a + b - 2 * H[i]) - 1.4 * V[i] - 3 * H[i]) * d;
    }
    if (grabbing) {
      const rel = fL - L;
      for (let i = 0; i < NH; i++) {
        const g = Math.exp(-(((i / (NH - 1) - fx) / 0.09) ** 2));
        V[i] += ((rel - H[i]) * g * 60 - V[i] * g * 6) * d;
      }
    }
    for (let i = 0; i < NH; i++) H[i] = Math.max(-0.078, Math.min(0.078, H[i] + V[i] * d));
  }
  kick -= dt;
  if (kick < 0) {
    kick = 0.25 + Math.random() * 0.5;
    V[1 + Math.floor(Math.random() * (NH - 2))] += (Math.random() - 0.5) * 0.25 * cfg.amp;
  }
  for (let i = 0; i < NH; i++) HB[i] = Math.max(0, Math.min(255, Math.round(128 + (H[i] / 0.08) * 127)));
}

/** Height at x (0..1), screen fraction. @param {number} x */
const heightAt = (x) => H[Math.round(Math.max(0, Math.min(1, x)) * (NH - 1))];

/** Surface y in CSS px at x (0..1), including breath. @param {number} x */
export function surfaceY(x) {
  return (1 - displayLevel() - heightAt(x)) * window.innerHeight;
}
let lastDisplay = 0.2;
const displayLevel = () => lastDisplay;

/** @param {number} ts */
function frame(ts) {
  raf = requestAnimationFrame(frame);
  const reduce = reducedMotion();
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  if (reduce) {
    L = target; vel = 0; H.fill(0); V.fill(0); HB.fill(128);
  } else {
    const k = grabbing ? 40 : 14, c = grabbing ? 12 : 5.5;
    const pv = vel;
    vel += ((target - L) * k - vel * c) * dt;
    L += vel * dt;
    const acc = (vel - pv) / Math.max(dt, 0.001);
    for (let i = 0; i < NH; i++) V[i] += -acc * (i / (NH - 1) - 0.5) * 0.05 * dt; // level changes slosh
    sim(dt);
  }
  const br = breath(Date.now());
  bm += (((grabbing || reduce) ? 0 : cfg.breath) - bm) * Math.min(1, dt * 1.5);
  if (!reduce) {
    const db = br.b - pb;
    for (let i = 0; i < NH; i++) V[i] += db * Math.cos((Math.PI * 2 * i) / (NH - 1)) * bm * 14; // edges lead the swell
  }
  pb = br.b;
  lastDisplay = L + (br.b - 0.5) * bm;
  t += dt * (reduce ? 0 : cfg.speed);

  if (renderer && shown) renderer.draw({ t, b: br.b, level: lastDisplay, amp: cfg.amp, dim: dimOverride ?? cfg.dim, heights: HB });
  for (const fn of hooks) fn({ t, b: br.b, level: lastDisplay, shown, screen: screenName, reduce });
  if (fallback) fallback.style.transform = `translateY(${((1 - lastDisplay) * 100).toFixed(2)}%)`;
  const ih = window.innerHeight;
  for (const [el, r] of riders) el.style.transform = `translate3d(0, ${((1 - lastDisplay - heightAt(r.x)) * ih + r.offset).toFixed(1)}px, 0)`;
}

/** Create the layer once at boot (app.js). */
export function mountWater() {
  if (canvas || fallback) return;
  riseMs = cssMs('--wave-rise') || riseMs;
  fallMs = cssMs('--wave-fall') || fallMs;
  canvas = document.createElement('canvas');
  canvas.className = 'tide-layer';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  renderer = createTideRenderer(canvas, readPalette());
  if (!renderer) {
    canvas.remove(); canvas = null;
    fallback = document.createElement('div');
    fallback.className = 'tide-layer tide-fallback';
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
}

/** @param {boolean} on */
function show(on) {
  shown = on;
  (canvas || fallback)?.classList.toggle('is-shown', on);
  document.documentElement.classList.toggle('tide-on', on); // lets other layers (e.g. the scroll hint) adapt
}

/**
 * Called by each moment screen on render.
 * @param {string} name a key of SCREENS, anything else uses 'moment' @param {{value?:number|null}} [opts]
 */
export function setWaterScreen(name, opts = {}) {
  cfg = SCREENS[name] || SCREENS.moment;
  dimOverride = null;
  renderer?.setStyle(cfg.style || styleId);
  screenName = SCREENS[name] ? name : 'moment';
  const next = cfg.fixed ?? (opts.value != null ? levelFor(opts.value) : (cfg.rest ?? 0.4));
  const dir = Math.sign(next - L);
  for (let i = 0; i < NH; i++) V[i] += dir * Math.cos((Math.PI * i) / (NH - 1)) * 0.35 * Math.min(1, Math.abs(next - L) * 3); // screen change sloshes
  target = next;
  show(true);
}

/**
 * Run fn every water frame (only while the document is visible). DD-088
 * @param {(f:{t:number, b:number, level:number, shown:boolean, screen:string, reduce:boolean}) => void} fn
 * @returns {() => void} remove
 */
export function onWaterFrame(fn) { hooks.add(fn); return () => hooks.delete(fn); }

/** The tide canvas (or fallback), so other layers can stack right above it. */
export function waterLayer() { return canvas || fallback; }

/** Leaving the moment flow. */
export function hideWater() { show(false); }

/** Move the level to a rating without changing screen. @param {number} v */
export function setWaterValue(v) { target = levelFor(v); }

/** @param {string} id glass | storm | boil */
export function setWaterStyle(id) { styleId = id; if (!cfg.style) renderer?.setStyle(id); }

/** Set a raw level (0..1 from the bottom) with a slosh, for screens whose level isn't a rating. @param {number} lv */
export function setWaterLevel(lv) {
  const dir = Math.sign(lv - L);
  for (let i = 0; i < NH; i++) V[i] += dir * Math.cos((Math.PI * i) / (NH - 1)) * 0.3 * Math.min(1, Math.abs(lv - L) * 3);
  target = lv;
}

/** Darken the water (0..1) until the next setWaterScreen. @param {number|null} d */
export function setWaterDim(d) { dimOverride = d; }

/**
 * Keep an element on the surface. It gets class .tide-rider (fixed, top 0) and a per-frame translateY.
 * @param {HTMLElement} el @param {{offset?:number, x?:number}} [o] offset px from the surface, x 0..1 where to read the height
 * @returns {() => void} stop riding
 */
export function ride(el, o = {}) {
  el.classList.add('tide-rider');
  riders.set(el, { offset: o.offset ?? 0, x: o.x ?? 0.5 });
  return () => riders.delete(el);
}

const NO_GRAB = 'button, a, input, select, textarea, label, summary, [role="switch"], .no-grab';

/**
 * Make the water the input on this screen: press anywhere below the top bar and drag the waterline.
 * onInput fires on every whole-number change; onCommit on release (one drag = one rating, like DD-051).
 * @param {{onInput?:(v:number)=>void, onCommit:(v:number)=>void, onStart?:()=>void}} o
 * @returns {() => void} disable
 */
export function enableGrab(o) {
  let v = /** @type {number|null} */ (null);
  const top = () => document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
  const at = (/** @type {PointerEvent} */ e) => {
    fx = Math.max(0, Math.min(1, e.clientX / window.innerWidth));
    fL = Math.max(0.08, Math.min(0.92, 1 - e.clientY / window.innerHeight));
    target = fL;
    const nv = valueAt(fL);
    if (nv !== v) { v = nv; tick(); o.onInput?.(nv); }
  };
  const down = (/** @type {PointerEvent} */ e) => {
    if (e.button !== 0 || e.clientY < top()) return;
    if (/** @type {Element} */ (e.target).closest?.(NO_GRAB)) return;
    grabbing = true; v = null;
    o.onStart?.();
    at(e);
  };
  const move = (/** @type {PointerEvent} */ e) => { if (grabbing) at(e); };
  const up = () => {
    if (!grabbing) return;
    grabbing = false;
    if (v != null) { target = levelFor(v); o.onCommit(v); }
  };
  document.documentElement.classList.add('tide-grab');
  document.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  return () => {
    grabbing = false;
    document.documentElement.classList.remove('tide-grab');
    document.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
}

/**
 * Tide marks on the glass: one dot per rating, joined by a dotted line (Surf).
 * @returns {{el:SVGSVGElement, update:(ratings:{t:number,v:number}[], spanMs:number)=>void}}
 */
export function createTideMarks() {
  const NS = 'http://www.w3.org/2000/svg';
  const el = /** @type {SVGSVGElement} */ (document.createElementNS(NS, 'svg'));
  el.setAttribute('class', 'tide-marks');
  el.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('class', 'tide-mark-line');
  el.append(path);
  /** @type {SVGCircleElement[]} */
  let dots = [];
  return {
    el,
    update(ratings, spanMs) {
      const w = window.innerWidth, ih = window.innerHeight;
      el.setAttribute('viewBox', `0 0 ${w} ${ih}`);
      const pad = Math.max(18, (w - 560) / 2 + 18);
      const pts = [...ratings].sort((a, b) => a.t - b.t).map((r) => ({ x: pad + (r.t / Math.max(1, spanMs)) * (w - pad * 2), y: (1 - levelFor(r.v)) * ih }));
      let d = '';
      pts.forEach((p, i) => {
        if (!i) { d = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`; return; }
        const q = pts[i - 1], mx = ((q.x + p.x) / 2).toFixed(1);
        d += ` C${mx} ${q.y.toFixed(1)},${mx} ${p.y.toFixed(1)},${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      });
      path.setAttribute('d', d);
      dots.forEach((c) => c.remove());
      dots = pts.map((p) => {
        const c = /** @type {SVGCircleElement} */ (document.createElementNS(NS, 'circle'));
        c.setAttribute('class', 'tide-mark-dot');
        c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1)); c.setAttribute('r', '3');
        el.append(c);
        return c;
      });
    },
  };
}
