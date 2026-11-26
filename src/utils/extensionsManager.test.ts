import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectAvailableExtensionLanguages,
  filterExtensions,
  formatExtensionLangChip,
  formatExtensionLangGroup,
  formatExtensionVersion,
  getExtensionManagerType,
  groupExtensionsByLanguage,
  reorderSourceIds,
  sortSourcesByOrder,
} from './extensionsManager';
import { SourceInfo } from '../types/media';

const SAMPLE_SOURCES: SourceInfo[] = [
  {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream',
    type: 'inbuilt',
    mediaTypes: ['ANIME', 'TV'],
    lang: 'en',
    version: '2.1.5',
  },
  {
    id: 'ext-ay-gotaku',
    name: 'Gotaku',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '16.10',
    isNsfw: true,
  },
  {
    id: 'ext-ay-aniworld',
    name: 'AniWorld',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'de',
    version: '14.43',
  },
  {
    id: 'ext-my-mangapark',
    name: 'MangaPark',
    type: 'extension',
    mediaTypes: ['MANGA'],
    lang: 'en',
    version: '1.2.0',
  },
  {
    id: 'ext-cs-superstream',
    name: 'SuperStream',
    type: 'extension',
    mediaTypes: ['MANGA'],
    lang: 'multi',
    version: '3.0.1',
  },
];

test('formatting helpers return clean uppercase chips, titles, and version strings', () => {
  assert.equal(formatExtensionLangChip('en'), 'ENGLISH');
  assert.equal(formatExtensionLangChip('de'), 'DEUTSCH');
  assert.equal(formatExtensionLangGroup('de'), 'Deutsch');
  assert.equal(formatExtensionLangGroup('multi'), 'Multi-Language');
  assert.equal(formatExtensionVersion('16.10'), 'V16.10');
  assert.equal(formatExtensionVersion('v2.1.5'), 'V2.1.5');
});

test('getExtensionManagerType maps prefixes cleanly', () => {
  assert.equal(getExtensionManagerType(SAMPLE_SOURCES[0]), 'inbuilt');
  assert.equal(getExtensionManagerType(SAMPLE_SOURCES[1]), 'aniyomi');
  assert.equal(getExtensionManagerType(SAMPLE_SOURCES[3]), 'mangayomi');
  assert.equal(getExtensionManagerType(SAMPLE_SOURCES[4]), 'cloudstream');
});

test('filterExtensions and groupExtensionsByLanguage filter by media tab, manager, language, and query', () => {
  const animeOnly = filterExtensions(SAMPLE_SOURCES, {
    mediaTab: 'ANIME',
    query: '',
    managerFilter: 'all',
    langFilter: 'all',
  });
  assert.deepEqual(
    animeOnly.map((s) => s.id),
    ['shonenx-hls-inbuilt', 'ext-ay-gotaku', 'ext-ay-aniworld'],
  );

  const germanAniyomi = filterExtensions(SAMPLE_SOURCES, {
    mediaTab: 'ANIME',
    query: 'world',
    managerFilter: 'aniyomi',
    langFilter: 'de',
  });
  assert.deepEqual(
    germanAniyomi.map((s) => s.id),
    ['ext-ay-aniworld'],
  );

  const grouped = groupExtensionsByLanguage(animeOnly);
  assert.deepEqual(
    grouped.map((g) => g.group),
    ['Deutsch', 'English'],
  );
  assert.equal(grouped[0].items[0].name, 'AniWorld');
  assert.equal(grouped[1].items.length, 2);
});

test('sortSourcesByOrder and reorderSourceIds maintain deterministic ordering and deduplicate IDs', () => {
  const reorderedIds = reorderSourceIds(
    ['shonenx-hls-inbuilt', 'ext-ay-gotaku', 'ext-ay-aniworld'],
    'ext-ay-aniworld',
    'shonenx-hls-inbuilt',
  );
  assert.deepEqual(reorderedIds, [
    'ext-ay-aniworld',
    'shonenx-hls-inbuilt',
    'ext-ay-gotaku',
  ]);

  const sorted = sortSourcesByOrder(
    [...SAMPLE_SOURCES.slice(0, 3), SAMPLE_SOURCES[1]],
    reorderedIds,
  );
  assert.deepEqual(
    sorted.map((s) => s.id),
    ['ext-ay-aniworld', 'shonenx-hls-inbuilt', 'ext-ay-gotaku'],
  );
});

test('collectAvailableExtensionLanguages deduplicates all/ALL so React keys remain unique', () => {
  const mixedSources: SourceInfo[] = [
    ...SAMPLE_SOURCES,
    {
      id: 'ext-ay-all-1',
      name: 'MultiRepo One',
      type: 'extension',
      mediaTypes: ['ANIME'],
      lang: 'all',
      version: '1.0.0',
    },
    {
      id: 'ext-ay-all-2',
      name: 'MultiRepo Two',
      type: 'extension',
      mediaTypes: ['ANIME'],
      lang: 'ALL ',
      version: '1.0.1',
    },
    {
      id: 'ext-ay-hi',
      name: 'HindiStream',
      type: 'extension',
      mediaTypes: ['ANIME'],
      lang: ' hi ',
      version: '1.0.2',
    },
  ];
  const langs = collectAvailableExtensionLanguages(mixedSources, 'ANIME');
  assert.deepEqual(langs, ['all', 'de', 'en', 'hi']);
  assert.equal(new Set(langs).size, langs.length);
});

test('filterExtensions with webPlayableOnly hides Gotaku, metadata catalogs, and pure Android APK stubs while retaining web-adapter matches', () => {
  const catalog: SourceInfo[] = [
    ...SAMPLE_SOURCES,
    {
      id: 'ext-ay-hianime',
      name: 'HiAnime',
      type: 'extension',
      mediaTypes: ['ANIME'],
      lang: 'en',
      version: '14.1',
      pkg: 'eu.kanade.tachiyomi.animeextension.en.hianime',
      baseUrl: 'https://hianime.to',
      metadataOnlyStorage: true,
    },
    {
      id: 'ext-ay-animeonsen',
      name: 'AnimeOnsen',
      type: 'extension',
      mediaTypes: ['ANIME'],
      lang: 'all',
      version: '16.12',
      pkg: 'eu.kanade.tachiyomi.animeextension.all.animeonsen',
      apkName: 'animeonsen.apk',
      baseUrl: 'https://animeonsen.xyz',
      metadataOnlyStorage: true,
    },
    {
      id: 'ext-ay-mal',
      name: 'MyAnimeList',
      type: 'extension',
      mediaTypes: ['ANIME'],
      lang: 'en',
      version: '14.0',
      baseUrl: 'https://myanimelist.net',
    },
  ];

  const webPlayable = filterExtensions(catalog, {
    mediaTab: 'ANIME',
    query: '',
    managerFilter: 'all',
    langFilter: 'all',
    webPlayableOnly: true,
  });

  assert.deepEqual(
    webPlayable.map((s) => s.id),
    ['shonenx-hls-inbuilt', 'ext-ay-hianime'],
  );
});

