import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canScrollReachTarget,
  clearRouteScrollPosition,
  computeSmoothScrollDurationMs,
  easeOutCubic,
  loadRouteScrollPosition,
  normalizeScrollRouteKey,
  recordVisitedRoute,
  resetVisitedRoutesForTest,
  saveRouteScrollPosition,
  shouldNavShellResetScroll,
  shouldRestoreSavedScroll,
  StorageLike,
} from './scrollPersistence';

function createMockStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

test('normalizeScrollRouteKey normalizes root and trailing slashes', () => {
  assert.equal(normalizeScrollRouteKey('/'), '/home');
  assert.equal(normalizeScrollRouteKey('/home/'), '/home');
  assert.equal(normalizeScrollRouteKey('/details/anime/21/'), '/details/anime/21');
});

test('saveRouteScrollPosition and loadRouteScrollPosition round-trip exact pixel offsets', () => {
  resetVisitedRoutesForTest();
  const storage = createMockStorage();

  saveRouteScrollPosition('/home', 1247.6, storage);
  assert.equal(loadRouteScrollPosition('/home', storage), 1248);

  saveRouteScrollPosition('/details/anime/21', 420, storage);
  assert.equal(loadRouteScrollPosition('/details/anime/21', storage), 420);

  clearRouteScrollPosition('/home', storage);
  assert.equal(loadRouteScrollPosition('/home', storage), null);
});

test('shouldRestoreSavedScroll restores on POP or returning from Details to Home', () => {
  assert.equal(
    shouldRestoreSavedScroll({
      routeKey: '/home',
      previousPath: '/details/anime/21',
      navigationType: 'POP',
      savedY: 980,
    }),
    true,
  );

  // Clicking Home icon inside DetailsPage (PUSH) still restores Home scroll
  assert.equal(
    shouldRestoreSavedScroll({
      routeKey: '/home',
      previousPath: '/details/anime/21',
      navigationType: 'PUSH',
      savedY: 980,
    }),
    true,
  );

  // Navigating from Discover -> Home should start fresh at top
  assert.equal(
    shouldRestoreSavedScroll({
      routeKey: '/home',
      previousPath: '/discover',
      navigationType: 'PUSH',
      savedY: 980,
    }),
    false,
  );

  // Opening a fresh Details page from Home starts at top
  assert.equal(
    shouldRestoreSavedScroll({
      routeKey: '/details/anime/21',
      previousPath: '/home',
      navigationType: 'PUSH',
      savedY: 500,
    }),
    false,
  );

  // Returning to Details from Reader (POP) restores Details scroll
  assert.equal(
    shouldRestoreSavedScroll({
      routeKey: '/details/anime/21',
      previousPath: '/reader',
      navigationType: 'POP',
      savedY: 500,
    }),
    true,
  );
});

test('shouldNavShellResetScroll avoids resetting scroll when Home restoration is pending', () => {
  resetVisitedRoutesForTest();
  const storage = createMockStorage();
  saveRouteScrollPosition('/home', 860, storage);

  assert.equal(shouldNavShellResetScroll('/home', '/details/anime/21', 'POP', storage), false);
  assert.equal(shouldNavShellResetScroll('/home', '/details/anime/21', 'PUSH', storage), false);
  assert.equal(shouldNavShellResetScroll('/home', '/discover', 'PUSH', storage), true);
  assert.equal(shouldNavShellResetScroll('/discover', '/home', 'PUSH', storage), true);
});

test('recordVisitedRoute tracks previous and current route across transitions', () => {
  resetVisitedRoutesForTest();
  const storage = createMockStorage();

  const step1 = recordVisitedRoute('/home', storage);
  assert.deepEqual(step1, { previous: null, current: '/home' });

  const step2 = recordVisitedRoute('/details/anime/21', storage);
  assert.deepEqual(step2, { previous: '/home', current: '/details/anime/21' });

  const step3 = recordVisitedRoute('/home', storage);
  assert.deepEqual(step3, { previous: '/details/anime/21', current: '/home' });
});

test('canScrollReachTarget, easeOutCubic, and computeSmoothScrollDurationMs compute bounded animation parameters', () => {
  assert.equal(canScrollReachTarget(2400, 900, 1200), true);
  assert.equal(canScrollReachTarget(1200, 900, 1200), false);
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.5) > 0.5);
  assert.equal(computeSmoothScrollDurationMs(800, true), 0);
  assert.ok(computeSmoothScrollDurationMs(800, false) >= 240);
  assert.ok(computeSmoothScrollDurationMs(5000, false) <= 480);
});
