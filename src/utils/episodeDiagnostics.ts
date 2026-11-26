import { UnifiedEpisode, UnifiedMedia } from '../types/media';
import { isGenericEpisodeTitle } from './episodeResolver';

export type ProviderTraceStatus = 'hit' | 'empty' | 'skipped' | 'error' | 'timeout';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export type EpisodeAnomalyCode =
  | 'GENERIC_FALLBACK'
  | 'PARTIAL_GENERIC_TITLES'
  | 'COUNT_MISMATCH'
  | 'TITLE_OVERRIDE_REMAPPED'
  | 'OVERRIDE_NO_MATCH'
  | 'PROVIDER_ERROR'
  | 'MISSING_CROSS_IDS'
  | 'ONLY_FALLBACK_SLOTS';

export interface EpisodeProviderStep {
  provider: 'AniZip' | 'AniList Streaming' | 'Jikan (MAL)' | 'Kitsu';
  status: ProviderTraceStatus;
  durationMs: number;
  episodeCount: number;
  namedCount: number;
  targetId: string | null;
  sampleTitles: string[];
  note: string;
  errorMessage?: string | null;
}

export interface EpisodeDiagnosticFinding {
  code: EpisodeAnomalyCode;
  severity: DiagnosticSeverity;
  title: string;
  detail: string;
  suggestion: string;
}

export interface EpisodeMergedSample {
  number: number;
  title: string;
  isGeneric: boolean;
  airDate: string | null;
  isFiller: boolean;
  hasThumbnail: boolean;
}

export interface EpisodeFetchTrace {
  id: string;
  timestamp: string;
  totalDurationMs: number;
  sourceId: string;
  sourceName: string;
  inputMediaId: string;
  inputTitle: string;
  inputMalId: string | null;
  inputKitsuId: string | null;
  inputExpectedCount: number | null;
  overrideTitle: string | null;
  overrideMatched: boolean;
  resolvedMediaId: string;
  resolvedTitle: string;
  resolvedMalId: string | null;
  resolvedKitsuId: string | null;
  resolvedExpectedCount: number;
  providers: EpisodeProviderStep[];
  totalEpisodes: number;
  realTitleCount: number;
  genericTitleCount: number;
  fillerCount: number;
  thumbnailCount: number;
  winningPrimaryProvider: string;
  anomalies: EpisodeDiagnosticFinding[];
  sampleEpisodes: EpisodeMergedSample[];
}

export interface AnalyzeEpisodeTraceInput {
  inputMedia: Pick<UnifiedMedia, 'id' | 'idMal' | 'externalIds' | 'episodes' | 'nextEpisode' | 'title'>;
  resolvedMedia: Pick<UnifiedMedia, 'id' | 'idMal' | 'externalIds' | 'episodes' | 'nextEpisode' | 'title'>;
  sourceId: string;
  sourceName: string;
  overrideTitle?: string | null;
  overrideMatched: boolean;
  resolvedExpectedCount: number;
  providers: EpisodeProviderStep[];
  mergedEpisodes: UnifiedEpisode[];
  totalDurationMs: number;
  timestamp?: string;
}

const SESSION_STORAGE_KEY = 'shizutv_episode_traces_v1';
const MAX_STORED_TRACES = 40;

function pickReadableTitle(
  title: Pick<UnifiedMedia, 'title'>['title'] | undefined,
  fallbackId: string,
): string {
  return (
    title?.english?.trim() ||
    title?.romaji?.trim() ||
    title?.native?.trim() ||
    `Media #${fallbackId}`
  );
}

