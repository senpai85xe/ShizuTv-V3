import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeEpisodeResolution,
  clearEpisodeTraces,
  formatTraceAsReportJson,
  getEpisodeTraces,
  recordEpisodeTrace,
  traceHasIssues,
} from './episodeDiagnostics';

test('analyzeEpisodeResolution marks healthy multi-provider merge with zero error/warning anomalies', () => {
  const trace = analyzeEpisodeResolution({
    inputMedia: {
      id: '154587',
      idMal: '52991',
      episodes: 28,
      title: { english: 'Frieren: Beyond Journey’s End' },
    },
    resolvedMedia: {
      id: '154587',
      idMal: '52991',
      episodes: 28,
      title: { english: 'Frieren: Beyond Journey’s End' },
    },
    sourceId: 'ext-ay-animepahe',
    sourceName: 'AnimePahe',
    overrideMatched: false,
    resolvedExpectedCount: 28,
    totalDurationMs: 412,
    providers: [
      {
        provider: 'AniZip',
        status: 'hit',
        durationMs: 210,
        episodeCount: 28,
        namedCount: 28,
        targetId: 'anilist_id=154587',
        sampleTitles: ["1. The Journey's End"],
        note: 'Matched 28 episodes',
      },
      {
        provider: 'AniList Streaming',
        status: 'hit',
        durationMs: 0,
        episodeCount: 28,
        namedCount: 28,
        targetId: '154587',
        sampleTitles: ["1. The Journey's End"],
        note: 'Streaming episodes from AniList',
      },
      {
        provider: 'Jikan (MAL)',
        status: 'hit',
        durationMs: 390,
        episodeCount: 28,
        namedCount: 28,
        targetId: '52991',
        sampleTitles: ["1. The Journey's End"],
        note: 'MAL episodes hydrated',
      },
      {
        provider: 'Kitsu',
        status: 'skipped',
        durationMs: 0,
        episodeCount: 0,
        namedCount: 0,
        targetId: null,
        sampleTitles: [],
        note: 'Skipped because primary layers supplied real titles',
      },
    ],
    mergedEpisodes: Array.from({ length: 28 }, (_, i) => ({
      id: `154587-ep-${i + 1}`,
      number: i + 1,
      title: `Named Episode ${i + 1}`,
      thumbnail: 'https://example.com/thumb.jpg',
      airDate: '2023-09-29',
      isFiller: false,
    })),
  });

  assert.equal(trace.totalEpisodes, 28);
  assert.equal(trace.realTitleCount, 28);
  assert.equal(trace.genericTitleCount, 0);
  assert.equal(trace.winningPrimaryProvider, 'AniZip');
  assert.equal(traceHasIssues(trace), false);
});

test('analyzeEpisodeResolution flags generic fallback, provider timeout, and override remap', () => {
  const trace = analyzeEpisodeResolution({
    inputMedia: {
      id: '99999',
      episodes: 24,
      title: { english: 'Mystery Show' },
    },
    resolvedMedia: {
      id: '88888',
      episodes: 12,
      title: { english: 'Different Remapped Show' },
    },
    sourceId: 'ext-ay-hianime',
    sourceName: 'HiAnime',
    overrideTitle: 'Mystery Show OVA',
    overrideMatched: true,
    resolvedExpectedCount: 12,
    totalDurationMs: 8600,
    providers: [
      {
        provider: 'AniZip',
        status: 'timeout',
        durationMs: 7000,
        episodeCount: 0,
        namedCount: 0,
        targetId: 'anilist_id=88888',
        sampleTitles: [],
        note: 'Request timed out',
        errorMessage: 'TimeoutError: signal timed out',
      },
      {
        provider: 'AniList Streaming',
        status: 'empty',
        durationMs: 0,
        episodeCount: 0,
        namedCount: 0,
        targetId: '88888',
        sampleTitles: [],
        note: '0 streamingEpisodes on AniList',
      },
      {
        provider: 'Jikan (MAL)',
        status: 'skipped',
        durationMs: 0,
        episodeCount: 0,
        namedCount: 0,
        targetId: null,
        sampleTitles: [],
        note: 'No MAL ID available',
      },
      {
        provider: 'Kitsu',
        status: 'skipped',
        durationMs: 0,
        episodeCount: 0,
        namedCount: 0,
        targetId: null,
        sampleTitles: [],
        note: 'No Kitsu ID available',
      },
    ],
    mergedEpisodes: Array.from({ length: 12 }, (_, i) => ({
      id: `88888-ep-${i + 1}`,
      number: i + 1,
      title: `Episode ${i + 1}`,
    })),
  });

  const codes = trace.anomalies.map((a) => a.code);
  assert.ok(codes.includes('GENERIC_FALLBACK'));
  assert.ok(codes.includes('PROVIDER_ERROR'));
  assert.ok(codes.includes('TITLE_OVERRIDE_REMAPPED'));
  assert.ok(codes.includes('ONLY_FALLBACK_SLOTS'));
  assert.equal(traceHasIssues(trace), true);
  assert.ok(formatTraceAsReportJson(trace).includes('"GENERIC_FALLBACK"'));
});

test('trace ring buffer stores newest first and clears cleanly', () => {
  clearEpisodeTraces();
  assert.equal(getEpisodeTraces().length, 0);

  const makeTrace = (id: string) =>
    analyzeEpisodeResolution({
      inputMedia: { id, title: { english: `Title ${id}` } },
      resolvedMedia: { id, title: { english: `Title ${id}` } },
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'Inbuilt',
      overrideMatched: false,
      resolvedExpectedCount: 1,
      totalDurationMs: 120,
      providers: [],
      mergedEpisodes: [{ id: `${id}-ep-1`, number: 1, title: 'Pilot' }],
    });

  recordEpisodeTrace(makeTrace('1'));
  recordEpisodeTrace(makeTrace('2'));
  const stored = getEpisodeTraces();
  assert.equal(stored.length, 2);
  assert.equal(stored[0].inputMediaId, '2');
  assert.equal(stored[1].inputMediaId, '1');

  clearEpisodeTraces();
  assert.equal(getEpisodeTraces().length, 0);
});
