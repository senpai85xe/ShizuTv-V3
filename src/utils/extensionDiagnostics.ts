import type { ExtensionMediaTab } from './extensionsManager';
import type { ExtensionRuntimeRequirement, SourceInfo } from '../types/media';
import { detectSourceProfile } from './streamResolverUtils';

export type { ExtensionRuntimeRequirement };

export type CapabilityStatus =
  | 'verified'
  | 'partial'
  | 'unavailable'
  | 'untested'
  | 'unsupported';

export type DiagnosticOverallStatus = 'pass' | 'partial' | 'fail' | 'unsupported';

export type CompatibilityDisplayStatus =
  | 'supported'
  | 'partial'
  | 'failed'
  | 'unverified'
  | 'unsupported';

export type DiagnosticFailureKind =
  | 'network_error'
  | 'timeout'
  | 'blocked_request'
  | 'auth_required'
  | 'unsupported_format'
  | 'malformed_response'
  | 'provider_error'
  | 'missing_host'
  | 'metadata_only';

export type SourceReliabilityLevel =
  | 'verified'
  | 'partially_verified'
  | 'unverified'
  | 'unsupported';

export const DIAGNOSTIC_FAILURE_KIND_LABELS: Record<DiagnosticFailureKind, string> = {
  network_error: 'Network Error',
  timeout: 'Timeout',
  blocked_request: 'Blocked Request',
  auth_required: 'Auth Required',
  unsupported_format: 'Unsupported Format',
  malformed_response: 'Malformed Response',
  provider_error: 'Provider Error',
  missing_host: 'Missing Host',
  metadata_only: 'Metadata Only',
};

export const SOURCE_RELIABILITY_LABELS: Record<SourceReliabilityLevel, string> = {
  verified: 'Verified',
  partially_verified: 'Partially Verified',
  unverified: 'Unverified',
  unsupported: 'Unsupported',
};

export const COMPATIBILITY_STATUS_LABELS: Record<CompatibilityDisplayStatus, string> = {
  supported: 'Supported',
  partial: 'Partial',
  failed: 'Failed',
  unverified: 'Unverified',
  unsupported: 'Unsupported',
};

export const EXTENSION_RUNTIME_REQUIREMENT_LABELS: Record<
  ExtensionRuntimeRequirement,
  string
> = {
  'web-compatible': 'Web Adapter Compatible',
  'android-native': 'Requires Android Native Runtime',
  unsupported: 'Unsupported',
  unverified: 'Unverified',
};

const BUILTIN_WEB_BRIDGE_IDS = new Set(['hianime-bridge', 'mangadex-bridge']);

export function isAniyomiPackageSource(
  source?:
    | (Pick<SourceInfo, 'id' | 'type'> &
        Partial<Pick<SourceInfo, 'pkg' | 'apkName' | 'metadataOnlyStorage'>>)
    | null,
): boolean {
  if (!source || source.type === 'inbuilt') return false;
  if (source.metadataOnlyStorage === true) return true;
  if (typeof source.id === 'string' && source.id.startsWith('ext-ay-')) return true;
  if (typeof source.apkName === 'string' && source.apkName.trim().length > 0) return true;
  if (
    typeof source.pkg === 'string' &&
    /(?:tachiyomi|aniyomi|mihon|komikku|animeextension|extension)/i.test(source.pkg)
  ) {
    return true;
  }
  return false;
}

export function classifyExtensionRuntimeRequirement(params: {
  source: Pick<SourceInfo, 'id' | 'type' | 'mediaTypes'> &
    Partial<Pick<SourceInfo, 'pkg' | 'apkName' | 'metadataOnlyStorage'>>;
  profileKind?: string;
  isMetadataOnly?: boolean;
  overallStatus?: CompatibilityDisplayStatus;
  reportStatus?: DiagnosticOverallStatus | null;
  hasVerifiedFullDiagnostic?: boolean;
  contextMediaTab?: ExtensionMediaTab;
}): ExtensionRuntimeRequirement {
  const {
    source,
    profileKind,
    isMetadataOnly,
    overallStatus,
    reportStatus,
    hasVerifiedFullDiagnostic,
    contextMediaTab = 'ANIME',
  } = params;

  if (
    isMetadataOnly ||
    profileKind === 'metadata-only' ||
    profileKind === 'missing-host' ||
    profileKind === 'gotaku' ||
    (contextMediaTab === 'ANIME' && profileKind === 'non-anime') ||
    reportStatus === 'unsupported' ||
    overallStatus === 'unsupported'
  ) {
    return 'unsupported';
  }

  if (
    source.type === 'inbuilt' ||
    profileKind === 'inbuilt-anime' ||
    BUILTIN_WEB_BRIDGE_IDS.has(source.id) ||
    (hasVerifiedFullDiagnostic === true && overallStatus === 'supported')
  ) {
    return 'web-compatible';
  }

  if (isAniyomiPackageSource(source)) {
    return 'android-native';
  }

  return 'unverified';
}

export const MAX_DIAGNOSTIC_HISTORY = 6;
export const DEFAULT_DIAGNOSTIC_PROBE_SCOPE = 'Episode 1 default probe';

export interface ExtensionDiagnosticHistoryEntry {
  testedAt: string;
  status: DiagnosticOverallStatus;
  mode: ExtensionDiagnoseMode;
  durationMs: number;
  summary: string;
  failureKind?: DiagnosticFailureKind;
  failureReason?: string;
  probeScope?: string;
}

export interface ExtensionDiagnosticCapabilities {
  metadataSearch: CapabilityStatus;
  episodeOrChapterListing: CapabilityStatus;
  audioLanguage?: CapabilityStatus;
  playbackOrReader: CapabilityStatus;
  overallCompatibility: 'compatible' | 'partial' | 'unsupported' | 'incompatible';
}

