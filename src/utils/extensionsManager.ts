import { ExtensionRepo, SourceInfo } from '../types/media';
import type { ExtensionDiagnosticReport } from './extensionDiagnostics';
import type { SourceHealthCheckResult } from './sourceHealthCheck';
import { isWebPlayableExtensionCandidate } from './sourceStatus';

export type ExtensionMediaTab = 'ANIME' | 'MANGA';
export type ExtensionManagerFilter =
  | 'all'
  | 'aniyomi'
  | 'cloudstream'
  | 'mangayomi'
  | 'inbuilt';

const LANGUAGE_DISPLAY_NAMES: Record<string, { upper: string; title: string }> = {
  en: { upper: 'ENGLISH', title: 'English' },
  eng: { upper: 'ENGLISH', title: 'English' },
  de: { upper: 'DEUTSCH', title: 'Deutsch' },
  ger: { upper: 'DEUTSCH', title: 'Deutsch' },
  ja: { upper: 'JAPANESE', title: 'Japanese' },
  jp: { upper: 'JAPANESE', title: 'Japanese' },
  es: { upper: 'SPANISH', title: 'Spanish' },
  fr: { upper: 'FRENCH', title: 'French' },
  pt: { upper: 'PORTUGUESE', title: 'Portuguese' },
  'pt-br': { upper: 'PORTUGUESE (BR)', title: 'Portuguese (BR)' },
  it: { upper: 'ITALIAN', title: 'Italian' },
  ru: { upper: 'RUSSIAN', title: 'Russian' },
  ar: { upper: 'ARABIC', title: 'Arabic' },
  id: { upper: 'INDONESIAN', title: 'Indonesian' },
  tr: { upper: 'TURKISH', title: 'Turkish' },
  zh: { upper: 'CHINESE', title: 'Chinese' },
  multi: { upper: 'MULTI', title: 'Multi-Language' },
  all: { upper: 'ALL', title: 'All Languages' },
};

export function formatExtensionLangChip(lang?: string | null): string {
  const clean = (lang || 'en').trim().toLowerCase();
  return LANGUAGE_DISPLAY_NAMES[clean]?.upper || clean.toUpperCase() || 'EN';
}

export function formatExtensionLangGroup(lang?: string | null): string {
  const clean = (lang || 'en').trim().toLowerCase();
  return LANGUAGE_DISPLAY_NAMES[clean]?.title || clean.toUpperCase() || 'Other';
}

export function formatExtensionVersion(version?: string | null): string {
  const clean = (version || '1.0.0').trim().replace(/^v+/i, '');
  return `V${clean || '1.0.0'}`;
}

export function getExtensionManagerType(source: SourceInfo): Exclude<ExtensionManagerFilter, 'all'> {
  if (source.id.startsWith('ext-ay-') || source.id.startsWith('aniyomi-')) return 'aniyomi';
  if (source.id.startsWith('ext-cs-') || source.id.startsWith('cloudstream-')) return 'cloudstream';
  if (source.id.startsWith('ext-my-') || source.id.startsWith('mangayomi-')) return 'mangayomi';
  if (source.type === 'inbuilt') return 'inbuilt';
  if (
    source.runtimeRequirement === 'android-native' ||
    Boolean(source.pkg && (source.apkName || source.apkUrl))
  ) {
    return 'aniyomi';
  }
  const repoLower = `${source.repoUrl || ''} ${source.repoBaseUrl || ''}`.toLowerCase();
  if (repoLower.includes('aniyomi') || repoLower.includes('tachiyomi')) return 'aniyomi';
  if (repoLower.includes('mangayomi')) return 'mangayomi';
  if (repoLower.includes('cloudstream')) return 'cloudstream';
  return 'inbuilt';
}

export function matchesExtensionMediaTab(
  source: SourceInfo,
  mediaTab: ExtensionMediaTab,
): boolean {
  const types = Array.isArray(source.mediaTypes) ? source.mediaTypes : [];
  if (mediaTab === 'ANIME') {
    return types.some((m) => m === 'ANIME' || m === 'TV' || m === 'MOVIE');
  }
  return types.includes('MANGA');
}

