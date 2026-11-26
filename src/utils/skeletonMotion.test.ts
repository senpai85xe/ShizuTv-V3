import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSkeletonItemCount,
  getSkeletonWaveDelayMs,
  getSkeletonWaveStyle,
  resolveSkeletonLineWidths,
} from './skeletonMotion';

test('getSkeletonWaveDelayMs calculates staggered wave offsets bounded by maxSteps', () => {
  assert.equal(getSkeletonWaveDelayMs(0), 0);
  assert.equal(getSkeletonWaveDelayMs(1), 70);
  assert.equal(getSkeletonWaveDelayMs(3), 210);
  assert.equal(getSkeletonWaveDelayMs(6), 420);
  // Wraps cleanly back to 0 at maxSteps=7 so late grid items still shimmer immediately
  assert.equal(getSkeletonWaveDelayMs(7), 0);
  assert.equal(getSkeletonWaveDelayMs(8), 70);
});

test('getSkeletonWaveDelayMs guards negative and non-finite inputs', () => {
  assert.equal(getSkeletonWaveDelayMs(-4), 0);
  assert.equal(getSkeletonWaveDelayMs(Number.NaN), 0);
  assert.equal(getSkeletonWaveDelayMs(2, { stepMs: 50, maxSteps: 4, baseDelayMs: 40 }), 140);
});

test('getSkeletonWaveStyle formats --sx-skeleton-delay CSS variable', () => {
  assert.deepEqual(getSkeletonWaveStyle(0), { '--sx-skeleton-delay': '0ms' });
  assert.deepEqual(getSkeletonWaveStyle(4, { stepMs: 60 }), { '--sx-skeleton-delay': '240ms' });
});

test('resolveSkeletonLineWidths returns tapered multi-line percentages', () => {
  assert.deepEqual(resolveSkeletonLineWidths(0), []);
  assert.deepEqual(resolveSkeletonLineWidths(1), ['94%']);
  const threeLines = resolveSkeletonLineWidths(3);
  assert.equal(threeLines.length, 3);
  assert.equal(threeLines[0], '94%');
  assert.equal(threeLines[1], '82%');
  assert.equal(threeLines[2], '62%');
});

test('getSkeletonItemCount handles defaults and upper bounds safely', () => {
  assert.equal(getSkeletonItemCount('shelf'), 8);
  assert.equal(getSkeletonItemCount('compact-list'), 6);
  assert.equal(getSkeletonItemCount('grid'), 12);
  assert.equal(getSkeletonItemCount('grid', 4), 4);
  assert.equal(getSkeletonItemCount('grid', 99), 24);
});
