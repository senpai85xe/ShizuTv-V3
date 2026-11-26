import { EpisodeChapterStyle } from '../data/themePresets';
import { UnifiedChapter, UnifiedEpisode } from '../types/media';

export const DEFAULT_EPISODE_CHAPTER_STYLE: EpisodeChapterStyle = 'classic';

export const EPISODE_CHAPTER_STYLE_ORDER: EpisodeChapterStyle[] = [
  'classic',
  'grid',
  'box',
  'compact',
  'cover',
];

export function resolveEpisodeChapterStyle(
  style?: string | null,
): EpisodeChapterStyle {
  if (
    style === 'classic' ||
    style === 'grid' ||
    style === 'box' ||
    style === 'compact' ||
    style === 'cover'
  ) {
    return style;
  }
  return DEFAULT_EPISODE_CHAPTER_STYLE;
}

export function getNextEpisodeChapterStyle(
  current: EpisodeChapterStyle,
): EpisodeChapterStyle {
  const idx = EPISODE_CHAPTER_STYLE_ORDER.indexOf(resolveEpisodeChapterStyle(current));
  return EPISODE_CHAPTER_STYLE_ORDER[(idx + 1) % EPISODE_CHAPTER_STYLE_ORDER.length];
}

export function getEpisodeChapterContainerClass(
  style: EpisodeChapterStyle,
  previewMode = false,
): string {
  switch (style) {
    case 'classic':
      return previewMode
        ? 'grid grid-cols-1 md:grid-cols-2 gap-2'
        : 'grid grid-cols-1 lg:grid-cols-2 gap-2.5';
    case 'grid':
      return previewMode
        ? 'grid grid-cols-2 md:grid-cols-4 gap-2.5'
        : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5';
    case 'box':
      return previewMode
        ? 'grid grid-cols-4 gap-2'
        : 'grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2';
    case 'compact':
      return 'flex flex-col divide-y divide-white/25 dark:divide-white/10 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/28 dark:bg-[var(--sx-surface-container)]/32 backdrop-blur-lg backdrop-saturate-150 border border-white/45 dark:border-white/12 shadow-[0_6px_24px_rgba(15,23,42,0.06)] ring-1 ring-inset ring-white/20 dark:ring-white/5 overflow-hidden';
    case 'cover':
      return previewMode
        ? 'grid grid-cols-1 md:grid-cols-2 gap-2'
        : 'grid grid-cols-1 lg:grid-cols-2 gap-2.5';
  }
}

export function formatEpisodeDurationLabel(durationSeconds?: number): string | null {
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  const mins = Math.max(1, Math.round(durationSeconds / 60));
  return `${mins}m`;
}

export function formatEpisodeMetaLine(ep: UnifiedEpisode): string {
  const parts: string[] = [];
  if (ep.airDate) parts.push(ep.airDate);
  const dur = formatEpisodeDurationLabel(ep.durationSeconds);
  if (dur) parts.push(dur);
  if (parts.length === 0) parts.push('Sub & Dub');
  return parts.join(' · ');
}

export function formatChapterMetaLine(ch: UnifiedChapter): string {
  const parts: string[] = [];
  if (ch.releaseDate) parts.push(ch.releaseDate);
  if (ch.scanlator) parts.push(ch.scanlator);
  if (typeof ch.pageCount === 'number' && ch.pageCount > 0) {
    parts.push(`${ch.pageCount} pages`);
  }
  return parts.join(' · ') || 'Ready to read';
}

export const EPISODE_RENDER_BATCH_SIZE = 48;
export const LARGE_EPISODE_LIST_THRESHOLD = 48;
export const MAX_ANIMATED_EPISODE_ROWS = 12;

export function computeInitialVisibleEpisodeCount(
  totalCount: number,
  batchSize = EPISODE_RENDER_BATCH_SIZE,
): number {
  if (!Number.isFinite(totalCount) || totalCount <= 0) return 0;
  const safeBatch = Math.max(1, Math.floor(batchSize));
  return Math.min(Math.floor(totalCount), safeBatch);
}

export function computeNextVisibleEpisodeCount(
  currentVisible: number,
  totalCount: number,
  batchSize = EPISODE_RENDER_BATCH_SIZE,
): number {
  if (!Number.isFinite(totalCount) || totalCount <= 0) return 0;
  const safeTotal = Math.floor(totalCount);
  const safeCurrent = Math.max(0, Math.floor(currentVisible));
  const safeBatch = Math.max(1, Math.floor(batchSize));
  return Math.min(safeTotal, safeCurrent + safeBatch);
}

export function shouldUseLightweightEpisodeRow(totalCount: number): boolean {
  return Number.isFinite(totalCount) && totalCount > LARGE_EPISODE_LIST_THRESHOLD;
}

export function shouldAnimateEpisodeRow(index: number, previewMode = false): boolean {
  return !previewMode && index >= 0 && index < MAX_ANIMATED_EPISODE_ROWS;
}

export function buildMediaItemKey(
  mediaId: string,
  mediaType: string,
  itemNumber: number,
): string {
  return `${mediaId}-${mediaType}-${itemNumber}`;
}

export function buildMediaScopeKey(mediaId: string, mediaType: string): string {
  return `${mediaId}-${mediaType}`;
}

export function isEpisodeOrChapterWatched(params: {
  itemNumber: number;
  currentProgress: number;
  watchedSet?: ReadonlySet<number>;
  isCurrent?: boolean;
}): boolean {
  const { itemNumber, currentProgress, watchedSet, isCurrent } = params;
  if (isCurrent) return false;
  if (Number.isFinite(currentProgress) && currentProgress > 0 && itemNumber <= currentProgress) {
    return true;
  }
  return Boolean(watchedSet && watchedSet.has(itemNumber));
}

export function formatDownloadProgressPercent(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}

