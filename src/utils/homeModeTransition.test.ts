import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeHomeModeTransition,
  createInitialHomeModeTransition,
  startHomeModeTransition,
} from './homeModeTransition';

test('createInitialHomeModeTransition initializes settled state without exit layer', () => {
  const initial = createInitialHomeModeTransition('ANIME');
  assert.deepEqual(initial, {
    activeMode: 'ANIME',
    exitingMode: null,
    isTransitioning: false,
    transitionId: 0,
  });
});

test('startHomeModeTransition is a no-op when selecting the already active mode', () => {
  const initial = createInitialHomeModeTransition('ANIME');
  const next = startHomeModeTransition(initial, 'ANIME');
  assert.equal(next, initial);
});

test('startHomeModeTransition sets outgoing and incoming layers and increments transitionId', () => {
  const initial = createInitialHomeModeTransition('ANIME');
  const transitioning = startHomeModeTransition(initial, 'MANGA');

  assert.deepEqual(transitioning, {
    activeMode: 'MANGA',
    exitingMode: 'ANIME',
    isTransitioning: true,
    transitionId: 1,
  });
});

test('completeHomeModeTransition clears exiting layer only when transitionId matches', () => {
  const s1 = startHomeModeTransition(createInitialHomeModeTransition('ANIME'), 'MANGA');
  const s2 = startHomeModeTransition(s1, 'ANIME');

  // Stale timer from transition 1 must be ignored
  const afterStaleComplete = completeHomeModeTransition(s2, 1);
  assert.equal(afterStaleComplete, s2);
  assert.equal(afterStaleComplete.isTransitioning, true);
  assert.equal(afterStaleComplete.exitingMode, 'MANGA');

  // Current transition 2 completes cleanly
  const settled = completeHomeModeTransition(s2, 2);
  assert.deepEqual(settled, {
    activeMode: 'ANIME',
    exitingMode: null,
    isTransitioning: false,
    transitionId: 2,
  });
});

test('startHomeModeTransition skips transition state when reducedMotion is enabled', () => {
  const initial = createInitialHomeModeTransition('ANIME');
  const next = startHomeModeTransition(initial, 'MANGA', true);

  assert.deepEqual(next, {
    activeMode: 'MANGA',
    exitingMode: null,
    isTransitioning: false,
    transitionId: 1,
  });
});
