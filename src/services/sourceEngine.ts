import {
  ExtensionAdapterCapabilities,
  ExtensionCapabilityDescriptor,
  ExtensionCapabilityErrorCode,
  ExtensionCapabilityName,
  ExtensionEpisodesResponse,
  ExtensionSourceCompatibilityReport,
  ExtensionTitleSearchResponse,
  MatchedSourceEntry,
  MediaType,
  SourceInfo,
  UnifiedChapter,
  UnifiedEpisode,
  UnifiedMedia,
  VideoServer,
  VideoStream,
} from '../types/media';
import {
  assessExtensionCompatibility,
  type DetectedSourceProfile,
  detectSourceProfile,
  ExtensionCapabilityError,
  shouldUseExtensionEpisodesForSelection,
} from '../utils/streamResolverUtils';
import { fetchJikanEpisodes, searchJikan } from './jikan';
import { fetchKitsuEpisodes } from './kitsu';
import { searchAniList } from './anilist';
import {
  AniZipMappingsResponse,
  isGenericEpisodeTitle,
  mergeRealEpisodes,
  parseAniListStreamingEpisodes,
  parseAniZipEpisodes,
} from '../utils/episodeResolver';
import {
  analyzeEpisodeResolution,
  EpisodeFetchTrace,
  EpisodeProviderStep,
  ProviderTraceStatus,
  recordEpisodeTrace,
} from '../utils/episodeDiagnostics';
import type {
  ExtensionDiagnoseMode,
  ExtensionDiagnosticReport,
} from '../utils/extensionDiagnostics';
import type {
  SourceHealthCheckResult,
  SourceHealthMediaContext,
} from '../utils/sourceHealthCheck';
import {
  classifyClientBackendFetchError,
  parseJsonResponseSafely,
  resolveApiUrl,
  rewriteMangaPagesUrls,
  rewriteVideoStreamUrls,
} from '../utils/backendConfig';

async function fetchBackendApi(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  contextLabel: string,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (init?.signal?.aborted) {
      throw err;
    }
    throw classifyClientBackendFetchError(err, contextLabel);
  }
}

export { ExtensionCapabilityError };

export const INBUILT_SOURCES: SourceInfo[] = [
  {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME', 'MOVIE', 'TV'],
    lang: 'en',
    version: '2.1.5',
    description: 'Adaptive HLS & subtitle-ready built-in anime streaming resolver.',
  },
  {
    id: 'shonenx-manga-inbuilt',
    name: 'ShizuTv Reader (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['MANGA'],
    lang: 'en',
    version: '2.1.5',
    description: 'High-contrast manga reader source.',
  },
  {
    id: 'hianime-bridge',
    name: 'AniWatch / HiAnime (Bridge)',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.4.2',
    description: 'Community anime extension profile (SUB & DUB servers).',
  },
  {
    id: 'mangadex-bridge',
    name: 'MangaDex (Bridge)',
    type: 'extension',
    mediaTypes: ['MANGA'],
    lang: 'multi',
    version: '1.8.0',
    description: 'Multi-language scanlation chapter resolver.',
  },
];

const aniZipCache = new Map<string, { expires: number; data: AniZipMappingsResponse }>();

interface AniZipFetchOutcome {
  data: AniZipMappingsResponse | null;
  status: ProviderTraceStatus;
  durationMs: number;
  targetId: string | null;
  note: string;
  errorMessage?: string | null;
  fromCache?: boolean;
}

async function fetchAniZipMappingsDetailed(
  media: UnifiedMedia,
  bypassCache = false,
): Promise<AniZipFetchOutcome> {
  const startedAt = performance.now();
  const anilistId =
    media.externalIds?.anilist || (media.providerId === 'anilist' || !media.providerId ? media.id : null);
  const malId = media.idMal || media.externalIds?.mal || (media.providerId === 'myanimelist' ? media.id : null);

  let queryParam = '';
  if (anilistId && /^\d+$/.test(String(anilistId))) {
    queryParam = `anilist_id=${encodeURIComponent(String(anilistId))}`;
  } else if (malId && /^\d+$/.test(String(malId))) {
    queryParam = `mal_id=${encodeURIComponent(String(malId))}`;
  } else {
    return {
      data: null,
      status: 'skipped',
      durationMs: Math.round(performance.now() - startedAt),
      targetId: null,
      note: 'No numeric AniList or MAL ID available for AniZip lookup',
    };
  }

  const now = Date.now();
  const cached = !bypassCache ? aniZipCache.get(queryParam) : undefined;
  if (cached && cached.expires > now) {
    return {
      data: cached.data,
      status: cached.data.episodes ? 'hit' : 'empty',
      durationMs: Math.round(performance.now() - startedAt),
      targetId: queryParam,
      note: 'Served from 30m in-memory AniZip cache',
      fromCache: true,
    };
  }

  try {
    const response = await fetch(`https://api.ani.zip/mappings?${queryParam}`, {
      signal: AbortSignal.timeout(7000),
    });
    const elapsed = Math.round(performance.now() - startedAt);
    if (!response.ok) {
      return {
        data: null,
        status: 'error',
        durationMs: elapsed,
        targetId: queryParam,
        note: `AniZip returned HTTP ${response.status}`,
        errorMessage: `HTTP ${response.status} ${response.statusText || ''}`.trim(),
      };
    }
    const data = (await response.json()) as AniZipMappingsResponse;
    aniZipCache.set(queryParam, { expires: now + 30 * 60_000, data });
    return {
      data,
      status: data.episodes && Object.keys(data.episodes).length > 0 ? 'hit' : 'empty',
      durationMs: elapsed,
      targetId: queryParam,
      note: `Fetched mappings (${data.episodeCount ?? Object.keys(data.episodes || {}).length} keys)`,
    };
  } catch (err) {
    const elapsed = Math.round(performance.now() - startedAt);
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout = isTimeoutFailure(err);
    return {
      data: null,
      status: isTimeout ? 'timeout' : 'error',
      durationMs: elapsed,
      targetId: queryParam,
      note: isTimeout ? 'AniZip request timed out (7000ms)' : 'AniZip network error',
      errorMessage: errMsg,
    };
  }
}

function isTimeoutFailure(err: unknown): boolean {
  if (err instanceof Error && err.name === 'TimeoutError') return true;
  const msg = err instanceof Error ? err.message : String(err || '');
  return /timeout|timed out/i.test(msg);
}

function summarizeSampleTitles(episodes: UnifiedEpisode[]): string[] {
  return episodes.slice(0, 4).map((e) => `${e.number}. ${e.title}`);
}

export function resolveFallbackEpisodesCount(media: Pick<UnifiedMedia, 'episodes' | 'nextEpisode'>): number {
  const fromEpisodes = media.episodes && media.episodes > 0 ? media.episodes : 0;
  const fromAiring = media.nextEpisode && media.nextEpisode > 1 ? media.nextEpisode - 1 : 0;
  const maxCount = Math.max(fromEpisodes, fromAiring);
  return maxCount > 0 ? maxCount : 12;
}

export interface ResolveEpisodesOptions {
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  sourcePkg?: string;
  selectedSourceEntry?: MatchedSourceEntry | null;
  overrideTitle?: string;
  overrideMedia?: UnifiedMedia | null;
  bypassCache?: boolean;
  recordTrace?: boolean;
}

