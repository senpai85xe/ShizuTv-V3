import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStableMediaResultKeys,
  classifyResultTransitions,
  computeGridFlipDeltas,
  formatSortLabel,
  resolveSearchExpansionState,
  SEARCH_EXPAND_EASING,
} from './searchMotion';

test('buildStableMediaResultKeys preserves identity across reorders and disambiguates duplicates', () => {
  const keys = buildStableMediaResultKeys([
    { id: '16498', type: 'ANIME' },
    { id: '21', type: 'ANIME' },
    { id: '16498', type: 'MANGA' },
    { id: '16498', type: 'ANIME' },
  ]);
  assert.deepEqual(keys, ['ANIME-16498', 'ANIME-21', 'MANGA-16498', 'ANIME-16498#1']);
});

test('computeGridFlipDeltas computes inverse dx/dy offsets only for moved items', () => {
  const prev = new Map([
    ['ANIME-1', { left: 20, top: 100 }],
    ['ANIME-2', { left: 220, top: 100 }],
    ['ANIME-3', { left: 420, top: 100 }],
  ]);
  const next = new Map([
    ['ANIME-2', { left: 20, top: 100 }],
    ['ANIME-1', { left: 220, top: 100 }],
    ['ANIME-3', { left: 420, top: 100 }],
    ['ANIME-4', { left: 20, top: 380 }],
  ]);

  const deltas = computeGridFlipDeltas(prev, next);
  assert.deepEqual(deltas.get('ANIME-2'), { dx: 200, dy: 0 });
  assert.deepEqual(deltas.get('ANIME-1'), { dx: -200, dy: 0 });
  assert.equal(deltas.has('ANIME-3'), false);
  assert.equal(deltas.has('ANIME-4'), false);
});

test('classifyResultTransitions separates entering, moving, and staying items cleanly', () => {
  const prevKeys = new Set(['ANIME-1', 'ANIME-2', 'ANIME-3']);
  const nextKeys = ['ANIME-2', 'ANIME-1', 'ANIME-3', 'ANIME-4'];
  const deltas = new Map([
    ['ANIME-2', { dx: 200, dy: 0 }],
    ['ANIME-1', { dx: -200, dy: 0 }],
  ]);

  const kinds = classifyResultTransitions(prevKeys, nextKeys, deltas);
  assert.equal(kinds.get('ANIME-2'), 'move');
  assert.equal(kinds.get('ANIME-1'), 'move');
  assert.equal(kinds.get('ANIME-3'), 'stay');
  assert.equal(kinds.get('ANIME-4'), 'enter');
});

test('formatSortLabel maps SearchSort values to readable labels', () => {
  assert.equal(formatSortLabel('POPULARITY_DESC'), 'Popularity');
  assert.equal(formatSortLabel('TRENDING_DESC'), 'Trending');
  assert.equal(formatSortLabel('SCORE_DESC'), 'Highest Score');
  assert.equal(formatSortLabel('FAVOURITES_DESC'), 'Favourites');
  assert.equal(formatSortLabel('START_DATE_DESC'), 'Newest');
  assert.equal(formatSortLabel('SEARCH_MATCH'), 'Best Match');
});

test('resolveSearchExpansionState activates on focus, query, filters, or category and exposes custom bezier', () => {
  assert.match(SEARCH_EXPAND_EASING, /^cubic-bezier\(/);
  assert.equal(
    resolveSearchExpansionState({
      searchFocused: false,
      queryInput: '   ',
      hasActiveFilters: false,
      categoryTitle: null,
    }),
    false,
  );
  assert.equal(
    resolveSearchExpansionState({
      searchFocused: true,
      queryInput: '',
      hasActiveFilters: false,
      categoryTitle: null,
    }),
    true,
  );
  assert.equal(
    resolveSearchExpansionState({
      searchFocused: false,
      queryInput: 'frieren',
      hasActiveFilters: false,
      categoryTitle: null,
    }),
    true,
  );
  assert.equal(
    resolveSearchExpansionState({
      searchFocused: false,
      queryInput: '',
      hasActiveFilters: true,
      categoryTitle: null,
    }),
    true,
  );
  assert.equal(
    resolveSearchExpansionState({
      searchFocused: false,
      queryInput: '',
      hasActiveFilters: false,
      categoryTitle: 'Action',
    }),
    true,
  );
});