export interface ExtensionDiagnosticReport {
  sourceId: string;
  sourceName: string;
  status: DiagnosticOverallStatus;
  durationMs: number;
  summary: string;
  detail?: string;
  matchedMediaId?: string;
  matchedTitle?: string;
  sampleItems?: string[];
  testedAt?: string;
  mode?: ExtensionDiagnoseMode;
  detectedAudioLanguages?: string[];
  confirmedAudioLanguages?: string[];
  inferredAudioLanguages?: string[];
  audioVerificationDetail?: string;
  probeScope?: string;
  failureKind?: DiagnosticFailureKind;
  lastVerifiedAt?: string | null;
  history?: ExtensionDiagnosticHistoryEntry[];
  capabilities: ExtensionDiagnosticCapabilities;
}

export type ExtensionDiagnoseMode = 'ping' | 'basic' | 'full';

export interface CapabilityStatusEntry {
  key: 'animeSearch' | 'episodeListing' | 'audioLanguage' | 'videoPlayback';
  label: string;
  status: CompatibilityDisplayStatus;
  statusLabel: string;
  reason?: string;
}

export interface ExtensionCompatibilitySnapshot {
  sourceId: string;
  sourceName: string;
  isMetadataOnly: boolean;
  overallStatus: CompatibilityDisplayStatus;
  overallLabel: string;
  reliabilityLevel: SourceReliabilityLevel;
  reliabilityLabel: string;
  capabilities: {
    animeSearch: CapabilityStatusEntry;
    episodeListing: CapabilityStatusEntry;
    audioLanguage: CapabilityStatusEntry;
    videoPlayback: CapabilityStatusEntry;
  };
  lastTestedAt: string | null;
  lastVerifiedAt: string | null;
  lastDiagnosticResult: string;
  failureReason: string | null;
  failureKind: DiagnosticFailureKind | null;
  failureKindLabel: string | null;
  probeScope: string | null;
  hasVerifiedFullDiagnostic: boolean;
  detectedAudioLanguages: string[];
  confirmedAudioLanguages: string[];
  inferredAudioLanguages: string[];
  audioVerificationDetail: string | null;
  history: ExtensionDiagnosticHistoryEntry[];
  runtimeRequirement: ExtensionRuntimeRequirement;
  runtimeRequirementLabel: string;
  isNativePackageMetadataOnly: boolean;
}

export interface CompatibilityDashboardCounts {
  supported: number;
  partial: number;
  failed: number;
  unverified: number;
  unsupported: number;
  metadataOnly: number;
  totalPlayable: number;
  androidNative: number;
  webCompatible: number;
}

export const EXTENSION_DIAGNOSTICS_STORAGE_KEY = 'shizutv_extension_diagnostics_v1';

export interface DiagnosticStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function classifyDiagnosticFailure(
  reasonOrMessage?: string | null,
  statusCode?: number | null,
): DiagnosticFailureKind {
  const msg = String(reasonOrMessage || '').toLowerCase();

  if (statusCode === 401 || statusCode === 407) return 'auth_required';
  if (statusCode === 429) return 'blocked_request';
  if (statusCode === 403) {
    return /cloudflare|turnstile|captcha|anti-bot|challenge|just a moment|bot|upstream access|access is restricted|ddos-guard|waf/.test(
      msg,
    )
      ? 'blocked_request'
      : 'auth_required';
  }
  if (statusCode === 426) return 'unsupported_format';

  if (/metadata\/tracking catalog|metadata-only/i.test(msg)) return 'metadata_only';
  if (/valid http base url|missing.*host/i.test(msg)) return 'missing_host';
  if (/timed?\s*out|timeout|aborted|etimedout/i.test(msg)) return 'timeout';
  if (
    /econnrefused|econnreset|enotfound|eai_again|ehostunreach|enetunreach|unreachable|network|socket hang up|fetch failed/i.test(
      msg,
    )
  ) {
    return 'network_error';
  }
  if (
    /turnstile|cloudflare|anti-bot|captcha|challenge|http\s*(?:429|503)|blocked|upstream access|access is restricted|ddos-guard|waf|rate.?limit/i.test(
      msg,
    )
  ) {
    return 'blocked_request';
  }
  if (/unauthorized|authentication|login required|http (?:401|403|407)|forbidden/i.test(msg)) {
    return 'auth_required';
  }
  if (/malformed|invalid json|unexpected token|corrupt|parse error|truncat/i.test(msg)) {
    return 'malformed_response';
  }
  if (
    /javascript app|encrypted binary|drm|unsupported|not supported/i.test(
      msg,
    )
  ) {
    return 'unsupported_format';
  }
  return 'provider_error';
}

/**
 * Enforces strict rule: green 'pass' is ONLY permitted when actual playback (Anime)
 * or real chapter pages (Manga) were verified against the target extension/bridge.
 * AniList/AniZip metadata lookup or HTTP ping alone can never return 'pass'.
 */
export function resolveDiagnosticOverallStatus(params: {
  mode: ExtensionDiagnoseMode;
  unsupportedReason?: string | null;
  searchMatched: boolean;
  listingAvailable: boolean;
  playbackOrPagesVerified: boolean;
  errorOccurred: boolean;
}): DiagnosticOverallStatus {
  if (params.unsupportedReason) {
    return 'unsupported';
  }
  if (params.mode === 'full') {
    if (params.playbackOrPagesVerified) {
      return 'pass';
    }
    if (params.searchMatched || params.listingAvailable) {
      return 'partial';
    }
    return 'fail';
  }
  if (params.errorOccurred) {
    return 'fail';
  }
  // Ping & Basic search only check reachability / site search without playback verification
  if (params.searchMatched) {
    return 'partial';
  }
  return params.mode === 'ping' ? 'partial' : 'fail';
}

