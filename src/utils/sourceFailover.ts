import type { MediaType, SourceInfo } from '../types/media';
import type { ExtensionDiagnosticReport } from './extensionDiagnostics';
import { filterPlayableSourcesForPlayer } from './sourcePicker';

export interface FailoverAttemptRecord {
  sourceId: string;
  sourceName: string;
  error: string;
}

const BUILTIN_PREFERRED_ORDER: Record<string, number> = {
  'shonenx-hls-inbuilt': 0,
  'hianime-bridge': 1,
};

function getDiagnosticRank(
  source: SourceInfo,
  diagnosticsBySourceId?: Record<string, ExtensionDiagnosticReport | undefined>,
): number {
  const report = diagnosticsBySourceId?.[source.id];
  if (report) {
    if (report.status === 'pass' && report.capabilities?.playbackOrReader === 'verified') {
      return 0;
    }
    if (report.status === 'unsupported') {
      return source.type === 'inbuilt' || source.id === 'hianime-bridge' ? 3 : 99;
    }
    if (report.status === 'partial') {
      return 2;
    }
    if (report.status === 'fail') {
      return source.type === 'inbuilt' || source.id === 'hianime-bridge' ? 2 : 4;
    }
  }
  return 1;
}

/**
 * Builds an ordered list of legitimate, already-installed playable failover sources
 * when the active source fails to resolve or buffer a stream.
 * - Excludes non-playable sources (metadata-only, missing-host, gotaku search-only, etc.)
 * - Excludes already attempted source IDs
 * - Ranks verified healthy/passing sources first, then untested/inbuilt sources,
 *   and skips third-party extensions explicitly marked 'unsupported' by diagnostics.
 */
export function buildPlayableFailoverQueue(params: {
  currentSourceId?: string | null;
  availableSources: SourceInfo[];
  attemptedSourceIds?: Iterable<string>;
  diagnosticsBySourceId?: Record<string, ExtensionDiagnosticReport | undefined>;
  mediaType?: MediaType;
}): SourceInfo[] {
  const attempted = new Set<string>(params.attemptedSourceIds || []);
  if (params.currentSourceId) {
    attempted.add(params.currentSourceId);
  }

  const playable = filterPlayableSourcesForPlayer(
    params.availableSources,
    params.mediaType ?? 'ANIME',
  );

  const candidates = playable.filter((src) => {
    if (attempted.has(src.id)) return false;
    const rank = getDiagnosticRank(src, params.diagnosticsBySourceId);
    return rank < 99;
  });

  return candidates.sort((a, b) => {
    const rankDiff =
      getDiagnosticRank(a, params.diagnosticsBySourceId) -
      getDiagnosticRank(b, params.diagnosticsBySourceId);
    if (rankDiff !== 0) return rankDiff;

    const aBuiltin = BUILTIN_PREFERRED_ORDER[a.id] ?? 10;
    const bBuiltin = BUILTIN_PREFERRED_ORDER[b.id] ?? 10;
    if (aBuiltin !== bBuiltin) return aBuiltin - bBuiltin;

    return a.name.localeCompare(b.name);
  });
}

/**
 * Formats an honest summary of all sources tried when every enabled playable source failed.
 */
export function formatFailoverAttemptSummary(attempts: FailoverAttemptRecord[]): string {
  if (!Array.isArray(attempts) || attempts.length === 0) {
    return 'Unable to resolve an active episode stream.';
  }
  if (attempts.length === 1) {
    return attempts[0].error || `Unable to resolve stream on ${attempts[0].sourceName}.`;
  }
  const names = attempts.map((a) => a.sourceName).join(', ');
  const lastError = attempts[attempts.length - 1]?.error || attempts[0]?.error || 'No mirror responded.';
  return `Tried ${attempts.length} sources (${names}) — ${lastError}`;
}

const NON_M3U8_MEDIA_EXT_RE =
  /\.(?:mp4|m4v|webm|mkv|avi|mov|ts|m4s|mp3|aac|flac|ogg|wav|jpg|jpeg|png|gif|webp|avif|svg|woff2?)(?:$|\?)/i;

/**
 * Determines whether `/api/stream/proxy` should peek the response text to check for an `#EXTM3U`
 * playlist even when the CDN returns `text/plain`, `application/octet-stream`, or an extensionless URL.
 * Never buffers large video/binary payloads.
 */
export function shouldBufferForM3u8Check(params: {
  contentType?: string | null;
  pathname: string;
  contentLengthHeader?: string | null;
}): boolean {
  const ct = (params.contentType || '').toLowerCase();
  const pathLower = (params.pathname || '').toLowerCase();

  if (ct.includes('mpegurl') || pathLower.endsWith('.m3u8')) return false;
  if (ct.includes('text/vtt') || pathLower.endsWith('.vtt')) return false;
  if (
    ct.startsWith('video/') ||
    ct.startsWith('audio/') ||
    ct.startsWith('image/') ||
    NON_M3U8_MEDIA_EXT_RE.test(pathLower)
  ) {
    return false;
  }

  if (params.contentLengthHeader) {
    const parsedLen = Number(params.contentLengthHeader);
    if (Number.isFinite(parsedLen) && parsedLen > 524_288) {
      return false;
    }
  }

  return (
    ct.includes('text/plain') ||
    ct.includes('application/octet-stream') ||
    ct === '' ||
    pathLower.endsWith('.txt') ||
    !/\.[a-z0-9]{2,5}$/i.test(pathLower)
  );
}

export function isM3u8ManifestBody(text: string): boolean {
  return /^#EXTM3U\b/i.test(text.replace(/^\uFEFF/, '').trimStart());
}

/**
 * Finds the next mirror index whose URL differs from the currently failed stream URL
 * so the player never wastes retries on identical mirror endpoints.
 */
export function findNextDistinctMirrorIndex(
  mirrors: Array<{ url?: string }> | undefined | null,
  currentMirrorIndex: number,
  currentUrl?: string | null,
): number {
  if (!Array.isArray(mirrors) || mirrors.length === 0) return -1;
  const cleanCurrent = (currentUrl || '').trim();
  for (let i = currentMirrorIndex + 1; i < mirrors.length; i++) {
    const candidate = (mirrors[i]?.url || '').trim();
    if (!candidate) continue;
    if (!cleanCurrent || candidate !== cleanCurrent) {
      return i;
    }
  }
  return -1;
}
