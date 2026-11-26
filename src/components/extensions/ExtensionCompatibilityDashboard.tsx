import React, { useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Cpu,
  HelpCircle,
  History,
  Info,
  Loader2,
  Play,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import type {
  CapabilityStatusEntry,
  CompatibilityDashboardCounts,
  CompatibilityDisplayStatus,
  ExtensionCompatibilitySnapshot,
  ExtensionRuntimeRequirement,
  SourceReliabilityLevel,
} from '../../utils/extensionDiagnostics';
import { formatDiagnosticTimestamp } from '../../utils/extensionDiagnostics';
import {
  EXT_FROSTED_ACTIVE_BUBBLE,
  EXT_FROSTED_SURFACE,
} from './ExtensionsUiPrimitives';

export function getCompatibilityStatusBadgeClasses(status: CompatibilityDisplayStatus): string {
  switch (status) {
    case 'supported':
      return 'bg-emerald-500/15 border-emerald-500/35 text-emerald-700 dark:text-emerald-300';
    case 'partial':
      return 'bg-amber-500/15 border-amber-500/35 text-amber-700 dark:text-amber-300';
    case 'failed':
      return 'bg-red-500/15 border-red-500/35 text-red-700 dark:text-red-300';
    case 'unsupported':
      return 'bg-orange-500/15 border-orange-500/35 text-orange-700 dark:text-orange-300';
    case 'unverified':
    default:
      return 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border-white/30 dark:border-white/12 text-[var(--sx-on-surface-muted)]';
  }
}

export function getReliabilityBadgeClasses(level: SourceReliabilityLevel): string {
  switch (level) {
    case 'verified':
      return 'bg-emerald-500/12 border-emerald-500/30 text-emerald-700 dark:text-emerald-300';
    case 'partially_verified':
      return 'bg-amber-500/12 border-amber-500/30 text-amber-700 dark:text-amber-300';
    case 'unsupported':
      return 'bg-orange-500/12 border-orange-500/30 text-orange-700 dark:text-orange-300';
    case 'unverified':
    default:
      return 'bg-[var(--sx-on-surface)]/6 dark:bg-white/[0.08] border-white/25 dark:border-white/10 text-[var(--sx-on-surface-muted)]';
  }
}

export function getRuntimeRequirementBadgeClasses(
  req: ExtensionRuntimeRequirement,
): string {
  switch (req) {
    case 'web-compatible':
      return 'bg-emerald-500/14 border-emerald-500/30 text-emerald-700 dark:text-emerald-300';
    case 'android-native':
      return 'bg-sky-500/14 border-sky-500/32 text-sky-700 dark:text-sky-300';
    case 'unsupported':
      return 'bg-orange-500/14 border-orange-500/32 text-orange-700 dark:text-orange-300';
    case 'unverified':
    default:
      return 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border-white/30 dark:border-white/12 text-[var(--sx-on-surface-muted)]';
  }
}

export const RuntimeRequirementIcon: React.FC<{
  requirement: ExtensionRuntimeRequirement;
  className?: string;
}> = ({ requirement, className = 'w-3 h-3' }) => {
  switch (requirement) {
    case 'web-compatible':
      return <Cpu className={`${className} shrink-0`} />;
    case 'android-native':
      return <Smartphone className={`${className} shrink-0`} />;
    case 'unsupported':
      return <Ban className={`${className} shrink-0`} />;
    case 'unverified':
    default:
      return <HelpCircle className={`${className} shrink-0`} />;
  }
};

export const CompatibilityStatusIcon: React.FC<{
  status: CompatibilityDisplayStatus;
  className?: string;
}> = ({ status, className = 'w-3 h-3' }) => {
  switch (status) {
    case 'supported':
      return <CheckCircle2 className={`${className} text-emerald-600 dark:text-emerald-400 shrink-0`} />;
    case 'partial':
      return <AlertCircle className={`${className} text-amber-600 dark:text-amber-400 shrink-0`} />;
    case 'failed':
      return <XCircle className={`${className} text-red-600 dark:text-red-400 shrink-0`} />;
    case 'unsupported':
      return <Ban className={`${className} text-orange-600 dark:text-orange-400 shrink-0`} />;
    case 'unverified':
    default:
      return <HelpCircle className={`${className} text-[var(--sx-on-surface-muted)] shrink-0`} />;
  }
};

interface ExtensionCompatibilitySummaryBarProps {
  counts: CompatibilityDashboardCounts;
  runningBatch: boolean;
  onRunAllDiagnostics: () => void;
  hasPlayableSources: boolean;
}

export const ExtensionCompatibilitySummaryBar: React.FC<
  ExtensionCompatibilitySummaryBarProps
> = ({ counts, runningBatch, onRunAllDiagnostics, hasPlayableSources }) => {
  const statusItems: Array<{
    key: CompatibilityDisplayStatus;
    label: string;
    count: number;
  }> = [
    { key: 'supported', label: 'Supported', count: counts.supported },
    { key: 'partial', label: 'Partial', count: counts.partial },
    { key: 'failed', label: 'Failed', count: counts.failed },
    { key: 'unverified', label: 'Unverified', count: counts.unverified },
    { key: 'unsupported', label: 'Unsupported', count: counts.unsupported },
  ];

  return (
    <div
      data-testid="compatibility-dashboard-summary"
      className={`p-3 rounded-2xl ${EXT_FROSTED_SURFACE} space-y-2.5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-xl bg-[var(--sx-primary)]/14 border border-[var(--sx-primary)]/25 text-[var(--sx-primary)] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xs sm:text-sm font-extrabold tracking-tight">
              Compatibility Dashboard
            </h2>
            <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
              Playback stays Unverified until a Full Diagnostic verifies real stream resolution. Aniyomi APKs are not installed or executed in Web Phase 1.
            </p>
          </div>
        </div>

        <button
          type="button"
          data-testid="run-all-full-diagnostics-btn"
          disabled={runningBatch || !hasPlayableSources}
          onClick={onRunAllDiagnostics}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-[11px] font-extrabold transition-all duration-200 disabled:opacity-50 ${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)] hover:opacity-90`}
        >
          {runningBatch ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{runningBatch ? 'Running Diagnostics...' : 'Run Full Diagnostic'}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {statusItems.map((item) => (
          <span
            key={item.key}
            data-testid={`dashboard-count-${item.key}`}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-extrabold ${getCompatibilityStatusBadgeClasses(
              item.key,
            )}`}
          >
            <CompatibilityStatusIcon status={item.key} className="w-3 h-3" />
            <span>{item.label}:</span>
            <span className="font-mono-tabular">{item.count}</span>
          </span>
        ))}
        {counts.androidNative > 0 && (
          <span
            data-testid="dashboard-count-android-native"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-sky-500/30 bg-sky-500/12 text-sky-700 dark:text-sky-300 text-[10px] font-extrabold"
          >
            <Smartphone className="w-3 h-3" />
            <span>Android Runtime Required:</span>
            <span className="font-mono-tabular">{counts.androidNative}</span>
          </span>
        )}
        {counts.metadataOnly > 0 && (
          <span
            data-testid="dashboard-count-metadata-only"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-orange-500/30 bg-orange-500/12 text-orange-700 dark:text-orange-300 text-[10px] font-extrabold"
          >
            <span>Metadata-Only Catalogs:</span>
            <span className="font-mono-tabular">{counts.metadataOnly}</span>
          </span>
        )}
      </div>
    </div>
  );
};

interface ExtensionCompatibilityCardPanelProps {
  snapshot: ExtensionCompatibilitySnapshot;
  isRunning: boolean;
  onRunFullDiagnostic: () => void;
}

export const ExtensionCompatibilityCardPanel: React.FC<
  ExtensionCompatibilityCardPanelProps
> = ({ snapshot, isRunning, onRunFullDiagnostic }) => {
  const [historyOpen, setHistoryOpen] = useState(false);

  const capabilityList: CapabilityStatusEntry[] = [
    snapshot.capabilities.animeSearch,
    snapshot.capabilities.episodeListing,
    snapshot.capabilities.audioLanguage,
    snapshot.capabilities.videoPlayback,
  ];

  return (
    <div
      data-testid={`compatibility-panel-${snapshot.sourceId}`}
      className="pt-2.5 mt-2 border-t border-white/25 dark:border-white/10 space-y-2"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Overall Status + Runtime Requirement + Reliability + Timestamps + Manual Run Full Diagnostic */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <span
            data-testid={`compatibility-overall-${snapshot.sourceId}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase ${getCompatibilityStatusBadgeClasses(
              snapshot.overallStatus,
            )}`}
          >
            <CompatibilityStatusIcon status={snapshot.overallStatus} className="w-3 h-3" />
            <span>{snapshot.overallLabel}</span>
          </span>

          <span
            data-testid={`compatibility-runtime-${snapshot.sourceId}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${getRuntimeRequirementBadgeClasses(
              snapshot.runtimeRequirement,
            )}`}
          >
            <RuntimeRequirementIcon requirement={snapshot.runtimeRequirement} className="w-3 h-3" />
            <span>{snapshot.runtimeRequirementLabel}</span>
          </span>

          <span
            data-testid={`compatibility-reliability-${snapshot.sourceId}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-extrabold ${getReliabilityBadgeClasses(
              snapshot.reliabilityLevel,
            )}`}
          >
            <span>{snapshot.reliabilityLabel}</span>
          </span>

          <span
            data-testid={`compatibility-timestamp-${snapshot.sourceId}`}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--sx-on-surface-muted)]"
          >
            <Clock className="w-3 h-3 shrink-0" />
            <span>Last tested: {formatDiagnosticTimestamp(snapshot.lastTestedAt)}</span>
          </span>

          {snapshot.lastVerifiedAt && (
            <span
              data-testid={`compatibility-last-verified-${snapshot.sourceId}`}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
            >
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              <span>Last verified: {formatDiagnosticTimestamp(snapshot.lastVerifiedAt, 'Never verified')}</span>
            </span>
          )}
        </div>

        <button
          type="button"
          data-testid={`run-full-diagnostic-${snapshot.sourceId}`}
          disabled={isRunning}
          onClick={onRunFullDiagnostic}
          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[10px] font-extrabold transition-all duration-200 disabled:opacity-55 ${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)] hover:opacity-90 shrink-0`}
        >
          {isRunning ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3 fill-current" />
          )}
          <span>{isRunning ? 'Testing...' : 'Run Full Diagnostic'}</span>
        </button>
      </div>

      {snapshot.isNativePackageMetadataOnly && snapshot.runtimeRequirement === 'android-native' && (
        <div
          data-testid={`compatibility-native-notice-${snapshot.sourceId}`}
          className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/25 text-[10px] font-semibold text-sky-700 dark:text-sky-300 flex items-center gap-1.5"
        >
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>
            Metadata saved locally · Aniyomi APK/DEX package is not installed or executable in this browser.
          </span>
        </div>
      )}

      {/* 4 Separate Capability Statuses: Anime Search, Episode Listing, Audio Language, Video Playback */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {capabilityList.map((cap) => (
          <div
            key={cap.key}
            data-testid={`compatibility-cap-${snapshot.sourceId}-${cap.key}`}
            className={`px-2 py-1 rounded-lg border flex items-center justify-between gap-1.5 text-[10px] ${getCompatibilityStatusBadgeClasses(
              cap.status,
            )}`}
          >
            <span className="font-bold truncate">{cap.label}</span>
            <span className="inline-flex items-center gap-1 font-extrabold shrink-0">
              <CompatibilityStatusIcon status={cap.status} className="w-2.5 h-2.5" />
              <span>{cap.statusLabel}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Last Diagnostic Result, Probe/Audio Verification Detail, Specific Failure Reason, & Bounded History */}
      <div className="space-y-1 text-[11px] leading-snug">
        <div
          data-testid={`compatibility-result-${snapshot.sourceId}`}
          className="text-[var(--sx-on-surface)] font-semibold truncate"
          title={snapshot.lastDiagnosticResult}
        >
          <span className="text-[var(--sx-on-surface-muted)] font-bold">Last result: </span>
          <span>{snapshot.lastDiagnosticResult}</span>
        </div>

        {snapshot.audioVerificationDetail && (
          <div
            data-testid={`compatibility-audio-detail-${snapshot.sourceId}`}
            className="text-[10px] font-semibold text-[var(--sx-on-surface-muted)]"
          >
            <span>{snapshot.audioVerificationDetail}</span>
          </div>
        )}

        {snapshot.failureReason && (
          <div
            data-testid={`compatibility-failure-${snapshot.sourceId}`}
            className="px-2 py-1 rounded-lg bg-red-500/8 dark:bg-red-500/12 border border-red-500/20 text-[10px] font-semibold text-red-700 dark:text-red-300 flex flex-wrap items-center gap-1.5"
          >
            {snapshot.failureKindLabel && (
              <span
                data-testid={`compatibility-failure-kind-${snapshot.sourceId}`}
                className="px-1.5 py-0.5 rounded bg-red-500/18 border border-red-500/25 text-[9px] font-extrabold uppercase shrink-0"
              >
                {snapshot.failureKindLabel}
              </span>
            )}
            <span>
              <span className="font-extrabold">Reason: </span>
              {snapshot.failureReason}
            </span>
          </div>
        )}

        {snapshot.history.length > 0 && (
          <div className="pt-0.5">
            <button
              type="button"
              data-testid={`compatibility-history-toggle-${snapshot.sourceId}`}
              aria-expanded={historyOpen}
              onClick={() => setHistoryOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-[10px] font-extrabold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors"
            >
              <History className="w-3 h-3" />
              <span>History ({snapshot.history.length})</span>
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-150 ${historyOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {historyOpen && (
              <div
                data-testid={`compatibility-history-list-${snapshot.sourceId}`}
                className="mt-1.5 space-y-1 pl-2 border-l border-white/25 dark:border-white/12"
              >
                {snapshot.history.map((entry, idx) => (
                  <div
                    key={`${entry.testedAt}-${idx}`}
                    className="flex items-center justify-between gap-2 text-[10px] text-[var(--sx-on-surface-muted)]"
                  >
                    <span className="truncate font-semibold">
                      <span className="uppercase font-extrabold text-[var(--sx-on-surface)]">
                        {entry.status}
                      </span>{' '}
                      · {entry.mode.toUpperCase()} · {entry.summary}
                    </span>
                    <span className="shrink-0 font-mono-tabular">
                      {formatDiagnosticTimestamp(entry.testedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
