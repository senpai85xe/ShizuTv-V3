import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCircularOffset,
  getCoverflowCardMetrics,
  getStaggerDelayMs,
} from './cardMotion';

test('getCircularOffset computes shortest signed wrap-around distance', () => {
  assert.equal(getCircularOffset(0, 0, 5), 0);
  assert.equal(getCircularOffset(1, 0, 5), 1);
  assert.equal(getCircularOffset(4, 0, 5), -1);
  assert.equal(getCircularOffset(0, 4, 5), 1);
  assert.equal(getCircularOffset(3, 4, 5), -1);
});

test('getCoverflowCardMetrics assigns center, flanking, and hidden slots', () => {
  const active = getCoverflowCardMetrics(0, 0, 5);
  assert.equal(active.slot, 'active');
  assert.equal(active.scale, 1);
  assert.equal(active.opacity, 1);
  assert.equal(active.zIndex, 20);

  const next = getCoverflowCardMetrics(1, 0, 5);
  assert.equal(next.slot, 'next');
  assert.ok(next.scale < 1);
  assert.ok(next.translateXPercent > 0);

  const prev = getCoverflowCardMetrics(4, 0, 5);
  assert.equal(prev.slot, 'prev');
  assert.ok(prev.scale < 1);
  assert.ok(prev.translateXPercent < 0);

  const hidden = getCoverflowCardMetrics(2, 0, 5);
  assert.equal(hidden.slot, 'hidden');
  assert.equal(hidden.opacity, 0);
});

test('getStaggerDelayMs caps delay cleanly for long lists', () => {
  assert.equal(getStaggerDelayMs(0), 0);
  assert.equal(getStaggerDelayMs(3, 40, 6), 120);
  assert.equal(getStaggerDelayMs(20, 40, 6), 240);
});
