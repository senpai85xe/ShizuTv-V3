import type { SourceInfo } from '../types/media';
import { MANGADEX_API_BASE, resolveMangaHostPlan } from './mangaResolverUtils';
import {
  detectSourceProfile,
  isMetadataOnlyCatalogHost,
  looksLikeBlockedChallengeHtml,
  looksLikeClientSpaHtml,
} from './streamResolverUtils';

export type ExpectedHeartbeatFormat =
  | 'html_document'
  | 'json_catalog'
  | 'mangadex_json'
  | 'unsupported';

export type SourceHealthStatus =
  | 'idle'
  | 'checking'
  | 'healthy'
  | 'invalid_format'
  | 'unreachable'
  | 'unsupported';

export type SourceHealthMediaContext = 'ANIME' | 'MANGA';

export interface SourceHeartbeatTarget {
  url: string;
  method: 'GET';
  expectedFormat: ExpectedHeartbeatFormat;
  host: string;
}

export interface SourceHeartbeatPlan {
  sourceId: string;
  sourceLabel: string;
  mediaContext: SourceHealthMediaContext;
  adapterKind: string;
  supported: boolean;
  unsupportedReason?: string;
  targets: SourceHeartbeatTarget[];
}

export interface SourceHealthCheckResult {
  sourceId: string;
  sourceName: string;
  status: SourceHealthStatus;
  expectedFormat: ExpectedHeartbeatFormat;
  receivedFormat?: string;
  httpStatus?: number;
  targetUrl?: string;
  latencyMs?: number;
  checkedAt: string;
  summary: string;
  detail?: string;
}

export interface SourceHealthSummaryCounts {
  activeTotal: number;
  healthy: number;
  invalidFormat: number;
  unreachable: number;
  unsupported: number;
  checking: number;
  untested: number;
}

export function resolveSourceMediaContext(
  source: Pick<SourceInfo, 'mediaTypes'>,
  explicitMediaTab?: SourceHealthMediaContext,
): SourceHealthMediaContext {
  if (explicitMediaTab) return explicitMediaTab;
  const types = Array.isArray(source.mediaTypes)
    ? source.mediaTypes.map((m) => String(m).toUpperCase())
    : [];
  const hasAnime =
    types.length === 0 ||
    types.includes('ANIME') ||
    types.includes('MOVIE') ||
    types.includes('TV');
  if (hasAnime) return 'ANIME';
  if (types.includes('MANGA')) return 'MANGA';
  return 'ANIME';
}

