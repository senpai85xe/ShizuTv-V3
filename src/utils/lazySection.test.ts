import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canTriggerLazySection,
  clearSectionFetchKey,
  getObserverLoadResetKey,
  getSectionFetchKey,
  shouldEagerLoadSection,
  shouldFallbackToImmediateLoad,
} from './lazySection';

test('shouldEagerLoadSection marks only the first discovery section as eager', () => {
  assert.equal(shouldEagerLoadSection('trending-anime', 'trending-anime'), true);
  assert.equal(shouldEagerLoadSection('popular-anime', 'trending-anime'), false);
  assert.equal(shouldEagerLoadSection('trending-anime', undefined), false);
  assert.equal(shouldEagerLoadSection('', 'trending-anime'), false);
});

test('getSectionFetchKey scopes keys by tracker, adult mode, and section id', () => {
  const k1 = getSectionFetchKey('popular-anime', 'anilist', 'off');
  const k2 = getSectionFetchKey('popular-anime', 'kitsu', 'off');
  const k3 = getSectionFetchKey('popular-anime', 'anilist', 'only');
  assert.notEqual(k1, k2);
  assert.notEqual(k1, k3);
  assert.equal(
    getObserverLoadResetKey('anilist', 'off'),
    'anilist:off',
  );
});

test('canTriggerLazySection deduplicates triggered keys and clearSectionFetchKey allows retry', () => {
  const triggered = new Set<string>();
  const key = getSectionFetchKey('top-rated-anime', 'anilist', 'off');

  assert.equal(canTriggerLazySection(key, triggered), true);
  triggered.add(key);
  assert.equal(canTriggerLazySection(key, triggered), false);

  clearSectionFetchKey(key, triggered);
  assert.equal(canTriggerLazySection(key, triggered), true);
});

test('shouldFallbackToImmediateLoad triggers immediately when eager or IntersectionObserver missing', () => {
  assert.equal(shouldFallbackToImmediateLoad(true, true), true);
  assert.equal(shouldFallbackToImmediateLoad(false, false), true);
  assert.equal(shouldFallbackToImmediateLoad(true, false), false);
});
