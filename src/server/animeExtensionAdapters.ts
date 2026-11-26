import type {
  ExtensionAdapterCapabilities,
  ExtensionCapabilityErrorCode,
  ExtensionCapabilityName,
  ExtensionEpisodesResponse,
  ExtensionSourceCompatibilityReport,
} from '../types/media.ts';
import type { DiagnosticFailureKind } from '../utils/extensionDiagnostics.ts';
import {
  type DetectedSourceProfile,
  detectExtensionWebCompatibilityIssue,
  detectSourceProfile,
  ExtensionCapabilityError,
  extractNumericIdFromHref,
  extractSlugFromGogoHref,
  type GenericEmbedCandidate,
  type GogoSearchCandidate,
  HIANIME_BRIDGE_HOSTS,
  normalizeProviderEpisodes,
  normalizeProviderSearchItems,
  parseGenericSearchHtml,
  parseSourceEpisodeListHtml,
  rankExtensionSearchCandidates,
  type StreamAudioLanguage,
} from '../utils/streamResolverUtils.ts';

export interface SelectedSourceEntryInput {
  sourceId?: string;
  title?: string;
  href?: string;
  slug?: string;
}

export interface SelectedEpisodeInput {
  id?: string;
  number?: number;
  title?: string;
  sourceId?: string;
  sourceEpisodeId?: string;
  episodeUrl?: string;
  sourceAnimeHref?: string;
  sourceAnimeSlug?: string;
}

export interface SearchAnimeExtensionResultItem {
  sourceId: string;
  title: string;
  href: string;
  slug: string;
  cover?: string | null;
}

export interface SearchAnimeExtensionResponse {
  compatible: boolean;
  reason?: string;
  sourceLabel: string;
  items: SearchAnimeExtensionResultItem[];
}

export interface ServerStreamExecutionInput {
  mediaId: string;
  queries: string[];
  targetTitles: string[];
  format?: string | null;
  episodeNumber: number;
  effectiveCategory: 'sub' | 'dub' | 'raw';
  requestedAudioLang: StreamAudioLanguage;
  serverId?: string;
  serverName?: string;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  directSelectedCandidate: GogoSearchCandidate | null;
  validSelectedEntry: SelectedSourceEntryInput | null;
  validSelectedEpisode: SelectedEpisodeInput | null;
}

export interface HostQueryFailure {
  failureKind: DiagnosticFailureKind;
  message: string;
  status?: number;
}

export interface ServerHostStreamOutcome<TPayload = unknown> {
  payload: TPayload | null;
  lastError?: string;
  lastFailureKind?: DiagnosticFailureKind;
  lastStatus?: number;
  sawCandidatesWithoutRequestedLanguage?: boolean;
}

export interface ServerAdapterRuntime<TPayload = unknown> {
  fetchText: (
    url: string,
    headers?: Record<string, string>,
    timeoutMs?: number,
    maxRetries?: number,
  ) => Promise<{
    status: number;
    ok: boolean;
    url: string;
    text: string;
    failureKind?: DiagnosticFailureKind;
  }>;
  normalizeHttpUrl: (rawUrl: string, baseUrl: string) => string | null;
  parseGogoSearchHtml: (html: string) => GogoSearchCandidate[];
  parseGogoEpisodeEmbeds: (html: string, baseUrl: string) => GenericEmbedCandidate[];
  parseDooPlayAjaxEmbeds: (html: string, episodePageUrl: string) => Promise<GenericEmbedCandidate[]>;
  unwrapGenericOrCompatibleEmbed: (
    embedUrl: string,
    episodePageUrl: string,
    effectiveCategory: 'sub' | 'dub' | 'raw',
    allowFallbackToSub: boolean,
  ) => Promise<unknown | null>;
  resolveEmbedIframeUrl: (embedUrl: string, episodePageUrl: string) => Promise<string | null>;
  resolveMegaPlayOrCompatibleIframe: (
    iframeUrl: string,
    preferredCategory: 'sub' | 'dub' | 'raw',
    embedReferer: string,
  ) => Promise<{ streamUrl?: string } | null>;
  searchGotakuPublicCatalog: (
    host: string,
    query: string,
  ) => Promise<{ ok: boolean; candidates: GogoSearchCandidate[]; status?: number; rawText?: string }>;
  probeGotakuEpisodesSupport: (
    host: string,
    sourceLabel: string,
    hrefOrSlug: string,
  ) => Promise<{
    supported: boolean;
    reason: string;
    episodes: Array<{ sourceEpisodeId: string; number: number; title: string; episodeUrl: string }>;
  }>;
  searchGogoAcrossQueries: (
    host: string,
    queries: string[],
    targetTitles: string[],
    category: 'sub' | 'dub' | 'raw',
    format?: string | null,
    audioLanguage?: StreamAudioLanguage,
    onFailure?: (failure: HostQueryFailure) => void,
  ) => Promise<Array<GogoSearchCandidate & { score: number }>>;
  searchGenericSiteAcrossQueries: (
    host: string,
    queries: string[],
    targetTitles: string[],
    category: 'sub' | 'dub' | 'raw',
    format?: string | null,
    audioLanguage?: StreamAudioLanguage,
    onFailure?: (failure: HostQueryFailure) => void,
  ) => Promise<Array<GogoSearchCandidate & { score: number }>>;
  resolveViaHiAnimeHost: (input: {
    host: string;
    queries: string[];
    targetTitles: string[];
    format?: string | null;
    episodeNumber: number;
    effectiveCategory: 'sub' | 'dub' | 'raw';
    requestedAudioLang: StreamAudioLanguage;
    serverId?: string;
    serverName?: string;
    sourceLabel: string;
    sourceId?: string;
    sourceLang?: string;
    sourceBaseUrl?: string;
    directCandidate?: GogoSearchCandidate | null;
    directEpisode?: SelectedEpisodeInput | null;
    timeoutMs?: number;
    maxRetries?: number;
    onFailure?: (failure: HostQueryFailure) => void;
  }) => Promise<TPayload | null>;
  resolveHostBasedCandidatesStream: (
    host: string,
    candidates: Array<GogoSearchCandidate & { score?: number }>,
    input: ServerStreamExecutionInput,
    options: { allowDooPlayAjax: boolean; allowHiAnimeClone: boolean; breakOnMissingLanguage: boolean },
  ) => Promise<ServerHostStreamOutcome<TPayload>>;
  getAudioLanguageDisplayName: (code: StreamAudioLanguage) => string;
}