export function buildCapabilitiesBreakdown(params: {
  mode: ExtensionDiagnoseMode;
  mediaTab: ExtensionMediaTab;
  unsupportedReason?: string | null;
  isMetadataCatalogOnly?: boolean;
  searchMatched: boolean;
  listingAvailable: boolean;
  playbackOrPagesVerified: boolean;
  audioLanguageStatus?: CapabilityStatus;
  listingStatus?: CapabilityStatus;
  playbackStatus?: CapabilityStatus;
}): ExtensionDiagnosticCapabilities {
  if (params.unsupportedReason) {
    return {
      metadataSearch: params.isMetadataCatalogOnly ? 'verified' : 'unsupported',
      episodeOrChapterListing: 'unsupported',
      audioLanguage: 'unsupported',
      playbackOrReader: 'unsupported',
      overallCompatibility: 'unsupported',
    };
  }

  const metadataSearch: CapabilityStatus =
    params.mode === 'ping'
      ? 'untested'
      : params.searchMatched
        ? 'verified'
        : 'unavailable';

  const episodeOrChapterListing: CapabilityStatus =
    params.listingStatus ??
    (params.mode !== 'full'
      ? 'untested'
      : params.listingAvailable
        ? 'verified'
        : 'unavailable');

  const playbackOrReader: CapabilityStatus =
    params.playbackStatus ??
    (params.mode !== 'full'
      ? 'untested'
      : params.playbackOrPagesVerified
        ? 'verified'
        : 'unavailable');

  const audioLanguage: CapabilityStatus =
    params.audioLanguageStatus ??
    (params.mediaTab !== 'ANIME'
      ? 'unsupported'
      : params.mode !== 'full'
        ? 'untested'
        : params.playbackOrPagesVerified
          ? 'partial'
          : 'untested');

  const overallCompatibility: ExtensionDiagnosticCapabilities['overallCompatibility'] =
    params.playbackOrPagesVerified
      ? 'compatible'
      : params.searchMatched || params.listingAvailable
        ? 'partial'
        : params.mode === 'full'
          ? 'incompatible'
          : 'partial';

  return {
    metadataSearch,
    episodeOrChapterListing,
    audioLanguage,
    playbackOrReader,
    overallCompatibility,
  };
}

export function formatCapabilityBadgeText(
  kind: 'search' | 'listing' | 'audio' | 'playback',
  status: CapabilityStatus,
  mediaTab: ExtensionMediaTab,
): string {
  const listingNoun = mediaTab === 'ANIME' ? 'Episodes' : 'Chapters';
  const playbackNoun = mediaTab === 'ANIME' ? 'Video Playback' : 'Reader Pages';
  const label =
    kind === 'search'
      ? 'Search'
      : kind === 'listing'
        ? listingNoun
        : kind === 'audio'
          ? 'Audio Language'
          : playbackNoun;

  switch (status) {
    case 'verified':
      return `${label}: Ready`;
    case 'partial':
      return `${label}: Partial`;
    case 'unsupported':
      return `${label}: Unsupported`;
    case 'unavailable':
      return `${label}: Failed`;
    case 'untested':
    default:
      return `${label}: Not Tested`;
  }
}

export function mapCapabilityStatusToDisplayStatus(
  status?: CapabilityStatus | null,
): CompatibilityDisplayStatus {
  switch (status) {
    case 'verified':
      return 'supported';
    case 'partial':
      return 'partial';
    case 'unavailable':
      return 'failed';
    case 'unsupported':
      return 'unsupported';
    case 'untested':
    default:
      return 'unverified';
  }
}

function makeCapabilityEntry(
  key: CapabilityStatusEntry['key'],
  label: string,
  status: CompatibilityDisplayStatus,
  reason?: string,
): CapabilityStatusEntry {
  return {
    key,
    label,
    status,
    statusLabel: COMPATIBILITY_STATUS_LABELS[status],
    ...(reason ? { reason } : {}),
  };
}

function inferEffectiveMode(report: ExtensionDiagnosticReport): ExtensionDiagnoseMode {
  if (report.mode === 'ping' || report.mode === 'basic' || report.mode === 'full') {
    return report.mode;
  }
  const caps = report.capabilities;
  if (
    caps.playbackOrReader !== 'untested' ||
    caps.episodeOrChapterListing !== 'untested' ||
    report.status === 'pass'
  ) {
    return 'full';
  }
  if (caps.metadataSearch !== 'untested') {
    return 'basic';
  }
  return 'ping';
}

function sanitizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((c): c is string => typeof c === 'string')
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function sanitizeHistoryEntries(raw: unknown): ExtensionDiagnosticHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is ExtensionDiagnosticHistoryEntry => {
      if (!item || typeof item !== 'object') return false;
      const obj = item as ExtensionDiagnosticHistoryEntry;
      return (
        typeof obj.testedAt === 'string' &&
        typeof obj.status === 'string' &&
        typeof obj.summary === 'string'
      );
    })
    .slice(0, MAX_DIAGNOSTIC_HISTORY);
}

function resolveSnapshotLastVerifiedAt(
  report?: ExtensionDiagnosticReport | null,
): string | null {
  if (!report) return null;
  if (typeof report.lastVerifiedAt === 'string' && report.lastVerifiedAt.trim()) {
    return report.lastVerifiedAt;
  }
  if (report.status === 'pass' && report.capabilities.playbackOrReader === 'verified') {
    return typeof report.testedAt === 'string' && report.testedAt.trim() ? report.testedAt : null;
  }
  return null;
}

type SnapshotWithoutRuntime = Omit<
  ExtensionCompatibilitySnapshot,
  'runtimeRequirement' | 'runtimeRequirementLabel' | 'isNativePackageMetadataOnly'
>;

const GENUINE_UNSUPPORTED_REPORT_TEXT_RE =
  /metadata\/tracking catalog|metadata-only|valid http base url|missing.*host|gotaku|encrypted binary|\bdrm\b/i;

const UPSTREAM_BLOCKED_REPORT_TEXT_RE =
  /http\s*(?:403|429|503)|anti-bot|cloudflare|turnstile|captcha|upstream protection|upstream access|access restriction|rate.?limit|blocked/i;

const CLIENT_BACKEND_OUTAGE_TEXT_RE =
  /failed to fetch|could not connect to|could not reach the shizutv backend|backend server url is not configured/i;

