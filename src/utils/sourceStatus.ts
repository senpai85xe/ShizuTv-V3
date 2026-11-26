import type { MediaType, SourceInfo } from '../types/media';
import {
  buildExtensionCompatibilitySnapshot,
  isAniyomiPackageSource,
  type ExtensionDiagnosticReport,
} from './extensionDiagnostics';
import type { ExtensionMediaTab } from './extensionsManager';
import { resolveMangaHostPlan } from './mangaResolverUtils';
import type { SourceHealthCheckResult } from './sourceHealthCheck';
import { getSourcePlayabilityStatus } from './sourcePicker';
import { detectSourceProfile, type SourceProfileKind } from './streamResolverUtils';

export type SourceLiveStatusKind =
  | 'working'
  | 'web-ready'
  | 'partial'
  | 'blocked'
  | 'failed'
  | 'android-native'
  | 'unsupported'
  | 'untested';

export interface SourceLiveStatusBadge {
  kind: SourceLiveStatusKind;
  label: string;
  shortHint?: string;
  isWebPlayable: boolean;
  isLikelyWorking: boolean;
  profileKind: SourceProfileKind | 'manga-bridge' | 'manga-web';
  rank: number;
}

const DEDICATED_ANIME_WEB_PROFILES = new Set<SourceProfileKind>([
  'inbuilt-anime',
  'hianime',
  'gogo-clone',
  'wordpress-animestream',
]);

export function toExtensionMediaTab(mediaType?: MediaType | ExtensionMediaTab | null): ExtensionMediaTab {
  if (mediaType === 'MANGA') return 'MANGA';
  return 'ANIME';
}

/**
 * Returns true when an extension/source is genuinely runnable on the Web Adapter
 * (either inbuilt, verified by full diagnostic, matched to a dedicated web adapter
 * like HiAnime/AniWatch/Kaido/Gogo/AnimeStream/MangaDex, or a non-APK web extension
 * with a valid HTTP host). Excludes metadata-only catalogs, Gotaku, missing-host stubs,
 * and unverified pure Android APK packages without a web adapter.
 */
export function isWebPlayableExtensionCandidate(
  source: SourceInfo,
  report?: ExtensionDiagnosticReport | null,
  mediaType: MediaType | ExtensionMediaTab = 'ANIME',
  healthResult?: SourceHealthCheckResult | null,
): boolean {
  const mediaTab = toExtensionMediaTab(mediaType);

  const playability = getSourcePlayabilityStatus(source, mediaTab);
  if (playability !== 'playable') return false;

  const snapshot = buildExtensionCompatibilitySnapshot(source, report, mediaTab);
  if (snapshot.overallStatus === 'unsupported') return false;

  const playbackVerified =
    snapshot.hasVerifiedFullDiagnostic ||
    snapshot.capabilities.videoPlayback.status === 'supported';

  // Full diagnostic explicitly verified playback/pages -> always web playable
  if (playbackVerified) {
    return true;
  }

  // Built-in engines and official bridges are always web-playable candidates
  if (
    source.type === 'inbuilt' ||
    source.id === 'hianime-bridge' ||
    source.id === 'mangadex-bridge'
  ) {
    return true;
  }

  if (mediaTab === 'MANGA') {
    const mangaPlan = resolveMangaHostPlan({
      sourceId: source.id,
      sourceName: source.name,
      sourceBaseUrl: source.baseUrl,
    });
    if (mangaPlan.mode === 'mangadex') return true;
    if (mangaPlan.mode === 'missing-host') return false;
    if (!isAniyomiPackageSource(source)) return true;
    return healthResult?.status === 'healthy';
  }

  const profile = detectSourceProfile(source);
  if (
    profile.kind === 'metadata-only' ||
    profile.kind === 'missing-host' ||
    profile.kind === 'gotaku' ||
    profile.kind === 'non-anime'
  ) {
    return false;
  }

  if (DEDICATED_ANIME_WEB_PROFILES.has(profile.kind)) {
    return true;
  }

  // Non-Aniyomi-APK web extensions (e.g., Mangayomi / CloudStream / custom with valid HTTP host)
  if (!isAniyomiPackageSource(source)) {
    return true;
  }

  // Generic Aniyomi APK entries without a dedicated web adapter require explicit verification
  return healthResult?.status === 'healthy';
}

