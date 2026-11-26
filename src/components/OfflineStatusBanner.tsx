import React from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Wifi, WifiOff, X } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

export const OfflineStatusBanner: React.FC = () => {
  const { visible, variant, label, detail, retrySecondsRemaining, dismiss, retryNow } =
    useNetworkStatus();

  if (!visible || typeof document === 'undefined') {
    return null;
  }

  const isReconnecting = variant === 'reconnecting';
  const isOfflineOrUnstable = variant === 'offline' || variant === 'unstable';
  const showCountdownChip =
    isOfflineOrUnstable && typeof retrySecondsRemaining === 'number' && retrySecondsRemaining > 0;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[4.75rem] md:bottom-5 landscape:bottom-4 z-40 flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-status-indicator"
        data-network-state={variant}
        className="sx-card-animate pointer-events-auto inline-flex max-w-full items-center gap-2.5 rounded-2xl border border-[var(--sx-outline)] bg-[var(--sx-surface-container)]/90 px-3.5 py-2 text-xs text-[var(--sx-on-surface)] shadow-[0_12px_32px_-10px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300"
      >
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-xl transition-colors ${
            isReconnecting
              ? 'bg-sky-500/15 text-sky-400'
              : isOfflineOrUnstable
                ? 'bg-amber-500/15 text-amber-400'
                : 'bg-emerald-500/15 text-emerald-400'
          }`}
        >
          {isReconnecting ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : isOfflineOrUnstable ? (
            <WifiOff className="h-3.5 w-3.5" />
          ) : (
            <Wifi className="h-3.5 w-3.5" />
          )}
        </span>

        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-bold tracking-tight">{label}</span>
            {showCountdownChip && (
              <span
                data-testid="network-retry-countdown"
                className="font-mono-tabular inline-flex items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-400"
              >
                {retrySecondsRemaining}s
              </span>
            )}
          </div>
          <p className="text-[11px] font-medium text-[var(--sx-on-surface-muted)] truncate">
            {detail}
          </p>
        </div>

        {isOfflineOrUnstable && (
          <button
            type="button"
            data-testid="network-retry-now-btn"
            onClick={retryNow}
            aria-label="Reconnect now"
            className="ml-0.5 inline-flex items-center gap-1 rounded-lg bg-[var(--sx-surface-high)] px-2 py-1 text-[10px] font-extrabold text-[var(--sx-on-surface)] transition-colors hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)] shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        )}

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss network status notice"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[var(--sx-on-surface-muted)] transition-colors hover:bg-[var(--sx-surface-high)] hover:text-[var(--sx-on-surface)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
};
