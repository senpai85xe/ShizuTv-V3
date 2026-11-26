import test from 'node:test';
import assert from 'node:assert/strict';
import type { SourceInfo } from '../types/media';
import {
  buildCapabilitiesBreakdown,
  type ExtensionDiagnosticReport,
} from './extensionDiagnostics';
import type { SourceHealthCheckResult } from './sourceHealthCheck';
import {
  countWebPlayableCandidates,
  isWebPlayableExtensionCandidate,
  resolveSourceLiveStatusBadge,
  sortSourcesByLiveStatus,
} from './sourceStatus';

const INBUILT_ANIME: SourceInfo = {
  id: 'shonenx-hls-inbuilt',
  name: 'ShizuTv Stream (Inbuilt)',
  type: 'inbuilt',
  mediaTypes: ['ANIME'],
  lang: 'en',
  version: '2.1.5',
};

const ANIYOMI_KAIDO: SourceInfo = {
  id: 'ext-ay-kaido',
  name: 'Kaido',
  type: 'extension',
  mediaTypes: ['ANIME'],
  lang: 'en',
  version: '14.2',
  pkg: 'eu.kanade.tachiyomi.animeextension.en.kaido',
  apkName: 'aniyomi-en.kaido-v14.2.apk',
  baseUrl: 'https://kaido.to',
  metadataOnlyStorage: true,
};

const ANIYOMI_TOONSTREAM: SourceInfo = {
  id: 'ext-ay-toonstream',
  name: 'ToonStream',
  type: 'extension',
  mediaTypes: ['ANIME'],
  lang: 'hi',
  version: '14.1',
  pkg: 'eu.kanade.tachiyomi.animeextension.hi.toonstream',
  baseUrl: 'https://toonstream.co',
  metadataOnlyStorage: true,
};

const ANIYOMI_APK_STUB: SourceInfo = {
  id: 'ext-ay-animeonsen',
  name: 'AnimeOnsen',
  type: 'extension',
  mediaTypes: ['ANIME'],
  lang: 'all',
  version: '16.12',
  pkg: 'eu.kanade.tachiyomi.animeextension.all.animeonsen',
  apkName: 'aniyomi-all.animeonsen-v16.12.apk',
  baseUrl: 'https://animeonsen.xyz',
  metadataOnlyStorage: true,
};

const ANIYOMI_GOTAKU: SourceInfo = {
  id: 'ext-ay-gotaku',
  name: 'Gotaku',
  type: 'extension',
  mediaTypes: ['ANIME'],
  lang: 'en',
  version: '16.10',
  pkg: 'eu.kanade.tachiyomi.animeextension.en.gotaku',
  baseUrl: 'https://gotaku.to',
  metadataOnlyStorage: true,
};

const ANIYOMI_ANILIST: SourceInfo = {
  id: 'ext-ay-anilist',
  name: 'AniList',
  type: 'extension',
  mediaTypes: ['ANIME'],
  lang: 'en',
  version: '14.0',
  pkg: 'eu.kanade.tachiyomi.animeextension.en.anilist',
  baseUrl: 'https://anilist.co',
};

const MANGAYOMI_GENERIC: SourceInfo = {
  id: 'ext-my-animepahe',
  name: 'AnimePahe',
  type: 'extension',
  mediaTypes: ['ANIME'],
  lang: 'en',
  version: '0.1.5',
  baseUrl: 'https://animepahe.ru',
};

function makePassReport(source: SourceInfo, confirmedAudio = true): ExtensionDiagnosticReport {
  return {
    sourceId: source.id,
    sourceName: source.name,
    status: 'pass',
    durationMs: 420,
    testedAt: '2026-11-23T07:00:00.000Z',
    mode: 'full',
    ...(confirmedAudio
      ? { confirmedAudioLanguages: ['ja'], detectedAudioLanguages: ['ja'] }
      : { inferredAudioLanguages: ['ja'] }),
    summary: 'Playable stream verified (1080p · Naruto)',
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'ANIME',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: true,
      audioLanguageStatus: confirmedAudio ? 'verified' : 'partial',
    }),
  };
}

function makeBlockedReport(source: SourceInfo): ExtensionDiagnosticReport {
  return {
    sourceId: source.id,
    sourceName: source.name,
    status: 'fail',
    durationMs: 280,
    testedAt: '2026-11-23T07:05:00.000Z',
    mode: 'full',
    failureKind: 'blocked_request',
    summary: `Upstream challenge HTTP 403 on ${source.name}`,
    detail: `${source.baseUrl} returned Cloudflare Turnstile challenge HTTP 403`,
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'ANIME',
      searchMatched: false,
      listingAvailable: false,
      playbackOrPagesVerified: false,
      listingStatus: 'untested',
      playbackStatus: 'untested',
    }),
  };
}

