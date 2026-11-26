import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMediaItemKey,
  buildMediaScopeKey,
  computeInitialVisibleEpisodeCount,
  computeNextVisibleEpisodeCount,
  DEFAULT_EPISODE_CHAPTER_STYLE,
  EPISODE_CHAPTER_STYLE_ORDER,
  EPISODE_RENDER_BATCH_SIZE,
  formatChapterMetaLine,
  formatDownloadProgressPercent,
  formatEpisodeDurationLabel,
  formatEpisodeMetaLine,
  getEpisodeChapterContainerClass,
  getNextEpisodeChapterStyle,
  isEpisodeOrChapterWatched,
  LARGE_EPISODE_LIST_THRESHOLD,
  MAX_ANIMATED_EPISODE_ROWS,
  resolveEpisodeChapterStyle,
  shouldAnimateEpisodeRow,
  shouldUseLightweightEpisodeRow,
} from './episodeChapterStyle';

test('resolveEpisodeChapterStyle defaults to classic and preserves valid styles', () => {
  assert.equal(DEFAULT_EPISODE_CHAPTER_STYLE, 'classic');
  assert.equal(resolveEpisodeChapterStyle(undefined), 'classic');
  assert.equal(resolveEpisodeChapterStyle('unknown'), 'classic');
  for (const style of EPISODE_CHAPTER_STYLE_ORDER) {
    assert.equal(resolveEpisodeChapterStyle(style), style);
  }
});

test('getNextEpisodeChapterStyle cycles through all 5 styles in order', () => {
  assert.equal(getNextEpisodeChapterStyle('classic'), 'grid');
  assert.equal(getNextEpisodeChapterStyle('grid'), 'box');
  assert.equal(getNextEpisodeChapterStyle('box'), 'compact');
  assert.equal(getNextEpisodeChapterStyle('compact'), 'cover');
  assert.equal(getNextEpisodeChapterStyle('cover'), 'classic');
});

test('getEpisodeChapterContainerClass outputs distinct layout classes per style with frosted blur for compact', () => {
  assert.match(getEpisodeChapterContainerClass('grid', false), /\bgrid-cols-2\b/);
  assert.match(getEpisodeChapterContainerClass('box', false), /\bgrid-cols-4\b/);
  const compactCls = getEpisodeChapterContainerClass('compact', false);
  assert.match(compactCls, /\bdivide-y\b/);
  assert.match(compactCls, /\bbackdrop-blur-lg\b/);
  assert.match(getEpisodeChapterContainerClass('cover', false), /\bgrid-cols-1\b/);
  assert.match(getEpisodeChapterContainerClass('classic', true), /\bgrid-cols-1\b/);
});

test('formatEpisodeDurationLabel and meta formatters handle optional fields cleanly', () => {
  assert.equal(formatEpisodeDurationLabel(1440), '24m');
  assert.equal(formatEpisodeDurationLabel(0), null);
  assert.equal(
    formatEpisodeMetaLine({
      id: 'ep-1',
      number: 1,
      title: 'Pilot',
      airDate: '1mo ago',
      durationSeconds: 1440,
    }),
    '1mo ago · 24m',
  );
  assert.equal(
    formatEpisodeMetaLine({ id: 'ep-2', number: 2, title: 'Next' }),
    'Sub & Dub',
  );
  assert.equal(
    formatChapterMetaLine({
      id: 'ch-1',
      number: 1,
      title: 'Romance Dawn',
      scanlator: 'Official Release',
      pageCount: 19,
    }),
    'Official Release · 19 pages',
  );
});

test('progressive episode rendering batches 100+ lists without capping total access', () => {
  assert.equal(computeInitialVisibleEpisodeCount(0), 0);
  assert.equal(computeInitialVisibleEpisodeCount(24), 24);
  assert.equal(computeInitialVisibleEpisodeCount(1180), EPISODE_RENDER_BATCH_SIZE);

  let visible = computeInitialVisibleEpisodeCount(120);
  visible = computeNextVisibleEpisodeCount(visible, 120);
  assert.equal(visible, Math.min(120, EPISODE_RENDER_BATCH_SIZE * 2));
  visible = computeNextVisibleEpisodeCount(visible, 120);
  assert.equal(visible, 120);

  assert.equal(shouldUseLightweightEpisodeRow(LARGE_EPISODE_LIST_THRESHOLD), false);
  assert.equal(shouldUseLightweightEpisodeRow(LARGE_EPISODE_LIST_THRESHOLD + 1), true);
  assert.equal(shouldAnimateEpisodeRow(0, false), true);
  assert.equal(shouldAnimateEpisodeRow(MAX_ANIMATED_EPISODE_ROWS, false), false);
  assert.equal(shouldAnimateEpisodeRow(0, true), false);
});

test('watched state, bookmark keys, and download percentage helpers behave predictably', () => {
  assert.equal(buildMediaItemKey('21', 'ANIME', 5), '21-ANIME-5');
  assert.equal(buildMediaScopeKey('21', 'ANIME'), '21-ANIME');

  const watched = new Set([7, 12]);
  assert.equal(isEpisodeOrChapterWatched({ itemNumber: 2, currentProgress: 3, watchedSet: watched }), true);
  assert.equal(isEpisodeOrChapterWatched({ itemNumber: 7, currentProgress: 0, watchedSet: watched }), true);
  assert.equal(isEpisodeOrChapterWatched({ itemNumber: 8, currentProgress: 3, watchedSet: watched }), false);
  assert.equal(
    isEpisodeOrChapterWatched({ itemNumber: 3, currentProgress: 3, watchedSet: watched, isCurrent: true }),
    false,
  );

  assert.equal(formatDownloadProgressPercent(Number.NaN), 0);
  assert.equal(formatDownloadProgressPercent(-0.2), 0);
  assert.equal(formatDownloadProgressPercent(0.467), 47);
  assert.equal(formatDownloadProgressPercent(1.4), 100);
});

