export const DEFAULT_CAPACITOR_ALLOWED_ORIGINS = [
  'https://localhost',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
] as const;

export interface OriginPatternMatcher {
  protocol: 'http:' | 'https:';
  suffix: string;
}

export interface CorsMatchOptions {
  requestHost?: string | null;
  extraOrigins?: string | null;
  allowRunAppOrigins?: boolean;
}

export function normalizeOriginEntry(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '*' || trimmed.includes('*')) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password) return null;
    if (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'capacitor:' ||
      parsed.protocol === 'ionic:'
    ) {
      return parsed.origin.toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

export function parseOriginPatternEntry(
  raw: string | undefined | null,
): OriginPatternMatcher | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('*')) return null;

  const match = trimmed.match(/^(https?):\/\/\*\.([a-z0-9.-]+)(?::\d+)?\/?$/i);
  if (!match) return null;

  const protocol = `${match[1].toLowerCase()}:` as 'http:' | 'https:';
  const suffixDomain = match[2].replace(/\.+$/, '');
  // Require at least two domain labels (e.g. *.run.app or *.example.com) so *.com / * is rejected
  const labels = suffixDomain.split('.').filter(Boolean);
  if (labels.length < 2) return null;

  return {
    protocol,
    suffix: `.${suffixDomain}`,
  };
}

export function getCorsOriginPatterns(extraOrigins?: string | null): OriginPatternMatcher[] {
  if (typeof extraOrigins !== 'string' || !extraOrigins.trim()) {
    return [];
  }
  const patterns: OriginPatternMatcher[] = [];
  for (const part of extraOrigins.split(',')) {
    const parsed = parseOriginPatternEntry(part);
    if (parsed) {
      patterns.push(parsed);
    }
  }
  return patterns;
}

export function isTrustedRunAppOrigin(originHeader: string | undefined | null): boolean {
  if (typeof originHeader !== 'string' || !originHeader.trim()) return false;
  try {
    const parsed = new URL(originHeader.trim());
    if (parsed.username || parsed.password) return false;
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase().endsWith('.run.app');
  } catch {
    return false;
  }
}

export function getAllowedCorsOrigins(options?: {
  appUrl?: string | null;
  extraOrigins?: string | null;
  port?: number;
}): Set<string> {
  const allowed = new Set<string>(DEFAULT_CAPACITOR_ALLOWED_ORIGINS);
  const port = options?.port ?? 3000;
  allowed.add(`http://localhost:${port}`);
  allowed.add(`http://127.0.0.1:${port}`);

  const appOrigin = normalizeOriginEntry(options?.appUrl);
  if (appOrigin) {
    allowed.add(appOrigin);
  }

  if (typeof options?.extraOrigins === 'string' && options.extraOrigins.trim()) {
    for (const part of options.extraOrigins.split(',')) {
      const normalized = normalizeOriginEntry(part);
      if (normalized) {
        allowed.add(normalized);
      }
    }
  }

  return allowed;
}

export function isAllowedCorsOrigin(
  originHeader: string | undefined | null,
  allowedOrigins: Set<string>,
  options?: CorsMatchOptions,
): string | null {
  if (typeof originHeader !== 'string' || !originHeader.trim()) {
    return null;
  }
  const trimmed = originHeader.trim();
  const normalized = trimmed.toLowerCase();
  if (allowedOrigins.has(normalized)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.username || parsed.password) {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  // Same-host request matching (handles proxied deployments even if APP_URL env var is omitted)
  const rawRequestHost =
    typeof options?.requestHost === 'string'
      ? options.requestHost.split(',')[0]?.trim().toLowerCase()
      : '';
  if (rawRequestHost && parsed.host.toLowerCase() === rawRequestHost) {
    return trimmed;
  }

  // Broad *.run.app acceptance is disabled by default; require explicit opt-in via allowRunAppOrigins: true
  // or explicit origin entries in APP_URL / CORS_ALLOWED_ORIGINS
  if (
    options?.allowRunAppOrigins === true &&
    parsed.protocol === 'https:' &&
    parsed.hostname.toLowerCase().endsWith('.run.app')
  ) {
    return trimmed;
  }

  // Configured wildcard subdomain patterns in CORS_ALLOWED_ORIGINS (e.g. https://*.example.com)
  const patterns = getCorsOriginPatterns(options?.extraOrigins);
  const hostnameLower = parsed.hostname.toLowerCase();
  for (const pattern of patterns) {
    if (parsed.protocol === pattern.protocol && hostnameLower.endsWith(pattern.suffix)) {
      return trimmed;
    }
  }

  return null;
}

export function buildApiCorsHeaders(
  originHeader: string | undefined | null,
  allowedOrigins: Set<string>,
  options?: CorsMatchOptions,
): Record<string, string> {
  const matchedOrigin = isAllowedCorsOrigin(originHeader, allowedOrigins, options);
  if (!matchedOrigin) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': matchedOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Range',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    'Access-Control-Max-Age': '86400',
  };
}
