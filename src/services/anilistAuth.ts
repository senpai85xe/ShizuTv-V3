import {
  ANILIST_AUTHORIZE_URL,
  ANILIST_OAUTH_SESSION_STORAGE_KEY,
  type AniListOAuthFlow,
  type AniListOAuthSession,
  extractAniListCodeFromInput,
  extractAniListTokenFromInput,
  isTrustedOAuthMessageOrigin,
  parseOAuthPopupMessage,
  parseStoredAniListSession,
  resolveAniListRedirectUri,
  serializeAniListSession,
} from '../utils/anilistOAuth';
import {
  getEffectiveBackendConfig,
  parseJsonResponseSafely,
  resolveApiUrl,
  tryResolveApiUrl,
} from '../utils/backendConfig';

export interface AniListOAuthStatus {
  configured: boolean;
  hasSecret: boolean;
  clientId?: string | null;
  flow: AniListOAuthFlow;
  redirectUri: string;
  authenticated: boolean;
}

export interface AniListAuthUrlResponse {
  url: string;
  state: string;
  redirectUri: string;
  configured: boolean;
  flow: AniListOAuthFlow;
}

export function buildAniListTokenAuthorizeUrl(clientId?: string | null): string {
  const envClientId =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_ANILIST_CLIENT_ID
      ? String(import.meta.env.VITE_ANILIST_CLIENT_ID).trim()
      : '';
  const resolvedId = (clientId || envClientId).trim();
  if (!resolvedId) {
    return 'https://anilist.co/settings/developer';
  }
  const params = new URLSearchParams({
    client_id: resolvedId,
    response_type: 'token',
  });
  return `${ANILIST_AUTHORIZE_URL}?${params.toString()}`;
}

export async function resolveAniListInputToToken(
  rawInput: string,
  explicitExpiresIn?: number | null,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const codeMatch = extractAniListCodeFromInput(rawInput);
  if (codeMatch) {
    const backendOrigin = getEffectiveBackendConfig().baseUrl;
    const response = await fetch(resolveApiUrl('/api/auth/anilist/exchange-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        code: codeMatch.code,
        redirectUri: codeMatch.redirectUri,
        origin:
          backendOrigin || (typeof window !== 'undefined' ? window.location.origin : undefined),
      }),
    });
    const payload = await parseJsonResponseSafely<{
      accessToken?: string;
      expiresIn?: number | null;
      message?: string;
    }>(response, 'AniList OAuth code exchange');
    if (!response.ok || !payload.accessToken) {
      throw new Error(
        payload.message || 'Could not exchange the authorization code from that URL.',
      );
    }
    return {
      accessToken: payload.accessToken,
      expiresIn: payload.expiresIn ?? explicitExpiresIn ?? null,
    };
  }

  const extracted = extractAniListTokenFromInput(rawInput);
  if (!extracted) {
    throw new Error(
      'No AniList access token found in that text. Paste a Bearer JWT token or a URL containing #access_token=...',
    );
  }

  return {
    accessToken: extracted.accessToken,
    expiresIn: explicitExpiresIn ?? extracted.expiresIn,
  };
}

export class AniListOAuthNotConfiguredError extends Error {
  readonly redirectUri: string;
  constructor(message: string, redirectUri: string) {
    super(message);
    this.name = 'AniListOAuthNotConfiguredError';
    this.redirectUri = redirectUri;
  }
}

export function getStoredAniListSession(): AniListOAuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ANILIST_OAUTH_SESSION_STORAGE_KEY);
    const parsed = parseStoredAniListSession(raw);
    if (!parsed && raw) {
      window.localStorage.removeItem(ANILIST_OAUTH_SESSION_STORAGE_KEY);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getStoredAniListToken(): string | null {
  return getStoredAniListSession()?.accessToken ?? null;
}

export function persistAniListSession(input: {
  accessToken: string;
  expiresIn?: number | null;
  tokenType?: string;
}): AniListOAuthSession {
  const session = serializeAniListSession(input);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ANILIST_OAUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }
  return session;
}

export function clearAniListSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ANILIST_OAUTH_SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
}

export function getExpectedAniListCallbackUrl(): string {
  const backendOrigin = getEffectiveBackendConfig().baseUrl;
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
  return resolveAniListRedirectUri(backendOrigin, currentOrigin);
}

export async function fetchAniListOAuthStatus(): Promise<AniListOAuthStatus> {
  const backendOrigin = getEffectiveBackendConfig().baseUrl;
  const requestOrigin =
    backendOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  const originParam = requestOrigin ? `?origin=${encodeURIComponent(requestOrigin)}` : '';
  const response = await fetch(resolveApiUrl(`/api/auth/anilist/status${originParam}`), {
    credentials: 'include',
  });
  const payload = await parseJsonResponseSafely<AniListOAuthStatus & { message?: string }>(
    response,
    'AniList OAuth status',
  );
  if (!response.ok) {
    throw new Error(payload.message || 'Unable to inspect AniList OAuth configuration.');
  }
  return payload;
}

