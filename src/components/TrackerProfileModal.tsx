import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X, LogIn, LogOut, UserCheck, ExternalLink, Settings } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { SmartImage } from './SmartImage';

interface TrackerProfileModalProps {
  open: boolean;
  onClose: () => void;
}

export const TrackerProfileModal: React.FC<TrackerProfileModalProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const {
    state,
    connectAniListToken,
    loginWithAniList,
    logoutAniList,
    setPrimaryTracker,
  } = useApp();
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const activeProfile = state.profiles[state.primaryTracker] || state.profiles.local;

  const handleOAuthConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithAniList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AniList OAuth2 login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await connectAniListToken(tokenInput);
      setTokenInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect AniList');
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Account and Tracker Profile"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg sx-glass-modal border border-[var(--sx-outline)] rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl sx-sheet-enter"
      >
        {activeProfile?.bannerUrl && (
          <div className="h-28 w-full relative">
            <SmartImage
              src={activeProfile.bannerUrl}
              alt="Profile banner"
              className="w-full h-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--sx-surface-container)] to-transparent" />
          </div>
        )}

        <div className="p-5 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-[var(--sx-primary-container)] flex items-center justify-center shrink-0">
                {activeProfile?.avatarUrl ? (
                  <SmartImage src={activeProfile.avatarUrl} alt={activeProfile.username} className="w-full h-full" />
                ) : (
                  <UserCheck className="w-6 h-6 text-[var(--sx-primary)]" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-extrabold">{activeProfile?.username || 'Guest'}</h2>
                <p className="text-xs text-[var(--sx-on-surface-muted)]">
                  Primary Tracker: <span className="font-bold uppercase">{state.primaryTracker}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--sx-surface-high)] text-[var(--sx-on-surface-muted)]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {state.profiles.anilist && (
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl sx-glass-control border border-[var(--sx-outline)]/60 text-center tabular-nums">
              <div>
                <p className="text-base font-extrabold">{state.profiles.anilist.animeCount ?? 0}</p>
                <p className="text-[11px] text-[var(--sx-on-surface-muted)]">Anime</p>
              </div>
              <div>
                <p className="text-base font-extrabold">{state.profiles.anilist.episodesWatched ?? 0}</p>
                <p className="text-[11px] text-[var(--sx-on-surface-muted)]">Episodes</p>
              </div>
              <div>
                <p className="text-base font-extrabold">{state.profiles.anilist.chaptersRead ?? 0}</p>
                <p className="text-[11px] text-[var(--sx-on-surface-muted)]">Chapters</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--sx-on-surface-muted)]">Active Tracker</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPrimaryTracker('local')}
                className={`p-2.5 rounded-xl border text-xs font-bold ${
                  state.primaryTracker === 'local'
                    ? 'border-[var(--sx-primary)] bg-[var(--sx-primary-container)]/25'
                    : 'border-[var(--sx-outline)]'
                }`}
              >
                Local Tracker
              </button>
              <button
                type="button"
                disabled={!state.anilistToken}
                onClick={() => setPrimaryTracker('anilist')}
                className={`p-2.5 rounded-xl border text-xs font-bold disabled:opacity-50 ${
                  state.primaryTracker === 'anilist'
                    ? 'border-[var(--sx-primary)] bg-[var(--sx-primary-container)]/25'
                    : 'border-[var(--sx-outline)]'
                }`}
              >
                AniList Cloud
              </button>
            </div>
          </div>

          {!state.anilistToken ? (
            <div className="space-y-3 pt-2 border-t border-[var(--sx-outline)]">
              <button
                type="button"
                disabled={loading}
                onClick={handleOAuthConnect}
                className="w-full py-2.5 px-4 rounded-xl bg-[#02A9FF] text-white text-xs font-extrabold inline-flex items-center justify-center gap-2 hover:opacity-92 transition-opacity disabled:opacity-55"
              >
                <LogIn className="w-4 h-4" />
                <span>{loading ? 'Authorizing...' : 'Login with AniList (OAuth2)'}</span>
              </button>
              <form onSubmit={handleConnect} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold">Or Paste Access Token</label>
                  <a
                    href="https://anilist.co/settings/developer"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--sx-primary)] hover:underline"
                  >
                    <span>AniList Developer</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste Bearer token or full redirect URL..."
                    className="flex-1 px-3 py-2 text-xs rounded-xl sx-glass-control border border-[var(--sx-outline)] focus:outline-none focus:border-[var(--sx-primary)]"
                  />
                  <button
                    type="submit"
                    disabled={loading || !tokenInput.trim()}
                    className="px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-bold disabled:opacity-50"
                  >
                    {loading ? 'Connecting...' : 'Connect'}
                  </button>
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
              </form>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-2 border-t border-[var(--sx-outline)]">
              <button
                type="button"
                onClick={() => void logoutAniList()}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300"
              >
                <LogOut className="w-4 h-4" />
                <span>Disconnect AniList</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/settings/tracking');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--sx-primary)]"
              >
                <Settings className="w-4 h-4" />
                <span>Tracking Settings</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
