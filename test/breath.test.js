import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickVisualForMoment, resolveVisual, VISUAL_IDS } from '../web/js/ui/breath/index.js';

test('cycling gives each new moment the next visual, wrapping around (DD-082)', () => {
  let last = -1;
  const seen = [];
  for (let i = 0; i < VISUAL_IDS.length + 2; i++) {
    const p = pickVisualForMoment('cycle', last);
    seen.push(p.id);
    last = p.index;
  }
  assert.deepEqual(seen, [...VISUAL_IDS, ...VISUAL_IDS.slice(0, 2)]);
});

test('random never repeats the previous moment and stays in range', () => {
  for (let last = -1; last < VISUAL_IDS.length; last++) {
    for (let k = 0; k < 200; k++) {
      const p = pickVisualForMoment('random', last);
      assert.ok(p.index >= 0 && p.index < VISUAL_IDS.length);
      assert.equal(p.id, VISUAL_IDS[p.index]);
      if (last >= 0) assert.notEqual(p.index, last);
    }
  }
});

test('fixed settings pick nothing per moment; moments keep their pick', () => {
  assert.equal(pickVisualForMoment('silk', 3), null);
  assert.equal(resolveVisual('ink', { breathVisual: 'silk' }), 'ink');
  assert.equal(resolveVisual('cycle', { breathVisual: 'pendulum' }), 'pendulum');
  assert.equal(resolveVisual('random', { breathVisual: 'shallows' }), 'shallows');
  assert.equal(resolveVisual('cycle', { breathVisual: null }), 'wave'); // moment started before the setting changed
  assert.equal(resolveVisual('nonsense', null), 'wave');
});
