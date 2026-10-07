// @ts-check
/**
 * Silk — a breathing orb of layered fabric (DD-081). 2D canvas.
 * Nine translucent shells, each a closed harmonic contour, counter-rotating at different rates.
 * Each shell gets three fold strokes (moiré where they cross) and a sparse string-art weave.
 * Additive ('lighter') blending makes overlaps glow. Nonlinearity: ripple depth grows on the exhale
 * (∝ (1 − level)²) so the cloth goes slack as breath leaves and smooths taut as it fills.
 */
import { css, mix, sizeCanvas } from './common.js';

const LAYERS = 9;
const POINTS = 180;
const TAU = Math.PI * 2;

/** @param {HTMLCanvasElement} canvas @param {import('./common.js').Palette} pal */
export function create(canvas, pal) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  let w = 1, h = 1, dpr = 1;
  const xs = new Float32Array(POINTS), ys = new Float32Array(POINTS);

  /** Contour of shell i. @param {number} i @param {number} t @param {number} level @param {number} R */
  const contour = (i, t, level, R) => {
    const f = i / (LAYERS - 1);
    const dir = i % 2 ? 1 : -1;
    const rot = t * 0.06 * dir * (0.4 + f);
    const base = R * (0.58 + 0.42 * f);
    const slack = (1 - level) * (1 - level);
    const amp = 0.025 + 0.085 * slack * (0.4 + f);
    const squash = 0.9 + 0.08 * Math.sin(t * 0.21 + i * 0.9);
    const cx = w / 2, cy = h / 2;
    for (let k = 0; k < POINTS; k++) {
      const th = (k / POINTS) * TAU;
      const ripple =
        0.55 * Math.sin(3 * th + rot * 3 + i * 0.7) +
        0.30 * Math.sin(5 * th - t * 0.33 + i * 1.7) +
        0.45 * Math.sin(2 * th + t * 0.17 + f * 2) +
        0.15 * Math.sin(9 * th + t * 0.5 * dir);
      const r = base * (1 + amp * ripple);
      const a = th + rot;
      xs[k] = cx + Math.cos(a) * r;
      ys[k] = cy + Math.sin(a) * r * squash;
    }
  };

  /** @param {number} scale */
  const path = (scale) => {
    const cx = w / 2, cy = h / 2;
    ctx.beginPath();
    for (let k = 0; k <= POINTS; k++) {
      const j = k % POINTS;
      const x = cx + (xs[j] - cx) * scale, y = cy + (ys[j] - cy) * scale;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  };

  return {
    resize(W, H, D) { w = W; h = H; dpr = D; sizeCanvas(canvas, w, h, dpr); },
    draw(t, level, still) {
      if (still) { t = 18; level = 0.5; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.4 * (0.8 + 0.2 * level);
      const cx = w / 2, cy = h / 2;
      // Core warmth: sand at the heart, teal at the rim.
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.35);
      g.addColorStop(0, css(pal.sand, 0.10 + 0.10 * level));
      g.addColorStop(0.55, css(pal.accent, 0.06));
      g.addColorStop(1, css(pal.accent, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < LAYERS; i++) {
        const f = i / (LAYERS - 1);
        const c = mix(pal.sand, pal.accent, f);
        contour(i, t, level, R);
        // Translucent body
        path(1);
        ctx.fillStyle = css(c, 0.03 + 0.015 * level);
        ctx.fill();
        // Fold lines: three nested strokes create moiré where shells cross
        ctx.lineWidth = 0.8;
        for (const s of [1, 0.986, 0.972]) {
          path(s);
          ctx.strokeStyle = css(c, (0.09 + 0.10 * (1 - f)) * (s === 1 ? 1 : 0.6));
          ctx.stroke();
        }
        // Weave: sparse chords across the shell, rotating with it
        if (i % 2 === 0) {
          ctx.beginPath();
          const step = 6, off = Math.floor(POINTS * (0.31 + 0.04 * Math.sin(t * 0.1 + i)));
          for (let k = 0; k < POINTS; k += step) {
            ctx.moveTo(xs[k], ys[k]);
            ctx.lineTo(xs[(k + off) % POINTS], ys[(k + off) % POINTS]);
          }
          ctx.strokeStyle = css(pal.text, 0.018 + 0.012 * level);
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    destroy() {},
  };
}