export function normalizeUpstreamBlockedUnsupportedReport(
  report: ExtensionDiagnosticReport,
  profileKind?: string,
): ExtensionDiagnosticReport {
  if (
    profileKind === 'metadata-only' ||
    profileKind === 'missing-host' ||
    profileKind === 'gotaku' ||
    profileKind === 'non-anime'
  ) {
    return report;
  }

  const combinedText = `${report.summary || ''} ${report.detail || ''}`;
  const caps = report.capabilities;

  // Heal stale 'fail' reports created by pre-fix blocked_request or client 'Failed to fetch' / backend outages
  // that marked unreached episode listing and playback capabilities as 'unavailable'
  if (report.status === 'fail') {
    const isStaleBlockedOrClientOutage =
      report.failureKind === 'blocked_request' || CLIENT_BACKEND_OUTAGE_TEXT_RE.test(combinedText);
    if (
      isStaleBlockedOrClientOutage &&
      caps.metadataSearch !== 'verified' &&
      (caps.episodeOrChapterListing === 'unavailable' || caps.playbackOrReader === 'unavailable')
    ) {
      return {
        ...report,
        capabilities: {
          metadataSearch: caps.metadataSearch,
          episodeOrChapterListing: 'untested',
          audioLanguage: caps.audioLanguage === 'unavailable' ? 'untested' : (caps.audioLanguage ?? 'untested'),
          playbackOrReader: 'untested',
          overallCompatibility: caps.overallCompatibility,
        },
      };
    }
    return report;
  }

  if (report.status !== 'unsupported') {
    return report;
  }

  if (GENUINE_UNSUPPORTED_REPORT_TEXT_RE.test(combinedText)) {
    return report;
  }

  const isUpstreamBlock =
    report.failureKind === 'blocked_request' || UPSTREAM_BLOCKED_REPORT_TEXT_RE.test(combinedText);

  if (!isUpstreamBlock) {
    return report;
  }

  const searchVerified = caps.metadataSearch === 'verified';
  const listingVerified = caps.episodeOrChapterListing === 'verified';
  const playbackVerified = caps.playbackOrReader === 'verified';

  const nextSearch: CapabilityStatus = searchVerified
    ? 'verified'
    : caps.metadataSearch === 'unsupported'
      ? 'unavailable'
      : caps.metadataSearch;

  const nextListing: CapabilityStatus = listingVerified
    ? 'verified'
    : caps.episodeOrChapterListing === 'unsupported'
      ? searchVerified
        ? 'unavailable'
        : 'untested'
      : caps.episodeOrChapterListing;

  const nextPlayback: CapabilityStatus = playbackVerified
    ? 'verified'
    : caps.playbackOrReader === 'unsupported'
      ? searchVerified && listingVerified
        ? 'unavailable'
        : 'untested'
      : caps.playbackOrReader;

  const nextAudio: CapabilityStatus =
    caps.audioLanguage === 'unsupported' ? 'untested' : (caps.audioLanguage ?? 'untested');

  const hasPartialProgress = searchVerified || listingVerified;
  const nextStatus: DiagnosticOverallStatus = hasPartialProgress ? 'partial' : 'fail';

  const normalizedSummary = /unsupported in web bridge:\s*upstream protection/i.test(
    report.summary || '',
  )
    ? `Upstream access blocked on ${report.sourceName}; remaining capabilities unverified`
    : report.summary;

  return {
    ...report,
    status: nextStatus,
    failureKind: 'blocked_request',
    summary: normalizedSummary,
    capabilities: {
      metadataSearch: nextSearch,
      episodeOrChapterListing: nextListing,
      audioLanguage: nextAudio,
      playbackOrReader: nextPlayback,
      overallCompatibility: hasPartialProgress ? 'partial' : 'incompatible',
    },
  };
}

function attachRuntimeRequirement(
  source: Pick<SourceInfo, 'id' | 'name' | 'type' | 'mediaTypes' | 'baseUrl' | 'pkg'> &
    Partial<Pick<SourceInfo, 'apkName' | 'metadataOnlyStorage' | 'runtimeRequirement'>>,
  profileKind: string,
  base: SnapshotWithoutRuntime,
  reportStatus: DiagnosticOverallStatus | null | undefined,
  contextMediaTab: ExtensionMediaTab,
): ExtensionCompatibilitySnapshot {
  const runtimeRequirement = classifyExtensionRuntimeRequirement({
    source,
    profileKind,
    isMetadataOnly: base.isMetadataOnly,
    overallStatus: base.overallStatus,
    reportStatus,
    hasVerifiedFullDiagnostic: base.hasVerifiedFullDiagnostic,
    contextMediaTab,
  });
  return {
    ...base,
    runtimeRequirement,
    runtimeRequirementLabel: EXTENSION_RUNTIME_REQUIREMENT_LABELS[runtimeRequirement],
    isNativePackageMetadataOnly: isAniyomiPackageSource(source),
  };
}

