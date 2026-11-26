import { HomeSection, MediaType, TrackerCategory, UnifiedMedia } from '../types/media';
import type { HeroBannerStyle } from '../data/themePresets';

export type HomeMediaMode = 'ANIME' | 'MANGA';
export const HERO_BANNER_CATEGORY: TrackerCategory = 'topRated';
export const HOME_SECTIONS_VERSION = 2;

const VALID_HERO_BANNER_STYLES: readonly HeroBannerStyle[] = [
  'classic',
  'coverflow',
  'cinematic',
  'splitPoster',
  'minimal',
  'liquidGlass',
  'spotlightCard',
  'auroraSplit',
  'edgeCarousel',
  'rankedDeck',
  'glassFrame',
  'prismCoverflow',
];

export function resolveHeroBannerStyle(style?: string | null): HeroBannerStyle {
  if (style && VALID_HERO_BANNER_STYLES.includes(style as HeroBannerStyle)) {
    return style as HeroBannerStyle;
  }
  return 'classic';
}

export function formatHeroSlideCounter(activeIndex: number, total: number): string {
  if (total <= 0) return '00 / 00';
  const safeCurrent = Math.min(Math.max(activeIndex, 0), total - 1) + 1;
  return `${String(safeCurrent).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
}

export function wrapSlideIndex(current: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return ((current + delta) % total + total) % total;
}

export function stripHtmlTags(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatHeroMetadata(media: UnifiedMedia): string[] {
  const parts: string[] = [];
  if (media.format) {
    parts.push(media.format);
  } else if (media.type) {
    parts.push(media.type);
  }
  if (media.year) {
    parts.push(String(media.year));
  }
  const genres = (media.genres || []).filter(Boolean).slice(0, 2);
  parts.push(...genres);
  return parts;
}

export function formatHeroScore(score?: number | null): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) {
    return null;
  }
  return `${score.toFixed(1)}/10`;
}

export function getHeroCtaLabel(mediaType: MediaType): string {
  return mediaType === 'MANGA' ? 'Read now' : 'Watch now';
}

export function getHeroRankBadgeLabel(slideIndex: number, mediaType?: MediaType): string {
  const suffix = mediaType === 'MANGA' ? 'Manga' : 'Series';
  return `#${slideIndex + 1} in ${suffix}`;
}

export function filterHomeSectionsByMediaMode(
  sections: HomeSection[],
  mode: HomeMediaMode,
): HomeSection[] {
  return sections.filter((section) => {
    if (section.disabled) return false;
    if (section.type === 'browseGenres' && !section.targetMediaType) {
      return true;
    }
    const target = section.targetMediaType || 'ANIME';
    if (mode === 'MANGA') {
      return target === 'MANGA';
    }
    return target === 'ANIME' || target === 'TV' || target === 'MOVIE';
  });
}

export function ensureBrowseGenresHomeSections(sections: HomeSection[]): HomeSection[] {
  const hasAnimeBrowseGenres = sections.some(
    (s) => s.type === 'browseGenres' && (s.targetMediaType || 'ANIME') !== 'MANGA',
  );
  const hasMangaBrowseGenres = sections.some(
    (s) => s.type === 'browseGenres' && s.targetMediaType === 'MANGA',
  );

  if (hasAnimeBrowseGenres && hasMangaBrowseGenres) {
    return sections;
  }

  const next = [...sections];

  if (!hasAnimeBrowseGenres) {
    const animeGenreSection: HomeSection = {
      id: 'browse-genres-anime',
      title: 'Browse by Genre',
      type: 'browseGenres',
      disabled: false,
      targetMediaType: 'ANIME',
    };
    const topRatedAnimeIdx = next.findIndex((s) => s.id === 'top-rated-anime');
    if (topRatedAnimeIdx >= 0) {
      next.splice(topRatedAnimeIdx + 1, 0, animeGenreSection);
    } else {
      const firstMangaIdx = next.findIndex((s) => s.targetMediaType === 'MANGA');
      if (firstMangaIdx >= 0) {
        next.splice(firstMangaIdx, 0, animeGenreSection);
      } else {
        next.push(animeGenreSection);
      }
    }
  }

  if (!hasMangaBrowseGenres) {
    const mangaGenreSection: HomeSection = {
      id: 'browse-genres-manga',
      title: 'Browse by Genre',
      type: 'browseGenres',
      disabled: false,
      targetMediaType: 'MANGA',
    };
    const topRatedMangaIdx = next.findIndex((s) => s.id === 'top-rated-manga');
    if (topRatedMangaIdx >= 0) {
      next.splice(topRatedMangaIdx + 1, 0, mangaGenreSection);
    } else {
      next.push(mangaGenreSection);
    }
  }

  return next;
}

const LEGACY_ANIME_DEFAULT_IDS = new Set([
  'continue-watching,trending-anime,popular-anime,top-rated-anime',
  'continue-watching,trending-anime,browse-genres-anime,popular-anime,top-rated-anime',
]);

const LEGACY_MANGA_DEFAULT_IDS = new Set([
  'continue-reading,trending-manga,popular-manga,top-rated-manga',
  'continue-reading,trending-manga,browse-genres-manga,popular-manga,top-rated-manga',
]);

