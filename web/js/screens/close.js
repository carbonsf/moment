// @ts-check
/**
 * §6.4 Close sequence: rating → outcome → triggers → seeking → summary → check-in offer → finish.
 * Progress is persisted (closeStage) so a killed app resumes here (E1).
 * `?m=<id>` checks out an unfinished moment (Home "Add one?"); `?checkin=1` preselects the offer (Long rule).
 */
import { S } from '../strings.js';
import { FLAGS } from '../config.js';
import { h, title, button } from '../ui/dom.js';
import { createSlider } from '../ui/slider.js';
import { createChips } from '../ui/chips.js';
import { openSheet } from '../ui/sheet.js';
import {
  app, getActiveMoment, getMoment, updateMoment, finishMoment, startMoment, allMoments, lastRatingAt, getList, addStep, setLastRoute,
} from '../state.js';
import { cumulativeCount } from '../lib/metrics.js';
import { MIN } from '../lib/time.js';
import { SEEKING } from '../content/defaults.js';
import { acceptPlan, addQuick, nextCheckin } from '../services/checkins.js';
import { requestInGesture, shouldExplainDenied, markExplained } from '../services/push.js';
import { durationText, clockTime } from './_shared.js';

export const STAGES = ['rating', 'outcome', 'triggers', 'seeking', 'summary', 'offer'];
const RATING_STALE_MS = 2 * MIN;

