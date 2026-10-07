// @ts-check
/** Inline SVG icons: 24px, 1.5px rounded stroke, currentColor (§13.5). No emoji. */

const NS = 'http://www.w3.org/2000/svg';

/** Path data per icon. */
const PATHS = {
  back: ['M15 5l-7 7 7 7'],
  help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6', 'M12 17h.01'],
  body: ['M12 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M5 10h14', 'M12 10v5', 'M9 22l3-7 3 7'],
  place: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-5h4v5'],
  hands: ['M7 12V6.5a1.5 1.5 0 0 1 3 0V11', 'M10 11V5a1.5 1.5 0 0 1 3 0v6', 'M13 11V6a1.5 1.5 0 0 1 3 0v7', 'M16 12.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L4 16.5a1.5 1.5 0 0 1 2.5-1.7L7 15.5'],
  mind: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M8 13c1.2 1.5 2.5 2 4 2s2.8-.5 4-2', 'M9 9h.01', 'M15 9h.01'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  up: ['M6 15l6-6 6 6'],
  down: ['M6 9l6 6 6-6'],
  // Notice marker for sand-colored notices (DD-021: no red; icon + text).
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
  wave: ['M2 14c2.5 0 3.5-6 6-6s3.5 8 6 8 3.5-6 6-6 2 1 2 1'],
};

/**
 * @param {keyof typeof PATHS} name @param {{size?:number, label?:string}} [opts]
 * @returns {SVGSVGElement}
 */
export function icon(name, opts = {}) {
  const size = opts.size || 24;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', `icon icon-${name}`);
  if (opts.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', opts.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  }
  for (const d of PATHS[name] || []) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