export interface ResolveVideoStreamParams {
  media: UnifiedMedia;
  episode: UnifiedEpisode;
  server: VideoServer;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  audioLanguage?: 'ja' | 'en' | 'hi' | 'es';
  overrideTitle?: string;
  selectedSourceEntry?: MatchedSourceEntry | null;
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export interface ExtensionSearchOptions {
  signal?: AbortSignal;
}

export interface ExtensionEpisodeListInput {
  media?: UnifiedMedia;
  selectedSourceEntry?: MatchedSourceEntry | null;
  overrideTitle?: string;
  overrideMedia?: UnifiedMedia | null;
  bypassCache?: boolean;
  recordTrace?: boolean;
  signal?: AbortSignal;
}

export interface ExtensionEpisodeListResult {
  compatible: boolean;
  reason?: string;
  sourceLabel?: string;
  episodes: UnifiedEpisode[];
  trace?: EpisodeFetchTrace;
}

export interface ExtensionAdapterOptions {
  adapterId?: string;
  providerKind?: string;
  profile?: DetectedSourceProfile;
  capabilities?: Partial<ExtensionAdapterCapabilities>;
}

/**
 * Shared metadata episode resolution pipeline (AniZip + AniList streamingEpisodes + Jikan + Kitsu)
 * used by ShizuTV Stream (Inbuilt) and initial episode structural listing before manual source entry mapping.
 */
async function resolveInbuiltEpisodeMetadataPipeline(
  media: UnifiedMedia,
  options?: ResolveEpisodesOptions,
): Promise<{ episodes: UnifiedEpisode[]; trace: EpisodeFetchTrace }> {
  const overallStart = performance.now();
  let targetMedia = media;
  const overrideQuery = options?.overrideTitle?.trim();
  let overrideMatched = false;

  if (options?.overrideMedia && options.overrideMedia.id) {
    overrideMatched = true;
    targetMedia = {
      ...options.overrideMedia,
      streamingEpisodes:
        options.overrideMedia.id === media.id
          ? options.overrideMedia.streamingEpisodes ?? media.streamingEpisodes
          : options.overrideMedia.streamingEpisodes,
    };
  } else if (overrideQuery) {
    try {
      const anilistMatches = await searchAniList({
        query: overrideQuery,
        type: 'ANIME',
        page: 1,
        perPage: 1,
      });
      if (anilistMatches.items[0]) {
        overrideMatched = true;
        targetMedia = {
          ...anilistMatches.items[0],
          streamingEpisodes:
            anilistMatches.items[0].id === media.id ? media.streamingEpisodes : undefined,
        };
      }
    } catch {
      try {
        const jikanMatches = await searchJikan(overrideQuery, 'ANIME', 1);
        if (jikanMatches.items[0]) {
          overrideMatched = true;
          targetMedia = jikanMatches.items[0];
        }
      } catch {
        // Ignore search override failure cleanly
      }
    }
  }

  const fromEpisodes = targetMedia.episodes && targetMedia.episodes > 0 ? targetMedia.episodes : 0;
  const fromAiring =
    targetMedia.nextEpisode && targetMedia.nextEpisode > 1 ? targetMedia.nextEpisode - 1 : 0;
  const knownCount = Math.max(fromEpisodes, fromAiring);

  const initialMalId =
    targetMedia.idMal ||
    targetMedia.externalIds?.mal ||
    (targetMedia.providerId === 'myanimelist' ? targetMedia.id : null);

  const bypassProviderCache = Boolean(options?.bypassCache);
  const jikanStart = performance.now();
  const [aniZipOutcome, jikanResult] = await Promise.all([
    fetchAniZipMappingsDetailed(targetMedia, bypassProviderCache),
    initialMalId
      ? fetchJikanEpisodes(String(initialMalId), bypassProviderCache)
          .then((eps) => ({
            episodes: eps,
            durationMs: Math.round(performance.now() - jikanStart),
            error: null as string | null,
            timedOut: false,
          }))
          .catch((err) => ({
            episodes: [] as UnifiedEpisode[],
            durationMs: Math.round(performance.now() - jikanStart),
            error: err instanceof Error ? err.message : String(err),
            timedOut: isTimeoutFailure(err),
          }))
      : Promise.resolve({
          episodes: [] as UnifiedEpisode[],
          durationMs: 0,
          error: null as string | null,
          timedOut: false,
        }),
  ]);

  const aniZipData = aniZipOutcome.data;
  const aniZipEpisodes = parseAniZipEpisodes(aniZipData, targetMedia);
  let jikanEpisodes = jikanResult.episodes;
  let jikanDuration = jikanResult.durationMs;
  let jikanError = jikanResult.error;
  let jikanTimedOut = jikanResult.timedOut;
  let effectiveMalId = initialMalId ? String(initialMalId) : null;

  // If MAL ID was missing on initial media (e.g. Kitsu origin) but discovered via AniZip, hydrate Jikan filler metadata
  const discoveredMalId = aniZipData?.mappings?.mal_id ? String(aniZipData.mappings.mal_id) : null;
  if (!effectiveMalId && discoveredMalId && jikanEpisodes.length === 0) {
    effectiveMalId = discoveredMalId;
    const retryStart = performance.now();
    try {
      jikanEpisodes = await fetchJikanEpisodes(discoveredMalId, bypassProviderCache);
      jikanDuration = Math.round(performance.now() - retryStart);
    } catch (err) {
      jikanDuration = Math.round(performance.now() - retryStart);
      jikanError = err instanceof Error ? err.message : String(err);
      jikanTimedOut = isTimeoutFailure(err);
    }
  }

  const aniListStreaming = parseAniListStreamingEpisodes(
    targetMedia.streamingEpisodes,
    targetMedia.id,
  );

  // If neither AniZip nor Jikan yielded real episode titles, try Kitsu episodes when ID is available
  const kitsuId =
    targetMedia.externalIds?.kitsu ||
    (targetMedia.providerId === 'kitsu' ? targetMedia.id : null) ||
    (aniZipData?.mappings?.kitsu_id ? String(aniZipData.mappings.kitsu_id) : null);

  const hasRichTitlesAlready =
    aniZipEpisodes.some((e) => !isGenericEpisodeTitle(e.title, e.number)) ||
    jikanEpisodes.some((e) => !isGenericEpisodeTitle(e.title, e.number)) ||
    aniListStreaming.length > 0;

  let kitsuEpisodes: UnifiedEpisode[] = [];
  let kitsuDuration = 0;
  let kitsuError: string | null = null;
  let kitsuTimedOut = false;
  let kitsuAttempted = false;
  if (kitsuId && !hasRichTitlesAlready) {
    kitsuAttempted = true;
    const kitsuStart = performance.now();
    try {
      kitsuEpisodes = await fetchKitsuEpisodes(String(kitsuId), bypassProviderCache);
      kitsuDuration = Math.round(performance.now() - kitsuStart);
    } catch (err) {
      kitsuDuration = Math.round(performance.now() - kitsuStart);
      kitsuError = err instanceof Error ? err.message : String(err);
      kitsuTimedOut = isTimeoutFailure(err);
    }
  }

  const resolvedFallbackCount =
    knownCount > 0
      ? knownCount
      : aniZipEpisodes.length > 0 ||
          jikanEpisodes.length > 0 ||
          kitsuEpisodes.length > 0 ||
          aniListStreaming.length > 0
        ? 0
        : targetMedia.format === 'MOVIE'
          ? 1
          : 12;

  const mergedEpisodes = mergeRealEpisodes({
    mediaId: targetMedia.id,
    expectedCount: resolvedFallbackCount,
    aniZipEpisodes,
    jikanEpisodes,
    kitsuEpisodes,
    aniListStreamingEpisodes: aniListStreaming,
    fallbackDurationSeconds: (targetMedia.duration || 24) * 60,
    fallbackThumbnail: targetMedia.banner || targetMedia.cover || null,
  });

  const providerSteps: EpisodeProviderStep[] = [
    {
      provider: 'AniZip',
      status:
        aniZipOutcome.status === 'hit' && aniZipEpisodes.length === 0 ? 'empty' : aniZipOutcome.status,
      durationMs: aniZipOutcome.durationMs,
      episodeCount: aniZipEpisodes.length,
      namedCount: aniZipEpisodes.filter((e) => !isGenericEpisodeTitle(e.title, e.number)).length,
      targetId: aniZipOutcome.targetId,
      sampleTitles: summarizeSampleTitles(aniZipEpisodes),
      note:
        aniZipEpisodes.length > 0
          ? `${aniZipEpisodes.length} parsed episodes${aniZipOutcome.fromCache ? ' (cached)' : ''}`
          : aniZipOutcome.note,
      errorMessage: aniZipOutcome.errorMessage ?? null,
    },
    {
      provider: 'AniList Streaming',
      status: aniListStreaming.length > 0 ? 'hit' : 'empty',
      durationMs: 0,
      episodeCount: aniListStreaming.length,
      namedCount: aniListStreaming.filter((e) => !isGenericEpisodeTitle(e.title, e.number)).length,
      targetId: targetMedia.id,
      sampleTitles: summarizeSampleTitles(aniListStreaming),
      note:
        aniListStreaming.length > 0
          ? `${aniListStreaming.length} streaming episodes embedded on AniList media`
          : '0 streamingEpisodes returned on AniList media',
    },
    {
      provider: 'Jikan (MAL)',
      status: !effectiveMalId
        ? 'skipped'
        : jikanError
          ? jikanTimedOut || isTimeoutFailure(jikanError)
            ? 'timeout'
            : 'error'
          : jikanEpisodes.length > 0
            ? 'hit'
            : 'empty',
      durationMs: jikanDuration,
      episodeCount: jikanEpisodes.length,
      namedCount: jikanEpisodes.filter((e) => !isGenericEpisodeTitle(e.title, e.number)).length,
      targetId: effectiveMalId,
      sampleTitles: summarizeSampleTitles(jikanEpisodes),
      note: !effectiveMalId
        ? 'Skipped (no MAL ID mapped)'
        : jikanEpisodes.length > 0
          ? `${jikanEpisodes.length} MAL episodes (${jikanEpisodes.filter((e) => e.isFiller).length} filler)`
          : jikanError
            ? jikanTimedOut
              ? 'Jikan API timed out (8500ms)'
              : 'Jikan API request failed'
            : 'Jikan returned 0 episode records',
      errorMessage: jikanError,
    },
    {
      provider: 'Kitsu',
      status: !kitsuId
        ? 'skipped'
        : !kitsuAttempted
          ? 'skipped'
          : kitsuError
            ? kitsuTimedOut || isTimeoutFailure(kitsuError)
              ? 'timeout'
              : 'error'
            : kitsuEpisodes.length > 0
              ? 'hit'
              : 'empty',
      durationMs: kitsuDuration,
      episodeCount: kitsuEpisodes.length,
      namedCount: kitsuEpisodes.filter((e) => !isGenericEpisodeTitle(e.title, e.number)).length,
      targetId: kitsuId ? String(kitsuId) : null,
      sampleTitles: summarizeSampleTitles(kitsuEpisodes),
      note: !kitsuId
        ? 'Skipped (no Kitsu ID mapped)'
        : !kitsuAttempted
          ? 'Skipped (higher-priority layers already supplied real titles)'
          : kitsuEpisodes.length > 0
            ? `${kitsuEpisodes.length} Kitsu episodes loaded`
            : kitsuError
              ? kitsuTimedOut
                ? 'Kitsu API timed out (8500ms)'
                : 'Kitsu API request failed'
              : 'Kitsu returned 0 episodes',
      errorMessage: kitsuError,
    },
  ];

  const sourceId = options?.sourceId || 'shonenx-hls-inbuilt';
  const sourceName =
    options?.sourceName ||
    INBUILT_SOURCES.find((s) => s.id === sourceId)?.name ||
    sourceId;

  const trace = analyzeEpisodeResolution({
    inputMedia: media,
    resolvedMedia: targetMedia,
    sourceId,
    sourceName,
    overrideTitle: overrideQuery,
    overrideMatched,
    resolvedExpectedCount: resolvedFallbackCount,
    providers: providerSteps,
    mergedEpisodes,
    totalDurationMs: Math.round(performance.now() - overallStart),
  });

  if (options?.recordTrace !== false) {
    recordEpisodeTrace(trace);
  }

  return { episodes: mergedEpisodes, trace };
}

async function resolveStreamViaApi(params: ResolveVideoStreamParams): Promise<VideoStream> {
  const {
    media,
    episode,
    server,
    sourceId,
    sourceName,
    sourceBaseUrl,
    sourceLang,
    audioLanguage,
    overrideTitle,
    selectedSourceEntry,
    bypassCache,
    signal,
  } = params;

  const matchingSourceEntry =
    selectedSourceEntry &&
    selectedSourceEntry.sourceId === sourceId &&
    selectedSourceEntry.href
      ? {
          sourceId: selectedSourceEntry.sourceId,
          title: selectedSourceEntry.title,
          href: selectedSourceEntry.href,
          slug: selectedSourceEntry.slug,
        }
      : null;

  const matchingEpisode =
    sourceId &&
    sourceId !== 'shonenx-hls-inbuilt' &&
    (episode.sourceEpisodeId || episode.episodeUrl) &&
    (!episode.sourceId || episode.sourceId === sourceId)
      ? {
          id: episode.id,
          number: episode.number,
          title: episode.title,
          sourceId: episode.sourceId || sourceId,
          sourceEpisodeId: episode.sourceEpisodeId,
          episodeUrl: episode.episodeUrl,
          sourceAnimeHref: episode.sourceAnimeHref,
          sourceAnimeSlug: episode.sourceAnimeSlug,
        }
      : null;

  const response = await fetchBackendApi(
    resolveApiUrl('/api/stream/resolve'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
    body: JSON.stringify({
      mediaId: media.id,
      titles: {
        overrideTitle: overrideTitle?.trim() || matchingSourceEntry?.title || null,
        english: media.title?.english ?? null,
        romaji: media.title?.romaji ?? null,
        native: media.title?.native ?? null,
        synonyms: media.synonyms ?? null,
      },
      format: media.format ?? null,
      episodeNumber: episode.number,
      serverId: server.id,
      serverName: server.name,
      category: server.category,
      audioLanguage,
      sourceId,
      sourceName,
      sourceBaseUrl,
      sourceLang,
      selectedSourceEntry: matchingSourceEntry,
      selectedEpisode: matchingEpisode,
      bypassCache: Boolean(bypassCache),
    }),
    },
    `stream resolution (${sourceName || sourceId || 'Inbuilt'})`,
  );

  if (!response.ok) {
    let errMessage = `Failed to resolve episode stream (HTTP ${response.status}).`;
    let errCode: ExtensionCapabilityErrorCode | undefined;
    let errCapability: ExtensionCapabilityName | undefined;
    const errData = await parseJsonResponseSafely<{
      message?: string;
      code?: ExtensionCapabilityErrorCode;
      capability?: ExtensionCapabilityName;
    }>(response, 'stream resolution');
    if (errData?.message) errMessage = errData.message;
    if (errData?.code) errCode = errData.code;
    if (errData?.capability) errCapability = errData.capability;
    if (errCode) {
      throw new ExtensionCapabilityError({
        code: errCode,
        capability: errCapability || 'stream',
        sourceId: sourceId || 'shonenx-hls-inbuilt',
        sourceLabel: sourceName || sourceId,
        reason: errMessage,
        statusCode: response.status,
      });
    }
    throw new Error(errMessage);
  }

  const data = await parseJsonResponseSafely<VideoStream>(
    response,
    'stream resolution',
  );
  if (!data?.url) {
    throw new Error('Resolved stream payload did not include a playable URL.');
  }
  return rewriteVideoStreamUrls(data);
}

/**
 * Base `ExtensionAdapter` class defining the universal contract for search,
 * episode listing, and playback stream resolution with pre-execution
 * capability enforcement and strict source compatibility checking.
 */
export class ExtensionAdapter {
  readonly source: SourceInfo;
  readonly adapterId: string;
  readonly providerKind: string;
  readonly profile: DetectedSourceProfile;
  protected readonly capabilities: ExtensionAdapterCapabilities;