export interface ServerSourceDescriptor {
  sourceId: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  sourcePkg?: string;
}

export abstract class BaseServerAnimeExtensionAdapter<TPayload = unknown> {
  abstract readonly adapterId: string;
  abstract readonly providerKind: string;

  readonly source: ServerSourceDescriptor;
  readonly profile: DetectedSourceProfile;
  protected readonly runtime: ServerAdapterRuntime<TPayload>;

  constructor(
    source: ServerSourceDescriptor,
    runtime: ServerAdapterRuntime<TPayload>,
    profile?: DetectedSourceProfile,
  ) {
    this.source = source;
    this.runtime = runtime;
    this.profile =
      profile ||
      detectSourceProfile({
        id: source.sourceId,
        name: source.sourceName,
        baseUrl: source.sourceBaseUrl,
        pkg: source.sourcePkg,
      });
  }

  get sourceId(): string {
    return this.profile.sourceId;
  }

  get sourceLabel(): string {
    return this.profile.sourceLabel;
  }

  get hosts(): string[] {
    return this.profile.hosts;
  }

  getCapabilities(): ExtensionAdapterCapabilities {
    return this.profile.capabilities;
  }

  getCompatibility(): ExtensionSourceCompatibilityReport {
    return {
      ...this.profile.compatibility,
      adapterId: this.adapterId,
      providerKind: this.providerKind,
    };
  }

  supports(capability: ExtensionCapabilityName): boolean {
    const desc = this.getCapabilities()[capability];
    return desc.state === 'verified' || desc.state === 'supported';
  }

  assertCapability(capability: ExtensionCapabilityName): void {
    const desc = this.getCapabilities()[capability];
    if (desc.state === 'verified' || desc.state === 'supported') {
      return;
    }

    let code: ExtensionCapabilityErrorCode = 'UNSUPPORTED_CAPABILITY';
    if (this.profile.isMetadataOnly) {
      code = 'METADATA_ONLY_SOURCE';
    } else if (this.profile.kind === 'missing-host') {
      code = 'MISSING_BASE_URL';
    } else if (this.profile.kind === 'gotaku') {
      code = 'PROTECTED_SOURCE';
    } else if (desc.state === 'unverified') {
      code = 'UNVERIFIED_CAPABILITY';
    }

    throw new ExtensionCapabilityError({
      code,
      capability,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      reason:
        desc.reason ||
        `${this.sourceLabel} does not support ${capability} through this adapter.`,
    });
  }

  async searchTitles(query: string): Promise<SearchAnimeExtensionResponse> {
    this.assertCapability('search');
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        compatible: true,
        sourceLabel: this.sourceLabel,
        items: [],
      };
    }
    return this.searchTitlesImpl(trimmed);
  }

  async listEpisodes(entry: SelectedSourceEntryInput): Promise<ExtensionEpisodesResponse> {
    this.assertCapability('episodes');
    if (!entry?.href || (entry.sourceId && entry.sourceId.trim() !== this.sourceId.trim())) {
      return {
        compatible: false,
        reason: `No valid ${this.sourceLabel} anime entry is selected for episode loading.`,
        sourceLabel: this.sourceLabel,
        episodes: [],
      };
    }
    return this.listEpisodesImpl(entry);
  }

  async resolveStream(input: ServerStreamExecutionInput): Promise<ServerHostStreamOutcome<TPayload>> {
    this.assertCapability('stream');
    return this.resolveStreamImpl(input);
  }

  protected abstract searchTitlesImpl(query: string): Promise<SearchAnimeExtensionResponse>;
  protected abstract listEpisodesImpl(
    entry: SelectedSourceEntryInput,
  ): Promise<ExtensionEpisodesResponse>;
  protected abstract resolveStreamImpl(
    input: ServerStreamExecutionInput,
  ): Promise<ServerHostStreamOutcome<TPayload>>;
}

export class MetadataOnlyServerAdapter<TPayload = unknown> extends BaseServerAnimeExtensionAdapter<TPayload> {
  readonly adapterId = 'metadata-only';
  readonly providerKind = 'metadata-only';

  protected async searchTitlesImpl(): Promise<SearchAnimeExtensionResponse> {
    return {
      compatible: false,
      reason: this.profile.compatibility.reason,
      sourceLabel: this.sourceLabel,
      items: [],
    };
  }

  protected async listEpisodesImpl(): Promise<ExtensionEpisodesResponse> {
    return {
      compatible: false,
      reason: this.profile.compatibility.reason,
      sourceLabel: this.sourceLabel,
      episodes: [],
    };
  }

  protected async resolveStreamImpl(): Promise<ServerHostStreamOutcome<TPayload>> {
    return { payload: null, lastError: this.profile.compatibility.reason };
  }
}

export class MissingHostServerAdapter<TPayload = unknown> extends BaseServerAnimeExtensionAdapter<TPayload> {
  readonly adapterId = 'missing-host';
  readonly providerKind = 'missing-host';

