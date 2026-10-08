// @ts-check
/**
 * §6.5 After-using. Reached only via Outcome → Something else → I used. Copy is final.
 * On the tide (DD-089) the glass drains almost empty and goes plain: Glass style forced, no ripple, no breath.
 */
import { S, splitPlaceholder } from '../strings.js';
import { h, title, button } from '../ui/dom.js';
import { getActiveMoment, getMoment, updateMoment, finishMoment } from '../state.js';
import { acceptPlan } from '../services/checkins.js';
import { withPermission } from './close.js';
import { setWaterScreen } from '../ui/tide/water.js';

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  const retroId = ctx.query.get('m');
  const m = retroId ? await getMoment(retroId) : await getActiveMoment();
  if (!m || m.outcome !== 'used') { ctx.go('#/home', { replace: true }); return; }
  setWaterScreen('after');
  const retro = m.status === 'unfinished';
  if (!retro) await updateMoment(m.id, (x) => { x.lastRoute = '#/moment/after'; });
  else await updateMoment(m.id, (x) => { x.closeStage = 'summary'; }, { touch: false });
  const closeHref = `#/moment/close${retro ? `?m=${m.id}` : ''}`;

  const bullets = S.after.bullets.map((b) => {
    const parts = splitPlaceholder(b.text);
    const li = h('li', null);
    parts.forEach((p, i) => {
      li.append(p);
      if (i < parts.length - 1 && b.tel) li.append(h('a', { href: `tel:${b.tel}`, class: 'tel-link' }, b.display));
    });
    if (b.sms) li.append(' ', h('a', { href: `sms:${b.sms}`, class: 'tel-link' }, b.smsLabel));
    return li;
  });

  view.classList.add('view-tide', 'view-after');
  view.append(
    title(S.after.title, 'screen-title tide-title'),
    h('p', { class: 'lead tide-lead' }, S.after.lead),
    h('ul', { class: 'after-list' }, bullets),
    h('div', { class: 'tide-pills tide-pills-stack' },
      button(S.after.checkLater, () => withPermission(async () => {
        await acceptPlan(m.id);
        await updateMoment(m.id, (x) => { x.checkinsAccepted = true; x.closeStage = 'summary'; }, { touch: !retro });
      }, () => ctx.go(closeHref)), 'btn tide-pill tide-pill-strong'),
      button(S.after.home, async () => {
        // DD-049: "Home" from After-using closes the moment.
        await finishMoment(m.id, { retro });
        ctx.go('#/home');
      }, 'btn btn-text')),
  );
}