  constructor(source: SourceInfo, options?: ExtensionAdapterOptions) {
    this.source = source;
    this.profile = options?.profile ?? detectSourceProfile(source);
    this.adapterId = options?.adapterId ?? this.profile.compatibility.adapterId;
    this.providerKind = options?.providerKind ?? this.profile.kind;
    this.capabilities = {
      search: options?.capabilities?.search ?? this.profile.capabilities.search,
      episodes: options?.capabilities?.episodes ?? this.profile.capabilities.episodes,
      stream: options?.capabilities?.stream ?? this.profile.capabilities.stream,
    };
  }

  getCapabilities(): ExtensionAdapterCapabilities {
    return {
      search: { ...this.capabilities.search },
      episodes: { ...this.capabilities.episodes },
      stream: { ...this.capabilities.stream },
    };
  }

  getCapability(capability: ExtensionCapabilityName): ExtensionCapabilityDescriptor {
    return { ...this.capabilities[capability] };
  }

  supports(capability: ExtensionCapabilityName): boolean {
    const desc = this.capabilities[capability];
    return desc.state === 'verified' || desc.state === 'supported';
  }

  isVerified(capability: ExtensionCapabilityName): boolean {
    const desc = this.capabilities[capability];
    return desc.state === 'verified' && desc.verified === true;
  }

