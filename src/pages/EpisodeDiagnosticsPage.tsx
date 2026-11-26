import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  ExternalLink,
  Info,
  Loader2,
  MinusCircle,
  Play,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { getPreferredTitle, UnifiedMedia } from '../types/media';
import { fetchMediaDetails } from '../services/discoveryService';
import { searchAniList } from '../services/anilist';
import { searchJikan } from '../services/jikan';
import { resolveEpisodesWithDiagnostics } from '../services/sourceEngine';
import {
  clearEpisodeTraces,
  EpisodeFetchTrace,
  formatTraceAsReportJson,
  getEpisodeTraces,
  ProviderTraceStatus,
  subscribeEpisodeTraces,
  traceHasIssues,
} from '../utils/episodeDiagnostics';

interface DiagnosticsLocationState {
  media?: UnifiedMedia;
  sourceId?: string;
  sourceName?: string;
  overrideTitle?: string;
}

const QUICK_SAMPLE_ANIME = [
  { id: '154587', label: 'Frieren (154587)' },
  { id: '20', label: 'Naruto (20)' },
  { id: '21', label: 'One Piece (21)' },
];

function providerStatusDisplay(status: ProviderTraceStatus): {
  label: string;
  toneClass: string;
  Icon: React.FC<{ className?: string }>;
} {
  switch (status) {
    case 'hit':
      return {
        label: 'HIT',
        toneClass:
          'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-600/25 dark:border-emerald-500/30',
        Icon: CheckCircle2,
      };
    case 'empty':
      return {
        label: 'EMPTY',
        toneClass:
          'bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-600/25 dark:border-amber-500/30',
        Icon: AlertTriangle,
      };
    case 'timeout':
      return {
        label: 'TIMEOUT',
        toneClass:
          'bg-red-500/12 text-red-700 dark:text-red-300 border-red-600/25 dark:border-red-500/30',
        Icon: Clock,
      };
    case 'error':
      return {
        label: 'ERROR',
        toneClass:
          'bg-red-500/12 text-red-700 dark:text-red-300 border-red-600/25 dark:border-red-500/30',
        Icon: AlertCircle,
      };
    case 'skipped':
    default:
      return {
        label: 'SKIPPED',
        toneClass: 'sx-glass-control text-[var(--sx-on-surface-muted)] border-[var(--sx-outline)]',
        Icon: MinusCircle,
      };
  }
}

