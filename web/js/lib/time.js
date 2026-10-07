// @ts-check
/** Time helpers: time zones, DST-safe local wall times, quiet hours. Pure, no DOM. */

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** @typedef {{year:number,month:number,day:number,hour:number,minute:number,second:number,weekday:number}} ZonedParts weekday: 0=Mon..6=Sun */

/** @type {Map<string, Intl.DateTimeFormat>} */
const fmtCache = new Map();

/** @param {string} tz */
function partsFormatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WD = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** @returns {string} the device's IANA time zone */
export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Wall-clock parts of an instant in a zone.
 * @param {number} ms @param {string} tz @returns {ZonedParts}
 */
export function zonedParts(ms, tz) {
  /** @type {Record<string,string>} */
  const p = {};
  for (const { type, value } of partsFormatter(tz).formatToParts(new Date(ms))) p[type] = value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
    weekday: WD[/** @type {keyof typeof WD} */ (p.weekday)] ?? 0,
  };
}

/** Offset (ms) of zone from UTC at instant. @param {number} ms @param {string} tz */
export function tzOffset(ms, tz) {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Instant for a local wall time in a zone, DST-safe.
 * Nonexistent times (spring-forward gap) shift forward by the gap; ambiguous times (fall-back) take the earlier instant.
 * @param {{year:number,month:number,day:number,hour:number,minute:number}} w @param {string} tz
 */
export function zonedToUtc(w, tz) {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  const o1 = tzOffset(guess - 12 * HOUR, tz);
  const o2 = tzOffset(guess + 12 * HOUR, tz);
  // Try both offsets around the date; pick the one that round-trips, earlier first.
  const cands = [guess - Math.max(o1, o2), guess - Math.min(o1, o2)];
  for (const c of cands) {
    const p = zonedParts(c, tz);
    if (p.year === w.year && p.month === w.month && p.day === w.day && p.hour === w.hour && p.minute === w.minute) return c;
  }
  // In a gap: use the pre-transition offset, which lands after the gap.
  return guess - o1;
}

/** @param {string} hm "HH:MM" @returns {{h:number,m:number}} */
export function parseHM(hm) {
  const [h, m] = String(hm || '00:00').split(':').map((x) => parseInt(x, 10) || 0);
  return { h: Math.min(23, Math.max(0, h)), m: Math.min(59, Math.max(0, m)) };
}

/** @param {string} hm */
export function hmToMinutes(hm) {
  const { h, m } = parseHM(hm);
  return h * 60 + m;
}

/** Local calendar date of an instant. @param {number} ms @param {string} tz */
export function localDate(ms, tz) {
  const p = zonedParts(ms, tz);
  return { year: p.year, month: p.month, day: p.day };
}

/** Calendar date + n days (pure calendar math). @param {{year:number,month:number,day:number}} d @param {number} n */
export function addDays(d, n) {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/**
 * Instant of local time `hm` on date `d`.
 * @param {{year:number,month:number,day:number}} d @param {string} hm @param {string} tz
 */
export function atLocal(d, hm, tz) {
  const { h, m } = parseHM(hm);
  return zonedToUtc({ ...d, hour: h, minute: m }, tz);
}

/** Minutes since local midnight. @param {number} ms @param {string} tz */
export function localMinutes(ms, tz) {
  const p = zonedParts(ms, tz);
  return p.hour * 60 + p.minute;
}

/**
 * Whether an instant's local time falls inside quiet hours [start, end). Handles windows across midnight.
 * Equal start and end means no quiet hours.
 * @param {number} ms @param {string} start @param {string} end @param {string} tz
 */
export function inQuietHours(ms, start, end, tz) {
  const s = hmToMinutes(start);
  const e = hmToMinutes(end);
  if (s === e) return false;
  const m = localMinutes(ms, tz);
  return s < e ? m >= s && m < e : m >= s || m < e;
}

/**
 * Next instant at or after `ms` whose local time is `end` (quiet hours end).
 * @param {number} ms @param {string} end @param {string} tz
 */
export function nextLocalTime(ms, end, tz) {
  const d = localDate(ms, tz);
  const today = atLocal(d, end, tz);
  return today >= ms ? today : atLocal(addDays(d, 1), end, tz);
}

/** Monday-start week key "YYYY-MM-DD" (local). @param {number} ms @param {string} tz */
export function weekStartKey(ms, tz) {
  const p = zonedParts(ms, tz);
  const d = addDays({ year: p.year, month: p.month, day: p.day }, -p.weekday);
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

/** Whole minutes, rounded, minimum 1. @param {number} ms */
export function roundMin(ms) {
  return Math.max(1, Math.round(ms / MIN));
}

/** "mm:ss" countdown. @param {number} ms */
export function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