  getCompatibility(): ExtensionSourceCompatibilityReport {
    return assessExtensionCompatibility({
      adapterId: this.adapterId,
      sourceId: this.source.id,
      sourceLabel: this.source.name || this.source.id,
      providerKind: this.providerKind,
      isMetadataOnly: this.profile.isMetadataOnly,
      capabilities: this.capabilities,
    });
  }

  detectCompatibility(): ExtensionSourceCompatibilityReport {
    return this.getCompatibility();
  }

  protected requiresHttpBaseUrl(): boolean {
    return this.source.type !== 'inbuilt' && this.source.id !== 'hianime-bridge';
  }

  /**
   * Enforces consistent capability checking BEFORE executing search, episode listing,
   * or playback resolution. Never lets metadata-only, missing-host, protected,
   * or unverified/unsupported capabilities execute provider handlers.
   */
  assertCapability(capability: ExtensionCapabilityName): void {
    const label = this.source.name || this.source.id;
    if (this.profile.isMetadataOnly) {
      throw new ExtensionCapabilityError({
        code: 'METADATA_ONLY_SOURCE',
        capability,
        sourceId: this.source.id,
        sourceLabel: label,
        reason:
          this.capabilities[capability].reason ||
          `${label} is a metadata/tracking catalog and does not support ${capability} playback.`,
      });
    }

    const desc = this.capabilities[capability];
    if (desc.state === 'unsupported' || desc.state === 'unavailable') {
      let code: ExtensionCapabilityErrorCode = 'UNSUPPORTED_CAPABILITY';
      if (this.profile.kind === 'missing-host') {
        code = 'MISSING_BASE_URL';
      } else if (this.profile.kind === 'gotaku') {
        code = 'PROTECTED_SOURCE';
      }
      throw new ExtensionCapabilityError({
        code,
        capability,
        sourceId: this.source.id,
        sourceLabel: label,
        reason:
          desc.reason ||
          `${label} does not support the "${capability}" capability.`,
      });
    }

    if (desc.state === 'unverified') {
      throw new ExtensionCapabilityError({
        code: 'UNVERIFIED_CAPABILITY',
        capability,
        sourceId: this.source.id,
        sourceLabel: label,
        reason:
          desc.reason ||
          `${label} capability "${capability}" is unverified and cannot be executed.`,
      });
    }

    if (this.requiresHttpBaseUrl() && this.profile.hosts.length === 0) {
      throw new ExtensionCapabilityError({
        code: 'MISSING_BASE_URL',
        capability,
        sourceId: this.source.id,
        sourceLabel: label,
        reason: `Extension "${label}" does not have a valid HTTP base URL configured.`,
      });
    }
  }

  async search(
    query: string,
    options?: ExtensionSearchOptions,
  ): Promise<ExtensionTitleSearchResponse> {
    this.assertCapability('search');
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        compatible: true,
        sourceLabel: this.source.name || this.source.id,
        items: [],
      };
    }
    return this.searchImpl(trimmed, options);
  }

  async listEpisodes(
    input: ExtensionEpisodeListInput,
  ): Promise<ExtensionEpisodeListResult> {
    this.assertCapability('episodes');
    if (!input.selectedSourceEntry && !input.media) {
      throw new ExtensionCapabilityError({
        code: 'INVALID_INPUT',
        capability: 'episodes',
        sourceId: this.source.id,
        sourceLabel: this.source.name || this.source.id,
        reason: 'Either media metadata or selectedSourceEntry is required to list episodes.',
      });
    }
    return this.listEpisodesImpl(input);
  }

  async resolveStream(params: ExtensionStreamResolutionParams): Promise<VideoStream> {
    this.assertCapability('stream');
    if (!params.media || !params.episode) {
      throw new ExtensionCapabilityError({
        code: 'INVALID_INPUT',
        capability: 'stream',
        sourceId: this.source.id,
        sourceLabel: this.source.name || this.source.id,
        reason: 'Media and episode are required to resolve a playable stream.',
      });
    }
    return this.resolveStreamImpl(params);
  }

  getVideoServers(): VideoServer[] {
    return this.getVideoServersImpl();
  }

  protected async searchImpl(
    _query: string,
    _options?: ExtensionSearchOptions,
  ): Promise<ExtensionTitleSearchResponse> {
    throw new ExtensionCapabilityError({
      code: 'UNSUPPORTED_CAPABILITY',
      capability: 'search',
      sourceId: this.source.id,
      sourceLabel: this.source.name || this.source.id,
      reason: `${this.source.name || this.source.id} has not implemented search.`,
    });
  }

  protected async listEpisodesImpl(
    _input: ExtensionEpisodeListInput,
  ): Promise<ExtensionEpisodeListResult> {
    throw new ExtensionCapabilityError({
      code: 'UNSUPPORTED_CAPABILITY',
      capability: 'episodes',
      sourceId: this.source.id,
      sourceLabel: this.source.name || this.source.id,
      reason: `${this.source.name || this.source.id} has not implemented episode listing.`,
    });
  }

  protected async resolveStreamImpl(
    _params: ExtensionStreamResolutionParams,
  ): Promise<VideoStream> {
    throw new ExtensionCapabilityError({
      code: 'UNSUPPORTED_CAPABILITY',
      capability: 'stream',
      sourceId: this.source.id,
      sourceLabel: this.source.name || this.source.id,
      reason: `${this.source.name || this.source.id} has not implemented stream resolution.`,
    });
  }

  protected getVideoServersImpl(): VideoServer[] {
    return [
      { id: 'hd-1-sub', name: 'HD-1 (Sub)', category: 'sub' },
      { id: 'hd-2-sub', name: 'HD-2 (Sub)', category: 'sub' },
      { id: 'hd-1-dub', name: 'HD-1 (Dub)', category: 'dub' },
    ];
  }
}

