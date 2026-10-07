// @ts-check
/**
 * Ink — ink blooming in water (DD-081). WebGL fragment shader.
 * Domain-warped fractal noise: fbm(p + k·fbm(p + k·fbm(p))). The warp gain and zoom follow the breath,
 * so the cloud unfurls on the inhale and curls back on the exhale. A soft radial mask keeps it a centered bloom.
 */
import { glPass } from './common.js';

const FRAG = `
precision mediump float;
uniform vec2 u_res; uniform float u_t, u_level;
uniform vec3 u_bg, u_accent, u_sand, u_text;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float L = u_level;
  float t = u_t * 0.045;
  vec2 p = uv * (2.4 - 0.55 * L);
  float k = 2.6 + 1.8 * L;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + k * q + vec2(1.7, 9.2) + t * 1.3), fbm(p + k * q + vec2(8.3, 2.8)));
  float f = fbm(p + 3.5 * r);
  float d = length(uv * vec2(1.0, 1.08));
  float mask = smoothstep(0.98, 0.12 + 0.18 * L, d);
  vec3 col = mix(u_bg, u_accent, clamp(f * f * 1.9, 0.0, 1.0));
  col = mix(col, u_sand, clamp(length(q) * 0.7 - 0.3, 0.0, 1.0) * 0.6);
  col = mix(col, u_text, clamp(r.x * r.x * 0.7 - 0.05, 0.0, 1.0) * 0.22 * (0.5 + 0.5 * L));
  col = mix(u_bg, col, mask * (0.5 + 0.5 * L));
  gl_FragColor = vec4(col, 1.0);
}`;

/** @param {HTMLCanvasElement} canvas @param {import('./common.js').Palette} pal */
export function create(canvas, pal) {
  const pass = glPass(canvas, FRAG, pal);
  if (!pass) return null;
  return {
    resize: pass.resize,
    draw(t, level, still) { still ? pass.draw(40, 0.5) : pass.draw(t, level); },
    destroy: pass.destroy,
  };
}
