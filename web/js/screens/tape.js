// @ts-check
/** §6.3.7 Play it forward: four screens, optional collapsed notes stored only if written. */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { updateMoment } from '../state.js';
import { LIMITS } from '../content/defaults.js';
import { enterMoment, stepIndicator } from './_shared.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'decide');
  if (!m) return;
  const n = S.tape.screens.length;
  const i = Math.min(n - 1, Math.max(0, parseInt(ctx.query.get('i') || '0', 10) || 0));
  ctx.setBack(i > 0 ? `#/moment/decide/tape?i=${i - 1}` : '#/moment/decide');
  await updateMoment(m.id, (x) => { x.decide.tapeViewed = true; });

  const existing = (m.decide.tapeNotes || [])[i] || '';
  const area = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input textarea', id: 'tape-note', maxLength: LIMITS.tapeNote, rows: 4 }));
  area.value = existing;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let t = null;
  const save = () => updateMoment(m.id, (x) => {
    const notes = x.decide.tapeNotes || [];
    notes[i] = area.value.trim();
    // Stored only if anything is written; fixed 4-slot array. DD-050
    x.decide.tapeNotes = notes.some(Boolean) ? Array.from({ length: n }, (_, k) => notes[k] || '') : null;
  });
  area.addEventListener('input', () => { if (t) clearTimeout(t); t = setTimeout(save, 500); });
  ctx.onCleanup(() => { if (t) { clearTimeout(t); save(); } });

  const details = h('details', { class: 'collapsible', open: !!existing },
    h('summary', null, S.tape.write),
    h('label', { for: 'tape-note', class: 'sr-only' }, S.tape.noteLabel), area);

  view.append(
    stepIndicator('decide', ctx),
    h('p', { class: 'muted small' }, S.tape.progress(i + 1, n)),
    title(S.tape.screens[i]),
    details,
    h('div', { class: 'actions' },
      i < n - 1
        ? button(S.tape.next, () => ctx.go(`#/moment/decide/tape?i=${i + 1}`))
        : button(S.tape.finish, () => ctx.go('#/moment/decide'))),
  );
}