export type ExtensionStreamResolutionParams = ResolveVideoStreamParams;

export class ShizuTvInbuiltExtensionAdapter extends ExtensionAdapter {
  constructor(source: SourceInfo, profile?: DetectedSourceProfile) {
    super(source, {
      adapterId: 'shizutv-inbuilt',
      providerKind: 'inbuilt-anime',
      profile,
    });
  }

  protected requiresHttpBaseUrl(): boolean {
    return false;
  }

  protected async searchImpl(query: string): Promise<ExtensionTitleSearchResponse> {
    try {
      const al = await searchAniList({
        query,
        type: 'ANIME',
        page: 1,
        perPage: 12,
      });
      return {
        compatible: true,
        sourceLabel: this.source.name,
        items: al.items.map((item) => ({
          sourceId: this.source.id,
          title: item.title.english || item.title.romaji || item.title.native || 'Unknown',
          href: `/anime/${item.id}`,
          slug: String(item.id),
          cover: item.cover ?? null,
        })),
      };
    } catch {
      const jk = await searchJikan(query, 'ANIME', 1);
      return {
        compatible: true,
        sourceLabel: this.source.name,
        items: jk.items.slice(0, 12).map((item) => ({
          sourceId: this.source.id,
          title: item.title.english || item.title.romaji || item.title.native || 'Unknown',
          href: `/anime/${item.id}`,
          slug: String(item.id),
          cover: item.cover ?? null,
        })),
      };
    }
  }

  protected async listEpisodesImpl(
    input: ExtensionEpisodeListInput,
  ): Promise<ExtensionEpisodeListResult> {
    if (!input.media) {
      throw new ExtensionCapabilityError({
        code: 'INVALID_INPUT',
        capability: 'episodes',
        sourceId: this.source.id,
        sourceLabel: this.source.name,
        reason: 'Media object is required to list episodes for ShizuTV Stream (Inbuilt).',
      });
    }
    const { episodes, trace } = await resolveInbuiltEpisodeMetadataPipeline(input.media, {
      sourceId: this.source.id,
      sourceName: this.source.name,
      sourceBaseUrl: this.source.baseUrl,
      sourceLang: this.source.lang,
      sourcePkg: this.source.pkg,
      overrideTitle: input.overrideTitle,
      overrideMedia: input.overrideMedia,
      bypassCache: input.bypassCache,
      recordTrace: input.recordTrace,
    });
    return {
      compatible: true,
      sourceLabel: this.source.name,
      episodes,
      trace,
    };
  }

  protected async resolveStreamImpl(params: ResolveVideoStreamParams): Promise<VideoStream> {
    return resolveStreamViaApi({
      ...params,
      sourceId: this.source.id,
      sourceName: params.sourceName || this.source.name,
      sourceBaseUrl: params.sourceBaseUrl || this.source.baseUrl,
      sourceLang: params.sourceLang || this.source.lang,
    });
  }
}

export class ServerBackedAnimeExtensionAdapter extends ExtensionAdapter {
  protected async searchImpl(
    query: string,
    options?: ExtensionSearchOptions,
  ): Promise<ExtensionTitleSearchResponse> {
    const response = await fetchBackendApi(
      resolveApiUrl('/api/extensions/search'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: options?.signal,
        body: JSON.stringify({
          sourceId: this.source.id,
          sourceName: this.source.name,
          sourceBaseUrl: this.source.baseUrl,
          sourceLang: this.source.lang,
          sourcePkg: this.source.pkg,
          query,
        }),
      },
      `extension search (${this.source.name})`,
    );

    const payload = await parseJsonResponseSafely<
      ExtensionTitleSearchResponse & { message?: string }
    >(response, `extension search (${this.source.name})`);

    if (!response.ok && !payload) {
      throw new Error(`Failed to search ${this.source.name} (HTTP ${response.status}).`);
    }

    return {
      compatible: payload?.compatible !== false,
      reason: payload?.reason || payload?.message,
      sourceLabel: payload?.sourceLabel || this.source.name,
      items: Array.isArray(payload?.items) ? payload.items : [],
    };
  }

  protected async listEpisodesImpl(
    input: ExtensionEpisodeListInput,
  ): Promise<ExtensionEpisodeListResult> {
    const selected = input.selectedSourceEntry;
    if (
      selected &&
      selected.href &&
      selected.sourceId === this.source.id
    ) {
      const response = await fetchBackendApi(
        resolveApiUrl('/api/extensions/episodes'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: input.signal,
          body: JSON.stringify({
            sourceId: this.source.id,
            sourceName: this.source.name,
            sourceBaseUrl: this.source.baseUrl,
            sourceLang: this.source.lang,
            sourcePkg: this.source.pkg,
            selectedSourceEntry: {
              sourceId: selected.sourceId,
              title: selected.title,
              href: selected.href,
              slug: selected.slug,
            },
            bypassCache: Boolean(input.bypassCache),
          }),
        },
        `extension episodes (${this.source.name || this.source.id})`,
      );

      const payload = await parseJsonResponseSafely<
        ExtensionEpisodesResponse & { message?: string }
      >(response, `extension episodes (${this.source.name || this.source.id})`);

      if (!response.ok && !payload) {
        throw new Error(
          `Failed to load episodes from ${this.source.name || this.source.id} (HTTP ${response.status}).`,
        );
      }

      const extResult: ExtensionEpisodesResponse = {
        compatible: payload?.compatible !== false,
        reason: payload?.reason || payload?.message,
        sourceLabel: payload?.sourceLabel || this.source.name || this.source.id,
        episodes: Array.isArray(payload?.episodes) ? payload.episodes : [],
      };

      if (!extResult.compatible) {
        throw new ExtensionCapabilityError({
          code: 'UNSUPPORTED_CAPABILITY',
          capability: 'episodes',
          sourceId: this.source.id,
          sourceLabel: extResult.sourceLabel || this.source.name,
          reason:
            extResult.reason ||
            `No episodes found for "${selected.title}" on ${extResult.sourceLabel || this.source.name}.`,
        });
      }

      const trace = input.media
        ? analyzeEpisodeResolution({
            inputMedia: input.media,
            resolvedMedia: input.media,
            sourceId: this.source.id,
            sourceName: extResult.sourceLabel || this.source.name,
            overrideTitle: selected.title,
            overrideMatched: true,
            resolvedExpectedCount: extResult.episodes.length,
            providers: [],
            mergedEpisodes: extResult.episodes,
            totalDurationMs: 0,
          })
        : undefined;

      if (trace && input.recordTrace !== false) {
        recordEpisodeTrace(trace);
      }

      return {
        compatible: true,
        sourceLabel: extResult.sourceLabel,
        episodes: extResult.episodes,
        trace,
      };
    }

    if (!input.media) {
      throw new ExtensionCapabilityError({
        code: 'INVALID_INPUT',
        capability: 'episodes',
        sourceId: this.source.id,
        sourceLabel: this.source.name,
        reason: 'selectedSourceEntry or media is required to list episodes.',
      });
    }

    const { episodes, trace } = await resolveInbuiltEpisodeMetadataPipeline(input.media, {
      sourceId: this.source.id,
      sourceName: this.source.name,
      sourceBaseUrl: this.source.baseUrl,
      sourceLang: this.source.lang,
      sourcePkg: this.source.pkg,
      overrideTitle: input.overrideTitle,
      overrideMedia: input.overrideMedia,
      bypassCache: input.bypassCache,
      recordTrace: input.recordTrace,
    });

    return {
      compatible: true,
      sourceLabel: this.source.name,
      episodes,
      trace,
    };
  }

