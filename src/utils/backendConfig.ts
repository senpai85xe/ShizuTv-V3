import type { VideoStream } from '../types/media';
import { isAndroidNativePlatform, type CapacitorRuntimeLike } from './nativeExtensionManager';

export const BACKEND_URL_STORAGE_KEY = 'shizutv_backend_base_url_v1';
export const BACKEND_CONFIG_CHANGED_EVENT = 'shizutv:backend-config-changed';

export interface BackendEnvSnapshot {
  baseUrl?: string | null;
  envBaseUrl?: string | null;
  runtimeBaseUrl?: string | null;
  isNative?: boolean;
  currentOrigin?: string | null;
}

export interface ResolveWsUrlOptions extends BackendEnvSnapshot {
  locationLike?: {
    protocol?: string;
    host?: string;
  };
}

export class BackendNotConfiguredError extends Error {
  readonly code = 'BACKEND_NOT_CONFIGURED';
  constructor(
    message = 'Backend server URL is not configured for the Android app. Open Settings → Backend Server to enter your Express backend HTTPS URL (or build with VITE_API_BASE_URL).',
  ) {
    super(message);
    this.name = 'BackendNotConfiguredError';
  }
}

export class NonJsonResponseError extends Error {
  readonly code = 'NON_JSON_RESPONSE';
  readonly status: number;
  readonly contentType: string;

  constructor(message: string, status = 200, contentType = 'text/html') {
    super(message);
    this.name = 'NonJsonResponseError';
    this.status = status;
    this.contentType = contentType;
  }
}

export class BackendConnectionError extends Error {
  readonly code = 'BACKEND_CONNECTION_FAILED';
  readonly targetUrl?: string;
  readonly isTimeout: boolean;

  constructor(message: string, options?: { targetUrl?: string; isTimeout?: boolean }) {
    super(message);
    this.name = 'BackendConnectionError';
    this.targetUrl = options?.targetUrl;
    this.isTimeout = Boolean(options?.isTimeout);
  }
}

export function isBrowserNetworkOrCorsFetchError(err: unknown): boolean {
  const rawMsg = err instanceof Error ? err.message : String(err || '');
  const normalized = rawMsg.toLowerCase();
  return (
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('load failed') ||
    normalized.includes('err_network') ||
    normalized.includes('network request failed')
  );
}

export function classifyClientBackendFetchError(
  err: unknown,
  contextLabel = 'API request',
  options?: {
    targetUrl?: string | null;
    isNative?: boolean;
    currentOrigin?: string | null;
  },
): Error {
  if (
    err instanceof BackendNotConfiguredError ||
    err instanceof NonJsonResponseError ||
    err instanceof BackendConnectionError
  ) {
    return err;
  }

  const targetUrl =
    options?.targetUrl ?? getEffectiveBackendConfig({ isNative: options?.isNative }).baseUrl;
  const isNative = isCapacitorNativeEnvironment({ isNative: options?.isNative });
  const currentOrigin =
    options?.currentOrigin ??
    (typeof window !== 'undefined' && window.location ? window.location.origin : null);

  const errName = err instanceof Error ? err.name : '';
  const rawMsg = err instanceof Error ? err.message : String(err || 'Request failed');

  if (
    errName === 'AbortError' ||
    errName === 'TimeoutError' ||
    /\btimed?\s*out\b/i.test(rawMsg)
  ) {
    const targetLabel = targetUrl ? ` (${targetUrl})` : '';
    return new BackendConnectionError(
      `Request timed out for ${contextLabel}${targetLabel}. The backend or upstream provider took too long to respond.`,
      { targetUrl: targetUrl || undefined, isTimeout: true },
    );
  }

  if (isBrowserNetworkOrCorsFetchError(err)) {
    if (targetUrl) {
      if (isNative) {
        return new BackendConnectionError(
          `Could not connect to ${targetUrl} for ${contextLabel}. Verify the server is running, reachable from this device, and allows Capacitor CORS origins.`,
          { targetUrl },
        );
      }
      let targetOrigin = targetUrl;
      try {
        targetOrigin = new URL(targetUrl).origin;
      } catch {
        // Keep raw targetUrl
      }
      if (currentOrigin && targetOrigin.toLowerCase() !== currentOrigin.toLowerCase()) {
        return new BackendConnectionError(
          `Could not connect to ${targetUrl} for ${contextLabel}. Verify the backend server is reachable and allows CORS requests from ${currentOrigin}.`,
          { targetUrl },
        );
      }
      return new BackendConnectionError(
        `Could not connect to ${targetUrl} for ${contextLabel}. Verify the Express backend server is running and reachable.`,
        { targetUrl },
      );
    }

    return new BackendConnectionError(
      `Could not reach the ShizuTv backend server for ${contextLabel}. Verify the Express server is running or configure a Backend URL in Settings → Backend Server.`,
    );
  }

  return err instanceof Error ? err : new Error(rawMsg || `Failed ${contextLabel}.`);
}

