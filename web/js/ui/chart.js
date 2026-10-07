// @ts-check
/**
 * SVG charts for Look back (§6.7). Every chart is a <figure> with a text <figcaption> summary (§15).
 * Colors come from CSS classes using tokens; no inline styles (CSP). Intensity by position, not color ramp (DD-022).
 */
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

/** @param {string} tag @param {Record<string, string|number>} attrs @param {...Node} kids */
function s(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const k of kids) el.append(k);
  return el;
}

/** @param {string} text @param {Record<string, string|number>} attrs */
function txt(text, attrs) {
  const t = s('text', attrs);
  t.textContent = text;
  return t;
}

/** @param {string} title @param {Node} body @param {string} caption */
export function figure(title, body, caption) {
  return h('section', { class: 'card lb-section' },
    h('h2', { class: 'section-title' }, title),
    h('figure', { class: 'chart' }, body, h('figcaption', { class: 'chart-caption' }, caption)));
}

/**
 * Horizontal bars with labels and numbers (counts or values). Decorative SVG; the list itself carries the data.
 * @param {{label:string, value:number, display?:string}[]} rows
 */
export function barList(rows) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return h('ul', { class: 'bar-list' }, rows.map((r) => {
    const bar = h('span', { class: 'bar-fill' });
    bar.style.setProperty('--w', `${Math.max(2, (Math.abs(r.value) / max) * 100)}%`);
    return h('li', { class: 'bar-row' },
      h('span', { class: 'bar-label' }, r.label),
      h('span', { class: 'bar-track', 'aria-hidden': 'true' }, bar),
      h('span', { class: 'bar-num' }, r.display ?? String(r.value)));
  }));
}

/**
 * Faint curves + bold median, x 0..60 min, y 0..10.
 * @param {{curves:{pts:{m:number,v:number}[]}[], median:{m:number,v:number}[]}} data
 */
export function overlayChart(data) {
  const W = 320, H = 180, L = 24, R = 8, T = 8, B = 22;
  const X = (/** @type {number} */ m) => L + (m / 60) * (W - L - R);
  const Y = (/** @type {number} */ v) => T + (1 - v / 10) * (H - T - B);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-hidden': 'true', preserveAspectRatio: 'xMidYMid meet' });
  for (const g of [0, 5, 10]) {
    svg.append(s('line', { x1: L, x2: W - R, y1: Y(g), y2: Y(g), class: 'grid' }));
    svg.append(txt(String(g), { x: L - 6, y: Y(g) + 4, class: 'axis-label', 'text-anchor': 'end' }));
  }
  for (const m of [0, 15, 30, 45, 60]) svg.append(txt(`${m}`, { x: X(m), y: H - 6, class: 'axis-label', 'text-anchor': 'middle' }));
  const path = (/** @type {{m:number,v:number}[]} */ pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.m).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  for (const c of data.curves) if (c.pts.length > 1) svg.append(s('path', { d: path(c.pts), class: 'curve-faint' }));
  if (data.median.length > 1) svg.append(s('path', { d: path(data.median), class: 'curve-median' }));
  return svg;
}

/**
 * Vertical bars per week.
 * @param {{label:string, value:number}[]} rows
 */
export function columnChart(rows) {
  const W = 320, H = 160, T = 18, B = 26;
  const max = Math.max(1, ...rows.map((r) => r.value));
  const bw = Math.min(36, (W - 16) / Math.max(1, rows.length) - 10);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-hidden': 'true' });
  rows.forEach((r, i) => {
    const slot = (W - 16) / rows.length;
    const x = 8 + slot * i + (slot - bw) / 2;
    const bh = ((H - T - B) * r.value) / max;
    svg.append(s('rect', { x, y: H - B - bh, width: bw, height: Math.max(1, bh), rx: 4, class: 'col' }));
    svg.append(txt(String(r.value), { x: x + bw / 2, y: H - B - bh - 5, class: 'col-num', 'text-anchor': 'middle' }));
    svg.append(txt(r.label, { x: x + bw / 2, y: H - 8, class: 'axis-label', 'text-anchor': 'middle' }));
  });
  return svg;
}

/**
 * 7×4 grid with shading by count and numbers in cells. Rendered as a table (accessible data).
 * @param {number[][]} grid @param {string[]} days @param {string[]} blocks @param {string[]} blockHours
 */
export function heatGrid(grid, days, blocks, blockHours) {
  const max = Math.max(1, ...grid.flat());
  const head = h('tr', null, h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, '')),
    blocks.map((b, i) => h('th', { scope: 'col' }, b, h('span', { class: 'heat-hours' }, blockHours[i]))));
  const body = grid.map((row, d) => h('tr', null, h('th', { scope: 'row' }, days[d]),
    row.map((n) => {
      // Shade steps 0–4 via data attribute (CSS); number always shown.
      const step = n === 0 ? 0 : Math.max(1, Math.ceil((n / max) * 4));
      return h('td', { class: 'heat-cell', dataset: { step: String(step) } }, String(n));
    })));
  return h('table', { class: 'heat' }, h('thead', null, head), h('tbody', null, body));
}

/**
 * Single rating curve for moment detail.
 * @param {{t:number,v:number}[]} ratings @param {number} durationMs
 */
export function momentCurve(ratings, durationMs) {
  const W = 320, H = 150, L = 24, R = 8, T = 8, B = 22;
  const rs = [...ratings].sort((a, b) => a.t - b.t);
  const span = Math.max(durationMs || 0, rs.length ? rs[rs.length - 1].t : 0, 60_000);
  const X = (/** @type {number} */ t) => L + (t / span) * (W - L - R);
  const Y = (/** @type {number} */ v) => T + (1 - v / 10) * (H - T - B);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-hidden': 'true' });
  for (const g of [0, 5, 10]) {
    svg.append(s('line', { x1: L, x2: W - R, y1: Y(g), y2: Y(g), class: 'grid' }));
    svg.append(txt(String(g), { x: L - 6, y: Y(g) + 4, class: 'axis-label', 'text-anchor': 'end' }));
  }
  svg.append(txt('0', { x: L, y: H - 6, class: 'axis-label', 'text-anchor': 'start' }));
  svg.append(txt(`${Math.round(span / 60_000)} min`, { x: W - R, y: H - 6, class: 'axis-label', 'text-anchor': 'end' }));
  if (rs.length > 1) svg.append(s('path', { d: rs.map((r, i) => `${i ? 'L' : 'M'}${X(r.t).toFixed(1)},${Y(r.v).toFixed(1)}`).join(' '), class: 'curve-median' }));
  for (const r of rs) svg.append(s('circle', { cx: X(r.t), cy: Y(r.v), r: 4, class: 'pt' }));
  return svg;
}
