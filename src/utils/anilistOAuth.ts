export const ANILIST_AUTHORIZE_URL = 'https://anilist.co/api/v2/oauth/authorize';
export const ANILIST_TOKEN_URL = 'https://anilist.co/api/v2/oauth/token';
export const ANILIST_OAUTH_CALLBACK_PATH = '/auth/callback';
export const ANILIST_OAUTH_SESSION_STORAGE_KEY = 'shizutv_anilist_oauth_session_v1';

export type AniListOAuthFlow = 'code' | 'token';

export interface AniListOAuthSession {
  accessToken: string;
  tokenType: string;
  obtainedAt: string;
  expiresAt: string | null;
}

export type AniListOAuthPopupResult =
  | {
      type: 'ANILIST_OAUTH_SUCCESS';
      accessToken: string;
      expiresIn: number | null;
      state: string | null;
    }
  | {
      type: 'ANILIST_OAUTH_ERROR';
      error: string;
      errorDescription: string | null;
      state: string | null;
    };

export function normalizeBaseAppUrl(rawUrl: string | undefined | null): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveAniListRedirectUri(
  appUrl?: string | null,
  fallbackOrigin?: string | null,
): string {
  const base =
    normalizeBaseAppUrl(appUrl) ||
    normalizeBaseAppUrl(fallbackOrigin) ||
    'http://localhost:3000';
  return `${base}${ANILIST_OAUTH_CALLBACK_PATH}`;
}

export function buildAniListAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  responseType?: AniListOAuthFlow;
}): string {
  const clientId = params.clientId.trim();
  if (!clientId) {
    throw new Error('AniList OAuth client_id is required.');
  }
  const responseType = params.responseType === 'token' ? 'token' : 'code';
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: responseType,
    state: params.state,
  });
  return `${ANILIST_AUTHORIZE_URL}?${query.toString()}`;
}

export function isTrustedOAuthMessageOrigin(
  origin: string,
  currentOrigin?: string | null,
  extraTrustedOrigin?: string | null,
): boolean {
  if (typeof origin !== 'string' || !origin.trim()) return false;
  if (currentOrigin && origin === currentOrigin) return true;
  if (extraTrustedOrigin && origin === extraTrustedOrigin) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.run.app')
    );
  } catch {
    return false;
  }
}

export function parseOAuthPopupMessage(data: unknown): AniListOAuthPopupResult | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.type === 'ANILIST_OAUTH_SUCCESS') {
    const accessToken =
      typeof record.accessToken === 'string' ? record.accessToken.trim() : '';
    if (!accessToken) return null;
    const rawExpires = record.expiresIn;
    const expiresIn =
      typeof rawExpires === 'number' && Number.isFinite(rawExpires) && rawExpires > 0
        ? Math.floor(rawExpires)
        : null;
    const state =
      typeof record.state === 'string' && record.state.trim() ? record.state.trim() : null;
    return {
      type: 'ANILIST_OAUTH_SUCCESS',
      accessToken,
      expiresIn,
      state,
    };
  }

  if (record.type === 'ANILIST_OAUTH_ERROR') {
    const error =
      typeof record.error === 'string' && record.error.trim()
        ? record.error.trim()
        : 'oauth_error';
    const errorDescription =
      typeof record.errorDescription === 'string' && record.errorDescription.trim()
        ? record.errorDescription.trim()
        : null;
    const state =
      typeof record.state === 'string' && record.state.trim() ? record.state.trim() : null;
    return {
      type: 'ANILIST_OAUTH_ERROR',
      error,
      errorDescription,
      state,
    };
  }

  return null;
}

export function computeTokenExpiryIso(
  expiresInSeconds?: number | null,
  nowMs = Date.now(),
): string | null {
  if (
    typeof expiresInSeconds !== 'number' ||
    !Number.isFinite(expiresInSeconds) ||
    expiresInSeconds <= 0
  ) {
    return null;
  }
  return new Date(nowMs + expiresInSeconds * 1000).toISOString();
}

