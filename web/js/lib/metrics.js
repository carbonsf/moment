// @ts-check
/** §10 metrics and trends. Pure, no DOM. */
import { MIN, roundMin, weekStartKey, zonedParts } from './time.js';

/**
 * @typedef {{t:number, v:number, src:string}} Rating
 * @typedef {{optionId:string, startedAt:number, returnedAt:number|null, ratingBefore:number|null, ratingAfter:number|null}} DistractUse
 * @typedef {{peak:number|null, timeToPeakMs:number|null, timeToHalfMs:number|null, durationMs:number|null, drop:number|null, delayMs:number|null}} MomentMetrics
 * @typedef {{
 *   id:string, startedAt:number, endedAt:number|null, lastInteractionAt?:number, status:string, deleted?:boolean,
 *   ratings:Rating[], steps:{step:string, at:number}[], distractUses?:DistractUse[], outcome?:string|null,
 *   triggerTagIds?:string[], bodyLocations?:string[], seeking?:string|null,
 *   decide?:{thoughtIds?:string[]}, metrics?:MomentMetrics|null
 * }} Moment
 */

export const ELIGIBLE_MIN_RATINGS = 3;
export const ELIGIBLE_MIN_PEAK = 3;
export const EVIDENCE_WINDOW = 10; // DD-013
export const EVIDENCE_MIN = 3; // DD-013
export const TREND_MIN = 10;
export const TREND_THRESHOLD = 0.2;
export const DISTRACT_MAX_MS = 30 * MIN;
export const DISTRACT_MIN_USES = 2;
export const WEEK_MIN = 2;
export const WEEKS_SHOWN = 8;
export const OVERLAY_N = 10;
export const OVERLAY_MAX_MIN = 60;

/** @param {number[]} xs @returns {number|null} */
export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** @param {Rating[]} ratings */
export function sortRatings(ratings) {
  return [...(ratings || [])].sort((a, b) => a.t - b.t);
}

/**
 * §10.1 per-moment metrics.
 * @param {Moment} m @returns {MomentMetrics}
 */
export function computeMomentMetrics(m) {
  const r = sortRatings(m.ratings);
  const durationMs = m.endedAt != null ? Math.max(0, m.endedAt - m.startedAt) : null;
  const firstAct = (m.steps || []).filter((s) => s.step === 'distract' || s.step === 'decide').map((s) => s.at).sort((a, b) => a - b)[0];
  const delayMs = firstAct != null ? Math.max(0, firstAct - m.startedAt) : durationMs;
  if (!r.length) return { peak: null, timeToPeakMs: null, timeToHalfMs: null, durationMs, drop: null, delayMs };
  let peakIdx = 0;
  for (let i = 1; i < r.length; i++) if (r[i].v > r[peakIdx].v) peakIdx = i;
  const peak = r[peakIdx].v;
  const timeToPeakMs = r[peakIdx].t;
  let timeToHalfMs = null;
  if (peak > 2) {
    const half = r.slice(peakIdx + 1).find((x) => x.v <= peak / 2);
    if (half) timeToHalfMs = half.t - timeToPeakMs;
  }
  return { peak, timeToPeakMs, timeToHalfMs, durationMs, drop: r[0].v - r[r.length - 1].v, delayMs };
}

/** §10.1 eligibility for curve metrics. @param {Moment} m */
export function isEligible(m) {
  const r = m.ratings || [];
  if (r.length < ELIGIBLE_MIN_RATINGS) return false;
  return Math.max(...r.map((x) => x.v)) >= ELIGIBLE_MIN_PEAK;
}

/** Metrics for a moment, using stored values when present. @param {Moment} m */
export function metricsOf(m) {
  return m.metrics || computeMomentMetrics(m);
}

/** Not deleted, not active, and not an unfinished moment without ratings (§10.4). @param {Moment} m */
function isMeasurable(m) {
  if (m.deleted || m.status === 'active') return false;
  if (m.status === 'unfinished' && !(m.ratings || []).length) return false;
  return true;
}

