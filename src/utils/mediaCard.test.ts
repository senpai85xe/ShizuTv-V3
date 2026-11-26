import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultCardStylePrefs,
  formatCardFormatTag,
  formatCardUnitLabel,
  formatContinueStepLabel,
  formatRemainingLabel,
  formatTrendingGenreLabel,
  getContinueWatchingWidthClass,
  getMediaGridClassName,
  mergeContinueHistoryItems,
  resolveContinueCardStyle,
  resolveMediaCardStyle,
  selectMediaCardStyle,
} from './mediaCard';
import { HistoryEntry, LibraryEntry, UnifiedMedia } from '../types/media';

const baseMedia = (overrides: Partial<UnifiedMedia> = {}): UnifiedMedia => ({
  id: '1',
  type: 'ANIME',
  title: { english: 'Sample' },
  format: 'TV',
  year: 2026,
  score: 8.7,
  ...overrides,
});

test('formatCardFormatTag returns uppercase format or media type fallback', () => {
  assert.equal(formatCardFormatTag(baseMedia({ format: 'TV' })), 'TV');
  assert.equal(formatCardFormatTag(baseMedia({ format: null, type: 'MANGA' })), 'MANGA');
});

test('formatCardUnitLabel zero-pads single-digit episodes and uses aired count when nextEpisode exists', () => {
  assert.equal(formatCardUnitLabel(baseMedia({ episodes: 4 })), 'EP 04');
  assert.equal(formatCardUnitLabel(baseMedia({ nextEpisode: 6, episodes: 12 })), 'EP 05');
  assert.equal(formatCardUnitLabel(baseMedia({ episodes: 1181 })), 'EP 1181');
  assert.equal(formatCardUnitLabel(baseMedia({ episodes: null, nextEpisode: null })), null);
});

test('formatCardUnitLabel formats chapters for manga', () => {
  assert.equal(
    formatCardUnitLabel(baseMedia({ type: 'MANGA', chapters: 9 })),
    'CH 09',
  );
  assert.equal(
    formatCardUnitLabel(baseMedia({ type: 'MANGA', chapters: 120 })),
    'CH 120',
  );
  assert.equal(
    formatCardUnitLabel(baseMedia({ type: 'MANGA', chapters: null })),
    null,
  );
});

test('formatContinueStepLabel outputs Episode/Chapter labels', () => {
  assert.equal(formatContinueStepLabel(false, 6), 'Episode 6');
  assert.equal(formatContinueStepLabel(false), 'Episode 1');
  assert.equal(formatContinueStepLabel(true, 14), 'Chapter 14');
});

test('formatRemainingLabel computes minutes left for anime and pages left for manga', () => {
  assert.equal(
    formatRemainingLabel({
      isManga: false,
      positionSeconds: 300,
      durationSeconds: 1440,
    }),
    '19m left',
  );
  assert.equal(
    formatRemainingLabel({
      isManga: false,
      positionSeconds: 0,
      defaultDurationMinutes: 24,
    }),
    '24m left',
  );
  assert.equal(
    formatRemainingLabel({
      isManga: true,
      pageIndex: 4,
      totalPages: 20,
    }),
    '15p left',
  );
  assert.equal(
    formatRemainingLabel({
      isManga: true,
      pageIndex: 19,
      totalPages: 20,
    }),
    'Done',
  );
});

