// @ts-check
/**
 * Shallows — sunlight netting on a pool floor (DD-081). WebGL fragment shader.
 * Two animated Voronoi layers; the gap between nearest and second-nearest cell (F2 − F1) gives thin bright
 * ridges. Layers at different scales are warped by a slow swell and multiplied (interference) plus added (glow).
 * Each color channel samples a slightly shifted position (chromatic dispersion). The breath raises a band of
 * brighter water from the bottom on the inhale and lets it sink on the exhale.
 */
import { glPass } from './common.js';

const FRAG = `
precision mediump float;
uniform vec2 u_res; uniform float u_t, u_level;
uniform vec3 u_bg, u_accent, u_sand, u_text;
vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float ridge(vec2 p, float t){
  vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash2(i + g); o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return 1.0 - smoothstep(0.0, 0.24, d2 - d1);
}
float caustic(vec2 p, float t, float L){
  // Two octaves of swell bend the cell edges into curved light lines.
  vec2 w = p + 0.32 * vec2(sin(p.y * 2.3 + t * 0.9) + 0.5 * sin(p.x * 3.7 - t * 1.3), cos(p.x * 2.1 - t * 0.7) + 0.5 * cos(p.y * 3.3 + t * 1.1));
  w += 0.12 * vec2(sin(w.y * 5.1 - t * 1.7), cos(w.x * 4.7 + t * 1.5));
  float a = ridge(w * (2.6 - 0.4 * L), t * 0.8);
  float b = ridge(w * 4.3 + 3.1, -t * 0.6 + 1.7);
  return pow(a, 3.0) * 0.7 + pow(a * b, 1.4) * 1.2 + pow(b, 4.0) * 0.2;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float L = u_level; float t = u_t * 0.35;
  float disp = 0.006 + 0.004 * L;
  vec3 c = vec3(caustic(p + vec2(disp, 0.0), t, L), caustic(p, t, L), caustic(p - vec2(disp, 0.0), t, L));
  float tide = smoothstep(0.15 + 0.55 * L, -0.2 + 0.55 * L, uv.y);
  float light = 0.35 + 0.65 * tide;
  vec3 deep = mix(u_bg, u_accent, 0.10 + 0.14 * tide);
  vec3 col = deep + c * mix(u_accent, u_text, 0.35) * 0.55 * light;
  col += c.g * c.g * u_sand * 0.18 * tide;
  float vig = smoothstep(1.15, 0.35, length(p));
  gl_FragColor = vec4(mix(u_bg, col, vig), 1.0);
}`;

/** @param {HTMLCanvasElement} canvas @param {import('./common.js').Palette} pal */
export function create(canvas, pal) {
  const pass = glPass(canvas, FRAG, pal);
  if (!pass) return null;
  return {
    resize: pass.resize,
    draw(t, level, still) { still ? pass.draw(22, 0.5) : pass.draw(t, level); },
    destroy: pass.destroy,
  };
}
