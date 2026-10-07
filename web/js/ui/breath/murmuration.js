// @ts-check
/**
 * Murmuration — a flock in a flow field (DD-081). 2D canvas, ~900 particles.
 * Each particle follows the curl of a slowly evolving gradient-noise field (divergence-free, so it swirls
 * without clumping), plus a radial spring toward a ring whose radius follows the breath: the flock opens on
 * the inhale and gathers on the exhale. Motion-blur trails come from fading the previous frame toward the
 * background rather than clearing; particles draw additively.
 */
import { css, makeNoise, sizeCanvas } from './common.js';

const COUNT = 900;

/** @param {HTMLCanvasElement} canvas @param {import('./common.js').Palette} pal */
export function create(canvas, pal) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const noise = makeNoise(11);
  let w = 1, h = 1, dpr = 1;
  const px = new Float32Array(COUNT), py = new Float32Array(COUNT), vx = new Float32Array(COUNT), vy = new Float32Array(COUNT);
  const hue = new Uint8Array(COUNT);
  let seeded = false;
  let lastT = 0;

  const seed = () => {
    let s = 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < COUNT; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * Math.min(w, h) * 0.35;
      px[i] = w / 2 + Math.cos(a) * r;
      py[i] = h / 2 + Math.sin(a) * r;
      vx[i] = vy[i] = 0;
      hue[i] = rnd() < 0.2 ? 1 : rnd() < 0.08 ? 2 : 0;
    }
    seeded = true;
  };

  /** Curl of the noise field at (x, y, t). @param {number} x @param {number} y @param {number} t */
  const curl = (x, y, t) => {
    const sc = 0.0035, e = 0.35;
    const X = x * sc + t * 0.03, Y = y * sc - t * 0.02;
    const n1 = noise(X, Y + e) - noise(X, Y - e);
    const n2 = noise(X + e, Y) - noise(X - e, Y);
    return [n1 / (2 * e), -n2 / (2 * e)];
  };

  /**
   * Bounded, damped steering: velocity eases toward (flow + ring correction + swirl), speed is clamped,
   * strays respawn on the ring. Stable at any frame time.
   * @param {number} t @param {number} level @param {number} dt
   */
  const step = (t, level, dt) => {
    const cx = w / 2, cy = h / 2;
    const ring = Math.min(w, h) * (0.14 + 0.22 * level);
    const k = Math.min(Math.max(dt, 0), 1 / 30) * 60; // ≤2 frames of motion per step
    const maxV = 2.2;
    for (let i = 0; i < COUNT; i++) {
      const [fx, fy] = curl(px[i], py[i], t);
      const dx = px[i] - cx, dy = py[i] - cy;
      const d = Math.hypot(dx, dy) + 1e-3;
      const err = Math.max(-1, Math.min(1, (ring - d) / ring));
      const tx = fx * 2.4 + (dx / d) * err * 1.4 + (-dy / d) * 0.55;
      const ty = fy * 2.4 + (dy / d) * err * 1.4 + (dx / d) * 0.55;
      vx[i] += (tx - vx[i]) * 0.08 * k;
      vy[i] += (ty - vy[i]) * 0.08 * k;
      const sp = Math.hypot(vx[i], vy[i]);
      if (sp > maxV) { vx[i] *= maxV / sp; vy[i] *= maxV / sp; }
      px[i] += vx[i] * k;
      py[i] += vy[i] * k;
      if (!(px[i] > -20 && px[i] < w + 20 && py[i] > -20 && py[i] < h + 20)) {
        const a = (i * 2.399963) % (Math.PI * 2);
        px[i] = cx + Math.cos(a) * ring; py[i] = cy + Math.sin(a) * ring; vx[i] = vy[i] = 0;
      }
    }
  };

  const colors = [css(pal.accent, 0.55), css(pal.sand, 0.6), css(pal.text, 0.7)];

  /** @param {number} fade */
  const paint = (fade) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = css(pal.bg, fade);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = colors[c];
      ctx.beginPath();
      for (let i = 0; i < COUNT; i++) {
        if (hue[i] !== c) continue;
        ctx.rect(px[i] - 0.8, py[i] - 0.8, 1.6, 1.6);
      }
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  return {
    resize(W, H, D) {
      w = W; h = H; dpr = D;
      sizeCanvas(canvas, w, h, dpr);
      seed();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = css(pal.bg, 1);
      ctx.fillRect(0, 0, w, h);
    },
    draw(t, level, still) {
      if (!seeded) seed();
      if (still) {
        // Calm, stable frame: settle the flock once, then draw it crisply.
        if (lastT !== -1) { for (let n = 0; n < 160; n++) step(n / 60, 0.5, 1 / 60); lastT = -1; }
        paint(1);
        return;
      }
      const dt = lastT > 0 ? Math.max(0, t - lastT) : 1 / 60;
      lastT = t;
      step(t, level, dt);
      // Frame-rate independent trail fade (~7% per 60 Hz frame).
      paint(1 - Math.pow(1 - 0.07, Math.min(dt, 0.1) * 60));
    },
    destroy() {},
  };
}