const CAPACITOR_SELF_ORIGINS = new Set([
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
]);

export function validateAndNormalizeBackendUrl(
  rawUrl: unknown,
  options?: { currentOrigin?: string | null },
): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof rawUrl !== 'string') {
    return {
      ok: false,
      error: 'Please enter a valid Express backend URL (for example, https://api.example.com).',
    };
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Backend URL cannot be empty.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: 'Enter a full URL starting with https:// or http:// (for example, https://api.example.com).',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      ok: false,
      error: 'Backend URL must use https:// (recommended) or http://.',
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: 'Backend URL must not contain embedded username or password credentials.',
    };
  }

  if (CAPACITOR_SELF_ORIGINS.has(parsed.origin.toLowerCase())) {
    return {
      ok: false,
      error:
        'Backend URL cannot point to the Android WebView origin (https://localhost or capacitor://localhost). Enter your remote Express server URL (or a port-specific URL like http://10.0.2.2:3000 for emulator testing).',
    };
  }

  const currentOrigin =
    options?.currentOrigin ??
    (typeof window !== 'undefined' && window.location ? window.location.origin : null);
  if (
    currentOrigin &&
    CAPACITOR_SELF_ORIGINS.has(currentOrigin.toLowerCase()) &&
    parsed.origin.toLowerCase() === currentOrigin.toLowerCase()
  ) {
    return {
      ok: false,
      error: 'Backend URL cannot match the local Android WebView origin.',
    };
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '').replace(/\/api$/i, '');
  return {
    ok: true,
    url: `${parsed.origin}${cleanPath}`,
  };
}

export function isCapacitorNativeEnvironment(options?: {
  isNative?: boolean;
  runtime?: CapacitorRuntimeLike | null;
  protocol?: string | null;
}): boolean {
  if (typeof options?.isNative === 'boolean') {
    return options.isNative;
  }

  if (isAndroidNativePlatform(options?.runtime)) {
    return true;
  }

  const runtime =
    options?.runtime !== undefined
      ? options.runtime
      : (globalThis as { Capacitor?: CapacitorRuntimeLike }).Capacitor;
  if (runtime && typeof runtime === 'object') {
    try {
      if (typeof runtime.isNativePlatform === 'function' && runtime.isNativePlatform() === true) {
        return true;
      }
      const platform =
        typeof runtime.getPlatform === 'function' ? runtime.getPlatform() : '';
      if (platform === 'android' || platform === 'ios') {
        return true;
      }
    } catch {
      // Ignore bridge inspection errors
    }
  }

  const proto =
    options?.protocol ??
    (typeof window !== 'undefined' && window.location ? window.location.protocol : '');
  if (proto === 'capacitor:' || proto === 'ionic:') {
    return true;
  }

  return false;
}

export function getEnvBackendUrl(rawOverride?: string | null): string | null {
  const raw =
    rawOverride !== undefined
      ? rawOverride
      : typeof import.meta !== 'undefined' &&
          (import.meta as { env?: Record<string, unknown> }).env?.VITE_API_BASE_URL
        ? String((import.meta as { env: Record<string, unknown> }).env.VITE_API_BASE_URL)
        : '';
  if (!raw || !raw.trim()) return null;
  const validated = validateAndNormalizeBackendUrl(raw);
  return validated.ok ? validated.url : null;
}

export function getRuntimeBackendUrl(): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(BACKEND_URL_STORAGE_KEY);
    if (!raw || !raw.trim()) return null;
    const validated = validateAndNormalizeBackendUrl(raw);
    return validated.ok ? validated.url : null;
  } catch {
    return null;
  }
}

