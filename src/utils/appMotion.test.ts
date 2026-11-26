import test from 'node:test';
import assert from 'node:assert/strict';
import { measureRelativePillRect } from './appMotion';

test('measureRelativePillRect compensates for horizontal scrollLeft and clientLeft inside scrollable tab bars', () => {
  // Simulate scrolled overflow-x-auto tab container scrolled 120px to the right, with 1px border (clientLeft=1).
  // Container viewport left is at 20px; the 4th tab visually starts at viewport x=180px.
  // In container scroll-content coordinates: (180 - 20) + 120 - 1 = 279px.
  const rect = measureRelativePillRect(
    { left: 20, top: 100 },
    { left: 180, top: 104, width: 88, height: 34 },
    { scrollLeft: 120, scrollTop: 0, clientLeft: 1, clientTop: 0 },
  );

  assert.equal(rect.left, 279);
  assert.equal(rect.top, 4);
  assert.equal(rect.width, 88);
  assert.equal(rect.height, 34);
  assert.equal(rect.ready, true);
});
