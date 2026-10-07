import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  median, computeMomentMetrics, isEligible, cumulativeCount, evidence, trend, weeklyEasing,
  distractEffect, distractStats, countBy, whenGrid, decidePct, waveOverlay, aggregateMoments, timingMoments,
} from '../web/js/lib/metrics.js';
import { atLocal } from '../web/js/lib/time.js';

const MIN = 60_000;
let seq = 0;
/** Build a closed moment from [minute, value] pairs. */
function mk(pairs, extra = {}) {
  const startedAt = extra.startedAt ?? Date.UTC(2026, 0, 5, 12) + seq++ * 3600_000;
  const m = {
    id: `m${seq}`, startedAt, endedAt: startedAt + 30 * MIN, status: 'closed', outcome: 'passed',
    ratings: pairs.map(([t, v]) => ({ t: t * MIN, v, src: 'manual' })), steps: [], distractUses: [],
    triggerTagIds: [], bodyLocations: [], ...extra,
  };
  if (extra.startedAt != null && extra.endedAt == null) m.endedAt = extra.startedAt + 30 * MIN;
  return m;
}

test('median: odd, even, empty', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

test('per-moment metrics: peak, timeToPeak, timeToHalf, drop, duration', () => {
  const m = mk([[0, 4], [2, 8], [4, 8], [6, 5], [8, 4], [10, 2]]);
  const r = computeMomentMetrics(m);
  assert.equal(r.peak, 8);
  assert.equal(r.timeToPeakMs, 2 * MIN); // first rating equal to the peak
  assert.equal(r.timeToHalfMs, 6 * MIN); // first after peak with v ≤ 4 is t=8; 8−2
  assert.equal(r.drop, 2);
  assert.equal(r.durationMs, 30 * MIN);
});

test('ratings are sorted by t before computing', () => {
  const m = mk([[4, 2], [0, 6], [2, 7]]);
  const r = computeMomentMetrics(m);
  assert.equal(r.peak, 7);
  assert.equal(r.timeToPeakMs, 2 * MIN);
  assert.equal(r.drop, 4);
});

test('timeToHalf null when peak ≤ 2 or never halves', () => {
  assert.equal(computeMomentMetrics(mk([[0, 2], [1, 1], [2, 0]])).timeToHalfMs, null);
  assert.equal(computeMomentMetrics(mk([[0, 6], [1, 8], [2, 7]])).timeToHalfMs, null);
  // boundary: exactly half counts
  assert.equal(computeMomentMetrics(mk([[0, 6], [3, 3]])).timeToHalfMs, 3 * MIN);
});

test('no ratings: metrics null, duration kept', () => {
  const r = computeMomentMetrics(mk([]));
  assert.equal(r.peak, null);
  assert.equal(r.drop, null);
  assert.equal(r.timeToHalfMs, null);
  assert.equal(r.durationMs, 30 * MIN);
});

test('delayMs: first distract or decide step, else close', () => {
  const s = Date.UTC(2026, 0, 1);
  const a = mk([], { startedAt: s, steps: [{ step: 'surf', at: s + MIN }, { step: 'decide', at: s + 9 * MIN }, { step: 'distract', at: s + 7 * MIN }] });
  assert.equal(computeMomentMetrics(a).delayMs, 7 * MIN);
  const b = mk([], { startedAt: s, steps: [{ step: 'surf', at: s + MIN }] });
  assert.equal(computeMomentMetrics(b).delayMs, 30 * MIN);
});

test('eligibility: ≥3 ratings and peak ≥3', () => {
  assert.equal(isEligible(mk([[0, 3], [1, 2], [2, 1]])), true);
  assert.equal(isEligible(mk([[0, 2], [1, 2], [2, 1]])), false);
  assert.equal(isEligible(mk([[0, 9], [1, 2]])), false);
});

test('cumulative count: closed only, never used, ignores deleted/unfinished/active', () => {
  const ms = [
    mk([[0, 5]]), mk([[0, 5]], { outcome: 'used' }), mk([], { status: 'unfinished' }),
    mk([], { status: 'active' }), mk([], { deleted: true }), mk([], { outcome: 'private' }),
  ];
  assert.equal(cumulativeCount(ms), 2);
});

test('evidence: needs ≥3 eligible among last 10; rounding, minimum 1', () => {
  seq = 0;
  const two = [mk([[0, 5], [3, 8], [10, 4]]), mk([[0, 5], [3, 8], [10, 4]])];
  assert.equal(evidence(two), null);
  const three = [...two, mk([[0, 5], [0.2, 8], [0.4, 3]])];
  // timeToPeak: 3,3,0.2 min → median 3; timeToHalf: 7,7,0.2 → 7
  assert.deepEqual(evidence(three), { p: 3, h: 7 });
  const tiny = [mk([[0, 5], [0.1, 8], [0.2, 3]]), mk([[0, 5], [0.1, 8], [0.2, 3]]), mk([[0, 5], [0.1, 8], [0.2, 3]])];
  assert.deepEqual(evidence(tiny), { p: 1, h: 1 });
});

test('evidence: peak only when timeToHalf unavailable', () => {
  seq = 0;
  const ms = [mk([[0, 5], [2, 8], [4, 7]]), mk([[0, 5], [2, 8], [4, 7]]), mk([[0, 5], [2, 8], [4, 7]])];
  assert.deepEqual(evidence(ms), { p: 2, h: null });
});

test('evidence window is last 10 moments, eligible or not', () => {
  seq = 0;
  const old = [mk([[0, 5], [3, 8], [10, 4]]), mk([[0, 5], [3, 8], [10, 4]]), mk([[0, 5], [3, 8], [10, 4]])];
  const recent = Array.from({ length: 10 }, () => mk([[0, 1]]));
  assert.equal(evidence([...old, ...recent]), null);
});

test('evidence includes used moments (timing metrics) but excludes unfinished without ratings', () => {
  seq = 0;
  const ms = [
    mk([[0, 5], [3, 8], [10, 4]], { outcome: 'used' }),
    mk([[0, 5], [3, 8], [10, 4]]),
    mk([[0, 5], [3, 8], [10, 4]]),
  ];
  assert.deepEqual(evidence(ms), { p: 3, h: 7 });
  assert.equal(timingMoments([mk([], { status: 'unfinished' })]).length, 0);
});

test('trend: thresholds ±20%', () => {
  seq = 0;
  const half = (h) => mk([[0, 4], [1, 8], [1 + h, 4]]);
  const prior = Array.from({ length: 5 }, () => half(10));
  assert.equal(trend([...prior, ...Array.from({ length: 4 }, () => half(5))]), null); // 9 < 10
  assert.equal(trend([...prior, ...Array.from({ length: 5 }, () => half(8))]), 'faster'); // −20%
  assert.equal(trend([...prior, ...Array.from({ length: 5 }, () => half(12))]), 'slower'); // +20%
  assert.equal(trend([...prior, ...Array.from({ length: 5 }, () => half(9))]), 'same');
});

test('weekly easing: Monday weeks, ≥2 eligible per week, last 8 weeks', () => {
  const tz = 'America/Los_Angeles';
  const now = atLocal({ year: 2026, month: 3, day: 18 }, '12:00', tz); // Wednesday
  const mon = atLocal({ year: 2026, month: 3, day: 16 }, '00:30', tz);
  const sun = atLocal({ year: 2026, month: 3, day: 15 }, '23:30', tz);
  const ms = [
    mk([[0, 4], [1, 8], [5, 4]], { startedAt: mon }),
    mk([[0, 4], [1, 8], [3, 4]], { startedAt: mon + 3600_000 }),
    mk([[0, 4], [1, 8], [3, 4]], { startedAt: sun }), // previous week, alone → hidden
    mk([[0, 4], [1, 8], [3, 4]], { startedAt: now - 70 * 86400_000 }), // older than 8 weeks
    mk([[0, 4], [1, 8], [3, 4]], { startedAt: now - 70 * 86400_000 + 1000 }),
  ];
  assert.deepEqual(weeklyEasing(ms, now, tz), [{ week: '2026-03-16', medianMin: 3, n: 2 }]);
});

test('distract effect: needs both ratings and ≤30 min', () => {
  assert.equal(distractEffect({ optionId: 'a', startedAt: 0, returnedAt: 10 * MIN, ratingBefore: 7, ratingAfter: 4 }), 3);
  assert.equal(distractEffect({ optionId: 'a', startedAt: 0, returnedAt: 31 * MIN, ratingBefore: 7, ratingAfter: 4 }), null);
  assert.equal(distractEffect({ optionId: 'a', startedAt: 0, returnedAt: 5 * MIN, ratingBefore: null, ratingAfter: 4 }), null);
  assert.equal(distractEffect({ optionId: 'a', startedAt: 0, returnedAt: null, ratingBefore: 6, ratingAfter: 4 }), null);
});

test('distract stats: n ≥2, median, used excluded', () => {
  const use = (id, b, a) => ({ optionId: id, startedAt: 0, returnedAt: MIN, ratingBefore: b, ratingAfter: a });
  const ms = [
    mk([], { distractUses: [use('tea', 8, 4), use('walk', 6, 5)] }),
    mk([], { distractUses: [use('tea', 6, 4)] }),
    mk([], { outcome: 'used', distractUses: [use('walk', 9, 1)] }),
  ];
  assert.deepEqual(distractStats(ms), [{ optionId: 'tea', median: 3, n: 2 }]);
});

test('aggregates never include used', () => {
  const ms = [
    mk([[0, 5]], { triggerTagIds: ['t-tired'], outcome: 'used', seeking: 'relief', steps: [{ step: 'decide', at: 1 }] }),
    mk([[0, 5]], { triggerTagIds: ['t-tired', 't-stress'], seeking: 'energy' }),
  ];
  assert.equal(aggregateMoments(ms).length, 1);
  assert.deepEqual(countBy(ms, (m) => m.triggerTagIds), [{ key: 't-stress', n: 1 }, { key: 't-tired', n: 1 }]);
  assert.deepEqual(countBy(ms, (m) => [m.seeking]), [{ key: 'energy', n: 1 }]);
  assert.equal(decidePct(ms), 0);
  const g = whenGrid(ms, 'UTC');
  assert.equal(g.flat().reduce((a, b) => a + b, 0), 1);
});

test('when grid: weekday × 6-hour block in local time', () => {
  const tz = 'America/Los_Angeles';
  const sat = atLocal({ year: 2026, month: 3, day: 21 }, '23:10', tz);
  const g = whenGrid([mk([[0, 5]], { startedAt: sat })], tz);
  assert.equal(g[5][3], 1);
});

test('wave overlay: last 10 eligible, clipped to 60 min, median needs ≥2', () => {
  seq = 0;
  const ms = Array.from({ length: 12 }, () => mk([[0, 4], [5, 8], [70, 2]]));
  const o = waveOverlay(ms);
  assert.equal(o.curves.length, 10);
  assert.equal(o.curves[0].pts.length, 2);
  assert.equal(o.median[0].v, 4);
  assert.equal(o.median[5].v, 8);
  assert.equal(o.median.length, 61);
});
