import { isSafeExternalHttpUrl } from '../utils/extensionRepoParser.ts';
import { looksLikeBlockedChallengeHtml } from '../utils/streamResolverUtils.ts';
import type { DiagnosticFailureKind } from '../utils/extensionDiagnostics.ts';

export interface ReliableFetchResult {
  status: number;
  ok: boolean;
  url: string;
  text: string;
  attempts: number;
  failureKind?: DiagnosticFailureKind;
}

export class UpstreamFetchError extends Error {
  readonly failureKind: DiagnosticFailureKind;
  readonly status?: number;
  readonly url: string;
  readonly retryable: boolean;
  readonly attempts: number;

  constructor(params: {
    message: string;
    failureKind: DiagnosticFailureKind;
    url: string;
    retryable: boolean;
    attempts: number;
    status?: number;
  }) {
    super(params.message);
    this.name = 'UpstreamFetchError';
    this.failureKind = params.failureKind;
    this.status = params.status;
    this.url = params.url;
    this.retryable = params.retryable;
    this.attempts = params.attempts;
  }
}

export function classifyHttpFailure(status: number, body = ''): DiagnosticFailureKind {
  if (looksLikeBlockedChallengeHtml(status, body) || status === 429) {
    return 'blocked_request';
  }
  if (status === 401 || status === 407) {
    return 'auth_required';
  }
  if (status === 403) {
    if (/cloudflare|turnstile|captcha|anti-bot|challenge|bot/i.test(body)) {
      return 'blocked_request';
    }
    return 'auth_required';
  }
  if (status === 426) {
    return 'unsupported_format';
  }
  return 'provider_error';
}

export function isNonRetryableHttpStatus(status: number, body = ''): boolean {
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 405 ||
    status === 407 ||
    status === 410 ||
    status === 422 ||
    status === 426 ||
    status === 429 ||
    status === 451 ||
    status === 503
  ) {
    return true;
  }
  return looksLikeBlockedChallengeHtml(status, body);
}

export function isTransientHttpStatus(status: number, body = ''): boolean {
  if (isNonRetryableHttpStatus(status, body)) return false;
  return status === 500 || status === 502 || status === 504 || status === 408;
}

export function classifyFetchException(err: unknown): {
  failureKind: DiagnosticFailureKind;
  message: string;
  retryable: boolean;
} {
  if (err instanceof UpstreamFetchError) {
    return {
      failureKind: err.failureKind,
      message: err.message,
      retryable: err.retryable,
    };
  }

  const rawMsg = err instanceof Error ? err.message : String(err || 'Request failed');
  const name = err instanceof Error ? err.name : '';
  const code =
    err && typeof err === 'object'
      ? String(
          (err as { code?: unknown; cause?: { code?: unknown } }).code ||
            (err as { cause?: { code?: unknown } }).cause?.code ||
            '',
        )
      : '';
  const combined = `${name} ${code} ${rawMsg}`.toLowerCase();

  if (
    name === 'TimeoutError' ||
    name === 'AbortError' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    /\btimeout\b|\btimed?\s*out\b|\baborted\b/.test(combined)
  ) {
    return {
      failureKind: 'timeout',
      message: rawMsg || 'Upstream request timed out',
      retryable: true,
    };
  }

  if (
    /econnrefused|econnreset|enotfound|eai_again|ehostunreach|enetunreach|err_network|socket hang up|fetch failed|networkerror/.test(
      combined,
    )
  ) {
    return {
      failureKind: 'network_error',
      message: rawMsg || 'Upstream network connection error',
      retryable: true,
    };
  }

  if (err instanceof SyntaxError || /unexpected token|json/i.test(combined)) {
    return {
      failureKind: 'malformed_response',
      message: rawMsg || 'Malformed upstream response payload',
      retryable: false,
    };
  }

  return {
    failureKind: 'provider_error',
    message: rawMsg || 'Upstream request failed',
    retryable: false,
  };
}

function delayMs(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function reliableFetchText(
  url: string,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    method?: string;
    body?: string;
  } = {},
): Promise<ReliableFetchResult> {
  if (!isSafeExternalHttpUrl(url)) {
    throw new UpstreamFetchError({
      message: `Unsafe or invalid upstream URL: ${url}`,
      failureKind: 'missing_host',
      url,
      retryable: false,
      attempts: 0,
    });
  }

  const timeoutMs = options.timeoutMs ?? 8500;
  const maxRetries = Math.max(0, Math.min(options.maxRetries ?? 1, 2));
  const retryDelayMs = options.retryDelayMs ?? 60;

  let lastResult: ReliableFetchResult | null = null;
  let lastError: UpstreamFetchError | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const res = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      const failureKind = res.ok ? undefined : classifyHttpFailure(res.status, text);
      const result: ReliableFetchResult = {
        status: res.status,
        ok: res.ok,
        url: res.url || url,
        text,
        attempts: attempt,
        ...(failureKind ? { failureKind } : {}),
      };

      if (res.ok || isNonRetryableHttpStatus(res.status, text)) {
        return result;
      }

      lastResult = result;
      if (!isTransientHttpStatus(res.status, text) || attempt > maxRetries) {
        return result;
      }
      await delayMs(retryDelayMs * attempt);
    } catch (err) {
      const classified = classifyFetchException(err);
      lastError = new UpstreamFetchError({
        message: classified.message,
        failureKind: classified.failureKind,
        url,
        retryable: classified.retryable,
        attempts: attempt,
      });

      if (!classified.retryable || attempt > maxRetries) {
        throw lastError;
      }
      await delayMs(retryDelayMs * attempt);
    }
  }

  if (lastResult) return lastResult;
  throw (
    lastError ||
    new UpstreamFetchError({
      message: `Upstream request failed for ${url}`,
      failureKind: 'network_error',
      url,
      retryable: false,
      attempts: maxRetries + 1,
    })
  );
}

export function safeJsonParse<T>(
  rawText: string,
): { ok: true; data: T } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(rawText) as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid JSON payload',
    };
  }
}
