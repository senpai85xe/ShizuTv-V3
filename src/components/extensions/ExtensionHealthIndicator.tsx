import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  Loader2,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import {
  formatExpectedFormatLabel,
  type SourceHealthCheckResult,
  type SourceHealthSummaryCounts,
} from '../../utils/sourceHealthCheck';
import {
  EXT_FROSTED_ACTIVE_BUBBLE,
  EXT_FROSTED_ICON_BTN,
  EXT_FROSTED_SURFACE,
} from './ExtensionsUiPrimitives';

interface SourceHealthStatusBarProps {
  counts: SourceHealthSummaryCounts;
  running: boolean;
  onRunHealthCheck: () => void;
}

export const SourceHealthStatusBar: React.FC<SourceHealthStatusBarProps> = ({
  counts,
  running,
  onRunHealthCheck,
}) => {
  const hasFormatFailures = counts.invalidFormat > 0;
  const hasUnreachable = counts.unreachable > 0;
  const hasIssues = hasFormatFailures || hasUnreachable;

  return (
    <div
      data-testid="source-health-summary-bar"
      className={`p-3 rounded-2xl ${EXT_FROSTED_SURFACE} ${
        hasFormatFailures
          ? 'border-red-500/40 bg-red-500/[0.06]'
          : hasUnreachable
            ? 'border-amber-500/40 bg-amber-500/[0.06]'
            : ''
      } flex flex-wrap items-center justify-between gap-2.5 transition-colors duration-200`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 ${
            hasFormatFailures
              ? 'bg-red-500/16 border-red-500/35 text-red-600 dark:text-red-300'
              : hasUnreachable
                ? 'bg-amber-500/16 border-amber-500/35 text-amber-600 dark:text-amber-300'
                : 'bg-emerald-500/14 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
          }`}
        >
          {hasFormatFailures ? (
            <FileWarning className="w-4 h-4" />
          ) : hasUnreachable ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Activity className="w-4 h-4" />
          )}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-extrabold tracking-tight">
              Active Source Heartbeat
            </span>
            {counts.healthy > 0 && (
              <span
                data-testid="health-summary-healthy-count"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold"
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>{counts.healthy} Healthy</span>
              </span>
            )}
            {counts.invalidFormat > 0 && (
              <span
                data-testid="health-summary-invalid-count"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/18 border border-red-500/40 text-red-700 dark:text-red-300 text-[10px] font-extrabold"
              >
                <FileWarning className="w-2.5 h-2.5" />
                <span>{counts.invalidFormat} Invalid Format</span>
              </span>
            )}
            {counts.unreachable > 0 && (
              <span
                data-testid="health-summary-unreachable-count"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/18 border border-amber-500/38 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold"
              >
                <WifiOff className="w-2.5 h-2.5" />
                <span>{counts.unreachable} Unreachable</span>
              </span>
            )}
            {counts.checking > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--sx-primary)]/14 border border-[var(--sx-primary)]/28 text-[var(--sx-primary)] text-[10px] font-extrabold">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                <span>Checking {counts.checking}...</span>
              </span>
            )}
          </div>

          <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
            {counts.activeTotal === 0
              ? 'No active playable sources enabled in this category.'
              : hasFormatFailures
                ? `${counts.invalidFormat} active adapter${counts.invalidFormat === 1 ? '' : 's'} failed response format validation.`
                : hasIssues
                  ? `${counts.unreachable} active adapter${counts.unreachable === 1 ? '' : 's'} could not be reached.`
                  : running
                    ? `Sending heartbeat requests to ${counts.activeTotal} active adapter${counts.activeTotal === 1 ? '' : 's'}...`
                    : `Monitors response format health across ${counts.activeTotal} active adapter${counts.activeTotal === 1 ? '' : 's'}.`}
          </p>
        </div>
      </div>

      <button
        type="button"
        data-testid="run-health-check-btn"
        disabled={running || counts.activeTotal === 0}
        onClick={onRunHealthCheck}
        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-extrabold transition-all duration-200 disabled:opacity-50 shrink-0 ${
          hasIssues
            ? 'bg-red-500/18 border border-red-500/35 text-red-700 dark:text-red-300 hover:bg-red-500/26'
            : `${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)] hover:opacity-90`
        }`}
      >
        <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
        <span>{running ? 'Checking...' : 'Check Health'}</span>
      </button>
    </div>
  );
};

