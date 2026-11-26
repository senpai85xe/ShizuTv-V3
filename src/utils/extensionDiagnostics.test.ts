import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCapabilitiesBreakdown,
  buildExtensionCompatibilitySnapshot,
  classifyDiagnosticFailure,
  classifyExtensionRuntimeRequirement,
  DEFAULT_DIAGNOSTIC_PROBE_SCOPE,
  EXTENSION_DIAGNOSTICS_STORAGE_KEY,
  EXTENSION_RUNTIME_REQUIREMENT_LABELS,
  formatCapabilityBadgeText,
  isAniyomiPackageSource,
  loadPersistedExtensionDiagnostics,
  MAX_DIAGNOSTIC_HISTORY,
  resolveDiagnosticOverallStatus,
  savePersistedExtensionDiagnostic,
  summarizeCompatibilityCounts,
  type DiagnosticStorageLike,
  type ExtensionDiagnosticReport,
} from './extensionDiagnostics';
import type { SourceInfo } from '../types/media';

test('resolveDiagnosticOverallStatus never returns pass for ping, basic, unsupported, or unverified full checks', () => {
  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'ping',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: true,
      errorOccurred: false,
    }),
    'partial',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'basic',
      searchMatched: true,
      listingAvailable: false,
      playbackOrPagesVerified: false,
      errorOccurred: false,
    }),
    'partial',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'full',
      unsupportedReason: 'Metadata catalog extension does not host video.',
      searchMatched: true,
      listingAvailable: false,
      playbackOrPagesVerified: false,
      errorOccurred: false,
    }),
    'unsupported',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'full',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: false,
      errorOccurred: false,
    }),
    'partial',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'full',
      searchMatched: false,
      listingAvailable: false,
      playbackOrPagesVerified: false,
      errorOccurred: true,
    }),
    'fail',
  );

  assert.equal(
    resolveDiagnosticOverallStatus({
      mode: 'full',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: true,
      errorOccurred: false,
    }),
    'pass',
  );
});

test('buildCapabilitiesBreakdown separates search, listing, audio language, and playback capabilities accurately', () => {
  const basicCaps = buildCapabilitiesBreakdown({
    mode: 'basic',
    mediaTab: 'ANIME',
    searchMatched: true,
    listingAvailable: false,
    playbackOrPagesVerified: false,
  });
  assert.equal(basicCaps.metadataSearch, 'verified');
  assert.equal(basicCaps.episodeOrChapterListing, 'untested');
  assert.equal(basicCaps.audioLanguage, 'untested');
  assert.equal(basicCaps.playbackOrReader, 'untested');
  assert.equal(basicCaps.overallCompatibility, 'partial');

  const fullCaps = buildCapabilitiesBreakdown({
    mode: 'full',
    mediaTab: 'ANIME',
    searchMatched: true,
    listingAvailable: true,
    playbackOrPagesVerified: true,
    audioLanguageStatus: 'verified',
  });
  assert.equal(fullCaps.metadataSearch, 'verified');
  assert.equal(fullCaps.episodeOrChapterListing, 'verified');
  assert.equal(fullCaps.audioLanguage, 'verified');
  assert.equal(fullCaps.playbackOrReader, 'verified');
  assert.equal(fullCaps.overallCompatibility, 'compatible');

  const metadataCatalogCaps = buildCapabilitiesBreakdown({
    mode: 'full',
    mediaTab: 'ANIME',
    unsupportedReason: 'Metadata catalog only',
    isMetadataCatalogOnly: true,
    searchMatched: true,
    listingAvailable: false,
    playbackOrPagesVerified: false,
  });
  assert.equal(metadataCatalogCaps.metadataSearch, 'verified');
  assert.equal(metadataCatalogCaps.episodeOrChapterListing, 'unsupported');
  assert.equal(metadataCatalogCaps.audioLanguage, 'unsupported');
  assert.equal(metadataCatalogCaps.playbackOrReader, 'unsupported');
  assert.equal(metadataCatalogCaps.overallCompatibility, 'unsupported');
});

