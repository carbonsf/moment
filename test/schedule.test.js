import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generatePlan, dedupe, applyQuiet, quickItem, regenerateForTz, dueSoon } from '../web/js/lib/schedule.js';
import { atLocal, zonedToUtc, inQuietHours, zonedParts } from '../web/js/lib/time.js';

const LA = 'America/Los_Angeles';
const NY = 'America/New_York';
const MIN = 60_000;
const DEF = { quietStart: '00:00', quietEnd: '07:00', eveningTime: '20:00', morningTime: '09:00' };
const at = (y, mo, d, hm, tz = LA) => atLocal({ year: y, month: mo, day: d }, hm, tz);
const kinds = (plan) => plan.map((x) => x.kind);

test('basic plan: +30m, +2h, evening, next morning', () => {
  const close = at(2026, 6, 10, '14:00');
  const plan = generatePlan(close, DEF, LA);
  assert.deepEqual(kinds(plan), ['plus30', 'plus2h', 'evening', 'morning']);
  assert.equal(plan[0].dueAt, close + 30 * MIN);
  assert.equal(plan[1].dueAt, close + 120 * MIN);
  assert.equal(plan[2].dueAt, at(2026, 6, 10, '20:00'));
  assert.equal(plan[3].dueAt, at(2026, 6, 11, '09:00'));
});

test('evening skipped when close is not before eveningTime − 60 min', () => {
  assert.ok(!kinds(generatePlan(at(2026, 6, 10, '19:00'), DEF, LA)).includes('evening'));
  assert.ok(!kinds(generatePlan(at(2026, 6, 10, '19:10'), DEF, LA)).includes('evening'));
  // 18:59 qualifies, but dedupe then drops it (19:29 plus30 is within 45 min of 20:00)
  const p = generatePlan(at(2026, 6, 10, '18:59'), DEF, LA);
  assert.deepEqual(kinds(p), ['plus30', 'plus2h', 'morning']);
  const early = generatePlan(at(2026, 6, 10, '17:30'), DEF, LA);
  // 18:00, 19:30, 20:00 (within 45 of 19:30 → dropped), morning
  assert.deepEqual(kinds(early), ['plus30', 'plus2h', 'morning']);
  const mid = generatePlan(at(2026, 6, 10, '16:30'), DEF, LA);
  // 17:00, 18:30, 20:00 (90 min after) kept
  assert.deepEqual(kinds(mid), ['plus30', 'plus2h', 'evening', 'morning']);
});

test('quiet hours: user-asked kinds keep their time, others move to quietEnd', () => {
  const s = { ...DEF, quietStart: '22:00', quietEnd: '07:00' };
  const close = at(2026, 6, 10, '23:00');
  const plan = generatePlan(close, s, LA);
  assert.deepEqual(kinds(plan), ['plus30', 'plus2h', 'morning']);
  assert.equal(plan[0].dueAt, at(2026, 6, 10, '23:30'));
  assert.equal(plan[1].dueAt, at(2026, 6, 11, '07:00'));
  assert.equal(plan[2].dueAt, at(2026, 6, 11, '09:00'));
  // plus10 / again30 are never moved
  const late = at(2026, 6, 10, '23:50');
  assert.equal(applyQuiet(quickItem(late, 'plus10'), s, LA).dueAt, late + 10 * MIN);
  assert.equal(applyQuiet(quickItem(late, 'again30'), s, LA).dueAt, late + 30 * MIN);
});

test('quiet window that does not cross midnight', () => {
  const s = { ...DEF, quietStart: '13:00', quietEnd: '15:00' };
  assert.equal(inQuietHours(at(2026, 6, 10, '14:00'), '13:00', '15:00', LA), true);
  assert.equal(inQuietHours(at(2026, 6, 10, '15:00'), '13:00', '15:00', LA), false);
  const close = at(2026, 6, 10, '12:00');
  const plan = generatePlan(close, s, LA);
  assert.equal(plan.find((x) => x.kind === 'plus2h').dueAt, at(2026, 6, 10, '15:00'));
});

test('dedupe keeps the earlier of two items within 45 min', () => {
  const out = dedupe([{ kind: 'morning', dueAt: 100 * MIN }, { kind: 'plus2h', dueAt: 60 * MIN }, { kind: 'plus30', dueAt: 10 * MIN }]);
  assert.deepEqual(kinds(out), ['plus30', 'plus2h']);
  assert.deepEqual(kinds(dedupe([{ kind: 'plus30', dueAt: 0 }, { kind: 'plus2h', dueAt: 45 * MIN }])), ['plus30', 'plus2h']);
});

