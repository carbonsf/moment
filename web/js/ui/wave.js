// @ts-check
/**
 * The wave (§14). DPR-aware canvas with three layers: ambient breathing band, plotted ratings, now marker.
 * Ambient cycle: rise --wave-rise, fall --wave-fall (~6 breaths/min, longer exhale). DD-027
 * Intensity is encoded by position only, never a color ramp. DD-022
 */
import { cssVar, cssMs, reducedMotion } from './dom.js';
import { MIN } from '../lib/time.js';

/**
 * @typedef {{t:number, v:number}} Pt
 * @typedef {{startedAt:number, ratings:Pt[], delayTargetMs:number}} WaveState
 */

/** Breath level 0..1 at time t (ms) with asymmetric rise/fall, eased. */
export function breathLevel(t, riseMs, fallMs) {
  const period = riseMs + fallMs;
  const p = ((t % period) + period) % period;
  const x = p < riseMs ? p / riseMs : 1 - (p - riseMs) / fallMs;
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/** Monotone cubic (Fritsch–Carlson) tangents for points sorted by x. @param {{x:number,y:number}[]} p */
function monotoneTangents(p) {
  const n = p.length;
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((p[i + 1].y - p[i].y) / Math.max(1e-6, p[i + 1].x - p[i].x));
  if (n < 2) return m;
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return m;
}

/**
 * @param {{canvas:HTMLCanvasElement, plot:boolean, getState:()=>WaveState}} opts
 */
export function createWave(opts) {
  const { canvas } = opts;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  let w = 0, hgt = 0, dpr = 1;
  let raf = 0;
  /** @type {ReturnType<typeof setInterval>|null} */
  let staticT = null;
  /** @type {Map<string, number>} rating key → first-seen time, for animating new points in */
  const seen = new Map();
  let colors = readColors();
  let riseMs = cssMs('--wave-rise') || 4000;
  let fallMs = cssMs('--wave-fall') || 6000;
  let durBase = cssMs('--dur-base') || 320;
  let destroyed = false;

  function readColors() {
    return {
      ambient: cssVar('--c-wave-ambient') || 'rgba(140,195,204,0.14)',
      line: cssVar('--c-wave-line') || '#8cc3cc',
      point: cssVar('--c-wave-point') || '#e9e6df',
      grid: cssVar('--c-border') || '#2e3540',
      label: cssVar('--c-text-3') || '#8a9099',
      now: cssVar('--c-text-2') || '#b3b8bf',
      bg: cssVar('--c-bg') || '#121418',
    };
  }

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    w = Math.max(1, r.width);
    hgt = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    colors = readColors();
    riseMs = cssMs('--wave-rise') || riseMs;
    fallMs = cssMs('--wave-fall') || fallMs;
    durBase = cssMs('--dur-base') || durBase;
    draw(performance.now());
  };

  /** @param {number} level 0..1 @param {number} phase */
  const drawAmbient = (level, phase) => {
    const amp = hgt * (0.12 + 0.28 * level);
    const base = hgt * 0.92;
    ctx.beginPath();
    ctx.moveTo(0, hgt);
    for (let x = 0; x <= w; x += 4) {
      const y = base - amp * (0.6 + 0.4 * Math.sin((x / w) * Math.PI * 2 + phase));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, hgt);
    ctx.closePath();
    ctx.fillStyle = colors.ambient;
    ctx.fill();
  };

  /** @param {number} nowPerf */
  const drawPlot = (nowPerf) => {
    const st = opts.getState();
    const elapsed = Math.max(0, Date.now() - st.startedAt);
    const span = Math.max(st.delayTargetMs, elapsed + 2 * MIN);
    const padL = 28, padR = 12, padT = 14, padB = 14;
    const pw = w - padL - padR, ph = hgt - padT - padB;
    const X = (/** @type {number} */ t) => padL + (t / span) * pw;
    const Y = (/** @type {number} */ v) => padT + (1 - v / 10) * ph;

    // Gridlines 0, 5, 10 with small labels
    ctx.lineWidth = 1;
    ctx.font = `${11}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (const g of [0, 5, 10]) {
      ctx.strokeStyle = colors.grid;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(padL, Math.round(Y(g)) + 0.5);
      ctx.lineTo(w - padR, Math.round(Y(g)) + 0.5);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = colors.label;
      ctx.fillText(String(g), padL - 8, Y(g));
    }

    // Now marker
    ctx.strokeStyle = colors.now;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.round(X(elapsed)) + 0.5, padT);
    ctx.lineTo(Math.round(X(elapsed)) + 0.5, padT + ph);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const rs = [...st.ratings].sort((a, b) => a.t - b.t);
    if (!rs.length) return;
    const reduce = reducedMotion();
    // Animate new points in over --dur-base.
    const prog = rs.map((r) => {
      const k = `${r.t}:${r.v}`;
      if (!seen.has(k)) seen.set(k, reduce ? -1e9 : nowPerf);
      return reduce ? 1 : Math.min(1, (nowPerf - /** @type {number} */ (seen.get(k))) / durBase);
    });
    const pts = rs.map((r) => ({ x: X(r.t), y: Y(r.v) }));
    if (pts.length > 1) {
      const m = monotoneTangents(pts);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.globalAlpha = Math.min(1, prog[prog.length - 1] + 0.4);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = (pts[i + 1].x - pts[i].x) / 3;
        ctx.bezierCurveTo(pts[i].x + dx, pts[i].y + dx * m[i], pts[i + 1].x - dx, pts[i + 1].y - dx * m[i + 1], pts[i + 1].x, pts[i + 1].y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    pts.forEach((p, i) => {
      const a = prog[i];
      ctx.fillStyle = colors.point;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 + 2 * a, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = colors.bg;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  };

  /** @param {number} nowPerf */
  function draw(nowPerf) {
    if (destroyed) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    const reduce = reducedMotion();
    const t = Date.now();
    const level = reduce ? 0.5 : breathLevel(t, riseMs, fallMs);
    const phase = reduce ? 0 : (t / (riseMs + fallMs)) * Math.PI * 0.5;
    drawAmbient(level, phase);
    if (opts.plot) drawPlot(nowPerf);
  }

  const loop = (/** @type {number} */ ts) => {
    draw(ts);
    raf = requestAnimationFrame(loop);
  };

  const start = () => {
    stop();
    if (destroyed || document.visibilityState !== 'visible') return;
    if (reducedMotion()) {
      // Static band; redraw once a second only to move the now marker.
      draw(performance.now());
      staticT = setInterval(() => draw(performance.now()), 1000);
    } else {
      raf = requestAnimationFrame(loop);
    }
  };
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (staticT) clearInterval(staticT);
    staticT = null;
  };
  const onVis = () => (document.visibilityState === 'visible' ? start() : stop());

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  document.addEventListener('visibilitychange', onVis);
  resize();
  start();

  return {
    /** Redraw now (e.g. after a new rating). */
    refresh() { draw(performance.now()); },
    /** Re-evaluate motion preference. */
    restart() { start(); },
    destroy() {
      destroyed = true;
      stop();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