export function collectAvailableExtensionLanguages(
  sources: SourceInfo[],
  mediaTab: ExtensionMediaTab,
): string[] {
  const langs = new Set<string>();
  for (const s of sources) {
    if (!matchesExtensionMediaTab(s, mediaTab) || !s.lang) continue;
    const normalized = s.lang.trim().toLowerCase();
    if (!normalized || normalized === 'all') continue;
    langs.add(normalized);
  }
  return ['all', ...Array.from(langs).sort()];
}

export interface FilterExtensionsOptions {
  mediaTab: ExtensionMediaTab;
  query: string;
  managerFilter: ExtensionManagerFilter;
  langFilter: string;
  webPlayableOnly?: boolean;
  diagnosticsBySourceId?: Record<string, ExtensionDiagnosticReport | undefined>;
  healthBySourceId?: Record<string, SourceHealthCheckResult | undefined>;
}

export function filterExtensions(
  sources: SourceInfo[],
  options: FilterExtensionsOptions,
): SourceInfo[] {
  const cleanQuery = options.query.trim().toLowerCase();
  const cleanLang = options.langFilter.trim().toLowerCase();

  return sources.filter((src) => {
    if (!matchesExtensionMediaTab(src, options.mediaTab)) return false;

    if (options.managerFilter !== 'all') {
      const mgr = getExtensionManagerType(src);
      if (mgr !== options.managerFilter) return false;
    }

    if (cleanLang && cleanLang !== 'all') {
      if (src.lang.trim().toLowerCase() !== cleanLang) return false;
    }

    if (
      options.webPlayableOnly &&
      !isWebPlayableExtensionCandidate(
        src,
        options.diagnosticsBySourceId?.[src.id],
        options.mediaTab,
        options.healthBySourceId?.[src.id],
      )
    ) {
      return false;
    }

    if (!cleanQuery) return true;
    const managerName = getExtensionManagerType(src);
    return (
      src.name.toLowerCase().includes(cleanQuery) ||
      src.lang.toLowerCase().includes(cleanQuery) ||
      formatExtensionLangChip(src.lang).toLowerCase().includes(cleanQuery) ||
      managerName.includes(cleanQuery) ||
      Boolean(src.baseUrl?.toLowerCase().includes(cleanQuery)) ||
      Boolean(src.description?.toLowerCase().includes(cleanQuery))
    );
  });
}

export function groupExtensionsByLanguage(
  sources: SourceInfo[],
): Array<{ group: string; items: SourceInfo[] }> {
  const seenIds = new Set<string>();
  const buckets = new Map<string, SourceInfo[]>();
  for (const src of sources) {
    if (!src.id || seenIds.has(src.id)) continue;
    seenIds.add(src.id);
    const group = formatExtensionLangGroup(src.lang);
    const list = buckets.get(group);
    if (list) list.push(src);
    else buckets.set(group, [src]);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, items]) => ({
      group,
      items: [...items].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function sortSourcesByOrder(
  sources: SourceInfo[],
  sourceOrder: string[],
): SourceInfo[] {
  const seenIds = new Set<string>();
  const deduped: SourceInfo[] = [];
  for (const src of sources) {
    if (!src?.id || seenIds.has(src.id)) continue;
    seenIds.add(src.id);
    deduped.push(src);
  }
  if (!Array.isArray(sourceOrder) || sourceOrder.length === 0) return deduped;
  const rank = new Map<string, number>();
  sourceOrder.forEach((id, idx) => rank.set(id, idx));
  return [...deduped].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
}

export function reorderSourceIds(
  orderedIds: string[],
  draggedId: string,
  targetId: string,
): string[] {
  if (draggedId === targetId) return orderedIds;
  const fromIdx = orderedIds.indexOf(draggedId);
  const toIdx = orderedIds.indexOf(targetId);
  if (fromIdx === -1 || toIdx === -1) return orderedIds;
  const copy = [...orderedIds];
  const [moved] = copy.splice(fromIdx, 1);
  copy.splice(toIdx, 0, moved);
  return copy;
}

export function matchesRepoManager(
  repo: ExtensionRepo,
  selectedManager: ExtensionRepo['manager'],
): boolean {
  return repo.manager === selectedManager;
}