test('formatCapabilityBadgeText formats human-readable capability status labels including Audio Language', () => {
  assert.equal(formatCapabilityBadgeText('search', 'verified', 'ANIME'), 'Search: Ready');
  assert.equal(formatCapabilityBadgeText('listing', 'unavailable', 'MANGA'), 'Chapters: Failed');
  assert.equal(formatCapabilityBadgeText('audio', 'partial', 'ANIME'), 'Audio Language: Partial');
  assert.equal(formatCapabilityBadgeText('playback', 'unsupported', 'ANIME'), 'Video Playback: Unsupported');
  assert.equal(formatCapabilityBadgeText('playback', 'untested', 'MANGA'), 'Reader Pages: Not Tested');
});

test('buildExtensionCompatibilitySnapshot covers Supported, Partial, Failed, Unverified, and Unsupported accurately without false-positive Video Playback', () => {
  const animeSource: SourceInfo = {
    id: 'ext-ay-kaido',
    name: 'Kaido',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://kaido.to',
  };

  // 1. UNVERIFIED before any diagnostic runs (even for inbuilt/compatible sources)
  const untestedSnap = buildExtensionCompatibilitySnapshot(animeSource, null, 'ANIME');
  assert.equal(untestedSnap.overallStatus, 'unverified');
  assert.equal(untestedSnap.overallLabel, 'Unverified');
  assert.equal(untestedSnap.reliabilityLevel, 'unverified');
  assert.equal(untestedSnap.reliabilityLabel, 'Unverified');
  assert.equal(untestedSnap.capabilities.animeSearch.status, 'unverified');
  assert.equal(untestedSnap.capabilities.episodeListing.status, 'unverified');
  assert.equal(untestedSnap.capabilities.audioLanguage.status, 'unverified');
  assert.equal(untestedSnap.capabilities.videoPlayback.status, 'unverified');
  assert.equal(untestedSnap.lastTestedAt, null);
  assert.equal(untestedSnap.hasVerifiedFullDiagnostic, false);

  // 2. PING-ONLY or BASIC-ONLY never produces Supported or Verified reliability
  const pingReport: ExtensionDiagnosticReport = {
    sourceId: 'ext-ay-kaido',
    sourceName: 'Kaido',
    status: 'partial',
    durationMs: 120,
    testedAt: '2026-11-19T05:00:00.000Z',
    mode: 'ping',
    summary: 'Host reachable (HTTP 200) · Playback not verified',
    detail: 'https://kaido.to responded cleanly.',
    capabilities: buildCapabilitiesBreakdown({
      mode: 'ping',
      mediaTab: 'ANIME',
      searchMatched: true,
      listingAvailable: false,
      playbackOrPagesVerified: false,
    }),
  };
  const pingSnap = buildExtensionCompatibilitySnapshot(animeSource, pingReport, 'ANIME');
  assert.equal(pingSnap.overallStatus, 'partial');
  assert.equal(pingSnap.reliabilityLevel, 'partially_verified');
  assert.equal(pingSnap.capabilities.videoPlayback.status, 'unverified');
  assert.equal(pingSnap.hasVerifiedFullDiagnostic, false);

  const basicReport: ExtensionDiagnosticReport = {
    sourceId: 'ext-ay-kaido',
    sourceName: 'Kaido',
    status: 'partial',
    durationMs: 220,
    testedAt: '2026-11-19T05:01:00.000Z',
    mode: 'basic',
    summary: 'Search matched 3 titles (Playback untested)',
    detail: 'Run Full test to verify episode listing and playback.',
    capabilities: buildCapabilitiesBreakdown({
      mode: 'basic',
      mediaTab: 'ANIME',
      searchMatched: true,
      listingAvailable: false,
      playbackOrPagesVerified: false,
    }),
  };
  const basicSnap = buildExtensionCompatibilitySnapshot(animeSource, basicReport, 'ANIME');
  assert.equal(basicSnap.overallStatus, 'partial');
  assert.equal(basicSnap.reliabilityLevel, 'partially_verified');
  assert.equal(basicSnap.capabilities.animeSearch.status, 'supported');
  assert.equal(basicSnap.capabilities.episodeListing.status, 'unverified');
  assert.equal(basicSnap.capabilities.audioLanguage.status, 'unverified');
  assert.equal(basicSnap.capabilities.videoPlayback.status, 'unverified');

  // 3. Spoofed playbackOrReader === 'verified' when status !== 'pass' MUST NOT mark Video Playback Supported
  const spoofedReport: ExtensionDiagnosticReport = {
    sourceId: 'ext-ay-kaido',
    sourceName: 'Kaido',
    status: 'fail',
    durationMs: 310,
    testedAt: '2026-11-19T05:02:00.000Z',
    mode: 'full',
    summary: 'Stream check failed',
    detail: 'Manifest returned HTTP 500',
    capabilities: {
      metadataSearch: 'verified',
      episodeOrChapterListing: 'verified',
      audioLanguage: 'verified',
      playbackOrReader: 'verified',
      overallCompatibility: 'partial',
    },
  };
  const spoofedSnap = buildExtensionCompatibilitySnapshot(animeSource, spoofedReport, 'ANIME');
  assert.notEqual(spoofedSnap.capabilities.videoPlayback.status, 'supported');
  assert.notEqual(spoofedSnap.capabilities.audioLanguage.status, 'supported');
  assert.equal(spoofedSnap.hasVerifiedFullDiagnostic, false);

  // 4. PARTIAL: Search & episodes ok, video stream failed
  const partialFullReport: ExtensionDiagnosticReport = {
    sourceId: 'ext-ay-kaido',
    sourceName: 'Kaido',
    status: 'partial',
    durationMs: 410,
    testedAt: '2026-11-19T05:03:00.000Z',
    mode: 'full',
    summary: 'Found "Naruto", but video stream failed to resolve',
    detail: 'No working episode stream mirror responded on Kaido.',
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'ANIME',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: false,
    }),
  };
  const partialSnap = buildExtensionCompatibilitySnapshot(animeSource, partialFullReport, 'ANIME');
  assert.equal(partialSnap.overallStatus, 'partial');
  assert.equal(partialSnap.reliabilityLevel, 'partially_verified');
  assert.equal(partialSnap.capabilities.animeSearch.status, 'supported');
  assert.equal(partialSnap.capabilities.episodeListing.status, 'supported');
  assert.equal(partialSnap.capabilities.audioLanguage.status, 'unverified');
  assert.equal(partialSnap.capabilities.videoPlayback.status, 'failed');
  assert.equal(partialSnap.failureReason, 'No working episode stream mirror responded on Kaido.');

  // 5. FAILED: Nothing resolved
  const failedFullReport: ExtensionDiagnosticReport = {
    sourceId: 'ext-ay-kaido',
    sourceName: 'Kaido',
    status: 'fail',
    durationMs: 500,
    testedAt: '2026-11-19T05:04:00.000Z',
    mode: 'full',
    summary: 'No matching anime or playable stream found on Kaido',
    detail: 'Upstream host timed out after 5000ms.',
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'ANIME',
      searchMatched: false,
      listingAvailable: false,
      playbackOrPagesVerified: false,
    }),
  };
  const failedSnap = buildExtensionCompatibilitySnapshot(animeSource, failedFullReport, 'ANIME');
  assert.equal(failedSnap.overallStatus, 'failed');
  assert.equal(failedSnap.overallLabel, 'Failed');
  assert.equal(failedSnap.reliabilityLevel, 'unverified');
  assert.equal(failedSnap.failureKind, 'timeout');
  assert.equal(failedSnap.failureKindLabel, 'Timeout');
  assert.equal(failedSnap.capabilities.animeSearch.status, 'failed');
  assert.equal(failedSnap.capabilities.episodeListing.status, 'failed');
  assert.equal(failedSnap.capabilities.videoPlayback.status, 'failed');
  assert.equal(failedSnap.failureReason, 'Upstream host timed out after 5000ms.');

  // 6. SUPPORTED: Verified Full Diagnostic with Audio & Playback
  const supportedReport: ExtensionDiagnosticReport = {
    sourceId: 'ext-ay-kaido',
    sourceName: 'Kaido',
    status: 'pass',
    durationMs: 650,
    testedAt: '2026-11-19T05:05:00.000Z',
    mode: 'full',
    detectedAudioLanguages: ['ja', 'en'],
    confirmedAudioLanguages: ['ja', 'en'],
    summary: 'Playable stream verified (1080p · Naruto)',
    detail: 'Resolved Ep 1 via MegaCloud (2 mirrors · Audio: JA, EN).',
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'ANIME',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: true,
      audioLanguageStatus: 'verified',
    }),
  };
  const supportedSnap = buildExtensionCompatibilitySnapshot(animeSource, supportedReport, 'ANIME');
  assert.equal(supportedSnap.overallStatus, 'supported');
  assert.equal(supportedSnap.overallLabel, 'Supported');
  assert.equal(supportedSnap.reliabilityLevel, 'verified');
  assert.equal(supportedSnap.reliabilityLabel, 'Verified');
  assert.equal(supportedSnap.capabilities.animeSearch.status, 'supported');
  assert.equal(supportedSnap.capabilities.episodeListing.status, 'supported');
  assert.equal(supportedSnap.capabilities.audioLanguage.status, 'supported');
  assert.equal(supportedSnap.capabilities.videoPlayback.status, 'supported');
  assert.equal(supportedSnap.failureReason, null);
  assert.equal(supportedSnap.hasVerifiedFullDiagnostic, true);
  assert.equal(supportedSnap.lastTestedAt, '2026-11-19T05:05:00.000Z');
  assert.equal(supportedSnap.lastVerifiedAt, '2026-11-19T05:05:00.000Z');
  assert.deepEqual(supportedSnap.confirmedAudioLanguages, ['ja', 'en']);

  // 7. UNSUPPORTED: Metadata-only & Missing host & Gotaku
  const metadataSource: SourceInfo = {
    id: 'ext-ay-anilist',
    name: 'AniList Tracker',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://anilist.co',
  };
  const metaSnap = buildExtensionCompatibilitySnapshot(metadataSource, supportedReport, 'ANIME');
  assert.equal(metaSnap.isMetadataOnly, true);
  assert.equal(metaSnap.overallStatus, 'unsupported');
  assert.equal(metaSnap.reliabilityLevel, 'unsupported');
  assert.equal(metaSnap.capabilities.episodeListing.status, 'unsupported');
  assert.equal(metaSnap.capabilities.audioLanguage.status, 'unsupported');
  assert.equal(metaSnap.capabilities.videoPlayback.status, 'unsupported');
  assert.equal(metaSnap.hasVerifiedFullDiagnostic, false);

  const gotakuSource: SourceInfo = {
    id: 'ext-ay-gotaku',
    name: 'Gotaku',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://gotaku.to',
  };
  const gotakuSnap = buildExtensionCompatibilitySnapshot(
    gotakuSource,
    {
      ...basicReport,
      sourceId: 'ext-ay-gotaku',
      sourceName: 'Gotaku',
    },
    'ANIME',
  );
  assert.equal(gotakuSnap.overallStatus, 'partial');
  assert.equal(gotakuSnap.reliabilityLevel, 'unsupported');
  assert.equal(gotakuSnap.capabilities.animeSearch.status, 'supported');
  assert.equal(gotakuSnap.capabilities.episodeListing.status, 'unsupported');
  assert.equal(gotakuSnap.capabilities.audioLanguage.status, 'unsupported');
  assert.equal(gotakuSnap.capabilities.videoPlayback.status, 'unsupported');

  // 8. Dashboard summary counts separate metadata-only from playable sources
  const summary = summarizeCompatibilityCounts([
    supportedSnap,
    partialSnap,
    failedSnap,
    untestedSnap,
    metaSnap,
  ]);
  assert.equal(summary.supported, 1);
  assert.equal(summary.partial, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.unverified, 1);
  assert.equal(summary.unsupported, 0);
  assert.equal(summary.metadataOnly, 1);
  assert.equal(summary.totalPlayable, 4);
});

