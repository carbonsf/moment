// @ts-check
/**
 * Breathing lab: every breath visual live, side by side, on the shared breath curve (DD-081).
 * Design-review page only; not linked from the app. Copy here is internal, so it lives in this file.
 */
import { createWave, breathLevel } from '../js/ui/wave.js';
import { VISUAL_IDS } from '../js/ui/breath/index.js';
import { h, cssMs } from '../js/ui/dom.js';
import { S } from '../js/strings.js';

const HOW = {
  wave: 'Original. A filled sine band whose height follows the breath.',
  silk: 'Nine counter-rotating fabric shells with fold moiré and string-art weave, additive blend. Ripples deepen nonlinearly on the exhale.',
  ink: 'GPU domain-warped fbm (noise inside noise inside noise). Warp gain and zoom breathe, so the bloom unfurls and curls back.',
  shallows: 'GPU Voronoi F2−F1 caustics in two interfering layers with chromatic dispersion. A band of light rises with the inhale.',
  pendulum: 'Damped harmonograph, detuned 2:3, traced in three phase-offset passes, additive blend. Never repeats.',
  murmuration: '900 particles in a curl-noise flow field with motion-blur trails. The flock opens on the inhale, gathers on the exhale.',
};

const root = /** @type {HTMLElement} */ (document.getElementById('lab'));
const breathEl = h('span', { class: 'lab-breath', 'aria-live': 'off' });
root.append(
  h('header', { class: 'lab-head' }, h('h1', { class: 'screen-title' }, 'Breathing visuals'), breathEl),
  h('p', { class: 'muted' }, 'All six run on the same curve: 4 s in, 6 s out. Choose one in the app under Settings → Motion → Breathing visual, or open the app with ?breath=<name>.'),
);
const grid = h('div', { class: 'lab-grid' });
root.append(grid);

for (const id of VISUAL_IDS) {
  const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'wave-canvas', 'aria-hidden': 'true' }));
  const wrap = h('div', { class: 'wave-wrap' }, canvas);
  grid.append(h('figure', { class: 'lab-card' }, wrap,
    h('figcaption', null,
      h('span', { class: 'lab-name' }, S.settings.breathVisuals[/** @type {'wave'} */ (id)] || id),
      h('span', { class: 'lab-how' }, HOW[/** @type {'wave'} */ (id)] || ''),
      h('a', { class: 'lab-try', href: `../?breath=${id}#/home` }, `Open the app with ${id}`))));
  createWave({ canvas, plot: false, visual: id, getState: () => ({ startedAt: Date.now(), ratings: [], delayTargetMs: 0 }) });
}

// Phase readout so reviewers can check sync against the curve.
const rise = cssMs('--wave-rise') || 4000, fall = cssMs('--wave-fall') || 6000;
let prev = 0;
setInterval(() => {
  const l = breathLevel(Date.now(), rise, fall);
  breathEl.textContent = `${l >= prev ? 'In' : 'Out'} · ${Math.round(l * 100)}%`;
  prev = l;
}, 200);
