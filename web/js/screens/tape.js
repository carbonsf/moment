// @ts-check
/**
 * §6.3.7 Play it forward on the tide (DD-089). The glass fills; prompts 1–3 sit progressively deeper and darker,
 * prompt 4 ("if you ride this out") is above a lowered, brighter waterline. Notes stored only if written (DD-050).
 */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { updateMoment } from '../state.js';
import { LIMITS } from '../content/defaults.js';
import { enterMoment, stepIndicator } from './_shared.js';
import { setWaterScreen, setWaterLevel, setWaterDim } from '../ui/tide/water.js';

const DEPTH = [0, 1, 2, 3]; // .tide-tape-step-N sets the prompt's vertical position
const DIM = [0, 0.15, 0.32, 0];
/** Step shown last, so the next prompt starts there and moves to its own depth over 1.2 s (each step is its own route). */
let lastStep = /** @type {number|null} */ (null);

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const m = await enterMoment(ctx, 'decide');
  if (!m) return;
  const n = S.tape.screens.length;
  const i = Math.min(n - 1, Math.max(0, parseInt(ctx.query.get('i') || '0', 10) || 0));
  setWaterScreen('tape');
  setWaterDim(DIM[i]);
  if (i === n - 1) setWaterLevel(0.5);
  ctx.setBack(i > 0 ? `#/moment/decide/tape?i=${i - 1}` : '#/moment/decide');
  await updateMoment(m.id, (x) => { x.decide.tapeViewed = true; });

  const existing = (m.decide.tapeNotes || [])[i] || '';
  const area = /** @type {HTMLTextAreaElement} */ (h('textarea', { class: 'input textarea tide-note', id: 'tape-note', maxLength: LIMITS.tapeNote, rows: 4 }));
  area.value = existing;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let t = null;
  const save = () => updateMoment(m.id, (x) => {
    const notes = x.decide.tapeNotes || [];
    notes[i] = area.value.trim();
    x.decide.tapeNotes = notes.some(Boolean) ? Array.from({ length: n }, (_, k) => notes[k] || '') : null;
  });
  area.addEventListener('input', () => { if (t) clearTimeout(t); t = setTimeout(save, 500); });
  ctx.onCleanup(() => { if (t) { clearTimeout(t); save(); } });

  const details = h('details', { class: 'collapsible', open: !!existing },
    h('summary', null, S.tape.write),
    h('label', { for: 'tape-note', class: 'sr-only' }, S.tape.noteLabel), area);

  const from = lastStep != null && lastStep !== i ? DEPTH[lastStep] : DEPTH[i];
  lastStep = i;
  const tape = h('div', { class: `tide-tape tide-tape-step-${from}` }, title(S.tape.screens[i], 'screen-title tide-title tide-tape-prompt'), details);
  if (from !== DEPTH[i]) {
    // Once the view is in the document, move to this prompt's depth (the CSS transition does the rest).
    const move = setTimeout(() => { void tape.offsetWidth; tape.className = `tide-tape tide-tape-step-${DEPTH[i]}`; }, 40);
    ctx.onCleanup(() => clearTimeout(move));
  }

  view.classList.add('view-tide');
  view.append(
    stepIndicator('decide', ctx),
    h('p', { class: 'muted small tide-progress' }, S.tape.progress(i + 1, n)),
    tape,
    h('div', { class: 'tide-pills tide-pills-1' },
      i < n - 1
        ? button(S.tape.next, () => ctx.go(`#/moment/decide/tape?i=${i + 1}`), 'btn tide-pill tide-pill-strong')
        : button(S.tape.finish, () => ctx.go('#/moment/decide'), 'btn tide-pill tide-pill-strong')),
  );
}
