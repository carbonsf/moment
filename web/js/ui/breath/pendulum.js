// @ts-check
/**
 * Pendulum — a damped harmonograph (DD-081). 2D canvas.
 * x = Σ Aᵢ·sin(fᵢs + φᵢ)·e^(−dᵢs), y likewise, with near-2:3 frequency ratios slightly detuned so the figure
 * slowly precesses and never repeats. Traced three times with small phase offsets in sand / teal / off-white
 * under additive blending, giving a layered, iridescent ribbon. The breath swells the amplitude and loosens the damping.
 */
import { css, sizeCanvas } from './common.js';

const SAMPLES = 3200;

/** @param {HTMLCanvasElement} canvas @param {import('./common.js').Palette} pal */
export function create(canvas, pal) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  let w = 1, h = 1, dpr = 1;
  const passes = [
    { c: pal.sand, dp: 0, a: 0.16 },
    { c: pal.accent, dp: 0.03, a: 0.22 },
    { c: pal.text, dp: 0.06, a: 0.07 },
  ];

  return {
    resize(W, H, D) { w = W; h = H; dpr = D; sizeCanvas(canvas, w, h, dpr); },
    draw(t, level, still) {
      if (still) { t = 30; level = 0.5; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.44 * (0.78 + 0.22 * level);
      const cx = w / 2, cy = h / 2;
      // ~40 swings decaying to ~15%; detuned 2:3 / 3:2 pairs precess slowly so the rosette keeps turning.
      const S = Math.PI * 2 * 40;
      const damp = Math.log(7) / S * (1.15 - 0.3 * level);
      const drift = t * 0.05;
      const f1 = 2, f2 = 3 + 0.006 * Math.sin(t * 0.021), f3 = 3 + 0.004 * Math.cos(t * 0.017), f4 = 2.003;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      for (const ps of passes) {
        const p1 = drift + ps.dp, p2 = drift * 0.6 + 1.3 + ps.dp, p3 = -drift * 0.4 + 0.4, p4 = drift * 0.8 + 2.1 + ps.dp * 2;
        ctx.beginPath();
        for (let k = 0; k <= SAMPLES; k++) {
          const s = (k / SAMPLES) * S;
          const e = Math.exp(-damp * s);
          const x = (0.55 * Math.sin(f1 * s / 6 + p1) + 0.45 * Math.sin(f2 * s / 6 + p2)) * e;
          const y = (0.55 * Math.sin(f3 * s / 6 + p3) + 0.45 * Math.sin(f4 * s / 6 + p4)) * e;
          const X = cx + x * R, Y = cy + y * R * 0.92;
          k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        }
        ctx.strokeStyle = css(ps.c, ps.a * (0.7 + 0.3 * level));
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
      // A faint pivot glow at the center the figure decays into.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.35);
      g.addColorStop(0, css(pal.sand, 0.08 + 0.06 * level));
      g.addColorStop(1, css(pal.sand, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    },
    destroy() {},
  };
}