export function buildExtensionCompatibilitySnapshot(
  source: Pick<SourceInfo, 'id' | 'name' | 'type' | 'mediaTypes' | 'baseUrl' | 'pkg'> &
    Partial<Pick<SourceInfo, 'apkName' | 'metadataOnlyStorage' | 'runtimeRequirement'>>,
  report?: ExtensionDiagnosticReport | null,
  contextMediaTab: ExtensionMediaTab = 'ANIME',
): ExtensionCompatibilitySnapshot {
  const profile = detectSourceProfile(source);
  const searchLabel = contextMediaTab === 'ANIME' ? 'Anime Search' : 'Manga Search';
  const listingLabel = contextMediaTab === 'ANIME' ? 'Episode Listing' : 'Chapter Listing';
  const playbackLabel = contextMediaTab === 'ANIME' ? 'Video Playback' : 'Reader Pages';

  const lastTestedAt =
    report?.testedAt && typeof report.testedAt === 'string' ? report.testedAt : null;
  const lastVerifiedAt = resolveSnapshotLastVerifiedAt(report);
  const history = sanitizeHistoryEntries(report?.history);

  // 1. Metadata-only catalogs are strictly separated and never playable.
  if (profile.kind === 'metadata-only' || profile.isMetadataOnly) {
    const reason =
      report?.detail ||
      profile.compatibility.reason ||
      `${source.name} is a metadata/tracking catalog and does not host playable streams.`;
    const searchStatus: CompatibilityDisplayStatus = report
      ? mapCapabilityStatusToDisplayStatus(report.capabilities.metadataSearch)
      : 'unverified';
    return attachRuntimeRequirement(
      source,
      profile.kind,
      {
        sourceId: source.id,
        sourceName: source.name,
        isMetadataOnly: true,
        overallStatus: 'unsupported',
        overallLabel: COMPATIBILITY_STATUS_LABELS.unsupported,
        reliabilityLevel: 'unsupported',
        reliabilityLabel: SOURCE_RELIABILITY_LABELS.unsupported,
        capabilities: {
          animeSearch: makeCapabilityEntry('animeSearch', searchLabel, searchStatus),
          episodeListing: makeCapabilityEntry('episodeListing', listingLabel, 'unsupported', reason),
          audioLanguage: makeCapabilityEntry('audioLanguage', 'Audio Language', 'unsupported', reason),
          videoPlayback: makeCapabilityEntry('videoPlayback', playbackLabel, 'unsupported', reason),
        },
        lastTestedAt,
        lastVerifiedAt: null,
        lastDiagnosticResult: report?.summary || 'Metadata-only catalog (not playable)',
        failureReason: reason,
        failureKind: 'metadata_only',
        failureKindLabel: DIAGNOSTIC_FAILURE_KIND_LABELS.metadata_only,
        probeScope: null,
        hasVerifiedFullDiagnostic: false,
        detectedAudioLanguages: [],
        confirmedAudioLanguages: [],
        inferredAudioLanguages: [],
        audioVerificationDetail: null,
        history,
      },
      report?.status,
      contextMediaTab,
    );
  }

  // 2. Non-matching media / Missing host
  if (
    profile.kind === 'missing-host' ||
    (contextMediaTab === 'ANIME' && profile.kind === 'non-anime')
  ) {
    const reason =
      report?.detail ||
      profile.compatibility.reason ||
      `${source.name} is missing a compatible stream host.`;
    const failureKind: DiagnosticFailureKind =
      profile.kind === 'missing-host' ? 'missing_host' : 'unsupported_format';
    return attachRuntimeRequirement(
      source,
      profile.kind,
      {
        sourceId: source.id,
        sourceName: source.name,
        isMetadataOnly: false,
        overallStatus: 'unsupported',
        overallLabel: COMPATIBILITY_STATUS_LABELS.unsupported,
        reliabilityLevel: 'unsupported',
        reliabilityLabel: SOURCE_RELIABILITY_LABELS.unsupported,
        capabilities: {
          animeSearch: makeCapabilityEntry('animeSearch', searchLabel, 'unsupported', reason),
          episodeListing: makeCapabilityEntry('episodeListing', listingLabel, 'unsupported', reason),
          audioLanguage: makeCapabilityEntry('audioLanguage', 'Audio Language', 'unsupported', reason),
          videoPlayback: makeCapabilityEntry('videoPlayback', playbackLabel, 'unsupported', reason),
        },
        lastTestedAt,
        lastVerifiedAt: null,
        lastDiagnosticResult: report?.summary || 'Unsupported extension configuration',
        failureReason: reason,
        failureKind,
        failureKindLabel: DIAGNOSTIC_FAILURE_KIND_LABELS[failureKind],
        probeScope: null,
        hasVerifiedFullDiagnostic: false,
        detectedAudioLanguages: [],
        confirmedAudioLanguages: [],
        inferredAudioLanguages: [],
        audioVerificationDetail: null,
        history,
      },
      report?.status,
      contextMediaTab,
    );
  }

  // 3. Gotaku: public catalog search supported, encrypted/Turnstile episodes & playback unsupported.
  if (profile.kind === 'gotaku') {
    const reason =
      report?.detail ||
      profile.capabilities.stream.reason ||
      'Episode lists and video playback are protected by encrypted binary payloads and Turnstile.';
    const searchStatus: CompatibilityDisplayStatus = report
      ? mapCapabilityStatusToDisplayStatus(report.capabilities.metadataSearch)
      : 'unverified';
    const overallStatus: CompatibilityDisplayStatus =
      searchStatus === 'supported' ? 'partial' : 'unsupported';
    return attachRuntimeRequirement(
      source,
      profile.kind,
      {
        sourceId: source.id,
        sourceName: source.name,
        isMetadataOnly: false,
        overallStatus,
        overallLabel: COMPATIBILITY_STATUS_LABELS[overallStatus],
        reliabilityLevel: 'unsupported',
        reliabilityLabel: SOURCE_RELIABILITY_LABELS.unsupported,
        capabilities: {
          animeSearch: makeCapabilityEntry('animeSearch', searchLabel, searchStatus),
          episodeListing: makeCapabilityEntry('episodeListing', listingLabel, 'unsupported', reason),
          audioLanguage: makeCapabilityEntry('audioLanguage', 'Audio Language', 'unsupported', reason),
          videoPlayback: makeCapabilityEntry('videoPlayback', playbackLabel, 'unsupported', reason),
        },
        lastTestedAt,
        lastVerifiedAt: null,
        lastDiagnosticResult:
          report?.summary || 'Catalog search only · Episodes and playback unsupported',
        failureReason: reason,
        failureKind: report?.failureKind || 'unsupported_format',
        failureKindLabel:
          DIAGNOSTIC_FAILURE_KIND_LABELS[report?.failureKind || 'unsupported_format'],
        probeScope: report?.probeScope || null,
        hasVerifiedFullDiagnostic: false,
        detectedAudioLanguages: [],
        confirmedAudioLanguages: [],
        inferredAudioLanguages: [],
        audioVerificationDetail: null,
        history,
      },
      report?.status,
      contextMediaTab,
    );
  }

  // 4. Untested sources: NEVER mark playback or other capabilities as Supported until verified.
  if (!report) {
    return attachRuntimeRequirement(
      source,
      profile.kind,
      {
        sourceId: source.id,
        sourceName: source.name,
        isMetadataOnly: false,
        overallStatus: 'unverified',
        overallLabel: COMPATIBILITY_STATUS_LABELS.unverified,
        reliabilityLevel: 'unverified',
        reliabilityLabel: SOURCE_RELIABILITY_LABELS.unverified,
        capabilities: {
          animeSearch: makeCapabilityEntry('animeSearch', searchLabel, 'unverified'),
          episodeListing: makeCapabilityEntry('episodeListing', listingLabel, 'unverified'),
          audioLanguage: makeCapabilityEntry(
            'audioLanguage',
            'Audio Language',
            contextMediaTab === 'ANIME' ? 'unverified' : 'unsupported',
          ),
          videoPlayback: makeCapabilityEntry('videoPlayback', playbackLabel, 'unverified'),
        },
        lastTestedAt: null,
        lastVerifiedAt: null,
        lastDiagnosticResult: 'Not yet tested',
        failureReason: null,
        failureKind: null,
        failureKindLabel: null,
        probeScope: null,
        hasVerifiedFullDiagnostic: false,
        detectedAudioLanguages: [],
        confirmedAudioLanguages: [],
        inferredAudioLanguages: [],
        audioVerificationDetail: null,
        history: [],
      },
      null,
      contextMediaTab,
    );
  }

  // 5. Persisted report exists — enforce strict anti-false-positive verification gates.
  const normalizedReport = normalizeUpstreamBlockedUnsupportedReport(report, profile.kind);
  const effectiveMode = inferEffectiveMode(normalizedReport);
  const caps = normalizedReport.capabilities;

  if (effectiveMode === 'ping') {
    const overallStatus: CompatibilityDisplayStatus =
      normalizedReport.status === 'fail'
        ? 'failed'
        : normalizedReport.status === 'unsupported'
          ? 'unsupported'
          : 'partial';
    const failureReason =
      normalizedReport.detail ||
      normalizedReport.summary ||
      'Ping check only; playback pipeline was not verified.';
    const failureKind =
      normalizedReport.failureKind ||
      (overallStatus === 'failed' || overallStatus === 'unsupported'
        ? classifyDiagnosticFailure(failureReason)
        : null);
    const reliabilityLevel: SourceReliabilityLevel =
      overallStatus === 'unsupported'
        ? 'unsupported'
        : overallStatus === 'partial'
          ? 'partially_verified'
          : 'unverified';
    return attachRuntimeRequirement(
      source,
      profile.kind,
      {
        sourceId: source.id,
        sourceName: source.name,
        isMetadataOnly: false,
        overallStatus,
        overallLabel: COMPATIBILITY_STATUS_LABELS[overallStatus],
        reliabilityLevel,
        reliabilityLabel: SOURCE_RELIABILITY_LABELS[reliabilityLevel],
        capabilities: {
          animeSearch: makeCapabilityEntry('animeSearch', searchLabel, 'unverified'),
          episodeListing: makeCapabilityEntry('episodeListing', listingLabel, 'unverified'),
          audioLanguage: makeCapabilityEntry('audioLanguage', 'Audio Language', 'unverified'),
          videoPlayback: makeCapabilityEntry(
            'videoPlayback',
            playbackLabel,
            'unverified',
            'Ping check cannot verify video playback.',
          ),
        },
        lastTestedAt,
        lastVerifiedAt,
        lastDiagnosticResult: normalizedReport.summary,
        failureReason,
        failureKind,
        failureKindLabel: failureKind ? DIAGNOSTIC_FAILURE_KIND_LABELS[failureKind] : null,
        probeScope: normalizedReport.probeScope || null,
        hasVerifiedFullDiagnostic: false,
        detectedAudioLanguages: [],
        confirmedAudioLanguages: [],
        inferredAudioLanguages: [],
        audioVerificationDetail: null,
        history,
      },
      normalizedReport.status,
      contextMediaTab,
    );
  }

  if (effectiveMode === 'basic') {
    const searchDisplay = mapCapabilityStatusToDisplayStatus(caps.metadataSearch);
    const overallStatus: CompatibilityDisplayStatus =
      normalizedReport.status === 'unsupported'
        ? 'unsupported'
        : searchDisplay === 'supported'
          ? 'partial'
          : 'failed';
    const failureReason =
      normalizedReport.detail ||
      normalizedReport.summary ||
      'Basic search check only; episode listing and playback were not verified.';
    const failureKind =
      normalizedReport.failureKind ||
      (overallStatus === 'failed' || overallStatus === 'unsupported'
        ? classifyDiagnosticFailure(failureReason)
        : null);
    const reliabilityLevel: SourceReliabilityLevel =
      overallStatus === 'unsupported'
        ? 'unsupported'
        : overallStatus === 'partial'
          ? 'partially_verified'
          : 'unverified';
    return attachRuntimeRequirement(
      source,
      profile.kind,
      {
        sourceId: source.id,
        sourceName: source.name,
        isMetadataOnly: false,
        overallStatus,
        overallLabel: COMPATIBILITY_STATUS_LABELS[overallStatus],
        reliabilityLevel,
        reliabilityLabel: SOURCE_RELIABILITY_LABELS[reliabilityLevel],
        capabilities: {
          animeSearch: makeCapabilityEntry('animeSearch', searchLabel, searchDisplay),
          episodeListing: makeCapabilityEntry('episodeListing', listingLabel, 'unverified'),
          audioLanguage: makeCapabilityEntry('audioLanguage', 'Audio Language', 'unverified'),
          videoPlayback: makeCapabilityEntry(
            'videoPlayback',
            playbackLabel,
            'unverified',
            'Run Full Diagnostic to verify playback.',
          ),
        },
        lastTestedAt,
        lastVerifiedAt,
        lastDiagnosticResult: normalizedReport.summary,
        failureReason,
        failureKind,
        failureKindLabel: failureKind ? DIAGNOSTIC_FAILURE_KIND_LABELS[failureKind] : null,
        probeScope: normalizedReport.probeScope || null,
        hasVerifiedFullDiagnostic: false,
        detectedAudioLanguages: [],
        confirmedAudioLanguages: [],
        inferredAudioLanguages: [],
        audioVerificationDetail: null,
        history,
      },
      normalizedReport.status,
      contextMediaTab,
    );
  }

  // Full diagnostic mode
  const playbackVerifiedStrict =
    normalizedReport.status === 'pass' && caps.playbackOrReader === 'verified';

  const animeSearchStatus = mapCapabilityStatusToDisplayStatus(caps.metadataSearch);
  const episodeListingStatus = mapCapabilityStatusToDisplayStatus(caps.episodeOrChapterListing);

  // Never allow Video Playback to read Supported unless overall report === 'pass' AND playbackOrReader === 'verified'
  const rawPlaybackStatus = mapCapabilityStatusToDisplayStatus(caps.playbackOrReader);
  const videoPlaybackStatus: CompatibilityDisplayStatus = playbackVerifiedStrict
    ? 'supported'
    : rawPlaybackStatus === 'supported'
      ? 'failed'
      : rawPlaybackStatus;

  const explicitConfirmedAudio = sanitizeStringList(normalizedReport.confirmedAudioLanguages);
  const explicitInferredAudio = sanitizeStringList(normalizedReport.inferredAudioLanguages);
  const legacyDetectedAudio = sanitizeStringList(normalizedReport.detectedAudioLanguages);

  const confirmedAudioLanguages = playbackVerifiedStrict
    ? explicitConfirmedAudio.length > 0
      ? explicitConfirmedAudio
      : caps.audioLanguage === 'verified'
        ? legacyDetectedAudio
        : []
    : [];

  const inferredAudioLanguages =
    explicitInferredAudio.length > 0
      ? explicitInferredAudio
      : caps.audioLanguage === 'partial' && legacyDetectedAudio.length > 0
        ? legacyDetectedAudio
        : [];

  let audioLanguageStatus: CompatibilityDisplayStatus;
  if (contextMediaTab !== 'ANIME') {
    audioLanguageStatus = 'unsupported';
  } else if (caps.audioLanguage) {
    const mappedAudio = mapCapabilityStatusToDisplayStatus(caps.audioLanguage);
    if (mappedAudio === 'supported') {
      audioLanguageStatus =
        playbackVerifiedStrict && confirmedAudioLanguages.length > 0
          ? 'supported'
          : playbackVerifiedStrict
            ? 'partial'
            : 'unverified';
    } else {
      audioLanguageStatus = mappedAudio;
    }
  } else if (playbackVerifiedStrict) {
    audioLanguageStatus = confirmedAudioLanguages.length > 0 ? 'supported' : 'partial';
  } else if (videoPlaybackStatus === 'unsupported') {
    audioLanguageStatus = 'unsupported';
  } else {
    audioLanguageStatus = 'unverified';
  }

  let overallStatus: CompatibilityDisplayStatus;
  if (normalizedReport.status === 'unsupported') {
    overallStatus = 'unsupported';
  } else if (
    playbackVerifiedStrict &&
    animeSearchStatus === 'supported' &&
    episodeListingStatus === 'supported' &&
    videoPlaybackStatus === 'supported'
  ) {
    overallStatus =
      contextMediaTab === 'ANIME' &&
      (audioLanguageStatus === 'partial' || audioLanguageStatus === 'failed')
        ? 'partial'
        : 'supported';
  } else if (
    normalizedReport.status === 'fail' ||
    (animeSearchStatus === 'failed' &&
      episodeListingStatus !== 'supported' &&
      videoPlaybackStatus !== 'supported')
  ) {
    overallStatus = 'failed';
  } else if (
    animeSearchStatus === 'supported' ||
    episodeListingStatus === 'supported' ||
    videoPlaybackStatus === 'partial' ||
    audioLanguageStatus === 'partial' ||
    normalizedReport.status === 'partial'
  ) {
    overallStatus = 'partial';
  } else {
    overallStatus = 'failed';
  }

  const reliabilityLevel: SourceReliabilityLevel =
    overallStatus === 'unsupported'
      ? 'unsupported'
      : overallStatus === 'supported'
        ? 'verified'
        : overallStatus === 'partial'
          ? 'partially_verified'
          : 'unverified';

  const probeScope =
    normalizedReport.probeScope ||
    (contextMediaTab === 'ANIME' ? DEFAULT_DIAGNOSTIC_PROBE_SCOPE : null);

  const audioVerificationDetail =
    normalizedReport.audioVerificationDetail ||
    (contextMediaTab !== 'ANIME'
      ? null
      : playbackVerifiedStrict
        ? confirmedAudioLanguages.length > 0
          ? `${probeScope} · Confirmed audio: ${confirmedAudioLanguages
              .map((c) => c.toUpperCase())
              .join(', ')}`
          : `${probeScope} · Audio language unknown/inferred (no explicit track evidence)`
        : `${probeScope} · Audio unverified`);

  const failureReason =
    overallStatus === 'supported'
      ? null
      : normalizedReport.detail ||
        normalizedReport.summary ||
        'Full diagnostic did not verify all required capabilities.';

  const failureKind =
    overallStatus === 'supported'
      ? null
      : normalizedReport.failureKind ||
        (failureReason && overallStatus !== 'partial'
          ? classifyDiagnosticFailure(failureReason)
          : overallStatus === 'partial' && !playbackVerifiedStrict
            ? classifyDiagnosticFailure(failureReason)
            : null);

  return attachRuntimeRequirement(
    source,
    profile.kind,
    {
      sourceId: source.id,
      sourceName: source.name,
      isMetadataOnly: false,
      overallStatus,
      overallLabel: COMPATIBILITY_STATUS_LABELS[overallStatus],
      reliabilityLevel,
      reliabilityLabel: SOURCE_RELIABILITY_LABELS[reliabilityLevel],
      capabilities: {
        animeSearch: makeCapabilityEntry('animeSearch', searchLabel, animeSearchStatus),
        episodeListing: makeCapabilityEntry('episodeListing', listingLabel, episodeListingStatus),
        audioLanguage: makeCapabilityEntry('audioLanguage', 'Audio Language', audioLanguageStatus),
        videoPlayback: makeCapabilityEntry('videoPlayback', playbackLabel, videoPlaybackStatus),
      },
      lastTestedAt,
      lastVerifiedAt,
      lastDiagnosticResult: normalizedReport.summary,
      failureReason,
      failureKind,
      failureKindLabel: failureKind ? DIAGNOSTIC_FAILURE_KIND_LABELS[failureKind] : null,
      probeScope,
      hasVerifiedFullDiagnostic: overallStatus === 'supported' && playbackVerifiedStrict,
      detectedAudioLanguages: confirmedAudioLanguages,
      confirmedAudioLanguages,
      inferredAudioLanguages,
      audioVerificationDetail,
      history,
    },
    normalizedReport.status,
    contextMediaTab,
  );
}