export async function fetchAniListAuthorizeUrl(): Promise<AniListAuthUrlResponse> {
  const backendOrigin = getEffectiveBackendConfig().baseUrl;
  const requestOrigin =
    backendOrigin || (typeof window !== 'undefined' ? window.location.origin : '');
  const originParam = requestOrigin ? `?origin=${encodeURIComponent(requestOrigin)}` : '';
  const response = await fetch(resolveApiUrl(`/api/auth/anilist/url${originParam}`), {
    credentials: 'include',
  });
  const payload = await parseJsonResponseSafely<
    Partial<AniListAuthUrlResponse> & { message?: string }
  >(response, 'AniList OAuth authorize URL');
  if (payload.configured === false) {
    const redirectUri = payload.redirectUri || getExpectedAniListCallbackUrl();
    throw new AniListOAuthNotConfiguredError(
      payload.message ||
        'AniList OAuth Client ID is not configured yet. Set ANILIST_CLIENT_ID in AI Studio environment variables.',
      redirectUri,
    );
  }
  if (!response.ok || !payload.url) {
    const redirectUri = payload.redirectUri || getExpectedAniListCallbackUrl();
    if (response.status === 400) {
      throw new AniListOAuthNotConfiguredError(
        payload.message ||
          'AniList OAuth Client ID is not configured yet. Set ANILIST_CLIENT_ID in AI Studio environment variables.',
        redirectUri,
      );
    }
    throw new Error(payload.message || 'Failed to prepare AniList OAuth login URL.');
  }
  return payload as AniListAuthUrlResponse;
}

export async function persistAniListServerCookieSession(
  accessToken: string,
  expiresIn?: number | null,
): Promise<void> {
  try {
    const endpoint = tryResolveApiUrl('/api/auth/anilist/session');
    if (!endpoint) return;
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ accessToken, expiresIn: expiresIn ?? null }),
    });
  } catch {
    // Server session cookie sync is best-effort when running offline/fallback
  }
}

export async function restoreAniListSessionFromServer(): Promise<AniListOAuthSession | null> {
  try {
    const endpoint = tryResolveApiUrl('/api/auth/anilist/session');
    if (!endpoint) return null;
    const response = await fetch(endpoint, {
      credentials: 'include',
    });
    if (!response.ok) return null;
    const data = await parseJsonResponseSafely<{
      accessToken?: string | null;
      expiresIn?: number | null;
    }>(response, 'AniList session restore');
    if (!data.accessToken || typeof data.accessToken !== 'string') {
      return null;
    }
    return persistAniListSession({
      accessToken: data.accessToken,
      expiresIn: data.expiresIn ?? null,
    });
  } catch {
    return null;
  }
}

export async function clearAniListServerCookieSession(): Promise<void> {
  clearAniListSession();
  try {
    const endpoint = tryResolveApiUrl('/api/auth/anilist/logout');
    if (!endpoint) return;
    await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Ignore transient network failures on logout
  }
}

function waitForAniListPopupCallback(
  popup: Window,
  expectedState: string,
  timeoutMs = 180_000,
): Promise<{ accessToken: string; expiresIn: number | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const currentOrigin = window.location.origin;
    const backendOrigin = getEffectiveBackendConfig().baseUrl;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(closedPollId);
      window.clearTimeout(timeoutId);
    };

    const onMessage = (event: MessageEvent) => {
      if (!isTrustedOAuthMessageOrigin(event.origin, currentOrigin, backendOrigin)) {
        return;
      }
      const parsed = parseOAuthPopupMessage(event.data);
      if (!parsed) return;

      if (parsed.state && expectedState && parsed.state !== expectedState) {
        return;
      }

      if (parsed.type === 'ANILIST_OAUTH_ERROR') {
        settled = true;
        cleanup();
        try {
          if (!popup.closed) popup.close();
        } catch {
          // Ignore cross-origin close error
        }
        reject(
          new Error(
            parsed.errorDescription || `AniList authorization failed (${parsed.error}).`,
          ),
        );
        return;
      }

      if (parsed.type === 'ANILIST_OAUTH_SUCCESS') {
        settled = true;
        cleanup();
        try {
          if (!popup.closed) popup.close();
        } catch {
          // Ignore cross-origin close error
        }
        resolve({
          accessToken: parsed.accessToken,
          expiresIn: parsed.expiresIn,
        });
      }
    };

    window.addEventListener('message', onMessage);

    const closedPollId = window.setInterval(() => {
      if (settled) return;
      try {
        if (popup.closed) {
          settled = true;
          cleanup();
          reject(new Error('AniList login popup was closed before authorization completed.'));
        }
      } catch {
        // Ignore COOP checks while popup navigates
      }
    }, 450);

    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try {
        if (!popup.closed) popup.close();
      } catch {
        // Ignore close failure
      }
      reject(new Error('AniList authorization timed out. Please try again.'));
    }, timeoutMs);
  });
}

/**
 * Initiates AniList OAuth2 popup authentication directly against AniList's authorization URL,
 * persists the returned bearer token locally & in the server cookie, and resolves the session.
 */
export async function loginWithAniListOAuth(
  preloadedAuth?: AniListAuthUrlResponse | null,
): Promise<AniListOAuthSession> {
  if (typeof window === 'undefined') {
    throw new Error('AniList OAuth login requires a browser environment.');
  }

  const authPayload = preloadedAuth ?? (await fetchAniListAuthorizeUrl());

  const popup = window.open(
    authPayload.url,
    'shizutv_anilist_oauth',
    'width=580,height=740,menubar=no,toolbar=no,location=yes,status=no',
  );

  if (!popup) {
    throw new Error(
      'Popup was blocked by your browser. Please allow popups for this site and click Login with AniList again.',
    );
  }

  const { accessToken, expiresIn } = await waitForAniListPopupCallback(popup, authPayload.state);
  const session = persistAniListSession({ accessToken, expiresIn });
  await persistAniListServerCookieSession(accessToken, expiresIn);
  return session;
}