test('morning moved into the dedupe window is dropped; plan never extends past morning', () => {
  const s = { ...DEF, quietStart: '22:00', quietEnd: '07:00', morningTime: '07:30' };
  const plan = generatePlan(at(2026, 6, 10, '23:00'), s, LA);
  assert.deepEqual(kinds(plan), ['plus30', 'plus2h']);
  for (const p of generatePlan(at(2026, 6, 10, '02:00'), DEF, LA)) assert.ok(p.dueAt <= at(2026, 6, 11, '09:00'));
});

test('DST spring-forward (America/Los_Angeles, 2026-03-08)', () => {
  const close = at(2026, 3, 7, '22:00'); // PST, UTC−8
  assert.equal(close, Date.UTC(2026, 2, 8, 6, 0));
  const plan = generatePlan(close, DEF, LA);
  const morning = plan.find((x) => x.kind === 'morning');
  assert.equal(morning.dueAt, Date.UTC(2026, 2, 8, 16, 0)); // 09:00 PDT
  const p2 = plan.find((x) => x.kind === 'plus2h'); // 00:00 → quiet → 07:00 PDT
  assert.equal(p2.dueAt, Date.UTC(2026, 2, 8, 14, 0));
  // Nonexistent 02:30 shifts forward to 03:30 PDT
  const gap = zonedToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, LA);
  assert.equal(gap, Date.UTC(2026, 2, 8, 10, 30));
  assert.deepEqual([zonedParts(gap, LA).hour, zonedParts(gap, LA).minute], [3, 30]);
  // Elapsed hours across the gap: 23 h day
  assert.equal(at(2026, 3, 9, '00:00') - at(2026, 3, 8, '00:00'), 23 * 3600_000);
});

test('DST fall-back (America/Los_Angeles, 2026-11-01)', () => {
  const close = at(2026, 10, 31, '22:00'); // PDT, UTC−7
  assert.equal(close, Date.UTC(2026, 10, 1, 5, 0));
  const plan = generatePlan(close, DEF, LA);
  assert.equal(plan.find((x) => x.kind === 'morning').dueAt, Date.UTC(2026, 10, 1, 17, 0)); // 09:00 PST
  assert.equal(plan.find((x) => x.kind === 'plus2h').dueAt, Date.UTC(2026, 10, 1, 15, 0)); // 07:00 PST
  // Ambiguous 01:30 resolves to the earlier instant (PDT)
  assert.equal(zonedToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, LA), Date.UTC(2026, 10, 1, 8, 30));
  assert.equal(at(2026, 11, 2, '00:00') - at(2026, 11, 1, '00:00'), 25 * 3600_000);
});

test('time zone change regenerates local-time items, keeps relative ones', () => {
  const close = at(2026, 6, 10, '14:00');
  const plan = generatePlan(close, DEF, LA);
  const now = close + 31 * MIN; // plus30 has passed
  const regen = regenerateForTz(plan, close, DEF, NY, now);
  assert.deepEqual(kinds(regen), ['plus2h', 'evening', 'morning']);
  assert.equal(regen[0].dueAt, close + 120 * MIN); // 17:00 LA = 20:00 NY, not quiet
  assert.equal(regen[1].dueAt, at(2026, 6, 10, '20:00', NY));
  assert.equal(regen[2].dueAt, at(2026, 6, 11, '09:00', NY));
});

test('time zone change can push relative items into quiet hours', () => {
  const close = at(2026, 6, 10, '21:00');
  const plan = generatePlan(close, DEF, LA); // plus2h 23:00 LA = 02:00 NY
  const regen = regenerateForTz(plan, close, DEF, NY, close);
  assert.equal(regen.find((x) => x.kind === 'plus2h').dueAt, at(2026, 6, 11, '07:00', NY));
});

test('starting a moment cancels items due within 60 min', () => {
  const now = 1_000_000;
  const items = [{ dueAt: now + 10 * MIN }, { dueAt: now + 60 * MIN }, { dueAt: now + 61 * MIN }];
  assert.equal(dueSoon(items, now).length, 2);
});
