import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGenreDetailUrl,
  getGenreCategoryDescriptor,
  resolveGenreDescriptorFromRoute,
} from './genreMetadata';
import {
  buildOftenPairedCategories,
  buildRelatedCategoryCards,
  getGenreEditorialDescription,
  resolveGenreStats,
} from './genreDetailData';
import { UnifiedMedia } from '../types/media';

test('buildGenreDetailUrl and resolveGenreDescriptorFromRoute round-trip curated genres, worlds, and custom tags', () => {
  const action = getGenreCategoryDescriptor('Action', 'genre', 'ANIME');
  const actionUrl = buildGenreDetailUrl(action, 'ANIME');
  assert.equal(actionUrl, '/genre/action?type=ANIME');

  const resolvedAction = resolveGenreDescriptorFromRoute('action', 'ANIME');
  assert.equal(resolvedAction.id, 'action');
  assert.equal(resolvedAction.label, 'Action');
  assert.equal(resolvedAction.filterKind, 'genre');

  const sliceManga = getGenreCategoryDescriptor('Slice of life', 'genre', 'MANGA');
  const sliceUrl = buildGenreDetailUrl(sliceManga, 'MANGA');
  assert.equal(sliceUrl, '/genre/slice-of-life?type=MANGA');
  const resolvedSlice = resolveGenreDescriptorFromRoute('slice-of-life', 'MANGA');
  assert.equal(resolvedSlice.id, 'slice-of-life');
  assert.deepEqual(resolvedSlice.filterValues, ['Slice of Life']);

  const isekaiTag = getGenreCategoryDescriptor('Isekai', 'tag', 'ANIME');
  const isekaiUrl = buildGenreDetailUrl(isekaiTag, 'ANIME');
  assert.equal(isekaiUrl, '/genre/tag-isekai?type=ANIME&kind=tag&name=Isekai');

  const resolvedIsekaiFromSlug = resolveGenreDescriptorFromRoute('tag-isekai', 'ANIME');
  assert.equal(resolvedIsekaiFromSlug.filterKind, 'tag');
  assert.deepEqual(resolvedIsekaiFromSlug.filterValues, ['Isekai']);

  const resolvedCustomTag = resolveGenreDescriptorFromRoute(
    'tag-time-loop',
    'MANGA',
    'tag',
    'Time Loop',
  );
  assert.equal(resolvedCustomTag.filterKind, 'tag');
  assert.deepEqual(resolvedCustomTag.filterValues, ['Time Loop']);
});

test('getGenreEditorialDescription adapts copy cleanly for Anime vs Manga and fallback tags', () => {
  const horror = getGenreCategoryDescriptor('Horror', 'genre', 'ANIME');
  const animeCopy = getGenreEditorialDescription(horror, 'ANIME');
  const mangaCopy = getGenreEditorialDescription(horror, 'MANGA');

  assert.ok(animeCopy.length > 40);
  assert.ok(animeCopy.includes('after the credits roll'));
  assert.ok(mangaCopy.includes('long after the final chapter'));

  const isekai = getGenreCategoryDescriptor('Isekai', 'tag', 'ANIME');
  const isekaiCopy = getGenreEditorialDescription(isekai, 'ANIME');
  assert.ok(isekaiCopy.includes('Isekai'));
});

test('resolveGenreStats reconciles live AniList counts (<5000) and falls back cleanly for broad (>=5000) or missing counts', () => {
  const action = getGenreCategoryDescriptor('Action', 'genre', 'ANIME');
  const broadStats = resolveGenreStats({
    descriptor: action,
    mediaType: 'ANIME',
    liveCounts: {
      total: 5000,
      ongoing: 312,
      completed: 5000,
      newThisMonth: 19,
    },
  });

  assert.equal(broadStats.totalSeries, action.numericCount);
  assert.equal(broadStats.ongoingSeries, 312);
  assert.ok(broadStats.completedSeries > 0);
  assert.ok(broadStats.ongoingSeries + broadStats.completedSeries <= broadStats.totalSeries);
  assert.equal(broadStats.newThisMonth, 19);

  const thriller = getGenreCategoryDescriptor('Thriller', 'genre', 'ANIME');
  const exactStats = resolveGenreStats({
    descriptor: thriller,
    mediaType: 'ANIME',
    liveCounts: {
      total: 412,
      ongoing: 28,
      completed: 340,
      newThisMonth: 4,
    },
  });
  assert.equal(exactStats.totalSeries, 412);
  assert.equal(exactStats.ongoingSeries, 28);
  assert.equal(exactStats.completedSeries, 340);
  assert.equal(exactStats.newThisMonth, 4);

  const offlineStats = resolveGenreStats({
    descriptor: thriller,
    mediaType: 'MANGA',
    liveCounts: null,
  });
  assert.ok(offlineStats.totalSeries > 0);
  assert.ok(offlineStats.ongoingSeries > 0);
  assert.ok(offlineStats.completedSeries > 0);
  assert.ok(offlineStats.ongoingSeries + offlineStats.completedSeries <= offlineStats.totalSeries);
  assert.ok(offlineStats.newThisMonth >= 2);
});

test('buildOftenPairedCategories prioritizes dynamic co-occurring genres/tags and excludes self', () => {
  const action = getGenreCategoryDescriptor('Action', 'genre', 'ANIME');
  const sampleMedia: UnifiedMedia[] = [
    {
      id: '1',
      type: 'ANIME',
      title: { english: 'Sample One' },
      genres: ['Action', 'Fantasy', 'Adventure'],
      tags: [
        { id: 't1', name: 'Swordplay', rank: 90 },
        { id: 't2', name: 'Low Rank Noise', rank: 20 },
      ],
    },
    {
      id: '2',
      type: 'ANIME',
      title: { english: 'Sample Two' },
      genres: ['Action', 'Fantasy', 'Sci-Fi', 'Hentai'],
      tags: [{ id: 't1', name: 'Swordplay', rank: 85 }],
    },
  ];

  const paired = buildOftenPairedCategories(action, 'ANIME', sampleMedia, 8);
  assert.equal(paired.length, 8);
  assert.equal(paired.some((p) => p.id === 'action'), false);
  assert.equal(paired.some((p) => p.label.toLowerCase() === 'hentai'), false);
  assert.equal(paired.some((p) => p.label === 'Low Rank Noise'), false);
  assert.equal(paired[0]!.id, 'fantasy');
  assert.ok(paired.some((p) => p.label === 'Swordplay'));
});

test('buildRelatedCategoryCards returns distinct related categories excluding current genre', () => {
  const romance = getGenreCategoryDescriptor('Romance', 'genre', 'MANGA');
  const paired = buildOftenPairedCategories(romance, 'MANGA', [], 8);
  const related = buildRelatedCategoryCards(romance, 'MANGA', paired, 4);

  assert.equal(related.length, 4);
  const ids = new Set(related.map((r) => r.id));
  assert.equal(ids.size, 4);
  assert.equal(ids.has('romance'), false);
  for (const card of related) {
    assert.equal(card.covers.length, 3);
    assert.ok(card.numericCount > 0);
  }
});
