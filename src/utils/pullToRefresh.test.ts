import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPullRubberBand,
  computePullIndicatorScale,
  computePullProgress,
  PULL_REFRESH_MAX_PX,
  PULL_REFRESH_THRESHOLD_PX,
  resolvePullPhase,
  shouldStartPullRefresh,
  triggerHapticFeedback,
} from './pullToRefresh';

test('applyPullRubberBand applies progressive asymptotic resistance capped under maxPull', () => {
  assert.equal(applyPullRubberBand(-12), 0);
  assert.equal(applyPullRubberBand(0), 0);
  const half = applyPullRubberBand(80);
  const double = applyPullRubberBand(220);
  assert.ok(half > 35 && half < 80);
  assert.ok(double > half && double < PULL_REFRESH_MAX_PX);
});

test('resolvePullPhase and computePullProgress transition smoothly from idle -> pulling -> armed -> refreshing -> completing', () => {
  assert.equal(resolvePullPhase(0, false), 'idle');
  assert.equal(resolvePullPhase(40, false), 'pulling');
  assert.equal(resolvePullPhase(PULL_REFRESH_THRESHOLD_PX, false), 'armed');
  assert.equal(resolvePullPhase(20, true), 'refreshing');
  assert.equal(resolvePullPhase(20, false, true), 'completing');

  assert.equal(computePullProgress(0), 0);
  assert.equal(computePullProgress(PULL_REFRESH_THRESHOLD_PX / 2), 0.5);
  assert.equal(computePullProgress(PULL_REFRESH_THRESHOLD_PX * 2), 1);
  assert.ok(computePullIndicatorScale(0.5, false) < 1);
  assert.equal(computePullIndicatorScale(1, true), 1.04);
});

test('shouldStartPullRefresh activates only at top scrollY for downward vertical gestures', () => {
  assert.equal(
    shouldStartPullRefresh({
      scrollY: 0,
      deltaY: 22,
      deltaX: 3,
      isRestoringScroll: false,
      isInteractiveTarget: false,
      isRefreshing: false,
    }),
    true,
  );
  assert.equal(
    shouldStartPullRefresh({
      scrollY: 120,
      deltaY: 30,
      deltaX: 0,
      isRestoringScroll: false,
      isInteractiveTarget: false,
      isRefreshing: false,
    }),
    false,
  );
  assert.equal(
    shouldStartPullRefresh({
      scrollY: 0,
      deltaY: 14,
      deltaX: 30,
      isRestoringScroll: false,
      isInteractiveTarget: false,
      isRefreshing: false,
    }),
    false,
  );
  assert.equal(
    shouldStartPullRefresh({
      scrollY: 0,
      deltaY: 30,
      deltaX: 0,
      isRestoringScroll: true,
      isInteractiveTarget: false,
      isRefreshing: false,
    }),
    false,
  );
});

test('triggerHapticFeedback invokes navigator.vibrate unless reducedMotion is enabled', () => {
  const calls: Array<number | number[]> = [];
  const mockNav = {
    vibrate: (pattern: number | number[]) => {
      calls.push(pattern);
      return true;
    },
  };
  assert.equal(triggerHapticFeedback('armed', mockNav, false), true);
  assert.equal(triggerHapticFeedback('success', mockNav, false), true);
  assert.deepEqual(calls, [12, [10, 26, 14]]);
  assert.equal(triggerHapticFeedback('armed', mockNav, true), false);
});
