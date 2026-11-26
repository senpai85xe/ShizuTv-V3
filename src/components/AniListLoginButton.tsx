import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, KeyRound, Loader2, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  AniListOAuthNotConfiguredError,
  buildAniListTokenAuthorizeUrl,
  fetchAniListAuthorizeUrl,
  fetchAniListOAuthStatus,
  getExpectedAniListCallbackUrl,
  type AniListAuthUrlResponse,
} from '../services/anilistAuth';
import { SmartImage } from './SmartImage';

interface AniListAccountCardProps {
  roundness?: string;
  onManageClick?: () => void;
  showManageLink?: boolean;
  loginButtonTestId?: string;
  logoutButtonTestId?: string;
}

export const AniListAccountCard: React.FC<AniListAccountCardProps> = ({
  roundness = '20px',
  onManageClick,
  showManageLink = false,
  loginButtonTestId = 'settings-anilist-login-btn',
  logoutButtonTestId = 'settings-anilist-logout-btn',
}) => {
  const { state, loginWithAniList, logoutAniList, connectAniListToken } = useApp();
  const [preloadedAuth, setPreloadedAuth] = useState<AniListAuthUrlResponse | null>(null);
  const [configuredClientId, setConfiguredClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingConfigUri, setMissingConfigUri] = useState<string | null>(null);
  const [showManualToken, setShowManualToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  const isConnected = Boolean(state.anilistToken);
  const anilistProfile = state.profiles.anilist;

  const refreshPreloadedAuth = useCallback(async () => {
    try {
      const [status, res] = await Promise.all([
        fetchAniListOAuthStatus().catch(() => null),
        fetchAniListAuthorizeUrl(),
      ]);
      if (status?.clientId) {
        setConfiguredClientId(status.clientId);
      }
      setPreloadedAuth(res);
      setMissingConfigUri(null);
    } catch (err) {
      setPreloadedAuth(null);
      if (err instanceof AniListOAuthNotConfiguredError) {
        setMissingConfigUri(err.redirectUri);
      }
    }
  }, []);

  useEffect(() => {
    if (!isConnected) {
      void refreshPreloadedAuth();
    }
  }, [isConnected, refreshPreloadedAuth]);

  const tokenAuthorizeUrl = buildAniListTokenAuthorizeUrl(configuredClientId);

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    const authSnapshot = preloadedAuth;
    setPreloadedAuth(null);
    try {
      await loginWithAniList(authSnapshot);
    } catch (err) {
      if (err instanceof AniListOAuthNotConfiguredError) {
        setMissingConfigUri(err.redirectUri);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'AniList OAuth2 login failed.');
      }
      void refreshPreloadedAuth();
    } finally {
      setBusy(false);
    }
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await connectAniListToken(tokenInput);
      setTokenInput('');
      setShowManualToken(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid AniList token.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setError(null);
    try {
      await logoutAniList();
    } finally {
      setBusy(false);
      void refreshPreloadedAuth();
    }
  };

  return (
    <div
      data-testid="settings-anilist-card"
      style={{ borderRadius: roundness }}
      className="p-4 sm:p-5 sx-glass-panel border border-[var(--sx-outline)] space-y-3"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-[#02A9FF]/15 text-[#02A9FF] flex items-center justify-center font-black text-base overflow-hidden shrink-0">
            {anilistProfile?.avatarUrl ? (
              <SmartImage
                src={anilistProfile.avatarUrl}
                alt={anilistProfile.username}
                className="w-full h-full object-cover"
              />
            ) : (
              'AL'
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-extrabold text-[var(--sx-on-surface)]">
                AniList Account
              </span>
              {isConnected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-500">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Session Persisted</span>
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--sx-on-surface-muted)] truncate mt-0.5">
              {isConnected
                ? anilistProfile
                  ? `Signed in as @${anilistProfile.username} · Cloud library sync active`
                  : 'OAuth2 session token active in storage'
                : 'Sign in with AniList OAuth2 to sync watchlist, progress, and ratings'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {showManageLink && onManageClick && (
            <button
              type="button"
              onClick={onManageClick}
              className="px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors"
            >
              Trackers
            </button>
          )}
          {!isConnected && (
            <button
              type="button"
              data-testid="settings-anilist-manual-toggle"
              onClick={() => setShowManualToken((v) => !v)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Token</span>
              {showManualToken ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          )}
          {isConnected ? (
            <button
              type="button"
              data-testid={logoutButtonTestId}
              disabled={busy}
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/12 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              <span>Log out</span>
            </button>
          ) : (
            <button
              type="button"
              data-testid={loginButtonTestId}
              disabled={busy}
              onClick={handleLogin}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#02A9FF]/16 dark:bg-[#02A9FF]/22 hover:bg-[#02A9FF]/24 dark:hover:bg-[#02A9FF]/30 backdrop-blur-md border border-[#02A9FF]/38 text-[#0284C7] dark:text-[#38BDF8] text-xs font-extrabold shadow-[0_6px_18px_-6px_rgba(2,169,255,0.28)] transition-[background-color,border-color,transform] duration-200 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogIn className="w-3.5 h-3.5" />
              )}
              <span>{busy ? 'Authorizing...' : 'Login with AniList'}</span>
            </button>
          )}
        </div>
      </div>

      {!isConnected && showManualToken && (
        <form
          onSubmit={handleManualTokenSubmit}
          className="pt-2.5 border-t border-[var(--sx-outline)] space-y-2"
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              data-testid="settings-anilist-manual-input"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste Bearer token or full redirect URL (#access_token=... / ?code=...)"
              className="flex-1 px-3.5 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-medium outline-none focus:border-[var(--sx-primary)]"
            />
            <button
              type="submit"
              data-testid="settings-anilist-manual-submit"
              disabled={busy || !tokenInput.trim()}
              className="px-4 py-2 rounded-xl sx-glass-cta text-xs font-bold disabled:opacity-50"
            >
              Save Token
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <a
              href={tokenAuthorizeUrl}
              target="_blank"
              rel="noreferrer"
              data-testid="settings-anilist-token-link"
              className="inline-flex items-center gap-1.5 font-bold text-[var(--sx-primary)] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open AniList Token Authorization</span>
            </a>
            <span className="text-[var(--sx-on-surface-muted)]">
              After authorizing, copy the full address bar URL and paste it above.
            </span>
          </div>
        </form>
      )}

      {error && (
        <div
          data-testid="settings-anilist-error"
          className="px-3.5 py-2.5 rounded-xl bg-rose-500/12 border border-rose-500/30 text-xs font-semibold text-rose-400 space-y-1"
        >
          <p>{error}</p>
          {missingConfigUri && (
            <p className="text-[11px] font-mono text-[var(--sx-on-surface-muted)] break-all">
              Redirect URI: {missingConfigUri || getExpectedAniListCallbackUrl()}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