  protected async searchTitlesImpl(): Promise<SearchAnimeExtensionResponse> {
    return {
      compatible: false,
      reason: this.profile.compatibility.reason,
      sourceLabel: this.sourceLabel,
      items: [],
    };
  }

  protected async listEpisodesImpl(): Promise<ExtensionEpisodesResponse> {
    return {
      compatible: false,
      reason: this.profile.compatibility.reason,
      sourceLabel: this.sourceLabel,
      episodes: [],
    };
  }

  protected async resolveStreamImpl(): Promise<ServerHostStreamOutcome<TPayload>> {
    return { payload: null, lastError: this.profile.compatibility.reason };
  }
}

export class InbuiltGogoServerAdapter<TPayload = unknown> extends BaseServerAnimeExtensionAdapter<TPayload> {
  readonly adapterId = 'shizutv-inbuilt';
  readonly providerKind = 'inbuilt-anime';

  protected async searchTitlesImpl(query: string): Promise<SearchAnimeExtensionResponse> {
    return runHtmlSearchAcrossHosts({
      hosts: this.hosts,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      query,
      runtime: this.runtime,
      buildEndpoints: (host, q) => [`${host}/search.html?keyword=${encodeURIComponent(q)}`],
      parseHtml: (html) => this.runtime.parseGogoSearchHtml(html),
      includeWpRestFallback: false,
      requireJsRuntimeNote: false,
    });
  }

  protected async listEpisodesImpl(
    entry: SelectedSourceEntryInput,
  ): Promise<ExtensionEpisodesResponse> {
    return loadHtmlSeriesEpisodesAcrossHosts({
      hosts: this.hosts,
      entry,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      runtime: this.runtime,
      tryHiAnimeAjax: false,
    });
  }

  protected async resolveStreamImpl(
    input: ServerStreamExecutionInput,
  ): Promise<ServerHostStreamOutcome<TPayload>> {
    let lastError = `No working episode stream mirror responded on ${this.sourceLabel}.`;
    let lastFailureKind: DiagnosticFailureKind | undefined;
    let lastStatus: number | undefined;
    let sawCandidatesWithoutRequestedLanguage = false;
    let sawCleanZeroMatches = false;

    const recordFailure = (failure: HostQueryFailure) => {
      const priority = (kind?: DiagnosticFailureKind): number => {
        if (kind === 'blocked_request') return 4;
        if (kind === 'auth_required') return 3;
        if (kind === 'timeout' || kind === 'network_error') return 2;
        return 1;
      };
      if (!lastFailureKind || priority(failure.failureKind) >= priority(lastFailureKind)) {
        lastFailureKind = failure.failureKind;
        lastError = failure.message;
        if (failure.status !== undefined) lastStatus = failure.status;
      }
    };

    for (const host of this.hosts) {
      let hostFailure: HostQueryFailure | null = null;
      const candidates = input.directSelectedCandidate
        ? [input.directSelectedCandidate]
        : await this.runtime.searchGogoAcrossQueries(
            host,
            input.queries,
            input.targetTitles,
            input.effectiveCategory,
            input.format,
            input.requestedAudioLang,
            (failure) => {
              hostFailure = hostFailure || failure;
              recordFailure(failure);
            },
          );

      if (candidates.length === 0) {
        if (!hostFailure) {
          sawCleanZeroMatches = true;
          lastError = `No matching anime entries found on ${this.sourceLabel} for "${input.queries[0]}".`;
        }
        continue;
      }

      const outcome = await this.runtime.resolveHostBasedCandidatesStream(host, candidates, input, {
        allowDooPlayAjax: false,
        allowHiAnimeClone: false,
        breakOnMissingLanguage: true,
      });

      if (outcome.payload) {
        return outcome;
      }
      if (outcome.lastFailureKind) {
        recordFailure({
          failureKind: outcome.lastFailureKind,
          message: outcome.lastError || lastError,
          status: outcome.lastStatus,
        });
      } else if (outcome.lastError && !hostFailure) {
        lastError = outcome.lastError;
      }
      if (outcome.sawCandidatesWithoutRequestedLanguage) {
        sawCandidatesWithoutRequestedLanguage = true;
        break;
      }
    }

    // Secondary inbuilt mirror sweep across HiAnime-compatible hosts in parallel with tight timeout budget (<= 4.2s)
    if (!sawCandidatesWithoutRequestedLanguage) {
      const firstMirrorPayload = await new Promise<TPayload | null>((resolve) => {
        let remaining = HIANIME_BRIDGE_HOSTS.length;
        if (remaining === 0) {
          resolve(null);
          return;
        }
        let settled = false;
        for (const hiHost of HIANIME_BRIDGE_HOSTS) {
          this.runtime
            .resolveViaHiAnimeHost({
              host: hiHost,
              queries: input.queries,
              targetTitles: input.targetTitles,
              format: input.format,
              episodeNumber: input.episodeNumber,
              effectiveCategory: input.effectiveCategory,
              requestedAudioLang: input.requestedAudioLang,
              serverId: input.serverId,
              serverName: input.serverName,
              sourceLabel: this.sourceLabel,
              sourceId: input.sourceId,
              sourceLang: input.sourceLang,
              sourceBaseUrl: input.sourceBaseUrl,
              timeoutMs: 4200,
              maxRetries: 0,
              onFailure: (failure) => recordFailure(failure),
            })
            .then((hiPayload) => {
              if (!settled && hiPayload) {
                settled = true;
                resolve(hiPayload);
                return;
              }
              remaining -= 1;
              if (!settled && remaining <= 0) {
                settled = true;
                resolve(null);
              }
            })
            .catch(() => {
              remaining -= 1;
              if (!settled && remaining <= 0) {
                settled = true;
                resolve(null);
              }
            });
        }
      });

      if (firstMirrorPayload) {
        return { payload: firstMirrorPayload };
      }
    }

    return {
      payload: null,
      lastError:
        sawCleanZeroMatches && !lastFailureKind
          ? `No matching anime entries found on ${this.sourceLabel} for "${input.queries[0]}".`
          : lastError,
      ...(lastFailureKind ? { lastFailureKind } : {}),
      ...(lastStatus !== undefined ? { lastStatus } : {}),
      sawCandidatesWithoutRequestedLanguage,
    };
  }
}