test('isWebPlayableExtensionCandidate separates web-adapter Aniyomi sources from pure APK stubs, Gotaku, and metadata catalogs', () => {
  assert.equal(isWebPlayableExtensionCandidate(INBUILT_ANIME, null, 'ANIME'), true);
  assert.equal(isWebPlayableExtensionCandidate(ANIYOMI_KAIDO, null, 'ANIME'), true);
  assert.equal(isWebPlayableExtensionCandidate(ANIYOMI_TOONSTREAM, null, 'ANIME'), true);
  assert.equal(isWebPlayableExtensionCandidate(MANGAYOMI_GENERIC, null, 'ANIME'), true);

  assert.equal(isWebPlayableExtensionCandidate(ANIYOMI_APK_STUB, null, 'ANIME'), false);
  assert.equal(isWebPlayableExtensionCandidate(ANIYOMI_GOTAKU, null, 'ANIME'), false);
  assert.equal(isWebPlayableExtensionCandidate(ANIYOMI_ANILIST, null, 'ANIME'), false);

  // Even a generic Aniyomi package becomes web-playable if verified by Full Diagnostic
  assert.equal(
    isWebPlayableExtensionCandidate(ANIYOMI_APK_STUB, makePassReport(ANIYOMI_APK_STUB), 'ANIME'),
    true,
  );
  // Metadata-only stays excluded even if a stale pass report exists
  assert.equal(
    isWebPlayableExtensionCandidate(ANIYOMI_ANILIST, makePassReport(ANIYOMI_ANILIST), 'ANIME'),
    false,
  );
});

test('resolveSourceLiveStatusBadge produces clear user-facing badges for working, web-ready, blocked, apk-only, and untested sources', () => {
  const verifiedBadge = resolveSourceLiveStatusBadge({
    source: ANIYOMI_KAIDO,
    report: makePassReport(ANIYOMI_KAIDO),
    mediaType: 'ANIME',
  });
  assert.equal(verifiedBadge.kind, 'working');
  assert.equal(verifiedBadge.label, 'Verified Working');
  assert.equal(verifiedBadge.isLikelyWorking, true);

  const blockedBadge = resolveSourceLiveStatusBadge({
    source: ANIYOMI_TOONSTREAM,
    report: makeBlockedReport(ANIYOMI_TOONSTREAM),
    mediaType: 'ANIME',
  });
  assert.equal(blockedBadge.kind, 'blocked');
  assert.equal(blockedBadge.label, 'Blocked (403)');
  assert.equal(blockedBadge.isLikelyWorking, false);

  const adapterBadge = resolveSourceLiveStatusBadge({
    source: ANIYOMI_KAIDO,
    mediaType: 'ANIME',
  });
  assert.equal(adapterBadge.kind, 'web-ready');
  assert.equal(adapterBadge.label, 'Web Adapter Ready');
  assert.equal(adapterBadge.isWebPlayable, true);

  const apkBadge = resolveSourceLiveStatusBadge({
    source: ANIYOMI_APK_STUB,
    mediaType: 'ANIME',
  });
  assert.equal(apkBadge.kind, 'android-native');
  assert.equal(apkBadge.label, 'APK Runtime Only');
  assert.equal(apkBadge.isWebPlayable, false);

  const gotakuBadge = resolveSourceLiveStatusBadge({
    source: ANIYOMI_GOTAKU,
    mediaType: 'ANIME',
  });
  assert.equal(gotakuBadge.kind, 'unsupported');
  assert.equal(gotakuBadge.label, 'Protected · Unsupported');

  const healthyHeartbeat: SourceHealthCheckResult = {
    sourceId: MANGAYOMI_GENERIC.id,
    sourceName: MANGAYOMI_GENERIC.name,
    status: 'healthy',
    expectedFormat: 'html_document',
    checkedAt: '2026-11-23T07:08:00.000Z',
    summary: 'Heartbeat OK · Valid HTML',
  };
  const healthBadge = resolveSourceLiveStatusBadge({
    source: MANGAYOMI_GENERIC,
    healthResult: healthyHeartbeat,
    mediaType: 'ANIME',
  });
  assert.equal(healthBadge.kind, 'web-ready');
  assert.equal(healthBadge.label, 'Host Reachable');
});

test('sortSourcesByLiveStatus bubbles Verified Working first, followed by Inbuilt/Web Adapter Ready, Untested, Blocked, and APK-only, and filters working-only cleanly', () => {
  const pool: SourceInfo[] = [
    ANIYOMI_APK_STUB,
    ANIYOMI_TOONSTREAM,
    MANGAYOMI_GENERIC,
    INBUILT_ANIME,
    ANIYOMI_KAIDO,
  ];

  const diagnostics = {
    [ANIYOMI_KAIDO.id]: makePassReport(ANIYOMI_KAIDO),
    [ANIYOMI_TOONSTREAM.id]: makeBlockedReport(ANIYOMI_TOONSTREAM),
  };

  const sortedAll = sortSourcesByLiveStatus({
    sources: pool,
    diagnosticsBySourceId: diagnostics,
    mediaType: 'ANIME',
  });

  assert.deepEqual(
    sortedAll.map((s) => s.id),
    [
      'ext-ay-kaido', // Verified Working (rank 0)
      'shonenx-hls-inbuilt', // Inbuilt Engine (rank 1)
      'ext-my-animepahe', // Untested Web (rank 3)
      'ext-ay-toonstream', // Blocked 403 (rank 5)
      'ext-ay-animeonsen', // APK Runtime Only (rank 6)
    ],
  );

  const workingOnly = sortSourcesByLiveStatus({
    sources: pool,
    diagnosticsBySourceId: diagnostics,
    mediaType: 'ANIME',
    onlyLikelyWorking: true,
  });

  assert.deepEqual(
    workingOnly.map((s) => s.id),
    ['ext-ay-kaido', 'shonenx-hls-inbuilt', 'ext-my-animepahe'],
  );

  assert.equal(countWebPlayableCandidates(pool, diagnostics, 'ANIME'), 4);
});