export function resolveSourceLiveStatusBadge(params: {
  source: SourceInfo;
  report?: ExtensionDiagnosticReport | null;
  healthResult?: SourceHealthCheckResult | null;
  mediaType?: MediaType | ExtensionMediaTab;
}): SourceLiveStatusBadge {
  const { source, report, healthResult } = params;
  const mediaTab = toExtensionMediaTab(params.mediaType ?? (source.mediaTypes?.[0] as MediaType | undefined));
  const playability = getSourcePlayabilityStatus(source, mediaTab);
  const snapshot = buildExtensionCompatibilitySnapshot(source, report, mediaTab);
  const profile = detectSourceProfile(source);
  const profileKind: SourceLiveStatusBadge['profileKind'] =
    mediaTab === 'MANGA'
      ? source.type === 'inbuilt' || source.id === 'mangadex-bridge'
        ? 'manga-bridge'
        : 'manga-web'
      : profile.kind;
  const isCandidate = isWebPlayableExtensionCandidate(source, report, mediaTab, healthResult);

  // 1. Explicitly unsupported / metadata-only / gotaku / missing-host
  if (
    playability !== 'playable' ||
    snapshot.overallStatus === 'unsupported' ||
    (mediaTab === 'ANIME' && profile.kind === 'gotaku')
  ) {
    const label =
      playability === 'metadata-only'
        ? 'Metadata Only'
        : playability === 'missing-host'
          ? 'No Host URL'
          : profile.kind === 'gotaku'
            ? 'Protected · Unsupported'
            : 'Unsupported';
    return {
      kind: 'unsupported',
      label,
      shortHint: snapshot.failureReason || undefined,
      isWebPlayable: false,
      isLikelyWorking: false,
      profileKind,
      rank: 7,
    };
  }

  // 2. Full diagnostic verified playback/pages -> Verified Working
  const playbackVerified =
    snapshot.hasVerifiedFullDiagnostic ||
    snapshot.capabilities.videoPlayback.status === 'supported';
  if (playbackVerified) {
    return {
      kind: 'working',
      label: 'Verified Working',
      shortHint: snapshot.lastDiagnosticResult || 'Playback verified',
      isWebPlayable: true,
      isLikelyWorking: true,
      profileKind,
      rank: 0,
    };
  }

  // 3. Diagnostic recorded an upstream block or failure
  if (snapshot.overallStatus === 'failed') {
    const isBlocked = snapshot.failureKind === 'blocked_request';
    return {
      kind: isBlocked ? 'blocked' : 'failed',
      label: isBlocked
        ? 'Blocked (403)'
        : snapshot.failureKindLabel && snapshot.failureKindLabel !== 'Provider Error'
          ? snapshot.failureKindLabel
          : 'Failed',
      shortHint: snapshot.failureReason || snapshot.lastDiagnosticResult,
      isWebPlayable: isCandidate,
      isLikelyWorking: false,
      profileKind,
      rank: 5,
    };
  }

  // 4. Partial diagnostic (e.g. search worked, video playback failed or ping/basic only)
  if (snapshot.overallStatus === 'partial') {
    return {
      kind: 'partial',
      label: 'Partial',
      shortHint: snapshot.failureReason || snapshot.lastDiagnosticResult,
      isWebPlayable: isCandidate,
      isLikelyWorking: false,
      profileKind,
      rank: 4,
    };
  }

  // 5. Live heartbeat failure (without full diagnostic)
  if (healthResult?.status === 'invalid_format') {
    const isChallenge = /anti-bot|challenge|403|blocked/i.test(
      `${healthResult.summary} ${healthResult.detail || ''}`,
    );
    return {
      kind: isChallenge ? 'blocked' : 'failed',
      label: isChallenge ? 'Blocked (403)' : 'Invalid Format',
      shortHint: healthResult.detail || healthResult.summary,
      isWebPlayable: isCandidate,
      isLikelyWorking: false,
      profileKind,
      rank: 5,
    };
  }
  if (healthResult?.status === 'unreachable') {
    return {
      kind: 'failed',
      label: healthResult.httpStatus === 403 || healthResult.httpStatus === 429 ? 'Blocked (403)' : 'Unreachable',
      shortHint: healthResult.detail || healthResult.summary,
      isWebPlayable: isCandidate,
      isLikelyWorking: false,
      profileKind,
      rank: 5,
    };
  }

  // 6. Dedicated web adapters, inbuilt engines, or healthy heartbeat
  const isDedicatedWebAdapter =
    source.type === 'inbuilt' ||
    source.id === 'hianime-bridge' ||
    source.id === 'mangadex-bridge' ||
    (mediaTab === 'ANIME' && DEDICATED_ANIME_WEB_PROFILES.has(profile.kind));

  if (isDedicatedWebAdapter || healthResult?.status === 'healthy') {
    const isHealthyHeartbeat = healthResult?.status === 'healthy';
    return {
      kind: 'web-ready',
      label: isHealthyHeartbeat
        ? 'Host Reachable'
        : source.type === 'inbuilt'
          ? 'Inbuilt Engine'
          : 'Web Adapter Ready',
      shortHint: isHealthyHeartbeat
        ? healthResult.summary
        : source.type === 'inbuilt'
          ? 'Multi-provider inbuilt resolver'
          : 'Matches ShizuTv web adapter',
      isWebPlayable: true,
      isLikelyWorking: true,
      profileKind,
      rank: source.type === 'inbuilt' || isHealthyHeartbeat ? 1 : 2,
    };
  }

  // 7. Unverified Aniyomi APK package without dedicated web adapter
  if (isAniyomiPackageSource(source)) {
    return {
      kind: 'android-native',
      label: 'APK Runtime Only',
      shortHint: 'No dedicated web adapter matched',
      isWebPlayable: false,
      isLikelyWorking: false,
      profileKind,
      rank: 6,
    };
  }

  // 8. Generic web extension not yet tested
  return {
    kind: 'untested',
    label: 'Not Tested',
    shortHint: 'Tap Test to check if episodes & video load',
    isWebPlayable: true,
    isLikelyWorking: true,
    profileKind,
    rank: 3,
  };
}

