import { UnifiedMedia } from '../types/media';

export interface EpisodeRange {
  id: string;
  label: string;
  start: number;
  end: number;
}

/**
 * Splits a total episode/chapter count into clean numbered ranges (e.g. 1 - 12, 13 - 24, 25 - 25).
 * Returns an empty array when totalCount <= chunkSize so callers only render chunk pills when helpful.
 */
export function buildEpisodeRanges(totalCount: number, chunkSize = 12): EpisodeRange[] {
  if (!Number.isFinite(totalCount) || totalCount <= 0 || chunkSize <= 0) {
    return [];
  }
  if (totalCount <= chunkSize) {
    return [];
  }
  const ranges: EpisodeRange[] = [];
  for (let start = 1; start <= totalCount; start += chunkSize) {
    const end = Math.min(totalCount, start + chunkSize - 1);
    ranges.push({
      id: `${start}-${end}`,
      label: `${start} - ${end}`,
      start,
      end,
    });
  }
  return ranges;
}

/**
 * Filters episodes or chapters by an optional EpisodeRange.
 */
export function filterByEpisodeRange<T extends { number: number }>(
  items: T[],
  range: EpisodeRange | null | undefined,
): T[] {
  if (!range) return items;
  return items.filter((item) => item.number >= range.start && item.number <= range.end);
}

/**
 * Returns the number of episodes or chapters spanned by an EpisodeRange.
 */
export function getEpisodeRangeCount(range: Pick<EpisodeRange, 'start' | 'end'>): number {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return 0;
  return Math.max(0, range.end - range.start + 1);
}

/**
 * Partitions AniList relations into direct story continuity entries (PREQUEL / SEQUEL)
 * for the "Seasons" strip vs all other relations (ADAPTATION, SIDE_STORY, ALTERNATIVE, etc.).
 */
export function partitionMediaRelations(relations: UnifiedMedia[] | undefined): {
  seasons: UnifiedMedia[];
  otherRelations: UnifiedMedia[];
} {
  if (!relations || relations.length === 0) {
    return { seasons: [], otherRelations: [] };
  }

  const seasons: UnifiedMedia[] = [];
  const otherRelations: UnifiedMedia[] = [];

  for (const rel of relations) {
    const type = rel.relationType?.toUpperCase();
    if (type === 'PREQUEL' || type === 'SEQUEL') {
      seasons.push(rel);
    } else {
      otherRelations.push(rel);
    }
  }

  // Sort prequels before sequels for intuitive chronological scanning
  seasons.sort((a, b) => {
    const order = (t?: string | null) => (t?.toUpperCase() === 'PREQUEL' ? 0 : 1);
    return order(a.relationType) - order(b.relationType);
  });

  return { seasons, otherRelations };
}

/**
 * Converts HTML descriptions from AniList into clean plain text while preserving paragraph breaks.
 */
export function stripHtmlTags(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Formats large counts concisely (e.g. 640231 -> 640.2K, 1250000 -> 1.3M).
 */
export function formatCompactNumber(num?: number | null): string {
  if (typeof num !== 'number' || !Number.isFinite(num)) return '—';
  if (num >= 1_000_000) return `${(Math.round((num / 1_000_000) * 10) / 10).toFixed(1)}M`;
  if (num >= 1_000) return `${(Math.round((num / 1_000) * 10) / 10).toFixed(1)}K`;
  return String(Math.round(num));
}

/**
 * Formats player playback timestamps in MM:SS or HH:MM:SS.
 */
export function formatPlayerTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Computes a clamped playback seek target within [0, duration].
 */
export function clampSeekTarget(current: number, delta: number, duration: number): number {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
  return Math.max(0, Math.min(safeDuration, safeCurrent + delta));
}

export interface NextAiringInfo {
  episode: number;
  countdown: string;
  dateTimeLabel: string;
}

/**
 * Formats the next airing episode countdown ("5d 0h 59m") and local date/time
 * for ongoing anime when nextEpisode and airingAt are provided.
 */
export function formatNextAiringInfo(
  nextEpisode?: number | null,
  airingAt?: string | null,
  nowMs: number = Date.now(),
): NextAiringInfo | null {
  if (!nextEpisode || !airingAt) return null;
  const targetMs = Date.parse(airingAt);
  if (!Number.isFinite(targetMs)) return null;

  const diffMs = targetMs - nowMs;
  // Hide if already aired more than 6 hours ago without fresh schedule update
  if (diffMs < -6 * 60 * 60 * 1000) return null;

  let countdown = 'Airing Now';
  if (diffMs > 0) {
    const totalMinutes = Math.floor(diffMs / 60_000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) {
      countdown = `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      countdown = `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      countdown = `${minutes}m`;
    } else {
      countdown = 'Under 1m';
    }
  }

  const dateObj = new Date(targetMs);
  const datePart = dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timePart = dateObj.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return {
    episode: nextEpisode,
    countdown,
    dateTimeLabel: `${datePart} · ${timePart}`,
  };
}