export function resolveSourceHeartbeatPlan(
  source: Pick<SourceInfo, 'id' | 'name' | 'type' | 'mediaTypes' | 'baseUrl' | 'pkg'>,
  explicitMediaTab?: SourceHealthMediaContext,
): SourceHeartbeatPlan {
  const cleanId = String(source.id || '').trim() || 'unknown-source';
  const sourceLabel = String(source.name || cleanId).trim() || cleanId;
  const mediaContext = resolveSourceMediaContext(source, explicitMediaTab);

  if (isMetadataOnlyCatalogHost(source.baseUrl, sourceLabel, source.pkg, cleanId)) {
    return {
      sourceId: cleanId,
      sourceLabel,
      mediaContext,
      adapterKind: 'metadata-only',
      supported: false,
      unsupportedReason: `${sourceLabel} is a metadata-only catalog source and does not expose playable media endpoints.`,
      targets: [],
    };
  }

  if (mediaContext === 'MANGA') {
    const mangaPlan = resolveMangaHostPlan({
      sourceId: cleanId,
      sourceName: sourceLabel,
      sourceBaseUrl: source.baseUrl,
    });
    if (mangaPlan.mode === 'mangadex') {
      return {
        sourceId: cleanId,
        sourceLabel: mangaPlan.sourceLabel,
        mediaContext,
        adapterKind: 'mangadex',
        supported: true,
        targets: [
          {
            url: `${MANGADEX_API_BASE}/manga?limit=1&title=one`,
            method: 'GET',
            expectedFormat: 'mangadex_json',
            host: MANGADEX_API_BASE,
          },
        ],
      };
    }
    if (mangaPlan.mode === 'custom-extension' && mangaPlan.baseUrl) {
      return {
        sourceId: cleanId,
        sourceLabel: mangaPlan.sourceLabel,
        mediaContext,
        adapterKind: 'custom-manga',
        supported: true,
        targets: [
          {
            url: `${mangaPlan.baseUrl}/`,
            method: 'GET',
            expectedFormat: 'html_document',
            host: mangaPlan.baseUrl,
          },
        ],
      };
    }
    return {
      sourceId: cleanId,
      sourceLabel: mangaPlan.sourceLabel,
      mediaContext,
      adapterKind: 'missing-host',
      supported: false,
      unsupportedReason: `${mangaPlan.sourceLabel} does not have a valid HTTP base URL configured.`,
      targets: [],
    };
  }

  const profile = detectSourceProfile(source);
  if (
    profile.kind === 'metadata-only' ||
    profile.kind === 'missing-host' ||
    profile.kind === 'non-anime' ||
    profile.hosts.length === 0
  ) {
    const firstCapReason =
      profile.capabilities.stream.reason ||
      profile.capabilities.episodes.reason ||
      profile.capabilities.search.reason ||
      `${profile.sourceLabel} does not have a supported playable endpoint.`;
    return {
      sourceId: cleanId,
      sourceLabel: profile.sourceLabel,
      mediaContext,
      adapterKind: profile.kind,
      supported: false,
      unsupportedReason: firstCapReason,
      targets: [],
    };
  }

  const hostsToProbe = profile.hosts.slice(0, 2);
  if (profile.kind === 'gotaku') {
    return {
      sourceId: cleanId,
      sourceLabel: profile.sourceLabel,
      mediaContext,
      adapterKind: profile.kind,
      supported: true,
      targets: hostsToProbe.map((host) => ({
        url: `${host.replace(/\/+$/, '')}/api/v1/titles?query=naruto&perPage=1`,
        method: 'GET',
        expectedFormat: 'json_catalog',
        host: host.replace(/\/+$/, ''),
      })),
    };
  }

  return {
    sourceId: cleanId,
    sourceLabel: profile.sourceLabel,
    mediaContext,
    adapterKind: profile.kind,
    supported: true,
    targets: hostsToProbe.map((host) => ({
      url: `${host.replace(/\/+$/, '')}/`,
      method: 'GET',
      expectedFormat: 'html_document',
      host: host.replace(/\/+$/, ''),
    })),
  };
}