export class HiAnimeServerAdapter<TPayload = unknown> extends BaseServerAnimeExtensionAdapter<TPayload> {
  readonly adapterId: string;
  readonly providerKind = 'hianime';

  constructor(
    source: ServerSourceDescriptor,
    runtime: ServerAdapterRuntime<TPayload>,
    profile?: DetectedSourceProfile,
  ) {
    super(source, runtime, profile);
    this.adapterId = this.profile.compatibility.adapterId || 'hianime-bridge';
  }

  protected async searchTitlesImpl(query: string): Promise<SearchAnimeExtensionResponse> {
    return runHtmlSearchAcrossHosts({
      hosts: this.hosts,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      query,
      runtime: this.runtime,
      buildEndpoints: (host, q) => [`${host}/search?keyword=${encodeURIComponent(q)}`],
      parseHtml: (html, url, host) => parseGenericSearchHtml(html, url || host),
      includeWpRestFallback: false,
      requireJsRuntimeNote: true,
    });
  }

  protected async listEpisodesImpl(
    entry: SelectedSourceEntryInput,
  ): Promise<ExtensionEpisodesResponse> {
    return loadHtmlSeriesEpisodesAcrossHosts({
      hosts: this.hosts,
      entry,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      runtime: this.runtime,
      tryHiAnimeAjax: true,
      strictHiAnimeOnly: true,
    });
  }

  protected async resolveStreamImpl(
    input: ServerStreamExecutionInput,
  ): Promise<ServerHostStreamOutcome<TPayload>> {
    let lastError = `No working episode stream mirror responded on ${this.sourceLabel}.`;

    for (const host of this.hosts) {
      try {
        const hiPayload = await this.runtime.resolveViaHiAnimeHost({
          host,
          queries: input.queries,
          targetTitles: input.targetTitles,
          format: input.format,
          episodeNumber: input.episodeNumber,
          effectiveCategory: input.effectiveCategory,
          requestedAudioLang: input.requestedAudioLang,
          serverId: input.serverId,
          serverName: input.serverName,
          sourceLabel: this.sourceLabel,
          sourceId: input.sourceId,
          sourceLang: input.sourceLang,
          sourceBaseUrl: input.sourceBaseUrl,
          directCandidate: input.directSelectedCandidate,
          directEpisode: input.validSelectedEpisode,
        });
        if (hiPayload) {
          return { payload: hiPayload };
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (input.requestedAudioLang === 'hi' || input.requestedAudioLang === 'es') {
          throw err;
        }
      }
    }

    return { payload: null, lastError };
  }
}

export class GogoCloneServerAdapter<TPayload = unknown> extends BaseServerAnimeExtensionAdapter<TPayload> {
  readonly adapterId = 'gogo-html';
  readonly providerKind = 'gogo-clone';

  protected async searchTitlesImpl(query: string): Promise<SearchAnimeExtensionResponse> {
    return runHtmlSearchAcrossHosts({
      hosts: this.hosts,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      query,
      runtime: this.runtime,
      buildEndpoints: (host, q) => [`${host}/search.html?keyword=${encodeURIComponent(q)}`],
      parseHtml: (html, url, host) => [
        ...this.runtime.parseGogoSearchHtml(html),
        ...parseGenericSearchHtml(html, url || host),
      ],
      includeWpRestFallback: false,
      requireJsRuntimeNote: true,
    });
  }

  protected async listEpisodesImpl(
    entry: SelectedSourceEntryInput,
  ): Promise<ExtensionEpisodesResponse> {
    return loadHtmlSeriesEpisodesAcrossHosts({
      hosts: this.hosts,
      entry,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      runtime: this.runtime,
      tryHiAnimeAjax: false,
    });
  }

  protected async resolveStreamImpl(
    input: ServerStreamExecutionInput,
  ): Promise<ServerHostStreamOutcome<TPayload>> {
    let lastError = `No working episode stream mirror responded on ${this.sourceLabel}.`;
    let lastFailureKind: DiagnosticFailureKind | undefined;
    let lastStatus: number | undefined;
    let sawCandidatesWithoutRequestedLanguage = false;

    for (const host of this.hosts) {
      let hostFailure: HostQueryFailure | null = null;
      const candidates = input.directSelectedCandidate
        ? [input.directSelectedCandidate]
        : await this.runtime.searchGogoAcrossQueries(
            host,
            input.queries,
            input.targetTitles,
            input.effectiveCategory,
            input.format,
            input.requestedAudioLang,
            (failure) => {
              hostFailure = hostFailure || failure;
              lastFailureKind = failure.failureKind;
              lastError = failure.message;
              if (failure.status !== undefined) lastStatus = failure.status;
            },
          );

      if (candidates.length === 0) {
        if (!hostFailure) {
          lastError = `No matching anime entries found on ${this.sourceLabel} for "${input.queries[0]}".`;
        }
        continue;
      }

      const outcome = await this.runtime.resolveHostBasedCandidatesStream(host, candidates, input, {
        allowDooPlayAjax: false,
        allowHiAnimeClone: false,
        breakOnMissingLanguage: true,
      });

      if (outcome.payload) {
        return outcome;
      }
      if (outcome.lastError) lastError = outcome.lastError;
      if (outcome.lastFailureKind) lastFailureKind = outcome.lastFailureKind;
      if (outcome.lastStatus !== undefined) lastStatus = outcome.lastStatus;
      if (outcome.sawCandidatesWithoutRequestedLanguage) {
        sawCandidatesWithoutRequestedLanguage = true;
      }
    }

    return {
      payload: null,
      lastError,
      ...(lastFailureKind ? { lastFailureKind } : {}),
      ...(lastStatus !== undefined ? { lastStatus } : {}),
      sawCandidatesWithoutRequestedLanguage,
    };
  }
}

export class WordPressAnimeServerAdapter<TPayload = unknown> extends BaseServerAnimeExtensionAdapter<TPayload> {
  readonly adapterId = 'wordpress-animestream';
  readonly providerKind = 'wordpress-animestream';