export function setRuntimeBackendUrl(rawUrl: string): string {
  const validated = validateAndNormalizeBackendUrl(rawUrl);
  if (!validated.ok) {
    throw new Error(validated.error);
  }
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, validated.url);
    window.dispatchEvent(new CustomEvent(BACKEND_CONFIG_CHANGED_EVENT));
  }
  return validated.url;
}

export function clearRuntimeBackendUrl(): void {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(BACKEND_CONFIG_CHANGED_EVENT));
  }
}

export function getEffectiveBackendConfig(options?: BackendEnvSnapshot): {
  baseUrl: string | null;
  source: 'runtime' | 'env' | 'override' | 'none';
  isNative: boolean;
  runtimeBaseUrl: string | null;
  envBaseUrl: string | null;
} {
  const isNative = isCapacitorNativeEnvironment({ isNative: options?.isNative });
  const runtimeBaseUrl =
    options?.runtimeBaseUrl !== undefined
      ? (() => {
          if (!options.runtimeBaseUrl) return null;
          const v = validateAndNormalizeBackendUrl(options.runtimeBaseUrl, {
            currentOrigin: options.currentOrigin,
          });
          return v.ok ? v.url : null;
        })()
      : getRuntimeBackendUrl();

  const envBaseUrl =
    options?.envBaseUrl !== undefined
      ? getEnvBackendUrl(options.envBaseUrl)
      : getEnvBackendUrl();

  if (options?.baseUrl !== undefined) {
    if (!options.baseUrl) {
      return { baseUrl: null, source: 'none', isNative, runtimeBaseUrl, envBaseUrl };
    }
    const v = validateAndNormalizeBackendUrl(options.baseUrl, {
      currentOrigin: options.currentOrigin,
    });
    return {
      baseUrl: v.ok ? v.url : null,
      source: v.ok ? 'override' : 'none',
      isNative,
      runtimeBaseUrl,
      envBaseUrl,
    };
  }

  if (runtimeBaseUrl) {
    return {
      baseUrl: runtimeBaseUrl,
      source: 'runtime',
      isNative,
      runtimeBaseUrl,
      envBaseUrl,
    };
  }

  if (envBaseUrl) {
    return {
      baseUrl: envBaseUrl,
      source: 'env',
      isNative,
      runtimeBaseUrl,
      envBaseUrl,
    };
  }

  return {
    baseUrl: null,
    source: 'none',
    isNative,
    runtimeBaseUrl,
    envBaseUrl,
  };
}

function normalizeRelativeEndpointPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function resolveApiUrl(
  path: string,
  options?: BackendEnvSnapshot & { allowUnconfiguredRelative?: boolean },
): string {
  const trimmed = path.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const normalizedPath = normalizeRelativeEndpointPath(trimmed);
  const cfg = getEffectiveBackendConfig(options);

  if (cfg.baseUrl) {
    return `${cfg.baseUrl.replace(/\/+$/, '')}${normalizedPath}`;
  }

  if (cfg.isNative && !options?.allowUnconfiguredRelative) {
    throw new BackendNotConfiguredError();
  }

  return normalizedPath;
}

export function tryResolveApiUrl(
  path: string,
  options?: BackendEnvSnapshot,
): string | null {
  try {
    return resolveApiUrl(path, options);
  } catch (err) {
    if (err instanceof BackendNotConfiguredError) {
      return null;
    }
    throw err;
  }
}