interface SourceHealthCardBadgeProps {
  sourceId: string;
  isActive: boolean;
  isChecking: boolean;
  result?: SourceHealthCheckResult;
}

export const SourceHealthCardBadge: React.FC<SourceHealthCardBadgeProps> = ({
  sourceId,
  isActive,
  isChecking,
  result,
}) => {
  if (!isActive) return null;

  if (isChecking) {
    return (
      <span
        data-testid={`health-badge-${sourceId}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--sx-primary)]/14 border border-[var(--sx-primary)]/28 text-[var(--sx-primary)] text-[10px] font-extrabold uppercase"
      >
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        <span>Checking</span>
      </span>
    );
  }

  if (!result || result.status === 'idle') return null;

  if (result.status === 'invalid_format') {
    return (
      <span
        data-testid={`health-badge-${sourceId}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/20 border border-red-500/45 text-red-700 dark:text-red-300 text-[10px] font-extrabold uppercase"
      >
        <FileWarning className="w-2.5 h-2.5" />
        <span>Invalid Format</span>
      </span>
    );
  }

  if (result.status === 'unreachable') {
    return (
      <span
        data-testid={`health-badge-${sourceId}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/18 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold uppercase"
      >
        <WifiOff className="w-2.5 h-2.5" />
        <span>Unreachable</span>
      </span>
    );
  }

  if (result.status === 'healthy') {
    return (
      <span
        data-testid={`health-badge-${sourceId}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/32 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold uppercase"
      >
        <CheckCircle2 className="w-2.5 h-2.5" />
        <span>
          Heartbeat OK{typeof result.latencyMs === 'number' ? ` · ${result.latencyMs}ms` : ''}
        </span>
      </span>
    );
  }

  return null;
};

interface SourceHealthFailureAlertProps {
  sourceId: string;
  sourceName: string;
  isActive: boolean;
  isChecking: boolean;
  result?: SourceHealthCheckResult;
  onRetry: () => void;
}

export const SourceHealthFailureAlert: React.FC<SourceHealthFailureAlertProps> = ({
  sourceId,
  sourceName,
  isActive,
  isChecking,
  result,
  onRetry,
}) => {
  if (!isActive || !result) return null;
  if (result.status !== 'invalid_format' && result.status !== 'unreachable') {
    return null;
  }

  const isFormatError = result.status === 'invalid_format';

  return (
    <div
      role="status"
      data-testid={`health-alert-${sourceId}`}
      className={`mt-2 px-2.5 py-2 rounded-xl border text-[11px] flex items-start justify-between gap-2 ${
        isFormatError
          ? 'bg-red-500/12 dark:bg-red-500/16 border-red-500/35 text-red-800 dark:text-red-200'
          : 'bg-amber-500/12 dark:bg-amber-500/16 border-amber-500/35 text-amber-800 dark:text-amber-200'
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2 min-w-0 flex-1">
        {isFormatError ? (
          <FileWarning className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600 dark:text-red-300" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" />
        )}
        <div className="min-w-0 space-y-0.5">
          <div className="font-extrabold leading-snug">{result.summary}</div>
          {result.detail && (
            <p className="text-[10px] opacity-90 leading-snug">{result.detail}</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px] font-semibold opacity-85">
            <span>Expected: {formatExpectedFormatLabel(result.expectedFormat)}</span>
            {result.receivedFormat && (
              <>
                <span>·</span>
                <span>Received: {result.receivedFormat}</span>
              </>
            )}
            {typeof result.httpStatus === 'number' && (
              <>
                <span>·</span>
                <span className="font-mono-tabular">HTTP {result.httpStatus}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        data-testid={`health-retry-${sourceId}`}
        disabled={isChecking}
        onClick={onRetry}
        aria-label={`Re-check heartbeat for ${sourceName}`}
        title="Re-check health"
        className={`w-7 h-7 rounded-lg ${EXT_FROSTED_ICON_BTN} flex items-center justify-center shrink-0 disabled:opacity-50`}
      >
        <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
