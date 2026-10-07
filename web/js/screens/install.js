// @ts-check
/** §6.1 install gate for iOS Safari tabs. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { app } from '../state.js';

/** Share glyph (iOS style): box with up arrow. */
function shareGlyph() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  for (const d of ['M12 3v12', 'M8 7l4-4 4 4', 'M8 10H6v11h12V10h-2']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const glyphs = [shareGlyph(), icon('plus'), icon('wave')];
  view.append(
    title(S.install.title),
    h('ol', { class: 'install-steps' }, S.install.steps.map((s, i) => h('li', { class: 'card install-step' }, glyphs[i], h('span', null, s)))),
    h('p', { class: 'muted' }, S.install.note),
    button(S.install.useBrowser, async () => {
      await app.db.setMeta('installDismissedAt', Date.now());
      ctx.go('#/home', { replace: true });
    }, 'btn btn-text'),
  );
}
