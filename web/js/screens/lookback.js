// @ts-check
/**
 * §6.7 Look back. Sections render only past their thresholds (§10); `used` never appears in aggregates (§10.4, DD-017).
 * Section thresholds beyond §10 are DD-044.
 */
import { S } from '../strings.js';
import { FLAGS } from '../config.js';
import { h, title } from '../ui/dom.js';
import { figure, barList, overlayChart, columnChart, heatGrid } from '../ui/chart.js';
import { app, allMoments, getList } from '../state.js';
import {
  cumulativeCount, evidence, trend, waveOverlay, weeklyEasing, whenGrid, countBy, distractStats, decidePct,
  aggregateMoments, metricsOf,
} from '../lib/metrics.js';
import { deviceTimeZone } from '../lib/time.js';
import { dateTime, durationText } from './_shared.js';

export const MIN_FOR_COUNTS = 3; // DD-044
export const RECENT_N = 20;

/** @param {HTMLElement} view @param {import('../app.js').ScreenCtx} ctx */
export async function render(view, ctx) {
  ctx.setBack('#/home');
  const tz = deviceTimeZone();
  const all = await allMoments();
  const agg = aggregateMoments(all);
  view.append(title(S.lookback.title));
  const sections = [];

  // 1. Summary
  const n = cumulativeCount(all);
  const ev = evidence(all);
  const tr = trend(all);
  if (n >= 1 || ev) {
    const lines = [];
    if (n >= 1) lines.push(h('p', { class: 'cumulative-lg' }, S.home.cumulative(n)));
    if (ev?.h != null) lines.push(h('p', null, S.lookback.typicalEase(ev.h)));
    if (tr) lines.push(h('p', null, tr === 'faster' ? S.trend.faster : tr === 'slower' ? S.trend.slower : S.trend.same));
    sections.push(h('section', { class: 'card lb-section' }, h('h2', { class: 'section-title' }, S.lookback.summary), lines));
  }

  // 2. Wave overlay (≥3 eligible, as for the evidence line)
  const ov = waveOverlay(all);
  if (ov.curves.length >= 3) {
    let peakMin = null;
    if (ov.median.length) peakMin = ov.median.reduce((a, b) => (b.v > a.v ? b : a)).m;
    sections.push(figure(S.lookback.waveTitle, overlayChart(ov), S.lookback.waveCaption(ov.curves.length, peakMin)));
  }

  // 3. Easing over time
  const weeks = weeklyEasing(all, Date.now(), tz);
  if (weeks.length) {
    const rows = weeks.map((w) => ({ label: new Date(`${w.week}T12:00:00`).toLocaleDateString([], { month: 'numeric', day: 'numeric' }), value: w.medianMin }));
    const caption = `${S.lookback.easingCaption(weeks.length)} ${rows.map((r) => `${r.label}: ${S.time.min(r.value)}`).join(', ')}.`;
    sections.push(figure(S.lookback.easingTitle, columnChart(rows), caption));
  }

  // 4. When
  if (agg.length >= MIN_FOR_COUNTS) {
    const g = whenGrid(all, tz);
    let best = { d: 0, b: 0, n: -1 };
    g.forEach((row, d) => row.forEach((c, b) => { if (c > best.n) best = { d, b, n: c }; }));
    sections.push(figure(S.lookback.whenTitle, heatGrid(g, S.lookback.days, S.lookback.blocks, S.lookback.blockHours),
      S.lookback.whenCaption(S.lookback.daysLong[best.d], S.lookback.blocks[best.b], best.n)));
  }

  // 5. Triggers (top 6)
  const tags = await getList('triggerTags', true);
  const trig = countBy(all, (m) => m.triggerTagIds || []).slice(0, 6)
    .map((r) => ({ label: tags.find((t) => t.id === r.key)?.label || '', value: r.n })).filter((r) => r.label);
  if (agg.length >= MIN_FOR_COUNTS && trig.length) {
    sections.push(figure(S.lookback.triggersTitle, barList(trig), S.lookback.countCaption(trig[0].label, trig[0].value)));
  }

  // 6. Body locations
  const body = countBy(all, (m) => m.bodyLocations || []).map((r) => ({ label: S.body[/** @type {keyof typeof S.body} */ (r.key)] || r.key, value: r.n }));
  if (agg.length >= MIN_FOR_COUNTS && body.length) {
    sections.push(figure(S.lookback.bodyTitle, barList(body), S.lookback.countCaption(body[0].label, body[0].value)));
  }

  // 7. What tends to help (n ≥2 uses per option)
  const opts = await getList('distractOptions', true);
  const help = distractStats(all).map((s) => ({ label: opts.find((o) => o.id === s.optionId)?.label || '', value: s.median, display: S.lookback.helpDrop(s.median) })).filter((r) => r.label);
  if (help.length) sections.push(figure(S.lookback.helpTitle, barList(help), S.lookback.helpCaption));

  // 8. Talking it through
  const pct = decidePct(all);
  if (agg.length >= MIN_FOR_COUNTS && pct != null) {
    const thoughts = await getList('permissionThoughts', true);
    const top = countBy(all, (m) => m.decide?.thoughtIds || []).slice(0, 3)
      .map((r) => ({ label: thoughts.find((t) => t.id === r.key)?.thought || '', value: r.n })).filter((r) => r.label);
    sections.push(h('section', { class: 'card lb-section' },
      h('h2', { class: 'section-title' }, S.lookback.decideTitle),
      h('p', null, S.lookback.decidePct(pct)),
      top.length ? barList(top) : null));
  }

  // 9. Seeking (flag + setting)
  if (FLAGS.shadowPrompt && app.settings.shadowPrompt) {
    const seek = countBy(all, (m) => [m.seeking]).map((r) => ({ label: S.close.seeking[/** @type {keyof typeof S.close.seeking} */ (r.key)] || r.key, value: r.n }));
    if (agg.length >= MIN_FOR_COUNTS && seek.length) sections.push(figure(S.lookback.seekingTitle, barList(seek), S.lookback.countCaption(seek[0].label, seek[0].value)));
  }

  // 10. Recent moments (no outcome labels; detail is the only place `used` shows). DD-060
  const recent = [...all].filter((m) => m.status !== 'active').sort((a, b) => b.startedAt - a.startedAt).slice(0, RECENT_N);
  if (sections.length && recent.length) {
    sections.push(h('section', { class: 'card lb-section' },
      h('h2', { class: 'section-title' }, S.lookback.recentTitle),
      h('ul', { class: 'recent-list' }, recent.map((m) => {
        const met = metricsOf(m);
        const dur = (m.endedAt || m.lastInteractionAt || m.startedAt) - m.startedAt;
        return h('li', null, h('a', { class: 'recent-row', href: `#/lookback/${m.id}` },
          h('span', null, dateTime(m.startedAt)),
          h('span', { class: 'muted' }, `${durationText(dur)} · ${met.peak != null ? S.lookback.peak(met.peak) : S.lookback.noPeak}`)));
      }))));
  }

  if (!sections.length) view.append(h('p', { class: 'muted' }, S.lookback.empty));
  else view.append(...sections);
}