function describeReceivedSnippet(contentType: string, body: string): string {
  const trimmed = (body || '').trim();
  const ct = (contentType || '').toLowerCase();
  if (!trimmed) return 'Empty body';
  if (ct.includes('application/json') || /^\s*[\[{]/.test(trimmed)) {
    return 'JSON payload';
  }
  if (ct.includes('text/html') || /<(?:!doctype\s+html|html|head|body)/i.test(trimmed)) {
    return 'HTML document';
  }
  if (ct) return ct.split(';')[0].trim();
  return 'Plain / unstructured text';
}

export function formatExpectedFormatLabel(format: ExpectedHeartbeatFormat): string {
  switch (format) {
    case 'json_catalog':
      return 'JSON catalog object';
    case 'mangadex_json':
      return 'MangaDex JSON collection';
    case 'html_document':
      return 'Server-rendered HTML';
    case 'unsupported':
    default:
      return 'Unsupported';
  }
}

export function validateHeartbeatResponseFormat(params: {
  sourceId: string;
  sourceName: string;
  expectedFormat: ExpectedHeartbeatFormat;
  status: number;
  contentType?: string | null;
  body: string;
  targetUrl?: string;
  latencyMs?: number;
  checkedAt?: string;
}): SourceHealthCheckResult {
  const checkedAt = params.checkedAt || new Date().toISOString();
  const contentType = (params.contentType || '').toLowerCase();
  const rawBody = typeof params.body === 'string' ? params.body : '';
  const trimmed = rawBody.trim();
  const base = {
    sourceId: params.sourceId,
    sourceName: params.sourceName,
    expectedFormat: params.expectedFormat,
    httpStatus: params.status > 0 ? params.status : undefined,
    targetUrl: params.targetUrl,
    latencyMs: params.latencyMs,
    checkedAt,
  };

  if (params.expectedFormat === 'unsupported') {
    return {
      ...base,
      status: 'unsupported',
      summary: 'Adapter heartbeat not supported',
    };
  }

  if (params.status <= 0) {
    return {
      ...base,
      status: 'unreachable',
      receivedFormat: 'No response',
      summary: 'Source endpoint unreachable',
      detail: `${params.sourceName} did not respond to the heartbeat request.`,
    };
  }

  if (looksLikeBlockedChallengeHtml(params.status, rawBody)) {
    return {
      ...base,
      status: 'invalid_format',
      receivedFormat: 'Challenge / Anti-Bot HTML',
      summary: 'Invalid format (anti-bot challenge HTML)',
      detail: `Expected ${formatExpectedFormatLabel(params.expectedFormat)}, but ${params.sourceName} returned a challenge page (HTTP ${params.status}).`,
    };
  }

  if (params.status >= 400) {
    return {
      ...base,
      status: 'unreachable',
      receivedFormat: describeReceivedSnippet(contentType, rawBody),
      summary: `Heartbeat HTTP ${params.status}`,
      detail: `${params.sourceName} returned HTTP ${params.status} from ${params.targetUrl || 'upstream host'}.`,
    };
  }

  if (!trimmed) {
    return {
      ...base,
      status: 'invalid_format',
      receivedFormat: 'Empty response body',
      summary: 'Empty response body',
      detail: `Expected ${formatExpectedFormatLabel(params.expectedFormat)}, but ${params.sourceName} returned an empty response body (HTTP ${params.status}).`,
    };
  }

  if (params.expectedFormat === 'json_catalog' || params.expectedFormat === 'mangadex_json') {
    const looksLikeHtml =
      contentType.includes('text/html') ||
      /^<(?:!doctype\s+html|html|head|body)/i.test(trimmed);
    if (looksLikeHtml) {
      return {
        ...base,
        status: 'invalid_format',
        receivedFormat: 'HTML document',
        summary: 'Expected JSON, received HTML',
        detail: `Expected ${formatExpectedFormatLabel(params.expectedFormat)}, but ${params.sourceName} returned an HTML page.`,
      };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {
        ...base,
        status: 'invalid_format',
        receivedFormat: 'Malformed / non-JSON text',
        summary: 'Malformed JSON payload',
        detail: `Expected ${formatExpectedFormatLabel(params.expectedFormat)}, but response body could not be parsed as valid JSON.`,
      };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ...base,
        status: 'invalid_format',
        receivedFormat: Array.isArray(parsed) ? 'JSON array' : `JSON ${typeof parsed}`,
        summary: 'Unexpected JSON structure',
        detail: `Expected ${formatExpectedFormatLabel(params.expectedFormat)}, but received an incompatible JSON root value.`,
      };
    }

    const record = parsed as Record<string, unknown>;
    if (params.expectedFormat === 'mangadex_json') {
      const hasValidMangaDexShape =
        Array.isArray(record.data) || record.result === 'ok';
      if (!hasValidMangaDexShape) {
        return {
          ...base,
          status: 'invalid_format',
          receivedFormat: 'JSON missing MangaDex data',
          summary: 'Unexpected MangaDex JSON schema',
          detail: `${params.sourceName} returned JSON without a valid "data" collection or "result: ok" field.`,
        };
      }
    } else {
      const hasValidCatalogShape =
        Array.isArray(record.data) ||
        Array.isArray(record.titles) ||
        Array.isArray(record.results);
      if (!hasValidCatalogShape) {
        return {
          ...base,
          status: 'invalid_format',
          receivedFormat: 'JSON missing catalog list',
          summary: 'Unexpected catalog JSON schema',
          detail: `${params.sourceName} returned JSON without a catalog array ("data", "titles", or "results").`,
        };
      }
    }

    return {
      ...base,
      status: 'healthy',
      receivedFormat: 'Valid JSON payload',
      summary: 'Heartbeat OK · Valid JSON',
    };
  }

  // Expected: html_document
  const looksLikeJsonPayload =
    contentType.includes('application/json') ||
    (/^\s*[\[{]/.test(trimmed) &&
      (() => {
        try {
          JSON.parse(trimmed);
          return true;
        } catch {
          return false;
        }
      })());

  if (looksLikeJsonPayload) {
    return {
      ...base,
      status: 'invalid_format',
      receivedFormat: 'JSON payload',
      summary: 'Expected HTML, received JSON',
      detail: `Expected server-rendered HTML, but ${params.sourceName} returned a JSON payload.`,
    };
  }

  if (looksLikeClientSpaHtml(rawBody)) {
    return {
      ...base,
      status: 'invalid_format',
      receivedFormat: 'Empty client JS SPA shell',
      summary: 'Client JS shell (missing HTML)',
      detail: `${params.sourceName} returned an empty JavaScript app shell instead of server-rendered HTML content.`,
    };
  }

  const hasHtmlMarkup =
    /<(?:!doctype\s+html|html|head|body|div|main|section|article|ul|nav|a\b|title)/i.test(
      trimmed,
    );
  if (!hasHtmlMarkup) {
    return {
      ...base,
      status: 'invalid_format',
      receivedFormat: describeReceivedSnippet(contentType, rawBody),
      summary: 'Invalid non-HTML response',
      detail: `Expected server-rendered HTML, but ${params.sourceName} returned unstructured or plain text.`,
    };
  }

  return {
    ...base,
    status: 'healthy',
    receivedFormat: 'Valid HTML document',
    summary: 'Heartbeat OK · Valid HTML',
  };
}

export function selectActiveHealthCheckSources(
  allSources: SourceInfo[],
  activeSourceIds: string[],
  mediaTab?: SourceHealthMediaContext,
): SourceInfo[] {
  const activeSet = new Set(activeSourceIds);
  return allSources.filter((src) => {
    if (!activeSet.has(src.id)) return false;
    if (isMetadataOnlyCatalogHost(src.baseUrl, src.name, src.pkg, src.id)) return false;
    if (mediaTab) {
      const types = Array.isArray(src.mediaTypes)
        ? src.mediaTypes.map((m) => String(m).toUpperCase())
        : [];
      if (mediaTab === 'ANIME') {
        return types.length === 0 || types.includes('ANIME') || types.includes('MOVIE') || types.includes('TV');
      }
      if (mediaTab === 'MANGA') {
        return types.includes('MANGA');
      }
    }
    return true;
  });
}

export function summarizeSourceHealthCounts(
  sources: SourceInfo[],
  activeSourceIds: string[],
  resultsById: Record<string, SourceHealthCheckResult | undefined>,
  checkingIds: Record<string, boolean | undefined> = {},
): SourceHealthSummaryCounts {
  const activePlayable = selectActiveHealthCheckSources(sources, activeSourceIds);
  const counts: SourceHealthSummaryCounts = {
    activeTotal: activePlayable.length,
    healthy: 0,
    invalidFormat: 0,
    unreachable: 0,
    unsupported: 0,
    checking: 0,
    untested: 0,
  };

  for (const src of activePlayable) {
    if (checkingIds[src.id]) {
      counts.checking++;
      continue;
    }
    const res = resultsById[src.id];
    if (!res || res.status === 'idle') {
      counts.untested++;
      continue;
    }
    switch (res.status) {
      case 'healthy':
        counts.healthy++;
        break;
      case 'invalid_format':
        counts.invalidFormat++;
        break;
      case 'unreachable':
        counts.unreachable++;
        break;
      case 'unsupported':
        counts.unsupported++;
        break;
      case 'checking':
        counts.checking++;
        break;
      default:
        counts.untested++;
        break;
    }
  }

  return counts;
}