test('persisted diagnostics storage roundtrips cleanly, preserves lastVerifiedAt, caps history, and upgrades legacy Batch 3 records', () => {
  const backing = new Map<string, string>();
  const mockStorage: DiagnosticStorageLike = {
    getItem: (k) => backing.get(k) ?? null,
    setItem: (k, v) => {
      backing.set(k, v);
    },
    removeItem: (k) => {
      backing.delete(k);
    },
  };

  // Corrupted JSON recovers cleanly
  backing.set(EXTENSION_DIAGNOSTICS_STORAGE_KEY, '{not-valid-json');
  assert.deepEqual(loadPersistedExtensionDiagnostics(mockStorage), {});

  // Seed legacy Batch 3 report lacking history/lastVerifiedAt
  const legacyReport: ExtensionDiagnosticReport = {
    sourceId: 'shonenx-hls-inbuilt',
    sourceName: 'ShizuTv Stream (Inbuilt)',
    status: 'pass',
    durationMs: 320,
    testedAt: '2026-11-18T10:00:00.000Z',
    mode: 'full',
    detectedAudioLanguages: ['ja', 'en'],
    summary: 'Playable stream verified (1080p · Naruto)',
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'ANIME',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: true,
      audioLanguageStatus: 'verified',
    }),
  };
  backing.set(
    EXTENSION_DIAGNOSTICS_STORAGE_KEY,
    JSON.stringify({ 'shonenx-hls-inbuilt': legacyReport }),
  );

  // Subsequent failed run preserves lastVerifiedAt from legacy pass and seeds legacy history
  const failedFollowup: ExtensionDiagnosticReport = {
    sourceId: 'shonenx-hls-inbuilt',
    sourceName: 'ShizuTv Stream (Inbuilt)',
    status: 'fail',
    durationMs: 910,
    testedAt: '2026-11-19T05:10:00.000Z',
    mode: 'full',
    failureKind: 'timeout',
    summary: 'Upstream timed out',
    detail: 'Request timed out after 8500ms',
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'ANIME',
      searchMatched: false,
      listingAvailable: false,
      playbackOrPagesVerified: false,
    }),
  };

  const savedAfterFailure = savePersistedExtensionDiagnostic(failedFollowup, mockStorage);
  const stored = savedAfterFailure['shonenx-hls-inbuilt'];
  assert.equal(stored.status, 'fail');
  assert.equal(stored.lastVerifiedAt, '2026-11-18T10:00:00.000Z');
  assert.equal(stored.history?.length, 2);
  assert.equal(stored.history?.[0].testedAt, '2026-11-19T05:10:00.000Z');
  assert.equal(stored.history?.[1].testedAt, '2026-11-18T10:00:00.000Z');

  // Verify bounded history cap (MAX_DIAGNOSTIC_HISTORY = 6)
  for (let i = 0; i < 8; i++) {
    savePersistedExtensionDiagnostic(
      {
        ...failedFollowup,
        testedAt: `2026-11-19T06:0${i}:00.000Z`,
        summary: `Attempt ${i}`,
      },
      mockStorage,
    );
  }
  const loaded = loadPersistedExtensionDiagnostics(mockStorage);
  assert.equal(loaded['shonenx-hls-inbuilt'].history?.length, MAX_DIAGNOSTIC_HISTORY);
  assert.equal(loaded['shonenx-hls-inbuilt'].history?.[0].summary, 'Attempt 7');
  assert.equal(loaded['shonenx-hls-inbuilt'].lastVerifiedAt, '2026-11-18T10:00:00.000Z');
});

