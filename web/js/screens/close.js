// @ts-check
/**
 * §6.4 Close sequence on the tide (DD-089): rating → outcome → triggers → seeking → summary → check-in offer → finish.
 * Rating is the waterline (recorded on Next, DD-055). Outcome choices float on the surface. The summary keeps the
 * whole moment's tide marks on the glass. Progress is persisted (closeStage) so a killed app resumes here (E1).
 * `?m=<id>` checks out an unfinished moment; `?checkin=1` preselects the offer (Long rule).
 */
import { S } from '../strings.js';
import { FLAGS } from '../config.js';
import { h, title, button } from '../ui/dom.js';
import { createChips } from '../ui/chips.js';
import { openSheet } from '../ui/sheet.js';
import {
  app, getActiveMoment, getMoment, updateMoment, finishMoment, startMoment, allMoments, lastRatingAt, getList, addStep, setLastRoute,
  latestRating, delayTargetMs,
} from '../state.js';
import { cumulativeCount } from '../lib/metrics.js';
import { MIN } from '../lib/time.js';
import { SEEKING } from '../content/defaults.js';
import { acceptPlan, addQuick, nextCheckin } from '../services/checkins.js';
import { requestInGesture, shouldExplainDenied, markExplained } from '../services/push.js';
import { durationText, clockTime } from './_shared.js';
import { setWaterScreen, setWaterValue, enableGrab, ride, createTideMarks } from '../ui/tide/water.js';

export const STAGES = ['rating', 'outcome', 'triggers', 'seeking', 'summary', 'offer'];
const RATING_STALE_MS = 2 * MIN;
const STAGE_FADE_MS = 380;

/**
 * After a check-in tap: request permission inside the gesture, then explain once if push is off (§7.2).
 * @param {() => Promise<void>} work @param {() => void} done
 */