export function analyzeEpisodeResolution(input: AnalyzeEpisodeTraceInput): EpisodeFetchTrace {
  const {
    inputMedia,
    resolvedMedia,
    sourceId,
    sourceName,
    overrideTitle,
    overrideMatched,
    resolvedExpectedCount,
    providers,
    mergedEpisodes,
    totalDurationMs,
  } = input;

  const totalEpisodes = mergedEpisodes.length;
  const realTitleCount = mergedEpisodes.filter(
    (ep) => !isGenericEpisodeTitle(ep.title, ep.number),
  ).length;
  const genericTitleCount = Math.max(0, totalEpisodes - realTitleCount);
  const fillerCount = mergedEpisodes.filter((ep) => Boolean(ep.isFiller)).length;
  const thumbnailCount = mergedEpisodes.filter((ep) => Boolean(ep.thumbnail)).length;

  const inputTitle = pickReadableTitle(inputMedia.title, inputMedia.id);
  const resolvedTitle = pickReadableTitle(resolvedMedia.title, resolvedMedia.id);
  const inputMalId = inputMedia.idMal || inputMedia.externalIds?.mal || null;
  const inputKitsuId = inputMedia.externalIds?.kitsu || null;
  const resolvedMalId = resolvedMedia.idMal || resolvedMedia.externalIds?.mal || null;
  const resolvedKitsuId = resolvedMedia.externalIds?.kitsu || null;
  const cleanOverride = overrideTitle?.trim() || null;

  const anomalies: EpisodeDiagnosticFinding[] = [];

  if (cleanOverride && !overrideMatched) {
    anomalies.push({
      code: 'OVERRIDE_NO_MATCH',
      severity: 'error',
      title: 'Alternate title search returned no match',
      detail: `Searching AniList/Jikan for "${cleanOverride}" failed to match any anime entry, so episodes fell back to "${inputTitle}".`,
      suggestion: 'Check spelling or try the Romaji/Japanese title in the "Wrong Title?" modal.',
    });
  } else if (cleanOverride && overrideMatched && resolvedMedia.id !== inputMedia.id) {
    anomalies.push({
      code: 'TITLE_OVERRIDE_REMAPPED',
      severity: 'info',
      title: 'Title override remapped target anime ID',
      detail: `Override "${cleanOverride}" switched resolution from #${inputMedia.id} (${inputTitle}) to #${resolvedMedia.id} (${resolvedTitle}).`,
      suggestion: 'If episodes belong to the wrong season or OVA, reset the "Wrong Title?" override.',
    });
  }

  const failingProviders = providers.filter(
    (p) => p.status === 'error' || p.status === 'timeout',
  );
  if (failingProviders.length > 0) {
    const names = failingProviders.map((p) => `${p.provider} (${p.status})`).join(', ');
    anomalies.push({
      code: 'PROVIDER_ERROR',
      severity: 'warning',
      title: `Metadata provider request failed: ${names}`,
      detail: failingProviders
        .map((p) => `${p.provider}: ${p.errorMessage || p.note}`)
        .join(' | '),
      suggestion: 'Retry episode resolution or verify network access to upstream metadata APIs.',
    });
  }

  if (!resolvedMalId && !resolvedKitsuId && providers.every((p) => p.namedCount === 0)) {
    anomalies.push({
      code: 'MISSING_CROSS_IDS',
      severity: 'warning',
      title: 'Missing MAL & Kitsu cross-reference IDs',
      detail: `Anime #${resolvedMedia.id} lacks both idMal and kitsu_id mappings, limiting Jikan and Kitsu fallback coverage.`,
      suggestion: 'Use "Wrong Title?" with the exact AniList or MyAnimeList title to locate a mapped entry.',
    });
  }

  if (totalEpisodes > 0 && realTitleCount === 0) {
    anomalies.push({
      code: 'GENERIC_FALLBACK',
      severity: 'error',
      title: 'All episodes using generic fallback labels',
      detail: `None of the active metadata layers (AniZip, AniList, Jikan, Kitsu) returned named episodes for "${resolvedTitle}". Generated ${totalEpisodes} placeholder slots.`,
      suggestion:
        'Try applying the Romaji title via "Wrong Title?" or wait for AniZip/MAL to index newly aired episodes.',
    });
  } else if (totalEpisodes > 0 && genericTitleCount > 0) {
    const pct = Math.round((genericTitleCount / totalEpisodes) * 100);
    anomalies.push({
      code: 'PARTIAL_GENERIC_TITLES',
      severity: pct > 35 ? 'warning' : 'info',
      title: `${genericTitleCount} of ${totalEpisodes} episodes lack real titles (${pct}%)`,
      detail: `Providers supplied ${realTitleCount} named episodes; remaining ${genericTitleCount} slots fell back to "Episode N".`,
      suggestion:
        'Newly airing or multi-cour specials sometimes publish episode metadata 24–48h after broadcast.',
    });
  }

  const knownBaseline =
    resolvedMedia.episodes && resolvedMedia.episodes > 0
      ? resolvedMedia.episodes
      : resolvedMedia.nextEpisode && resolvedMedia.nextEpisode > 1
        ? resolvedMedia.nextEpisode - 1
        : null;

  if (knownBaseline !== null && totalEpisodes !== knownBaseline) {
    anomalies.push({
      code: 'COUNT_MISMATCH',
      severity: Math.abs(totalEpisodes - knownBaseline) > 2 ? 'warning' : 'info',
      title: `Episode count mismatch (expected ${knownBaseline}, resolved ${totalEpisodes})`,
      detail: `Metadata reports ${knownBaseline} episodes for "${resolvedTitle}", while merged layers produced ${totalEpisodes} entries.`,
      suggestion:
        'Often caused by sequel splits (Cour 1/2), recaps (.5 episodes), or TVDB absolute numbering differences.',
    });
  }

  if (
    resolvedExpectedCount > 0 &&
    providers.every((p) => p.episodeCount === 0) &&
    totalEpisodes === resolvedExpectedCount
  ) {
    anomalies.push({
      code: 'ONLY_FALLBACK_SLOTS',
      severity: 'warning',
      title: 'Synthesized episode list without upstream confirmation',
      detail: `All 4 upstream episode providers returned 0 items; list was synthesized strictly from expectedCount (${resolvedExpectedCount}).`,
      suggestion: 'Check provider status details below to see which endpoints failed or returned empty.',
    });
  }

  const winningProvider =
    providers.find((p) => p.namedCount > 0)?.provider ||
    providers.find((p) => p.episodeCount > 0)?.provider ||
    'Synthesized Fallback';

  return {
    id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: input.timestamp || new Date().toISOString(),
    totalDurationMs: Math.max(0, Math.round(totalDurationMs)),
    sourceId: sourceId || 'shonenx-hls-inbuilt',
    sourceName: sourceName || sourceId || 'ShizuTv Stream (Inbuilt)',
    inputMediaId: inputMedia.id,
    inputTitle,
    inputMalId: inputMalId ? String(inputMalId) : null,
    inputKitsuId: inputKitsuId ? String(inputKitsuId) : null,
    inputExpectedCount: inputMedia.episodes ?? null,
    overrideTitle: cleanOverride,
    overrideMatched,
    resolvedMediaId: resolvedMedia.id,
    resolvedTitle,
    resolvedMalId: resolvedMalId ? String(resolvedMalId) : null,
    resolvedKitsuId: resolvedKitsuId ? String(resolvedKitsuId) : null,
    resolvedExpectedCount,
    providers,
    totalEpisodes,
    realTitleCount,
    genericTitleCount,
    fillerCount,
    thumbnailCount,
    winningPrimaryProvider: winningProvider,
    anomalies,
    sampleEpisodes: mergedEpisodes.slice(0, 12).map((ep) => ({
      number: ep.number,
      title: ep.title,
      isGeneric: isGenericEpisodeTitle(ep.title, ep.number),
      airDate: ep.airDate ?? null,
      isFiller: Boolean(ep.isFiller),
      hasThumbnail: Boolean(ep.thumbnail),
    })),
  };
}

