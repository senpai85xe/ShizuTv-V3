import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ANIME_SOURCE_ID,
  DEFAULT_MANGA_SOURCE_ID,
  filterAvailableSources,
  filterPlayableSourcesForPlayer,
  formatSourceAvailabilityLabel,
  getSourceManagerBadge,
  getSourcePlayabilityStatus,
  isMetadataOnlySource,
  resolveActiveSourceId,
} from './sourcePicker';
import { SourceInfo } from '../types/media';

const SAMPLE_SOURCES: SourceInfo[] = [
  {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '2.1.5',
  },
  {
    id: 'ext-ay-gotaku-en',
    name: 'GOTAKU',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.2.0',
    isNsfw: true,
    baseUrl: 'https://gogoanime.example',
  },
  {
    id: 'ext-my-hianime',
    name: 'HiAnime',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'multi',
    version: '1.0.4',
  },
];

test('getSourceManagerBadge maps source id prefixes and inbuilt type cleanly', () => {
  assert.equal(getSourceManagerBadge(SAMPLE_SOURCES[0]), 'Inbuilt');
  assert.equal(getSourceManagerBadge(SAMPLE_SOURCES[1]), 'Aniyomi');
  assert.equal(getSourceManagerBadge(SAMPLE_SOURCES[2]), 'Mangayomi');
  assert.equal(
    getSourceManagerBadge({ id: 'ext-cs-cloud', type: 'extension' }),
    'CloudStream',
  );
  assert.equal(
    getSourceManagerBadge({ id: 'hianime-bridge', type: 'extension' }),
    'Extension',
  );
});

test('filterAvailableSources filters by name, manager badge, language, and baseUrl', () => {
  assert.equal(filterAvailableSources(SAMPLE_SOURCES, '').length, 3);
  assert.deepEqual(
    filterAvailableSources(SAMPLE_SOURCES, 'gotaku').map((s) => s.id),
    ['ext-ay-gotaku-en'],
  );
  assert.deepEqual(
    filterAvailableSources(SAMPLE_SOURCES, 'aniyomi').map((s) => s.id),
    ['ext-ay-gotaku-en'],
  );
  assert.deepEqual(
    filterAvailableSources(SAMPLE_SOURCES, 'multi').map((s) => s.id),
    ['ext-my-hianime'],
  );
  assert.deepEqual(
    filterAvailableSources(SAMPLE_SOURCES, 'nonexistent'),
    [],
  );
});

test('formatSourceAvailabilityLabel formats loading, resolved count, status, and override flag', () => {
  assert.equal(
    formatSourceAvailabilityLabel({
      mediaType: 'ANIME',
      resolving: true,
      resolvedCount: 0,
    }),
    'Checking episode availability on source...',
  );

  assert.equal(
    formatSourceAvailabilityLabel({
      mediaType: 'ANIME',
      resolving: false,
      resolvedCount: 28,
      status: 'FINISHED',
      hasOverride: true,
    }),
    '28 episodes available · FINISHED · Custom title match',
  );

  assert.equal(
    formatSourceAvailabilityLabel({
      mediaType: 'MANGA',
      resolving: false,
      resolvedCount: 1,
    }),
    '1 chapter available',
  );
});

test('resolveActiveSourceId defaults to ShizuTv and persists explicit user selection until changed', () => {
  const customFirstList: SourceInfo[] = [SAMPLE_SOURCES[1], SAMPLE_SOURCES[0], SAMPLE_SOURCES[2]];

  assert.equal(
    resolveActiveSourceId({
      availableSources: customFirstList,
      preferredSourceId: undefined,
      isManga: false,
    }),
    DEFAULT_ANIME_SOURCE_ID,
  );

  assert.equal(
    resolveActiveSourceId({
      availableSources: customFirstList,
      preferredSourceId: 'ext-ay-gotaku-en',
      isManga: false,
    }),
    'ext-ay-gotaku-en',
  );

  assert.equal(
    resolveActiveSourceId({
      availableSources: customFirstList,
      preferredSourceId: 'removed-extension',
      isManga: false,
    }),
    DEFAULT_ANIME_SOURCE_ID,
  );

  assert.equal(
    resolveActiveSourceId({
      availableSources: [
        {
          id: 'mangadex-bridge',
          name: 'MangaDex',
          type: 'extension',
          mediaTypes: ['MANGA'],
          lang: 'multi',
          version: '1.0',
        },
        {
          id: DEFAULT_MANGA_SOURCE_ID,
          name: 'ShizuTv Reader (Inbuilt)',
          type: 'inbuilt',
          mediaTypes: ['MANGA'],
          lang: 'en',
          version: '2.1.5',
        },
      ],
      preferredSourceId: null,
      isManga: true,
    }),
    DEFAULT_MANGA_SOURCE_ID,
  );
});

test('metadata-only and missing-host sources are flagged and excluded from player/reader lists', () => {
  const anidb: SourceInfo = {
    id: 'ext-ay-anidb',
    name: 'AniDB',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '14.1',
    baseUrl: 'https://anidb.net',
  };
  const mal: SourceInfo = {
    id: 'ext-ay-mal',
    name: 'MyAnimeList',
    type: 'extension',
    mediaTypes: ['ANIME', 'MANGA'],
    lang: 'en',
    version: '14.2',
  };
  const brokenNoHost: SourceInfo = {
    id: 'ext-ay-broken',
    name: 'BrokenNoHost',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0',
  };
  const mangadex: SourceInfo = {
    id: 'mangadex-bridge',
    name: 'MangaDex',
    type: 'extension',
    mediaTypes: ['MANGA'],
    lang: 'multi',
    version: '1.0',
  };

  assert.equal(isMetadataOnlySource(anidb), true);
  assert.equal(isMetadataOnlySource(mal), true);
  assert.equal(isMetadataOnlySource(SAMPLE_SOURCES[0]), false);

  const gotakuReal: SourceInfo = {
    id: 'ext-ay-gotaku-real',
    name: 'Gotaku',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '16.10',
    baseUrl: 'https://gotaku.to',
  };

  assert.equal(getSourcePlayabilityStatus(anidb, 'ANIME'), 'metadata-only');
  assert.equal(getSourcePlayabilityStatus(brokenNoHost, 'ANIME'), 'missing-host');
  assert.equal(getSourcePlayabilityStatus(SAMPLE_SOURCES[1], 'ANIME'), 'playable');
  assert.equal(getSourcePlayabilityStatus(mangadex, 'MANGA'), 'playable');

  const playableAnime = filterPlayableSourcesForPlayer(
    [SAMPLE_SOURCES[0], anidb, mal, brokenNoHost, gotakuReal, SAMPLE_SOURCES[1]],
    'ANIME',
  );
  assert.deepEqual(
    playableAnime.map((s) => s.id),
    ['shonenx-hls-inbuilt', 'ext-ay-gotaku-en'],
  );

  const playableManga = filterPlayableSourcesForPlayer([mangadex, mal, anidb], 'MANGA');
  assert.deepEqual(
    playableManga.map((s) => s.id),
    ['mangadex-bridge'],
  );
});