export function withPermission(work, done) {
  const perm = requestInGesture();
  Promise.all([perm, work()]).then(async ([st]) => {
    if (st !== 'granted' && shouldExplainDenied()) {
      await markExplained();
      const close = openSheet({
        title: S.notif.deniedTitle,
        content: [button(S.notif.ok, () => close(), 'btn btn-primary')],
        onClose: done,
      });
    } else {
      done();
    }
  });
}

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const retroId = ctx.query.get('m');
  let m = retroId ? await getMoment(retroId) : await getActiveMoment();
  if (!m || (m.status !== 'active' && m.status !== 'unfinished')) { ctx.go('#/home', { replace: true }); return; }
  const retro = m.status === 'unfinished'; // DD-048
  const id = m.id;
  if (!retro) {
    await setLastRoute(id, '#/moment/close');
    m = (await addStep(id, 'close')) || m;
  }
  ctx.setBack(retro ? '#/home' : null);
  setWaterScreen('close', { value: latestRating(m) });
  const preselect = ctx.query.get('checkin') === '1';
  const triggers = await getList('triggerTags');
  if (m.closeHadTriggers == null) {
    m = (await updateMoment(id, (x) => { x.closeHadTriggers = (x.triggerTagIds || []).length > 0; }, { touch: false })) || m;
  }
  const hadTriggers = !!m.closeHadTriggers;
  view.classList.add('view-tide', 'view-close');
  const stage = h('div', { class: 'tide-stage' });
  view.append(stage);

  /** Per-stage cleanups (riders, grab), run when the stage changes. @type {(() => void)[]} */
  let stageOff = [];
  const clearStage = () => { stageOff.splice(0).forEach((f) => f()); };
  ctx.onCleanup(clearStage);

  /** @param {string} st */
  const shows = (st) => {
    switch (st) {
      case 'rating': { const at = lastRatingAt(m); return at == null || Date.now() - at > RATING_STALE_MS; }
      case 'triggers': return !hadTriggers;
      case 'seeking': return !!app.settings.shadowPrompt && FLAGS.shadowPrompt;
      case 'offer': return !retro && !!app.settings.checkinsEnabled;
      default: return true;
    }
  };

  const finish = async () => {
    await finishMoment(id, { retro });
    ctx.go('#/home');
  };

  /** @param {string} from */
  const next = (from) => {
    for (let i = STAGES.indexOf(from) + 1; i < STAGES.length; i++) if (shows(STAGES[i])) return go(STAGES[i]);
    return finish();
  };

  /** @param {string} st @param {boolean} [first] */
  async function go(st, first = false) {
    m = (await updateMoment(id, (x) => { x.closeStage = st; }, { touch: !retro })) || m;
    const swapIn = () => {
      clearStage();
      stage.replaceChildren();
      const draw = { rating, outcome, triggers: triggersStage, seeking, summary, offer }[st];
      draw?.();
      stage.classList.remove('is-changing');
      /** @type {HTMLElement|null} */ (stage.querySelector('h1'))?.focus();
    };
    if (first || document.documentElement.dataset.motion === 'reduce') return swapIn();
    stage.classList.add('is-changing');
    setTimeout(swapIn, STAGE_FADE_MS);
  }

  // DD-055: the close rating is recorded on Next, not on every drag.
  function rating() {
    let v = /** @type {number|null} */ (null);
    const num = h('span', { class: 'tide-num tide-num-md' });
    const anc = h('span', { class: 'tide-anchor' });
    const reading = h('div', { class: 'tide-reading is-empty', 'aria-live': 'polite' }, num, anc);
    const handle = h('div', { class: 'tide-handle-row' }, h('span', { class: 'tide-handle', 'aria-hidden': 'true' }));
    stageOff.push(ride(reading, { offset: -150, x: 0.2 }), ride(handle, { offset: -11, x: 0.83 }));
    stageOff.push(enableGrab({
      onInput: (nv) => { reading.classList.remove('is-empty'); num.textContent = String(nv); anc.textContent = S.slider.anchor(nv); },
      onCommit: (nv) => { v = nv; },
    }));
    stage.append(title(S.close.rateTitle, 'screen-title tide-title'), reading, handle, h('div', { class: 'tide-pills tide-pills-next' },
      button(S.close.next, async () => {
        if (v != null) {
          const val = v;
          m = (await updateMoment(id, (x) => { x.ratings.push({ t: Math.max(0, Date.now() - x.startedAt), v: val, src: 'close' }); }, { touch: !retro })) || m;
          setWaterValue(val);
        }
        next('rating');
      }, 'btn tide-pill tide-pill-strong'),
      button(S.close.skip, () => next('rating'), 'btn btn-text')));
  }

  function outcome() {
    /** @param {string} o */
    const set = async (o) => { m = (await updateMoment(id, (x) => { x.outcome = o; }, { touch: !retro })) || m; };
    const main = h('div', { class: 'tide-float' },
      button(S.close.passed, async () => { await set('passed'); next('outcome'); }, 'btn tide-pill tide-pill-float'),
      button(S.close.quieter, async () => { await set('quieter'); next('outcome'); }, 'btn tide-pill tide-pill-float'),
      button(S.close.strong, async () => { await set('strong'); strong(); }, 'btn tide-pill tide-pill-float'));
    const more = h('div', { class: 'tide-float tide-float-more' },
      button(S.close.used, async () => {
        await set('used');
        await updateMoment(id, (x) => { x.closeStage = 'summary'; }, { touch: !retro });
        ctx.go(`#/moment/after${retro ? `?m=${id}` : ''}`);
      }, 'btn tide-pill tide-pill-quiet'),
      button(S.close.stopped, async () => { await set('stopped'); next('outcome'); }, 'btn tide-pill tide-pill-quiet'),
      button(S.close.private, async () => { await set('private'); next('outcome'); }, 'btn tide-pill tide-pill-quiet'));
    const moreLink = button(S.close.somethingElse, () => { more.classList.add('is-open'); moreLink.hidden = true; /** @type {HTMLElement} */ (more.firstChild).focus(); }, 'link small tide-else');
    const below = h('div', { class: 'tide-below' }, moreLink, more);
    stageOff.push(ride(main, { offset: -74 }), ride(below, { offset: 36 }));
    stage.append(title(S.close.outcomeTitle, 'screen-title tide-title'), main, below);
  }

  function strong() {
    clearStage();
    stage.replaceChildren(title(S.close.strongTitle, 'screen-title tide-title'), h('div', { class: 'tide-pills tide-pills-stack' },
      ...(retro ? [] : [button(S.close.anotherRound, async () => {
        await finishMoment(id);
        const n = await startMoment({ previousMomentId: id });
        ctx.go(n.lastRoute || '#/moment');
      }, 'btn tide-pill tide-pill-strong')]),
      ...(retro || !app.settings.checkinsEnabled ? [] : [button(S.close.checkTen, () => withPermission(() => addQuick('plus10', id), () => next('outcome')), 'btn tide-pill')]),
      button(S.close.continue, () => next('outcome'), 'btn btn-text')));
    /** @type {HTMLElement} */ (stage.querySelector('h1')).focus();
  }

  function triggersStage() {
    const chips = createChips({
      legend: S.close.triggersTitle, legendHidden: true, selected: m.triggerTagIds,
      options: triggers.map((t) => ({ value: t.id, label: t.label })),
      onChange: async (sel) => { m = (await updateMoment(id, (x) => { x.triggerTagIds = sel; }, { touch: !retro })) || m; },
    });
    chips.el.classList.add('tide-chips');
    stage.append(title(S.close.triggersTitle, 'screen-title tide-title'), chips.el, h('div', { class: 'tide-pills tide-pills-next' },
      button(S.close.next, () => next('triggers'), 'btn tide-pill tide-pill-strong'),
      button(S.close.skip, () => next('triggers'), 'btn btn-text')));
  }

  // DD-033: seeking question is the shadow-work stub.
  function seeking() {
    stage.append(title(S.close.seekingTitle, 'screen-title tide-title'), h('div', { class: 'tide-grid-2' },
      SEEKING.map((k) => button(S.close.seeking[/** @type {keyof typeof S.close.seeking} */ (k)], async () => {
        m = (await updateMoment(id, (x) => { x.seeking = k; }, { touch: !retro })) || m;
        next('seeking');
      }, ['btn tide-pill tide-pill-tile', m.seeking === k && 'is-selected'].filter(Boolean).join(' ')))),
    h('div', { class: 'tide-foot' }, button(S.close.skip, () => next('seeking'), 'btn btn-text')));
  }

  async function summary() {
    const end = retro ? (m.endedAt || m.lastInteractionAt) : Date.now();
    const dur = durationText(end - m.startedAt);
    const r = [...m.ratings].sort((a, b) => a.t - b.t);
    const first = r.length ? r[0].v : null;
    const last = r.length ? r[r.length - 1].v : null;
    if (last != null) setWaterValue(last);
    const all = await allMoments();
    const n = cumulativeCount(all) + (m.outcome !== 'used' ? 1 : 0);
    const marks = createTideMarks();
    marks.el.classList.add('tide-marks-strong');
    marks.update(m.ratings, Math.max(delayTargetMs(m), end - m.startedAt));
    stage.append(
      marks.el,
      title(first != null && last != null && first - last >= 1 ? S.close.summaryDrop(dur, first, last) : S.close.summary(dur), 'screen-title tide-title summary-title'),
      h('p', { class: 'cumulative' }, S.home.cumulative(n)),
      h('div', { class: 'tide-pills tide-pills-1' }, button(S.close.next, () => next('summary'), 'btn tide-pill tide-pill-strong')));
  }

  async function offer() {
    const nxt = await nextCheckin();
    if (nxt) {
      stage.append(title(S.close.activeTitle(clockTime(nxt.dueAt)), 'screen-title tide-title'), h('div', { class: 'tide-pills tide-pills-stack' },
        button(S.close.alsoTen, () => withPermission(() => addQuick('plus10', id), finish), 'btn tide-pill'),
        button(S.close.done, finish, 'btn tide-pill tide-pill-strong')));
      return;
    }
    const yes = button(S.close.yes, () => withPermission(async () => {
      await acceptPlan(id);
      await updateMoment(id, (x) => { x.checkinsAccepted = true; });
    }, finish), 'btn tide-pill tide-pill-strong');
    if (preselect) { yes.setAttribute('aria-pressed', 'true'); yes.classList.add('is-selected'); }
    stage.append(title(S.close.offerTitle, 'screen-title tide-title'), h('div', { class: 'tide-pills tide-pills-stack' },
      yes,
      // DD-047: "In 10 min" schedules a single check-in, not the whole plan.
      button(S.close.inTen, () => withPermission(() => addQuick('plus10', id), finish), 'btn tide-pill'),
      button(S.close.noThanks, finish, 'btn btn-text')));
    if (preselect) setTimeout(() => yes.focus(), 0);
  }

  const startAt = m.closeStage && STAGES.includes(m.closeStage) ? m.closeStage : STAGES.find(shows) || 'outcome';
  await go(startAt, true);
}