export function migrateDefaultHomeSectionsOrder(
  sections: HomeSection[],
  defaultSections: HomeSection[],
  savedVersion?: number | null,
): HomeSection[] {
  const withGenres = ensureBrowseGenresHomeSections(sections);
  if (savedVersion === HOME_SECTIONS_VERSION) {
    return withGenres;
  }

  const animeIds = withGenres
    .filter((s) => (s.targetMediaType || 'ANIME') !== 'MANGA')
    .map((s) => s.id)
    .join(',');
  const mangaIds = withGenres
    .filter((s) => s.targetMediaType === 'MANGA')
    .map((s) => s.id)
    .join(',');

  if (!LEGACY_ANIME_DEFAULT_IDS.has(animeIds) || !LEGACY_MANGA_DEFAULT_IDS.has(mangaIds)) {
    return withGenres;
  }

  const disabledById = new Map(withGenres.map((s) => [s.id, Boolean(s.disabled)]));
  return defaultSections.map((def) => ({
    ...def,
    disabled: disabledById.get(def.id) ?? def.disabled,
  }));
}

export function splitHomeSectionsByMediaMode(sections: HomeSection[]): {
  anime: HomeSection[];
  manga: HomeSection[];
} {
  const anime: HomeSection[] = [];
  const manga: HomeSection[] = [];
  for (const section of sections) {
    if (section.targetMediaType === 'MANGA') {
      manga.push(section);
    } else {
      anime.push(section);
    }
  }
  return { anime, manga };
}

export function reorderHomeSectionsWithinMediaMode(
  sections: HomeSection[],
  mediaMode: HomeMediaMode,
  sectionId: string,
  delta: -1 | 1,
): HomeSection[] {
  const indices: number[] = [];
  for (let i = 0; i < sections.length; i += 1) {
    const isManga = sections[i]!.targetMediaType === 'MANGA';
    if ((mediaMode === 'MANGA' && isManga) || (mediaMode === 'ANIME' && !isManga)) {
      indices.push(i);
    }
  }

  const pos = indices.findIndex((idx) => sections[idx]!.id === sectionId);
  const targetPos = pos + delta;
  if (pos < 0 || targetPos < 0 || targetPos >= indices.length) {
    return sections;
  }

  const copy = [...sections];
  const fromIdx = indices[pos]!;
  const toIdx = indices[targetPos]!;
  [copy[fromIdx], copy[toIdx]] = [copy[toIdx]!, copy[fromIdx]!];
  return copy;
}

export function isTrendingDiscoveryRow(section: HomeSection): boolean {
  return section.type === 'discovery' && section.trackerCategory === 'trending';
}

export function selectHeroSlides(items: UnifiedMedia[], maxSlides = 5): UnifiedMedia[] {
  if (!items || items.length === 0) return [];
  const seen = new Set<string>();
  const picked: UnifiedMedia[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    if (!item.banner && !item.cover) continue;
    seen.add(item.id);
    picked.push(item);
    if (picked.length >= maxSlides) break;
  }

  return picked;
}

export interface StageCoverflowMetrics {
  offset: number;
  visible: boolean;
  isActive: boolean;
  translateXPercent: number;
  scale: number;
  rotateYDeg: number;
  opacity: number;
  zIndex: number;
}

/**
 * Computes multi-card fanned 3D stage coverflow metrics (center + up to 2 cards each side).
 */
export function getStageCoverflowMetrics(
  index: number,
  activeIndex: number,
  total: number,
): StageCoverflowMetrics {
  if (total <= 1) {
    return {
      offset: 0,
      visible: true,
      isActive: true,
      translateXPercent: 0,
      scale: 1,
      rotateYDeg: 0,
      opacity: 1,
      zIndex: 30,
    };
  }

  let diff = ((index - activeIndex) % total + total) % total;
  if (diff > total / 2) {
    diff -= total;
  }

  const abs = Math.abs(diff);
  if (abs === 0) {
    return {
      offset: 0,
      visible: true,
      isActive: true,
      translateXPercent: 0,
      scale: 1,
      rotateYDeg: 0,
      opacity: 1,
      zIndex: 30,
    };
  }

  if (abs === 1) {
    const sign = diff > 0 ? 1 : -1;
    return {
      offset: diff,
      visible: true,
      isActive: false,
      translateXPercent: sign * 62,
      scale: 0.85,
      rotateYDeg: sign * -26,
      opacity: 0.88,
      zIndex: 20,
    };
  }

  if (abs === 2) {
    const sign = diff > 0 ? 1 : -1;
    return {
      offset: diff,
      visible: true,
      isActive: false,
      translateXPercent: sign * 112,
      scale: 0.72,
      rotateYDeg: sign * -36,
      opacity: 0.56,
      zIndex: 10,
    };
  }

  const sign = diff > 0 ? 1 : -1;
  return {
    offset: diff,
    visible: false,
    isActive: false,
    translateXPercent: sign * 148,
    scale: 0.62,
    rotateYDeg: sign * -42,
    opacity: 0,
    zIndex: 1,
  };
}