/** Moments usable for timing metrics. `used` is included: curves are still data (§10.4). @param {Moment[]} ms */
export function timingMoments(ms) {
  return ms.filter(isMeasurable).sort((a, b) => a.startedAt - b.startedAt);
}

/** Moments usable for aggregates, charts, counts. `used` never appears (§10.4, DD-017). @param {Moment[]} ms */
export function aggregateMoments(ms) {
  return timingMoments(ms).filter((m) => m.outcome !== 'used');
}

/**
 * §10.3 cumulative count: closed moments. `used` is never counted (§10.4). DD-015, DD-040
 * @param {Moment[]} ms
 */
export function cumulativeCount(ms) {
  return ms.filter((m) => !m.deleted && m.status === 'closed' && m.outcome !== 'used').length;
}

/**
 * §10.3 evidence line inputs, or null below threshold.
 * @param {Moment[]} ms @returns {{p:number, h:number|null}|null}
 */
export function evidence(ms) {
  const recent = timingMoments(ms).slice(-EVIDENCE_WINDOW).filter(isEligible);
  if (recent.length < EVIDENCE_MIN) return null;
  const mets = recent.map(metricsOf);
  const p = median(mets.map((x) => x.timeToPeakMs).filter((x) => x != null).map(Number));
  if (p == null) return null;
  const h = median(mets.map((x) => x.timeToHalfMs).filter((x) => x != null).map(Number));
  return { p: roundMin(p), h: h == null ? null : roundMin(h) };
}

/**
 * §10.3 trend: median timeToHalf of last 5 vs prior 5 eligible moments.
 * @param {Moment[]} ms @returns {'faster'|'slower'|'same'|null}
 */
export function trend(ms) {
  const xs = timingMoments(ms).filter(isEligible).map(metricsOf).map((x) => x.timeToHalfMs).filter((x) => x != null).map(Number);
  if (xs.length < TREND_MIN) return null;
  const last = /** @type {number} */ (median(xs.slice(-5)));
  const prior = /** @type {number} */ (median(xs.slice(-10, -5)));
  if (prior <= 0) return 'same';
  const change = (last - prior) / prior;
  if (change <= -TREND_THRESHOLD) return 'faster';
  if (change >= TREND_THRESHOLD) return 'slower';
  return 'same';
}

/** Typical ease time in minutes (median timeToHalf of eligible recent moments). @param {Moment[]} ms */
export function typicalEaseMin(ms) {
  const e = evidence(ms);
  return e ? e.h : null;
}

/**
 * §10.3 weekly bars: median timeToHalf per Monday-start local week, last 8 weeks, weeks with ≥2 eligible moments.
 * @param {Moment[]} ms @param {number} now @param {string} tz
 * @returns {{week:string, medianMin:number, n:number}[]}
 */
export function weeklyEasing(ms, now, tz) {
  const keys = [];
  for (let i = WEEKS_SHOWN - 1; i >= 0; i--) keys.push(weekStartKey(now - i * 7 * 24 * 60 * MIN, tz));
  /** @type {Map<string, Moment[]>} */
  const by = new Map(keys.map((k) => [k, []]));
  for (const m of timingMoments(ms).filter(isEligible)) {
    const k = weekStartKey(m.startedAt, tz);
    if (by.has(k)) by.get(k)?.push(m);
  }
  const out = [];
  for (const k of keys) {
    const list = by.get(k) || [];
    if (list.length < WEEK_MIN) continue;
    const med = median(list.map(metricsOf).map((x) => x.timeToHalfMs).filter((x) => x != null).map(Number));
    if (med == null) continue;
    out.push({ week: k, medianMin: roundMin(med), n: list.length });
  }
  return out;
}

/**
 * §10.2 effect of one distract use, or null when it doesn't qualify.
 * @param {DistractUse} u
 */
