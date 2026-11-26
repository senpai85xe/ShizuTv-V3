import crypto from 'node:crypto';
import { isSafeExternalHttpUrl } from '../utils/extensionRepoParser.ts';
import {
  buildSearchQueriesForMedia,
  buildStreamProxyUrl,
  buildStreamResolverCacheKey,
  detectAvailableAudiosFromSources,
  ExtensionCapabilityError,
  extractDirectVideoUrlFromHtmlOrScript,
  extractGotakuTitleId,
  extractMegaPlayStreamUrl,
  extractSlugFromGogoHref,
  type GenericEmbedCandidate,
  type GogoSearchCandidate,
  isMatchedEpisodeValidForSource,
  isMatchedSourceEntryValidForSource,
  isSourceInherentLanguage,
  isViableTitleMatch,
  looksLikeBlockedChallengeHtml,
  type MappedSubtitleTrack,
  mapSubtitleTracksFromSources,
  parseGenericEmbedCandidates,
  parseGenericEpisodeLinks,
  parseGenericSearchHtml,
  parseGotakuTitleSearchJson,
  type ResolvedAvailableAudioOption,
  scoreGogoSearchCandidate,
  sortEmbedsForAudioLanguage,
  type StreamAudioLanguage,
} from '../utils/streamResolverUtils.ts';
import type { ExtensionEpisodesResponse } from '../types/media.ts';
import {
  buildCapabilitiesBreakdown,
  type CapabilityStatus,
  classifyDiagnosticFailure,
  DEFAULT_DIAGNOSTIC_PROBE_SCOPE,
  type DiagnosticFailureKind,
  type ExtensionDiagnoseMode,
  type ExtensionDiagnosticReport,
  resolveDiagnosticOverallStatus,
} from '../utils/extensionDiagnostics.ts';
import {
  classifyFetchException,
  reliableFetchText,
  UpstreamFetchError,
} from './networkReliability.ts';
import {
  BaseServerAnimeExtensionAdapter,
  createServerAnimeExtensionAdapter,
  GenericHtmlServerAdapter,
  GogoCloneServerAdapter,
  GotakuServerAdapter,
  HiAnimeServerAdapter,
  type HostQueryFailure,
  InbuiltGogoServerAdapter,
  MetadataOnlyServerAdapter,
  MissingHostServerAdapter,
  registerServerAnimeExtensionAdapter,
  type SearchAnimeExtensionResponse,
  type SearchAnimeExtensionResultItem,
  type SelectedEpisodeInput,
  type SelectedSourceEntryInput,
  type ServerAdapterRuntime,
  type ServerHostStreamOutcome,
  type ServerStreamExecutionInput,
  unregisterServerAnimeExtensionAdapter,
  WordPressAnimeServerAdapter,
} from './animeExtensionAdapters.ts';

export {
  BaseServerAnimeExtensionAdapter,
  createServerAnimeExtensionAdapter,
  ExtensionCapabilityError,
  GenericHtmlServerAdapter,
  GogoCloneServerAdapter,
  GotakuServerAdapter,
  HiAnimeServerAdapter,
  InbuiltGogoServerAdapter,
  MetadataOnlyServerAdapter,
  MissingHostServerAdapter,
  registerServerAnimeExtensionAdapter,
  unregisterServerAnimeExtensionAdapter,
  WordPressAnimeServerAdapter,
};
export type {
  HostQueryFailure,
  SearchAnimeExtensionResponse,
  SearchAnimeExtensionResultItem,
  SelectedEpisodeInput,
  SelectedSourceEntryInput,
  ServerAdapterRuntime,
  ServerHostStreamOutcome,
  ServerStreamExecutionInput,
};

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MEGAPLAY_ENC_KEY = 'i?LMTAx0Q6,:}50U';
const MEGAPLAY_ENC_IV = "W0;27ToaUpl_P%'c";

export interface ResolveAnimeStreamParams {
  mediaId: string;
  titles: {
    overrideTitle?: string | null;
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    synonyms?: string[] | null;
  };
  format?: string | null;
  episodeNumber: number;
  serverId?: string;
  serverName?: string;
  category?: 'sub' | 'dub' | 'raw';
  audioLanguage?: StreamAudioLanguage;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  sourcePkg?: string;
  selectedSourceEntry?: SelectedSourceEntryInput | null;
  selectedEpisode?: SelectedEpisodeInput | null;
  bypassCache?: boolean;
}

export interface ResolvedAnimeStreamPayload {
  url: string;
  rawUrl: string;
  quality: string;
  isHls: boolean;
  serverName: string;
  provider: string;
  sourceId?: string;
  matchedTitle: string;
  matchedSlug: string;
  matchedEpisode: number;
  referer: string;
  subtitles: MappedSubtitleTrack[];
  availableAudios: ResolvedAvailableAudioOption[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  mirrors: Array<{
    url: string;
    quality: string;
    isHls: boolean;
    serverName: string;
  }>;
}

const resolvedStreamCache = new Map<
  string,
  { expiresAt: number; payload: ResolvedAnimeStreamPayload }
>();
const CACHE_TTL_MS = 5 * 60_000;

function padKeyBytes(str: string, len: number): Buffer {
  const buf = Buffer.alloc(len, 0);
  const src = Buffer.from(str, 'utf8');
  src.copy(buf, 0, 0, Math.min(len, src.length));
  return buf;
}

export function decryptMegaPlayEnc(enc: string): unknown {
  let b64 = String(enc || '')
    .trim()
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const mod = b64.length % 4;
  if (mod !== 0) {
    b64 += '===='.slice(mod);
  }
  const key = padKeyBytes(MEGAPLAY_ENC_KEY, 32);
  const iv = padKeyBytes(MEGAPLAY_ENC_IV, 16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(b64, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

async function fetchText(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 8500,
  maxRetries = 1,
): Promise<{
  status: number;
  ok: boolean;
  url: string;
  text: string;
  failureKind?: DiagnosticFailureKind;
  attempts?: number;
}> {
  const res = await reliableFetchText(url, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...headers,
    },
    timeoutMs,
    maxRetries,
    retryDelayMs: 60,
  });
  return {
    status: res.status,
    ok: res.ok,
    url: res.url,
    text: res.text,
    ...(res.failureKind ? { failureKind: res.failureKind } : {}),
    attempts: res.attempts,
  };
}

function normalizeHttpUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const resolved = new URL(rawUrl.trim().replace(/&amp;/g, '&'), baseUrl).toString();
    return isSafeExternalHttpUrl(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

async function searchGotakuPublicCatalog(
  host: string,
  query: string,
): Promise<{
  ok: boolean;
  candidates: GogoSearchCandidate[];
  status?: number;
  rawText?: string;
}> {
  const endpoint = `${host}/api/v1/titles?q=${encodeURIComponent(query)}&limit=24`;
  const res = await fetchText(
    endpoint,
    {
      Referer: `${host}/`,
      Accept: 'application/json, text/plain, */*',
    },
    7000,
  );
  if (!res.ok) {
    return { ok: false, candidates: [], status: res.status, rawText: res.text };
  }
  try {
    const parsed = JSON.parse(res.text) as { data?: unknown };
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.data)) {
      return { ok: false, candidates: [], status: res.status, rawText: res.text };
    }
    return {
      ok: true,
      candidates: parseGotakuTitleSearchJson(parsed, res.url || host),
      status: res.status,
    };
  } catch {
    return { ok: false, candidates: [], status: res.status, rawText: res.text };
  }
}

async function probeGotakuEpisodesSupport(
  host: string,
  sourceLabel: string,
  hrefOrSlug: string,
): Promise<{
  supported: boolean;
  reason: string;
  episodes: Array<{ sourceEpisodeId: string; number: number; title: string; episodeUrl: string }>;
}> {
  const unsupportedReason = `${sourceLabel} (${host}) supports title search via its public catalog API, but episode lists and video playback are protected by encrypted binary payloads and Turnstile, which are unsupported by this web adapter.`;
  const titleId = extractGotakuTitleId(hrefOrSlug);
  if (!titleId) {
    return { supported: false, reason: unsupportedReason, episodes: [] };
  }

  try {
    const res = await fetchText(
      `${host}/api/v1/titles/${encodeURIComponent(titleId)}/episodes`,
      {
        Referer: `${host}/title/${encodeURIComponent(titleId)}`,
        Accept: 'application/json, text/plain, */*',
      },
      6500,
    );
    if (!res.ok) {
      return { supported: false, reason: unsupportedReason, episodes: [] };
    }
    const parsed = JSON.parse(res.text) as { data?: unknown; episodes?: unknown };
    const rawList = Array.isArray(parsed?.data)
      ? parsed.data
      : Array.isArray(parsed?.episodes)
        ? parsed.episodes
        : null;
    if (!rawList) {
      return { supported: false, reason: unsupportedReason, episodes: [] };
    }

    const mapped = rawList
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const ep = row as Record<string, unknown>;
        const epId = typeof ep.id === 'string' || typeof ep.id === 'number' ? String(ep.id).trim() : '';
        const num = Number(ep.number ?? ep.episode_number ?? ep.ep);
        if (!epId || !Number.isFinite(num) || num < 0) return null;
        const rawTitle = typeof ep.name === 'string' ? ep.name.trim() : typeof ep.title === 'string' ? ep.title.trim() : '';
        return {
          sourceEpisodeId: epId,
          number: num,
          title: rawTitle || `Episode ${num}`,
          episodeUrl: `/title/${titleId}?ep=${num}`,
        };
      })
      .filter((item): item is { sourceEpisodeId: string; number: number; title: string; episodeUrl: string } => Boolean(item));

    if (mapped.length === 0) {
      return { supported: false, reason: unsupportedReason, episodes: [] };
    }
    return { supported: true, reason: '', episodes: mapped };
  } catch {
    return { supported: false, reason: unsupportedReason, episodes: [] };
  }
}

async function parseDooPlayAjaxEmbeds(
  html: string,
  episodePageUrl: string,
): Promise<GenericEmbedCandidate[]> {
  const embeds: GenericEmbedCandidate[] = [];
  const dooRe =
    /<li[^>]*class="[^"]*dooplay_player_option[^"]*"[^>]*>/gi;
  const matches: Array<{ post: string; nume: string; type: string; label: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = dooRe.exec(html)) !== null) {
    const tag = m[0];
    const post = tag.match(/data-post=["']([^"']+)["']/i)?.[1];
    const nume = tag.match(/data-nume=["']([^"']+)["']/i)?.[1];
    const type = tag.match(/data-type=["']([^"']+)["']/i)?.[1] || 'tv';
    if (!post || !nume || nume === 'trailer') continue;
    const chunk = html.slice(m.index, m.index + 320);
    const label = chunk
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    matches.push({ post, nume, type, label: label || `Server ${nume}` });
  }
  if (matches.length === 0) return embeds;

  let origin: string;
  try {
    origin = new URL(episodePageUrl).origin;
  } catch {
    return embeds;
  }

  for (const opt of matches.slice(0, 4)) {
    try {
      const form = new URLSearchParams({
        action: 'doo_player_ajax',
        post: opt.post,
        nume: opt.nume,
        type: opt.type,
      });
      const res = await fetch(`${origin}/wp-admin/admin-ajax.php`, {
        method: 'POST',
        headers: {
          'User-Agent': BROWSER_UA,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: episodePageUrl,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(6500),
      });
      if (!res.ok) continue;
      const rawText = await res.text();
      let embedUrl: string | null = null;
      try {
        const json = JSON.parse(rawText) as { embed_url?: string };
        if (json?.embed_url) {
          const iframeSrc = json.embed_url.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
          embedUrl = iframeSrc || json.embed_url;
        }
      } catch {
        embedUrl = rawText.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1] || null;
      }
      if (embedUrl) {
        const normalized = normalizeHttpUrl(embedUrl, episodePageUrl);
        if (normalized) {
          embeds.push({ label: opt.label, url: normalized });
        }
      }
    } catch {
      // Try next DooPlay player option
    }
  }

  return embeds;
}

