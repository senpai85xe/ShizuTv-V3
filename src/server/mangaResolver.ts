import type { UnifiedChapter } from '../types/media.ts';
import { isSafeExternalHttpUrl } from '../utils/extensionRepoParser.ts';
import {
  buildMangaDexAtHomePages,
  buildMangaTitleQueryList,
  MANGADEX_API_BASE,
  type MangaDexFeedChapter,
  type MangaDexSearchItem,
  mapMangaDexChapterFeed,
  parseMangaChapterListHtml,
  parseMangaPagesHtml,
  parseMangaSearchHtml,
  pickBestMangaDexMatch,
  resolveMangaHostPlan,
} from '../utils/mangaResolverUtils.ts';
import {
  isMetadataOnlyCatalogHost,
  isViableTitleMatch,
  scoreGogoSearchCandidate,
} from '../utils/streamResolverUtils.ts';
import {
  buildCapabilitiesBreakdown,
  type CapabilityStatus,
  classifyDiagnosticFailure,
  type DiagnosticFailureKind,
  type ExtensionDiagnoseMode,
  type ExtensionDiagnosticReport,
  resolveDiagnosticOverallStatus,
} from '../utils/extensionDiagnostics.ts';
import {
  classifyFetchException,
  reliableFetchText,
  safeJsonParse,
  UpstreamFetchError,
} from './networkReliability.ts';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MANGADEX_UA = 'ShizuTv/2.1 (+https://mangadex.org)';

export interface ResolveMangaChaptersParams {
  mediaId: string;
  mediaType?: string;
  titles: {
    overrideTitle?: string | null;
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    synonyms?: string[] | null;
  };
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  bypassCache?: boolean;
}

export interface ResolvedMangaChaptersResult {
  chapters: Array<
    UnifiedChapter & {
      sourceChapterId?: string;
      chapterUrl?: string;
      externalUrl?: string | null;
    }
  >;
  matchedTitle: string;
  sourceLabel: string;
  provider: 'mangadex' | 'custom-extension';
}

export interface ResolveMangaPagesParams {
  mediaId: string;
  mediaType?: string;
  titles: {
    overrideTitle?: string | null;
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    synonyms?: string[] | null;
  };
  chapter: {
    id?: string;
    number: number;
    title?: string;
    sourceChapterId?: string;
    chapterUrl?: string;
  };
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  bypassCache?: boolean;
}

export interface ResolvedMangaPagesResult {
  pages: string[];
  chapterNumber: number;
  chapterTitle: string;
  sourceLabel: string;
  provider: 'mangadex' | 'custom-extension';
}

const chaptersCache = new Map<
  string,
  { expiresAt: number; payload: ResolvedMangaChaptersResult }
>();
const pagesCache = new Map<
  string,
  { expiresAt: number; payload: ResolvedMangaPagesResult }
>();
const CACHE_TTL_MS = 5 * 60_000;

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await reliableFetchText(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'application/json',
      ...headers,
    },
    timeoutMs: 9000,
    maxRetries: 1,
    retryDelayMs: 60,
  });
  if (!res.ok) {
    throw new UpstreamFetchError({
      message: `Upstream returned HTTP ${res.status}`,
      failureKind: res.failureKind || 'provider_error',
      status: res.status,
      url,
      retryable: false,
      attempts: res.attempts,
    });
  }
  const parsed = safeJsonParse<T>(res.text);
  if (parsed.ok) {
    return parsed.data;
  }
  const errDetail = 'error' in parsed ? parsed.error : 'Invalid JSON payload';
  throw new UpstreamFetchError({
    message: `Malformed JSON response from upstream (${errDetail})`,
    failureKind: 'malformed_response',
    status: res.status,
    url,
    retryable: false,
    attempts: res.attempts,
  });
}

async function fetchHtml(
  url: string,
  headers: Record<string, string> = {},
  init?: RequestInit,
): Promise<{
  ok: boolean;
  status: number;
  url: string;
  text: string;
  failureKind?: DiagnosticFailureKind;
}> {
  const res = await reliableFetchText(url, {
    method: init?.method,
    body: typeof init?.body === 'string' ? init.body : undefined,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...headers,
    },
    timeoutMs: 9000,
    maxRetries: 1,
    retryDelayMs: 60,
  });
  return {
    ok: res.ok,
    status: res.status,
    url: res.url,
    text: res.text,
    ...(res.failureKind ? { failureKind: res.failureKind } : {}),
  };
}