export function distractEffect(u) {
  if (u.ratingBefore == null || u.ratingAfter == null || u.returnedAt == null) return null;
  if (u.returnedAt - u.startedAt > DISTRACT_MAX_MS) return null;
  return u.ratingBefore - u.ratingAfter;
}

/**
 * §10.2 option stats: median effect, n ≥2 to display.
 * @param {Moment[]} ms @returns {{optionId:string, median:number, n:number}[]}
 */
export function distractStats(ms) {
  /** @type {Map<string, number[]>} */
  const by = new Map();
  for (const m of aggregateMoments(ms)) {
    for (const u of m.distractUses || []) {
      const e = distractEffect(u);
      if (e == null) continue;
      if (!by.has(u.optionId)) by.set(u.optionId, []);
      by.get(u.optionId)?.push(e);
    }
  }
  return [...by.entries()]
    .filter(([, xs]) => xs.length >= DISTRACT_MIN_USES)
    .map(([optionId, xs]) => ({ optionId, median: /** @type {number} */ (median(xs)), n: xs.length }))
    .sort((a, b) => b.median - a.median || b.n - a.n);
}

/**
 * Count occurrences of values from a list-valued field.
 * @param {Moment[]} ms @param {(m:Moment)=>(string|null|undefined)[]} pick
 * @returns {{key:string, n:number}[]} descending
 */
export function countBy(ms, pick) {
  /** @type {Map<string, number>} */
  const c = new Map();
  for (const m of aggregateMoments(ms)) {
    for (const k of new Set(pick(m))) if (k) c.set(k, (c.get(k) || 0) + 1);
  }
  return [...c.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

/**
 * 7 days × 4 blocks (Night 0–6, Morning 6–12, Afternoon 12–18, Evening 18–24), Monday first.
 * @param {Moment[]} ms @param {string} tz @returns {number[][]}
 */
export function whenGrid(ms, tz) {
  const g = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  for (const m of aggregateMoments(ms)) {
    const p = zonedParts(m.startedAt, tz);
    g[p.weekday][Math.floor(p.hour / 6)]++;
  }
  return g;
}

/** % of aggregate moments that reached Decide. @param {Moment[]} ms */
export function decidePct(ms) {
  const list = aggregateMoments(ms);
  if (!list.length) return null;
  const n = list.filter((m) => (m.steps || []).some((s) => s.step === 'decide')).length;
  return Math.round((100 * n) / list.length);
}

/**
 * Value of a rating curve at time t (linear interpolation), or null outside the rated span.
 * @param {Rating[]} r sorted @param {number} t
 */
function valueAt(r, t) {
  if (!r.length || t < r[0].t || t > r[r.length - 1].t) return null;
  for (let i = 1; i < r.length; i++) {
    if (t <= r[i].t) {
      const a = r[i - 1], b = r[i];
      return b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
    }
  }
  return r[r.length - 1].v;
}

/**
 * Wave overlay: last 10 eligible moments on 0–60 min, plus a per-minute median curve (≥2 moments covering that minute).
 * @param {Moment[]} ms
 * @returns {{curves:{id:string, pts:{m:number, v:number}[]}[], median:{m:number, v:number}[]}}
 */
export function waveOverlay(ms) {
  const list = timingMoments(ms).filter(isEligible).slice(-OVERLAY_N);
  const maxT = OVERLAY_MAX_MIN * MIN;
  const curves = list.map((m) => ({
    id: m.id,
    pts: sortRatings(m.ratings).filter((x) => x.t <= maxT).map((x) => ({ m: x.t / MIN, v: x.v })),
  }));
  const sorted = list.map((m) => sortRatings(m.ratings));
  const med = [];
  for (let minute = 0; minute <= OVERLAY_MAX_MIN; minute++) {
    const vals = sorted.map((r) => valueAt(r, minute * MIN)).filter((v) => v != null).map(Number);
    if (vals.length >= 2) med.push({ m: minute, v: /** @type {number} */ (median(vals)) });
  }
  return { curves, median: med };
}
