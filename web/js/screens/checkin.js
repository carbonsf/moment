// @ts-check
/** §6.6 Check-in. During an active moment, the moment wins (E16). */
import { S } from '../strings.js';
import { h, title, button, link } from '../ui/dom.js';
import { app, getActiveMoment, startMoment } from '../state.js';
import { answerCheckin, addQuick, stopForToday } from '../services/checkins.js';
import { requestInGesture } from '../services/push.js';
import { getSupportPerson, supportHref } from '../services/support.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const active = await getActiveMoment();
  if (active) { ctx.go(active.lastRoute || '#/moment', { replace: true }); return; }
  ctx.setBack('#/home');
  const c = await app.db.get('checkins', ctx.params.id);
  if (!c || c.deleted || ['answered', 'cancelled'].includes(c.status)) {
    view.append(title(S.checkin.notFound), button(S.common.home, () => ctx.go('#/home')));
    return;
  }

  /** @param {any} answer */
  const ans = (answer) => answerCheckin(c.id, answer);
  const startAnd = async (/** @type {string} */ hash) => {
    await ans('start');
    await startMoment();
    ctx.go(hash);
  };

  const main = () => {
    view.replaceChildren(
      title(c.kind === 'morning' ? S.checkin.morning : S.checkin.other),
      h('div', { class: 'stack' },
        button(S.checkin.okay, async () => { await ans('okay'); ctx.go('#/home'); }, 'btn btn-secondary-solid'),
        button(S.checkin.rough, () => rough(), 'btn btn-secondary-solid'),
        button(S.checkin.startMoment, () => startAnd('#/moment'), 'btn btn-secondary-solid'),
        button(S.checkin.inTen, () => {
          const p = requestInGesture();
          Promise.all([p, ans('later'), addQuick('plus10', c.momentId || null)]).then(() => ctx.go('#/home'));
        }, 'btn btn-secondary-solid')),
      h('p', { class: 'row small' },
        button(S.checkin.stop, async () => { await ans('stop'); await stopForToday(); ctx.go('#/home'); }, 'link'),
        h('span', { 'aria-hidden': 'true' }, '·'),
        link(S.checkin.settingsLink, '#/settings')));
  };

  const rough = () => {
    const sp = getSupportPerson();
    view.replaceChildren(
      title(S.checkin.roughTitle),
      h('div', { class: 'stack' },
        button(S.checkin.startMoment, () => startAnd('#/moment'), 'btn btn-secondary-solid'),
        button(S.checkin.pickSomething, () => startAnd('#/moment/distract'), 'btn btn-secondary-solid'),
        button(S.checkin.again30, () => {
          const p = requestInGesture();
          Promise.all([p, ans('rough'), addQuick('again30', c.momentId || null)]).then(() => ctx.go('#/home'));
        }, 'btn btn-secondary-solid'),
        sp ? h('a', { class: 'btn btn-secondary-solid', href: supportHref(sp) }, S.checkin.reach(sp.name)) : null));
    /** @type {HTMLElement} */ (view.querySelector('h1')).focus();
  };

  main();
}