export function isAniListTokenExpired(
  expiresAtIso?: string | null,
  nowMs = Date.now(),
  skewMs = 60_000,
): boolean {
  if (!expiresAtIso) return false;
  const parsed = Date.parse(expiresAtIso);
  if (!Number.isFinite(parsed)) return false;
  return parsed - skewMs <= nowMs;
}

export function parseStoredAniListSession(
  raw: string | null | undefined,
  nowMs = Date.now(),
): AniListOAuthSession | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AniListOAuthSession>;
    const accessToken =
      typeof parsed.accessToken === 'string' ? parsed.accessToken.trim() : '';
    if (!accessToken) return null;
    const expiresAt = typeof parsed.expiresAt === 'string' ? parsed.expiresAt : null;
    if (isAniListTokenExpired(expiresAt, nowMs)) {
      return null;
    }
    return {
      accessToken,
      tokenType:
        typeof parsed.tokenType === 'string' && parsed.tokenType.trim()
          ? parsed.tokenType.trim()
          : 'Bearer',
      obtainedAt:
        typeof parsed.obtainedAt === 'string' && parsed.obtainedAt.trim()
          ? parsed.obtainedAt
          : new Date(nowMs).toISOString(),
      expiresAt,
    };
  } catch {
    return null;
  }
}

export function serializeAniListSession(
  input: { accessToken: string; expiresIn?: number | null; tokenType?: string },
  nowMs = Date.now(),
): AniListOAuthSession {
  const accessToken = input.accessToken.trim();
  if (!accessToken) {
    throw new Error('Cannot persist an empty AniList access token.');
  }
  return {
    accessToken,
    tokenType: input.tokenType?.trim() || 'Bearer',
    obtainedAt: new Date(nowMs).toISOString(),
    expiresAt: computeTokenExpiryIso(input.expiresIn ?? null, nowMs),
  };
}

export function extractAniListTokenFromInput(rawInput: string): {
  accessToken: string;
  expiresIn: number | null;
} | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const parseQueryLike = (paramString: string): { accessToken: string; expiresIn: number | null } | null => {
    const params = new URLSearchParams(paramString);
    const token = params.get('access_token')?.trim();
    if (!token) return null;
    const expiresRaw = params.get('expires_in');
    const expiresNum = expiresRaw ? Number(expiresRaw) : NaN;
    return {
      accessToken: token,
      expiresIn: Number.isFinite(expiresNum) && expiresNum > 0 ? Math.floor(expiresNum) : null,
    };
  };

  if (trimmed.includes('access_token=')) {
    const hashIdx = trimmed.indexOf('#');
    if (hashIdx >= 0) {
      const fromHash = parseQueryLike(trimmed.slice(hashIdx + 1));
      if (fromHash) return fromHash;
    }
    const queryIdx = trimmed.indexOf('?');
    if (queryIdx >= 0) {
      const fromQuery = parseQueryLike(trimmed.slice(queryIdx + 1));
      if (fromQuery) return fromQuery;
    }
    const cleaned = trimmed.replace(/^#/, '');
    const direct = parseQueryLike(cleaned);
    if (direct) return direct;
  }

  // If user pasted a URL that lacks access_token=, do not treat the raw URL as a JWT token
  if (/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  return { accessToken: trimmed, expiresIn: null };
}

export function extractAniListCodeFromInput(rawInput: string): {
  code: string;
  redirectUri: string | null;
} | null {
  const trimmed = rawInput.trim();
  if (!trimmed || !trimmed.includes('code=')) return null;

  try {
    const parsed = new URL(trimmed);
    const code = parsed.searchParams.get('code')?.trim();
    if (code) {
      return {
        code,
        redirectUri: `${parsed.origin}${parsed.pathname}`,
      };
    }
  } catch {
    // Allow raw query string fallback (?code=... or code=...)
    const cleaned = trimmed.replace(/^\?/, '');
    const params = new URLSearchParams(cleaned);
    const code = params.get('code')?.trim();
    if (code) {
      return { code, redirectUri: null };
    }
  }

  return null;
}