let memoryTraces: EpisodeFetchTrace[] | null = null;
const listeners = new Set<() => void>();

function ensureTracesLoaded(): EpisodeFetchTrace[] {
  if (memoryTraces !== null) return memoryTraces;
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          memoryTraces = parsed.slice(0, MAX_STORED_TRACES) as EpisodeFetchTrace[];
          return memoryTraces;
        }
      }
    }
  } catch {
    // Ignore storage read failures in non-browser/private contexts
  }
  memoryTraces = [];
  return memoryTraces;
}

function persistTraces(traces: EpisodeFetchTrace[]): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(traces));
    }
  } catch {
    // Ignore sessionStorage quota issues
  }
}

export function getEpisodeTraces(): EpisodeFetchTrace[] {
  return ensureTracesLoaded();
}

export function recordEpisodeTrace(trace: EpisodeFetchTrace): void {
  const current = ensureTracesLoaded();
  memoryTraces = [trace, ...current].slice(0, MAX_STORED_TRACES);
  persistTraces(memoryTraces);
  listeners.forEach((cb) => cb());
}

export function clearEpisodeTraces(): void {
  memoryTraces = [];
  persistTraces(memoryTraces);
  listeners.forEach((cb) => cb());
}

export function subscribeEpisodeTraces(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function formatTraceAsReportJson(trace: EpisodeFetchTrace): string {
  return JSON.stringify(trace, null, 2);
}

export function traceHasIssues(trace: EpisodeFetchTrace): boolean {
  return trace.anomalies.some((a) => a.severity === 'error' || a.severity === 'warning');
}