test('getMediaGridClassName returns expected grid layouts for media card and continue row styles', () => {
  assert.match(getMediaGridClassName('showcase'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('shizutv'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('classic'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('glassPoster'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('auroraPill'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('prismFrame'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('episodeTile'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('glassResume'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('splitProgress'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('auroraStrip'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('trendingRank'), /\bgrid-cols-2\b/);
  assert.match(getMediaGridClassName('posterBar'), /\bgrid-cols-1\b/);
});

test('getContinueWatchingWidthClass matches fixed rail sizes and fullWidth grid sizing', () => {
  assert.equal(getContinueWatchingWidthClass(false), 'shrink-0 w-[174px] sm:w-[244px]');
  assert.equal(getContinueWatchingWidthClass(true), 'w-full');
});

test('formatTrendingGenreLabel prefers primary genre and falls back to format or type', () => {
  assert.equal(
    formatTrendingGenreLabel(baseMedia({ genres: ['Adventure', 'Action'] })),
    'Adventure',
  );
  assert.equal(
    formatTrendingGenreLabel(baseMedia({ genres: [], format: 'TV' })),
    'TV',
  );
  assert.equal(
    formatTrendingGenreLabel(baseMedia({ genres: undefined, format: null, type: 'MANGA' })),
    'MANGA',
  );
});

test('mergeContinueHistoryItems prioritizes local history and maps unique cloud entries', () => {
  const local: HistoryEntry[] = [
    {
      id: 'local-1',
      mediaId: '1',
      mediaType: 'ANIME',
      media: baseMedia({ id: '1' }),
      episodeNumber: 5,
      updatedAt: '2026-11-15T00:00:00.000Z',
    },
  ];
  const cloud: LibraryEntry[] = [
    {
      mediaId: '1',
      mediaType: 'ANIME',
      media: baseMedia({ id: '1' }),
      status: 'CURRENT',
      progress: 4,
      score: 9,
      updatedAt: '2026-11-14T00:00:00.000Z',
      trackerType: 'anilist',
    },
    {
      mediaId: '2',
      mediaType: 'ANIME',
      media: baseMedia({ id: '2', title: { english: 'Cloud Anime' } }),
      status: 'CURRENT',
      progress: 7,
      score: 8,
      updatedAt: '2026-11-14T00:00:00.000Z',
      trackerType: 'anilist',
    },
  ];

  const merged = mergeContinueHistoryItems(local, cloud, false);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.id, 'local-1');
  assert.equal(merged[0]?.episodeNumber, 5);
  assert.equal(merged[1]?.mediaId, '2');
  assert.equal(merged[1]?.episodeNumber, 8);
});

test('createDefaultCardStylePrefs defaults cardStyle to shizutv and Continue styles to episodeTile', () => {
  const defaults = createDefaultCardStylePrefs();
  assert.equal(defaults.cardStyle, 'shizutv');
  assert.equal(defaults.continueWatchingStyle, 'episodeTile');
  assert.equal(defaults.continueReadingStyle, 'episodeTile');
});

test('selectMediaCardStyle updates only cardStyle and preserves Continue Row overrides', () => {
  const initial = createDefaultCardStylePrefs();
  const afterShizuTv = selectMediaCardStyle(initial, 'shizutv');
  assert.equal(afterShizuTv.cardStyle, 'shizutv');
  assert.equal(afterShizuTv.continueWatchingStyle, 'episodeTile');
  assert.equal(afterShizuTv.continueReadingStyle, 'episodeTile');

  const customized = {
    ...afterShizuTv,
    continueWatchingStyle: 'glassResume' as const,
    continueReadingStyle: 'posterBar' as const,
  };
  const afterClassic = selectMediaCardStyle(customized, 'glassPoster');
  assert.equal(afterClassic.cardStyle, 'glassPoster');
  assert.equal(afterClassic.continueWatchingStyle, 'glassResume');
  assert.equal(afterClassic.continueReadingStyle, 'posterBar');
});

test('resolveMediaCardStyle and resolveContinueCardStyle sanitize removed legacy IDs cleanly', () => {
  assert.equal(resolveMediaCardStyle('wideBanner'), 'shizutv');
  assert.equal(resolveMediaCardStyle('cinematic'), 'shizutv');
  assert.equal(resolveMediaCardStyle('studioCard'), 'shizutv');
  assert.equal(resolveMediaCardStyle('neon'), 'shizutv');
  assert.equal(resolveMediaCardStyle('expressive'), 'shizutv');
  assert.equal(resolveMediaCardStyle('auroraPill'), 'auroraPill');
  assert.equal(resolveMediaCardStyle('prismFrame'), 'prismFrame');

  assert.equal(resolveContinueCardStyle('classic'), 'episodeTile');
  assert.equal(resolveContinueCardStyle('episodeTile'), 'episodeTile');
  assert.equal(resolveContinueCardStyle('glassResume'), 'glassResume');
  assert.equal(resolveContinueCardStyle('posterBar'), 'posterBar');
  assert.equal(resolveContinueCardStyle('splitProgress'), 'splitProgress');
  assert.equal(resolveContinueCardStyle('auroraStrip'), 'auroraStrip');
});
