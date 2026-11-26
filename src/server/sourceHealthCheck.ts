import type { SourceInfo } from '../types/media.ts';
import { isSafeExternalHttpUrl } from '../utils/extensionRepoParser.ts';
import {
  resolveSourceHeartbeatPlan,
  type SourceHealthCheckResult,
  type SourceHealthMediaContext,
  validateHeartbeatResponseFormat,
} from '../utils/sourceHealthCheck.ts';

const HEARTBEAT_TIMEOUT_MS = 5000;
const HEARTBEAT_MAX_BODY_CHARS = 250_000;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface ServerHealthCheckInputSource {
  id: string;
  name?: string;
  type?: 'inbuilt' | 'extension' | string;
  mediaTypes?: string[];
  baseUrl?: string;
  lang?: string;
  pkg?: string;
  mediaContext?: SourceHealthMediaContext;
}

function normalizeInputSource(raw: ServerHealthCheckInputSource): {
  source: Pick<SourceInfo, 'id' | 'name' | 'type' | 'mediaTypes' | 'baseUrl' | 'pkg'>;
  mediaContext?: SourceHealthMediaContext;
} {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id;
  const type = raw.type === 'inbuilt' ? 'inbuilt' : 'extension';
  const mediaTypes = Array.isArray(raw.mediaTypes)
    ? raw.mediaTypes
        .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
        .map((m) => m.trim().toUpperCase())
    : [];
  const baseUrl =
    typeof raw.baseUrl === 'string' && raw.baseUrl.trim() ? raw.baseUrl.trim() : undefined;
  const pkg = typeof raw.pkg === 'string' && raw.pkg.trim() ? raw.pkg.trim() : undefined;
  const rawContext =
    typeof raw.mediaContext === 'string' ? raw.mediaContext.trim().toUpperCase() : undefined;
  const mediaContext: SourceHealthMediaContext | undefined =
    rawContext === 'ANIME' || rawContext === 'MANGA' ? rawContext : undefined;

  return {
    source: {
      id,
      name,
      type,
      mediaTypes: mediaTypes as SourceInfo['mediaTypes'],
      baseUrl,
      pkg,
    },
    mediaContext,
  };
}