test('Batch 4: classifyDiagnosticFailure distinguishes network, timeout, blocked, auth, malformed, and unsupported causes accurately', () => {
  assert.equal(classifyDiagnosticFailure('Request timed out after 8500ms'), 'timeout');
  assert.equal(classifyDiagnosticFailure('connect ECONNREFUSED 127.0.0.1:443'), 'network_error');
  assert.equal(classifyDiagnosticFailure('HTTP 401 Unauthorized', 401), 'auth_required');
  assert.equal(classifyDiagnosticFailure('HTTP 403 Forbidden', 403), 'auth_required');
  assert.equal(classifyDiagnosticFailure('Cloudflare Turnstile challenge HTTP 403', 403), 'blocked_request');
  assert.equal(classifyDiagnosticFailure('Too many requests', 429), 'blocked_request');
  assert.equal(classifyDiagnosticFailure('Malformed JSON response (Unexpected token <)'), 'malformed_response');
  assert.equal(classifyDiagnosticFailure('Encrypted binary payload unsupported'), 'unsupported_format');
  assert.equal(classifyDiagnosticFailure('Metadata-only catalog source'), 'metadata_only');
  assert.equal(classifyDiagnosticFailure('Missing valid HTTP base URL'), 'missing_host');
  assert.equal(classifyDiagnosticFailure('No active video mirror returned HTTP 200'), 'provider_error');
});

