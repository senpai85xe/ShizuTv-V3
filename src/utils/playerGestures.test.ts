import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSwipeSeekTarget,
  computeSwipeVerticalLevel,
  detectPlayerGestureKind,
  formatSignedSeekDelta,
  GESTURE_GUIDE_DURATION_MS,
  GESTURE_GUIDE_ITEMS,
  mapStageGestureCoordinates,
  shouldTriggerGestureGuide,
} from './playerGestures';

test('detectPlayerGestureKind respects deadzone and distinguishes horizontal seek vs left/right vertical swipes', () => {
  assert.equal(detectPlayerGestureKind(6, 5, 500, 1000), 'none');
  assert.equal(detectPlayerGestureKind(15, -12, 500, 1000), 'none');
  assert.equal(detectPlayerGestureKind(28, 8, 500, 1000), 'seek');
  assert.equal(detectPlayerGestureKind(-24, 10, 200, 1000), 'seek');
  assert.equal(detectPlayerGestureKind(4, -30, 700, 1000), 'volume');
  assert.equal(detectPlayerGestureKind(4, 30, 500, 1000), 'volume');
  assert.equal(detectPlayerGestureKind(4, -30, 200, 1000), 'brightness');
});

test('computeSwipeSeekTarget scales drag distance across container width and clamps within [0, duration]', () => {
  const forward = computeSwipeSeekTarget(120, 160, 320, 1440, 90);
  assert.equal(forward.deltaSeconds, 45);
  assert.equal(forward.targetTime, 165);

  const clampedStart = computeSwipeSeekTarget(10, -200, 320, 1440, 90);
  assert.equal(clampedStart.targetTime, 0);
  assert.equal(clampedStart.deltaSeconds, -10);

  const clampedEnd = computeSwipeSeekTarget(1420, 200, 320, 1440, 90);
  assert.equal(clampedEnd.targetTime, 1440);
  assert.equal(clampedEnd.deltaSeconds, 20);
});

test('computeSwipeVerticalLevel increases on upward swipe, decreases on downward swipe, and clamps bounds', () => {
  assert.equal(computeSwipeVerticalLevel(0.5, -110, 220, 0, 1), 1);
  assert.equal(computeSwipeVerticalLevel(0.5, 55, 220, 0, 1), 0.25);
  assert.equal(computeSwipeVerticalLevel(0.2, 200, 220, 0, 1), 0);
  assert.equal(computeSwipeVerticalLevel(0.6, 200, 220, 0.25, 1), 0.25);
});

test('formatSignedSeekDelta formats positive and negative deltas clearly', () => {
  assert.equal(formatSignedSeekDelta(24), '+00:24');
  assert.equal(formatSignedSeekDelta(-75), '-01:15');
  assert.equal(formatSignedSeekDelta(0), '+00:00');
});

test('mapStageGestureCoordinates rotates drag axes cleanly for 90-degree rotated fullscreen stages', () => {
  const normal = mapStageGestureCoordinates({
    dx: 40,
    dy: -20,
    clientX: 300,
    clientY: 200,
    rectLeft: 0,
    rectTop: 0,
    rectWidth: 390,
    rectHeight: 844,
    cssRotated: false,
  });
  assert.deepEqual(normal, { stageDx: 40, stageDy: -20, stageLocalX: 300, stageWidth: 390 });

  const rotated = mapStageGestureCoordinates({
    dx: 40,
    dy: 60,
    clientX: 200,
    clientY: 120,
    rectLeft: 0,
    rectTop: 0,
    rectWidth: 390,
    rectHeight: 844,
    cssRotated: true,
  });
  assert.deepEqual(rotated, { stageDx: 60, stageDy: -40, stageLocalX: 120, stageWidth: 844 });
});

test('gesture guide exposes 2-second timing, 3 gesture items, and triggers once per playback session', () => {
  assert.equal(GESTURE_GUIDE_DURATION_MS, 2000);
  assert.deepEqual(
    GESTURE_GUIDE_ITEMS.map((item) => item.id),
    ['brightness', 'seek', 'volume'],
  );
  assert.equal(
    shouldTriggerGestureGuide({ alreadyShown: false, isLocked: false, isPipActive: false }),
    true,
  );
  assert.equal(
    shouldTriggerGestureGuide({ alreadyShown: true, isLocked: false, isPipActive: false }),
    false,
  );
  assert.equal(
    shouldTriggerGestureGuide({ alreadyShown: false, isLocked: true, isPipActive: false }),
    false,
  );
  assert.equal(
    shouldTriggerGestureGuide({ alreadyShown: false, isLocked: false, isPipActive: true }),
    false,
  );
});