  protected async searchTitlesImpl(query: string): Promise<SearchAnimeExtensionResponse> {
    return runHtmlSearchAcrossHosts({
      hosts: this.hosts,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      query,
      runtime: this.runtime,
      buildEndpoints: (host, q) => [
        `${host}/?s=${encodeURIComponent(q)}`,
        `${host}/search/${encodeURIComponent(q)}/`,
      ],
      parseHtml: (html, url, host) => parseGenericSearchHtml(html, url || host),
      includeWpRestFallback: true,
      requireJsRuntimeNote: true,
    });
  }

  protected async listEpisodesImpl(
    entry: SelectedSourceEntryInput,
  ): Promise<ExtensionEpisodesResponse> {
    return loadHtmlSeriesEpisodesAcrossHosts({
      hosts: this.hosts,
      entry,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      runtime: this.runtime,
      tryHiAnimeAjax: false,
    });
  }

  protected async resolveStreamImpl(
    input: ServerStreamExecutionInput,
  ): Promise<ServerHostStreamOutcome<TPayload>> {
    let lastError = `No working episode stream mirror responded on ${this.sourceLabel}.`;
    let lastFailureKind: DiagnosticFailureKind | undefined;
    let lastStatus: number | undefined;

    for (const host of this.hosts) {
      let hostFailure: HostQueryFailure | null = null;
      const candidates = input.directSelectedCandidate
        ? [input.directSelectedCandidate]
        : await this.runtime.searchGenericSiteAcrossQueries(
            host,
            input.queries,
            input.targetTitles,
            input.effectiveCategory,
            input.format,
            input.requestedAudioLang,
            (failure) => {
              hostFailure = hostFailure || failure;
              lastFailureKind = failure.failureKind;
              lastError = failure.message;
              if (failure.status !== undefined) lastStatus = failure.status;
            },
          );

      if (candidates.length === 0) {
        if (!hostFailure) {
          lastError = `No matching anime entries found on ${this.sourceLabel} for "${input.queries[0]}".`;
        }
        continue;
      }

      const outcome = await this.runtime.resolveHostBasedCandidatesStream(host, candidates, input, {
        allowDooPlayAjax: true,
        allowHiAnimeClone: false,
        breakOnMissingLanguage: false,
      });

      if (outcome.payload) {
        return outcome;
      }
      if (outcome.lastError) lastError = outcome.lastError;
      if (outcome.lastFailureKind) lastFailureKind = outcome.lastFailureKind;
      if (outcome.lastStatus !== undefined) lastStatus = outcome.lastStatus;
    }

    return {
      payload: null,
      lastError,
      ...(lastFailureKind ? { lastFailureKind } : {}),
      ...(lastStatus !== undefined ? { lastStatus } : {}),
    };
  }
}

export class GotakuServerAdapter<TPayload = unknown> extends BaseServerAnimeExtensionAdapter<TPayload> {
  readonly adapterId = 'gotaku-catalog';
  readonly providerKind = 'gotaku';

  protected async searchTitlesImpl(query: string): Promise<SearchAnimeExtensionResponse> {
    let compatibilityIssue: string | null = null;
    let lastNetworkError: string | null = null;
    let sawValidCatalogPage = false;
    const collected = new Map<string, GogoSearchCandidate>();

    for (const host of this.hosts) {
      try {
        const gotakuRes = await this.runtime.searchGotakuPublicCatalog(host, query);
        if (gotakuRes.ok) {
          sawValidCatalogPage = true;
          for (const item of gotakuRes.candidates) {
            if (!collected.has(item.href)) collected.set(item.href, item);
          }
          break;
        }
        if (gotakuRes.rawText) {
          const issue = detectExtensionWebCompatibilityIssue({
            status: gotakuRes.status || 200,
            html: gotakuRes.rawText,
            sourceLabel: this.sourceLabel,
            host,
            parsedCandidatesCount: 0,
          });
          if (issue) {
            compatibilityIssue = compatibilityIssue || issue;
            continue;
          }
        }
      } catch (err) {
        lastNetworkError = err instanceof Error ? err.message : String(err);
      }

      // Fallback probe on standard search endpoints if catalog JSON did not return ok
      const fallbackEndpoints = [
        `${host}/?s=${encodeURIComponent(query)}`,
        `${host}/search.html?keyword=${encodeURIComponent(query)}`,
        `${host}/search?keyword=${encodeURIComponent(query)}`,
      ];
      for (const endpoint of fallbackEndpoints) {
        try {
          const res = await this.runtime.fetchText(endpoint, { Referer: `${host}/` }, 6500);
          const issue = detectExtensionWebCompatibilityIssue({
            status: res.status,
            html: res.text,
            sourceLabel: this.sourceLabel,
            host,
            parsedCandidatesCount: 0,
          });
          if (issue) {
            compatibilityIssue = compatibilityIssue || issue;
            break;
          }
          if (!res.ok) {
            lastNetworkError = `HTTP ${res.status}`;
          }
        } catch (err) {
          lastNetworkError = err instanceof Error ? err.message : String(err);
        }
      }
    }

    const ranked = rankExtensionSearchCandidates(Array.from(collected.values()), query);
    if (ranked.length === 0 && !sawValidCatalogPage) {
      return {
        compatible: false,
        reason:
          compatibilityIssue ||
          `Unable to search ${this.sourceLabel}${lastNetworkError ? ` (${lastNetworkError})` : ''}. This source may require an external native/JS runtime not supported by the web adapter.`,
        sourceLabel: this.sourceLabel,
        items: [],
      };
    }

    return {
      compatible: true,
      sourceLabel: this.sourceLabel,
      items: normalizeProviderSearchItems(this.sourceId, ranked, 15),
    };
  }