test('Batch 4: unknown or inferred-only audio is never promoted to confirmed Supported audio', () => {
  const animeSource: SourceInfo = {
    id: 'ext-ay-generic',
    name: 'Generic Mirror',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://generic-mirror.example',
  };

  const inferredAudioPassReport: ExtensionDiagnosticReport = {
    sourceId: 'ext-ay-generic',
    sourceName: 'Generic Mirror',
    status: 'pass',
    durationMs: 440,
    testedAt: '2026-11-19T05:30:00.000Z',
    mode: 'full',
    detectedAudioLanguages: [],
    confirmedAudioLanguages: [],
    inferredAudioLanguages: ['ja'],
    probeScope: DEFAULT_DIAGNOSTIC_PROBE_SCOPE,
    summary: 'Playable stream verified (Auto · Naruto)',
    detail: 'Resolved Ep 1 via Vidstreaming (1 mirror · Episode 1 default probe only · Audio language unknown/inferred).',
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'ANIME',
      searchMatched: true,
      listingAvailable: true,
      playbackOrPagesVerified: true,
      audioLanguageStatus: 'partial',
    }),
  };

  const snap = buildExtensionCompatibilitySnapshot(animeSource, inferredAudioPassReport, 'ANIME');
  assert.equal(snap.capabilities.videoPlayback.status, 'supported');
  assert.equal(snap.capabilities.audioLanguage.status, 'partial');
  assert.equal(snap.overallStatus, 'partial');
  assert.equal(snap.reliabilityLevel, 'partially_verified');
  assert.deepEqual(snap.confirmedAudioLanguages, []);
  assert.deepEqual(snap.inferredAudioLanguages, ['ja']);
  assert.equal(snap.probeScope, DEFAULT_DIAGNOSTIC_PROBE_SCOPE);
  assert.ok(snap.audioVerificationDetail?.includes(DEFAULT_DIAGNOSTIC_PROBE_SCOPE));
});

