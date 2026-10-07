// @ts-check
/**
 * §6.3.3 Surf (Delay; urge surfing). Wave, guidance lines with inline chips, compact slider,
 * delay timer derived from startedAt, rating prompt, rising and long rules.
 */
import { S } from '../strings.js';
import { h, title, button, reducedMotion } from '../ui/dom.js';
import { createWave } from '../ui/wave.js';
import { createSlider } from '../ui/slider.js';
import { createChips } from '../ui/chips.js';
import { createGuidance } from '../services/guidance.js';
import { soft } from '../services/feedback.js';
import { openHelp } from '../app.js';
import {
  app, bus, getMoment, updateMoment, addRating, isRising, delayTargetMs, lastRatingAt, allMoments,
  RISING_COOLDOWN_MS, LONG_MS, getList,
} from '../state.js';
import { evidence } from '../lib/metrics.js';
import { mmss } from '../lib/time.js';
import { BODY_LOCATIONS, SENSATIONS } from '../content/defaults.js';
import { enterMoment, stepIndicator, validPlans, planThen } from './_shared.js';
import { resolveVisual } from '../ui/breath/index.js';

/** Guidance position per moment, so returning from Doing doesn't restart the lines. */
const guidanceMemo = new Map();

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  let m = await enterMoment(ctx, 'surf');
  if (!m) return;
  const id = m.id;
  const triggers = await getList('triggerTags');
  const options = await getList('distractOptions');
  const ev = evidence(await allMoments());
  const evidenceText = ev ? (ev.h != null ? S.evidence.full(ev.p, ev.h) : S.evidence.peakOnly(ev.p)) : '';

  // --- Wave (§14)
  const canvas = /** @type {HTMLCanvasElement} */ (h('canvas', { class: 'wave-canvas', role: 'img', 'aria-label': S.surf.waveLabel }));
  const waveSummary = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const wave = createWave({
    canvas, plot: true, visual: resolveVisual(app.settings.breathVisual, m),
    getState: () => ({ startedAt: m.startedAt, ratings: m.ratings, delayTargetMs: delayTargetMs(m) }),
  });
  ctx.onCleanup(() => wave.destroy());
  const updateSummary = () => {
    const r = [...m.ratings].sort((a, b) => a.t - b.t);
    waveSummary.textContent = r.length
      ? S.surf.waveSummary(r.length, r[0].v, r[r.length - 1].v, Math.max(...r.map((x) => x.v)))
      : S.surf.waveEmpty;
  };

  // --- Guidance
  const lineEl = h('p', { class: 'guidance-line', 'aria-live': 'polite' });
  const breathEl = h('p', { class: 'breath-cue', hidden: true }, S.surf.breathText);
  const chipsArea = h('div', { class: 'inline-area' });
  const nextBtn = button(S.surf.next, () => guidance.next(), 'btn btn-text btn-small');
  const replayBtn = button(S.surf.replay, () => guidance.replay(), 'btn btn-text btn-small');

  const planCard = h('div', { class: 'card own-words plan-card', hidden: true });
  const showPlan = () => {
    const plans = validPlans(triggers).filter((p) => p.valid && m.triggerTagIds.includes(p.triggerTagId));
    if (!plans.length) { planCard.hidden = true; return; }
    planCard.hidden = false;
    planCard.textContent = S.surf.planCard(planThen(plans[0], options));
  };

  /** @param {string} control */
  const renderControl = (control) => {
    chipsArea.replaceChildren();
    if (control === 'body') {
      chipsArea.append(createChips({
        legend: S.surf.bodyLegend, legendHidden: true, selected: m.bodyLocations,
        options: BODY_LOCATIONS.map((v) => ({ value: v, label: S.body[/** @type {keyof typeof S.body} */ (v)] })),
        onChange: async (sel) => { m = (await updateMoment(id, (x) => { x.bodyLocations = sel; })) || m; },
      }).el);
    } else if (control === 'sensation') {
      chipsArea.append(createChips({
        legend: S.surf.sensationLegend, legendHidden: true, selected: m.sensations,
        options: SENSATIONS.map((v) => ({ value: v, label: S.sensation[/** @type {keyof typeof S.sensation} */ (v)] })),
        onChange: async (sel) => { m = (await updateMoment(id, (x) => { x.sensations = sel; })) || m; },
      }).el);
    } else if (control === 'trigger') {
      chipsArea.append(createChips({
        legend: S.surf.triggerLegend, legendHidden: true, selected: m.triggerTagIds,
        options: triggers.map((t) => ({ value: t.id, label: t.label })),
        onChange: async (sel) => { m = (await updateMoment(id, (x) => { x.triggerTagIds = sel; })) || m; showPlan(); },
      }).el, planCard);
      showPlan();
    }
  };

  const lines = S.surf.guidance.map((text, i) => ({
    text: i === 6 ? evidenceText : text,
    control: ['', 'body', 'sensation', 'trigger', '', '', '', ''][i],
  }));
  const guidance = createGuidance({
    lines,
    loopTo: 4, // line 8 loops to line 5
    skip: (i) => i === 6 && !evidenceText,
    onLine: (line, i) => {
      if (!ratingPrompting) lineEl.textContent = line.text;
      lineLast = line.text;
      breathEl.hidden = !(i === 4 && reducedMotion());
      renderControl(line.control || '');
      guidanceMemo.set(id, i);
    },
  });
  ctx.onCleanup(() => guidance.destroy());
  let lineLast = '';

  // Auto-advance pauses while a control has keyboard/assistive focus (§6.3.3, §15). DD-043
  let focusPaused = false;
  view.addEventListener('focusin', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (!focusPaused && t.matches?.(':focus-visible') && !t.matches('h1')) { focusPaused = true; guidance.pause(); }
  });
  view.addEventListener('focusout', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (focusPaused && !(a && view.contains(a) && a.matches(':focus-visible'))) { focusPaused = false; guidance.resume(); }
    }, 0);
  });

  // --- Slider + rating prompt (optional, prompted every ratingPromptSec, never modal). DD-011
  let ratingPrompting = false;
  const slider = createSlider({
    compact: true,
    value: null,
    onCommit: async (v) => {
      const src = ratingPrompting || timeUp ? 'prompt' : 'manual';
      const prev = m.ratings.length;
      m = (await addRating(id, v, src)) || m;
      if (m.ratings.length > prev) onRated();
    },
  });
  ctx.onCleanup(() => slider.destroy());
  const latest = [...m.ratings].sort((a, b) => a.t - b.t).pop();
  if (latest) slider.setValue(latest.v);

  const setPrompt = (/** @type {boolean} */ on) => {
    if (on === ratingPrompting) return;
    ratingPrompting = on;
    slider.glow(on);
    lineEl.textContent = on ? S.surf.ratePrompt : lineLast;
    if (on) soft();
  };

  // --- Rule cards
  const rulesArea = h('div', { class: 'rules-area' });
  const showRising = () => {
    rulesArea.querySelector('.rising-card')?.remove();
    rulesArea.prepend(h('section', { class: 'card rising-card', 'aria-live': 'polite' },
      h('h2', { class: 'card-title' }, S.surf.risingTitle),
      h('div', { class: 'stack' },
        button(S.surf.risingPlace, () => ctx.go('#/moment/distance'), 'btn btn-secondary-solid'),
        button(S.surf.risingEasy, () => ctx.go('#/moment/distract?low=1'), 'btn btn-secondary-solid'),
        button(S.surf.risingHelp, () => openHelp(), 'btn btn-secondary-solid'))));
  };
  const showLong = () => {
    const card = h('section', { class: 'card long-card', 'aria-live': 'polite' },
      h('p', null, S.surf.longText),
      h('div', { class: 'row' },
        button(S.surf.longKeep, () => card.remove(), 'btn btn-secondary-solid'),
        button(S.surf.longCheck, () => ctx.go('#/moment/close?checkin=1'), 'btn btn-secondary-solid')));
    rulesArea.append(card);
  };

  async function onRated() {
    setPrompt(false);
    updateSummary();
    wave.refresh();
    // Rising rule, at most once per 10 min (DD-012).
    if (isRising(m.ratings) && (!m.risingShownAt || Date.now() - m.risingShownAt >= RISING_COOLDOWN_MS)) {
      m = (await updateMoment(id, (x) => { x.risingShownAt = Date.now(); })) || m;
      showRising();
    }
  }

  // --- Delay timer + actions
  const timerEl = h('p', { class: 'delay-timer', role: 'timer', 'aria-live': 'off' });
  const tryBtn = button(S.surf.trySomething, () => ctx.go('#/moment/distract'), 'btn btn-secondary');
  const talkBtn = button(S.surf.talkItThrough, () => ctx.go('#/moment/decide'), 'btn btn-secondary');
  const easedBtn = button(S.surf.eased, () => ctx.go('#/moment/close'), 'btn btn-secondary');
  const keepBtn = button(S.surf.keepSurfing, async () => {
    m = (await updateMoment(id, (x) => { x.delayExtraMin = (x.delayExtraMin || 0) + (x.delayTargetMin || app.settings.delayMinutes); })) || m;
    timeUp = false;
    applyTimeUp(false);
    tickAll();
  }, 'btn btn-text');
  keepBtn.hidden = true;
  const actions = h('div', { class: 'actions surf-actions' }, tryBtn, talkBtn, easedBtn, keepBtn);
  let timeUp = false;

  /** Promote action buttons at the delay target. @param {boolean} on */
  const applyTimeUp = (on) => {
    for (const b of [tryBtn, talkBtn, easedBtn]) b.className = on ? 'btn btn-primary' : 'btn btn-secondary';
    keepBtn.hidden = !on;
    slider.glow(on || ratingPrompting);
  };

  const tickAll = () => {
    const now = Date.now();
    const elapsed = now - m.startedAt;
    const left = delayTargetMs(m) - elapsed;
    if (left > 0) {
      timerEl.textContent = S.surf.delayLeft(mmss(left));
    } else {
      timerEl.textContent = S.surf.delayUp;
      if (!timeUp) { timeUp = true; applyTimeUp(true); timerEl.setAttribute('aria-live', 'polite'); }
    }
    const last = lastRatingAt(m) ?? m.startedAt;
    if (!ratingPrompting && now - last >= app.settings.ratingPromptSec * 1000) setPrompt(true);
    if (elapsed >= LONG_MS && !m.longShown) {
      m.longShown = true;
      updateMoment(id, (x) => { x.longShown = true; }, { touch: false });
      showLong();
    }
  };
  const iv = setInterval(tickAll, 1000);
  ctx.onCleanup(() => clearInterval(iv));

  // Another tab may write to this moment (E17).
  ctx.onCleanup(bus.on('db', async (e) => {
    if (e.remote && e.store === 'moments') { m = (await getMoment(id)) || m; wave.refresh(); updateSummary(); }
  }));
  ctx.onCleanup(bus.on('settings', () => wave.restart()));

  view.classList.add('view-surf');
  view.append(
    stepIndicator('delay', ctx),
    title(S.steps.delay, 'sr-only'),
    h('div', { class: 'wave-wrap' }, canvas, waveSummary),
    h('div', { class: 'guidance' }, lineEl, breathEl, h('div', { class: 'guidance-controls' }, nextBtn, replayBtn)),
    chipsArea,
    rulesArea,
    slider.el,
    timerEl,
    actions,
  );
  updateSummary();
  tickAll();
  guidance.start(guidanceMemo.get(id) ?? 0);
}