async function resolveMangaDexChapters(
  queries: string[],
  sourceLabel: string,
  sourceLang?: string,
): Promise<ResolvedMangaChaptersResult> {
  let matched: { id: string; matchedTitle: string } | null = null;

  for (const query of queries.slice(0, 4)) {
    try {
      const searchUrl = `${MANGADEX_API_BASE}/manga?title=${encodeURIComponent(query)}&limit=20&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
      const searchJson = await fetchJson<{ data?: MangaDexSearchItem[] }>(searchUrl, {
        'User-Agent': MANGADEX_UA,
      });
      const best = pickBestMangaDexMatch(searchJson.data || [], queries);
      if (best) {
        matched = { id: best.id, matchedTitle: best.matchedTitle };
        break;
      }
    } catch {
      // Try next query
    }
  }

  if (!matched) {
    throw new Error(`No matching manga found on MangaDex for "${queries[0] || 'this title'}".`);
  }

  const normalizedLang = (sourceLang || '').trim().toLowerCase();
  const useLangFilter =
    normalizedLang && normalizedLang !== 'multi' && normalizedLang !== 'all'
      ? normalizedLang
      : 'en';

  const buildFeedUrl = (langCode?: string) => {
    const params = new URLSearchParams({
      limit: '500',
      'order[chapter]': 'asc',
    });
    params.append('includes[]', 'scanlation_group');
    params.append('contentRating[]', 'safe');
    params.append('contentRating[]', 'suggestive');
    params.append('contentRating[]', 'erotica');
    if (langCode) {
      params.append('translatedLanguage[]', langCode);
    }
    return `${MANGADEX_API_BASE}/manga/${encodeURIComponent(matched!.id)}/feed?${params.toString()}`;
  };

  let feedRes = await fetchJson<{ data?: MangaDexFeedChapter[] }>(buildFeedUrl(useLangFilter), {
    'User-Agent': MANGADEX_UA,
  });
  let mapped = mapMangaDexChapterFeed(feedRes.data || []);

  if (mapped.length === 0) {
    feedRes = await fetchJson<{ data?: MangaDexFeedChapter[] }>(buildFeedUrl(undefined), {
      'User-Agent': MANGADEX_UA,
    });
    mapped = mapMangaDexChapterFeed(feedRes.data || []);
  }

  if (mapped.length === 0) {
    throw new Error(
      `MangaDex found "${matched.matchedTitle}", but no readable chapters are hosted on MangaDex (chapters may be external publisher links only). Try another manga extension.`,
    );
  }

  return {
    chapters: mapped,
    matchedTitle: matched.matchedTitle,
    sourceLabel,
    provider: 'mangadex',
  };
}

async function resolveCustomExtensionMangaChapters(
  baseUrl: string,
  queries: string[],
  sourceLabel: string,
): Promise<ResolvedMangaChaptersResult> {
  if (!isSafeExternalHttpUrl(baseUrl)) {
    throw new Error(`Invalid base URL configured for ${sourceLabel}.`);
  }
  if (isMetadataOnlyCatalogHost(baseUrl, sourceLabel)) {
    throw new Error(
      `${sourceLabel} is a metadata catalog and does not host manga chapters. Switch to MangaDex (Bridge) or a manga reader extension.`,
    );
  }

  const allCandidates = new Map<string, { href: string; title: string }>();
  let lastFailureKind: DiagnosticFailureKind | undefined;
  let lastStatus: number | undefined;
  let lastFailureMessage: string | undefined;

  for (const query of queries.slice(0, 4)) {
    const endpoints = [
      `${baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`,
      `${baseUrl}/?s=${encodeURIComponent(query)}`,
      `${baseUrl}/search?q=${encodeURIComponent(query)}`,
      `${baseUrl}/search?keyword=${encodeURIComponent(query)}`,
    ];

    let stopDueToUpstreamBlockOrOutage = false;
    for (const ep of endpoints) {
      try {
        const res = await fetchHtml(ep, { Referer: `${baseUrl}/` });
        if (!res.ok) {
          lastStatus = res.status;
          lastFailureKind = isUpstreamHttpBlocked(res.status, res.text, res.failureKind)
            ? 'blocked_request'
            : res.failureKind || classifyDiagnosticFailure(`HTTP ${res.status}`, res.status);
          lastFailureMessage = `${sourceLabel} returned HTTP ${res.status}`;
          if (
            lastFailureKind === 'blocked_request' ||
            lastFailureKind === 'timeout' ||
            lastFailureKind === 'network_error'
          ) {
            stopDueToUpstreamBlockOrOutage = true;
            break;
          }
          continue;
        }
        const parsed = parseMangaSearchHtml(res.text, res.url || baseUrl);
        for (const item of parsed) {
          if (!allCandidates.has(item.href)) {
            allCandidates.set(item.href, item);
          }
        }
        if (parsed.length > 0) break;
      } catch (err) {
        const classified = classifyFetchException(err);
        lastFailureKind = classified.failureKind;
        lastFailureMessage = classified.message;
        if (
          lastFailureKind === 'blocked_request' ||
          lastFailureKind === 'timeout' ||
          lastFailureKind === 'network_error'
        ) {
          stopDueToUpstreamBlockOrOutage = true;
          break;
        }
      }
    }
    if (allCandidates.size > 0 || stopDueToUpstreamBlockOrOutage) break;
  }

  const viable = Array.from(allCandidates.values())
    .filter((c) => isViableTitleMatch(c, queries, 'MANGA'))
    .map((c) => ({
      ...c,
      score: scoreGogoSearchCandidate(c, {
        titles: queries,
        category: 'sub',
        format: 'MANGA',
      }),
    }))
    .sort((a, b) => b.score - a.score);

  if (viable.length === 0) {
    if (
      lastFailureKind &&
      (lastFailureKind === 'blocked_request' ||
        lastFailureKind === 'auth_required' ||
        lastFailureKind === 'timeout' ||
        lastFailureKind === 'network_error')
    ) {
      throw new UpstreamFetchError({
        message:
          lastFailureMessage ||
          `Unable to search ${sourceLabel} (upstream error${lastStatus ? ` HTTP ${lastStatus}` : ''}).`,
        failureKind: lastFailureKind,
        status: lastStatus || 0,
        url: baseUrl,
        retryable: false,
      });
    }
    throw new Error(`No matching manga found on ${sourceLabel} for "${queries[0] || 'this title'}".`);
  }

  for (const cand of viable.slice(0, 3)) {
    const seriesUrl = new URL(cand.href, baseUrl).toString();
    try {
      const pageRes = await fetchHtml(seriesUrl, { Referer: `${baseUrl}/` });
      if (!pageRes.ok) continue;

      let chapters = parseMangaChapterListHtml(pageRes.text, pageRes.url || seriesUrl);
      // Madara WordPress themes load chapters lazily via POST {seriesUrl}/ajax/chapters/
      if (chapters.length === 0) {
        try {
          const ajaxUrl = `${seriesUrl.replace(/\/+$/, '')}/ajax/chapters/`;
          const ajaxRes = await fetchHtml(
            ajaxUrl,
            {
              Referer: seriesUrl,
              'X-Requested-With': 'XMLHttpRequest',
            },
            { method: 'POST' },
          );
          if (ajaxRes.ok && ajaxRes.text) {
            chapters = parseMangaChapterListHtml(ajaxRes.text, seriesUrl);
          }
        } catch {
          // Ignore Madara ajax chapters failure
        }
      }

      if (chapters.length > 0) {
        return {
          chapters,
          matchedTitle: cand.title,
          sourceLabel,
          provider: 'custom-extension',
        };
      }
    } catch {
      // Try next viable candidate
    }
  }

  throw new Error(
    `Found "${viable[0].title}" on ${sourceLabel}, but could not load its chapter list.`,
  );
}

export async function resolveMangaChaptersServer(
  params: ResolveMangaChaptersParams,
): Promise<ResolvedMangaChaptersResult> {
  const plan = resolveMangaHostPlan(params);
  if (plan.mode === 'missing-host') {
    throw new Error(
      `Extension "${plan.sourceLabel}" does not have a valid base URL configured. Open Extensions settings to verify or reinstall it.`,
    );
  }

  const queries = buildMangaTitleQueryList(params.titles);
  if (queries.length === 0) {
    throw new Error('No searchable manga title available.');
  }

  const cacheKey = JSON.stringify({
    mediaId: params.mediaId,
    q: queries[0],
    sourceId: params.sourceId || 'mangadex-bridge',
    baseUrl: params.sourceBaseUrl || '',
    lang: params.sourceLang || '',
  });

  if (!params.bypassCache) {
    const cached = chaptersCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
  }

  const result =
    plan.mode === 'mangadex'
      ? await resolveMangaDexChapters(queries, plan.sourceLabel, params.sourceLang)
      : await resolveCustomExtensionMangaChapters(plan.baseUrl!, queries, plan.sourceLabel);

  chaptersCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload: result });
  return result;
}

export async function resolveMangaChapterPagesServer(
  params: ResolveMangaPagesParams,
): Promise<ResolvedMangaPagesResult> {
  const plan = resolveMangaHostPlan(params);
  if (plan.mode === 'missing-host') {
    throw new Error(
      `Extension "${plan.sourceLabel}" does not have a valid base URL configured.`,
    );
  }

  const cacheKey = JSON.stringify({
    mediaId: params.mediaId,
    chNum: params.chapter.number,
    chId: params.chapter.sourceChapterId || params.chapter.id || '',
    chUrl: params.chapter.chapterUrl || '',
    sourceId: params.sourceId || 'mangadex-bridge',
    baseUrl: params.sourceBaseUrl || '',
  });

  if (!params.bypassCache) {
    const cached = pagesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
  }

  if (plan.mode === 'mangadex') {
    let mdChapterId =
      params.chapter.sourceChapterId ||
      (params.chapter.id?.startsWith('md-') ? params.chapter.id.slice(3) : '');

    if (!mdChapterId) {
      const chResult = await resolveMangaChaptersServer({
        mediaId: params.mediaId,
        titles: params.titles,
        sourceId: params.sourceId,
        sourceName: params.sourceName,
        sourceBaseUrl: params.sourceBaseUrl,
        sourceLang: params.sourceLang,
        bypassCache: params.bypassCache,
      });
      const matchedCh =
        chResult.chapters.find((c) => c.number === params.chapter.number) || chResult.chapters[0];
      mdChapterId =
        matchedCh?.sourceChapterId ||
        (matchedCh?.id?.startsWith('md-') ? matchedCh.id.slice(3) : '');
    }

    if (!mdChapterId) {
      throw new Error(`Chapter ${params.chapter.number} was not found on MangaDex.`);
    }

    const atHomeJson = await fetchJson<{
      baseUrl?: string;
      chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
    }>(`${MANGADEX_API_BASE}/at-home/server/${encodeURIComponent(mdChapterId)}`, {
      'User-Agent': MANGADEX_UA,
    });

    const pages = buildMangaDexAtHomePages(atHomeJson, '/api/stream/proxy');
    if (pages.length === 0) {
      throw new Error(`No readable image pages returned by MangaDex for Chapter ${params.chapter.number}.`);
    }

    const payload: ResolvedMangaPagesResult = {
      pages,
      chapterNumber: params.chapter.number,
      chapterTitle: params.chapter.title || `Chapter ${params.chapter.number}`,
      sourceLabel: plan.sourceLabel,
      provider: 'mangadex',
    };
    pagesCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
    return payload;
  }

  // Custom manga extension
  let chapterUrl = params.chapter.chapterUrl;
  if (!chapterUrl) {
    const chResult = await resolveMangaChaptersServer({
      mediaId: params.mediaId,
      titles: params.titles,
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      sourceBaseUrl: params.sourceBaseUrl,
      sourceLang: params.sourceLang,
      bypassCache: params.bypassCache,
    });
    const matchedCh =
      chResult.chapters.find((c) => c.number === params.chapter.number) || chResult.chapters[0];
    chapterUrl = matchedCh?.chapterUrl;
  }

  if (!chapterUrl || !isSafeExternalHttpUrl(chapterUrl)) {
    throw new Error(
      `Chapter ${params.chapter.number} URL could not be located on ${plan.sourceLabel}.`,
    );
  }

  const res = await fetchHtml(chapterUrl, { Referer: `${plan.baseUrl}/` });
  if (!res.ok) {
    throw new Error(
      `${plan.sourceLabel} returned HTTP ${res.status} while loading Chapter ${params.chapter.number}.`,
    );
  }

  const pages = parseMangaPagesHtml(res.text, res.url || chapterUrl, '/api/stream/proxy');
  if (pages.length === 0) {
    throw new Error(
      `No readable page images found on ${plan.sourceLabel} for Chapter ${params.chapter.number}. Try switching to MangaDex (Bridge) or another manga extension.`,
    );
  }

  const payload: ResolvedMangaPagesResult = {
    pages,
    chapterNumber: params.chapter.number,
    chapterTitle: params.chapter.title || `Chapter ${params.chapter.number}`,
    sourceLabel: plan.sourceLabel,
    provider: 'custom-extension',
  };
  pagesCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
  return payload;
}

function looksBlockedChallenge(status: number, body: string): boolean {
  if (status === 403 || status === 429 || status === 503) {
    if (/just a moment|cf-challenge|cloudflare|attention required|enable javascript/i.test(body)) {
      return true;
    }
  }
  return /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(body);
}

function isUpstreamHttpBlocked(
  status: number,
  body: string,
  failureKind?: DiagnosticFailureKind,
): boolean {
  return (
    status === 403 ||
    status === 429 ||
    status === 503 ||
    failureKind === 'blocked_request' ||
    looksBlockedChallenge(status, body)
  );
}

const inFlightMangaDiagnostics = new Map<string, Promise<ExtensionDiagnosticReport>>();

export async function diagnoseMangaExtensionServer(params: {
  sourceId: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  sourcePkg?: string;
  mode: ExtensionDiagnoseMode;
  query: string;
}): Promise<ExtensionDiagnosticReport> {
  const query = params.query.trim() || 'Naruto';
  const normalizedHost = (params.sourceBaseUrl || '').trim().replace(/\/+$/, '');
  const dedupeKey = JSON.stringify([
    'MANGA',
    params.sourceId.trim(),
    normalizedHost,
    params.mode,
    query.toLowerCase(),
  ]);

  const existing = inFlightMangaDiagnostics.get(dedupeKey);
  if (existing) {
    return existing;
  }

  const runPromise = runDiagnoseMangaExtensionServer({
    ...params,
    query,
  }).finally(() => {
    inFlightMangaDiagnostics.delete(dedupeKey);
  });

  inFlightMangaDiagnostics.set(dedupeKey, runPromise);
  return runPromise;
}

async function runDiagnoseMangaExtensionServer(params: {
  sourceId: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  sourcePkg?: string;
  mode: ExtensionDiagnoseMode;
  query: string;
}): Promise<ExtensionDiagnosticReport> {
  const startedAt = Date.now();
  const sourceLabel = params.sourceName || params.sourceId;
  const query = params.query.trim() || 'Naruto';
  const testedAt = () => new Date().toISOString();

  if (
    isMetadataOnlyCatalogHost(
      params.sourceBaseUrl,
      params.sourceName,
      params.sourcePkg,
      params.sourceId,
    )
  ) {
    const unsupportedReason = `${sourceLabel} is a metadata/tracking catalog and cannot supply readable manga chapters or pages.`;
    return {
      sourceId: params.sourceId,
      sourceName: sourceLabel,
      status: 'unsupported',
      durationMs: Date.now() - startedAt,
      testedAt: testedAt(),
      mode: params.mode,
      failureKind: 'metadata_only',
      summary: 'Unsupported: Metadata-only catalog source',
      detail: unsupportedReason,
      capabilities: buildCapabilitiesBreakdown({
        mode: params.mode,
        mediaTab: 'MANGA',
        unsupportedReason,
        isMetadataCatalogOnly: true,
        searchMatched: false,
        listingAvailable: false,
        playbackOrPagesVerified: false,
      }),
    };
  }

  const plan = resolveMangaHostPlan(params);
  if (plan.mode === 'missing-host') {
    const unsupportedReason = `No valid HTTP base URL is configured for "${sourceLabel}".`;
    return {
      sourceId: params.sourceId,
      sourceName: sourceLabel,
      status: 'unsupported',
      durationMs: Date.now() - startedAt,
      testedAt: testedAt(),
      mode: params.mode,
      failureKind: 'missing_host',
      summary: 'Unsupported: Missing host URL',
      detail: unsupportedReason,
      capabilities: buildCapabilitiesBreakdown({
        mode: params.mode,
        mediaTab: 'MANGA',
        unsupportedReason,
        searchMatched: false,
        listingAvailable: false,
        playbackOrPagesVerified: false,
      }),
    };
  }

  const probeHost = plan.mode === 'mangadex' ? MANGADEX_API_BASE : plan.baseUrl!;

  if (params.mode === 'ping') {
    try {
      const target = plan.mode === 'mangadex' ? `${MANGADEX_API_BASE}/ping` : `${probeHost}/`;
      const res = await fetchHtml(target, plan.mode === 'mangadex' ? { 'User-Agent': MANGADEX_UA } : {});
      if (isUpstreamHttpBlocked(res.status, res.text, res.failureKind)) {
        const statusLabel = res.status ? `HTTP ${res.status}` : 'anti-bot challenge';
        return {
          sourceId: params.sourceId,
          sourceName: sourceLabel,
          status: 'fail',
          durationMs: Date.now() - startedAt,
          testedAt: testedAt(),
          mode: 'ping',
          failureKind: 'blocked_request',
          summary: `Upstream access blocked on ${sourceLabel} (${statusLabel})`,
          detail: `${target} returned ${statusLabel}. Upstream access is restricted or rate-limited from this server; this does not mean the extension format is unsupported.`,
          capabilities: buildCapabilitiesBreakdown({
            mode: 'ping',
            mediaTab: 'MANGA',
            searchMatched: false,
            listingAvailable: false,
            playbackOrPagesVerified: false,
          }),
        };
      }
      if (!res.ok) {
        return {
          sourceId: params.sourceId,
          sourceName: sourceLabel,
          status: 'fail',
          durationMs: Date.now() - startedAt,
          testedAt: testedAt(),
          mode: 'ping',
          failureKind: res.failureKind || classifyDiagnosticFailure(`HTTP ${res.status}`, res.status),
          summary: `Host returned HTTP ${res.status}`,
          detail: `${target} did not return 2xx. Reader capability not tested in Ping mode.`,
          capabilities: buildCapabilitiesBreakdown({
            mode: 'ping',
            mediaTab: 'MANGA',
            searchMatched: false,
            listingAvailable: false,
            playbackOrPagesVerified: false,
          }),
        };
      }
      return {
        sourceId: params.sourceId,
        sourceName: sourceLabel,
        status: 'partial',
        durationMs: Date.now() - startedAt,
        testedAt: testedAt(),
        mode: 'ping',
        summary: `Host reachable (HTTP ${res.status}) · Reader not verified`,
        detail: `${target} responded cleanly. Run Full test to verify chapters and reader pages.`,
        capabilities: buildCapabilitiesBreakdown({
          mode: 'ping',
          mediaTab: 'MANGA',
          searchMatched: true,
          listingAvailable: false,
          playbackOrPagesVerified: false,
        }),
      };
    } catch (err) {
      const classified = classifyFetchException(err);
      return {
        sourceId: params.sourceId,
        sourceName: sourceLabel,
        status: 'fail',
        durationMs: Date.now() - startedAt,
        testedAt: testedAt(),
        mode: 'ping',
        failureKind: classified.failureKind,
        summary: classified.message || 'Host unreachable',
        detail: `Failed to reach ${probeHost}`,
        capabilities: buildCapabilitiesBreakdown({
          mode: 'ping',
          mediaTab: 'MANGA',
          searchMatched: false,
          listingAvailable: false,
          playbackOrPagesVerified: false,
        }),
      };
    }
  }

  // Basic or Full: perform real search against target extension/MangaDex
  let searchMatchedTitle: string | undefined;
  let searchMatchedCount = 0;
  let blockedReason: string | null = null;
  let searchFailureKind: DiagnosticFailureKind | undefined;
  let searchErrorDetail: string | undefined;

  if (plan.mode === 'mangadex') {
    try {
      const searchJson = await fetchJson<{ data?: MangaDexSearchItem[] }>(
        `${MANGADEX_API_BASE}/manga?title=${encodeURIComponent(query)}&limit=10&contentRating[]=safe&contentRating[]=suggestive`,
        { 'User-Agent': MANGADEX_UA },
      );
      const best = pickBestMangaDexMatch(searchJson.data || [], [query]);
      if (best) {
        searchMatchedTitle = best.matchedTitle;
        searchMatchedCount = (searchJson.data || []).length;
      }
    } catch (err) {
      const classified = classifyFetchException(err);
      return {
        sourceId: params.sourceId,
        sourceName: sourceLabel,
        status: 'fail',
        durationMs: Date.now() - startedAt,
        testedAt: testedAt(),
        mode: params.mode,
        failureKind: classified.failureKind,
        summary: classified.message || 'MangaDex search failed',
        detail: classified.message,
        capabilities: buildCapabilitiesBreakdown({
          mode: params.mode,
          mediaTab: 'MANGA',
          searchMatched: false,
          listingAvailable: false,
          playbackOrPagesVerified: false,
        }),
      };
    }
  } else {
    const endpoints = [
      `${probeHost}/?s=${encodeURIComponent(query)}&post_type=wp-manga`,
      `${probeHost}/?s=${encodeURIComponent(query)}`,
      `${probeHost}/search?q=${encodeURIComponent(query)}`,
      `${probeHost}/search?keyword=${encodeURIComponent(query)}`,
    ];
    for (const ep of endpoints) {
      try {
        const res = await fetchHtml(ep, { Referer: `${probeHost}/` });
        if (isUpstreamHttpBlocked(res.status, res.text, res.failureKind)) {
          const statusLabel = res.status ? `HTTP ${res.status}` : 'anti-bot challenge';
          blockedReason = `Unable to search ${sourceLabel} (${statusLabel}). Upstream access is restricted or unverified from this server; this does not mean the extension format is unsupported.`;
          searchFailureKind = 'blocked_request';
          break;
        }
        if (!res.ok) {
          searchFailureKind = res.failureKind || classifyDiagnosticFailure(`HTTP ${res.status}`, res.status);
          searchErrorDetail = `HTTP ${res.status}`;
          if (searchFailureKind === 'timeout' || searchFailureKind === 'network_error') {
            break;
          }
          continue;
        }
        const parsed = parseMangaSearchHtml(res.text, res.url || probeHost);
        const viable = parsed.filter((c) => isViableTitleMatch(c, [query], 'MANGA'));
        if (viable.length > 0) {
          searchMatchedTitle = viable[0].title;
          searchMatchedCount = viable.length;
          break;
        }
      } catch (err) {
        const classified = classifyFetchException(err);
        searchFailureKind = classified.failureKind;
        searchErrorDetail = classified.message;
        if (searchFailureKind === 'timeout' || searchFailureKind === 'network_error') {
          break;
        }
      }
    }
  }

  if (blockedReason) {
    return {
      sourceId: params.sourceId,
      sourceName: sourceLabel,
      status: 'fail',
      durationMs: Date.now() - startedAt,
      testedAt: testedAt(),
      mode: params.mode,
      failureKind: 'blocked_request',
      summary: `Upstream access blocked on ${sourceLabel}; remaining capabilities unverified`,
      detail: blockedReason,
      capabilities: buildCapabilitiesBreakdown({
        mode: params.mode,
        mediaTab: 'MANGA',
        searchMatched: false,
        listingAvailable: false,
        playbackOrPagesVerified: false,
        listingStatus: 'untested',
        playbackStatus: 'untested',
      }),
    };
  }

  if (params.mode === 'basic') {
    const searchOk = Boolean(searchMatchedTitle);
    return {
      sourceId: params.sourceId,
      sourceName: sourceLabel,
      status: resolveDiagnosticOverallStatus({
        mode: 'basic',
        searchMatched: searchOk,
        listingAvailable: false,
        playbackOrPagesVerified: false,
        errorOccurred: !searchOk,
      }),
      durationMs: Date.now() - startedAt,
      testedAt: testedAt(),
      mode: 'basic',
      ...(!searchOk ? { failureKind: searchFailureKind || 'provider_error' } : {}),
      summary: searchOk
        ? `Search matched ${searchMatchedCount} result${searchMatchedCount === 1 ? '' : 's'} · Top: ${searchMatchedTitle} (Pages untested)`
        : `No matching manga found on ${sourceLabel} for "${query}"`,
      detail: searchOk
        ? 'Site search succeeded on this source. Run Full test to verify chapters and reader pages.'
        : searchErrorDetail || 'Source site returned 0 viable manga matches.',
      matchedTitle: searchMatchedTitle,
      capabilities: buildCapabilitiesBreakdown({
        mode: 'basic',
        mediaTab: 'MANGA',
        searchMatched: searchOk,
        listingAvailable: false,
        playbackOrPagesVerified: false,
      }),
    };
  }

  // Full test: chapter listing + chapter 1 reader page resolution
  let listingAvailable = false;
  let pagesVerified = false;
  let sampleItems: string[] = [];
  let detailMsg = '';
  let fullFailureKind: DiagnosticFailureKind | undefined;

  try {
    const chResult = await resolveMangaChaptersServer({
      mediaId: `diag-${params.sourceId}`,
      mediaType: 'MANGA',
      titles: { english: query, romaji: query },
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      sourceBaseUrl: params.sourceBaseUrl,
      sourceLang: params.sourceLang,
      bypassCache: true,
    });
    listingAvailable = chResult.chapters.length > 0;
    searchMatchedTitle = chResult.matchedTitle || searchMatchedTitle;
    sampleItems = chResult.chapters.slice(0, 3).map((c) => `Ch ${c.number}: ${c.title}`);

    if (listingAvailable) {
      const firstCh = chResult.chapters[0];
      const pageRes = await resolveMangaChapterPagesServer({
        mediaId: `diag-${params.sourceId}`,
        mediaType: 'MANGA',
        titles: { english: query, romaji: query },
        chapter: {
          id: firstCh.id,
          number: firstCh.number,
          title: firstCh.title,
          sourceChapterId: firstCh.sourceChapterId,
          chapterUrl: firstCh.chapterUrl,
        },
        sourceId: params.sourceId,
        sourceName: params.sourceName,
        sourceBaseUrl: params.sourceBaseUrl,
        sourceLang: params.sourceLang,
        bypassCache: true,
      });
      pagesVerified = pageRes.pages.length > 0;
      detailMsg = pagesVerified
        ? `Verified "${searchMatchedTitle}" (${chResult.chapters.length} chapters, Ch ${firstCh.number} returned ${pageRes.pages.length} readable pages).`
        : `Loaded chapter list (${chResult.chapters.length} chapters) but Chapter ${firstCh.number} returned 0 pages.`;
    }
  } catch (err) {
    const classified = classifyFetchException(err);
    detailMsg = classified.message || 'Chapter/page resolution failed.';
    fullFailureKind = classified.failureKind;
  }

  const searchOk = Boolean(searchMatchedTitle);
  const resolvedFailureKind = fullFailureKind || searchFailureKind;
  const overall = resolveDiagnosticOverallStatus({
    mode: 'full',
    searchMatched: searchOk,
    listingAvailable,
    playbackOrPagesVerified: pagesVerified,
    errorOccurred: !pagesVerified && !listingAvailable && !searchOk,
  });

  const isUpstreamBlocked = resolvedFailureKind === 'blocked_request';

  const listingStatusOverride: CapabilityStatus | undefined =
    !listingAvailable && !searchOk && isUpstreamBlocked ? 'untested' : undefined;
  const playbackStatusOverride: CapabilityStatus | undefined =
    !pagesVerified && !listingAvailable && isUpstreamBlocked
      ? 'untested'
      : undefined;

  return {
    sourceId: params.sourceId,
    sourceName: sourceLabel,
    status: overall,
    durationMs: Date.now() - startedAt,
    testedAt: testedAt(),
    mode: 'full',
    ...(overall !== 'pass'
      ? { failureKind: resolvedFailureKind || 'provider_error' }
      : {}),
    summary:
      overall === 'pass'
        ? `Verified reader pages (${sampleItems.length > 0 ? sampleItems[0] : query})`
        : listingAvailable
          ? resolvedFailureKind === 'blocked_request'
            ? `Chapters found, but upstream reader page access was blocked`
            : `Chapters found, but reader pages failed to load`
          : searchMatchedTitle
            ? resolvedFailureKind === 'blocked_request'
              ? `Matched "${searchMatchedTitle}", but upstream chapter access was blocked`
              : `Matched "${searchMatchedTitle}", but chapters unavailable`
            : resolvedFailureKind === 'blocked_request'
              ? `Upstream access blocked on ${sourceLabel}; remaining capabilities unverified`
              : `No playable manga chapters found on ${sourceLabel}`,
    detail: detailMsg || searchErrorDetail || undefined,
    matchedTitle: searchMatchedTitle,
    sampleItems,
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'MANGA',
      searchMatched: searchOk,
      listingAvailable,
      playbackOrPagesVerified: pagesVerified,
      listingStatus: listingStatusOverride,
      playbackStatus: playbackStatusOverride,
    }),
  };
}
