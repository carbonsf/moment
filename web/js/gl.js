// @ts-check
/** WebGL renderer for the water layer (from Moment's tide). One context, one program per style, compiled on first use. */
import { HEADER, SHADERS } from './shaders.js';

const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const NAMES = ['R', 'T', 'B', 'L', 'HS', 'P', 'Q', 'BG', 'TEAL', 'SAND', 'INK', 'HT'];

/**
 * @typedef {{t:number, b:number, level:number, amp:number, dim:number, heights:Uint8Array}} TideFrame
 * @param {HTMLCanvasElement} canvas @param {import('./water.js').Palette} pal
 */
export function createTideRenderer(canvas, pal) {
  const gl = /** @type {WebGLRenderingContext|null} */ (canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'low-power' }));
  if (!gl) return null;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 64, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array(64).fill(128));
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);

  /** @type {Record<string, {p:WebGLProgram, a:number, u:Record<string, WebGLUniformLocation|null>}|null>} */
  const progs = {};
  const compile = (/** @type {string} */ id) => {
    if (id in progs) return progs[id];
    const mk = (/** @type {number} */ type, /** @type {string} */ src) => {
      const s = /** @type {WebGLShader} */ (gl.createShader(type));
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    try {
      const p = /** @type {WebGLProgram} */ (gl.createProgram());
      gl.attachShader(p, mk(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, mk(gl.FRAGMENT_SHADER, HEADER + SHADERS[id]));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
      /** @type {Record<string, WebGLUniformLocation|null>} */
      const u = {};
      for (const n of NAMES) u[n] = gl.getUniformLocation(p, n);
      progs[id] = { p, a: gl.getAttribLocation(p, 'a'), u };
    } catch (e) {
      console.warn('tide shader failed', id, e);
      progs[id] = null;
    }
    return progs[id];
  };

  let style = 'glass';
  return {
    /** @param {string} id */
    setStyle(id) { style = SHADERS[id] ? id : 'glass'; compile(style); },
    /** @param {number} w @param {number} h @param {number} dpr */
    resize(w, h, dpr) {
      const d = Math.min(dpr, 1.5); // keep fill rate sane on phones over a 15–45 min moment
      canvas.width = Math.max(1, Math.round(w * d));
      canvas.height = Math.max(1, Math.round(h * d));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    /** @param {TideFrame} f */
    draw(f) {
      const pr = compile(style) || compile('glass');
      if (!pr) return;
      gl.useProgram(pr.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(pr.a);
      gl.vertexAttribPointer(pr.a, 2, gl.FLOAT, false, 0, 0);
      const u = pr.u;
      gl.uniform2f(u.R, canvas.width, canvas.height);
      gl.uniform1f(u.T, f.t); gl.uniform1f(u.B, f.b); gl.uniform1f(u.L, f.level); gl.uniform1f(u.HS, 1);
      gl.uniform4f(u.P, f.amp, 0, 0, 0); gl.uniform4f(u.Q, f.dim, 0, 0, 0);
      gl.uniform3fv(u.BG, pal.bg); gl.uniform3fv(u.TEAL, pal.accent); gl.uniform3fv(u.SAND, pal.sand); gl.uniform3fv(u.INK, pal.text);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 64, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, f.heights);
      gl.uniform1i(u.HT, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    destroy() { gl.getExtension('WEBGL_lose_context')?.loseContext(); },
  };
}