function parseGogoSearchHtml(html: string): GogoSearchCandidate[] {
  const results: GogoSearchCandidate[] = [];
  const seen = new Set<string>();
  const re = /<p\s+class="name">\s*<a\s+href="([^"]+)"[^>]*title="([^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = match[1].trim();
    const title = match[2]
      .replace(/&amp;/g, '&')
      .replace(/&#039;/g, "'")
      .replace(/&rsquo;/g, '’')
      .replace(/&quot;/g, '"')
      .trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);
    results.push({ href, title });
  }
  return results;
}

function parseGogoEpisodeEmbeds(html: string, baseUrl: string): GenericEmbedCandidate[] {
  const embeds: GenericEmbedCandidate[] = [];
  const seen = new Set<string>();

  const liRe = /<li[^>]*>\s*<a[^>]*data-video="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = liRe.exec(html)) !== null) {
    const normalized = normalizeHttpUrl(match[1], baseUrl);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const labelRaw = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const label = labelRaw.split(' ')[0] || `Server ${embeds.length + 1}`;
    embeds.push({ label, url: normalized });
  }

  if (embeds.length === 0) {
    const fallbackRe = /data-video="([^"]+)"/gi;
    while ((match = fallbackRe.exec(html)) !== null) {
      const normalized = normalizeHttpUrl(match[1], baseUrl);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      embeds.push({ label: `Server ${embeds.length + 1}`, url: normalized });
    }
  }

  if (embeds.length === 0) {
    const iframeMatch = html.match(/<iframe[^>]+src="([^"]+newplayer\.php[^"]+)"/i);
    if (iframeMatch?.[1]) {
      const normalized = normalizeHttpUrl(iframeMatch[1], baseUrl);
      if (normalized) {
        embeds.push({ label: 'HD-1', url: normalized });
      }
    }
  }

  return embeds;
}

async function resolveEmbedIframeUrl(
  embedUrl: string,
  episodePageUrl: string,
): Promise<string | null> {
  if (!isSafeExternalHttpUrl(embedUrl)) return null;
  try {
    const parsed = new URL(embedUrl);
    if (parsed.hostname.includes('megaplay.buzz') || parsed.hostname.includes('vidwish.live')) {
      return embedUrl;
    }
    const page = await fetchText(embedUrl, { Referer: episodePageUrl }, 8000);
    if (!page.ok) return null;
    const iframeMatch = page.text.match(/<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/i);
    if (!iframeMatch?.[1]) return null;
    return normalizeHttpUrl(iframeMatch[1], page.url);
  } catch {
    return null;
  }
}