  protected async resolveStreamImpl(params: ResolveVideoStreamParams): Promise<VideoStream> {
    return resolveStreamViaApi({
      ...params,
      sourceId: this.source.id,
      sourceName: params.sourceName || this.source.name,
      sourceBaseUrl: params.sourceBaseUrl || this.source.baseUrl,
      sourceLang: params.sourceLang || this.source.lang,
    });
  }
}

export class HiAnimeExtensionAdapter extends ServerBackedAnimeExtensionAdapter {
  constructor(source: SourceInfo, profile?: DetectedSourceProfile) {
    super(source, {
      adapterId: profile?.compatibility.adapterId || 'hianime-bridge',
      providerKind: 'hianime',
      profile,
    });
  }

  protected requiresHttpBaseUrl(): boolean {
    return this.source.id !== 'hianime-bridge';
  }

  protected getVideoServersImpl(): VideoServer[] {
    return [
      { id: 'hd-1-sub', name: 'HD-1 (Sub)', category: 'sub' },
      { id: 'hd-2-sub', name: 'HD-2 (Sub)', category: 'sub' },
      { id: 'hd-1-dub', name: 'HD-1 (Dub)', category: 'dub' },
    ];
  }
}

export class GogoCloneExtensionAdapter extends ServerBackedAnimeExtensionAdapter {
  constructor(source: SourceInfo, profile?: DetectedSourceProfile) {
    super(source, {
      adapterId: 'gogo-html',
      providerKind: 'gogo-clone',
      profile,
    });
  }
}

export class WordPressAnimeExtensionAdapter extends ServerBackedAnimeExtensionAdapter {
  constructor(source: SourceInfo, profile?: DetectedSourceProfile) {
    super(source, {
      adapterId: 'wordpress-animestream',
      providerKind: 'wordpress-animestream',
      profile,
    });
  }

  protected getVideoServersImpl(): VideoServer[] {
    const label = this.source.name ? this.source.name.slice(0, 18) : 'Extension';
    return [
      { id: 'hd-1-sub', name: `${label} · Mirror 1 (Sub)`, category: 'sub' },
      { id: 'hd-2-sub', name: `${label} · Mirror 2 (Sub)`, category: 'sub' },
      { id: 'hd-1-dub', name: `${label} · Mirror 1 (Dub)`, category: 'dub' },
    ];
  }
}

export class GenericWebExtensionAdapter extends ServerBackedAnimeExtensionAdapter {
  constructor(source: SourceInfo, profile?: DetectedSourceProfile) {
    super(source, {
      adapterId: 'generic-web',
      providerKind: 'generic-web',
      profile,
    });
  }

  protected getVideoServersImpl(): VideoServer[] {
    if (this.source.id.startsWith('ext-')) {
      const label = this.source.name ? this.source.name.slice(0, 18) : 'Extension';
      return [
        { id: 'hd-1-sub', name: `${label} · HD-1 (Sub)`, category: 'sub' },
        { id: 'hd-2-sub', name: `${label} · HD-2 (Sub)`, category: 'sub' },
        { id: 'hd-1-dub', name: `${label} · HD-1 (Dub)`, category: 'dub' },
      ];
    }
    return super.getVideoServersImpl();
  }
}

export class GotakuExtensionAdapter extends ServerBackedAnimeExtensionAdapter {
  constructor(source: SourceInfo, profile?: DetectedSourceProfile) {
    super(source, {
      adapterId: 'gotaku-catalog',
      providerKind: 'gotaku',
      profile,
    });
  }
}

export class MetadataOnlyExtensionAdapter extends ExtensionAdapter {
  constructor(source: SourceInfo, profile?: DetectedSourceProfile) {
    super(source, {
      adapterId: 'metadata-only',
      providerKind: 'metadata-only',
      profile,
    });
  }
}

export class UnsupportedExtensionAdapter extends ExtensionAdapter {
  constructor(source: SourceInfo, profile?: DetectedSourceProfile) {
    super(source, {
      adapterId: profile?.compatibility.adapterId || 'unsupported',
      providerKind: profile?.kind || 'unsupported',
      profile,
    });
  }
}

export interface ClientExtensionAdapterFactoryEntry {
  id: string;
  matches: (source: SourceInfo, profile: DetectedSourceProfile) => boolean;
  create: (source: SourceInfo, profile: DetectedSourceProfile) => ExtensionAdapter;
}

const customClientAdapterFactories: ClientExtensionAdapterFactoryEntry[] = [];

export function registerExtensionAdapterFactory(entry: ClientExtensionAdapterFactoryEntry): void {
  const idx = customClientAdapterFactories.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    customClientAdapterFactories[idx] = entry;
  } else {
    customClientAdapterFactories.unshift(entry);
  }
}

export function unregisterExtensionAdapterFactory(id: string): void {
  const idx = customClientAdapterFactories.findIndex((e) => e.id === id);
  if (idx >= 0) {
    customClientAdapterFactories.splice(idx, 1);
  }
}

function buildSourceInfoFromOptions(
  sourceOrId: SourceInfo | string,
  options?: {
    sourceName?: string;
    sourceBaseUrl?: string;
    sourceLang?: string;
    sourcePkg?: string;
  },
): SourceInfo {
  if (typeof sourceOrId !== 'string') {
    return sourceOrId;
  }
  const cleanId = sourceOrId.trim() || 'shonenx-hls-inbuilt';
  const inbuilt = INBUILT_SOURCES.find((s) => s.id === cleanId);
  if (inbuilt) {
    return {
      ...inbuilt,
      name: options?.sourceName || inbuilt.name,
      baseUrl: options?.sourceBaseUrl || inbuilt.baseUrl,
      lang: options?.sourceLang || inbuilt.lang,
      pkg: options?.sourcePkg || inbuilt.pkg,
    };
  }
  return {
    id: cleanId,
    name: options?.sourceName || cleanId,
    type: cleanId === 'shonenx-hls-inbuilt' ? 'inbuilt' : 'extension',
    mediaTypes: ['ANIME'],
    lang: options?.sourceLang || 'en',
    version: '1.0.0',
    baseUrl: options?.sourceBaseUrl,
    pkg: options?.sourcePkg,
  };
}

export function createExtensionAdapter(
  sourceOrId: SourceInfo | string,
  options?: {
    sourceName?: string;
    sourceBaseUrl?: string;
    sourceLang?: string;
    sourcePkg?: string;
  },
): ExtensionAdapter {
  const source = buildSourceInfoFromOptions(sourceOrId, options);
  const profile = detectSourceProfile(source);

  if (profile.kind === 'metadata-only') {
    return new MetadataOnlyExtensionAdapter(source, profile);
  }
  if (profile.kind === 'missing-host' || profile.kind === 'non-anime') {
    return new UnsupportedExtensionAdapter(source, profile);
  }

  for (const custom of customClientAdapterFactories) {
    if (custom.matches(source, profile)) {
      return custom.create(source, profile);
    }
  }

  switch (profile.kind) {
    case 'inbuilt-anime':
      return new ShizuTvInbuiltExtensionAdapter(source, profile);
    case 'gotaku':
      return new GotakuExtensionAdapter(source, profile);
    case 'hianime':
      return new HiAnimeExtensionAdapter(source, profile);
    case 'gogo-clone':
      return new GogoCloneExtensionAdapter(source, profile);
    case 'wordpress-animestream':
      return new WordPressAnimeExtensionAdapter(source, profile);
    case 'generic-web':
    default:
      return new GenericWebExtensionAdapter(source, profile);
  }
}

