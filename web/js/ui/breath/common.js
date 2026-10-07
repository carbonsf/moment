// @ts-check
/**
 * Shared helpers for breath visuals (DD-081): palette from tokens, color math, gradient noise, a WebGL full-screen pass.
 *
 * Renderer contract (every module in this folder):
 *   create(canvas, palette) → { resize(wCss, hCss, dpr), draw(tSec, level 0..1, still), destroy() } | null (unsupported)
 * `level` is the shared breath curve (rise --wave-rise, fall --wave-fall). `still` = reduced motion: draw a calm, stable frame.
 */
import { cssVar } from '../dom.js';

/** @typedef {[number, number, number]} RGB 0..1 */
/** @typedef {{bg:RGB, accent:RGB, sand:RGB, text:RGB}} Palette */
/** @typedef {{resize:(w:number,h:number,dpr:number)=>void, draw:(t:number, level:number, still:boolean)=>void, destroy:()=>void}} BreathRenderer */

/** @param {string} c @param {RGB} fallback @returns {RGB} */
export function rgb(c, fallback) {
  const s = (c || '').trim();
  if (s.startsWith('#')) {
    const hex = s.length === 4 ? [...s.slice(1)].map((x) => x + x).join('') : s.slice(1, 7);
    return /** @type {RGB} */ ([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255));
  }
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? /** @type {RGB} */ (m.slice(0, 3).map((x) => +x / 255)) : fallback;
}

/** Palette from design tokens, so visuals follow tokens.css. @returns {Palette} */
export function readPalette() {
  return {
    bg: rgb(cssVar('--c-bg'), [0.07, 0.08, 0.094]),
    accent: rgb(cssVar('--c-accent'), [0.55, 0.765, 0.8]),
    sand: rgb(cssVar('--c-sand'), [0.824, 0.725, 0.561]),
    text: rgb(cssVar('--c-text'), [0.914, 0.902, 0.875]),
  };
}

/** @param {RGB} c @param {number} [a] */
export function css(c, a = 1) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
}

/** @param {RGB} a @param {RGB} b @param {number} t @returns {RGB} */
export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Seeded 2D gradient noise (Perlin-style), range ~[-1, 1]. @param {number} [seed] */
export function makeNoise(seed = 7) {
  const p = new Uint8Array(512);
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (/** @type {number} */ hsh, /** @type {number} */ x, /** @type {number} */ y) => {
    const h = hsh & 7;
    const u = h < 4 ? x : y, v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  };
  const fade = (/** @type {number} */ t) => t * t * t * (t * (t * 6 - 15) + 10);
  /** @param {number} x @param {number} y */
  return (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = p[X] + Y, b = p[X + 1] + Y;
    const l1 = grad(p[a], x, y) + u * (grad(p[b], x - 1, y) - grad(p[a], x, y));
    const l2 = grad(p[a + 1], x, y - 1) + u * (grad(p[b + 1], x - 1, y - 1) - grad(p[a + 1], x, y - 1));
    return (l1 + v * (l2 - l1)) * 0.5;
  };
}

/** Size a 2D canvas to CSS px × dpr. @param {HTMLCanvasElement} c @param {number} w @param {number} h @param {number} dpr */
export function sizeCanvas(c, w, h, dpr) {
  c.width = Math.max(1, Math.round(w * dpr));
  c.height = Math.max(1, Math.round(h * dpr));
}

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

/**
 * One full-screen fragment pass. Uniforms provided: u_res, u_t, u_level, u_bg, u_accent, u_sand, u_text.
 * Renders at ≤1.5× dpr to stay light on phones. Returns null when WebGL is unavailable.
 * @param {HTMLCanvasElement} canvas @param {string} frag @param {Palette} pal @returns {BreathRenderer|null}
 */
export function glPass(canvas, frag, pal) {
  const gl = /** @type {WebGLRenderingContext|null} */ (canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' }));
  if (!gl) return null;
  const sh = (/** @type {number} */ type, /** @type {string} */ src) => {
    const s = /** @type {WebGLShader} */ (gl.createShader(type));
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  };
  let prog;
  try {
    prog = /** @type {WebGLProgram} */ (gl.createProgram());
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link');
  } catch (e) {
    console.warn('breath visual shader failed', e);
    return null;
  }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (/** @type {string} */ n) => gl.getUniformLocation(prog, n);
  const u = { res: U('u_res'), t: U('u_t'), level: U('u_level'), bg: U('u_bg'), accent: U('u_accent'), sand: U('u_sand'), text: U('u_text') };
  gl.uniform3fv(u.bg, pal.bg);
  gl.uniform3fv(u.accent, pal.accent);
  gl.uniform3fv(u.sand, pal.sand);
  gl.uniform3fv(u.text, pal.text);
  return {
    resize(w, h, dpr) {
      sizeCanvas(canvas, w, h, Math.min(dpr, 1.5));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.res, canvas.width, canvas.height);
    },
    draw(t, level) {
      gl.uniform1f(u.t, t);
      gl.uniform1f(u.level, level);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