interface UnwrappedStreamMedia {
  streamUrl: string;
  referer: string;
  subtitles: MappedSubtitleTrack[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

async function resolveMegaPlayOrCompatibleIframe(
  iframeUrl: string,
  preferredCategory: 'sub' | 'dub' | 'raw',
  embedReferer: string,
): Promise<UnwrappedStreamMedia | null> {
  if (!isSafeExternalHttpUrl(iframeUrl)) return null;

  // Adjust /sub vs /dub path cleanly if compatible stream player
  let candidateUrl = iframeUrl;
  if (preferredCategory === 'dub' && /\/sub(?:[?#]|$)/i.test(candidateUrl)) {
    candidateUrl = candidateUrl.replace(/\/sub([?#]|$)/i, '/dub$1');
  } else if (preferredCategory === 'sub' && /\/dub(?:[?#]|$)/i.test(candidateUrl)) {
    candidateUrl = candidateUrl.replace(/\/dub([?#]|$)/i, '/sub$1');
  }

  const attempt = async (targetUrl: string): Promise<UnwrappedStreamMedia | null> => {
    const parsed = new URL(targetUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;
    const res = await fetchText(targetUrl, { Referer: embedReferer }, 8500);
    if (!res.ok) return null;

    const dataId =
      res.text.match(/data-id=["']([^"']+)["']/i)?.[1] ||
      res.text.match(/data-realid=["']([^"']+)["']/i)?.[1];
    if (!dataId) return null;

    const getSourcesUrl = `${origin}/stream/getSources?id=${encodeURIComponent(dataId)}`;
    const srcRes = await fetchText(
      getSourcesUrl,
      {
        Referer: targetUrl,
        Origin: origin,
        'X-Requested-With': 'XMLHttpRequest',
        Accept: 'application/json, text/plain, */*',
      },
      8500,
    );
    if (!srcRes.ok) return null;

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(srcRes.text) as Record<string, unknown>;
    } catch {
      return null;
    }

    let decrypted: unknown = json.sources ?? null;
    if (!decrypted && typeof json.enc === 'string' && json.enc.trim()) {
      try {
        decrypted = decryptMegaPlayEnc(json.enc);
      } catch {
        return null;
      }
    }

    const rawStreamUrl = extractMegaPlayStreamUrl(decrypted);
    if (!rawStreamUrl || !isSafeExternalHttpUrl(rawStreamUrl)) return null;

    const refererHeader = `${origin}/`;
    const subtitles = mapSubtitleTracksFromSources(
      Array.isArray(json.tracks) ? json.tracks : [],
      '/api/stream/proxy',
      refererHeader,
    );

    const parseInterval = (raw: unknown): { start: number; end: number } | null => {
      if (!raw || typeof raw !== 'object') return null;
      const obj = raw as Record<string, unknown>;
      const start = Number(obj.start);
      const end = Number(obj.end);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        return { start, end };
      }
      return null;
    };

    return {
      streamUrl: rawStreamUrl,
      referer: refererHeader,
      subtitles,
      intro: parseInterval(json.intro),
      outro: parseInterval(json.outro),
    };
  };

  return attempt(candidateUrl);
}

/**
 * Resolves either a MegaPlay/VidWish encrypted iframe OR a generic HTML5/HLS/MP4 embed
 * (supporting Dean Edwards packer obfuscation and 1 nested iframe redirect).
 */
async function unwrapGenericOrCompatibleEmbed(
  embedUrl: string,
  episodePageUrl: string,
  effectiveCategory: 'sub' | 'dub' | 'raw',
  allowFallbackToSub: boolean,
): Promise<UnwrappedStreamMedia | null> {
  if (!isSafeExternalHttpUrl(embedUrl)) return null;

  // If URL is already a direct video/playlist URL
  if (/\.(?:m3u8|mp4)(?:\?|$)/i.test(embedUrl)) {
    return {
      streamUrl: embedUrl,
      referer: episodePageUrl,
      subtitles: [],
      intro: null,
      outro: null,
    };
  }

  const iframeUrl = await resolveEmbedIframeUrl(embedUrl, episodePageUrl);
  if (iframeUrl) {
    let mediaData = await resolveMegaPlayOrCompatibleIframe(
      iframeUrl,
      effectiveCategory,
      embedUrl,
    );
    if (!mediaData && allowFallbackToSub && effectiveCategory === 'dub') {
      mediaData = await resolveMegaPlayOrCompatibleIframe(iframeUrl, 'sub', embedUrl);
    }
    if (mediaData) return mediaData;
  }

  // Fallback: inspect embed HTML (and nested iframe HTML if any) for direct m3u8 / mp4 sources
  const visited = new Set<string>();
  const urlsToInspect = [embedUrl];
  if (iframeUrl && iframeUrl !== embedUrl) {
    urlsToInspect.push(iframeUrl);
  }

  for (const targetUrl of urlsToInspect) {
    if (visited.has(targetUrl) || !isSafeExternalHttpUrl(targetUrl)) continue;
    visited.add(targetUrl);
    try {
      const res = await fetchText(targetUrl, { Referer: episodePageUrl }, 8000);
      if (!res.ok) continue;

      const direct = extractDirectVideoUrlFromHtmlOrScript(res.text, res.url);
      if (direct && isSafeExternalHttpUrl(direct)) {
        const origin = new URL(res.url).origin + '/';
        return {
          streamUrl: direct,
          referer: origin,
          subtitles: [],
          intro: null,
          outro: null,
        };
      }

      // Check 1 nested iframe hop
      const nestedIframe = res.text.match(/<iframe[^>]+(?:data-src|src)=["']([^"']+)["']/i)?.[1];
      if (nestedIframe) {
        const nestedAbs = normalizeHttpUrl(nestedIframe, res.url);
        if (nestedAbs && !visited.has(nestedAbs)) {
          const nestedRes = await fetchText(nestedAbs, { Referer: res.url }, 8000);
          if (nestedRes.ok) {
            const nestedDirect = extractDirectVideoUrlFromHtmlOrScript(
              nestedRes.text,
              nestedRes.url,
            );
            if (nestedDirect && isSafeExternalHttpUrl(nestedDirect)) {
              const origin = new URL(nestedRes.url).origin + '/';
              return {
                streamUrl: nestedDirect,
                referer: origin,
                subtitles: [],
                intro: null,
                outro: null,
              };
            }
          }
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return null;
}

function classifyHttpResponseFailure(
  res: { status: number; text: string; failureKind?: DiagnosticFailureKind },
  hostUrl: string,
): HostQueryFailure {
  const isBlocked =
    res.status === 403 ||
    res.status === 429 ||
    res.status === 503 ||
    looksLikeBlockedChallengeHtml(res.status, res.text) ||
    res.failureKind === 'blocked_request';

  return {
    failureKind: isBlocked
      ? 'blocked_request'
      : res.failureKind || classifyDiagnosticFailure(`HTTP ${res.status}`, res.status),
    message: isBlocked
      ? `Upstream host (${hostUrl}) blocked access or returned an anti-bot challenge (HTTP ${res.status}).`
      : `Upstream host (${hostUrl}) returned HTTP ${res.status}.`,
    status: res.status,
  };
}

async function searchGogoAcrossQueries(
  host: string,
  queries: string[],
  targetTitles: string[],
  category: 'sub' | 'dub' | 'raw',
  format?: string | null,
  audioLanguage?: StreamAudioLanguage,
  onFailure?: (failure: HostQueryFailure) => void,
): Promise<Array<GogoSearchCandidate & { score: number }>> {
  const allCandidates = new Map<string, GogoSearchCandidate>();
  const querySubset =
    audioLanguage === 'hi' || audioLanguage === 'es' ? queries.slice(0, 3) : queries;

  const rankViable = (items: Iterable<GogoSearchCandidate>) =>
    Array.from(items)
      .filter((c) => isViableTitleMatch(c, targetTitles, format))
      .map((c) => ({
        ...c,
        score: scoreGogoSearchCandidate(c, {
          titles: targetTitles,
          category,
          format,
          audioLanguage,
        }),
      }))
      .sort((a, b) => b.score - a.score);

  for (let qIdx = 0; qIdx < querySubset.length; qIdx++) {
    const query = querySubset[qIdx];
    try {
      const searchUrl = `${host}/search.html?keyword=${encodeURIComponent(query)}`;
      const res = await fetchText(searchUrl, { Referer: `${host}/` }, 6500);
      if (!res.ok) {
        const failure = classifyHttpResponseFailure(res, host);
        onFailure?.(failure);
        if (failure.failureKind === 'blocked_request') {
          break;
        }
        continue;
      }

      const parsed = parseGogoSearchHtml(res.text);
      for (const item of parsed) {
        if (!allCandidates.has(item.href)) {
          allCandidates.set(item.href, item);
        }
      }

      if (allCandidates.size > 0) {
        const rankedNow = rankViable(allCandidates.values());
        if (audioLanguage === 'hi' || audioLanguage === 'es') {
          const hasExplicitLangCandidate = rankedNow.some((c) =>
            candidateMatchesAudioLanguage(c, audioLanguage),
          );
          if (hasExplicitLangCandidate && rankedNow[0] && rankedNow[0].score >= 120) {
            return rankedNow;
          }
          if (qIdx >= 1 && rankedNow.length > 0) {
            return rankedNow;
          }
        } else if (rankedNow[0] && rankedNow[0].score >= 85) {
          return rankedNow;
        }
      }
    } catch (err) {
      const classified = classifyFetchException(err);
      onFailure?.({
        failureKind: classified.failureKind,
        message: classified.message || `Failed to query ${host}.`,
      });
      if (
        classified.failureKind === 'timeout' ||
        classified.failureKind === 'network_error' ||
        classified.failureKind === 'blocked_request'
      ) {
        break;
      }
    }
  }

  return rankViable(allCandidates.values());
}

async function searchGenericSiteAcrossQueries(
  host: string,
  queries: string[],
  targetTitles: string[],
  category: 'sub' | 'dub' | 'raw',
  format?: string | null,
  audioLanguage?: StreamAudioLanguage,
  onFailure?: (failure: HostQueryFailure) => void,
): Promise<Array<GogoSearchCandidate & { score: number }>> {
  const allCandidates = new Map<string, GogoSearchCandidate>();

  const rankViable = (items: Iterable<GogoSearchCandidate>) =>
    Array.from(items)
      .filter((c) => isViableTitleMatch(c, targetTitles, format))
      .map((c) => ({
        ...c,
        score: scoreGogoSearchCandidate(c, {
          titles: targetTitles,
          category,
          format,
          audioLanguage,
        }),
      }))
      .sort((a, b) => b.score - a.score);

  let hostUnavailable = false;
  for (const query of queries.slice(0, 5)) {
    if (hostUnavailable) break;

    const searchEndpoints = [
      `${host}/?s=${encodeURIComponent(query)}`,
      `${host}/search.html?keyword=${encodeURIComponent(query)}`,
      `${host}/search?keyword=${encodeURIComponent(query)}`,
      `${host}/search?q=${encodeURIComponent(query)}`,
      `${host}/search/${encodeURIComponent(query)}/`,
    ];

    let foundOnAnyHtmlEndpoint = false;
    for (const endpoint of searchEndpoints) {
      try {
        const res = await fetchText(endpoint, { Referer: `${host}/` }, 6000);
        if (!res.ok) {
          const failure = classifyHttpResponseFailure(res, host);
          onFailure?.(failure);
          if (failure.failureKind === 'blocked_request') {
            hostUnavailable = true;
            break;
          }
          continue;
        }

        const gogoItems = parseGogoSearchHtml(res.text);
        const genericItems = parseGenericSearchHtml(res.text, res.url || host);
        const merged = [...gogoItems, ...genericItems];
        for (const item of merged) {
          if (!allCandidates.has(item.href)) {
            allCandidates.set(item.href, item);
          }
        }
        if (merged.length > 0) {
          foundOnAnyHtmlEndpoint = true;
          break;
        }
      } catch (err) {
        const classified = classifyFetchException(err);
        onFailure?.({
          failureKind: classified.failureKind,
          message: classified.message || `Failed to query ${host}.`,
        });
        if (
          classified.failureKind === 'timeout' ||
          classified.failureKind === 'network_error' ||
          classified.failureKind === 'blocked_request'
        ) {
          hostUnavailable = true;
          break;
        }
      }
    }

    if (hostUnavailable) break;

    // Fallback: WordPress REST search API when HTML search is SPA/JS-rendered
    if (!foundOnAnyHtmlEndpoint) {
      try {
        const wpRes = await fetchText(
          `${host}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=10`,
          { Referer: `${host}/`, Accept: 'application/json' },
          5000,
        );
        if (wpRes.ok) {
          const wpJson = JSON.parse(wpRes.text) as Array<{ url?: string; title?: string }>;
          if (Array.isArray(wpJson)) {
            for (const row of wpJson) {
              if (!row?.url || !row?.title) continue;
              try {
                const u = new URL(row.url);
                const href = `${u.pathname}${u.search}`;
                if (!allCandidates.has(href)) {
                  allCandidates.set(href, { href, title: row.title });
                }
              } catch {
                // Skip invalid URL
              }
            }
          }
        }
      } catch {
        // WP REST API unavailable on this host
      }
    }

    if (allCandidates.size > 0 && audioLanguage !== 'hi' && audioLanguage !== 'es') {
      const rankedNow = rankViable(allCandidates.values());
      if (rankedNow[0] && rankedNow[0].score >= 100) {
        return rankedNow;
      }
    }
  }

  return rankViable(allCandidates.values());
}

async function resolveEpisodePageUrls(
  host: string,
  slug: string,
  episodeNumber: number,
  candidateHref?: string,
): Promise<string[]> {
  const candidates: string[] = [];
  const pushUrl = (u: string) => {
    if (!candidates.includes(u)) candidates.push(u);
  };

  const epNumStr = Number.isInteger(episodeNumber)
    ? String(episodeNumber)
    : String(episodeNumber).replace('.', '-');
  pushUrl(`${host}/${slug}-episode-${epNumStr}`);

  // Inspect either /category/{slug} or the candidate's actual series page URL
  const seriesUrls = candidateHref
    ? Array.from(
        new Set([
          normalizeHttpUrl(candidateHref, host) || `${host}/category/${slug}`,
          `${host}/category/${slug}`,
        ]),
      )
    : [`${host}/category/${slug}`];

  for (const seriesUrl of seriesUrls) {
    try {
      const catRes = await fetchText(seriesUrl, { Referer: `${host}/` }, 6500);
      if (!catRes.ok) continue;
      const html = catRes.text;

      // Generic episode anchor matching (handles WordPress / DooPlay / AnimeStream / custom extensions)
      const genericLinks = parseGenericEpisodeLinks(html, catRes.url || host, episodeNumber);
      for (const link of genericLinks.slice(0, 3)) {
        pushUrl(link);
      }

      // Gogo inline & AJAX episode list
      const inlineMatches = [...html.matchAll(/href="\s*(\/[^"]+-episode-[0-9.-]+)\s*"/gi)].map(
        (m) => m[1].trim(),
      );
      const targetMatch = inlineMatches.find((href) =>
        new RegExp(`-episode-${epNumStr}(?:$|\\?)`, 'i').test(href),
      );
      if (targetMatch) {
        pushUrl(`${host}${targetMatch.startsWith('/') ? '' : '/'}${targetMatch}`);
      }

      const movieId =
        html.match(/id="movie_id"[^>]*value="([^"]+)"/i)?.[1] ||
        html.match(/value="([^"]+)"[^>]*id="movie_id"/i)?.[1];
      if (movieId && !targetMatch) {
        const start = Math.max(0, Math.floor(episodeNumber) - 5);
        const end = Math.max(start + 100, Math.floor(episodeNumber) + 15);
        const ajaxRes = await fetchText(
          `${host}/ajax/load-list-episode?ep_start=${start}&ep_end=${end}&id=${encodeURIComponent(movieId)}`,
          { Referer: seriesUrl },
          6500,
        );
        if (ajaxRes.ok) {
          const ajaxMatches = [
            ...ajaxRes.text.matchAll(/href="\s*(\/[^"]+-episode-[0-9.-]+)\s*"/gi),
          ].map((m) => m[1].trim());
          const exactAjax = ajaxMatches.find((href) =>
            new RegExp(`-episode-${epNumStr}(?:$|\\?)`, 'i').test(href),
          );
          if (exactAjax) {
            const fixed = exactAjax.startsWith('/-episode-')
              ? `/${slug}${exactAjax.slice(1)}`
              : exactAjax;
            pushUrl(`${host}${fixed.startsWith('/') ? '' : '/'}${fixed}`);
          } else if (episodeNumber === 1 && ajaxMatches[ajaxMatches.length - 1]) {
            const firstHref = ajaxMatches[ajaxMatches.length - 1];
            const fixed = firstHref.startsWith('/-episode-')
              ? `/${slug}${firstHref.slice(1)}`
              : firstHref;
            pushUrl(`${host}${fixed.startsWith('/') ? '' : '/'}${fixed}`);
          }
        }
      }

      // If the series page itself embeds the player directly (e.g. movies or single-episode pages)
      if (parseGenericEmbedCandidates(html, catRes.url || seriesUrl).length > 0 && episodeNumber === 1) {
        pushUrl(catRes.url || seriesUrl);
      }
    } catch {
      // Keep direct URL candidate
    }
  }

  return candidates;
}

function candidateMatchesAudioLanguage(
  candidate: { href: string; title: string },
  audioLanguage: StreamAudioLanguage,
  sourceMeta?: { sourceLang?: string; sourceName?: string; sourceBaseUrl?: string },
): boolean {
  if (
    isSourceInherentLanguage(
      sourceMeta?.sourceLang,
      sourceMeta?.sourceName,
      sourceMeta?.sourceBaseUrl,
      audioLanguage,
    )
  ) {
    return true;
  }
  const text = `${candidate.href} ${candidate.title}`.toLowerCase();
  if (audioLanguage === 'hi') {
    return /\bhindi\b|\bhin\b|\bmulti[\s-]?audio\b|\bdual[\s-]?audio\b/i.test(text);
  }
  if (audioLanguage === 'es') {
    return /\bspanish\b|\bespanol\b|\bespañol\b|\blatino\b|\bcastellano\b|\bmulti[\s-]?audio\b/i.test(
      text,
    );
  }
  return true;
}

function embedsMatchAudioLanguage(
  embeds: GenericEmbedCandidate[],
  audioLanguage: StreamAudioLanguage,
): boolean {
  if (audioLanguage !== 'hi' && audioLanguage !== 'es') return true;
  return embeds.some(
    (e) =>
      e.langHint === audioLanguage ||
      e.langHint === 'multi' ||
      (audioLanguage === 'hi' && /\bhindi\b|\bhin\b/i.test(`${e.label} ${e.url}`)) ||
      (audioLanguage === 'es' &&
        /\bspanish\b|\bespanol\b|\blatino\b|\bcastellano\b/i.test(`${e.label} ${e.url}`)),
  );
}

function getAudioLanguageDisplayName(code: StreamAudioLanguage): string {
  switch (code) {
    case 'hi':
      return 'Hindi (Dub)';
    case 'es':
      return 'Spanish (Dub)';
    case 'en':
      return 'English (Dub)';
    case 'ja':
    default:
      return 'Japanese (Original)';
  }
}

function finalizePayload(input: {
  resolvedMirrors: Array<UnwrappedStreamMedia & { label: string }>;
  candidates: Array<{ href: string; title: string }>;
  targetTitles: string[];
  effectiveCategory: 'sub' | 'dub' | 'raw';
  requestedAudioLang: StreamAudioLanguage;
  hasDubProbe: boolean;
  candidateTitle: string;
  slug: string;
  episodeNumber: number;
  serverNameParam?: string;
  sourceLabel: string;
  sourceId?: string;
  sourceLang?: string;
  sourceBaseUrl?: string;
  fallbackQueryTitle: string;
  embedLangHints?: Array<string | undefined>;
  explicitServerTypes?: Array<string | undefined>;
}): ResolvedAnimeStreamPayload {
  const primary = input.resolvedMirrors[0];
  const isHls =
    /\.m3u8(?:$|\?)/i.test(primary.streamUrl) || !/\.mp4(?:$|\?)/i.test(primary.streamUrl);
  const proxiedUrl = buildStreamProxyUrl(
    primary.streamUrl,
    '/api/stream/proxy',
    primary.referer,
  );

  const availableAudios = detectAvailableAudiosFromSources({
    candidates: input.candidates,
    targetTitles: input.targetTitles,
    currentCategory: input.effectiveCategory,
    currentAudioLanguage: input.requestedAudioLang,
    hasDubProbe: input.hasDubProbe,
    embedLangHints: input.embedLangHints,
    explicitServerTypes: input.explicitServerTypes,
    sourceLang: input.sourceLang,
    sourceName: input.sourceLabel,
    sourceBaseUrl: input.sourceBaseUrl,
  });

  if (
    input.requestedAudioLang === 'hi' &&
    !availableAudios.some((a) => a.code === 'hi')
  ) {
    const inherentHi = isSourceInherentLanguage(
      input.sourceLang,
      input.sourceLabel,
      input.sourceBaseUrl,
      'hi',
    );
    availableAudios.push({
      code: 'hi',
      shortLabel: 'HI',
      label: 'Hindi (Dub)',
      serverCategory: 'dub',
      evidence: inherentHi ? 'confirmed' : 'inferred',
    });
  }

  if (
    input.requestedAudioLang === 'es' &&
    !availableAudios.some((a) => a.code === 'es')
  ) {
    const inherentEs = isSourceInherentLanguage(
      input.sourceLang,
      input.sourceLabel,
      input.sourceBaseUrl,
      'es',
    );
    availableAudios.push({
      code: 'es',
      shortLabel: 'ES',
      label: 'Spanish (Dub)',
      serverCategory: 'dub',
      evidence: inherentEs ? 'confirmed' : 'inferred',
    });
  }

  return {
    url: proxiedUrl,
    rawUrl: primary.streamUrl,
    quality: isHls ? '1080p HLS' : '720p MP4',
    isHls,
    serverName:
      input.serverNameParam ||
      `${input.sourceLabel} · ${primary.label} (${input.requestedAudioLang.toUpperCase()})`,
    provider: input.sourceLabel,
    sourceId: input.sourceId || 'shonenx-hls-inbuilt',
    matchedTitle: input.candidateTitle || input.fallbackQueryTitle,
    matchedSlug: input.slug,
    matchedEpisode: input.episodeNumber,
    referer: primary.referer,
    subtitles: primary.subtitles,
    availableAudios,
    intro: primary.intro,
    outro: primary.outro,
    mirrors: input.resolvedMirrors.map((m) => {
      const mIsHls =
        /\.m3u8(?:$|\?)/i.test(m.streamUrl) || !/\.mp4(?:$|\?)/i.test(m.streamUrl);
      return {
        url: buildStreamProxyUrl(m.streamUrl, '/api/stream/proxy', m.referer),
        quality: mIsHls ? '1080p HLS' : '720p MP4',
        isHls: mIsHls,
        serverName: `${m.label} (${input.requestedAudioLang.toUpperCase()})`,
      };
    }),
  };
}

/**
 * Resolves streams from HiAnime-compatible JSON AJAX providers (/ajax/v2/episode/*).
 */
async function resolveViaHiAnimeHost(input: {
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
}): Promise<ResolvedAnimeStreamPayload | null> {
  if (input.requestedAudioLang === 'hi' || input.requestedAudioLang === 'es') {
    const inherent = isSourceInherentLanguage(
      input.sourceLang,
      input.sourceLabel,
      input.sourceBaseUrl,
      input.requestedAudioLang,
    );
    if (!inherent) {
      throw new Error(
        `${getAudioLanguageDisplayName(input.requestedAudioLang)} audio is not supported on ${input.sourceLabel}. Choose Japanese (Original) or English (Dub), or switch to a Hindi/Spanish extension.`,
      );
    }
  }

  const reqTimeoutMs = input.timeoutMs ?? 7000;
  const reqMaxRetries = input.maxRetries ?? 1;
  let ranked: Array<GogoSearchCandidate & { score?: number }>;

  if (input.directCandidate?.href) {
    ranked = [input.directCandidate];
  } else {
    const allCandidates = new Map<string, GogoSearchCandidate>();
    for (const query of input.queries.slice(0, 4)) {
      try {
        const res = await fetchText(
          `${input.host}/search?keyword=${encodeURIComponent(query)}`,
          { Referer: `${input.host}/` },
          reqTimeoutMs,
          reqMaxRetries,
        );
        if (!res.ok) {
          const failure = classifyHttpResponseFailure(res, input.host);
          input.onFailure?.(failure);
          if (failure.failureKind === 'blocked_request') {
            break;
          }
          continue;
        }
        const parsed = parseGenericSearchHtml(res.text, input.host);
        for (const item of parsed) {
          if (!allCandidates.has(item.href)) {
            allCandidates.set(item.href, item);
          }
        }
        const viableCount = Array.from(allCandidates.values()).filter((c) =>
          isViableTitleMatch(c, input.targetTitles, input.format),
        ).length;
        if (viableCount > 0) break;
      } catch (err) {
        const classified = classifyFetchException(err);
        input.onFailure?.({
          failureKind: classified.failureKind,
          message: classified.message || `Failed to search ${input.host}.`,
        });
        if (
          classified.failureKind === 'timeout' ||
          classified.failureKind === 'network_error' ||
          classified.failureKind === 'blocked_request'
        ) {
          break;
        }
      }
    }

    if (allCandidates.size === 0) return null;

    ranked = Array.from(allCandidates.values())
      .filter((c) => isViableTitleMatch(c, input.targetTitles, input.format))
      .map((c) => ({
        ...c,
        score: scoreGogoSearchCandidate(c, {
          titles: input.targetTitles,
          category: input.effectiveCategory,
          format: input.format,
          audioLanguage: input.requestedAudioLang,
        }),
      }))
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) return null;
  }

  for (const candidate of ranked.slice(0, 3)) {
    const directEpDataId =
      (input.directEpisode?.sourceEpisodeId && /^\d+$/.test(input.directEpisode.sourceEpisodeId.trim())
        ? input.directEpisode.sourceEpisodeId.trim()
        : null) ||
      input.directEpisode?.episodeUrl?.match(/[?&]ep=(\d+)/i)?.[1] ||
      null;

    try {
      let epDataId = directEpDataId;

      if (!epDataId) {
        const idMatch = candidate.href.match(/-(\d+)(?:\?|$|\/)/);
        const animeNumericId = idMatch?.[1];
        if (!animeNumericId) continue;

        const epListRes = await fetchText(
          `${input.host}/ajax/v2/episode/list/${animeNumericId}`,
          {
            Referer: `${input.host}${candidate.href}`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          reqTimeoutMs,
          reqMaxRetries,
        );
        if (!epListRes.ok) {
          const failure = classifyHttpResponseFailure(epListRes, input.host);
          input.onFailure?.(failure);
          if (failure.failureKind === 'blocked_request') break;
          continue;
        }
        const epListJson = JSON.parse(epListRes.text) as { html?: string };
        const epListHtml = epListJson?.html || '';
        if (!epListHtml) continue;

        const epMatch =
          epListHtml.match(
            new RegExp(
              `data-number=["']${input.episodeNumber}["'][^>]*data-id=["'](\\d+)["']`,
              'i',
            ),
          ) ||
          epListHtml.match(
            new RegExp(
              `data-id=["'](\\d+)["'][^>]*data-number=["']${input.episodeNumber}["']`,
              'i',
            ),
          );
        epDataId = epMatch?.[1] || null;
      }

      if (!epDataId) continue;

      const serversRes = await fetchText(
        `${input.host}/ajax/v2/episode/servers?episodeId=${encodeURIComponent(epDataId)}`,
        {
          Referer: `${input.host}${candidate.href}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        reqTimeoutMs,
        reqMaxRetries,
      );
      if (!serversRes.ok) {
        const failure = classifyHttpResponseFailure(serversRes, input.host);
        input.onFailure?.(failure);
        if (failure.failureKind === 'blocked_request') break;
        continue;
      }
      const serversJson = JSON.parse(serversRes.text) as { html?: string };
      const serversHtml = serversJson?.html || '';
      if (!serversHtml) continue;

      const serverItems: Array<{
        type: string;
        dataId: string;
        label: string;
      }> = [];
      const srvRe =
        /<div[^>]*class="[^"]*server-item[^"]*"[^>]*data-type="([^"]+)"[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)<\/div>/gi;
      let sm: RegExpExecArray | null;
      while ((sm = srvRe.exec(serversHtml)) !== null) {
        serverItems.push({
          type: sm[1].toLowerCase(),
          dataId: sm[2],
          label: sm[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'HD-1',
        });
      }

      const matchingServers = serverItems.filter(
        (s) => s.type === input.effectiveCategory || (input.effectiveCategory === 'sub' && s.type === 'raw'),
      );
      const hasDubProbe = serverItems.some((s) => s.type === 'dub');

      if (matchingServers.length === 0) {
        continue;
      }

      const preferHd2 =
        input.serverId === 'hd-2-sub' || /hd-2/i.test(input.serverName || '');
      const ordered =
        preferHd2 && matchingServers.length > 1
          ? [matchingServers[1], matchingServers[0], ...matchingServers.slice(2)]
          : matchingServers;

      const resolvedMirrors: Array<UnwrappedStreamMedia & { label: string }> = [];
      for (const srv of ordered.slice(0, 3)) {
        const srcRes = await fetchText(
          `${input.host}/ajax/v2/episode/sources?id=${encodeURIComponent(srv.dataId)}`,
          {
            Referer: `${input.host}${candidate.href}`,
            'X-Requested-With': 'XMLHttpRequest',
          },
          7500,
        );
        if (!srcRes.ok) continue;
        const srcJson = JSON.parse(srcRes.text) as { link?: string };
        if (!srcJson?.link) continue;

        const mediaData = await unwrapGenericOrCompatibleEmbed(
          srcJson.link,
          `${input.host}${candidate.href}`,
          input.effectiveCategory,
          false,
        );
        if (mediaData) {
          resolvedMirrors.push({ ...mediaData, label: srv.label });
          if (resolvedMirrors.length >= 2) break;
        }
      }

      if (resolvedMirrors.length > 0) {
        return finalizePayload({
          resolvedMirrors,
          candidates: ranked,
          targetTitles: input.targetTitles,
          effectiveCategory: input.effectiveCategory,
          requestedAudioLang: input.requestedAudioLang,
          hasDubProbe,
          candidateTitle: candidate.title,
          slug: extractSlugFromGogoHref(candidate.href),
          episodeNumber: input.episodeNumber,
          serverNameParam: input.serverName,
          sourceLabel: input.sourceLabel,
          sourceId: input.sourceId,
          sourceLang: input.sourceLang,
          sourceBaseUrl: input.sourceBaseUrl,
          fallbackQueryTitle: input.queries[0],
          explicitServerTypes: serverItems.map((s) => s.type),
        });
      }
    } catch (err) {
      if (err instanceof UpstreamFetchError) {
        throw err;
      }
      if (err instanceof SyntaxError) {
        throw new UpstreamFetchError({
          message: `Malformed JSON response from ${input.sourceLabel}`,
          failureKind: 'malformed_response',
          url: input.host,
          retryable: false,
          attempts: 1,
        });
      }
      // Try next candidate or host
    }
  }

  return null;
}

async function resolveHostBasedCandidatesStream(
  host: string,
  candidates: Array<GogoSearchCandidate & { score?: number }>,
  input: ServerStreamExecutionInput,
  options: {
    allowDooPlayAjax: boolean;
    allowHiAnimeClone: boolean;
    breakOnMissingLanguage: boolean;
  },
): Promise<ServerHostStreamOutcome<ResolvedAnimeStreamPayload>> {
  const {
    queries,
    targetTitles,
    episodeNumber: effectiveEpisodeNum,
    effectiveCategory,
    requestedAudioLang,
    serverId,
    serverName,
    sourceId,
    sourceName,
    sourceBaseUrl,
    sourceLang,
    directSelectedCandidate,
    validSelectedEntry,
    validSelectedEpisode,
  } = input;
  const sourceLabel = sourceName || sourceId || 'ShizuTv Stream (Inbuilt)';

  const requiresStrictAudioMatch =
    requestedAudioLang === 'hi' || requestedAudioLang === 'es';
  const sourceInherentlyMatchesRequested = isSourceInherentLanguage(
    sourceLang,
    sourceName,
    sourceBaseUrl,
    requestedAudioLang,
  );

  const matchingAudioCandidates = requiresStrictAudioMatch
    ? candidates.filter((c) =>
        candidateMatchesAudioLanguage(c, requestedAudioLang, {
          sourceLang,
          sourceName,
          sourceBaseUrl,
        }),
      )
    : candidates;

  const slugsToTry = directSelectedCandidate
    ? candidates
    : requiresStrictAudioMatch && !sourceInherentlyMatchesRequested
      ? matchingAudioCandidates.length > 0
        ? matchingAudioCandidates.slice(0, 2)
        : candidates.slice(0, 1)
      : candidates.slice(0, 4);

  let sawCandidatesWithoutRequestedLanguage = false;
  let lastHostError: string | undefined;
  let lastFailureKind: DiagnosticFailureKind | undefined;
  let lastStatus: number | undefined;

  for (const candidate of slugsToTry) {
    const slug =
      (validSelectedEntry?.slug && candidate.href === validSelectedEntry.href
        ? validSelectedEntry.slug
        : '') ||
      validSelectedEpisode?.sourceAnimeSlug ||
      extractSlugFromGogoHref(candidate.href);
    if (!slug) continue;

    // Support HiAnime-style hosts when a custom extension is a HiAnime clone
    if (options.allowHiAnimeClone && /-\d+(?:\?|$)/.test(candidate.href)) {
      const hiCustom = await resolveViaHiAnimeHost({
        host,
        queries,
        targetTitles,
        format: input.format,
        episodeNumber: effectiveEpisodeNum,
        effectiveCategory,
        requestedAudioLang,
        serverId,
        serverName,
        sourceLabel,
        sourceId,
        sourceLang,
        sourceBaseUrl,
        directCandidate: directSelectedCandidate,
        directEpisode: validSelectedEpisode,
        onFailure: (failure) => {
          lastFailureKind = failure.failureKind;
          lastHostError = failure.message;
          if (failure.status !== undefined) lastStatus = failure.status;
        },
      }).catch((err) => {
        const classified = classifyFetchException(err);
        lastFailureKind = classified.failureKind;
        lastHostError = classified.message || (err instanceof Error ? err.message : String(err));
        return null;
      });
      if (hiCustom) {
        return { payload: hiCustom };
      }
    }

    const directEpisodePageUrl = validSelectedEpisode?.episodeUrl
      ? normalizeHttpUrl(validSelectedEpisode.episodeUrl, host)
      : null;
    const episodeUrls = directEpisodePageUrl
      ? [directEpisodePageUrl]
      : await resolveEpisodePageUrls(host, slug, effectiveEpisodeNum, candidate.href);

    for (const epUrl of episodeUrls) {
      let epHtml = '';
      let resolvedEpUrl = epUrl;
      try {
        const epRes = await fetchText(epUrl, { Referer: `${host}/` }, 7000);
        if (!epRes.ok) {
          if (epRes.status !== 404) {
            const failure = classifyHttpResponseFailure(epRes, epUrl);
            lastHostError = `HTTP ${epRes.status} from ${epUrl}`;
            lastFailureKind = failure.failureKind;
            lastStatus = epRes.status;
            if (failure.failureKind === 'blocked_request') {
              break;
            }
          }
          continue;
        }
        epHtml = epRes.text;
        resolvedEpUrl = epRes.url || epUrl;
      } catch (err) {
        const classified = classifyFetchException(err);
        lastHostError = err instanceof Error ? err.message : String(err);
        lastFailureKind = classified.failureKind;
        continue;
      }

      const gogoEmbeds = parseGogoEpisodeEmbeds(epHtml, resolvedEpUrl);
      const genericEmbeds = parseGenericEmbedCandidates(epHtml, resolvedEpUrl);
      const dooEmbeds =
        gogoEmbeds.length === 0 && genericEmbeds.length === 0 && options.allowDooPlayAjax
          ? await parseDooPlayAjaxEmbeds(epHtml, resolvedEpUrl)
          : [];
      const combinedEmbeds: GenericEmbedCandidate[] = [];
      const seenEmbedUrls = new Set<string>();
      for (const emb of [...gogoEmbeds, ...genericEmbeds, ...dooEmbeds]) {
        if (!seenEmbedUrls.has(emb.url)) {
          seenEmbedUrls.add(emb.url);
          combinedEmbeds.push(emb);
        }
      }

      // Check if episode HTML directly embeds an m3u8 / mp4 URL
      if (combinedEmbeds.length === 0) {
        const directInline = extractDirectVideoUrlFromHtmlOrScript(epHtml, resolvedEpUrl);
        if (directInline && isSafeExternalHttpUrl(directInline)) {
          const origin = new URL(resolvedEpUrl).origin + '/';
          const directPayload = finalizePayload({
            resolvedMirrors: [
              {
                streamUrl: directInline,
                referer: origin,
                subtitles: [],
                intro: null,
                outro: null,
                label: 'Direct',
              },
            ],
            candidates,
            targetTitles,
            effectiveCategory,
            requestedAudioLang,
            hasDubProbe: false,
            candidateTitle: candidate.title,
            slug,
            episodeNumber: effectiveEpisodeNum,
            serverNameParam: serverName,
            sourceLabel,
            sourceId,
            sourceLang,
            sourceBaseUrl,
            fallbackQueryTitle: queries[0],
          });
          return { payload: directPayload };
        }
        continue;
      }

      if (requiresStrictAudioMatch && !sourceInherentlyMatchesRequested) {
        const candOk = candidateMatchesAudioLanguage(candidate, requestedAudioLang, {
          sourceLang,
          sourceName,
          sourceBaseUrl,
        });
        const embOk = embedsMatchAudioLanguage(combinedEmbeds, requestedAudioLang);
        if (!candOk && !embOk) {
          sawCandidatesWithoutRequestedLanguage = true;
          continue;
        }
      }

      const orderedEmbeds = sortEmbedsForAudioLanguage(combinedEmbeds, {
        audioLanguage: requestedAudioLang,
        serverId,
        serverName,
      });

      let hasDubProbe = false;
      const resolvedMirrors: Array<UnwrappedStreamMedia & { label: string }> = [];

      const initialAudiosWithoutProbe = detectAvailableAudiosFromSources({
        candidates,
        targetTitles,
        currentCategory: effectiveCategory,
        hasDubProbe: false,
      });
      const alreadyHasDubCandidate = initialAudiosWithoutProbe.some((a) => a.code === 'en');

      for (const emb of orderedEmbeds.slice(0, 3)) {
        const allowSubFallback =
          !requiresStrictAudioMatch &&
          (effectiveCategory !== 'dub' || /-dub$/i.test(slug));

        const mediaData = await unwrapGenericOrCompatibleEmbed(
          emb.url,
          resolvedEpUrl,
          effectiveCategory,
          allowSubFallback,
        );

        if (
          resolvedMirrors.length === 0 &&
          effectiveCategory === 'sub' &&
          !alreadyHasDubCandidate
        ) {
          const iframeUrl = await resolveEmbedIframeUrl(emb.url, resolvedEpUrl);
          if (iframeUrl && /\/(?:sub|dub)(?:[?#]|$)/i.test(iframeUrl)) {
            const dubProbe = await resolveMegaPlayOrCompatibleIframe(
              iframeUrl,
              'dub',
              emb.url,
            ).catch(() => null);
            if (dubProbe?.streamUrl) hasDubProbe = true;
          }
        }

        if (
          !mediaData &&
          effectiveCategory === 'dub' &&
          !/-dub$/i.test(slug) &&
          !sourceInherentlyMatchesRequested
        ) {
          continue;
        }

        if (mediaData) {
          resolvedMirrors.push({
            ...mediaData,
            label: emb.label,
          });
          if (resolvedMirrors.length >= 2) break;
        }
      }

      if (resolvedMirrors.length > 0) {
        const payload = finalizePayload({
          resolvedMirrors,
          candidates,
          targetTitles,
          effectiveCategory,
          requestedAudioLang,
          hasDubProbe,
          candidateTitle: candidate.title,
          slug,
          episodeNumber: effectiveEpisodeNum,
          serverNameParam: serverName,
          sourceLabel,
          sourceId,
          sourceLang,
          sourceBaseUrl,
          fallbackQueryTitle: queries[0],
          embedLangHints: combinedEmbeds.map((emb) => emb.langHint),
        });
        return { payload };
      }
    }
  }

  return {
    payload: null,
    ...(lastHostError ? { lastError: lastHostError } : {}),
    ...(lastFailureKind ? { lastFailureKind } : {}),
    ...(lastStatus !== undefined ? { lastStatus } : {}),
    sawCandidatesWithoutRequestedLanguage:
      options.breakOnMissingLanguage && sawCandidatesWithoutRequestedLanguage,
  };
}

function getServerAdapterRuntime(): ServerAdapterRuntime<ResolvedAnimeStreamPayload> {
  return {
    fetchText,
    normalizeHttpUrl,
    parseGogoSearchHtml,
    parseGogoEpisodeEmbeds,
    parseDooPlayAjaxEmbeds,
    unwrapGenericOrCompatibleEmbed,
    resolveEmbedIframeUrl,
    resolveMegaPlayOrCompatibleIframe,
    searchGotakuPublicCatalog,
    probeGotakuEpisodesSupport,
    searchGogoAcrossQueries,
    searchGenericSiteAcrossQueries,
    resolveViaHiAnimeHost,
    resolveHostBasedCandidatesStream,
    getAudioLanguageDisplayName,
  };
}

export async function resolveAnimeEpisodeStream(
  params: ResolveAnimeStreamParams,
): Promise<ResolvedAnimeStreamPayload> {
  const safeEpisodeNum =
    Number.isFinite(params.episodeNumber) && params.episodeNumber > 0
      ? params.episodeNumber
      : 1;

  const requestedAudioLang: StreamAudioLanguage =
    params.audioLanguage === 'ja' ||
    params.audioLanguage === 'en' ||
    params.audioLanguage === 'hi' ||
    params.audioLanguage === 'es'
      ? params.audioLanguage
      : params.category === 'dub' || params.serverId?.includes('dub')
        ? 'en'
        : 'ja';

  const effectiveCategory: 'sub' | 'dub' | 'raw' =
    requestedAudioLang === 'en' ||
    requestedAudioLang === 'hi' ||
    requestedAudioLang === 'es' ||
    params.category === 'dub' ||
    params.serverId?.includes('dub')
      ? 'dub'
      : 'sub';

  const adapter = createServerAnimeExtensionAdapter(
    {
      sourceId: params.sourceId || 'shonenx-hls-inbuilt',
      sourceName: params.sourceName,
      sourceBaseUrl: params.sourceBaseUrl,
      sourceLang: params.sourceLang,
      sourcePkg: params.sourcePkg,
    },
    getServerAdapterRuntime(),
  );

  // Consistent capability gate BEFORE executing resolution
  adapter.assertCapability('stream');

  const validSelectedEntry = isMatchedSourceEntryValidForSource(
    params.selectedSourceEntry,
    params.sourceId,
  )
    ? params.selectedSourceEntry
    : null;

  const validSelectedEpisode = isMatchedEpisodeValidForSource(
    params.selectedEpisode,
    params.sourceId,
  )
    ? params.selectedEpisode
    : null;

  const effectiveEpisodeNum =
    typeof validSelectedEpisode?.number === 'number' &&
    Number.isFinite(validSelectedEpisode.number) &&
    validSelectedEpisode.number >= 0
      ? validSelectedEpisode.number
      : safeEpisodeNum;

  const cacheKey = buildStreamResolverCacheKey({
    mediaId: params.mediaId,
    overrideTitle: params.titles.overrideTitle,
    english: params.titles.english,
    romaji: params.titles.romaji,
    episodeNumber: effectiveEpisodeNum,
    category: effectiveCategory,
    audioLanguage: requestedAudioLang,
    serverId: params.serverId,
    sourceId: params.sourceId,
    sourceBaseUrl: params.sourceBaseUrl,
    sourceLang: params.sourceLang,
    selectedHref: validSelectedEntry?.href || validSelectedEpisode?.sourceAnimeHref || null,
    selectedSlug: validSelectedEntry?.slug || validSelectedEpisode?.sourceAnimeSlug || null,
    selectedEpisodeId: validSelectedEpisode?.sourceEpisodeId || null,
    selectedEpisodeUrl: validSelectedEpisode?.episodeUrl || null,
  });

  if (!params.bypassCache) {
    const cached = resolvedStreamCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
  }

  const effectiveTitlesInput = validSelectedEntry?.title
    ? {
        ...params.titles,
        overrideTitle: validSelectedEntry.title,
      }
    : params.titles;

  const queries = buildSearchQueriesForMedia(effectiveTitlesInput, requestedAudioLang);
  if (queries.length === 0 && !validSelectedEntry?.href && !validSelectedEpisode?.episodeUrl) {
    throw new ExtensionCapabilityError({
      code: 'INVALID_INPUT',
      capability: 'stream',
      sourceId: adapter.sourceId,
      sourceLabel: adapter.sourceLabel,
      reason: 'No searchable anime title available to resolve episode stream.',
    });
  }

  const targetTitles = [
    validSelectedEntry?.title,
    params.titles.overrideTitle,
    params.titles.english,
    params.titles.romaji,
    ...(params.titles.synonyms || []),
  ]
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean);

  const effectiveEntryHref =
    validSelectedEntry?.href || validSelectedEpisode?.sourceAnimeHref || '';
  const directSelectedCandidate: GogoSearchCandidate | null = effectiveEntryHref
    ? {
        href: effectiveEntryHref,
        title:
          validSelectedEntry?.title?.trim() ||
          targetTitles[0] ||
          queries[0] ||
          'Selected Entry',
      }
    : null;

  const outcome = await adapter.resolveStream({
    mediaId: params.mediaId,
    queries,
    targetTitles,
    format: params.format,
    episodeNumber: effectiveEpisodeNum,
    effectiveCategory,
    requestedAudioLang,
    serverId: params.serverId,
    serverName: params.serverName,
    sourceId: params.sourceId,
    sourceName: adapter.sourceLabel,
    sourceBaseUrl: params.sourceBaseUrl,
    sourceLang: params.sourceLang,
    directSelectedCandidate,
    validSelectedEntry,
    validSelectedEpisode,
  });

  if (outcome.payload) {
    resolvedStreamCache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      payload: outcome.payload,
    });
    return outcome.payload;
  }

  const displayTitle = targetTitles[0] || queries[0];
  if (
    outcome.sawCandidatesWithoutRequestedLanguage &&
    (requestedAudioLang === 'hi' || requestedAudioLang === 'es')
  ) {
    throw new Error(
      `${getAudioLanguageDisplayName(requestedAudioLang)} audio is not available for "${displayTitle}" on ${adapter.sourceLabel}. Switch to an extension that hosts ${requestedAudioLang === 'hi' ? 'Hindi' : 'Spanish'} streams or select English / Japanese audio.`,
    );
  }

  const finalMessage =
    outcome.lastError || `No working episode stream mirror responded on ${adapter.sourceLabel}.`;
  if (
    outcome.lastFailureKind === 'blocked_request' ||
    outcome.lastFailureKind === 'auth_required' ||
    outcome.lastFailureKind === 'timeout' ||
    outcome.lastFailureKind === 'network_error' ||
    outcome.lastFailureKind === 'malformed_response'
  ) {
    throw new UpstreamFetchError({
      message: finalMessage,
      failureKind: outcome.lastFailureKind,
      status: outcome.lastStatus,
      url: adapter.hosts[0] || '',
      retryable: false,
      attempts: 1,
    });
  }

  throw new Error(finalMessage);
}

const inFlightAnimeDiagnostics = new Map<string, Promise<ExtensionDiagnosticReport>>();

export async function diagnoseAnimeExtensionServer(params: {
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
    params.sourceId.trim(),
    normalizedHost,
    params.mode,
    query.toLowerCase(),
  ]);

  const existing = inFlightAnimeDiagnostics.get(dedupeKey);
  if (existing) {
    return existing;
  }

  const runPromise = runDiagnoseAnimeExtensionServer({
    ...params,
    query,
  }).finally(() => {
    inFlightAnimeDiagnostics.delete(dedupeKey);
  });

  inFlightAnimeDiagnostics.set(dedupeKey, runPromise);
  return runPromise;
}

function isUpstreamAccessRestrictionReason(reason?: string | null): boolean {
  if (!reason) return false;
  return /anti-bot challenge|cloudflare|turnstile|captcha|HTTP\s*(?:403|429|503)|upstream access restriction|upstream access|access restriction|rate.?limit|blocked/i.test(
    reason,
  );
}

function isGenuineExtensionIncompatibilityReason(reason?: string | null): boolean {
  if (!reason) return false;
  if (/HTTP\s*(?:403|429|503)|anti-bot challenge|upstream access restriction/i.test(reason)) {
    return false;
  }
  return /JavaScript app|client-rendered|encrypted binary|\bdrm\b|metadata\/tracking catalog/i.test(
    reason,
  );
}

async function runDiagnoseAnimeExtensionServer(params: {
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
  const finishTimestamp = () => new Date().toISOString();

  const adapter = createServerAnimeExtensionAdapter(
    {
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      sourceBaseUrl: params.sourceBaseUrl,
      sourceLang: params.sourceLang,
      sourcePkg: params.sourcePkg,
    },
    getServerAdapterRuntime(),
  );

  if (adapter.profile.kind === 'metadata-only') {
    const unsupportedReason = `${sourceLabel} is a metadata/tracking catalog and does not host playable video streams.`;
    return {
      sourceId: params.sourceId,
      sourceName: sourceLabel,
      status: 'unsupported',
      durationMs: Date.now() - startedAt,
      testedAt: finishTimestamp(),
      mode: params.mode,
      failureKind: 'metadata_only',
      summary: 'Unsupported: Metadata-only catalog source',
      detail: unsupportedReason,
      capabilities: buildCapabilitiesBreakdown({
        mode: params.mode,
        mediaTab: 'ANIME',
        unsupportedReason,
        isMetadataCatalogOnly: true,
        searchMatched: false,
        listingAvailable: false,
        playbackOrPagesVerified: false,
      }),
    };
  }

  if (adapter.profile.kind === 'missing-host' || adapter.hosts.length === 0) {
    const unsupportedReason = `Extension "${sourceLabel}" does not have a valid HTTP base URL configured.`;
    return {
      sourceId: params.sourceId,
      sourceName: sourceLabel,
      status: 'unsupported',
      durationMs: Date.now() - startedAt,
      testedAt: finishTimestamp(),
      mode: params.mode,
      failureKind: 'missing_host',
      summary: 'Unsupported: Missing stream host URL',
      detail: unsupportedReason,
      capabilities: buildCapabilitiesBreakdown({
        mode: params.mode,
        mediaTab: 'ANIME',
        unsupportedReason,
        searchMatched: false,
        listingAvailable: false,
        playbackOrPagesVerified: false,
      }),
    };
  }

  const primaryHost = adapter.hosts[0];

  if (params.mode === 'ping') {
    let reachableHost: string | null = null;
    let reachableStatus = 0;
    let blockedReason: string | null = null;
    let lastErr = '';
    let lastFailureKind: DiagnosticFailureKind | null = null;

    for (const host of adapter.hosts) {
      try {
        const res = await fetchText(`${host}/`, { Referer: `${host}/` }, 5000);
        if (looksLikeBlockedChallengeHtml(res.status, res.text)) {
          blockedReason = `${host} returned an anti-bot challenge (HTTP ${res.status}).`;
          lastFailureKind = 'blocked_request';
          break;
        }
        if (res.ok) {
          reachableHost = host;
          reachableStatus = res.status;
          break;
        }
        lastErr = `HTTP ${res.status}`;
        lastFailureKind =
          res.status === 403 || res.status === 429 || res.status === 503
            ? 'blocked_request'
            : res.failureKind || classifyDiagnosticFailure(lastErr, res.status);
      } catch (err) {
        const classified = classifyFetchException(err);
        lastErr = classified.message;
        lastFailureKind = classified.failureKind;
      }
    }

    if (blockedReason) {
      return {
        sourceId: params.sourceId,
        sourceName: sourceLabel,
        status: 'fail',
        durationMs: Date.now() - startedAt,
        testedAt: finishTimestamp(),
        mode: 'ping',
        failureKind: lastFailureKind || 'blocked_request',
        summary: 'Upstream access blocked by provider protection',
        detail: `${blockedReason} Upstream access could not be verified from this server; this does not mean the extension format is unsupported.`,
        capabilities: buildCapabilitiesBreakdown({
          mode: 'ping',
          mediaTab: 'ANIME',
          searchMatched: false,
          listingAvailable: false,
          playbackOrPagesVerified: false,
        }),
      };
    }

    if (!reachableHost) {
      const resolvedKind = lastFailureKind || classifyDiagnosticFailure(lastErr);
      return {
        sourceId: params.sourceId,
        sourceName: sourceLabel,
        status: 'fail',
        durationMs: Date.now() - startedAt,
        testedAt: finishTimestamp(),
        mode: 'ping',
        failureKind: resolvedKind,
        summary:
          resolvedKind === 'blocked_request'
            ? `Upstream access blocked (${lastErr || 'HTTP 403'})`
            : `Host unreachable (${lastErr || 'No response'})`,
        detail:
          resolvedKind === 'blocked_request'
            ? `Tried ${primaryHost}: ${lastErr || 'Access restricted'}. Upstream access is blocked or unverified from this server; this does not mean the extension format is unsupported.`
            : `Tried ${primaryHost}: ${lastErr || 'No response'}. Stream playback was not tested.`,
        capabilities: buildCapabilitiesBreakdown({
          mode: 'ping',
          mediaTab: 'ANIME',
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
      testedAt: finishTimestamp(),
      mode: 'ping',
      summary: `Host reachable (HTTP ${reachableStatus}) · Playback not verified`,
      detail: `${reachableHost} responded cleanly. Run Full test to verify episodes and video playback.`,
      capabilities: buildCapabilitiesBreakdown({
        mode: 'ping',
        mediaTab: 'ANIME',
        searchMatched: true,
        listingAvailable: false,
        playbackOrPagesVerified: false,
      }),
    };
  }

  // Basic or Full: real title search routed through the source's dedicated adapter
  let matchedCandidates: SearchAnimeExtensionResultItem[] = [];
  let unsupportedReason: string | null = null;
  let searchBlockedByUpstream = false;
  let searchErrorReason: string | null = null;
  let searchFailureKind: DiagnosticFailureKind | undefined;
  const searchHostUsed = primaryHost;

  if (adapter.supports('search')) {
    try {
      const searchRes = await adapter.searchTitles(query);
      if (searchRes.compatible) {
        matchedCandidates = searchRes.items;
      } else if (searchRes.reason) {
        searchErrorReason = searchRes.reason;
        const treatInbuiltChallengeAsBlocked =
          adapter.profile.kind === 'inbuilt-anime' &&
          /turnstile|anti-bot|challenge|cloudflare|HTTP\s*(?:403|429|503)|blocked/i.test(
            searchRes.reason,
          );
        if (
          !treatInbuiltChallengeAsBlocked &&
          isGenuineExtensionIncompatibilityReason(searchRes.reason)
        ) {
          unsupportedReason = searchRes.reason;
          searchFailureKind = classifyDiagnosticFailure(searchRes.reason);
        } else if (
          treatInbuiltChallengeAsBlocked ||
          isUpstreamAccessRestrictionReason(searchRes.reason)
        ) {
          searchBlockedByUpstream = true;
          searchFailureKind = 'blocked_request';
        } else {
          searchFailureKind = classifyDiagnosticFailure(searchRes.reason);
        }
      }
    } catch (err) {
      if (err instanceof ExtensionCapabilityError && err.isUnsupported) {
        unsupportedReason = err.reason;
        searchFailureKind = classifyDiagnosticFailure(err.reason);
      } else {
        const classified = classifyFetchException(err);
        searchErrorReason = classified.message;
        if (
          classified.failureKind === 'blocked_request' ||
          isUpstreamAccessRestrictionReason(searchErrorReason)
        ) {
          searchBlockedByUpstream = true;
          searchFailureKind = 'blocked_request';
        } else {
          searchFailureKind = classified.failureKind;
        }
      }
    }
  }

  if (unsupportedReason) {
    return {
      sourceId: params.sourceId,
      sourceName: sourceLabel,
      status: 'unsupported',
      durationMs: Date.now() - startedAt,
      testedAt: finishTimestamp(),
      mode: params.mode,
      failureKind: searchFailureKind || classifyDiagnosticFailure(unsupportedReason),
      summary: 'Unsupported in Web Bridge: Extension format requires unsupported runtime',
      detail: unsupportedReason,
      capabilities: buildCapabilitiesBreakdown({
        mode: params.mode,
        mediaTab: 'ANIME',
        unsupportedReason,
        searchMatched: false,
        listingAvailable: false,
        playbackOrPagesVerified: false,
      }),
    };
  }

  const topCandidate = matchedCandidates[0];

  if (params.mode === 'basic') {
    const searchOk = Boolean(topCandidate);
    const basicFailureKind = searchOk
      ? undefined
      : searchFailureKind || 'provider_error';
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
      testedAt: finishTimestamp(),
      mode: 'basic',
      ...(basicFailureKind ? { failureKind: basicFailureKind } : {}),
      summary: searchOk
        ? `Search matched ${matchedCandidates.length} title${matchedCandidates.length === 1 ? '' : 's'} · Top: ${topCandidate.title} (Playback untested)`
        : searchBlockedByUpstream
          ? `Upstream search blocked on ${sourceLabel} (Playback untested)`
          : `No matching anime entries found on ${sourceLabel} for "${query}"`,
      detail: searchOk
        ? `Host: ${searchHostUsed} (adapter: ${adapter.adapterId}). Run Full test to verify episode listing and video stream resolution.`
        : searchBlockedByUpstream && searchErrorReason
          ? `${searchErrorReason} Upstream access is restricted or unverified from this server; this does not mean the extension format is unsupported.`
          : searchErrorReason ||
            `Queried ${searchHostUsed} directly without metadata fallback; 0 matching results found.`,
      matchedTitle: topCandidate?.title,
      sampleItems: matchedCandidates.slice(0, 3).map((c) => c.title),
      capabilities: buildCapabilitiesBreakdown({
        mode: 'basic',
        mediaTab: 'ANIME',
        searchMatched: searchOk,
        listingAvailable: false,
        playbackOrPagesVerified: false,
      }),
    };
  }

  if (adapter.profile.kind === 'gotaku' || !adapter.supports('episodes')) {
    const epProbe =
      adapter.profile.kind === 'gotaku'
        ? await probeGotakuEpisodesSupport(searchHostUsed, sourceLabel, topCandidate?.href || '')
        : {
            supported: false,
            reason:
              adapter.getCapabilities().episodes.reason ||
              `${sourceLabel} does not support episode listing or video playback through this adapter.`,
          };
    if (!epProbe.supported) {
      const searchOk = Boolean(topCandidate);
      return {
        sourceId: params.sourceId,
        sourceName: sourceLabel,
        status: 'unsupported',
        durationMs: Date.now() - startedAt,
        testedAt: finishTimestamp(),
        mode: 'full',
        probeScope: DEFAULT_DIAGNOSTIC_PROBE_SCOPE,
        failureKind: 'unsupported_format',
        summary: searchOk
          ? `Search matched "${topCandidate.title}", but episodes & playback are unsupported`
          : `No matching anime entries found on ${sourceLabel}; episodes & playback are unsupported`,
        detail: epProbe.reason,
        matchedTitle: topCandidate?.title,
        sampleItems: matchedCandidates.slice(0, 3).map((c) => c.title),
        capabilities: {
          metadataSearch: searchOk ? 'verified' : 'unavailable',
          episodeOrChapterListing: 'unsupported',
          audioLanguage: 'unsupported',
          playbackOrReader: 'unsupported',
          overallCompatibility: 'unsupported',
        },
      };
    }
  }

  // Full capability test: Search -> Episode Listing -> Episode 1 Playable Stream
  let listingAvailable = false;
  let playbackVerified = false;
  let epBlockedByUpstream = false;
  let streamBlockedByUpstream = false;
  let streamError: string | null = null;
  let epErrorReason: string | null = null;
  let epFailureKind: DiagnosticFailureKind | undefined;
  let streamFailureKind: DiagnosticFailureKind | undefined;
  let resolvedPayload: ResolvedAnimeStreamPayload | null = null;

  if (topCandidate && adapter.supports('episodes')) {
    try {
      const epRes = await adapter.listEpisodes(topCandidate);
      if (epRes.compatible && epRes.episodes.length > 0) {
        listingAvailable = true;
      } else if (!epRes.compatible && epRes.reason) {
        epErrorReason = epRes.reason;
        epBlockedByUpstream = isUpstreamAccessRestrictionReason(epRes.reason);
        epFailureKind = epBlockedByUpstream
          ? 'blocked_request'
          : classifyDiagnosticFailure(epRes.reason);
      }
    } catch (err) {
      const classified = classifyFetchException(err);
      epErrorReason = classified.message;
      epBlockedByUpstream =
        classified.failureKind === 'blocked_request' ||
        isUpstreamAccessRestrictionReason(epErrorReason);
      epFailureKind = epBlockedByUpstream ? 'blocked_request' : classified.failureKind;
    }
  }

  if (adapter.supports('stream')) {
    try {
      resolvedPayload = await resolveAnimeEpisodeStream({
        mediaId: `diag-${params.sourceId}`,
        titles: { english: query, romaji: query },
        format: 'TV',
        episodeNumber: 1,
        category: 'sub',
        audioLanguage: 'ja',
        sourceId: params.sourceId,
        sourceName: params.sourceName,
        sourceBaseUrl: params.sourceBaseUrl,
        sourceLang: params.sourceLang,
        sourcePkg: params.sourcePkg,
        bypassCache: true,
      });
      if (resolvedPayload?.url) {
        playbackVerified = true;
        listingAvailable = true;
      }
    } catch (err) {
      if (err instanceof UpstreamFetchError) {
        streamError = err.message;
        streamBlockedByUpstream =
          err.failureKind === 'blocked_request' ||
          isUpstreamAccessRestrictionReason(err.message);
        streamFailureKind = streamBlockedByUpstream ? 'blocked_request' : err.failureKind;
      } else {
        const classified = classifyFetchException(err);
        streamError = err instanceof Error ? err.message : classified.message;
        streamBlockedByUpstream =
          classified.failureKind === 'blocked_request' ||
          isUpstreamAccessRestrictionReason(streamError);
        streamFailureKind = streamBlockedByUpstream
          ? 'blocked_request'
          : classifyDiagnosticFailure(streamError);
      }
    }
  }

  const probeScope = DEFAULT_DIAGNOSTIC_PROBE_SCOPE;
  const confirmedAudioLanguages = resolvedPayload?.availableAudios
    ? Array.from(
        new Set(
          resolvedPayload.availableAudios
            .filter((a) => a.evidence === 'confirmed')
            .map((a) => a.code)
            .filter(Boolean),
        ),
      )
    : [];
  const inferredAudioLanguages = resolvedPayload?.availableAudios
    ? Array.from(
        new Set(
          resolvedPayload.availableAudios
            .filter((a) => a.evidence !== 'confirmed')
            .map((a) => a.code)
            .filter((code) => Boolean(code) && !confirmedAudioLanguages.includes(code)),
        ),
      )
    : [];

  // Never report assumed/inferred audio languages as detected/confirmed without evidence
  const detectedAudioLanguages = confirmedAudioLanguages;

  const audioLanguageStatus: 'verified' | 'partial' | 'unavailable' | 'untested' =
    playbackVerified
      ? confirmedAudioLanguages.length > 0
        ? 'verified'
        : 'partial'
      : streamError && /audio is not available/i.test(streamError)
        ? 'unavailable'
        : 'untested';

  const audioVerificationDetail = playbackVerified
    ? confirmedAudioLanguages.length > 0
      ? `${probeScope} only · Confirmed: ${confirmedAudioLanguages.map((c) => c.toUpperCase()).join(', ')}`
      : `${probeScope} only · Audio track language unknown/inferred (no explicit track evidence)`
    : `${probeScope} · Audio tracks not verified`;

  const searchOk =
    Boolean(topCandidate) || (!searchErrorReason && !searchBlockedByUpstream && playbackVerified);
  const overall = resolveDiagnosticOverallStatus({
    mode: 'full',
    searchMatched: searchOk,
    listingAvailable,
    playbackOrPagesVerified: playbackVerified,
    errorOccurred: !playbackVerified && !listingAvailable && !searchOk,
  });

  // Preserve blocked_request from an earlier stage so unreached downstream capabilities remain 'untested' instead of 'unavailable'
  const streamMissingSearchCandidateOnly =
    Boolean(searchBlockedByUpstream) &&
    !topCandidate &&
    !listingAvailable &&
    !playbackVerified;

  const streamBlockedByEpisodeListing =
    Boolean(epBlockedByUpstream) &&
    !listingAvailable &&
    !playbackVerified;

  const streamUnreachedAfterBlockedSearch =
    !searchOk &&
    !topCandidate &&
    !listingAvailable &&
    !playbackVerified &&
    searchFailureKind === 'blocked_request';

  const listingStatusOverride: CapabilityStatus | undefined =
    !listingAvailable &&
    !topCandidate &&
    (searchBlockedByUpstream || streamUnreachedAfterBlockedSearch)
      ? 'untested'
      : undefined;
  const playbackStatusOverride: CapabilityStatus | undefined =
    streamMissingSearchCandidateOnly ||
    streamBlockedByEpisodeListing ||
    streamUnreachedAfterBlockedSearch
      ? 'untested'
      : undefined;

  const preserveSearchBlockDetail =
    !playbackVerified &&
    searchBlockedByUpstream &&
    (!epBlockedByUpstream || !epErrorReason) &&
    (streamMissingSearchCandidateOnly || !streamError);

  const preserveEpisodeBlockDetail =
    !playbackVerified &&
    Boolean(epBlockedByUpstream && epErrorReason) &&
    (streamBlockedByEpisodeListing || !streamError);

  const resolvedFailureKind: DiagnosticFailureKind | undefined =
    overall === 'pass'
      ? searchOk
        ? undefined
        : searchFailureKind
      : preserveSearchBlockDetail
        ? searchFailureKind || 'blocked_request'
        : preserveEpisodeBlockDetail
          ? epFailureKind || 'blocked_request'
          : streamFailureKind || epFailureKind || searchFailureKind || 'provider_error';

  let resolvedDetail: string;
  if (overall === 'pass' && resolvedPayload) {
    const baseVerifiedDetail = `${probeScope} · Resolved Ep 1 via ${resolvedPayload.serverName} (${resolvedPayload.mirrors.length} mirror${resolvedPayload.mirrors.length === 1 ? '' : 's'}${confirmedAudioLanguages.length > 0 ? ` · Confirmed Audio: ${confirmedAudioLanguages.map((c) => c.toUpperCase()).join(', ')}` : ' · Audio language unknown/unconfirmed'}).`;
    resolvedDetail =
      !searchOk && searchBlockedByUpstream && searchErrorReason
        ? `${baseVerifiedDetail} Primary search was restricted (${searchErrorReason}).`
        : baseVerifiedDetail;
  } else if (preserveSearchBlockDetail && searchErrorReason) {
    resolvedDetail = `${searchErrorReason} Upstream access is restricted or unverified from this server; this does not mean the extension format is unsupported.`;
  } else if (streamBlockedByUpstream && streamError) {
    resolvedDetail = `${streamError} Upstream stream access is restricted or unverified from this server; this does not mean the extension format is unsupported.`;
  } else if (epBlockedByUpstream && epErrorReason) {
    resolvedDetail = `${epErrorReason} Upstream episode access is restricted or unverified from this server; this does not mean the extension format is unsupported.`;
  } else {
    resolvedDetail =
      streamError ||
      epErrorReason ||
      searchErrorReason ||
      `Tested host ${searchHostUsed} with query "${query}".`;
  }

  let resolvedSummary: string;
  if (overall === 'pass' && resolvedPayload) {
    resolvedSummary =
      !searchOk && searchBlockedByUpstream
        ? `Fallback stream verified (${resolvedPayload.quality} · ${resolvedPayload.matchedTitle}), but upstream search was blocked`
        : `Playable stream verified (${resolvedPayload.quality} · ${resolvedPayload.matchedTitle})`;
  } else if (listingAvailable) {
    resolvedSummary = streamBlockedByUpstream
      ? `Found "${topCandidate?.title || query}", but upstream video stream access was blocked`
      : `Found "${topCandidate?.title || query}", but video stream failed to resolve`;
  } else if (searchOk) {
    resolvedSummary =
      epBlockedByUpstream || streamBlockedByUpstream
        ? `Search matched "${topCandidate?.title || query}", but downstream upstream access was blocked`
        : `Search matched "${topCandidate?.title || query}", but episode/stream extraction failed`;
  } else if (searchBlockedByUpstream) {
    resolvedSummary = `Upstream access blocked on ${sourceLabel}; remaining capabilities unverified`;
  } else {
    resolvedSummary = `No matching anime or playable stream found on ${sourceLabel}`;
  }

  return {
    sourceId: params.sourceId,
    sourceName: sourceLabel,
    status: overall,
    durationMs: Date.now() - startedAt,
    testedAt: finishTimestamp(),
    mode: 'full',
    probeScope,
    detectedAudioLanguages,
    confirmedAudioLanguages,
    inferredAudioLanguages,
    audioVerificationDetail,
    ...(resolvedFailureKind ? { failureKind: resolvedFailureKind } : {}),
    summary: resolvedSummary,
    detail: resolvedDetail,
    matchedTitle: resolvedPayload?.matchedTitle || topCandidate?.title,
    sampleItems:
      resolvedPayload?.mirrors.map((m, idx) => `Mirror ${idx + 1}: ${m.serverName} (${m.quality})`) ||
      (topCandidate ? [topCandidate.title] : []),
    capabilities: buildCapabilitiesBreakdown({
      mode: 'full',
      mediaTab: 'ANIME',
      searchMatched: searchOk,
      listingAvailable,
      playbackOrPagesVerified: playbackVerified,
      audioLanguageStatus,
      listingStatus: listingStatusOverride,
      playbackStatus: playbackStatusOverride,
    }),
  };
}

/**
 * Searches ONLY the selected source/extension directly through its adapter
 * (never falling back to global AniList/Jikan) and surfaces explicit compatibility failures
 * for metadata-only, missing-host, SPA/Turnstile, or anti-bot hosts.
 */
export async function searchAnimeExtensionEntriesServer(params: {
  sourceId: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  sourcePkg?: string;
  query: string;
}): Promise<SearchAnimeExtensionResponse> {
  const adapter = createServerAnimeExtensionAdapter(
    {
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      sourceBaseUrl: params.sourceBaseUrl,
      sourceLang: params.sourceLang,
      sourcePkg: params.sourcePkg,
    },
    getServerAdapterRuntime(),
  );

  try {
    return await adapter.searchTitles(params.query);
  } catch (err) {
    if (err instanceof ExtensionCapabilityError) {
      return {
        compatible: false,
        reason: err.reason,
        sourceLabel: adapter.sourceLabel,
        items: [],
      };
    }
    throw err;
  }
}

const resolvedExtensionEpisodesCache = new Map<
  string,
  { expiresAt: number; payload: ExtensionEpisodesResponse }
>();

/**
 * Fetches the episode list belonging directly to the selected external anime entry
 * on the selected source via its adapter without falling back to global AniList/Jikan/AniZip/Kitsu
 * metadata or generating fake episode placeholders.
 */
export async function resolveAnimeExtensionEpisodesServer(params: {
  sourceId: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  sourcePkg?: string;
  selectedSourceEntry: SelectedSourceEntryInput;
  bypassCache?: boolean;
}): Promise<ExtensionEpisodesResponse> {
  const adapter = createServerAnimeExtensionAdapter(
    {
      sourceId: params.sourceId,
      sourceName: params.sourceName,
      sourceBaseUrl: params.sourceBaseUrl,
      sourceLang: params.sourceLang,
      sourcePkg: params.sourcePkg,
    },
    getServerAdapterRuntime(),
  );

  const entry = params.selectedSourceEntry;
  if (
    !entry?.href ||
    (entry.sourceId && entry.sourceId.trim() !== params.sourceId.trim())
  ) {
    return {
      compatible: false,
      reason: `No valid ${adapter.sourceLabel} anime entry is selected for episode loading.`,
      sourceLabel: adapter.sourceLabel,
      episodes: [],
    };
  }

  const slug = entry.slug?.trim() || extractSlugFromGogoHref(entry.href);
  const cacheKey = JSON.stringify({
    sourceId: params.sourceId,
    sourceBaseUrl: (params.sourceBaseUrl || '').replace(/\/+$/, ''),
    href: entry.href,
    slug,
  });

  if (!params.bypassCache) {
    const cached = resolvedExtensionEpisodesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.payload;
    }
  }

  try {
    const payload = await adapter.listEpisodes(entry);
    if (payload.compatible && payload.episodes.length > 0) {
      resolvedExtensionEpisodesCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        payload,
      });
    }
    return payload;
  } catch (err) {
    if (err instanceof ExtensionCapabilityError) {
      return {
        compatible: false,
        reason: err.reason,
        sourceLabel: adapter.sourceLabel,
        episodes: [],
      };
    }
    throw err;
  }
}