test('Phase 1: runtime requirement labels enforce honesty for Aniyomi APK metadata vs Web Adapter vs Unsupported vs Unverified', () => {
  const inbuiltSource: SourceInfo = {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '2.1.5',
  };
  const inbuiltSnap = buildExtensionCompatibilitySnapshot(inbuiltSource, null, 'ANIME');
  assert.equal(inbuiltSnap.runtimeRequirement, 'web-compatible');
  assert.equal(inbuiltSnap.runtimeRequirementLabel, EXTENSION_RUNTIME_REQUIREMENT_LABELS['web-compatible']);
  assert.equal(inbuiltSnap.runtimeRequirementLabel, 'Web Adapter Compatible');
  assert.equal(inbuiltSnap.isNativePackageMetadataOnly, false);

  const aniyomiApkSource: SourceInfo = {
    id: 'ext-ay-aniworld',
    name: 'AniWorld',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'de',
    version: '14.6',
    versionCode: 28,
    libVersion: '14',
    pkg: 'eu.kanade.tachiyomi.animeextension.de.aniworld',
    apkName: 'aniyomi-de.aniworld-v14.6.apk',
    repoUrl: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json',
    repoBaseUrl: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo',
    baseUrl: 'https://aniworld.to',
    metadataOnlyStorage: true,
  };
  assert.equal(isAniyomiPackageSource(aniyomiApkSource), true);

  // Storing Aniyomi metadata MUST NOT claim Web Adapter Compatible or installed runtime
  const aniyomiSnap = buildExtensionCompatibilitySnapshot(aniyomiApkSource, null, 'ANIME');
  assert.equal(aniyomiSnap.runtimeRequirement, 'android-native');
  assert.equal(aniyomiSnap.runtimeRequirementLabel, 'Requires Android Native Runtime');
  assert.equal(aniyomiSnap.isNativePackageMetadataOnly, true);

  // Mangayomi/custom web extension before Full Diagnostic -> Unverified
  const unverifiedMangayomi: SourceInfo = {
    id: 'ext-my-animepahe',
    name: 'AnimePahe',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '0.1.5',
    baseUrl: 'https://animepahe.ru',
  };
  const unverifiedSnap = buildExtensionCompatibilitySnapshot(unverifiedMangayomi, null, 'ANIME');
  assert.equal(unverifiedSnap.runtimeRequirement, 'unverified');
  assert.equal(unverifiedSnap.runtimeRequirementLabel, 'Unverified');
  assert.equal(unverifiedSnap.isNativePackageMetadataOnly, false);

  // Metadata-only or missing-host -> Unsupported
  const metadataCatalog: SourceInfo = {
    id: 'ext-ay-myanimelist',
    name: 'MyAnimeList',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '14.2',
    pkg: 'eu.kanade.tachiyomi.animeextension.all.mal',
    baseUrl: 'https://myanimelist.net',
  };
  const unsupportedSnap = buildExtensionCompatibilitySnapshot(metadataCatalog, null, 'ANIME');
  assert.equal(unsupportedSnap.runtimeRequirement, 'unsupported');
  assert.equal(unsupportedSnap.runtimeRequirementLabel, 'Unsupported');

  assert.equal(
    classifyExtensionRuntimeRequirement({
      source: inbuiltSource,
      profileKind: 'inbuilt-anime',
    }),
    'web-compatible',
  );

  const counts = summarizeCompatibilityCounts([
    inbuiltSnap,
    aniyomiSnap,
    unverifiedSnap,
    unsupportedSnap,
  ]);
  assert.equal(counts.webCompatible, 1);
  assert.equal(counts.androidNative, 1);
  assert.equal(counts.metadataOnly, 1);
});