/**
 * After a check-in tap: request permission inside the gesture, then explain once if push is off (§7.2).
 * Call synchronously from the click handler.
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
  const retro = m.status === 'unfinished'; // DD-048: retro check-out keeps endedAt and skips the check-in offer
  const id = m.id;
  if (!retro) {
    await setLastRoute(id, '#/moment/close');
    m = (await addStep(id, 'close')) || m;
  }
  ctx.setBack(retro ? '#/home' : null);
  const preselect = ctx.query.get('checkin') === '1';
  const triggers = await getList('triggerTags');
  if (m.closeHadTriggers == null) {
    m = (await updateMoment(id, (x) => { x.closeHadTriggers = (x.triggerTagIds || []).length > 0; }, { touch: false })) || m;
  }
  const hadTriggers = !!m.closeHadTriggers;

  /** @param {string} stage */
  const shows = (stage) => {
    switch (stage) {
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

  /** @param {string} stage */
  async function go(stage) {
    m = (await updateMoment(id, (x) => { x.closeStage = stage; }, { touch: !retro })) || m;
    view.replaceChildren();
    const draw = { rating, outcome, triggers: triggersStage, seeking, summary, offer }[stage];
    draw?.();
    /** @type {HTMLElement|null} */ (view.querySelector('h1'))?.focus();
  }

  // DD-055: the close rating is recorded on Next, not on every slider change.
  function rating() {
    const slider = createSlider({ value: null, onCommit: () => {} });
    ctx.onCleanup(() => slider.destroy());
    view.append(title(S.close.rateTitle), slider.el, h('div', { class: 'actions' },
      button(S.close.next, async () => {
        const v = slider.getValue();
        if (v != null) {
          m = (await updateMoment(id, (x) => { x.ratings.push({ t: Math.max(0, Date.now() - x.startedAt), v, src: 'close' }); }, { touch: !retro })) || m;
        }
        next('rating');
      }),
      button(S.close.skip, () => next('rating'), 'btn btn-text')));
  }

  function outcome() {
    /** @param {string} o */
    const set = async (o) => { m = (await updateMoment(id, (x) => { x.outcome = o; }, { touch: !retro })) || m; };
    const more = h('div', { class: 'stack', hidden: true },
      button(S.close.used, async () => {
        await set('used');
        await updateMoment(id, (x) => { x.closeStage = 'summary'; }, { touch: !retro });
        ctx.go(`#/moment/after${retro ? `?m=${id}` : ''}`);
      }, 'btn btn-secondary-solid'),
      button(S.close.stopped, async () => { await set('stopped'); next('outcome'); }, 'btn btn-secondary-solid'),
      button(S.close.private, async () => { await set('private'); next('outcome'); }, 'btn btn-secondary-solid'));
    const moreLink = button(S.close.somethingElse, () => { more.hidden = false; moreLink.hidden = true; /** @type {HTMLElement} */ (more.firstChild).focus(); }, 'link small');
    view.append(title(S.close.outcomeTitle),
      h('div', { class: 'stack' },
        button(S.close.passed, async () => { await set('passed'); next('outcome'); }, 'btn btn-secondary-solid'),
        button(S.close.quieter, async () => { await set('quieter'); next('outcome'); }, 'btn btn-secondary-solid'),
        button(S.close.strong, async () => { await set('strong'); strong(); }, 'btn btn-secondary-solid')),
      h('div', { class: 'more-outcomes' }, moreLink, more));
  }

  function strong() {
    view.replaceChildren(title(S.close.strongTitle), h('div', { class: 'stack' },
      ...(retro ? [] : [button(S.close.anotherRound, async () => {
        await finishMoment(id);
        const n = await startMoment({ previousMomentId: id });
        ctx.go(n.lastRoute || '#/moment');
      }, 'btn btn-primary')]),
      ...(retro || !app.settings.checkinsEnabled ? [] : [button(S.close.checkTen, () => withPermission(() => addQuick('plus10', id), () => next('outcome')), 'btn btn-secondary-solid')]),
      button(S.close.continue, () => next('outcome'), 'btn btn-secondary')));
    /** @type {HTMLElement} */ (view.querySelector('h1')).focus();
  }

  function triggersStage() {
    const chips = createChips({
      legend: S.close.triggersTitle, legendHidden: true, selected: m.triggerTagIds,
      options: triggers.map((t) => ({ value: t.id, label: t.label })),
      onChange: async (sel) => { m = (await updateMoment(id, (x) => { x.triggerTagIds = sel; }, { touch: !retro })) || m; },
    });
    view.append(title(S.close.triggersTitle), chips.el, h('div', { class: 'actions' },
      button(S.close.next, () => next('triggers')),
      button(S.close.skip, () => next('triggers'), 'btn btn-text')));
  }

  // DD-033: seeking question is the shadow-work stub.
  function seeking() {
    view.append(title(S.close.seekingTitle), h('div', { class: 'stack' },
      SEEKING.map((k) => button(S.close.seeking[/** @type {keyof typeof S.close.seeking} */ (k)], async () => {
        m = (await updateMoment(id, (x) => { x.seeking = k; }, { touch: !retro })) || m;
        next('seeking');
      }, ['btn btn-secondary-solid', m.seeking === k && 'is-selected'].filter(Boolean).join(' ')))),
    h('div', { class: 'actions' }, button(S.close.skip, () => next('seeking'), 'btn btn-text')));
  }

  async function summary() {
    const end = retro ? (m.endedAt || m.lastInteractionAt) : Date.now();
    const dur = durationText(end - m.startedAt);
    const r = [...m.ratings].sort((a, b) => a.t - b.t);
    const first = r.length ? r[0].v : null;
    const last = r.length ? r[r.length - 1].v : null;
    const all = await allMoments();
    const n = cumulativeCount(all) + (m.outcome !== 'used' ? 1 : 0);
    view.append(
      title(first != null && last != null && first - last >= 1 ? S.close.summaryDrop(dur, first, last) : S.close.summary(dur), 'screen-title summary-title'),
      h('p', { class: 'cumulative' }, S.home.cumulative(n)),
      h('div', { class: 'actions' }, button(S.close.next, () => next('summary'))));
  }

  async function offer() {
    const nxt = await nextCheckin();
    if (nxt) {
      view.append(title(S.close.activeTitle(clockTime(nxt.dueAt))), h('div', { class: 'stack' },
        button(S.close.alsoTen, () => withPermission(() => addQuick('plus10', id), finish), 'btn btn-secondary-solid'),
        button(S.close.done, finish, 'btn btn-primary')));
      return;
    }
    const yes = button(S.close.yes, () => withPermission(async () => {
      await acceptPlan(id);
      await updateMoment(id, (x) => { x.checkinsAccepted = true; });
    }, finish), 'btn btn-primary');
    if (preselect) { yes.setAttribute('aria-pressed', 'true'); yes.classList.add('is-selected'); }
    view.append(title(S.close.offerTitle), h('div', { class: 'stack' },
      yes,
      // DD-047: "In 10 min" schedules a single check-in, not the whole plan.
      button(S.close.inTen, () => withPermission(() => addQuick('plus10', id), finish), 'btn btn-secondary-solid'),
      button(S.close.noThanks, finish, 'btn btn-secondary')));
    if (preselect) setTimeout(() => yes.focus(), 0);
  }

  const startAt = m.closeStage && STAGES.includes(m.closeStage) ? m.closeStage : STAGES.find(shows) || 'outcome';
  // `go` replaces children; render the first stage synchronously enough for the crossfade.
  await go(startAt);
}