export function resolveSourceCompatibility(
  sourceOrId: SourceInfo | string,
  options?: {
    sourceName?: string;
    sourceBaseUrl?: string;
    sourceLang?: string;
    sourcePkg?: string;
  },
): ExtensionSourceCompatibilityReport {
  return createExtensionAdapter(sourceOrId, options).getCompatibility();
}

export async function resolveExtensionEpisodesAsync(params: {
  sourceId: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  sourcePkg?: string;
  selectedSourceEntry: MatchedSourceEntry;
  bypassCache?: boolean;
  signal?: AbortSignal;
}): Promise<ExtensionEpisodesResponse> {
  const adapter = createExtensionAdapter(params.sourceId, {
    sourceName: params.sourceName,
    sourceBaseUrl: params.sourceBaseUrl,
    sourceLang: params.sourceLang,
    sourcePkg: params.sourcePkg,
  });

  try {
    const result = await adapter.listEpisodes({
      selectedSourceEntry: params.selectedSourceEntry,
      bypassCache: params.bypassCache,
      recordTrace: false,
      signal: params.signal,
    });
    return {
      compatible: result.compatible,
      reason: result.reason,
      sourceLabel: result.sourceLabel || adapter.source.name,
      episodes: result.episodes,
    };
  } catch (err) {
    if (err instanceof ExtensionCapabilityError) {
      return {
        compatible: false,
        reason: err.reason,
        sourceLabel: err.sourceLabel,
        episodes: [],
      };
    }
    throw err;
  }
}

export async function resolveEpisodesWithDiagnostics(
  media: UnifiedMedia,
  options?: ResolveEpisodesOptions,
): Promise<{ episodes: UnifiedEpisode[]; trace: EpisodeFetchTrace }> {
  const overallStart = performance.now();
  const initialSourceId = options?.sourceId || 'shonenx-hls-inbuilt';
  const initialSourceName =
    options?.sourceName ||
    INBUILT_SOURCES.find((s) => s.id === initialSourceId)?.name ||
    initialSourceId;

  const adapter = createExtensionAdapter(initialSourceId, {
    sourceName: initialSourceName,
    sourceBaseUrl: options?.sourceBaseUrl,
    sourceLang: options?.sourceLang,
    sourcePkg: options?.sourcePkg,
  });

  if (
    shouldUseExtensionEpisodesForSelection({
      sourceId: initialSourceId,
      isReadingMedia: media.type === 'MANGA',
      selectedSourceEntry: options?.selectedSourceEntry,
    }) &&
    options?.selectedSourceEntry
  ) {
    const result = await adapter.listEpisodes({
      media,
      selectedSourceEntry: options.selectedSourceEntry,
      bypassCache: options.bypassCache,
      recordTrace: options.recordTrace,
    });

    if (!result.compatible || result.episodes.length === 0) {
      throw new Error(
        result.reason ||
          `No episodes found for "${options.selectedSourceEntry.title}" on ${result.sourceLabel || initialSourceName}.`,
      );
    }

    const trace =
      result.trace ||
      analyzeEpisodeResolution({
        inputMedia: media,
        resolvedMedia: media,
        sourceId: initialSourceId,
        sourceName: result.sourceLabel || initialSourceName,
        overrideTitle: options.selectedSourceEntry.title,
        overrideMatched: true,
        resolvedExpectedCount: result.episodes.length,
        providers: [],
        mergedEpisodes: result.episodes,
        totalDurationMs: Math.round(performance.now() - overallStart),
      });

    return { episodes: result.episodes, trace };
  }

  return resolveInbuiltEpisodeMetadataPipeline(media, options);
}

export async function resolveEpisodesForMedia(
  media: UnifiedMedia,
  options?: ResolveEpisodesOptions,
): Promise<UnifiedEpisode[]> {
  const { episodes } = await resolveEpisodesWithDiagnostics(media, options);
  return episodes;
}

export function resolveChaptersForMedia(media: UnifiedMedia): UnifiedChapter[] {
  const count = media.chapters && media.chapters > 0 ? media.chapters : 24;
  return Array.from({ length: count }, (_, idx) => {
    const num = idx + 1;
    return {
      id: `${media.id}-ch-${num}`,
      number: num,
      title: `Chapter ${num}`,
      scanlator: num % 2 === 0 ? 'Official Release' : 'ShizuTv Scanlations',
      pageCount: 14,
    };
  });
}

export function resolveVideoServers(sourceId?: string, sourceName?: string): VideoServer[] {
  const adapter = createExtensionAdapter(sourceId || 'shonenx-hls-inbuilt', {
    sourceName,
  });
  return adapter.getVideoServers();
}

export async function searchExtensionTitlesAsync(params: {
  source: SourceInfo;
  query: string;
  signal?: AbortSignal;
}): Promise<ExtensionTitleSearchResponse> {
  const adapter = createExtensionAdapter(params.source);
  try {
    return await adapter.search(params.query, { signal: params.signal });
  } catch (err) {
    if (err instanceof ExtensionCapabilityError) {
      return {
        compatible: false,
        reason: err.reason,
        sourceLabel: params.source.name || params.source.id,
        items: [],
      };
    }
    throw err;
  }
}

export async function resolveVideoStreamAsync(
  params: ResolveVideoStreamParams,
): Promise<VideoStream> {
  const adapter = createExtensionAdapter(params.sourceId || 'shonenx-hls-inbuilt', {
    sourceName: params.sourceName,
    sourceBaseUrl: params.sourceBaseUrl,
    sourceLang: params.sourceLang,
  });
  return adapter.resolveStream(params);
}

export interface ResolveMangaChaptersAsyncParams {
  media: UnifiedMedia;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  overrideTitle?: string;
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export async function resolveMangaChaptersAsync(
  params: ResolveMangaChaptersAsyncParams,
): Promise<{ chapters: UnifiedChapter[]; matchedTitle?: string; sourceLabel?: string }> {
  const response = await fetchBackendApi(
    resolveApiUrl('/api/manga/chapters'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        mediaId: params.media.id,
        mediaType: params.media.type,
        titles: {
          overrideTitle: params.overrideTitle?.trim() || null,
          english: params.media.title?.english ?? null,
          romaji: params.media.title?.romaji ?? null,
          native: params.media.title?.native ?? null,
          synonyms: params.media.synonyms ?? null,
        },
        sourceId: params.sourceId,
        sourceName: params.sourceName,
        sourceBaseUrl: params.sourceBaseUrl,
        sourceLang: params.sourceLang,
        bypassCache: Boolean(params.bypassCache),
      }),
    },
    'manga chapters',
  );

  if (!response.ok) {
    let errMessage = `Failed to load chapters (HTTP ${response.status}).`;
    const errData = await parseJsonResponseSafely<{ message?: string }>(
      response,
      'manga chapters',
    );
    if (errData?.message) errMessage = errData.message;
    throw new Error(errMessage);
  }

  const data = await parseJsonResponseSafely<{
    chapters?: UnifiedChapter[];
    matchedTitle?: string;
    sourceLabel?: string;
  }>(response, 'manga chapters');
  if (!Array.isArray(data?.chapters) || data.chapters.length === 0) {
    throw new Error('No chapters found on this manga source.');
  }
  return {
    chapters: data.chapters,
    matchedTitle: data.matchedTitle,
    sourceLabel: data.sourceLabel,
  };
}