test('HTTP 403 blocked Inbuilt diagnostic preserves Web Adapter Compatible runtime and non-unsupported capabilities', () => {
  const inbuiltSource: SourceInfo = {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '2.1.5',
  };

  const blockedReport: ExtensionDiagnosticReport = {
    sourceId: 'shonenx-hls-inbuilt',
    sourceName: 'ShizuTv Stream (Inbuilt)',
    status: 'fail',
    durationMs: 420,
    testedAt: '2026-11-20T01:30:00.000Z',
    mode: 'full',
    failureKind: 'blocked_request',
    summary: 'Upstream access blocked on ShizuTv Stream (Inbuilt); remaining capabilities unverified',
    detail:
      'Unable to search ShizuTv Stream (Inbuilt) (HTTP 403). Upstream access is restricted or unverified from this server; this does not mean the extension format is unsupported.',
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

  const snap = buildExtensionCompatibilitySnapshot(inbuiltSource, blockedReport, 'ANIME');
  assert.equal(snap.overallStatus, 'failed');
  assert.equal(snap.failureKind, 'blocked_request');
  assert.equal(snap.runtimeRequirement, 'web-compatible');
  assert.equal(snap.capabilities.animeSearch.status, 'failed');
  assert.equal(snap.capabilities.episodeListing.status, 'unverified');
  assert.equal(snap.capabilities.audioLanguage.status, 'unverified');
  assert.equal(snap.capabilities.videoPlayback.status, 'unverified');

  // Stale persisted pre-fix report that had status='unsupported' from HTTP 403 heals on load and snapshot
  const stalePersisted403Report: ExtensionDiagnosticReport = {
    sourceId: 'shonenx-hls-inbuilt',
    sourceName: 'ShizuTv Stream (Inbuilt)',
    status: 'unsupported',
    durationMs: 390,
    testedAt: '2026-11-19T22:00:00.000Z',
    mode: 'full',
    summary: 'Unsupported in Web Bridge: Upstream protection',
    detail: 'https://ww5.gogoanimes.fi returned HTTP 403 Cloudflare challenge.',
    capabilities: {
      metadataSearch: 'unsupported',
      episodeOrChapterListing: 'unsupported',
      audioLanguage: 'unsupported',
      playbackOrReader: 'unsupported',
      overallCompatibility: 'unsupported',
    },
  };

  const backing = new Map<string, string>();
  backing.set(
    EXTENSION_DIAGNOSTICS_STORAGE_KEY,
    JSON.stringify({ 'shonenx-hls-inbuilt': stalePersisted403Report }),
  );
  const healedMap = loadPersistedExtensionDiagnostics({
    getItem: (k) => backing.get(k) ?? null,
    setItem: (k, v) => backing.set(k, v),
  });
  const healed = healedMap['shonenx-hls-inbuilt'];
  assert.equal(healed.status, 'fail');
  assert.equal(healed.failureKind, 'blocked_request');
  assert.equal(healed.capabilities.metadataSearch, 'unavailable');
  assert.equal(healed.capabilities.episodeOrChapterListing, 'untested');
  assert.equal(healed.capabilities.audioLanguage, 'untested');
  assert.equal(healed.capabilities.playbackOrReader, 'untested');

  const healedSnap = buildExtensionCompatibilitySnapshot(inbuiltSource, stalePersisted403Report, 'ANIME');
  assert.equal(healedSnap.overallStatus, 'failed');
  assert.equal(healedSnap.runtimeRequirement, 'web-compatible');
  assert.equal(healedSnap.capabilities.animeSearch.status, 'failed');
  assert.equal(healedSnap.capabilities.episodeListing.status, 'unverified');
  assert.equal(healedSnap.capabilities.audioLanguage.status, 'unverified');
  assert.equal(healedSnap.capabilities.videoPlayback.status, 'unverified');

  // Partial stale unsupported report preserves verified search as Supported
  const stalePartial403Report: ExtensionDiagnosticReport = {
    ...stalePersisted403Report,
    capabilities: {
      metadataSearch: 'verified',
      episodeOrChapterListing: 'unsupported',
      audioLanguage: 'unsupported',
      playbackOrReader: 'unsupported',
      overallCompatibility: 'unsupported',
    },
  };
  const partialHealedSnap = buildExtensionCompatibilitySnapshot(
    inbuiltSource,
    stalePartial403Report,
    'ANIME',
  );
  assert.equal(partialHealedSnap.overallStatus, 'partial');
  assert.equal(partialHealedSnap.capabilities.animeSearch.status, 'supported');
  assert.equal(partialHealedSnap.capabilities.episodeListing.status, 'failed');
  assert.equal(partialHealedSnap.capabilities.audioLanguage.status, 'unverified');
  assert.equal(partialHealedSnap.capabilities.videoPlayback.status, 'unverified');

  // Genuine client-rendered JS SPA unsupported report remains Unsupported
  const genuineSpaSource: SourceInfo = {
    id: 'ext-ay-spa',
    name: 'ClientSpaAnime',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://spa-only.example',
  };
  const genuineSpaReport: ExtensionDiagnosticReport = {
    sourceId: 'ext-ay-spa',
    sourceName: 'ClientSpaAnime',
    status: 'unsupported',
    durationMs: 210,
    testedAt: '2026-11-20T01:35:00.000Z',
    mode: 'full',
    failureKind: 'unsupported_format',
    summary: 'Unsupported in Web Bridge: Extension format requires unsupported runtime',
    detail: 'ClientSpaAnime (https://spa-only.example) is a client-rendered JavaScript app without server-rendered search results.',
    capabilities: {
      metadataSearch: 'unsupported',
      episodeOrChapterListing: 'unsupported',
      audioLanguage: 'unsupported',
      playbackOrReader: 'unsupported',
      overallCompatibility: 'unsupported',
    },
  };
  const spaSnap = buildExtensionCompatibilitySnapshot(genuineSpaSource, genuineSpaReport, 'ANIME');
  assert.equal(spaSnap.overallStatus, 'unsupported');
  assert.equal(spaSnap.capabilities.animeSearch.status, 'unsupported');
  assert.equal(spaSnap.capabilities.episodeListing.status, 'unsupported');
  assert.equal(spaSnap.capabilities.videoPlayback.status, 'unsupported');
});

test('stale client Failed to fetch and blocked_request fail reports normalize unreached listing/playback to unverified', () => {
  const inbuiltSource: SourceInfo = {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '2.1.5',
  };

  const staleClientOutageReport: ExtensionDiagnosticReport = {
    sourceId: 'shonenx-hls-inbuilt',
    sourceName: 'ShizuTv Stream (Inbuilt)',
    status: 'fail',
    durationMs: 25,
    testedAt: '2026-11-20T09:00:00.000Z',
    mode: 'full',
    failureKind: 'network_error',
    summary: 'Failed to fetch',
    detail: 'Failed to fetch',
    capabilities: {
      metadataSearch: 'unavailable',
      episodeOrChapterListing: 'unavailable',
      audioLanguage: 'untested',
      playbackOrReader: 'unavailable',
      overallCompatibility: 'incompatible',
    },
  };

  const snap = buildExtensionCompatibilitySnapshot(inbuiltSource, staleClientOutageReport, 'ANIME');
  assert.equal(snap.overallStatus, 'failed');
  assert.equal(snap.capabilities.animeSearch.status, 'failed');
  assert.equal(snap.capabilities.episodeListing.status, 'unverified');
  assert.equal(snap.capabilities.audioLanguage.status, 'unverified');
  assert.equal(snap.capabilities.videoPlayback.status, 'unverified');
});