export function summarizeCompatibilityCounts(
  snapshots: ExtensionCompatibilitySnapshot[],
): CompatibilityDashboardCounts {
  const counts: CompatibilityDashboardCounts = {
    supported: 0,
    partial: 0,
    failed: 0,
    unverified: 0,
    unsupported: 0,
    metadataOnly: 0,
    totalPlayable: 0,
    androidNative: 0,
    webCompatible: 0,
  };

  for (const snap of snapshots) {
    if (snap.runtimeRequirement === 'android-native') {
      counts.androidNative += 1;
    } else if (snap.runtimeRequirement === 'web-compatible') {
      counts.webCompatible += 1;
    }
    if (snap.isMetadataOnly) {
      counts.metadataOnly += 1;
      continue;
    }
    counts.totalPlayable += 1;
    counts[snap.overallStatus] += 1;
  }

  return counts;
}

function getSafeStorage(override?: DiagnosticStorageLike | null): DiagnosticStorageLike | null {
  if (override !== undefined) return override;
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // Restricted storage environment
  }
  return null;
}

export function loadPersistedExtensionDiagnostics(
  storageOverride?: DiagnosticStorageLike | null,
): Record<string, ExtensionDiagnosticReport> {
  const storage = getSafeStorage(storageOverride);
  if (!storage) return {};
  try {
    const raw = storage.getItem(EXTENSION_DIAGNOSTICS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const valid: Record<string, ExtensionDiagnosticReport> = {};
    for (const [id, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        entry &&
        typeof entry === 'object' &&
        typeof (entry as ExtensionDiagnosticReport).sourceId === 'string' &&
        typeof (entry as ExtensionDiagnosticReport).status === 'string' &&
        (entry as ExtensionDiagnosticReport).capabilities &&
        typeof (entry as ExtensionDiagnosticReport).capabilities === 'object'
      ) {
        valid[id] = normalizeUpstreamBlockedUnsupportedReport(
          entry as ExtensionDiagnosticReport,
        );
      }
    }
    return valid;
  } catch {
    return {};
  }
}

export function persistAllExtensionDiagnostics(
  records: Record<string, ExtensionDiagnosticReport>,
  storageOverride?: DiagnosticStorageLike | null,
): boolean {
  const storage = getSafeStorage(storageOverride);
  if (!storage) return false;
  try {
    storage.setItem(EXTENSION_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

function toHistoryEntry(report: ExtensionDiagnosticReport): ExtensionDiagnosticHistoryEntry {
  return {
    testedAt: report.testedAt || new Date().toISOString(),
    status: report.status,
    mode: inferEffectiveMode(report),
    durationMs: Number.isFinite(report.durationMs) ? Math.max(0, report.durationMs) : 0,
    summary: report.summary || 'Diagnostic run',
    ...(report.failureKind ? { failureKind: report.failureKind } : {}),
    ...(report.status !== 'pass' && report.detail ? { failureReason: report.detail } : {}),
    ...(report.probeScope ? { probeScope: report.probeScope } : {}),
  };
}

export function savePersistedExtensionDiagnostic(
  report: ExtensionDiagnosticReport,
  storageOverride?: DiagnosticStorageLike | null,
): Record<string, ExtensionDiagnosticReport> {
  const current = loadPersistedExtensionDiagnostics(storageOverride);
  const testedAt = report.testedAt || new Date().toISOString();
  const prev = current[report.sourceId];

  const isPassingVerification =
    report.status === 'pass' && report.capabilities?.playbackOrReader === 'verified';
  const prevLastVerifiedAt = resolveSnapshotLastVerifiedAt(prev);
  const nextLastVerifiedAt = isPassingVerification
    ? testedAt
    : report.lastVerifiedAt || prevLastVerifiedAt || null;

  const existingHistory = sanitizeHistoryEntries(prev?.history);
  // Seed legacy Batch 3 report (which didn't have history array yet) as the previous attempt
  const seededHistory =
    existingHistory.length === 0 && prev
      ? [toHistoryEntry(prev)]
      : existingHistory;

  const currentEntry = toHistoryEntry({ ...report, testedAt });
  const nextHistory = [
    currentEntry,
    ...seededHistory.filter(
      (item) =>
        !(
          item.testedAt === currentEntry.testedAt &&
          item.mode === currentEntry.mode &&
          item.status === currentEntry.status
        ),
    ),
  ].slice(0, MAX_DIAGNOSTIC_HISTORY);

  const normalized: ExtensionDiagnosticReport = {
    ...report,
    testedAt,
    lastVerifiedAt: nextLastVerifiedAt,
    history: nextHistory,
  };

  const next: Record<string, ExtensionDiagnosticReport> = {
    ...current,
    [normalized.sourceId]: normalized,
  };
  persistAllExtensionDiagnostics(next, storageOverride);
  return next;
}

export function formatDiagnosticTimestamp(
  iso?: string | null,
  emptyLabel = 'Never tested',
): string {
  if (!iso) return emptyLabel;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return emptyLabel;
  try {
    return parsed.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return parsed.toISOString();
  }
}