export interface ResolveMangaPagesAsyncParams {
  media: UnifiedMedia;
  chapter: UnifiedChapter;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  overrideTitle?: string;
  bypassCache?: boolean;
  signal?: AbortSignal;
}

export async function resolveMangaChapterPagesAsync(
  params: ResolveMangaPagesAsyncParams,
): Promise<{ pages: string[]; sourceLabel?: string }> {
  const response = await fetchBackendApi(
    resolveApiUrl('/api/manga/pages'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        mediaId: params.media.id,
        mediaType: params.media.type,
        titles: {
          overrideTitle: params.overrideTitle?.trim() || null,
          english: params.media.title?.english ?? null,
          romaji: params.media.title?.romaji ?? null,
          native: params.media.title?.native ?? null,
          synonyms: params.media.synonyms ?? null,
        },
        chapter: {
          id: params.chapter.id,
          number: params.chapter.number,
          title: params.chapter.title,
          sourceChapterId: params.chapter.sourceChapterId,
          chapterUrl: params.chapter.chapterUrl,
        },
        sourceId: params.sourceId,
        sourceName: params.sourceName,
        sourceBaseUrl: params.sourceBaseUrl,
        sourceLang: params.sourceLang,
        bypassCache: Boolean(params.bypassCache),
      }),
    },
    'manga pages',
  );

  if (!response.ok) {
    let errMessage = `Failed to load chapter pages (HTTP ${response.status}).`;
    const errData = await parseJsonResponseSafely<{ message?: string }>(
      response,
      'manga pages',
    );
    if (errData?.message) errMessage = errData.message;
    throw new Error(errMessage);
  }

  const data = await parseJsonResponseSafely<{ pages?: string[]; sourceLabel?: string }>(
    response,
    'manga pages',
  );
  if (!Array.isArray(data?.pages) || data.pages.length === 0) {
    throw new Error('No readable pages returned for this chapter.');
  }
  return {
    pages: rewriteMangaPagesUrls(data.pages),
    sourceLabel: data.sourceLabel,
  };
}

/**
 * Fallback placeholder pages used only when no live reader/chapter data is supplied.
 */
export function resolveChapterPages(media: UnifiedMedia, chapter: UnifiedChapter): string[] {
  const title = (media.title.english || media.title.romaji || 'Manga').replace(/[<>&"']/g, '');
  const totalPages = chapter.pageCount || 12;

  return Array.from({ length: totalPages }, (_, idx) => {
    const pageNum = idx + 1;
    const isCover = pageNum === 1;
    const bg = isCover ? '#12131a' : '#fafafa';
    const fg = isCover ? '#f8fafc' : '#111827';
    const accent = isCover ? '#e50914' : '#1e293b';

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
        <rect width="800" height="1200" fill="${bg}" />
        <rect x="28" y="28" width="744" height="1144" fill="none" stroke="${fg}" stroke-opacity="0.18" stroke-width="2" />
        ${
          isCover
            ? `
          <rect x="64" y="96" width="672" height="360" rx="8" fill="${accent}" fill-opacity="0.14" stroke="${accent}" stroke-width="2" />
          <text x="400" y="240" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="38" font-weight="800" fill="${fg}">${title.slice(0, 28)}</text>
          <text x="400" y="295" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="22" font-weight="600" fill="${accent}">CHAPTER ${chapter.number}</text>
          <text x="400" y="340" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="16" fill="${fg}" fill-opacity="0.7">${chapter.title.replace(/[<>&"']/g, '')}</text>
        `
            : `
          <text x="400" y="590" text-anchor="middle" font-family="Montserrat, sans-serif" font-size="20" font-weight="700" fill="#334155">${title.slice(0, 32)} — Page ${pageNum} of ${totalPages}</text>
        `
        }
        <text x="400" y="1152" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="${fg}" fill-opacity="0.5">${pageNum} / ${totalPages}</text>
      </svg>
    `.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

const inFlightClientDiagnostics = new Map<string, Promise<ExtensionDiagnosticReport>>();

export async function diagnoseExtensionAsync(params: {
  source: SourceInfo;
  mediaType: 'ANIME' | 'MANGA';
  mode: ExtensionDiagnoseMode;
  query: string;
  signal?: AbortSignal;
}): Promise<ExtensionDiagnosticReport> {
  const cleanQuery = params.query.trim() || 'Naruto';
  const dedupeKey = JSON.stringify([
    params.source.id,
    (params.source.baseUrl || '').trim().replace(/\/+$/, ''),
    params.mediaType,
    params.mode,
    cleanQuery.toLowerCase(),
  ]);

  if (!params.signal) {
    const existing = inFlightClientDiagnostics.get(dedupeKey);
    if (existing) {
      return existing;
    }
  }

  const exec = (async () => {
    const response = await fetchBackendApi(
      resolveApiUrl('/api/extensions/diagnose'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: params.signal,
        body: JSON.stringify({
          sourceId: params.source.id,
          sourceName: params.source.name,
          sourceType: params.source.type,
          sourceBaseUrl: params.source.baseUrl,
          sourceLang: params.source.lang,
          sourcePkg: params.source.pkg,
          sourceMediaTypes: params.source.mediaTypes,
          mediaType: params.mediaType,
          mode: params.mode,
          query: cleanQuery,
        }),
      },
      `extension diagnostics (${params.source.name})`,
    );

    const payload = await parseJsonResponseSafely<
      ExtensionDiagnosticReport & { message?: string }
    >(response, `extension diagnostics (${params.source.name})`);
    if (!response.ok || !payload?.capabilities) {
      throw new Error(payload?.message || `Diagnostics failed (HTTP ${response.status}).`);
    }
    return payload;
  })();

  if (params.signal) {
    return exec;
  }

  inFlightClientDiagnostics.set(dedupeKey, exec);
  return exec.finally(() => {
    inFlightClientDiagnostics.delete(dedupeKey);
  });
}

export async function checkSourcesHealthAsync(params: {
  sources: SourceInfo[];
  mediaContext?: SourceHealthMediaContext;
  signal?: AbortSignal;
}): Promise<SourceHealthCheckResult[]> {
  if (!Array.isArray(params.sources) || params.sources.length === 0) {
    return [];
  }

  const response = await fetchBackendApi(
    resolveApiUrl('/api/extensions/health-check'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        sources: params.sources.slice(0, 25).map((src) => ({
          id: src.id,
          name: src.name,
          type: src.type,
          mediaTypes: src.mediaTypes,
          baseUrl: src.baseUrl,
          lang: src.lang,
          pkg: src.pkg,
          ...(params.mediaContext ? { mediaContext: params.mediaContext } : {}),
        })),
      }),
    },
    'source health check',
  );

  const payload = await parseJsonResponseSafely<{
    results?: SourceHealthCheckResult[];
    message?: string;
  }>(response, 'source health check');

  if (!response.ok || !Array.isArray(payload?.results)) {
    throw new Error(payload?.message || `Source health check failed (HTTP ${response.status}).`);
  }

  return payload.results;
}

export function getMediaTypeCategory(type: MediaType): 'watching' | 'reading' {
  return type === 'MANGA' ? 'reading' : 'watching';
}
