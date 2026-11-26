import { MediaType, SourceInfo } from '../types/media';
import { detectSourceProfile, isMetadataOnlyCatalogHost } from './streamResolverUtils';

export type SourcePlayabilityStatus =
  | 'playable'
  | 'metadata-only'
  | 'missing-host';

const BRIDGE_IDS_WITHOUT_BASE_URL = new Set([
  'shonenx-hls-inbuilt',
  'shonenx-manga-inbuilt',
  'hianime-bridge',
  'mangadex-bridge',
]);

export function isMetadataOnlySource(
  source?: Pick<SourceInfo, 'id' | 'name' | 'baseUrl' | 'pkg' | 'type'> | null,
): boolean {
  if (!source || source.type === 'inbuilt') return false;
  return isMetadataOnlyCatalogHost(
    source.baseUrl,
    source.name,
    source.pkg,
    source.id,
  );
}

export function getSourcePlayabilityStatus(
  source?: Pick<SourceInfo, 'id' | 'name' | 'baseUrl' | 'pkg' | 'type' | 'mediaTypes'> | null,
  _contextMediaType?: MediaType,
): SourcePlayabilityStatus {
  if (!source) return 'playable';
  if (isMetadataOnlySource(source)) {
    return 'metadata-only';
  }
  if (
    source.type === 'extension' &&
    !BRIDGE_IDS_WITHOUT_BASE_URL.has(source.id) &&
    (!source.baseUrl || !/^https?:\/\//i.test(source.baseUrl.trim()))
  ) {
    return 'missing-host';
  }
  return 'playable';
}

export function getSourceManagerBadge(
  source?: Pick<SourceInfo, 'id' | 'type' | 'description'> | null,
): string {
  if (!source) return 'Inbuilt';
  if (source.id.startsWith('ext-ay-')) return 'Aniyomi';
  if (source.id.startsWith('ext-my-')) return 'Mangayomi';
  if (source.id.startsWith('ext-cs-')) return 'CloudStream';
  if (source.type === 'inbuilt') return 'Inbuilt';
  return 'Extension';
}

/**
 * Excludes non-playable sources (metadata-only catalogs, missing-host APK stubs,
 * and search-only hosts like Gotaku) from player/reader pickers while keeping them
 * installed in the user's Extensions Manager.
 */
export function filterPlayableSourcesForPlayer(
  sources: SourceInfo[],
  mediaType?: MediaType,
): SourceInfo[] {
  if (!Array.isArray(sources)) return [];
  return sources.filter((src) => {
    const status = getSourcePlayabilityStatus(src, mediaType);
    if (status !== 'playable') return false;
    if (mediaType !== 'MANGA' && src.type !== 'inbuilt') {
      const profile = detectSourceProfile(src);
      if (profile.kind === 'gotaku' || profile.kind === 'non-anime') {
        return false;
      }
    }
    return true;
  });
}

export function filterAvailableSources(sources: SourceInfo[], query: string): SourceInfo[] {
  const clean = query.trim().toLowerCase();
  if (!clean) return sources;
  return sources.filter((src) => {
    const manager = getSourceManagerBadge(src).toLowerCase();
    return (
      src.name.toLowerCase().includes(clean) ||
      src.lang.toLowerCase().includes(clean) ||
      manager.includes(clean) ||
      src.type.toLowerCase().includes(clean) ||
      (src.baseUrl && src.baseUrl.toLowerCase().includes(clean)) ||
      (src.description && src.description.toLowerCase().includes(clean))
    );
  });
}

export function formatSourceAvailabilityLabel(params: {
  mediaType?: MediaType;
  resolving: boolean;
  resolvedCount: number;
  expectedCount?: number | null;
  status?: string | null;
  hasOverride?: boolean;
}): string {
  const { mediaType, resolving, resolvedCount, expectedCount, status, hasOverride } = params;
  const isManga = mediaType === 'MANGA';
  const unit = isManga ? 'chapter' : 'episode';

  if (resolving && resolvedCount === 0) {
    return `Checking ${unit} availability on source...`;
  }

  const count = resolvedCount > 0 ? resolvedCount : expectedCount && expectedCount > 0 ? expectedCount : 0;
  const parts: string[] = [];

  if (count > 0) {
    parts.push(`${count} ${count === 1 ? unit : `${unit}s`} available`);
  } else {
    parts.push(`0 ${unit}s found`);
  }

  if (status && status.trim()) {
    parts.push(status.replace(/_/g, ' '));
  }

  if (hasOverride) {
    parts.push('Custom title match');
  }

  return parts.join(' · ');
}

export const DEFAULT_ANIME_SOURCE_ID = 'shonenx-hls-inbuilt';
export const DEFAULT_MANGA_SOURCE_ID = 'shonenx-manga-inbuilt';

export function getDefaultSourceIdForMedia(isManga: boolean, _mediaType?: MediaType): string {
  return isManga ? DEFAULT_MANGA_SOURCE_ID : DEFAULT_ANIME_SOURCE_ID;
}

/**
 * Resolves which source id should be active for a media page:
 * - If the user has explicitly selected a preferred playable source and it is currently installed/available, keep using it.
 * - Otherwise default to ShizuTv inbuilt ('shonenx-hls-inbuilt' for anime, 'shonenx-manga-inbuilt' for manga).
 * - Only fall back to the first available source if even the default source was disabled/removed.
 */
export function resolveActiveSourceId(params: {
  availableSources: Array<Pick<SourceInfo, 'id' | 'name' | 'baseUrl' | 'pkg' | 'type'>>;
  preferredSourceId?: string | null;
  isManga: boolean;
  mediaType?: MediaType;
}): string {
  const { availableSources, preferredSourceId, mediaType } = params;
  const defaultId = getDefaultSourceIdForMedia(params.isManga, mediaType);
  if (!Array.isArray(availableSources) || availableSources.length === 0) {
    return defaultId;
  }
  const cleanPref = typeof preferredSourceId === 'string' ? preferredSourceId.trim() : '';
  if (cleanPref && availableSources.some((s) => s.id === cleanPref)) {
    return cleanPref;
  }
  if (defaultId && availableSources.some((s) => s.id === defaultId)) {
    return defaultId;
  }
  return availableSources[0].id;
}