  protected async listEpisodesImpl(
    entry: SelectedSourceEntryInput,
  ): Promise<ExtensionEpisodesResponse> {
    const host = this.hosts[0] || 'https://gotaku.to';
    const epProbe = await this.runtime.probeGotakuEpisodesSupport(host, this.sourceLabel, entry.href || '');
    return {
      compatible: false,
      reason: epProbe.reason,
      sourceLabel: this.sourceLabel,
      episodes: [],
    };
  }

  protected async resolveStreamImpl(): Promise<ServerHostStreamOutcome<TPayload>> {
    const reason = this.getCapabilities().stream.reason;
    throw new ExtensionCapabilityError({
      code: 'PROTECTED_SOURCE',
      capability: 'stream',
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      reason:
        reason ||
        `${this.sourceLabel} protects episodes and playback with encrypted binary payloads and Turnstile, which are unsupported by this web adapter.`,
    });
  }
}

export class GenericHtmlServerAdapter<TPayload = unknown> extends BaseServerAnimeExtensionAdapter<TPayload> {
  readonly adapterId = 'generic-web';
  readonly providerKind = 'generic-web';

  protected async searchTitlesImpl(query: string): Promise<SearchAnimeExtensionResponse> {
    return runHtmlSearchAcrossHosts({
      hosts: this.hosts,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      query,
      runtime: this.runtime,
      buildEndpoints: (host, q) => [
        `${host}/?s=${encodeURIComponent(q)}`,
        `${host}/search.html?keyword=${encodeURIComponent(q)}`,
        `${host}/search?keyword=${encodeURIComponent(q)}`,
        `${host}/search?q=${encodeURIComponent(q)}`,
        `${host}/search/${encodeURIComponent(q)}/`,
      ],
      parseHtml: (html, url, host) => [
        ...this.runtime.parseGogoSearchHtml(html),
        ...parseGenericSearchHtml(html, url || host),
      ],
      includeWpRestFallback: true,
      requireJsRuntimeNote: true,
    });
  }

  protected async listEpisodesImpl(
    entry: SelectedSourceEntryInput,
  ): Promise<ExtensionEpisodesResponse> {
    return loadHtmlSeriesEpisodesAcrossHosts({
      hosts: this.hosts,
      entry,
      sourceId: this.sourceId,
      sourceLabel: this.sourceLabel,
      runtime: this.runtime,
      tryHiAnimeAjax: true,
      strictHiAnimeOnly: false,
    });
  }