export const EpisodeDiagnosticsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { state, allSources } = useApp();

  const navState = (location.state as DiagnosticsLocationState | null) ?? null;
  const queryMediaId = searchParams.get('mediaId')?.trim() || '';
  const querySourceId = searchParams.get('sourceId')?.trim() || '';

  const animeSources = useMemo(() => {
    const filtered = allSources.filter((s) =>
      s.mediaTypes.some((m) => m === 'ANIME' || m === 'TV' || m === 'MOVIE'),
    );
    return filtered.length > 0 ? filtered : allSources;
  }, [allSources]);

  const initialSourceId =
    navState?.sourceId ||
    querySourceId ||
    state.discoveryPrefs.activeSources.find((id) => animeSources.some((s) => s.id === id)) ||
    animeSources[0]?.id ||
    'shonenx-hls-inbuilt';

  const [traces, setTraces] = useState<EpisodeFetchTrace[]>(() => getEpisodeTraces());
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(() => {
    const existing = getEpisodeTraces();
    if (navState?.media?.id) {
      return existing.find((t) => t.inputMediaId === navState.media!.id)?.id || existing[0]?.id || null;
    }
    if (queryMediaId) {
      return existing.find((t) => t.inputMediaId === queryMediaId)?.id || existing[0]?.id || null;
    }
    return existing[0]?.id || null;
  });

  const [probeQuery, setProbeQuery] = useState<string>(
    navState?.media?.id || queryMediaId || '154587',
  );
  const [selectedSourceId, setSelectedSourceId] = useState<string>(initialSourceId);
  const [overrideDraft, setOverrideDraft] = useState<string>(navState?.overrideTitle || '');
  const [bypassCache, setBypassCache] = useState<boolean>(true);
  const [probing, setProbing] = useState<boolean>(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [copiedTraceId, setCopiedTraceId] = useState<string | null>(null);

  const [logFilter, setLogFilter] = useState<'all' | 'issues'>('all');
  const [logSearch, setLogSearch] = useState<string>('');

  const roundness = `${state.themePrefs.uiRoundness}px`;

  useEffect(() => {
    return subscribeEpisodeTraces(() => {
      const updated = getEpisodeTraces();
      setTraces(updated);
      setSelectedTraceId((prev) => {
        if (prev && updated.some((t) => t.id === prev)) return prev;
        return updated[0]?.id || null;
      });
    });
  }, []);

  // Automatically trigger an initial diagnostic probe if opened with ?mediaId=... or navState.media and no trace exists yet
  useEffect(() => {
    const preloadMedia = navState?.media;
    const targetId = preloadMedia?.id || queryMediaId;
    if (!targetId) return;
    const alreadyCaptured = getEpisodeTraces().some((t) => t.inputMediaId === targetId);
    if (alreadyCaptured) return;

    let cancelled = false;
    setProbing(true);
    setProbeError(null);
    const runInitial = async () => {
      try {
        const fullMedia = preloadMedia?.id
          ? await fetchMediaDetails(preloadMedia.id, preloadMedia.type || 'ANIME', preloadMedia.providerId).catch(
              () => preloadMedia,
            )
          : await fetchMediaDetails(targetId, 'ANIME');
        const chosenSource = animeSources.find((s) => s.id === initialSourceId);
        const { trace } = await resolveEpisodesWithDiagnostics(fullMedia, {
          sourceId: initialSourceId,
          sourceName: navState?.sourceName || chosenSource?.name,
          overrideTitle: navState?.overrideTitle || undefined,
          bypassCache: false,
          recordTrace: true,
        });
        if (!cancelled) {
          setSelectedTraceId(trace.id);
        }
      } catch (err) {
        if (!cancelled) {
          setProbeError(
            err instanceof Error ? err.message : 'Unable to probe initial anime details.',
          );
        }
      } finally {
        if (!cancelled) setProbing(false);
      }
    };

    void runInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  const executeProbe = async (queryOverride?: string) => {
    const rawQuery = (queryOverride ?? probeQuery).trim();
    if (!rawQuery) {
      setProbeError('Enter an AniList numeric ID or anime title before running a probe.');
      return;
    }

    setProbing(true);
    setProbeError(null);
    try {
      let targetMedia: UnifiedMedia | null = null;
      if (/^\d+$/.test(rawQuery)) {
        if (navState?.media?.id === rawQuery) {
          targetMedia = await fetchMediaDetails(
            rawQuery,
            navState.media.type || 'ANIME',
            navState.media.providerId,
          ).catch(() => navState.media ?? null);
        } else {
          targetMedia = await fetchMediaDetails(rawQuery, 'ANIME');
        }
      } else {
        try {
          const alResults = await searchAniList({
            query: rawQuery,
            type: 'ANIME',
            page: 1,
            perPage: 1,
          });
          if (alResults.items[0]) {
            targetMedia = await fetchMediaDetails(alResults.items[0].id, 'ANIME').catch(
              () => alResults.items[0],
            );
          }
        } catch {
          // Fall through to Jikan lookup when AniList search is unavailable
        }
        if (!targetMedia) {
          const jikanResults = await searchJikan(rawQuery, 'ANIME', 1);
          if (jikanResults.items[0]) {
            targetMedia = jikanResults.items[0];
          }
        }
      }

      if (!targetMedia || !targetMedia.id) {
        setProbeError(
          `No anime entry matched "${rawQuery}" on AniList or Jikan. Try a numeric AniList ID or exact title.`,
        );
        return;
      }

      const chosenSource = animeSources.find((s) => s.id === selectedSourceId);
      const { trace } = await resolveEpisodesWithDiagnostics(targetMedia, {
        sourceId: selectedSourceId,
        sourceName: chosenSource?.name || selectedSourceId,
        overrideTitle: overrideDraft.trim() || undefined,
        bypassCache,
        recordTrace: true,
      });
      setSelectedTraceId(trace.id);
    } catch (err) {
      setProbeError(
        err instanceof Error ? err.message : 'Diagnostic probe failed unexpectedly.',
      );
    } finally {
      setProbing(false);
    }
  };

  const handleSubmitProbe = (e: React.FormEvent) => {
    e.preventDefault();
    void executeProbe();
  };

  const activeTrace = useMemo(
    () => traces.find((t) => t.id === selectedTraceId) || traces[0] || null,
    [traces, selectedTraceId],
  );

  const issueCount = useMemo(() => traces.filter((t) => traceHasIssues(t)).length, [traces]);

  const filteredTraces = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return traces.filter((trace) => {
      if (logFilter === 'issues' && !traceHasIssues(trace)) return false;
      if (!q) return true;
      return (
        trace.inputTitle.toLowerCase().includes(q) ||
        trace.resolvedTitle.toLowerCase().includes(q) ||
        trace.inputMediaId.toLowerCase().includes(q) ||
        trace.sourceName.toLowerCase().includes(q) ||
        trace.anomalies.some((a) => a.title.toLowerCase().includes(q))
      );
    });
  }, [traces, logFilter, logSearch]);

  const handleCopyJson = () => {
    if (!activeTrace) return;
    navigator.clipboard?.writeText(formatTraceAsReportJson(activeTrace));
    setCopiedTraceId(activeTrace.id);
    window.setTimeout(() => setCopiedTraceId(null), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="p-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors shrink-0"
            aria-label="Back to Settings"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight truncate">
                Episode Fetch Diagnostics
              </h1>
            </div>
            <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5">
              Trace AniZip, AniList, Jikan &amp; Kitsu episode waterfalls to diagnose mismatched or generic episode lists
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {activeTrace && (
            <button
              type="button"
              data-testid="diagnostics-copy-json-btn"
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] whitespace-nowrap"
            >
              {copiedTraceId === activeTrace.id ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedTraceId === activeTrace.id ? 'Copied JSON' : 'Copy JSON'}</span>
            </button>
          )}
          <button
            type="button"
            data-testid="diagnostics-clear-btn"
            disabled={traces.length === 0}
            onClick={() => {
              clearEpisodeTraces();
              setSelectedTraceId(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-xs font-bold hover:border-red-400 hover:text-red-400 disabled:opacity-45 whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Log</span>
          </button>
        </div>
      </div>

      {/* Interactive Probe Runner */}
      <form
        onSubmit={handleSubmitProbe}
        style={{ borderRadius: roundness }}
        className="p-4 sm:p-5 sx-glass-panel border border-[var(--sx-outline)] space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--sx-primary)]" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--sx-on-surface)]">
              Live Episode Resolution Probe
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-[var(--sx-on-surface-muted)] mr-1">Samples:</span>
            {QUICK_SAMPLE_ANIME.map((sample) => (
              <button
                key={sample.id}
                type="button"
                disabled={probing}
                onClick={() => {
                  setProbeQuery(sample.id);
                  setOverrideDraft('');
                  void executeProbe(sample.id);
                }}
                className="px-2.5 py-1 rounded-lg sx-glass-control border border-[var(--sx-outline)] text-[11px] font-bold hover:border-[var(--sx-primary)] transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <label className="md:col-span-5 space-y-1">
            <span className="text-[11px] font-bold text-[var(--sx-on-surface-muted)] block">
              Anime Title or AniList ID
            </span>
            <input
              type="text"
              data-testid="diagnostics-query-input"
              value={probeQuery}
              onChange={(e) => setProbeQuery(e.target.value)}
              placeholder="e.g. 154587, Naruto, Dandadan"
              className="w-full px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-medium outline-none focus:border-[var(--sx-primary)]"
            />
          </label>

          <label className="md:col-span-4 space-y-1">
            <span className="text-[11px] font-bold text-[var(--sx-on-surface-muted)] block">
              Extension / Source Profile
            </span>
            <select
              data-testid="diagnostics-source-select"
              value={selectedSourceId}
              onChange={(e) => setSelectedSourceId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold outline-none focus:border-[var(--sx-primary)]"
            >
              {animeSources.map((src) => {
                const enabled = state.discoveryPrefs.activeSources.includes(src.id);
                return (
                  <option
                    key={src.id}
                    value={src.id}
                    className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]"
                  >
                    {src.name} ({src.lang}){enabled ? '' : ' [Disabled]'}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="md:col-span-3 space-y-1">
            <span className="text-[11px] font-bold text-[var(--sx-on-surface-muted)] block">
              Wrong Title Override (Optional)
            </span>
            <input
              type="text"
              data-testid="diagnostics-override-input"
              value={overrideDraft}
              onChange={(e) => setOverrideDraft(e.target.value)}
              placeholder="Alternate title lookup"
              className="w-full px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-medium outline-none focus:border-[var(--sx-primary)]"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--sx-on-surface-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bypassCache}
              onChange={(e) => setBypassCache(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--sx-primary)]"
            />
            <span>Bypass 30m AniZip in-memory cache (measure fresh HTTP latency)</span>
          </label>

          <button
            type="submit"
            data-testid="run-diagnostic-probe-btn"
            disabled={probing}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl sx-glass-cta text-xs font-extrabold disabled:opacity-55 whitespace-nowrap"
          >
            {probing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            <span>{probing ? 'Probing Providers...' : 'Run Diagnostic Probe'}</span>
          </button>
        </div>

        {probeError && (
          <div
            data-testid="diagnostics-probe-error"
            className="px-3.5 py-2.5 rounded-xl bg-red-500/12 border border-red-500/30 text-xs font-semibold text-red-700 dark:text-red-300 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{probeError}</span>
          </div>
        )}
      </form>

      {/* Active Trace Inspection */}
      {activeTrace ? (
        <div className="space-y-5">
          {/* Trace Overview Banner */}
          <section
            style={{ borderRadius: roundness }}
            className="p-4 sm:p-5 sx-glass-panel border border-[var(--sx-outline)] space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base sm:text-lg font-black tracking-tight">
                    {activeTrace.resolvedTitle}
                  </h2>
                  <span className="font-mono-tabular text-xs text-[var(--sx-on-surface-muted)]">
                    AniList #{activeTrace.resolvedMediaId}
                    {activeTrace.resolvedMalId ? ` · MAL #${activeTrace.resolvedMalId}` : ''}
                    {activeTrace.resolvedKitsuId ? ` · Kitsu #${activeTrace.resolvedKitsuId}` : ''}
                  </span>
                </div>
                <p className="text-xs text-[var(--sx-on-surface-muted)]">
                  Source: <strong className="text-[var(--sx-on-surface)]">{activeTrace.sourceName}</strong>
                  {' · '}
                  Winning Layer: <strong className="text-[var(--sx-on-surface)]">{activeTrace.winningPrimaryProvider}</strong>
                  {activeTrace.overrideTitle ? (
                    <>
                      {' · '}
                      Override: <code className="font-mono-tabular">"{activeTrace.overrideTitle}"</code> (
                      {activeTrace.overrideMatched ? 'matched' : 'no match'})
                    </>
                  ) : null}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setProbeQuery(activeTrace.inputMediaId);
                    setSelectedSourceId(activeTrace.sourceId);
                    setOverrideDraft(activeTrace.overrideTitle || '');
                    void executeProbe(activeTrace.inputMediaId);
                  }}
                  disabled={probing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] disabled:opacity-50 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${probing ? 'animate-spin' : ''}`} />
                  <span>Re-probe</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/details/anime/${activeTrace.resolvedMediaId}`)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)] whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Anime</span>
                </button>
              </div>
            </div>

            {/* Key Numeric Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-[var(--sx-outline)]">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                  Total Latency
                </div>
                <div className="text-lg font-black font-mono-tabular mt-0.5">
                  {activeTrace.totalDurationMs} ms
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                  Resolved Episodes
                </div>
                <div className="text-lg font-black font-mono-tabular mt-0.5">
                  {activeTrace.totalEpisodes}
                  {activeTrace.inputExpectedCount ? (
                    <span className="text-xs font-semibold text-[var(--sx-on-surface-muted)]">
                      {' '}
                      / {activeTrace.inputExpectedCount} expected
                    </span>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                  Real Named Titles
                </div>
                <div className="text-lg font-black font-mono-tabular mt-0.5">
                  {activeTrace.realTitleCount}
                  <span className="text-xs font-semibold text-[var(--sx-on-surface-muted)]">
                    {' '}
                    ({activeTrace.genericTitleCount} generic)
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                  Filler &amp; Art
                </div>
                <div className="text-sm sm:text-lg font-black font-mono-tabular mt-0.5">
                  {activeTrace.fillerCount} filler · {activeTrace.thumbnailCount} art
                </div>
              </div>
            </div>

            {/* Anomaly Findings */}
            <div data-testid="diagnostics-findings" className="space-y-2 pt-2 border-t border-[var(--sx-outline)]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                Automated Diagnosis ({activeTrace.anomalies.length})
              </div>
              {activeTrace.anomalies.length === 0 ? (
                <div className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-600/25 dark:border-emerald-500/30 text-xs flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    Healthy resolution: upstream episode titles and total episode counts match metadata without fallback issues.
                  </span>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeTrace.anomalies.map((finding, idx) => {
                    const isErr = finding.severity === 'error';
                    const isWarn = finding.severity === 'warning';
                    const SeverityIcon = isErr
                      ? AlertCircle
                      : isWarn
                        ? AlertTriangle
                        : Info;
                    const borderTone = isErr
                      ? 'bg-red-500/10 border-red-600/25 dark:border-red-500/30 text-red-800 dark:text-red-300'
                      : isWarn
                        ? 'bg-amber-500/12 border-amber-600/30 dark:border-amber-500/30 text-amber-900 dark:text-amber-200'
                        : 'bg-[var(--sx-primary)]/10 border-[var(--sx-primary)]/30 text-[var(--sx-on-surface)]';
                    return (
                      <div
                        key={`${finding.code}-${idx}`}
                        className={`px-3.5 py-3 rounded-xl border text-xs space-y-1 ${borderTone}`}
                      >
                        <div className="flex items-center gap-2 font-extrabold">
                          <SeverityIcon className="w-4 h-4 shrink-0" />
                          <span className="uppercase font-mono-tabular text-[10px]">
                            [{finding.severity}]
                          </span>
                          <span>{finding.title}</span>
                        </div>
                        <p className="opacity-90 leading-relaxed">{finding.detail}</p>
                        <p className="text-[11px] opacity-80">
                          <strong>Suggested fix:</strong> {finding.suggestion}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Provider Waterfall Breakdown */}
          <section
            style={{ borderRadius: roundness }}
            className="sx-glass-panel border border-[var(--sx-outline)] overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--sx-outline)] flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider">
                  Metadata Provider Waterfall
                </h2>
              </div>
              <span className="text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                Priority: AniZip &gt; AniList &gt; Jikan (MAL) &gt; Kitsu
              </span>
            </div>

            <div className="overflow-x-auto">
              <table
                data-testid="diagnostics-provider-table"
                className="w-full text-left border-collapse text-xs"
              >
                <thead>
                  <tr className="border-b border-[var(--sx-outline)] text-[10px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)] bg-[var(--sx-surface-high)]/50">
                    <th className="py-2.5 px-4 whitespace-nowrap">Provider</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Status</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right">Latency</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right">Episodes</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-right">Named</th>
                    <th className="py-2.5 px-3 whitespace-nowrap">Target ID</th>
                    <th className="py-2.5 px-4 min-w-[220px]">Diagnostic Detail / Samples</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--sx-outline)]">
                  {activeTrace.providers.map((step) => {
                    const badge = providerStatusDisplay(step.status);
                    const StatusIcon = badge.Icon;
                    return (
                      <tr key={step.provider} className="align-top">
                        <td className="py-3 px-4 font-bold whitespace-nowrap">{step.provider}</td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${badge.toneClass}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            <span>{badge.label}</span>
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono-tabular text-right whitespace-nowrap">
                          {step.durationMs} ms
                        </td>
                        <td className="py-3 px-3 font-mono-tabular text-right whitespace-nowrap">
                          {step.episodeCount}
                        </td>
                        <td className="py-3 px-3 font-mono-tabular text-right whitespace-nowrap">
                          {step.namedCount}
                        </td>
                        <td className="py-3 px-3 font-mono-tabular text-[11px] text-[var(--sx-on-surface-muted)] whitespace-nowrap">
                          {step.targetId || '—'}
                        </td>
                        <td className="py-3 px-4 space-y-1">
                          <div className="text-[var(--sx-on-surface)]">{step.note}</div>
                          {step.errorMessage && (
                            <div className="text-[11px] font-mono-tabular text-red-700 dark:text-red-400">
                              {step.errorMessage}
                            </div>
                          )}
                          {step.sampleTitles.length > 0 && (
                            <div className="text-[11px] text-[var(--sx-on-surface-muted)] truncate max-w-md">
                              Sample: {step.sampleTitles.slice(0, 2).join(' · ')}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Merged Episode Comparison Preview */}
          <section
            style={{ borderRadius: roundness }}
            className="sx-glass-panel border border-[var(--sx-outline)] overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-[var(--sx-outline)] flex items-center justify-between gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wider">
                Merged Episode Output Preview (First {activeTrace.sampleEpisodes.length} of{' '}
                {activeTrace.totalEpisodes})
              </h2>
              <span className="text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                {getPreferredTitle(
                  {
                    english: activeTrace.resolvedTitle,
                  },
                  state.contentPrefs.titlePreference,
                )}
              </span>
            </div>

            {activeTrace.sampleEpisodes.length === 0 ? (
              <div className="p-6 text-center text-xs text-[var(--sx-on-surface-muted)]">
                No episodes were resolved for this trace.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table
                  data-testid="diagnostics-episode-preview"
                  className="w-full text-left border-collapse text-xs"
                >
                  <thead>
                    <tr className="border-b border-[var(--sx-outline)] text-[10px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)] bg-[var(--sx-surface-high)]/50">
                      <th className="py-2 px-4 whitespace-nowrap w-14">Ep #</th>
                      <th className="py-2 px-3 min-w-[200px]">Resolved Title</th>
                      <th className="py-2 px-3 whitespace-nowrap">Air Date</th>
                      <th className="py-2 px-4 whitespace-nowrap">Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--sx-outline)]">
                    {activeTrace.sampleEpisodes.map((ep) => (
                      <tr key={ep.number}>
                        <td className="py-2.5 px-4 font-mono-tabular font-bold">
                          {ep.number}
                        </td>
                        <td className="py-2.5 px-3 font-medium">
                          {ep.title}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-[11px] text-[var(--sx-on-surface-muted)] whitespace-nowrap">
                          {ep.airDate || '—'}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-[11px]">
                            {ep.isGeneric ? (
                              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>Generic Fallback</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Real Title</span>
                              </span>
                            )}
                            {ep.isFiller && (
                              <span className="text-amber-700 dark:text-amber-300 font-semibold">· Filler</span>
                            )}
                            {ep.hasThumbnail && (
                              <span className="text-[var(--sx-on-surface-muted)]">· Thumb</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div
          style={{ borderRadius: roundness }}
          className="p-8 sx-glass-panel border border-[var(--sx-outline)] text-center space-y-2"
        >
          <Activity className="w-6 h-6 mx-auto text-[var(--sx-primary)]" />
          <div className="text-sm font-bold">No episode fetch traces captured yet</div>
          <p className="text-xs text-[var(--sx-on-surface-muted)] max-w-md mx-auto">
            Run a live diagnostic probe above or open the Watch tab on any anime to inspect real episode API waterfalls.
          </p>
        </div>
      )}

      {/* Captured Fetch Trace Log Viewer */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
              Captured Fetch Log ({traces.length})
            </h2>
            <div className="flex items-center gap-1 sx-glass-panel p-1 rounded-xl border border-[var(--sx-outline)]">
              <button
                type="button"
                data-testid="diagnostics-filter-all"
                onClick={() => setLogFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  logFilter === 'all'
                    ? 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                All ({traces.length})
              </button>
              <button
                type="button"
                data-testid="diagnostics-filter-issues"
                onClick={() => setLogFilter('issues')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  logFilter === 'issues'
                    ? 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                Issues Only ({issueCount})
              </button>
            </div>
          </div>

          <div className="relative sm:w-72">
            <Search className="w-3.5 h-3.5 text-[var(--sx-on-surface-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              placeholder="Filter traces by anime or source..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-xs outline-none focus:border-[var(--sx-primary)]"
            />
          </div>
        </div>

        <div
          data-testid="diagnostics-trace-list"
          style={{ borderRadius: roundness }}
          className="sx-glass-panel border border-[var(--sx-outline)] divide-y divide-[var(--sx-outline)] overflow-hidden"
        >
          {filteredTraces.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--sx-on-surface-muted)]">
              No captured episode traces match this filter.
            </div>
          ) : (
            filteredTraces.map((trace) => {
              const selected = activeTrace?.id === trace.id;
              const hasIssues = traceHasIssues(trace);
              return (
                <button
                  key={trace.id}
                  type="button"
                  data-testid={`diagnostics-trace-row-${trace.id}`}
                  onClick={() => setSelectedTraceId(trace.id)}
                  className={`w-full px-4 py-3 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${
                    selected
                      ? 'bg-[var(--sx-primary)]/10'
                      : 'hover:bg-[var(--sx-surface-high)]/55'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {hasIssues ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-300 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                      <span className="text-xs font-extrabold truncate">
                        {trace.resolvedTitle}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)]">
                        #{trace.resolvedMediaId}
                      </span>
                      {trace.anomalies.length > 0 && (
                        <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
                          {trace.anomalies.length} {trace.anomalies.length === 1 ? 'finding' : 'findings'}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--sx-on-surface-muted)] truncate">
                      {trace.sourceName} · {trace.winningPrimaryProvider} ·{' '}
                      <span className="font-mono-tabular">
                        {trace.realTitleCount}/{trace.totalEpisodes} named
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] font-mono-tabular text-[var(--sx-on-surface-muted)] shrink-0">
                    <span>{trace.totalDurationMs} ms</span>
                    <span>{new Date(trace.timestamp).toLocaleTimeString()}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
