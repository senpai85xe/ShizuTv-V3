import test from 'node:test';
import assert from 'node:assert/strict';
import type { SourceInfo } from '../types/media';
import type { ExtensionDiagnosticReport } from './extensionDiagnostics';
import {
  buildPlayableFailoverQueue,
  findNextDistinctMirrorIndex,
  formatFailoverAttemptSummary,
  isM3u8ManifestBody,
  shouldBufferForM3u8Check,
} from './sourceFailover';

const SOURCES: SourceInfo[] = [
  {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '2.1.5',
  },
  {
    id: 'hianime-bridge',
    name: 'HiAnime',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'multi',
    version: '1.0',
  },
  {
    id: 'ext-custom-verified',
    name: 'VerifiedAnime',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0',
    baseUrl: 'https://gogoanime.example',
  },
  {
    id: 'ext-custom-unsupported',
    name: 'UnsupportedExt',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0',
    baseUrl: 'https://animexin.example',
  },
  {
    id: 'ext-ay-gotaku',
    name: 'Gotaku',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '16.10',
    baseUrl: 'https://gotaku.to',
  },
  {
    id: 'ext-ay-nohost',
    name: 'AndroidOnly',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0',
  },
];

function makeDiagReport(
  sourceId: string,
  status: ExtensionDiagnosticReport['status'],
): ExtensionDiagnosticReport {
  return {
    sourceId,
    sourceName: sourceId,
    status,
    durationMs: 120,
    summary: status,
    testedAt: '2026-11-22T00:00:00.000Z',
    capabilities: {
      metadataSearch: 'verified',
      episodeOrChapterListing: status === 'pass' ? 'verified' : 'unsupported',
      playbackOrReader: status === 'pass' ? 'verified' : 'unsupported',
      overallCompatibility: status === 'pass' ? 'compatible' : 'unsupported',
    },
  };
}

test('buildPlayableFailoverQueue excludes current, attempted, non-playable, and unsupported sources while ranking verified first', () => {
  const queue = buildPlayableFailoverQueue({
    currentSourceId: 'shonenx-hls-inbuilt',
    availableSources: SOURCES,
    diagnosticsBySourceId: {
      'ext-custom-verified': makeDiagReport('ext-custom-verified', 'pass'),
      'ext-custom-unsupported': makeDiagReport('ext-custom-unsupported', 'unsupported'),
    },
  });

  assert.deepEqual(
    queue.map((s) => s.id),
    ['ext-custom-verified', 'hianime-bridge'],
  );

  const afterVerified = buildPlayableFailoverQueue({
    currentSourceId: 'ext-custom-verified',
    attemptedSourceIds: ['shonenx-hls-inbuilt'],
    availableSources: SOURCES,
  });

  assert.deepEqual(
    afterVerified.map((s) => s.id),
    ['hianime-bridge', 'ext-custom-unsupported'],
  );
});

test('formatFailoverAttemptSummary formats single vs multi-source failure honestly', () => {
  assert.equal(
    formatFailoverAttemptSummary([
      { sourceId: 'a', sourceName: 'ShizuTv', error: 'HTTP 403 blocked' },
    ]),
    'HTTP 403 blocked',
  );

  assert.equal(
    formatFailoverAttemptSummary([
      { sourceId: 'a', sourceName: 'ShizuTv', error: 'HTTP 403 blocked' },
      { sourceId: 'b', sourceName: 'HiAnime', error: 'No mirror responded.' },
    ]),
    'Tried 2 sources (ShizuTv, HiAnime) — No mirror responded.',
  );
});

test('shouldBufferForM3u8Check and isM3u8ManifestBody safely detect extensionless or text/plain HLS manifests without buffering large binaries', () => {
  assert.equal(
    shouldBufferForM3u8Check({
      contentType: 'text/plain; charset=utf-8',
      pathname: '/cdn/master.txt',
      contentLengthHeader: '2048',
    }),
    true,
  );

  assert.equal(
    shouldBufferForM3u8Check({
      contentType: 'application/octet-stream',
      pathname: '/hls/playlist',
      contentLengthHeader: '4096',
    }),
    true,
  );

  assert.equal(
    shouldBufferForM3u8Check({
      contentType: 'video/mp4',
      pathname: '/video/ep1.mp4',
      contentLengthHeader: '50000000',
    }),
    false,
  );

  assert.equal(
    shouldBufferForM3u8Check({
      contentType: 'application/octet-stream',
      pathname: '/hls/stream',
      contentLengthHeader: String(2 * 1024 * 1024),
    }),
    false,
  );

  assert.equal(isM3u8ManifestBody('\uFEFF#EXTM3U\n#EXT-X-VERSION:3\n'), true);
  assert.equal(isM3u8ManifestBody('<html>Just a moment...</html>'), false);
});

test('findNextDistinctMirrorIndex skips duplicate mirror URLs', () => {
  const mirrors = [
    { url: 'https://cdn.example/a.m3u8' },
    { url: 'https://cdn.example/a.m3u8' },
    { url: 'https://cdn.example/b.m3u8' },
  ];
  assert.equal(
    findNextDistinctMirrorIndex(mirrors, 0, 'https://cdn.example/a.m3u8'),
    2,
  );
  assert.equal(
    findNextDistinctMirrorIndex(mirrors, 2, 'https://cdn.example/b.m3u8'),
    -1,
  );
});
