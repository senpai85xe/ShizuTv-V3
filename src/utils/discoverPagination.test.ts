import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANILIST_MAX_NAVIGABLE_PAGE,
  buildPaginationTokens,
  computeDiscoverTotalPages,
} from './discoverPagination';

test('buildPaginationTokens renders compact sequences cleanly for <= 5 pages', () => {
  assert.deepEqual(buildPaginationTokens(1, 1), [1]);
  assert.deepEqual(buildPaginationTokens(1, 2), [1, 2]);
  assert.deepEqual(buildPaginationTokens(3, 5), [1, 2, 3, 4, 5]);
});

test('buildPaginationTokens matches reference ellipsis format on page 1 and middle/end pages', () => {
  assert.deepEqual(buildPaginationTokens(1, 247), [1, 2, 'ellipsis', 247]);
  assert.deepEqual(buildPaginationTokens(2, 247), [1, 2, 3, 'ellipsis', 247]);
  assert.deepEqual(buildPaginationTokens(3, 247), [1, 2, 3, 4, 'ellipsis', 247]);
  assert.deepEqual(buildPaginationTokens(4, 247), [1, 2, 3, 4, 5, 'ellipsis', 247]);
  assert.deepEqual(buildPaginationTokens(5, 247), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 247]);
  assert.deepEqual(buildPaginationTokens(247, 247), [1, 'ellipsis', 246, 247]);
});

test('computeDiscoverTotalPages calculates exact pages for small and large totals and respects tracker depth cap', () => {
  assert.equal(
    computeDiscoverTotalPages({
      totalCount: 26,
      loadedCount: 24,
      hasNextPage: true,
      currentPage: 1,
      maxTrackerPages: ANILIST_MAX_NAVIGABLE_PAGE,
    }),
    2,
  );
  assert.equal(
    computeDiscoverTotalPages({
      totalCount: 5372,
      loadedCount: 24,
      hasNextPage: true,
      currentPage: 1,
      maxTrackerPages: ANILIST_MAX_NAVIGABLE_PAGE,
    }),
    208,
  );
  assert.equal(
    computeDiscoverTotalPages({
      totalCount: 5372,
      loadedCount: 24,
      hasNextPage: true,
      currentPage: 1,
    }),
    224,
  );
});