  protected async resolveStreamImpl(
    input: ServerStreamExecutionInput,
  ): Promise<ServerHostStreamOutcome<TPayload>> {
    let lastError = `No working episode stream mirror responded on ${this.sourceLabel}.`;
    let lastFailureKind: DiagnosticFailureKind | undefined;
    let lastStatus: number | undefined;

    for (const host of this.hosts) {
      let hostFailure: HostQueryFailure | null = null;
      const candidates = input.directSelectedCandidate
        ? [input.directSelectedCandidate]
        : await this.runtime.searchGenericSiteAcrossQueries(
            host,
            input.queries,
            input.targetTitles,
            input.effectiveCategory,
            input.format,
            input.requestedAudioLang,
            (failure) => {
              hostFailure = hostFailure || failure;
              lastFailureKind = failure.failureKind;
              lastError = failure.message;
              if (failure.status !== undefined) lastStatus = failure.status;
            },
          );

      if (candidates.length === 0) {
        if (!hostFailure) {
          lastError = `No matching anime entries found on ${this.sourceLabel} for "${input.queries[0]}".`;
        }
        continue;
      }

      const outcome = await this.runtime.resolveHostBasedCandidatesStream(host, candidates, input, {
        allowDooPlayAjax: true,
        allowHiAnimeClone: true,
        breakOnMissingLanguage: false,
      });

      if (outcome.payload) {
        return outcome;
      }
      if (outcome.lastError) lastError = outcome.lastError;
      if (outcome.lastFailureKind) lastFailureKind = outcome.lastFailureKind;
      if (outcome.lastStatus !== undefined) lastStatus = outcome.lastStatus;
    }

    return {
      payload: null,
      lastError,
      ...(lastFailureKind ? { lastFailureKind } : {}),
      ...(lastStatus !== undefined ? { lastStatus } : {}),
    };
  }
}

async function runHtmlSearchAcrossHosts<TPayload>(params: {
  hosts: string[];
  sourceId: string;
  sourceLabel: string;
  query: string;
  runtime: ServerAdapterRuntime<TPayload>;
  buildEndpoints: (host: string, query: string) => string[];
  parseHtml: (html: string, resolvedUrl: string, host: string) => GogoSearchCandidate[];
  includeWpRestFallback?: boolean;
  requireJsRuntimeNote?: boolean;
}): Promise<SearchAnimeExtensionResponse> {
  const {
    hosts,
    sourceId,
    sourceLabel,
    query,
    runtime,
    buildEndpoints,
    parseHtml,
    includeWpRestFallback,
    requireJsRuntimeNote,
  } = params;

  let compatibilityIssue: string | null = null;
  let lastNetworkError: string | null = null;
  let sawValidHtmlSearchPage = false;
  const collected = new Map<string, GogoSearchCandidate>();

  for (const host of hosts) {
    const endpoints = buildEndpoints(host, query);
    for (const endpoint of endpoints) {
      try {
        const res = await runtime.fetchText(endpoint, { Referer: `${host}/` }, 6500);
        const parsed = res.ok ? parseHtml(res.text, res.url || host, host) : [];

        const issue = detectExtensionWebCompatibilityIssue({
          status: res.status,
          html: res.text,
          sourceLabel,
          host,
          parsedCandidatesCount: parsed.length,
        });
        if (issue) {
          compatibilityIssue = compatibilityIssue || issue;
          break;
        }

        if (res.ok) {
          sawValidHtmlSearchPage = true;
          for (const item of parsed) {
            if (!collected.has(item.href)) collected.set(item.href, item);
          }
          if (parsed.length > 0) break;
        } else {
          lastNetworkError = `HTTP ${res.status}`;
        }
      } catch (err) {
        lastNetworkError = err instanceof Error ? err.message : String(err);
      }
    }

    if (includeWpRestFallback && collected.size === 0) {
      try {
        const wpRes = await runtime.fetchText(
          `${host}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=12`,
          { Referer: `${host}/`, Accept: 'application/json' },
          5500,
        );
        if (wpRes.ok) {
          try {
            const wpJson = JSON.parse(wpRes.text) as Array<{ url?: string; title?: string }>;
            if (Array.isArray(wpJson)) {
              sawValidHtmlSearchPage = true;
              for (const row of wpJson) {
                if (!row?.url || !row?.title) continue;
                try {
                  const u = new URL(row.url);
                  const href = `${u.pathname}${u.search}`;
                  if (!collected.has(href)) {
                    collected.set(href, { href, title: row.title });
                  }
                } catch {
                  // Skip invalid URL
                }
              }
            }
          } catch {
            if (!lastNetworkError) {
              lastNetworkError = 'Malformed JSON from search endpoint';
            }
          }
        }
      } catch {
        // WP REST unavailable
      }
    }

    if (collected.size > 0) break;
  }

  const ranked = rankExtensionSearchCandidates(Array.from(collected.values()), query);
  if (ranked.length === 0 && !sawValidHtmlSearchPage) {
    const suffix = requireJsRuntimeNote
      ? ' This source may require an external native/JS runtime not supported by the web adapter.'
      : '';
    return {
      compatible: false,
      reason:
        compatibilityIssue ||
        `Unable to search ${sourceLabel}${lastNetworkError ? ` (${lastNetworkError})` : ''}.${suffix}`,
      sourceLabel,
      items: [],
    };
  }

  return {
    compatible: true,
    sourceLabel,
    items: normalizeProviderSearchItems(sourceId, ranked, 15),
  };
}

async function loadHtmlSeriesEpisodesAcrossHosts<TPayload>(params: {
  hosts: string[];
  entry: SelectedSourceEntryInput;
  sourceId: string;
  sourceLabel: string;
  runtime: ServerAdapterRuntime<TPayload>;
  tryHiAnimeAjax: boolean;
  strictHiAnimeOnly?: boolean;
}): Promise<ExtensionEpisodesResponse> {
  const { hosts, entry, sourceId, sourceLabel, runtime, tryHiAnimeAjax, strictHiAnimeOnly } = params;
  const href = entry.href || '';
  const slug = entry.slug?.trim() || extractSlugFromGogoHref(href);
  let compatibilityIssue: string | null = null;
  let lastNetworkError: string | null = null;

  for (const host of hosts) {
    const animeNumericId = extractNumericIdFromHref(href);

    if (tryHiAnimeAjax && animeNumericId) {
      try {
        const seriesPageUrl = runtime.normalizeHttpUrl(href, host) || `${host}${href}`;
        const epListRes = await runtime.fetchText(
          `${host}/ajax/v2/episode/list/${animeNumericId}`,
          {
            Referer: seriesPageUrl,
            'X-Requested-With': 'XMLHttpRequest',
          },
          7500,
        );
        const issue = detectExtensionWebCompatibilityIssue({
          status: epListRes.status,
          html: epListRes.text,
          sourceLabel,
          host,
        });
        if (issue) {
          compatibilityIssue = issue;
          if (strictHiAnimeOnly) continue;
        } else if (epListRes.ok) {
          let epListHtml = epListRes.text;
          const trimmedBody = epListRes.text.trim();
          let malformedJson = false;
          if (trimmedBody.startsWith('{') || trimmedBody.startsWith('[')) {
            try {
              const parsedJson = JSON.parse(epListRes.text) as { html?: string };
              if (typeof parsedJson?.html === 'string') epListHtml = parsedJson.html;
            } catch {
              malformedJson = true;
              lastNetworkError = 'Malformed JSON response from episode list endpoint';
            }
          }
          const parsedEpisodes = malformedJson
            ? []
            : parseSourceEpisodeListHtml(epListHtml, host, {
                animeHref: href,
                animeSlug: slug,
              });
          if (parsedEpisodes.length > 0) {
            return {
              compatible: true,
              sourceLabel,
              episodes: normalizeProviderEpisodes({
                sourceId,
                host,
                sourceAnimeHref: href,
                sourceAnimeSlug: slug,
                episodes: parsedEpisodes,
              }),
            };
          }
        } else {
          lastNetworkError = `HTTP ${epListRes.status}`;
        }
      } catch (err) {
        lastNetworkError = err instanceof Error ? err.message : String(err);
      }

      if (strictHiAnimeOnly) continue;
    }

    const seriesUrls = Array.from(
      new Set(
        [
          runtime.normalizeHttpUrl(href, host),
          slug ? `${host}/category/${slug}` : null,
          slug ? `${host}/${slug}` : null,
        ].filter((u): u is string => Boolean(u)),
      ),
    );

    for (const seriesUrl of seriesUrls) {
      try {
        const res = await runtime.fetchText(seriesUrl, { Referer: `${host}/` }, 7500);
        const resolvedUrl = res.url || seriesUrl;
        let parsedEpisodes = res.ok
          ? parseSourceEpisodeListHtml(res.text, resolvedUrl, {
              animeHref: href,
              animeSlug: slug,
            })
          : [];

        const issue = detectExtensionWebCompatibilityIssue({
          status: res.status,
          html: res.text,
          sourceLabel,
          host,
          parsedCandidatesCount: parsedEpisodes.length,
        });
        if (issue) {
          compatibilityIssue = issue;
          break;
        }

        if (!res.ok) {
          lastNetworkError = `HTTP ${res.status}`;
          continue;
        }

        if (parsedEpisodes.length === 0) {
          const movieId =
            res.text.match(/id=["']movie_id["'][^>]*value=["']([^"']+)["']/i)?.[1] ||
            res.text.match(/value=["']([^"']+)["'][^>]*id=["']movie_id["']/i)?.[1];
          if (movieId) {
            const ajaxRes = await runtime.fetchText(
              `${host}/ajax/load-list-episode?ep_start=0&ep_end=10000&id=${encodeURIComponent(movieId)}`,
              { Referer: resolvedUrl },
              6500,
            ).catch(() => null);
            if (ajaxRes?.ok) {
              parsedEpisodes = parseSourceEpisodeListHtml(ajaxRes.text, host, {
                animeHref: href,
                animeSlug: slug,
              });
            } else if (ajaxRes) {
              const ajaxIssue = detectExtensionWebCompatibilityIssue({
                status: ajaxRes.status,
                html: ajaxRes.text,
                sourceLabel,
                host,
              });
              if (ajaxIssue) {
                compatibilityIssue = compatibilityIssue || ajaxIssue;
              } else {
                lastNetworkError = `HTTP ${ajaxRes.status}`;
              }
            }
          }
        }

        if (parsedEpisodes.length > 0) {
          return {
            compatible: true,
            sourceLabel,
            episodes: normalizeProviderEpisodes({
              sourceId,
              host,
              sourceAnimeHref: href,
              sourceAnimeSlug: slug,
              episodes: parsedEpisodes,
            }),
          };
        }
      } catch (err) {
        lastNetworkError = err instanceof Error ? err.message : String(err);
      }
    }
  }

  const displayTitle = entry.title?.trim() || slug || href;
  return {
    compatible: false,
    reason:
      compatibilityIssue ||
      (lastNetworkError
        ? `Unable to load episodes for "${displayTitle}" from ${sourceLabel} (${lastNetworkError}).`
        : `No episode list could be retrieved for "${displayTitle}" on ${sourceLabel}. This entry may be unavailable or require an unsupported player format.`),
    sourceLabel,
    episodes: [],
  };
}

export type ServerAnimeAdapterFactory<TPayload = unknown> = (
  source: ServerSourceDescriptor,
  runtime: ServerAdapterRuntime<TPayload>,
  profile: DetectedSourceProfile,
) => BaseServerAnimeExtensionAdapter<TPayload>;

interface RegisteredServerAdapterEntry {
  id: string;
  matches: (source: ServerSourceDescriptor, profile: DetectedSourceProfile) => boolean;
  factory: ServerAnimeAdapterFactory<any>;
}

const customServerAdapterRegistry: RegisteredServerAdapterEntry[] = [];

export function registerServerAnimeExtensionAdapter(entry: RegisteredServerAdapterEntry): void {
  const idx = customServerAdapterRegistry.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    customServerAdapterRegistry[idx] = entry;
  } else {
    customServerAdapterRegistry.unshift(entry);
  }
}

export function unregisterServerAnimeExtensionAdapter(id: string): void {
  const idx = customServerAdapterRegistry.findIndex((e) => e.id === id);
  if (idx >= 0) {
    customServerAdapterRegistry.splice(idx, 1);
  }
}

export function createServerAnimeExtensionAdapter<TPayload = unknown>(
  source: ServerSourceDescriptor,
  runtime: ServerAdapterRuntime<TPayload>,
): BaseServerAnimeExtensionAdapter<TPayload> {
  const profile = detectSourceProfile({
    id: source.sourceId,
    name: source.sourceName,
    baseUrl: source.sourceBaseUrl,
    pkg: source.sourcePkg,
  });

  if (profile.kind === 'metadata-only') {
    return new MetadataOnlyServerAdapter(source, runtime, profile);
  }
  if (profile.kind === 'missing-host') {
    return new MissingHostServerAdapter(source, runtime, profile);
  }

  for (const custom of customServerAdapterRegistry) {
    if (custom.matches(source, profile)) {
      return custom.factory(source, runtime, profile);
    }
  }

  switch (profile.kind) {
    case 'gotaku':
      return new GotakuServerAdapter(source, runtime, profile);
    case 'inbuilt-anime':
      return new InbuiltGogoServerAdapter(source, runtime, profile);
    case 'hianime':
      return new HiAnimeServerAdapter(source, runtime, profile);
    case 'gogo-clone':
      return new GogoCloneServerAdapter(source, runtime, profile);
    case 'wordpress-animestream':
      return new WordPressAnimeServerAdapter(source, runtime, profile);
    case 'generic-web':
    default:
      return new GenericHtmlServerAdapter(source, runtime, profile);
  }
}
