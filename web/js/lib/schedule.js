// @ts-check
/** §7.1 check-in plan generation. Pure. DD-032 */
import { MIN, HOUR, atLocal, addDays, localDate, inQuietHours, nextLocalTime } from './time.js';

/**
 * @typedef {'plus10'|'plus30'|'plus2h'|'evening'|'morning'|'again30'} CheckinKind
 * @typedef {{kind:CheckinKind, dueAt:number}} PlanItem
 * @typedef {{quietStart:string, quietEnd:string, eveningTime:string, morningTime:string}} PlanSettings
 */

/** Kinds the user just asked for; they keep their time even in quiet hours. */
export const USER_ASKED = new Set(['plus10', 'plus30', 'again30']);
export const DEDUPE_MS = 45 * MIN;
export const EVENING_LEAD_MS = 60 * MIN;
export const CANCEL_ON_START_MS = 60 * MIN;

/**
 * Apply quiet hours: non-user-asked items inside quiet hours move to the next quietEnd.
 * @param {PlanItem} item @param {PlanSettings} s @param {string} tz @returns {PlanItem}
 */
export function applyQuiet(item, s, tz) {
  if (USER_ASKED.has(item.kind)) return item;
  if (!inQuietHours(item.dueAt, s.quietStart, s.quietEnd, tz)) return item;
  return { ...item, dueAt: nextLocalTime(item.dueAt, s.quietEnd, tz) };
}

/**
 * Sort and drop any item within 45 min of the previously kept one (earlier wins).
 * @param {PlanItem[]} items
 */
export function dedupe(items) {
  const sorted = [...items].sort((a, b) => a.dueAt - b.dueAt);
  /** @type {PlanItem[]} */
  const out = [];
  for (const it of sorted) {
    const prev = out[out.length - 1];
    if (!prev || it.dueAt - prev.dueAt >= DEDUPE_MS) out.push(it);
  }
  return out;
}

/**
 * Generate the check-in plan for a close at `closeTime`. Output dueAt values are absolute UTC ms.
 * @param {number} closeTime @param {PlanSettings} s @param {string} tz @returns {PlanItem[]}
 */
export function generatePlan(closeTime, s, tz) {
  /** @type {PlanItem[]} */
  const items = [
    { kind: 'plus30', dueAt: closeTime + 30 * MIN },
    { kind: 'plus2h', dueAt: closeTime + 2 * HOUR },
  ];
  const today = localDate(closeTime, tz);
  const evening = atLocal(today, s.eveningTime, tz);
  if (closeTime < evening - EVENING_LEAD_MS) items.push({ kind: 'evening', dueAt: evening });
  items.push({ kind: 'morning', dueAt: atLocal(addDays(today, 1), s.morningTime, tz) });
  const shifted = dedupe(items.map((it) => applyQuiet(it, s, tz)));
  // The plan ends after morning.
  const morningIdx = shifted.findIndex((x) => x.kind === 'morning');
  return morningIdx >= 0 ? shifted.slice(0, morningIdx + 1) : shifted;
}

/** "In 10 min" / "Check again in 30 min". @param {number} now @param {'plus10'|'again30'} kind @returns {PlanItem} */
export function quickItem(now, kind) {
  return { kind, dueAt: now + (kind === 'plus10' ? 10 : 30) * MIN };
}

/**
 * Regenerate pending local-time items after a time zone change (§7.1, E15).
 * Relative items (plus10/plus30/plus2h/again30) keep their instants unless quiet hours now apply;
 * evening/morning are recomputed in the new zone. Past items are dropped.
 * @param {PlanItem[]} pending @param {number} closeTime @param {PlanSettings} s @param {string} newTz @param {number} now
 * @returns {PlanItem[]}
 */
export function regenerateForTz(pending, closeTime, s, newTz, now) {
  const fresh = generatePlan(closeTime, s, newTz);
  /** @type {PlanItem[]} */
  const out = [];
  for (const it of pending) {
    if (it.kind === 'evening' || it.kind === 'morning') {
      const f = fresh.find((x) => x.kind === it.kind);
      if (f) out.push({ ...it, dueAt: f.dueAt });
    } else {
      out.push(applyQuiet(it, s, newTz));
    }
  }
  return out.filter((x) => x.dueAt > now).sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * Pending items to cancel when a moment starts: due within the next 60 min.
 * @template {{dueAt:number}} T @param {T[]} pending @param {number} now @returns {T[]}
 */
export function dueSoon(pending, now) {
  return pending.filter((x) => x.dueAt <= now + CANCEL_ON_START_MS);
}