export function resolveWsUrl(
  path = '/ws/watch-party',
  options?: ResolveWsUrlOptions,
): string {
  const normalizedPath = normalizeRelativeEndpointPath(path);
  const cfg = getEffectiveBackendConfig(options);

  if (cfg.baseUrl) {
    const parsed = new URL(cfg.baseUrl);
    const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = parsed.pathname.replace(/\/+$/, '');
    return `${wsProto}//${parsed.host}${basePath}${normalizedPath}`;
  }

  if (cfg.isNative) {
    throw new BackendNotConfiguredError(
      'Backend server URL is not configured for Watch Party on Android. Open Settings → Backend Server to set your Express backend HTTPS URL.',
    );
  }

  const loc =
    options?.locationLike ??
    (typeof window !== 'undefined' && window.location
      ? { protocol: window.location.protocol, host: window.location.host }
      : { protocol: 'http:', host: '127.0.0.1:3000' });
  const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${loc.host || '127.0.0.1:3000'}${normalizedPath}`;
}

export async function parseJsonResponseSafely<T>(
  response: Response,
  contextLabel = 'API request',
): Promise<T> {
  const contentType = (response.headers?.get('content-type') || '').toLowerCase();
  const rawText = await response.text().catch(() => '');
  const trimmed = rawText.trimStart();
  const looksLikeHtml =
    contentType.includes('text/html') ||
    /^<!doctype\s+html/i.test(trimmed) ||
    /^<html[\s>]/i.test(trimmed);

  if (looksLikeHtml) {
    throw new NonJsonResponseError(
      `Received HTML instead of JSON for ${contextLabel} (HTTP ${response.status}). Ensure your Backend Server URL points to the ShizuTv Express backend, not a static frontend.`,
      response.status,
      contentType || 'text/html',
    );
  }

  if (contentType && !contentType.includes('json')) {
    throw new NonJsonResponseError(
      `Expected JSON from backend for ${contextLabel} (HTTP ${response.status}), but received "${contentType}".`,
      response.status,
      contentType,
    );
  }

  if (!trimmed) {
    throw new NonJsonResponseError(
      `Backend returned an empty response for ${contextLabel} (HTTP ${response.status}).`,
      response.status,
      contentType || 'text/plain',
    );
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new NonJsonResponseError(
      `Backend returned invalid JSON for ${contextLabel} (HTTP ${response.status}).`,
      response.status,
      contentType || 'text/plain',
    );
  }
}

export function rewriteApiAssetUrl(
  url: string,
  options?: BackendEnvSnapshot,
): string {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return trimmed;
  if (trimmed.startsWith('/api/')) {
    return resolveApiUrl(trimmed, options);
  }
  return trimmed;
}

export function rewriteVideoStreamUrls(
  stream: VideoStream,
  options?: BackendEnvSnapshot,
): VideoStream {
  return {
    ...stream,
    url: rewriteApiAssetUrl(stream.url, options),
    ...(Array.isArray(stream.mirrors)
      ? {
          mirrors: stream.mirrors.map((mirror) => ({
            ...mirror,
            url: rewriteApiAssetUrl(mirror.url, options),
          })),
        }
      : {}),
    ...(Array.isArray(stream.subtitles)
      ? {
          subtitles: stream.subtitles.map((sub) => ({
            ...sub,
            ...(typeof sub.url === 'string'
              ? { url: rewriteApiAssetUrl(sub.url, options) }
              : {}),
          })),
        }
      : {}),
  };
}

export function rewriteMangaPagesUrls(
  pages: string[],
  options?: BackendEnvSnapshot,
): string[] {
  return pages.map((page) => rewriteApiAssetUrl(page, options));
}

export interface BackendConnectionTestResult {
  ok: boolean;
  normalizedUrl: string | null;
  latencyMs?: number;
  service?: string;
  version?: string;
  message: string;
}

export async function testBackendConnection(
  rawUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BackendConnectionTestResult> {
  const validated = validateAndNormalizeBackendUrl(rawUrl);
  if (!validated.ok) {
    return {
      ok: false,
      normalizedUrl: null,
      message: validated.error,
    };
  }

  const healthUrl = `${validated.url}/api/health`;
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const response = await fetchImpl(healthUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal:
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(8500)
          : undefined,
    });
    const elapsed = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt,
    );
    const payload = await parseJsonResponseSafely<{
      ok?: boolean;
      service?: string;
      version?: string;
      message?: string;
    }>(response, 'backend health check');

    if (!response.ok || payload.ok !== true) {
      return {
        ok: false,
        normalizedUrl: validated.url,
        latencyMs: elapsed,
        message:
          payload.message ||
          `Backend health check failed (HTTP ${response.status}).`,
      };
    }

    return {
      ok: true,
      normalizedUrl: validated.url,
      latencyMs: elapsed,
      service: payload.service,
      version: payload.version,
      message: `Connected to ${payload.service || 'ShizuTv backend'}${payload.version ? ` v${payload.version}` : ''} (${elapsed}ms).`,
    };
  } catch (err) {
    if (err instanceof NonJsonResponseError) {
      return {
        ok: false,
        normalizedUrl: validated.url,
        message: err.message,
      };
    }
    const classified = classifyClientBackendFetchError(err, 'backend health check', {
      targetUrl: validated.url,
    });
    return {
      ok: false,
      normalizedUrl: validated.url,
      message: classified.message || 'Backend connection test failed.',
    };
  }
}