export async function checkSingleSourceHealthServer(
  rawInput: ServerHealthCheckInputSource,
): Promise<SourceHealthCheckResult> {
  const { source, mediaContext } = normalizeInputSource(rawInput);
  const checkedAt = new Date().toISOString();

  if (!source.id) {
    return {
      sourceId: 'unknown',
      sourceName: source.name || 'Unknown source',
      status: 'unsupported',
      expectedFormat: 'unsupported',
      checkedAt,
      summary: 'Missing source ID',
      detail: 'A valid sourceId is required to run an adapter heartbeat check.',
    };
  }

  const plan = resolveSourceHeartbeatPlan(source, mediaContext);

  if (!plan.supported || plan.targets.length === 0) {
    return {
      sourceId: plan.sourceId,
      sourceName: plan.sourceLabel,
      status: 'unsupported',
      expectedFormat: 'unsupported',
      checkedAt,
      summary:
        plan.adapterKind === 'metadata-only'
          ? 'Metadata-only source (no stream endpoint)'
          : plan.adapterKind === 'missing-host'
            ? 'No host URL configured'
            : 'Heartbeat not supported for this adapter',
      detail: plan.unsupportedReason,
    };
  }

  let fallbackInvalidResult: SourceHealthCheckResult | null = null;
  let fallbackUnreachableResult: SourceHealthCheckResult | null = null;

  for (const target of plan.targets) {
    if (!isSafeExternalHttpUrl(target.url)) {
      fallbackUnreachableResult = {
        sourceId: plan.sourceId,
        sourceName: plan.sourceLabel,
        status: 'unreachable',
        expectedFormat: target.expectedFormat,
        targetUrl: target.url,
        checkedAt: new Date().toISOString(),
        summary: 'Blocked invalid target URL',
        detail: `${plan.sourceLabel} specifies an invalid or disallowed host URL.`,
      };
      continue;
    }

    const startedAt = Date.now();
    try {
      const acceptHeader =
        target.expectedFormat === 'json_catalog' || target.expectedFormat === 'mangadex_json'
          ? 'application/json, text/plain, */*'
          : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
      const userAgent =
        plan.adapterKind === 'mangadex' ? 'ShizuTv/2.1 (+https://mangadex.org)' : BROWSER_UA;

      const response = await fetch(target.url, {
        method: target.method,
        headers: {
          'User-Agent': userAgent,
          Accept: acceptHeader,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(HEARTBEAT_TIMEOUT_MS),
      });

      const finalUrl = response.url || target.url;
      if (!isSafeExternalHttpUrl(finalUrl)) {
        fallbackUnreachableResult = {
          sourceId: plan.sourceId,
          sourceName: plan.sourceLabel,
          status: 'unreachable',
          expectedFormat: target.expectedFormat,
          targetUrl: target.url,
          latencyMs: Math.max(1, Date.now() - startedAt),
          checkedAt: new Date().toISOString(),
          summary: 'Blocked unsafe redirect',
          detail: `${plan.sourceLabel} redirected to a restricted or invalid address.`,
        };
        continue;
      }

      const rawText = await response.text();
      const body =
        rawText.length > HEARTBEAT_MAX_BODY_CHARS
          ? rawText.slice(0, HEARTBEAT_MAX_BODY_CHARS)
          : rawText;
      const latencyMs = Math.max(1, Date.now() - startedAt);
      const contentType = response.headers.get('content-type');

      const result = validateHeartbeatResponseFormat({
        sourceId: plan.sourceId,
        sourceName: plan.sourceLabel,
        expectedFormat: target.expectedFormat,
        status: response.status,
        contentType,
        body,
        targetUrl: target.url,
        latencyMs,
        checkedAt: new Date().toISOString(),
      });

      if (result.status === 'healthy') {
        return result;
      }
      if (result.status === 'invalid_format' && !fallbackInvalidResult) {
        fallbackInvalidResult = result;
      } else if (!fallbackUnreachableResult) {
        fallbackUnreachableResult = result;
      }
    } catch (err) {
      const latencyMs = Math.max(1, Date.now() - startedAt);
      const isTimeout =
        (err instanceof Error && err.name === 'TimeoutError') ||
        (err instanceof Error && /timeout|timed?\s*out|aborted/i.test(err.message));

      if (!fallbackUnreachableResult) {
        fallbackUnreachableResult = {
          sourceId: plan.sourceId,
          sourceName: plan.sourceLabel,
          status: 'unreachable',
          expectedFormat: target.expectedFormat,
          receivedFormat: isTimeout ? 'Timed out' : 'Network error',
          targetUrl: target.url,
          latencyMs,
          checkedAt: new Date().toISOString(),
          summary: isTimeout ? 'Heartbeat timed out' : 'Source host unreachable',
          detail: isTimeout
            ? `${plan.sourceLabel} did not respond within ${HEARTBEAT_TIMEOUT_MS / 1000}s.`
            : `${plan.sourceLabel} could not be reached for heartbeat verification.`,
        };
      }
    }
  }

  return (
    fallbackInvalidResult ||
    fallbackUnreachableResult || {
      sourceId: plan.sourceId,
      sourceName: plan.sourceLabel,
      status: 'unreachable',
      expectedFormat: plan.targets[0]?.expectedFormat || 'unsupported',
      checkedAt: new Date().toISOString(),
      summary: 'Source host unreachable',
      detail: `${plan.sourceLabel} failed all configured heartbeat endpoints.`,
    }
  );
}

export async function checkBatchSourcesHealthServer(
  inputs: ServerHealthCheckInputSource[],
  concurrency = 4,
): Promise<SourceHealthCheckResult[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) return [];
  const results: SourceHealthCheckResult[] = new Array(inputs.length);
  const workerCount = Math.max(1, Math.min(concurrency, inputs.length));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < inputs.length) {
        const idx = cursor++;
        results[idx] = await checkSingleSourceHealthServer(inputs[idx]);
      }
    }),
  );

  return results;
}
