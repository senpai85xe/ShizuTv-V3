import { MediaStreamingEpisode, UnifiedEpisode, UnifiedMedia } from '../types/media';

export interface AniZipEpisodeRecord {
  episode?: string | number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
  title?: Record<string, string | null | undefined>;
  airDate?: string | null;
  airdate?: string | null;
  airDateUtc?: string | null;
  runtime?: number | null;
  length?: number | null;
  overview?: string | null;
  summary?: string | null;
  image?: string | null;
}

export interface AniZipMappingsResponse {
  mappings?: {
    anilist_id?: number | string;
    mal_id?: number | string;
    kitsu_id?: number | string;
    thetvdb_id?: number | string;
  };
  episodes?: Record<string, AniZipEpisodeRecord>;
  episodeCount?: number;
}

export function isGenericEpisodeTitle(title: string | null | undefined, epNumber: number): boolean {
  if (!title) return true;
  const trimmed = title.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower === `episode ${epNumber}` ||
    lower === `ep ${epNumber}` ||
    lower === `ep. ${epNumber}` ||
    lower === `tba` ||
    lower === `episode ${epNumber} (tba)`
  );
}

function cleanSynopsisText(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s*\n?Source:\s*[^\n]+$/i, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function parseAniZipEpisodes(
  payload: AniZipMappingsResponse | null | undefined,
  media: Pick<UnifiedMedia, 'id' | 'episodes' | 'nextEpisode' | 'duration' | 'status'>,
  nowMs = Date.now(),
): UnifiedEpisode[] {
  const map = payload?.episodes;
  if (!map || typeof map !== 'object') return [];

  const maxKnownAired =
    media.nextEpisode && media.nextEpisode > 1
      ? media.nextEpisode - 1
      : media.episodes && media.episodes > 0
        ? media.episodes
        : null;

  const numericEntries = Object.entries(map)
    .filter(([key]) => /^\d+$/.test(key))
    .map(([key, record]) => ({ num: Number(key), record }))
    .filter(({ num }) => Number.isFinite(num) && num > 0)
    .sort((a, b) => a.num - b.num);

  const out: UnifiedEpisode[] = [];

  for (const { num, record } of numericEntries) {
    if (!record || typeof record !== 'object') continue;

    const titleMap = record.title || {};
    const resolvedTitle =
      titleMap.en?.trim() ||
      titleMap['x-jat']?.trim() ||
      titleMap.ja?.trim() ||
      '';
    const rawAirDate = (record.airDate || record.airdate || '').trim() || null;
    const airUtcMs = record.airDateUtc ? Date.parse(record.airDateUtc) : NaN;
    const isFutureAiring = Number.isFinite(airUtcMs) && airUtcMs > nowMs + 12 * 3600_000;

    // Filter out empty TBA placeholder slots above the current aired count
    const isBlankPlaceholder = !resolvedTitle && !rawAirDate && !record.image && !record.overview;
    if (isBlankPlaceholder && maxKnownAired !== null && num > maxKnownAired) {
      continue;
    }
    if (maxKnownAired !== null && media.status === 'RELEASING' && isFutureAiring && num > maxKnownAired) {
      continue;
    }

    const durationMinutes =
      typeof record.runtime === 'number' && record.runtime > 0
        ? record.runtime
        : typeof record.length === 'number' && record.length > 0
          ? record.length
          : media.duration && media.duration > 0
            ? media.duration
            : null;

    out.push({
      id: `${media.id}-ep-${num}`,
      number: num,
      title: resolvedTitle || `Episode ${num}`,
      description: cleanSynopsisText(record.overview) || cleanSynopsisText(record.summary),
      thumbnail: typeof record.image === 'string' && record.image.trim() ? record.image.trim() : null,
      airDate: rawAirDate,
      durationSeconds: durationMinutes ? durationMinutes * 60 : undefined,
    });
  }

  return out;
}

export function parseAniListStreamingEpisodes(
  streamingEpisodes: MediaStreamingEpisode[] | undefined,
  mediaId: string,
): UnifiedEpisode[] {
  if (!Array.isArray(streamingEpisodes) || streamingEpisodes.length === 0) return [];

  const parsed: UnifiedEpisode[] = [];
  const seen = new Set<number>();

  streamingEpisodes.forEach((item, index) => {
    const rawTitle = (item.title || '').trim();
    const match = rawTitle.match(/^(?:Episode|Ep\.?)\s*(\d+(?:\.\d+)?)\s*(?:[-–—:]\s*(.+))?$/i);
    const num = match ? Math.floor(Number(match[1])) : index + 1;
    if (!Number.isFinite(num) || num <= 0 || seen.has(num)) return;
    seen.add(num);

    const cleanTitle = match?.[2]?.trim() || (!match && rawTitle ? rawTitle : `Episode ${num}`);
    parsed.push({
      id: `${mediaId}-ep-${num}`,
      number: num,
      title: cleanTitle || `Episode ${num}`,
      thumbnail: item.thumbnail?.trim() || null,
      externalUrl: item.url?.trim() || null,
    });
  });

  return parsed.sort((a, b) => a.number - b.number);
}

export interface MergeEpisodesInput {
  mediaId: string;
  expectedCount: number;
  aniZipEpisodes?: UnifiedEpisode[];
  jikanEpisodes?: UnifiedEpisode[];
  kitsuEpisodes?: UnifiedEpisode[];
  aniListStreamingEpisodes?: UnifiedEpisode[];
  fallbackDurationSeconds?: number;
  fallbackThumbnail?: string | null;
}

export function mergeRealEpisodes(input: MergeEpisodesInput): UnifiedEpisode[] {
  const byNumber = new Map<number, UnifiedEpisode>();

  const applyLayer = (list: UnifiedEpisode[] | undefined) => {
    if (!Array.isArray(list)) return;
    for (const ep of list) {
      if (!Number.isFinite(ep.number) || ep.number <= 0) continue;
      const existing = byNumber.get(ep.number);
      if (!existing) {
        byNumber.set(ep.number, {
          ...ep,
          id: `${input.mediaId}-ep-${ep.number}`,
        });
        continue;
      }

      const nextTitle =
        !isGenericEpisodeTitle(existing.title, ep.number)
          ? existing.title
          : !isGenericEpisodeTitle(ep.title, ep.number)
            ? ep.title
            : existing.title || `Episode ${ep.number}`;

      byNumber.set(ep.number, {
        id: `${input.mediaId}-ep-${ep.number}`,
        number: ep.number,
        title: nextTitle,
        description: existing.description || ep.description || null,
        thumbnail: existing.thumbnail || ep.thumbnail || null,
        airDate: existing.airDate || ep.airDate || null,
        isFiller: Boolean(existing.isFiller || ep.isFiller),
        durationSeconds: existing.durationSeconds || ep.durationSeconds,
        externalUrl: existing.externalUrl || ep.externalUrl || null,
      });
    }
  };

  // Layer priority for richest metadata: AniZip -> AniList Streaming -> Kitsu -> Jikan (Jikan also adds isFiller)
  applyLayer(input.aniZipEpisodes);
  applyLayer(input.aniListStreamingEpisodes);
  applyLayer(input.kitsuEpisodes);
  applyLayer(input.jikanEpisodes);

  const highestReal = Array.from(byNumber.keys()).reduce((max, n) => Math.max(max, n), 0);
  const totalNeeded = Math.max(input.expectedCount, highestReal);

  if (totalNeeded <= 0) {
    return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
  }

  const resolved: UnifiedEpisode[] = [];
  for (let num = 1; num <= totalNeeded; num++) {
    const found = byNumber.get(num);
    if (found) {
      resolved.push({
        ...found,
        thumbnail: found.thumbnail || input.fallbackThumbnail || null,
        durationSeconds: found.durationSeconds || input.fallbackDurationSeconds,
      });
    } else {
      resolved.push({
        id: `${input.mediaId}-ep-${num}`,
        number: num,
        title: `Episode ${num}`,
        thumbnail: input.fallbackThumbnail || null,
        durationSeconds: input.fallbackDurationSeconds,
      });
    }
  }

  return resolved;
}