export function sortSourcesByLiveStatus(params: {
  sources: SourceInfo[];
  diagnosticsBySourceId?: Record<string, ExtensionDiagnosticReport | undefined>;
  healthBySourceId?: Record<string, SourceHealthCheckResult | undefined>;
  mediaType?: MediaType | ExtensionMediaTab;
  onlyLikelyWorking?: boolean;
}): SourceInfo[] {
  const {
    sources,
    diagnosticsBySourceId,
    healthBySourceId,
    mediaType = 'ANIME',
    onlyLikelyWorking = false,
  } = params;

  const decorated = sources.map((source) => {
    const badge = resolveSourceLiveStatusBadge({
      source,
      report: diagnosticsBySourceId?.[source.id],
      healthResult: healthBySourceId?.[source.id],
      mediaType,
    });
    return { source, badge };
  });

  const filtered = onlyLikelyWorking
    ? decorated.filter((item) => item.badge.isLikelyWorking)
    : decorated;

  return filtered
    .sort((a, b) => {
      if (a.badge.rank !== b.badge.rank) return a.badge.rank - b.badge.rank;
      if (a.source.type !== b.source.type) {
        return a.source.type === 'inbuilt' ? -1 : 1;
      }
      return a.source.name.localeCompare(b.source.name);
    })
    .map((item) => item.source);
}

export function countWebPlayableCandidates(
  sources: SourceInfo[],
  diagnosticsBySourceId?: Record<string, ExtensionDiagnosticReport | undefined>,
  mediaType: MediaType | ExtensionMediaTab = 'ANIME',
  healthBySourceId?: Record<string, SourceHealthCheckResult | undefined>,
): number {
  let count = 0;
  for (const src of sources) {
    if (
      isWebPlayableExtensionCandidate(
        src,
        diagnosticsBySourceId?.[src.id],
        mediaType,
        healthBySourceId?.[src.id],
      )
    ) {
      count++;
    }
  }
  return count;
}
