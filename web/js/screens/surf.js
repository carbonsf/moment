// @ts-check
/**
 * §6.3.3 Surf (Delay; urge surfing) on the tide (DD-083). The water level is the latest rating and breathes;
 * drag the waterline to rate (replaces the compact slider); each rating leaves a tide mark.
 * Guidance lines, inline chips, delay timer from startedAt, rating prompt, rising and long rules are unchanged.
 */
import { S } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { createChips } from '../ui/chips.js';
import { createGuidance } from '../services/guidance.js';
import { soft } from '../services/feedback.js';
import { openHelp } from '../app.js';
import {
  app, bus, getMoment, updateMoment, addRating, isRising, delayTargetMs, lastRatingAt, allMoments, latestRating,
  RISING_COOLDOWN_MS, LONG_MS, getList,
} from '../state.js';
import { evidence } from '../lib/metrics.js';
import { mmss, MIN } from '../lib/time.js';
import { BODY_LOCATIONS, SENSATIONS } from '../content/defaults.js';
import { enterMoment, stepIndicator, validPlans, planThen } from './_shared.js';
import { setWaterScreen, setWaterValue, enableGrab, ride, createTideMarks, breathPhase } from '../ui/tide/water.js';

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
  setWaterScreen('surf', { value: latestRating(m) });

  // --- Tide marks + reading on the surface
  const marks = createTideMarks();
  const span = () => Math.max(delayTargetMs(m), Date.now() - m.startedAt + 2 * MIN);
  const drawMarks = () => marks.update(m.ratings, span());
  const onResize = () => drawMarks();
  window.addEventListener('resize', onResize);
  ctx.onCleanup(() => window.removeEventListener('resize', onResize));

  const num = h('span', { class: 'tide-num tide-num-sm' });
  const anc = h('span', { class: 'tide-anchor' });
  const reading = h('div', { class: 'tide-reading tide-reading-sm' }, num, anc);
  ctx.onCleanup(ride(reading, { offset: 8, x: 0.15 }));
  /** @param {number|null} v */
  const showReading = (v) => { num.textContent = v == null ? '–' : String(v); anc.textContent = v == null ? S.tide.rateHint : S.slider.anchor(v); };

  const cue = h('span', { class: 'tide-cue', 'aria-hidden': 'true' });
  const cueRow = h('div', { class: 'tide-cue-row' }, cue);
  ctx.onCleanup(ride(cueRow, { offset: -34, x: 0.8 }));
  let cueRaf = requestAnimationFrame(function loop() {
    const p = breathPhase();
    cue.textContent = p.inhale ? S.tide.in : S.tide.out;
    cue.style.opacity = (Math.sin(Math.PI * Math.min(1, p.phase)) * 0.9).toFixed(3);
    cueRaf = requestAnimationFrame(loop);
  });
  ctx.onCleanup(() => cancelAnimationFrame(cueRaf));

  const waveSummary = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const updateSummary = () => {
    const r = [...m.ratings].sort((a, b) => a.t - b.t);
    waveSummary.textContent = r.length
      ? S.surf.waveSummary(r.length, r[0].v, r[r.length - 1].v, Math.max(...r.map((x) => x.v)))
      : S.surf.waveEmpty;
  };

  // --- Guidance
  const lineEl = h('p', { class: 'guidance-line tide-line', 'aria-live': 'polite' });
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

  let lineLast = '';
  const setLine = (/** @type {string} */ text) => {
    lineEl.classList.add('is-changing');
    setTimeout(() => { lineEl.textContent = text; lineEl.classList.remove('is-changing'); }, 300);
  };
  const lines = S.surf.guidance.map((text, i) => ({
    text: i === 6 ? evidenceText : text,
    control: ['', 'body', 'sensation', 'trigger', '', '', '', ''][i],
  }));
  const guidance = createGuidance({
    lines,
    loopTo: 4,
    skip: (i) => i === 6 && !evidenceText,
    onLine: (line, i) => {
      if (!ratingPrompting) setLine(line.text);
      lineLast = line.text;
      breathEl.hidden = !(i === 4 && document.documentElement.dataset.motion === 'reduce');
      renderControl(line.control || '');
      guidanceMemo.set(id, i);
    },
  });
  ctx.onCleanup(() => guidance.destroy());

  // Auto-advance pauses while a control has keyboard/assistive focus. DD-043
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

  // --- Rating by the waterline + prompt (never modal). DD-011
  let ratingPrompting = false;
  const setPrompt = (/** @type {boolean} */ on) => {
    if (on === ratingPrompting) return;
    ratingPrompting = on;
    reading.classList.toggle('is-prompting', on || timeUp);
    setLine(on ? S.surf.ratePrompt : lineLast);
    if (on) soft();
  };
  ctx.onCleanup(enableGrab({
    onInput: (v) => showReading(v),
    onCommit: async (v) => {
      const src = ratingPrompting || timeUp ? 'prompt' : 'manual';
      const prev = m.ratings.length;
      m = (await addRating(id, v, src)) || m;
      setWaterValue(v);
      if (m.ratings.length > prev) onRated();
    },
  }));

  // --- Rule cards
  const rulesArea = h('div', { class: 'rules-area' });
  const showRising = () => {
    rulesArea.querySelector('.rising-card')?.remove();
    rulesArea.prepend(h('section', { class: 'card tide-card rising-card', 'aria-live': 'polite' },
      h('h2', { class: 'card-title' }, S.surf.risingTitle),
      h('div', { class: 'stack' },
        button(S.surf.risingPlace, () => ctx.go('#/moment/distance'), 'btn tide-pill'),
        button(S.surf.risingEasy, () => ctx.go('#/moment/distract?low=1'), 'btn tide-pill'),
        button(S.surf.risingHelp, () => openHelp(), 'btn tide-pill'))));
  };
  const showLong = () => {
    const card = h('section', { class: 'card tide-card long-card', 'aria-live': 'polite' },
      h('p', null, S.surf.longText),
      h('div', { class: 'row' },
        button(S.surf.longKeep, () => card.remove(), 'btn tide-pill'),
        button(S.surf.longCheck, () => ctx.go('#/moment/close?checkin=1'), 'btn tide-pill')));
    rulesArea.append(card);
  };

  async function onRated() {
    setPrompt(false);
    showReading(latestRating(m));
    updateSummary();
    drawMarks();
    if (isRising(m.ratings) && (!m.risingShownAt || Date.now() - m.risingShownAt >= RISING_COOLDOWN_MS)) {
      m = (await updateMoment(id, (x) => { x.risingShownAt = Date.now(); })) || m;
      showRising();
    }
  }

  // --- Delay timer (rides below the surface) + actions (frosted pills that float up at the delay target)
  const timerPre = h('span', null, S.steps.delay);
  const timerNum = h('span', { class: 'tide-timer-num' });
  const timerPost = h('span');
  const timerEl = h('p', { class: 'delay-timer tide-timer', role: 'timer', 'aria-live': 'off' }, timerPre, timerNum, timerPost);
  ctx.onCleanup(ride(timerEl, { offset: 84 }));
  const tryBtn = button(S.surf.trySomething, () => ctx.go('#/moment/distract'), 'btn tide-pill');
  const talkBtn = button(S.surf.talkItThrough, () => ctx.go('#/moment/decide'), 'btn tide-pill');
  const easedBtn = button(S.surf.eased, () => ctx.go('#/moment/close'), 'btn tide-pill');
  const keepBtn = button(S.surf.keepSurfing, async () => {
    m = (await updateMoment(id, (x) => { x.delayExtraMin = (x.delayExtraMin || 0) + (x.delayTargetMin || app.settings.delayMinutes); })) || m;
    timeUp = false;
    applyTimeUp(false);
    tickAll();
  }, 'btn btn-text');
  keepBtn.hidden = true;
  const actions = h('div', { class: 'tide-pills tide-pills-3' }, tryBtn, talkBtn, easedBtn);
  const dock = h('div', { class: 'tide-dock' }, actions, keepBtn);
  let timeUp = false;

  /** @param {boolean} on */
  const applyTimeUp = (on) => {
    dock.classList.toggle('is-raised', on);
    keepBtn.hidden = !on;
    reading.classList.toggle('is-prompting', on || ratingPrompting);
  };

  const tickAll = () => {
    const now = Date.now();
    const elapsed = now - m.startedAt;
    const left = delayTargetMs(m) - elapsed;
    if (left > 0) {
      timerPre.hidden = false;
      timerNum.textContent = mmss(left);
      timerPost.textContent = S.tide.left;
    } else {
      timerPre.hidden = true;
      timerNum.textContent = '';
      timerPost.textContent = S.surf.delayUp;
      if (!timeUp) { timeUp = true; applyTimeUp(true); timerEl.setAttribute('aria-live', 'polite'); }
    }
    const last = lastRatingAt(m) ?? m.startedAt;
    if (!ratingPrompting && now - last >= app.settings.ratingPromptSec * 1000) setPrompt(true);
    if (elapsed >= LONG_MS && !m.longShown) {
      m.longShown = true;
      updateMoment(id, (x) => { x.longShown = true; }, { touch: false });
      showLong();
    }
    if (now % 15000 < 1000) drawMarks(); // the time axis stretches slowly
  };
  const iv = setInterval(tickAll, 1000);
  ctx.onCleanup(() => clearInterval(iv));

  ctx.onCleanup(bus.on('db', async (e) => {
    if (e.remote && e.store === 'moments') { m = (await getMoment(id)) || m; drawMarks(); updateSummary(); }
  }));

  view.classList.add('view-tide', 'view-surf');
  view.append(
    marks.el,
    stepIndicator('delay', ctx),
    title(S.steps.delay, 'sr-only'),
    h('div', { class: 'guidance tide-guidance' }, lineEl, breathEl, h('div', { class: 'guidance-controls' }, nextBtn, replayBtn)),
    chipsArea,
    rulesArea,
    reading,
    cueRow,
    timerEl,
    waveSummary,
    dock,
  );
  showReading(latestRating(m));
  drawMarks();
  updateSummary();
  tickAll();
  guidance.start(guidanceMemo.get(id) ?? 0);
}
